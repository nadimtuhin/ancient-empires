import type { Rng } from '../../src/core/rng';
import { createGame, spawnUnit, type GameState, type Unit } from '../../src/core/state';
import type { Team, UnitType } from '../../src/core/rules';

/** One character per tile, so test boards read like little maps. */
const LEGEND: Record<string, number> = {
  '.': 3, // grass
  '=': 18, // road
  f: 1, // woods
  h: 2, // hill
  m: 0, // mountain
  '~': 21, // water
  t: 23, // neutral town
  c: 24, // neutral castle
  b: 26, // blue town
  B: 27, // blue castle
  r: 29, // red town
  R: 30, // red castle
};

export function board(rows: string[], gold = 0): GameState {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = rows.flatMap((row) => [...row].map((char) => LEGEND[char]));
  return createGame({ width, height, tiles, units: [] }, { gold });
}

export function place(state: GameState, type: UnitType, team: Team, x: number, y: number): Unit {
  return spawnUnit(state, type, team, x, y);
}

/** Every dice roll lands on 0, so combat is the bare formula. */
export const noLuck: Rng = () => 0;
