// One battle on screen: board, HUD, action bar and info line, driven by clicks, keys or the AI.
import {
  attack, attackTargets, availableActions, buy, buyableTypes, endTurn, finishUnit, moveUnit, occupy, raise,
  raisableTombstones, type Action,
} from '../core/actions';
import { nextAiPlan, type AiPlan } from '../core/ai';
import type { FightResult } from '../core/combat';
import { missionObjectiveIndex, missionStoryIndex, missionTitleIndex, type Mission, type MissionApi } from '../core/missions';
import { pathTo, reachableTiles, type Point } from '../core/movement';
import { applyPlan, skirmishWinner } from '../core/plans';
import type { Rng } from '../core/rng';
import { TERRAIN_DEFENSE, TERRAIN_NAMES, UNIT_STATS, type Team, type UnitType } from '../core/rules';
import {
  displayName, effectiveAttack, effectiveDefense, effectiveMove, inBounds, ownerAt, terrainAt, tombstoneAt, unitAt,
  type GameState, type Unit,
} from '../core/state';
import { FrameScheduler } from '../render/frameScheduler';
import { FLOATER_MS, Renderer, type BoardView } from '../render/renderer';
import { TILE, type Sprites } from '../render/sprites';
import { button, choose, h } from './dom';

export type Player = 'human' | 'cpu';

export interface Timing {
  msPerStep: number;
  aiPause: number;
  floaterMs: number;
}

export const NORMAL_TIMING: Timing = { msPerStep: 90, aiPause: 250, floaterMs: FLOATER_MS };
export const FAST_TIMING: Timing = { msPerStep: 0, aiPause: 0, floaterMs: 0 };

export interface CampaignBattle {
  index: number;
  api: MissionApi;
  script: Mission;
}

export interface SessionConfig {
  root: HTMLElement;
  state: GameState;
  players: [Player, Player];
  rng: Rng;
  timing: Timing;
  sprites: Sprites;
  lang: string[];
  mission?: CampaignBattle;
  /** A resumed save skips the mission briefing. */
  resumed?: boolean;
  /** Called whenever a human turn begins, e.g. to autosave. */
  onHumanTurn?: () => void;
}

export type SessionResult = { kind: 'over'; winner: Team } | { kind: 'quit' };

type Mode =
  | { kind: 'idle' }
  | { kind: 'selected'; unit: Unit; reach: Set<number>; mustLeave: boolean }
  | { kind: 'moved'; unit: Unit; from: Point; mustLeave: boolean }
  | { kind: 'targeting'; unit: Unit; action: 'attack' | 'raise'; targets: Unit[]; back: Mode };

