import type { MapData } from './formats';
import {
  MAX_HP, Terrain, TERRAIN_DEFENSE, UNIT_STATS, UnitType,
  buildingOwner, terrainOfTile, type Team,
} from './rules';

export type UnitStatus = 'ready' | 'done' | 'tombstone';

export interface Unit {
  id: number;
  type: UnitType;
  team: Team;
  x: number;
  y: number;
  hp: number;
  level: number;
  xp: number;
  status: UnitStatus;
  poisoned: boolean;
  aura: boolean;
  /** Half-turn counter value when the unit died; tombstones vanish 3 half-turns later. */
  deathTurn: number;
  /** Shown instead of the type name, e.g. the campaign's Lizard Chief. */
  title?: string;
}

export interface GameState {
  width: number;
  height: number;
  tiles: number[];
  units: Unit[];
  gold: [number, number];
  /** Half-turns played so far: each team's turn counts as one. */
  turn: number;
  current: Team;
  /** Highest unit type id the human may buy (missions restrict it). */
  buyLimit: number;
  nextId: number;
}

export interface NewGameOptions {
  gold: number;
  buyLimit?: number;
}

export function createGame(map: MapData, options: NewGameOptions): GameState {
  const state: GameState = {
    width: map.width,
    height: map.height,
    tiles: [...map.tiles],
    units: [],
    gold: [options.gold, options.gold],
    turn: 0,
    current: 0,
    buyLimit: options.buyLimit ?? UnitType.Wyvern,
    nextId: 1,
  };
  for (const unit of map.units) spawnUnit(state, unit.type, unit.team, unit.x, unit.y);
  return state;
}

export function spawnUnit(state: GameState, type: UnitType, team: Team, x: number, y: number): Unit {
  const unit: Unit = {
    id: state.nextId++, type, team, x, y,
    hp: MAX_HP, level: 0, xp: 0, status: 'ready', poisoned: false, aura: false, deathTurn: 0,
  };
  state.units.push(unit);
  return unit;
}

export const inBounds = (state: GameState, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < state.width && y < state.height;

export const tileAt = (state: GameState, x: number, y: number): number => state.tiles[y * state.width + x];

export const terrainAt = (state: GameState, x: number, y: number): Terrain => terrainOfTile(tileAt(state, x, y));

export const ownerAt = (state: GameState, x: number, y: number): Team | null => buildingOwner(tileAt(state, x, y));

export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.abs(ax - bx) + Math.abs(ay - by);

export const isAlive = (unit: Unit): boolean => unit.status !== 'tombstone';

/** The living unit on a tile; tombstones don't block anything. */
export function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((unit) => unit.x === x && unit.y === y && isAlive(unit));
}

export function tombstoneAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((unit) => unit.x === x && unit.y === y && unit.status === 'tombstone');
}

export function kingOf(state: GameState, team: Team): Unit | undefined {
  return state.units.find((unit) => unit.team === team && unit.type === UnitType.King);
}

export function terrainDefense(state: GameState, unit: Unit, x = unit.x, y = unit.y): number {
  const terrain = terrainAt(state, x, y);
  const amphibiousBonus = terrain === Terrain.Water && UNIT_STATS[unit.type].amphibious ? 2 : 0;
  return TERRAIN_DEFENSE[terrain] + amphibiousBonus;
}

/** Status effects: poison costs 1 move, attack and defence; a wisp's aura adds 1 attack. */
export function effectiveAttack(unit: Unit): number {
  return UNIT_STATS[unit.type].attack + (unit.aura ? 1 : 0) - (unit.poisoned ? 1 : 0);
}

export function effectiveDefense(unit: Unit): number {
  return UNIT_STATS[unit.type].defense - (unit.poisoned ? 1 : 0);
}

export function effectiveMove(unit: Unit): number {
  return UNIT_STATS[unit.type].move - (unit.poisoned ? 1 : 0);
}

export function displayName(unit: Unit): string {
  return unit.title ?? UNIT_STATS[unit.type].name;
}
