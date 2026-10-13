import { attack, buy, finishUnit, moveUnit, occupy, raise } from './actions';
import type { AiPlan } from './ai';
import type { FightResult } from './combat';
import type { Rng } from './rng';
import { kingOf, type GameState, type Unit } from './state';
import type { Team } from './rules';

export type PlanOutcome =
  | { kind: 'bought'; unit: Unit }
  | { kind: 'fought'; attacker: Unit; defender: Unit; result: FightResult }
  | { kind: 'done'; unit: Unit };

const byId = (state: GameState, id: number): Unit => {
  const unit = state.units.find((candidate) => candidate.id === id);
  if (!unit) throw new Error(`unit ${id} is gone`);
  return unit;
};

/** Carries out one AI decision: walk, then act. */
export function applyPlan(state: GameState, plan: AiPlan, rng: Rng): PlanOutcome {
  if (plan.kind === 'buy') return { kind: 'bought', unit: buy(state, byId(state, plan.kingId), plan.type) };

  const unit = byId(state, plan.unitId);
  if (plan.to.x !== unit.x || plan.to.y !== unit.y) moveUnit(state, unit, plan.to.x, plan.to.y);
  const { action } = plan;
  switch (action.kind) {
    case 'attack': {
      const defender = byId(state, action.targetId);
      return { kind: 'fought', attacker: unit, defender, result: attack(state, unit, defender, rng) };
    }
    case 'raise':
      raise(state, unit, byId(state, action.tombstoneId));
      break;
    case 'occupy':
      occupy(state, unit);
      break;
    case 'wait':
      finishUnit(state, unit);
      break;
  }
  return { kind: 'done', unit };
}

/** Skirmish ends when a king falls; the other team wins. */
export function skirmishWinner(state: GameState): Team | null {
  for (const team of [0, 1] as const) {
    const king = kingOf(state, team);
    if (!king || king.status === 'tombstone') return (1 - team) as Team;
  }
  return null;
}