export const TEAM_NAMES = ['Blue', 'Red'] as const;
const SPEAKER_NAMES = ['Galamar', 'Valadorn', 'Captain'];
const ACTION_LABELS: Record<Action, string> = {
  move: 'Move', attack: 'Attack', occupy: 'Occupy', buy: 'Buy', raise: 'Raise', wait: 'Wait',
};
const MAX_AI_ACTIONS = 200;
const MAX_SCALE = 3;

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export class Session {
  private readonly state: GameState;
  private readonly view: BoardView = { cursor: null, reach: new Set(), targets: new Set(), walk: null, floaters: [] };
  private readonly scheduler: FrameScheduler;
  private readonly hud = h('header', { className: 'hud' });
  private readonly canvas = h('canvas', { ariaLabel: 'Battlefield' });
  private readonly board = h('div', { className: 'board' }, this.canvas);
  private readonly actions = h('div', { className: 'actions', role: 'toolbar', ariaLabel: 'Unit actions' });
  private readonly info = h('div', { className: 'info', ariaLive: 'polite' });
  private readonly endTurnButton = button('End turn', () => void this.humanEndsTurn());
  private mode: Mode = { kind: 'idle' };
  private busy = false;
  private event = '';
  private shownLines = 0;
  private finished: ((result: SessionResult) => void) | null = null;
  // The action bar and info line change height with their content, so refit on any board resize, not just the window's.
  private boardResize: ResizeObserver | null = null;

  constructor(private readonly config: SessionConfig) {
    this.state = config.state;
    const renderer = new Renderer(this.canvas, config.sprites);
    this.scheduler = new FrameScheduler((now) => renderer.draw(this.state, this.view, now));
  }

  /** Mounts the battle and resolves once someone wins or the player quits. */
  run(): Promise<SessionResult> {
    const { root } = this.config;
    root.replaceChildren(this.hud, this.board, this.actions, this.info);
    this.canvas.dataset.cols = String(this.state.width);
    this.canvas.dataset.rows = String(this.state.height);
    this.canvas.addEventListener('click', this.onClick);
    this.canvas.addEventListener('pointermove', this.onHover);
    window.addEventListener('keydown', this.onKey);
    this.boardResize = new ResizeObserver(this.fit);
    this.boardResize.observe(this.board);
    return new Promise((resolve) => {
      this.finished = resolve;
      void this.opening();
    });
  }

  private async opening(): Promise<void> {
    const { mission, lang } = this.config;
    this.busy = true;
    this.renderAll();
    if (mission && !this.config.resumed) {
      const { index } = mission;
      await choose(this.config.root, lang[missionTitleIndex(index)], [
        lang[missionStoryIndex(index)],
        h('p', { className: 'objective' }, h('strong', { textContent: 'Objective: ' }), lang[missionObjectiveIndex(index)]),
      ], [{ label: 'Start', value: null }]);
      if (this.over) return;
    }
    await this.beginTurn();
  }

  private dispose(result: SessionResult): void {
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('pointermove', this.onHover);
    window.removeEventListener('keydown', this.onKey);
    this.boardResize?.disconnect();
    this.busy = true;
    const finish = this.finished;
    this.finished = null;
    this.renderAll();
    finish?.(result);
  }

  // ---- turn flow ---------------------------------------------------------------------------

  /** True once the battle is won or abandoned; pending async steps must stop touching it. */
  private get over(): boolean {
    return this.finished === null;
  }

  private get placingRecruit(): boolean {
    const mode = this.mode.kind === 'targeting' ? this.mode.back : this.mode;
    return (mode.kind === 'selected' || mode.kind === 'moved') && mode.mustLeave;
  }

  private get isHumanTurn(): boolean {
    return this.config.players[this.state.current] === 'human';
  }

  private async beginTurn(): Promise<void> {
    this.busy = true;
    this.setMode({ kind: 'idle' });
    if (await this.checkEnd()) return;
    if (!this.isHumanTurn) {
      await this.playComputerTurn();
      return;
    }
    if (this.config.players.every((player) => player === 'human')) {
      await choose(this.config.root, `${TEAM_NAMES[this.state.current]}'s turn`, [], [{ label: 'Ready', value: null }]);
      if (this.over) return;
    }
    this.config.onHumanTurn?.();
    this.busy = false;
    this.say(`${TEAM_NAMES[this.state.current]} to move.`);
    this.renderAll();
  }

  private async humanEndsTurn(): Promise<void> {
    if (this.busy || !this.isHumanTurn || this.placingRecruit) return;
    this.cancelMove();
    endTurn(this.state);
    await this.beginTurn();
  }

  private async playComputerTurn(): Promise<void> {
    const team = this.state.current;
    this.renderAll();
    for (let count = 0; count < MAX_AI_ACTIONS; count++) {
      const plan = nextAiPlan(this.state, team, this.config.rng);
      if (!plan) break;
      await this.carryOut(plan);
      if (await this.checkEnd()) return;
      await sleep(this.config.timing.aiPause);
      if (this.over) return;
    }
    endTurn(this.state);
    await this.beginTurn();
  }

  private async carryOut(plan: AiPlan): Promise<void> {
    if (plan.kind === 'act') {
      const unit = this.state.units.find((candidate) => candidate.id === plan.unitId)!;
      await this.walk(unit, plan.to);
    }
    const positions = this.positions();
    const outcome = applyPlan(this.state, plan, this.config.rng);
    if (outcome.kind === 'bought') this.say(`${TEAM_NAMES[outcome.unit.team]} buys a ${displayName(outcome.unit)}.`);
    if (outcome.kind === 'fought') await this.showFight(outcome.attacker, outcome.defender, outcome.result, positions);
    this.invalidate();
  }

  /** Runs mission scripts, plays any new dialogue and reports whether the battle is over. */
  private async checkEnd(): Promise<boolean> {
    if (this.over) return true;
    const { mission } = this.config;
    let winner: Team | null;
    if (mission) {
      mission.script.update(mission.api);
      this.renderAll();
      await this.playDialogue();
      if (this.over) return true;
      const outcomes = { won: 0, lost: 1 } as const;
      winner = mission.api.outcome && outcomes[mission.api.outcome];
    } else {
      winner = skirmishWinner(this.state);
    }
    if (winner === null) return false;
    this.dispose({ kind: 'over', winner });
    return true;
  }

  private async playDialogue(): Promise<void> {
    const { mission, lang, root, sprites } = this.config;
    if (!mission) return;
    while (!this.over && this.shownLines < mission.api.dialogue.length) {
      const line = mission.api.dialogue[this.shownLines++];
      const portrait = h('canvas', { className: 'portrait', width: 33, height: 45 });
      portrait.getContext('2d')!.drawImage(sprites.portraits, line.speaker * 33, 0, 33, 45, 0, 0, 33, 45);
      const speech = h('div', { className: 'speech' }, portrait, h('p', { textContent: lang[line.textIndex] }));
      await choose(root, SPEAKER_NAMES[line.speaker], [speech], [{ label: 'Next', value: null }]);
    }
  }

  // ---- human input -------------------------------------------------------------------------

  private readonly onClick = (event: MouseEvent) => void this.pressTile(this.tileFromPointer(event));

  private readonly onHover = (event: PointerEvent) => {
    const tile = this.tileFromPointer(event);
    if (!tile || (this.view.cursor?.x === tile.x && this.view.cursor?.y === tile.y)) return;
    this.view.cursor = tile;
    this.renderInfo();
    this.invalidate();
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (this.config.root.querySelector('.overlay')) return;
    const onControl = event.target instanceof Element && event.target.closest('button, input') !== null;
    const steps: Record<string, Point> = {
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    };
    const step = steps[event.key];
    if (step) {
      const from = this.view.cursor ?? { x: 0, y: 0 };
      const to = { x: from.x + step.x, y: from.y + step.y };
      if (inBounds(this.state, to.x, to.y)) this.view.cursor = to;
      this.renderInfo();
      this.invalidate();
    } else if ((event.key === 'Enter' || event.key === ' ') && this.view.cursor && !onControl) {
      void this.pressTile(this.view.cursor);
    } else if (event.key === 'Escape') {
      this.back();
    } else if (event.key === 'e' || event.key === 'E') {
      void this.humanEndsTurn();
    } else {
      return;
    }
    event.preventDefault();
  };

  private tileFromPointer(event: MouseEvent): Point | null {
    const box = this.canvas.getBoundingClientRect();
    const size = box.width / this.state.width;
    const point = { x: Math.floor((event.clientX - box.left) / size), y: Math.floor((event.clientY - box.top) / size) };
    return inBounds(this.state, point.x, point.y) ? point : null;
  }

  private async pressTile(tile: Point | null): Promise<void> {
    if (!tile) return;
    this.view.cursor = tile;
    this.renderInfo();
    this.invalidate();
    if (this.busy || !this.isHumanTurn) return;

    const { mode, state } = this;
    const key = tile.y * state.width + tile.x;
    const here = unitAt(state, tile.x, tile.y);
    switch (mode.kind) {
      case 'idle':
        if (here && here.team === state.current && here.status === 'ready') this.select(here, false);
        break;
      case 'selected':
        if (mode.reach.has(key) && !here) await this.moveSelected(mode.unit, tile, mode.mustLeave);
        else if (!mode.mustLeave && here !== mode.unit) {
          this.setMode({ kind: 'idle' });
          await this.pressTile(tile);
        }
        break;
      case 'targeting': {
        const target = mode.targets.find((candidate) => candidate.x === tile.x && candidate.y === tile.y);
        if (target) await this.resolveTarget(mode.unit, mode.action, target);
        else this.back();
        break;
      }
      case 'moved':
        break;
    }
  }

  private select(unit: Unit, mustLeave: boolean): void {
    const reach = new Set(reachableTiles(this.state, unit).keys());
    if (mustLeave) reach.delete(unit.y * this.state.width + unit.x);
    this.setMode({ kind: 'selected', unit, reach, mustLeave });
  }

  private async moveSelected(unit: Unit, to: Point, mustLeave: boolean): Promise<void> {
    const from = { x: unit.x, y: unit.y };
    this.busy = true;
    this.setMode({ kind: 'idle' });
    await this.walk(unit, to);
    if (this.over) return;
    moveUnit(this.state, unit, to.x, to.y);
    this.busy = false;
    this.setMode({ kind: 'moved', unit, from, mustLeave });
  }

  /** Escape / Cancel: step back one stage of the current order. */
  private back(): void {
    const { mode } = this;
    if (mode.kind === 'targeting') this.setMode(mode.back);
    else if (mode.kind === 'moved') this.cancelMove();
    else if (mode.kind === 'selected' && !mode.mustLeave) this.setMode({ kind: 'idle' });
  }

  private cancelMove(): void {
    const { mode } = this;
    if (mode.kind === 'targeting' && mode.back.kind === 'moved') this.mode = mode.back;
    if (this.mode.kind !== 'moved') return;
    const { unit, from, mustLeave } = this.mode;
    unit.x = from.x;
    unit.y = from.y;
    this.select(unit, mustLeave);
  }

  private async order(unit: Unit, action: Action): Promise<void> {
    const { state } = this;
    switch (action) {
      case 'attack':
      case 'raise': {
        const targets = action === 'attack' ? attackTargets(state, unit) : raisableTombstones(state, unit);
        this.setMode({ kind: 'targeting', unit, action, targets, back: this.mode });
        return;
      }
      case 'occupy':
        occupy(state, unit);
        this.say(`${displayName(unit)} occupies the ${TERRAIN_NAMES[terrainAt(state, unit.x, unit.y)].toLowerCase()}.`);
        break;
      case 'wait':
        finishUnit(state, unit);
        break;
      case 'buy':
        await this.shop(unit);
        return;
      case 'move':
        return;
    }
    await this.afterHumanAction();
  }

  private async resolveTarget(unit: Unit, action: 'attack' | 'raise', target: Unit): Promise<void> {
    this.busy = true;
    this.setMode({ kind: 'idle' });
    if (action === 'attack') {
      const positions = this.positions();
      const result = attack(this.state, unit, target, this.config.rng);
      await this.showFight(unit, target, result, positions);
    } else {
      raise(this.state, unit, target);
      this.say(`${displayName(unit)} raises a skeleton.`);
    }
    await this.afterHumanAction();
  }

  private async shop(king: Unit): Promise<void> {
    const { state } = this;
    const gold = state.gold[king.team];
    const choice = await choose<UnitType | null>(this.config.root, 'Buy', [`Gold: ${gold}`], [
      ...buyableTypes(state).map((type) => {
        const { name, cost } = UNIT_STATS[type];
        return { label: `${name} ${cost}`, value: type, disabled: cost! > gold };
      }),
      { label: 'Cancel', value: null },
    ]);
    if (choice === null) return;
    const recruit = buy(state, king, choice);
    this.say(`${TEAM_NAMES[king.team]} buys a ${displayName(recruit)}. Choose where it stands.`);
    this.renderHud();
    this.select(recruit, true);
  }

  private async afterHumanAction(): Promise<void> {
    this.busy = true;
    this.setMode({ kind: 'idle' });
    if (await this.checkEnd()) return;
    this.busy = false;
    this.renderAll();
  }

  // ---- animation ---------------------------------------------------------------------------

  private async walk(unit: Unit, to: Point): Promise<void> {
    if (unit.x === to.x && unit.y === to.y) return;
    const { msPerStep } = this.config.timing;
    const path = pathTo(this.state, unit, to);
    if (msPerStep <= 0 || path.length < 2) return;
    this.view.walk = { unitId: unit.id, path, start: performance.now(), msPerStep };
    const stop = this.scheduler.animate();
    await sleep((path.length - 1) * msPerStep);
    stop();
    this.view.walk = null;
    this.invalidate();
  }

  private positions(): Map<number, Point> {
    return new Map(this.state.units.map((unit) => [unit.id, { x: unit.x, y: unit.y }]));
  }

  private async showFight(attacker: Unit, defender: Unit, result: FightResult, at: Map<number, Point>): Promise<void> {
    const [first, counter] = result.blows;
    let text = `${displayName(attacker)} hits ${displayName(defender)} for ${first.damage * 10}.`;
    if (counter) text += ` ${displayName(defender)} strikes back for ${counter.damage * 10}.`;
    if (result.leveledUp.length > 0) text += ' Level up!';
    this.say(text);

    const { floaterMs } = this.config.timing;
    if (floaterMs <= 0) return;
    const now = performance.now();
    this.view.floaters = result.blows.map((blow, index) => ({
      ...at.get(blow.defenderId)!,
      text: `-${blow.damage * 10}`,
      start: now + (index * floaterMs) / 2,
    }));
    const stop = this.scheduler.animate();
    await sleep(floaterMs * (1 + (result.blows.length - 1) / 2));
    stop();
    this.view.floaters = [];
    this.invalidate();
  }

  // ---- presentation ------------------------------------------------------------------------

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.view.reach = mode.kind === 'selected' ? mode.reach : new Set();
    this.view.targets =
      mode.kind === 'targeting' ? new Set(mode.targets.map((unit) => unit.y * this.state.width + unit.x)) : new Set();
    if (mode.kind !== 'idle') this.view.cursor = { x: mode.unit.x, y: mode.unit.y };
    this.renderAll();
  }

  private say(text: string): void {
    this.event = text;
    this.renderInfo();
  }

  private renderAll(): void {
    this.renderHud();
    this.renderActions();
    this.renderInfo();
    this.invalidate();
  }

  private invalidate(): void {
    this.scheduler.invalidate();
  }

  private renderHud(): void {
    const { state } = this;
    let phase = this.isHumanTurn ? 'human' : 'cpu';
    if (this.finished === null) phase = 'over';
    Object.assign(this.hud.dataset, {
      current: TEAM_NAMES[state.current].toLowerCase(),
      turn: String(Math.floor(state.turn / 2) + 1),
      phase,
      busy: String(this.busy),
    });
    this.endTurnButton.disabled = this.busy || !this.isHumanTurn || this.placingRecruit;
    this.hud.replaceChildren(
      h('span', { textContent: `Turn ${this.hud.dataset.turn}` }),
      h('span', { className: 'player-blue', textContent: `Blue ${state.gold[0]}g`, dataset: { testid: 'gold-blue' } }),
      h('span', { className: 'player-red', textContent: `Red ${state.gold[1]}g`, dataset: { testid: 'gold-red' } }),
      h('span', { className: `turn-badge player-${this.hud.dataset.current}`, textContent: `${TEAM_NAMES[state.current]}'s turn` }),
      h('span', { className: 'spacer' }),
      this.endTurnButton,
      button('Menu', () => void this.confirmQuit()),
    );
  }

  private async confirmQuit(): Promise<void> {
    const quit = await choose(this.config.root, 'Leave battle?', ['Progress in this battle will be lost.'], [
      { label: 'Keep playing', value: false },
      { label: 'Quit to menu', value: true },
    ]);
    if (quit && this.finished) this.dispose({ kind: 'quit' });
  }

  private renderActions(): void {
    const { mode } = this;
    const buttons: HTMLButtonElement[] = [];
    if (!this.busy && mode.kind === 'selected' && !mode.mustLeave) {
      for (const action of availableActions(this.state, mode.unit, false)) {
        if (action !== 'move') buttons.push(button(ACTION_LABELS[action], () => void this.order(mode.unit, action)));
      }
      buttons.push(button('Wait', () => void this.order(mode.unit, 'wait')));
    }
    if (!this.busy && mode.kind === 'moved') {
      for (const action of availableActions(this.state, mode.unit, true)) {
        buttons.push(button(ACTION_LABELS[action], () => void this.order(mode.unit, action)));
      }
    }
    const cancellable = mode.kind === 'moved' || mode.kind === 'targeting' || (mode.kind === 'selected' && !mode.mustLeave);
    if (!this.busy && cancellable) buttons.push(button('Cancel', () => this.back()));
    this.actions.replaceChildren(...buttons);
  }

  private renderInfo(): void {
    const tile = this.view.cursor;
    this.info.textContent = [this.event, tile ? this.describe(tile) : ''].filter(Boolean).join('\n');
  }

  private describe({ x, y }: Point): string {
    const { state } = this;
    const terrain = terrainAt(state, x, y);
    const owner = ownerAt(state, x, y);
    let text = `${TERRAIN_NAMES[terrain]} (defence +${TERRAIN_DEFENSE[terrain]})`;
    if (owner !== null) text += `, ${TEAM_NAMES[owner]}`;
    const unit = unitAt(state, x, y);
    if (unit) {
      const effects = [unit.poisoned && 'poisoned', unit.aura && 'aura'].filter(Boolean).join(', ');
      text +=
        `\n${TEAM_NAMES[unit.team]} ${displayName(unit)} HP ${unit.hp * 10} ATK ${effectiveAttack(unit)}` +
        ` DEF ${effectiveDefense(unit)} MOVE ${effectiveMove(unit)} LV ${unit.level}` +
        (unit.status === 'done' ? ' (done)' : '') +
        (effects ? ` [${effects}]` : '');
    } else if (tombstoneAt(state, x, y)) {
      text += '\nTombstone';
    }
    return text;
  }

  private readonly fit = () => {
    const width = this.state.width * TILE;
    const height = this.state.height * TILE;
    const fits = Math.min((this.board.clientWidth || width) / width, (this.board.clientHeight || height) / height);
    const scale = Math.max(1, Math.min(MAX_SCALE, fits));
    this.canvas.style.width = `${Math.floor(width * scale)}px`;
    this.canvas.style.height = `${Math.floor(height * scale)}px`;
    this.invalidate();
  };
}
