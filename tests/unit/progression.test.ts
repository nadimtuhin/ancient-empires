import { describe, expect, it } from 'vitest';
import { attack, endTurn, finishUnit } from '../../src/core/actions';
import { UnitType } from '../../src/core/rules';
import { board, noLuck, place } from './board';

// Hand-worked from the original formulas (unit class c):
//   cover  = trunc((terrainDefense + defense) * 2 / 3)
//   damage = trunc((attack - cover) * attackerHp / 10)
//   xp     = (victim attack + victim defense) * damage
//   level thresholds 75, 150, 300; the level cap is 3.
// A wyvern (attack 8) hitting a golem (attack 6, defense 4) on a road (terrain defense 0):
//   cover 2, damage 6, xp 60. The golem is left on 4 hp and counters for trunc((6-2)*4/10) = 1,
//   a wyvern (attack 8, defense 3) victim, so the golem earns (8+3)*1 = 11 xp.
const WYVERN_XP_FROM_GOLEM_HIT = 60;
const GOLEM_XP_FROM_COUNTER = 11;

function wyvernHitsGolem(wyvern: { level?: number; xp?: number } = {}, golem: { xp?: number } = {}) {
  const state = board(['..']);
  state.tiles.fill(18);
  const attacker = place(state, UnitType.Wyvern, 0, 0, 0);
  const defender = place(state, UnitType.Golem, 1, 1, 0);
  Object.assign(attacker, wyvern);
  Object.assign(defender, golem);
  const result = attack(state, attacker, defender, noLuck);
  return { attacker, defender, result };
}

describe('experience', () => {
  it('awards (victim attack + defense) times damage dealt', () => {
    const { attacker } = wyvernHitsGolem();
    expect(attacker.xp).toBe(WYVERN_XP_FROM_GOLEM_HIT);
  });

  it('awards the surviving defender xp for its counter-attack', () => {
    const { defender } = wyvernHitsGolem();
    expect(defender.xp).toBe(GOLEM_XP_FROM_COUNTER);
  });

  it('does not level up one xp short of 75', () => {
    const { attacker, result } = wyvernHitsGolem({ xp: 74 - WYVERN_XP_FROM_GOLEM_HIT });
    expect([attacker.level, attacker.xp, result.leveledUp]).toEqual([0, 74, []]);
  });

  it('levels up from 0 to 1 at exactly 75 xp and resets xp', () => {
    const { attacker, result } = wyvernHitsGolem({ xp: 75 - WYVERN_XP_FROM_GOLEM_HIT });
    expect([attacker.level, attacker.xp, result.leveledUp]).toEqual([1, 0, [attacker.id]]);
  });

  it('needs 150 xp to go from level 1 to 2', () => {
    const below = wyvernHitsGolem({ level: 1, xp: 149 - WYVERN_XP_FROM_GOLEM_HIT }).attacker;
    const exact = wyvernHitsGolem({ level: 1, xp: 150 - WYVERN_XP_FROM_GOLEM_HIT }).attacker;
    expect([below.level, exact.level, exact.xp]).toEqual([1, 2, 0]);
  });

  it('needs 300 xp to go from level 2 to 3', () => {
    const below = wyvernHitsGolem({ level: 2, xp: 299 - WYVERN_XP_FROM_GOLEM_HIT }).attacker;
    const exact = wyvernHitsGolem({ level: 2, xp: 300 - WYVERN_XP_FROM_GOLEM_HIT }).attacker;
    expect([below.level, exact.level, exact.xp]).toEqual([2, 3, 0]);
  });

  it('stops at level 3 and keeps collecting xp', () => {
    const { attacker } = wyvernHitsGolem({ level: 3, xp: 1000 });
    expect([attacker.level, attacker.xp]).toEqual([3, 1000 + WYVERN_XP_FROM_GOLEM_HIT]);
  });

  it('levels up a defender that survives and earns the threshold from its counter', () => {
    const { defender, result } = wyvernHitsGolem({}, { xp: 75 - GOLEM_XP_FROM_COUNTER });
    expect([defender.level, defender.xp, result.leveledUp]).toEqual([1, 0, [defender.id]]);
  });

  it('does not level up a defender that dies', () => {
    const state = board(['..']);
    state.tiles.fill(18);
    const attacker = place(state, UnitType.Wyvern, 0, 0, 0);
    const defender = place(state, UnitType.Soldier, 1, 1, 0);
    defender.xp = 74;
    defender.hp = 1;
    attack(state, attacker, defender, noLuck);
    expect(defender.level).toBe(0);
  });
});

describe('wisp aura', () => {
  // Original: a unit finishing its action refreshes its team; every living same-team unit at
  // distance 1..2 of a wisp gets +1 attack. The wisp itself is excluded and it is not cleared by turns.
  const line = () => {
    const state = board(['.......', '.......']);
    const wisp = place(state, UnitType.Wisp, 0, 0, 0);
    const near = place(state, UnitType.Soldier, 0, 1, 0);
    const edge = place(state, UnitType.Soldier, 0, 2, 0);
    const far = place(state, UnitType.Soldier, 0, 3, 0);
    const enemy = place(state, UnitType.Soldier, 1, 1, 1);
    finishUnit(state, wisp);
    return { state, wisp, near, edge, far, enemy };
  };

  it('buffs friends one and two tiles away', () => {
    const { near, edge } = line();
    expect([near.aura, edge.aura]).toEqual([true, true]);
  });

  it('leaves friends three tiles away alone', () => {
    expect(line().far.aura).toBe(false);
  });

  it('does not buff the wisp itself', () => {
    expect(line().wisp.aura).toBe(false);
  });

  it('does not buff enemies standing next to the wisp', () => {
    expect(line().enemy.aura).toBe(false);
  });

  it('adds exactly 1 damage-relevant attack point against the same target', () => {
    const hit = (aura: boolean) => {
      const state = board(['..']);
      state.tiles.fill(18);
      const attacker = place(state, UnitType.Soldier, 0, 0, 0);
      const defender = place(state, UnitType.Soldier, 1, 1, 0);
      attacker.aura = aura;
      return attack(state, attacker, defender, noLuck).blows[0].damage;
    };
    // soldier 5 vs soldier 1 on road: cover 0, damage 5; with aura attack 6, damage 6.
    expect([hit(false), hit(true)]).toEqual([5, 6]);
  });

  it('stays on through end of turn while the wisp keeps still', () => {
    const { state, near } = line();
    endTurn(state);
    endTurn(state);
    expect(near.aura).toBe(true);
  });

  it('drops once the wisp has moved out of range and a friend finishes', () => {
    const { state, wisp, near } = line();
    wisp.x = 6;
    finishUnit(state, near);
    expect(near.aura).toBe(false);
  });

  it('drops when the wisp is killed', () => {
    const { state, wisp, near } = line();
    const killer = place(state, UnitType.Wyvern, 1, 0, 1);
    state.tiles.fill(18);
    wisp.hp = 1;
    attack(state, killer, wisp, noLuck);
    expect(near.aura).toBe(false);
  });
});
