// Campaign scripts, following the original mission step machine: dialogue, ambushes,
// reinforcements and win/lose checks. Text comes from lang.dat by index.
import { parseMap } from './formats';
import { buildingTileFor, Terrain, UnitType, type Team } from './rules';
import {
  createGame, isAlive, kingOf, ownerAt, spawnUnit, terrainAt, unitAt, type GameState, type Unit,
} from './state';

export const MISSION_COUNT = 7;

export const Speaker = { Galamar: 0, Valadorn: 1, Captain: 2 } as const;
export type Speaker = (typeof Speaker)[keyof typeof Speaker];

export interface Line {
  speaker: Speaker;
  textIndex: number;
}

export type MissionOutcome = 'won' | 'lost' | null;

/** What a mission script can do to the game. */
export class MissionApi {
  readonly dialogue: Line[] = [];
  outcome: MissionOutcome = null;
  private readonly fired: Set<string>;

  constructor(readonly state: GameState, firedBeats: Iterable<string> = []) {
    this.fired = new Set(firedBeats);
  }

  /** Beats already played, so a saved mission resumes without replaying them. */
  get firedBeats(): string[] {
    return [...this.fired];
  }

  /** True exactly once per name: lets each scripted beat fire a single time. */
  once(name: string): boolean {
    if (this.fired.has(name)) return false;
    this.fired.add(name);
    return true;
  }

  hasFired(name: string): boolean {
    return this.fired.has(name);
  }

  say(speaker: Speaker, ...textIndexes: number[]): void {
    for (const textIndex of textIndexes) this.dialogue.push({ speaker, textIndex });
  }

  spawn(type: UnitType, team: Team, x: number, y: number): Unit {
    const unit = spawnUnit(this.state, type, team, x, y);
    unit.status = 'done';
    return unit;
  }

  flip(x: number, y: number, team: Team): void {
    const index = y * this.state.width + x;
    this.state.tiles[index] = buildingTileFor(this.state.tiles[index], team);
  }

  get galamar(): Unit | undefined {
    return kingOf(this.state, 0);
  }

  get enemyKing(): Unit | undefined {
    return kingOf(this.state, 1);
  }

  army(team: Team): Unit[] {
    return this.state.units.filter((unit) => unit.team === team && isAlive(unit));
  }

  owns(team: Team, x: number, y: number): boolean {
    return ownerAt(this.state, x, y) === team;
  }
}

export interface Mission {
  /** Map file; mission 6 borrows mission 5's terrain. */
  map: string;
  terrainFrom?: string;
  gold: number;
  buyLimit: number;
  setup(api: MissionApi): void;
  /** Runs after every action and at every turn start. */
  update(api: MissionApi): void;
}

const kingDown = (unit: Unit | undefined) => !unit || !isAlive(unit);

/** A fallen Galamar ends the mission at once, so a same-turn win can never overwrite the loss. */
function loseIfGalamarFalls(api: MissionApi): boolean {
  if (kingDown(api.galamar)) api.outcome = 'lost';
  return api.outcome === 'lost';
}

