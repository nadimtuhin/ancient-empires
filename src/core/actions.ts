import { fight, type FightResult } from './combat';
import { reachableTiles } from './movement';
import type { Rng } from './rng';
import {
  HEAL_PER_TURN, INCOME_PER_CASTLE, INCOME_PER_TOWN, MAX_HP, TOMBSTONE_LIFETIME,
  Terrain, UNIT_STATS, UnitType, buildingTileFor, isBuildingTile, type Team,
} from './rules';
import {
  distance, inBounds, isAlive, ownerAt, spawnUnit, terrainAt, unitAt,
  type GameState, type Unit,
} from './state';

export type Action = 'move' | 'attack' | 'occupy' | 'buy' | 'raise' | 'wait';

const ORTHOGONAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

export function attackTargets(state: GameState, unit: Unit): Unit[] {
  const { minRange, maxRange } = UNIT_STATS[unit.type];
  return state.units.filter((other) => {
    if (!isAlive(other) || other.team === unit.team) return false;
    const range = distance(unit.x, unit.y, other.x, other.y);
    return range >= minRange && range <= maxRange;
  });
}

export function raisableTombstones(state: GameState, unit: Unit): Unit[] {
  if (!UNIT_STATS[unit.type].canRaise) return [];
  return state.units.filter(
    (other) =>
      other.status === 'tombstone' &&
      distance(unit.x, unit.y, other.x, other.y) === 1 &&
      !unitAt(state, other.x, other.y),
  );
}

export function canOccupy(state: GameState, unit: Unit): boolean {
  const stats = UNIT_STATS[unit.type];
  const terrain = terrainAt(state, unit.x, unit.y);
  if (ownerAt(state, unit.x, unit.y) === unit.team) return false;
  return (
    (terrain === Terrain.Town && !!stats.canOccupyTown) ||
    (terrain === Terrain.Castle && !!stats.canOccupyCastle)
  );
}

/** A bought unit appears on the king's castle and must step off, so a free neighbour is needed. */
export function canBuy(state: GameState, unit: Unit): boolean {
  if (!UNIT_STATS[unit.type].canBuy) return false;
  if (terrainAt(state, unit.x, unit.y) !== Terrain.Castle) return false;
  if (ownerAt(state, unit.x, unit.y) !== unit.team) return false;
  return ORTHOGONAL.some(([dx, dy]) => {
    const x = unit.x + dx;
    const y = unit.y + dy;
    return inBounds(state, x, y) && !unitAt(state, x, y);
  });
}

/** Menu entries in the original's order. `hasMoved` is false before the unit walks. */
export function availableActions(state: GameState, unit: Unit, hasMoved: boolean): Action[] {
  const actions: Action[] = [];
  if (!hasMoved && canBuy(state, unit)) actions.push('buy');
  if (canOccupy(state, unit)) actions.push('occupy');
  const mayAttack = !hasMoved || !UNIT_STATS[unit.type].heavy;
  if (mayAttack && attackTargets(state, unit).length > 0) actions.push('attack');
  if (raisableTombstones(state, unit).length > 0) actions.push('raise');
  actions.push(hasMoved ? 'wait' : 'move');
  return actions;
}

export function buyableTypes(state: GameState): UnitType[] {
  return UNIT_STATS.flatMap((stats, type) =>
    stats.cost !== null && type <= state.buyLimit ? [type as UnitType] : [],
  );
}

export function moveUnit(state: GameState, unit: Unit, x: number, y: number): void {
  if (!reachableTiles(state, unit).has(y * state.width + x)) {
    throw new Error(`${UNIT_STATS[unit.type].name} cannot reach (${x},${y})`);
  }
  unit.x = x;
  unit.y = y;
}

/** Marks the unit done, clears the tombstone it stands on and refreshes wisp auras. */
export function finishUnit(state: GameState, unit: Unit): void {
  unit.status = 'done';
  state.units = state.units.filter(
    (other) => !(other.status === 'tombstone' && other.x === unit.x && other.y === unit.y),
  );
  refreshAuras(state, unit.team);
}

