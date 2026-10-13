import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endTurn, moveUnit, occupy } from '../../src/core/actions';
import { MISSIONS, MISSION_COUNT, startMission } from '../../src/core/missions';
import { UnitType } from '../../src/core/rules';
import { kingOf, tileAt, unitAt } from '../../src/core/state';

const readMap = (name: string) => new Uint8Array(readFileSync(`public/assets/ae1/${name}`));
const run = (index: number) => {
  const api = startMission(index, readMap);
  const update = () => MISSIONS[index].update(api);
  return { api, state: api.state, update };
};

describe('campaign missions', () => {
  it.each(Array.from({ length: MISSION_COUNT }, (_, index) => index))(
    'mission %i opens with Galamar on the map and briefing dialogue',
    (index) => {
      const { api, state } = run(index);
      expect(kingOf(state, 0)).toBeDefined();
      expect(api.dialogue.length).toBeGreaterThan(0);
      expect(api.outcome).toBeNull();
    },
  );

  it('mission 1: an ambush appears near the castle, and taking it wins', () => {
    const { api, state, update } = run(0);
    const galamar = kingOf(state, 0)!;
    galamar.x = 7;
    galamar.y = 8;
    update();
    expect(unitAt(state, 5, 8)).toMatchObject({ type: UnitType.Soldier, team: 1 });
    expect(api.dialogue.at(-1)?.textIndex).toBe(114);

    moveUnit(state, galamar, 8, 9);
    occupy(state, galamar);
    update();
    expect(api.outcome).toBe('won');
  });

  it('mission 1: losing any soldier fails the mission', () => {
    const { api, state, update } = run(0);
    const soldier = state.units.find((unit) => unit.type === UnitType.Soldier)!;
    soldier.status = 'tombstone';
    update();
    expect(api.outcome).toBe('lost');
  });

  it('mission 3: the bridge is down and the Lizard Chief is named', () => {
    const { state } = run(2);
    for (let x = 5; x <= 9; x++) expect(tileAt(state, x, 12)).toBe(21);
    expect(unitAt(state, 14, 12)?.title).toBe('Lizard Chief');
  });

  it('mission 4: Valadorn shows up on turn 10 and fleeing him wins', () => {
    const { api, state, update } = run(3);
    while (state.turn < 10) endTurn(state);
    update();
    const valadorn = kingOf(state, 1)!;
    expect(valadorn).toMatchObject({ x: 2, y: 0 });
    valadorn.status = 'tombstone';
    update();
    expect(api.outcome).toBe('won');
  });

  it('mission 7: the final ambush surrounds Galamar with red troops', () => {
    const { state } = run(6);
    expect(kingOf(state, 1)).toMatchObject({ x: 1, y: 1 });
    expect(state.units.filter((unit) => unit.team === 1).length).toBeGreaterThanOrEqual(7);
  });
});
