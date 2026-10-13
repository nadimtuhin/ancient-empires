import { TERRAIN_MOVE_COST, Terrain, UNIT_STATS } from './rules';
import { effectiveMove, inBounds, terrainAt, unitAt, type GameState, type Unit } from './state';

export interface Point {
  x: number;
  y: number;
}

const NEIGHBOURS: readonly Point[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
];

const BLOCKED = 1000;

function stepCost(state: GameState, unit: Unit, x: number, y: number): number {
  const other = unitAt(state, x, y);
  if (other && other.team !== unit.team) return BLOCKED;
  const stats = UNIT_STATS[unit.type];
  if (stats.flying) return 1;
  const terrain = terrainAt(state, x, y);
  if (stats.amphibious) return terrain === Terrain.Water ? 1 : TERRAIN_MOVE_COST[terrain] * 2;
  return TERRAIN_MOVE_COST[terrain];
}

const keyOf = (state: GameState, x: number, y: number) => y * state.width + x;

/**
 * Every tile the unit could walk to, keyed by y*width+x, with the move points left on arrival.
 * Friendly units can be walked through but not stopped on (the unit's own tile is allowed).
 */
export function reachableTiles(state: GameState, unit: Unit): Map<number, number> {
  const budget = allBudgets(state, unit);
  for (const key of budget.keys()) {
    const x = key % state.width;
    const y = Math.floor(key / state.width);
    const occupant = unitAt(state, x, y);
    if (occupant && occupant !== unit) budget.delete(key);
  }
  return budget;
}

/**
 * Walks back from the target, always stepping to the neighbour with the most move
 * points left, which reverses a cheapest route. Returns tiles from start to target.
 */
export function pathTo(state: GameState, unit: Unit, target: Point): Point[] {
  const best = allBudgets(state, unit);
  const path: Point[] = [target];
  let here = target;
  while (here.x !== unit.x || here.y !== unit.y) {
    let next: Point | undefined;
    let nextLeft = -1;
    for (const step of NEIGHBOURS) {
      const x = here.x + step.x;
      const y = here.y + step.y;
      if (!inBounds(state, x, y)) continue;
      const left = best.get(keyOf(state, x, y));
      if (left !== undefined && left > nextLeft) {
        next = { x, y };
        nextLeft = left;
      }
    }
    if (!next) return [{ x: unit.x, y: unit.y }, target];
    path.unshift(next);
    here = next;
  }
  return path;
}

/** Flood fill of move points left per tile, including friend-held tiles a path may cross. */
function allBudgets(state: GameState, unit: Unit): Map<number, number> {
  const budget = new Map<number, number>([[keyOf(state, unit.x, unit.y), effectiveMove(unit)]]);
  const frontier: Array<Point & { left: number }> = [{ x: unit.x, y: unit.y, left: effectiveMove(unit) }];
  while (frontier.length > 0) {
    frontier.sort((a, b) => b.left - a.left);
    const here = frontier.shift()!;
    for (const step of NEIGHBOURS) {
      const x = here.x + step.x;
      const y = here.y + step.y;
      if (!inBounds(state, x, y)) continue;
      const left = here.left - stepCost(state, unit, x, y);
      const key = keyOf(state, x, y);
      if (left < 0 || (budget.get(key) ?? -1) >= left) continue;
      budget.set(key, left);
      frontier.push({ x, y, left });
    }
  }
  return budget;
}