export function refreshAuras(state: GameState, team: Team): void {
  const army = state.units.filter((unit) => unit.team === team && isAlive(unit));
  for (const unit of army) unit.aura = false;
  for (const wisp of army.filter((unit) => UNIT_STATS[unit.type].givesAura)) {
    for (const unit of army) {
      const range = distance(wisp.x, wisp.y, unit.x, unit.y);
      if (range >= 1 && range <= 2) unit.aura = true;
    }
  }
}

function killUnit(state: GameState, unit: Unit): void {
  if (unit.type === UnitType.Skeleton) {
    state.units = state.units.filter((other) => other !== unit);
    return;
  }
  unit.hp = 0;
  unit.status = 'tombstone';
  unit.poisoned = false;
  unit.aura = false;
  unit.deathTurn = state.turn;
}

export function attack(state: GameState, attacker: Unit, defender: Unit, rng: Rng): FightResult {
  if (!attackTargets(state, attacker).includes(defender)) throw new Error('target out of range');
  const result = fight(state, attacker, defender, rng);
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (defender.hp <= 0) killUnit(state, defender);
  if (isAlive(attacker)) finishUnit(state, attacker);
  else refreshAuras(state, attacker.team);
  refreshAuras(state, defender.team);
  return result;
}

export function occupy(state: GameState, unit: Unit): void {
  if (!canOccupy(state, unit)) throw new Error('nothing to occupy here');
  const index = unit.y * state.width + unit.x;
  state.tiles[index] = buildingTileFor(state.tiles[index], unit.team);
  finishUnit(state, unit);
}

/** Spends gold and places the new unit on the king's tile; the caller must then move it off. */
export function buy(state: GameState, king: Unit, type: UnitType): Unit {
  const cost = UNIT_STATS[type].cost;
  if (cost === null || !buyableTypes(state).includes(type)) throw new Error('unit not for sale');
  if (!canBuy(state, king)) throw new Error('can only buy from an owned castle');
  if (state.gold[king.team] < cost) throw new Error('not enough gold');
  state.gold[king.team] -= cost;
  finishUnit(state, king);
  return spawnUnit(state, type, king.team, king.x, king.y);
}

export function raise(state: GameState, wizard: Unit, tombstone: Unit): Unit {
  if (!raisableTombstones(state, wizard).includes(tombstone)) throw new Error('no tombstone to raise');
  state.units = state.units.filter((other) => other !== tombstone);
  const skeleton = spawnUnit(state, UnitType.Skeleton, wizard.team, tombstone.x, tombstone.y);
  skeleton.status = 'done';
  finishUnit(state, wizard);
  return skeleton;
}

export function incomeOf(state: GameState, team: Team): number {
  let income = 0;
  state.tiles.forEach((tile, index) => {
    if (!isBuildingTile(tile)) return;
    const x = index % state.width;
    const y = Math.floor(index / state.width);
    if (ownerAt(state, x, y) !== team) return;
    income += terrainAt(state, x, y) === Terrain.Castle ? INCOME_PER_CASTLE : INCOME_PER_TOWN;
  });
  return income;
}

export const readyUnits = (state: GameState, team: Team): Unit[] =>
  state.units.filter((unit) => unit.team === team && unit.status === 'ready');

/**
 * Hands the turn to the other team: clears old tombstones, wakes every unit, heals the new
 * team on its own buildings, lifts poison from the team that just suffered a turn of it,
 * and pays income. A team with nothing able to act is skipped.
 */
export function endTurn(state: GameState): void {
  for (let attempt = 0; attempt < 2; attempt++) {
    advanceTurn(state);
    if (readyUnits(state, state.current).length > 0) return;
  }
}

function advanceTurn(state: GameState): void {
  state.turn++;
  state.current = (1 - state.current) as Team;
  state.units = state.units.filter(
    (unit) => unit.status !== 'tombstone' || state.turn - unit.deathTurn < TOMBSTONE_LIFETIME,
  );
  for (const unit of state.units) {
    if (unit.status === 'tombstone') continue;
    unit.status = 'ready';
    if (unit.team === state.current) {
      if (ownerAt(state, unit.x, unit.y) === unit.team) unit.hp = Math.min(MAX_HP, unit.hp + HEAL_PER_TURN);
    } else {
      unit.poisoned = false;
    }
  }
  state.gold[state.current] += incomeOf(state, state.current);
}
