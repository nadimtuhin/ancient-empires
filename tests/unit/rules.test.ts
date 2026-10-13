import { describe, expect, it } from 'vitest';
import {
  attack, availableActions, buy, endTurn, incomeOf, moveUnit, occupy, raise,
} from '../../src/core/actions';
import { rollBonus } from '../../src/core/combat';
import { reachableTiles, pathTo } from '../../src/core/movement';
import { UnitType } from '../../src/core/rules';
import { board, noLuck, place } from './board';

const reachable = (state: ReturnType<typeof board>, unit: Parameters<typeof reachableTiles>[1]) =>
  [...reachableTiles(state, unit).keys()].map((key) => [key % state.width, Math.floor(key / state.width)]);

describe('movement', () => {
  it('lets a soldier walk 4 grass tiles but not 5', () => {
    const state = board(['......']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    expect(reachable(state, soldier)).toContainEqual([4, 0]);
    expect(reachable(state, soldier)).not.toContainEqual([5, 0]);
  });

  it('charges 2 for woods and 3 for mountains', () => {
    const state = board(['.ffm.']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    expect(reachable(state, soldier)).toContainEqual([2, 0]); // 2 + 2 = 4
    expect(reachable(state, soldier)).not.toContainEqual([3, 0]); // would need 7
  });

  it('walks through friends without stopping on them, and never through enemies', () => {
    const state = board(['.....', '.....']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    place(state, UnitType.Archer, 0, 1, 0);
    place(state, UnitType.Golem, 1, 1, 1);
    const tiles = reachable(state, soldier);
    expect(tiles).toContainEqual([2, 0]);
    expect(tiles).not.toContainEqual([1, 0]);
    expect(tiles).not.toContainEqual([1, 1]);
  });

  it('gives lizards cheap water and wyverns free flight over mountains', () => {
    const state = board(['~~~~~~~', 'mmmmmmm']);
    const lizard = place(state, UnitType.Lizard, 0, 0, 0);
    const wyvern = place(state, UnitType.Wyvern, 0, 0, 1);
    expect(reachable(state, lizard)).toContainEqual([6, 0]);
    expect(reachable(state, wyvern)).toContainEqual([6, 1]);
  });

  it('finds a path that goes around expensive terrain', () => {
    const state = board(['.m.', '...']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    expect(pathTo(state, soldier, { x: 2, y: 0 })).toEqual([
      { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 },
    ]);
  });
});

describe('combat', () => {
  it('turns extreme dice rolls into small bonuses, helped by level', () => {
    const roll = (magnitude: number, negative: boolean) => {
      const values = [magnitude, negative ? 1 : 0];
      return () => values.shift()!;
    };
    expect(rollBonus(roll(19, false), 0)).toBe(2);
    expect(rollBonus(roll(16, false), 0)).toBe(1);
    expect(rollBonus(roll(15, false), 1)).toBe(1);
    expect(rollBonus(roll(17, true), 0)).toBe(-1);
    expect(rollBonus(roll(19, true), 0)).toBe(-2);
    expect(rollBonus(roll(10, false), 0)).toBe(0);
  });

  it('soldier vs soldier on grass: 4 damage, then a weakened counter of 2', () => {
    const state = board(['..']);
    const attacker = place(state, UnitType.Soldier, 0, 0, 0);
    const defender = place(state, UnitType.Soldier, 1, 1, 0);
    const result = attack(state, attacker, defender, noLuck);
    // (5 - (1 grass + 1 def) * 2 / 3) * 10 / 10 = 4; counter: (5 - 1) * 6 / 10 = 2
    expect(result.blows.map((blow) => blow.damage)).toEqual([4, 2]);
    expect([attacker.hp, defender.hp]).toEqual([8, 6]);
    expect(attacker.xp).toBe(24); // (5 atk + 1 def) * 4 damage
    expect(attacker.status).toBe('done');
  });

  it('archers hit flying units harder', () => {
    const state = board(['...']);
    const archer = place(state, UnitType.Archer, 0, 0, 0);
    const wyvern = place(state, UnitType.Wyvern, 1, 2, 0);
    attack(state, archer, wyvern, noLuck);
    // (5 + 2 - (1 + 3) * 2 / 3) = 5; no counter at range 2
    expect(wyvern.hp).toBe(5);
    expect(archer.hp).toBe(10);
  });

  it('catapults cannot attack after moving and never counter', () => {
    const state = board(['......']);
    const catapult = place(state, UnitType.Catapult, 0, 0, 0);
    const soldier = place(state, UnitType.Soldier, 1, 3, 0);
    expect(availableActions(state, catapult, false)).toContain('attack');
    moveUnit(state, catapult, 1, 0);
    expect(availableActions(state, catapult, true)).not.toContain('attack');

    const adjacent = board(['..']);
    const victim = place(adjacent, UnitType.Catapult, 1, 0, 0);
    const hitter = place(adjacent, UnitType.Soldier, 0, 1, 0);
    expect(attack(adjacent, hitter, victim, noLuck).blows).toHaveLength(1);
    expect(soldier.hp).toBe(10);
  });

  it('leaves a tombstone that a wizard can raise as a skeleton', () => {
    const state = board(['...']);
    const golem = place(state, UnitType.Golem, 0, 0, 0);
    const victim = place(state, UnitType.Soldier, 1, 1, 0);
    victim.hp = 1;
    attack(state, golem, victim, noLuck);
    expect(victim.status).toBe('tombstone');

    const wizard = place(state, UnitType.Wizard, 0, 2, 0);
    expect(availableActions(state, wizard, false)).toContain('raise');
    const skeleton = raise(state, wizard, victim);
    expect(skeleton).toMatchObject({ type: UnitType.Skeleton, team: 0, x: 1, y: 0, status: 'done' });
  });

  it('spider poison weakens the victim for exactly one of its turns', () => {
    const state = board(['......']);
    const spider = place(state, UnitType.Spider, 0, 0, 0);
    const golem = place(state, UnitType.Golem, 1, 1, 0);
    attack(state, spider, golem, noLuck);
    expect(golem.poisoned).toBe(true);
    endTurn(state); // red's turn: still poisoned, moves 3 instead of 4
    expect(reachable(state, golem)).not.toContainEqual([5, 0]);
    expect(golem.poisoned).toBe(true);
    endTurn(state); // back to blue: poison wears off
    expect(golem.poisoned).toBe(false);
  });
});

describe('economy and buildings', () => {
  it('soldiers occupy towns; income is 30 per town and 50 per castle', () => {
    const state = board(['tB.']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    expect(incomeOf(state, 0)).toBe(50);
    expect(availableActions(state, soldier, false)).toContain('occupy');
    occupy(state, soldier);
    expect(incomeOf(state, 0)).toBe(80);
  });

  it('only kings take castles', () => {
    const state = board(['c.']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    expect(availableActions(state, soldier, false)).not.toContain('occupy');
  });

  it('kings buy units from their own castle, paying the price', () => {
    const state = board(['B.', 'R.'], 1000);
    const king = place(state, UnitType.King, 0, 0, 0);
    expect(availableActions(state, king, false)).toContain('buy');
    const archer = buy(state, king, UnitType.Archer);
    expect(state.gold[0]).toBe(750);
    expect(archer).toMatchObject({ x: 0, y: 0, team: 0, status: 'ready' });
    expect(king.status).toBe('done');

    const redKing = place(state, UnitType.King, 1, 0, 1);
    state.gold[1] = 999;
    expect(() => buy(state, redKing, UnitType.Wyvern)).toThrow('not enough gold');
  });

  it('heals 2 HP on own buildings and pays income at the start of a turn', () => {
    const state = board(['b.', 'r.']);
    const soldier = place(state, UnitType.Soldier, 0, 0, 0);
    place(state, UnitType.Soldier, 1, 1, 1);
    soldier.hp = 5;
    endTurn(state);
    expect(state.gold[1]).toBe(30);
    endTurn(state);
    expect(soldier.hp).toBe(7);
    expect(state.gold[0]).toBe(30);
  });

  it('tombstones crumble after three half-turns', () => {
    const state = board(['...']);
    place(state, UnitType.Golem, 0, 0, 0);
    place(state, UnitType.Golem, 1, 2, 0); // red needs someone alive, or its turns are skipped
    const victim = place(state, UnitType.Soldier, 1, 1, 0);
    victim.hp = 0;
    victim.status = 'tombstone';
    endTurn(state);
    endTurn(state);
    expect(state.units).toContain(victim);
    endTurn(state);
    expect(state.units).not.toContain(victim);
  });
});
