import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endTurn } from '../../src/core/actions';
import { nextAiPlan } from '../../src/core/ai';
import { parseMap } from '../../src/core/formats';
import { applyPlan, skirmishWinner } from '../../src/core/plans';
import { seededRng } from '../../src/core/rng';
import { UnitType } from '../../src/core/rules';
import { createGame } from '../../src/core/state';
import { board, noLuck, place } from './board';

describe('computer player', () => {
  it('attacks a wounded enemy in reach instead of idling', () => {
    const state = board(['.....']);
    const golem = place(state, UnitType.Golem, 1, 4, 0);
    const victim = place(state, UnitType.Archer, 0, 0, 0);
    victim.hp = 3;
    state.current = 1;
    const plan = nextAiPlan(state, 1, noLuck);
    expect(plan).toMatchObject({ kind: 'act', unitId: golem.id, action: { kind: 'attack', targetId: victim.id } });
  });

  it('has its king buy a soldier first, then marches the recruit off the castle', () => {
    const state = board(['R..', '...'], 400);
    const king = place(state, UnitType.King, 1, 0, 0);
    state.current = 1;
    const purchase = nextAiPlan(state, 1, noLuck);
    expect(purchase).toEqual({ kind: 'buy', kingId: king.id, type: UnitType.Soldier });

    applyPlan(state, purchase!, noLuck);
    const recruitMove = nextAiPlan(state, 1, noLuck);
    expect(recruitMove).toMatchObject({ kind: 'act' });
    if (recruitMove?.kind === 'act') expect(recruitMove.to).not.toEqual({ x: 0, y: 0 });
  });

  it('says its turn is over once everyone has acted', () => {
    const state = board(['..']);
    const soldier = place(state, UnitType.Soldier, 1, 0, 0);
    soldier.status = 'done';
    expect(nextAiPlan(state, 1, noLuck)).toBeNull();
  });

  it('plays a whole skirmish on Island Cross against itself to a finish', () => {
    const state = createGame(parseMap(new Uint8Array(readFileSync('public/assets/ae1/s0'))), { gold: 1000 });
    const rng = seededRng(7);
    let halfTurns = 0;
    while (skirmishWinner(state) === null && halfTurns < 400) {
      let plan = nextAiPlan(state, state.current, rng);
      for (let actions = 0; plan && actions < 100; actions++) {
        applyPlan(state, plan, rng);
        if (skirmishWinner(state) !== null) break;
        plan = nextAiPlan(state, state.current, rng);
      }
      endTurn(state);
      halfTurns++;
    }
    expect(skirmishWinner(state)).not.toBeNull();
    expect(state.units.filter((unit) => unit.type === UnitType.Soldier).length).toBeGreaterThan(0);
  });
});
