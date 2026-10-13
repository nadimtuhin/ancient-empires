import { createGame, type GameState } from '../core/state';
import { parseMap } from '../core/formats';
import { ENDING_STORY_INDEX, MISSIONS, MissionApi, MISSION_COUNT, SKIRMISH_OBJECTIVE_INDEX, missionTitleIndex, startMission } from '../core/missions';
import type { Rng } from '../core/rng';
import type { Sprites } from '../render/sprites';
import { button, choose, h } from './dom';
import { clearSave, readSave, writeSave, type SavedBattle } from './save';
import { Session, TEAM_NAMES, type Player, type Timing } from './session';

export interface Game {
  root: HTMLElement;
  sprites: Sprites;
  lang: string[];
  maps: ReadonlyMap<string, Uint8Array>;
  rng: Rng;
  timing: Timing;
}

const SKIRMISH_MAPS = [
  { file: 's0', name: 'Island Cross' },
  { file: 's1', name: 'Rocky Bay' },
];
const SKIRMISH_GOLD = 1000;
const PROGRESS_KEY = 'ae1.unlockedMission';

function unlockedMission(): number {
  try {
    return Math.min(MISSION_COUNT - 1, Number(localStorage.getItem(PROGRESS_KEY)) || 0);
  } catch {
    return 0;
  }
}

function unlockMission(index: number): void {
  try {
    localStorage.setItem(PROGRESS_KEY, String(Math.max(unlockedMission(), index)));
  } catch {
    // storage unavailable: progress lasts only for this visit
  }
}

function readMap(game: Game, name: string): Uint8Array {
  const bytes = game.maps.get(name);
  if (!bytes) throw new Error(`map ${name} is not loaded`);
  return bytes;
}

export function showMainMenu(game: Game): void {
  const splash = h('canvas', { className: 'splash', width: 144, height: 59, ariaLabel: game.lang[0], role: 'img' });
  splash.getContext('2d')!.drawImage(game.sprites.splash, 0, 0);
  const save = readSave();
  const menu = h('nav', { className: 'main-menu', ariaLabel: 'Main menu' },
    splash,
    save && button('Continue', () => void resume(game, save)),
    button('Campaign', () => showCampaignMenu(game)),
    button('Skirmish', () => showSkirmishMenu(game)),
    button('How to play', () => void showHelp(game)),
  );
  game.root.replaceChildren(menu);
}

function showCampaignMenu(game: Game): void {
  const unlocked = unlockedMission();
  const list = h('nav', { className: 'main-menu', ariaLabel: 'Campaign' }, h('h2', { textContent: 'Campaign' }));
  for (let index = 0; index < MISSION_COUNT; index++) {
    const title = `${index + 1}. ${game.lang[missionTitleIndex(index)]}`;
    list.append(button(title, () => void playMission(game, index), { disabled: index > unlocked }));
  }
  list.append(button('Back', () => showMainMenu(game)));
  game.root.replaceChildren(list);
}

function showSkirmishMenu(game: Game): void {
  let opponent: Player = 'cpu';
  const opponents = h('fieldset', { className: 'choice' }, h('legend', { textContent: 'Red is played by' }));
  for (const [value, label] of [['cpu', 'Computer'], ['human', 'Second player']] as const) {
    const input = h('input', { type: 'radio', name: 'opponent', value, checked: value === opponent, onchange: () => (opponent = value) });
    opponents.append(h('label', {}, input, ` ${label}`));
  }
  const menu = h('nav', { className: 'main-menu', ariaLabel: 'Skirmish' }, h('h2', { textContent: 'Skirmish' }), opponents);
  for (const map of SKIRMISH_MAPS) menu.append(button(map.name, () => void playSkirmish(game, map.file, opponent)));
  menu.append(button('Back', () => showMainMenu(game)));
  game.root.replaceChildren(menu);
}

function resume(game: Game, save: SavedBattle): Promise<void> {
  if (save.mission === null) return playSkirmish(game, save.map, save.players[1], save.state);
  return playMission(game, save.mission, save);
}

async function playSkirmish(game: Game, file: string, opponent: Player, saved?: GameState): Promise<void> {
  const state = saved ?? createGame(parseMap(readMap(game, file)), { gold: SKIRMISH_GOLD });
  const players: [Player, Player] = ['human', opponent];
  const onHumanTurn = () => writeSave({ version: 1, mission: null, map: file, firedBeats: [], players, state });
  const result = await new Session({ ...game, state, players, onHumanTurn }).run();
  if (result.kind === 'quit') return showMainMenu(game);
  clearSave();
  const again = await choose(game.root, `${TEAM_NAMES[result.winner]} wins!`, [game.lang[SKIRMISH_OBJECTIVE_INDEX]], [
    { label: 'Play again', value: true },
    { label: 'Main menu', value: false },
  ]);
  if (again) await playSkirmish(game, file, opponent);
  else showMainMenu(game);
}

async function playMission(game: Game, index: number, saved?: SavedBattle): Promise<void> {
  const api = saved ? new MissionApi(saved.state, saved.firedBeats) : startMission(index, (name) => readMap(game, name));
  const players: [Player, Player] = ['human', 'cpu'];
  const onHumanTurn = () =>
    writeSave({ version: 1, mission: index, map: MISSIONS[index].map, firedBeats: api.firedBeats, players, state: api.state });
  const mission = { index, api, script: MISSIONS[index] };
  const result = await new Session({ ...game, state: api.state, players, mission, resumed: !!saved, onHumanTurn }).run();
  if (result.kind === 'quit') return showCampaignMenu(game);
  clearSave();

  if (result.winner === 1) {
    const retry = await choose(game.root, 'Mission failed', [], [
      { label: 'Try again', value: true },
      { label: 'Campaign menu', value: false },
    ]);
    return retry ? playMission(game, index) : showCampaignMenu(game);
  }

  const last = index === MISSION_COUNT - 1;
  if (!last) unlockMission(index + 1);
  const next = await choose(game.root, game.lang[37], last ? [game.lang[ENDING_STORY_INDEX]] : [], [
    ...(last ? [] : [{ label: 'Next mission', value: true }]),
    { label: 'Campaign menu', value: false },
  ]);
  return next ? playMission(game, index + 1) : showCampaignMenu(game);
}

async function showHelp(game: Game): Promise<void> {
  await choose(game.root, 'How to play', [
    game.lang[13],
    'Click one of your units to see where it can go, then click a highlighted tile. ' +
      'Pick an action from the bar under the map: attack, occupy a town or castle, raise the dead, or wait.',
    'Your king buys troops while standing on a castle you own. Towns pay 30 gold a turn, castles 50.',
    'Keys: arrows move the cursor, Enter selects, Escape goes back, E ends the turn.',
  ], [{ label: 'Back', value: null }]);
  showMainMenu(game);
}
