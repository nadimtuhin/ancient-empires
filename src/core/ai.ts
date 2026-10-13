// Computer player modelled on the original's move scorer: for every tile a unit can reach,
// score "stay", each attack and each raise, then pick the best.
import { attackTargets, buyableTypes, canBuy, canOccupy, raisableTombstones } from './actions';
import { canCounter } from './combat';
import { reachableTiles, type Point } from './movement';
import type { Rng } from './rng';
import { MAX_HP, TERRAIN_MOVE_COST, Terrain, UNIT_STATS, UnitType, type Team } from './rules';
import {
  distance, isAlive, kingOf, ownerAt, terrainAt, terrainDefense, unitAt,
  type GameState, type Unit,
} from './state';

export type AiAction =
  | { kind: 'attack'; targetId: number }
  | { kind: 'raise'; tombstoneId: number }
  | { kind: 'occupy' }
  | { kind: 'wait' };

export type AiPlan =
  | { kind: 'buy'; kingId: number; type: UnitType }
  | { kind: 'act'; unitId: number; to: Point; action: AiAction };

/** The next thing the computer wants to do, or null when its turn is over. */
export function nextAiPlan(state: GameState, team: Team, rng: Rng): AiPlan | null {
  const ready = state.units.filter((unit) => unit.team === team && unit.status === 'ready');
  if (ready.length === 0) return null;

  // A freshly bought unit still shares the castle with its king: move it first.
  const crowded = ready.find((unit) => state.units.some((other) => other !== unit && isAlive(other) && other.x === unit.x && other.y === unit.y));
  const others = ready.filter((unit) => unit.type !== UnitType.King);
  const unit = crowded ?? others[0] ?? ready[0];

  if (unit.type === UnitType.King && others.length === 0 && !crowded) {
    const purchase = choosePurchase(state, unit, rng);
    if (purchase !== null) return { kind: 'buy', kingId: unit.id, type: purchase };
  }
  return { kind: 'act', unitId: unit.id, ...bestMove(state, unit, !!crowded) };
}

function choosePurchase(state: GameState, king: Unit, rng: Rng): UnitType | null {
  if (!canBuy(state, king)) return null;
  const gold = state.gold[king.team];
  const army = state.units.filter((unit) => unit.team === king.team && isAlive(unit));
  const soldiers = army.filter((unit) => unit.type === UnitType.Soldier).length;
  if (soldiers < 2 && gold >= UNIT_STATS[UnitType.Soldier].cost!) return UnitType.Soldier;

  const options = buyableTypes(state).filter((type) => {
    const cost = UNIT_STATS[type].cost!;
    const alreadyOwned = army.some((unit) => unit.type === type);
    return type !== UnitType.Soldier && cost <= gold && (!alreadyOwned || cost >= 600);
  });
  return options.length > 0 ? options[rng(options.length)] : null;
}

/** "Value" of a unit standing somewhere: tougher, healthier, better covered units are worth more. */
function unitValue(state: GameState, unit: Unit, x = unit.x, y = unit.y): number {
  const stats = UNIT_STATS[unit.type];
  return (unit.level + stats.attack + stats.defense + terrainDefense(state, unit, x, y)) * unit.hp;
}

function nearestTown(state: GameState, unit: Unit): Point | null {
  const wantsEnemyTowns = unit.type === UnitType.Soldier;
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      if (terrainAt(state, x, y) !== Terrain.Town) continue;
      const owned = ownerAt(state, x, y) === unit.team;
      if (owned === wantsEnemyTowns) continue;
      const range = distance(unit.x, unit.y, x, y);
      if (range < bestDistance) {
        best = { x, y };
        bestDistance = range;
      }
    }
  }
  return best;
}

/** Bigger when (x,y) is closer to the goal; squares or doubles it like the original. */
const closeness = (state: GameState, x: number, y: number, goal: Point) =>
  state.width - Math.abs(goal.x - x) + state.height - Math.abs(goal.y - y);

function positionScore(state: GameState, unit: Unit, x: number, y: number, town: Point | null): number {
  let score = terrainDefense(state, unit, x, y) * 2;
  const enemyKing = kingOf(state, (1 - unit.team) as Team);
  if (enemyKing && isAlive(enemyKing)) score += closeness(state, x, y, enemyKing) * 2;
  if (ownerAt(state, x, y) === unit.team) score += (MAX_HP - unit.hp) * 2;
  if (unit.hp < 5 && unit.type !== UnitType.Soldier && town) score += closeness(state, x, y, town) ** 2;

  if (unit.type === UnitType.Soldier) {
    if (town && kingOf(state, unit.team)) score += closeness(state, x, y, town) ** 2;
    if (TERRAIN_MOVE_COST[terrainAt(state, x, y)] <= 1) score += 5;
    if (!town && wouldOccupy(state, unit, x, y)) score += 200;
  }
  if (unit.type === UnitType.King && x === unit.x && y === unit.y) score += 200;

  const moveRange = UNIT_STATS[unit.type].move;
  if (moveRange > 1) score += Math.trunc((10 * distance(unit.x, unit.y, x, y)) / (moveRange - 1));
  return score;
}

/** Evaluates a rule as if the unit stood on (x,y), then puts it back. */
function standingAt<T>(unit: Unit, x: number, y: number, check: () => T): T {
  const home = { x: unit.x, y: unit.y };
  unit.x = x;
  unit.y = y;
  try {
    return check();
  } finally {
    unit.x = home.x;
    unit.y = home.y;
  }
}

const wouldOccupy = (state: GameState, unit: Unit, x: number, y: number) =>
  standingAt(unit, x, y, () => canOccupy(state, unit));

function attackScore(state: GameState, unit: Unit, target: Unit, x: number, y: number): number {
  const counters = standingAt(unit, x, y, () => canCounter(target, unit));
  let score = counters
    ? unitValue(state, unit, x, y) - unitValue(state, target) + MAX_HP - target.hp
    : unitValue(state, unit, x, y) * 2;
  if (target.type === UnitType.King) score += 10;
  return score;
}

function bestMove(state: GameState, unit: Unit, mustLeave: boolean): { to: Point; action: AiAction } {
  const town = nearestTown(state, unit);
  let best: { to: Point; action: AiAction } = { to: { x: unit.x, y: unit.y }, action: { kind: 'wait' } };
  let bestScore = -Infinity;
  const consider = (score: number, to: Point, action: AiAction) => {
    if (score > bestScore) {
      bestScore = score;
      best = { to, action };
    }
  };

  for (const key of reachableTiles(state, unit).keys()) {
    const x = key % state.width;
    const y = Math.floor(key / state.width);
    const staying = x === unit.x && y === unit.y;
    if (mustLeave && staying) continue;
    if (!staying && unitAt(state, x, y)) continue;
    const to = { x, y };
    const base = positionScore(state, unit, x, y, town);
    consider(base, to, wouldOccupy(state, unit, x, y) ? { kind: 'occupy' } : { kind: 'wait' });

    const mayAttack = staying || !UNIT_STATS[unit.type].heavy;
    if (mayAttack) {
      for (const target of standingAt(unit, x, y, () => attackTargets(state, unit))) {
        consider(base + attackScore(state, unit, target, x, y), to, { kind: 'attack', targetId: target.id });
      }
    }
    for (const tombstone of standingAt(unit, x, y, () => raisableTombstones(state, unit))) {
      consider(base + 100, to, { kind: 'raise', tombstoneId: tombstone.id });
    }
  }
  return best;
}