export const MISSIONS: readonly Mission[] = [
  {
    // REGROUP: reach the abandoned castle without losing anyone.
    map: 'm0', gold: 0, buyLimit: UnitType.Wyvern,
    setup(api) {
      api.say(Speaker.Captain, 111);
      api.say(Speaker.Galamar, 112);
      api.say(Speaker.Captain, 113);
    },
    update(api) {
      if (api.state.units.some((unit) => unit.team === 0 && !isAlive(unit))) {
        api.outcome = 'lost';
        return;
      }
      if (api.army(0).some((unit) => unit.x >= 4 && unit.y >= 7) && api.once('ambush')) {
        api.spawn(UnitType.Soldier, 1, 5, 8);
        api.say(Speaker.Captain, 114);
      }
      if (api.owns(0, 8, 9)) api.outcome = 'won';
    },
  },
  {
    // FRIENDS & ENEMIES: take the first village, then save the lizards from the spiders.
    map: 'm1', gold: 0, buyLimit: UnitType.Lizard,
    setup(api) {
      api.say(Speaker.Galamar, 115);
    },
    update(api) {
      if (loseIfGalamarFalls(api)) return;
      if (api.owns(0, 9, 12) && api.owns(0, 11, 13) && api.once('lizards-in-trouble')) {
        api.say(Speaker.Captain, 116);
        api.say(Speaker.Galamar, 117);
      }
      const king = api.galamar;
      if (api.hasFired('lizards-in-trouble') && king?.status === 'done' && king.x >= 11 && king.y <= 4 && api.once('spiders')) {
        for (const [x, y] of [[4, 0], [1, 1], [1, 5]]) api.spawn(UnitType.Spider, 1, x, y);
        for (const [x, y] of [[9, 2], [10, 1]]) if (!unitAt(api.state, x, y)) api.spawn(UnitType.Lizard, 0, x, y);
        api.say(Speaker.Captain, 118);
        api.say(Speaker.Galamar, 119);
        api.say(Speaker.Captain, 120);
      }
      if (api.hasFired('spiders') && api.army(1).length === 0) api.outcome = 'won';
    },
  },
  {
    // ESCORT: the bridge is gone; get Galamar to the Grey Tower with the Lizard Chief alive.
    map: 'm2', gold: 0, buyLimit: UnitType.Wyvern,
    setup(api) {
      const chief = unitAt(api.state, 14, 12);
      if (chief) chief.title = 'Lizard Chief';
      for (let x = 5; x <= 9; x++) api.state.tiles[12 * api.state.width + x] = 21;
      api.say(Speaker.Captain, 121);
      api.say(Speaker.Galamar, 122);
      api.say(Speaker.Captain, 123);
    },
    update(api) {
      if (loseIfGalamarFalls(api)) return;
      if (api.state.units.some((unit) => unit.title === 'Lizard Chief' && !isAlive(unit))) {
        api.outcome = 'lost';
        return;
      }
      const king = api.galamar;
      if (king && king.x === 1 && king.y === 13) api.outcome = 'won';
    },
  },
  {
    // REINFORCEMENTS: hold the city; Valadorn himself arrives on turn 10.
    map: 'm3', gold: 300, buyLimit: UnitType.Spider,
    setup(api) {
      api.say(Speaker.Captain, 124);
    },
    update(api) {
      if (loseIfGalamarFalls(api)) return;
      if (api.state.turn >= 10 && api.once('valadorn-arrives')) {
        api.spawn(UnitType.King, 1, 2, 0);
        api.spawn(UnitType.Spider, 1, 0, 0);
        api.flip(2, 0, 1);
        api.flip(0, 0, 1);
        api.say(Speaker.Captain, 125);
        api.say(Speaker.Valadorn, 126);
      }
      if (api.hasFired('valadorn-arrives') && kingDown(api.enemyKing) && api.once('valadorn-retreats')) {
        api.say(Speaker.Valadorn, 127);
        api.outcome = 'won';
      }
    },
  },
  {
    // WYVERN RESCUE: defeat the camp's king to free the wyverns.
    map: 'm4', gold: 300, buyLimit: UnitType.Catapult,
    setup(api) {
      api.say(Speaker.Captain, 128, 129);
    },
    update(api) {
      if (loseIfGalamarFalls(api)) return;
      if (kingDown(api.enemyKing) && api.once('wyverns-free')) {
        if (!unitAt(api.state, 2, 2)) api.spawn(UnitType.Wyvern, 0, 2, 2);
        api.say(Speaker.Captain, 130);
        api.outcome = 'won';
      }
    },
  },
  {
    // SIEGE: break into the enemy command post.
    map: 'm5', gold: 300, buyLimit: UnitType.Wyvern,
    setup(api) {
      api.say(Speaker.Captain, 131);
      api.say(Speaker.Galamar, 132);
    },
    update(api) {
      if (loseIfGalamarFalls(api)) return;
      if (kingDown(api.enemyKing)) api.outcome = 'won';
    },
  },
  {
    // FINAL ASSAULT: Valadorn's army appears from nowhere.
    map: 'm6', terrainFrom: 'm5', gold: 300, buyLimit: UnitType.Wyvern,
    setup(api) {
      const ambush: Array<[UnitType, number, number]> = [
        [UnitType.Catapult, 12, 0], [UnitType.Soldier, 13, 0],
        [UnitType.Golem, 1, 11], [UnitType.Soldier, 1, 12],
        [UnitType.King, 1, 1], [UnitType.Wyvern, 0, 1], [UnitType.Soldier, 1, 2],
      ];
      for (const [type, x, y] of ambush) {
        const unit = api.spawn(type, 1, x, y);
        unit.status = 'ready';
      }
      for (const [x, y] of [[13, 0], [1, 12], [1, 1], [1, 2]]) {
        if (terrainAt(api.state, x, y) === Terrain.Town || terrainAt(api.state, x, y) === Terrain.Castle) api.flip(x, y, 1);
      }
      api.say(Speaker.Galamar, 133);
      api.say(Speaker.Valadorn, 134);
      api.say(Speaker.Galamar, 135);
    },
    update(api) {
      if (loseIfGalamarFalls(api)) return;
      if (kingDown(api.enemyKing) && api.once('spell-broken')) {
        api.say(Speaker.Valadorn, 136);
        api.say(Speaker.Galamar, 137);
        api.outcome = 'won';
      }
    },
  },
];

export const missionTitleIndex = (mission: number) => 48 + mission;
export const missionObjectiveIndex = (mission: number) => 55 + mission;
export const missionStoryIndex = (mission: number) => 103 + mission;
export const ENDING_STORY_INDEX = 110;
export const SKIRMISH_OBJECTIVE_INDEX = 62;

/** Builds a mission's opening position. `readMap` returns the raw bytes of a map file. */
export function startMission(index: number, readMap: (name: string) => Uint8Array): MissionApi {
  const mission = MISSIONS[index];
  const units = readMap(mission.map);
  const terrain = mission.terrainFrom ? readMap(mission.terrainFrom) : units;
  const state = createGame(parseMap(units, terrain), { gold: mission.gold, buyLimit: mission.buyLimit });
  const api = new MissionApi(state);
  mission.setup(api);
  return api;
}
