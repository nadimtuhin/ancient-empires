import { describe, expect, it } from 'vitest';
import { UnitType } from '../../src/core/rules';
import { distance, isAlive, kingOf, type GameState } from '../../src/core/state';
import { runMission } from './campaign';

/** Tiles holding more than one living unit; unitAt can only ever see one of them. */
const stacked = (state: GameState): string[] => {
  const seen = new Map<string, number>();
  for (const unit of state.units.filter(isAlive)) {
    const key = `${unit.x},${unit.y}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([key]) => key);
};

describe('scripted reinforcements never land on an occupied tile', () => {
  it('mission 1: the ambush soldier steps aside when a blue unit already stands on (5,8)', () => {
    const { state, update } = runMission(0);
    const scout = state.units.find((unit) => unit.team === 0 && unit.type === UnitType.Soldier)!;
    Object.assign(scout, { x: 5, y: 8 });
    update();
    const ambusher = state.units.find((unit) => unit.team === 1)!;
    expect(stacked(state)).toEqual([]);
    expect(distance(ambusher.x, ambusher.y, 5, 8)).toBe(1);
  });

  it('mission 2: a spider steps aside when a blue unit already stands on its spawn tile', () => {
    const { state, update } = runMission(1);
    const galamar = kingOf(state, 0)!;
    const archer = state.units.find((unit) => unit.team === 0 && unit.type === UnitType.Archer)!;
    // Both villages taken, Galamar done in the north-east, the archer waiting where a spider will appear.
    state.tiles[12 * state.width + 9] = 26;
    state.tiles[13 * state.width + 11] = 26;
    update();
    Object.assign(galamar, { x: 11, y: 3, status: 'done' });
    Object.assign(archer, { x: 4, y: 0 });
    update();
    expect(state.units.filter((unit) => unit.type === UnitType.Spider)).toHaveLength(3);
    expect(stacked(state)).toEqual([]);
  });

  it('mission 4: Valadorn steps aside when a blue unit already holds his castle', () => {
    const { state, update } = runMission(3);
    const galamar = kingOf(state, 0)!;
    Object.assign(galamar, { x: 2, y: 0 });
    state.turn = 10;
    update();
    const valadorn = state.units.find((unit) => unit.team === 1 && unit.type === UnitType.King)!;
    expect(stacked(state)).toEqual([]);
    expect(distance(valadorn.x, valadorn.y, 2, 0)).toBe(1);
  });
});
