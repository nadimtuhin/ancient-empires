import { describe, expect, it, test } from 'vitest';
import { occupy } from '../../src/core/actions';
import { Speaker } from '../../src/core/missions';
import { UnitType } from '../../src/core/rules';
import { isAlive, kingOf, unitAt } from '../../src/core/state';
import { runMission, slay } from './campaign';

// Win/lose rules below were read from the original's mission step machine (class i, F == 1, 4, 5):
// a mission is lost the moment Galamar (unit slot 0) becomes a tombstone, and the won/lost
// conditions per mission are cited on each describe block.

describe('mission 1 (index 0): regroup', () => {
  it('is lost, not won, when a soldier falls on the turn Galamar takes the castle', () => {
    const run = runMission(0);
    const galamar = kingOf(run.state, 0)!;
    Object.assign(galamar, { x: 8, y: 9 });
    occupy(run.state, galamar);
    const soldier = unitAt(run.state, 1, 0)!;
    expect(soldier.team).toBe(0);
    slay(run.state, soldier);
    run.update();
    expect(run.api.outcome).toBe('lost');
  });
});

describe('mission 3 (index 2): escort', () => {
  it('is lost, not won, when the Lizard Chief falls as Galamar reaches the tower', () => {
    const run = runMission(2);
    slay(run.state, run.state.units.find((unit) => unit.title === 'Lizard Chief')!);
    Object.assign(kingOf(run.state, 0)!, { x: 1, y: 13 });
    run.update();
    expect(run.api.outcome).toBe('lost');
  });
});

describe('mission 2 (index 1): friends and enemies', () => {
  const takeBothVillages = (state: ReturnType<typeof runMission>['state']) => {
    const [, first, second] = state.units;
    Object.assign(first, { x: 9, y: 12 });
    occupy(state, first);
    Object.assign(second, { x: 11, y: 13 });
    occupy(state, second);
  };

  const triggerSpiders = (run: ReturnType<typeof runMission>) => {
    takeBothVillages(run.state);
    run.update();
    Object.assign(kingOf(run.state, 0)!, { x: 11, y: 4, status: 'done' });
    run.update();
  };

  it('starts with no enemies on the map and the briefing line only', () => {
    const { api, state } = runMission(1);
    expect(state.units.filter((unit) => unit.team === 1)).toHaveLength(0);
    expect(api.dialogue).toEqual([{ speaker: Speaker.Galamar, textIndex: 115 }]);
  });

  it('plays the lizards-in-trouble dialogue once both villages are taken', () => {
    const { api, state, update } = runMission(1);
    takeBothVillages(state);
    update();
    expect(api.dialogue.slice(1)).toEqual([
      { speaker: Speaker.Captain, textIndex: 116 },
      { speaker: Speaker.Galamar, textIndex: 117 },
    ]);
  });

  it('does not play the lizards dialogue with only one village taken', () => {
    const { api, state, update } = runMission(1);
    Object.assign(state.units[1], { x: 9, y: 12 });
    occupy(state, state.units[1]);
    update();
    expect(api.dialogue).toHaveLength(1);
  });

  it('springs the spiders at (4,0) (1,1) (1,5) and brings two lizard allies when Galamar reaches the north-east', () => {
    const run = runMission(1);
    triggerSpiders(run);
    for (const [x, y] of [[4, 0], [1, 1], [1, 5]]) {
      expect(unitAt(run.state, x, y)).toMatchObject({ type: UnitType.Spider, team: 1 });
    }
    expect(unitAt(run.state, 9, 2)).toMatchObject({ type: UnitType.Lizard, team: 0 });
    expect(unitAt(run.state, 10, 1)).toMatchObject({ type: UnitType.Lizard, team: 0 });
    expect(run.api.dialogue.slice(-3).map((line) => line.textIndex)).toEqual([118, 119, 120]);
  });

  it('does not spring the spiders while Galamar is still south of row 4', () => {
    const run = runMission(1);
    takeBothVillages(run.state);
    Object.assign(kingOf(run.state, 0)!, { x: 11, y: 5, status: 'done' });
    run.update();
    expect(run.state.units.filter((unit) => unit.team === 1)).toHaveLength(0);
  });

  test('does not spring the spiders while Galamar is still ready to move', () => {
    const run = runMission(1);
    takeBothVillages(run.state);
    run.update();
    const galamar = kingOf(run.state, 0)!;
    Object.assign(galamar, { x: 11, y: 4, status: 'ready' });
    run.update();
    expect(run.state.units.filter((unit) => unit.team === 1)).toHaveLength(0);
  });

  it('is won when every spider is dead', () => {
    const run = runMission(1);
    triggerSpiders(run);
    for (const spider of run.state.units.filter((unit) => unit.team === 1)) slay(run.state, spider);
    run.update();
    expect(run.api.outcome).toBe('won');
  });

  it('is not won while one spider is still alive', () => {
    const run = runMission(1);
    triggerSpiders(run);
    const [survivor, ...doomed] = run.state.units.filter((unit) => unit.team === 1);
    for (const spider of doomed) slay(run.state, spider);
    run.update();
    expect(isAlive(survivor)).toBe(true);
    expect(run.api.outcome).toBeNull();
  });

  it('is not won before the spiders have appeared, even with no enemy on the map', () => {
    const run = runMission(1);
    run.update();
    expect(run.api.outcome).toBeNull();
  });

  it('is lost, not won, when Galamar falls after the spiders are dead', () => {
    const run = runMission(1);
    triggerSpiders(run);
    for (const spider of run.state.units.filter((unit) => unit.team === 1)) slay(run.state, spider);
    slay(run.state, kingOf(run.state, 0)!);
    // slay() leaves its red killer standing; clear it so the red army really is gone.
    run.state.units = run.state.units.filter((unit) => !(unit.team === 1 && isAlive(unit)));
    run.update();
    expect(run.api.outcome).toBe('lost');
  });
});

describe('mission 5 (index 4): wyvern rescue', () => {
  it('opens with the captain explaining the camp', () => {
    expect(runMission(4).api.dialogue).toEqual([
      { speaker: Speaker.Captain, textIndex: 128 },
      { speaker: Speaker.Captain, textIndex: 129 },
    ]);
  });

  it('is won when the enemy king dies, and a wyvern joins at (2,2)', () => {
    const run = runMission(4);
    const enemyKing = kingOf(run.state, 1)!;
    expect([enemyKing.x, enemyKing.y]).toEqual([2, 2]);
    slay(run.state, enemyKing);
    run.update();
    expect(run.api.outcome).toBe('won');
    expect(unitAt(run.state, 2, 2)).toMatchObject({ type: UnitType.Wyvern, team: 0 });
    expect(run.api.dialogue.at(-1)).toEqual({ speaker: Speaker.Captain, textIndex: 130 });
  });

  it('frees only one wyvern even when updated again', () => {
    const run = runMission(4);
    slay(run.state, kingOf(run.state, 1)!);
    run.update();
    run.update();
    expect(run.state.units.filter((unit) => unit.type === UnitType.Wyvern && unit.team === 0 && unit.x === 2 && unit.y === 2)).toHaveLength(1);
    expect(run.api.dialogue.filter((line) => line.textIndex === 130)).toHaveLength(1);
  });

  it('is not won by killing a common soldier', () => {
    const run = runMission(4);
    const grunt = run.state.units.find((unit) => unit.team === 1 && unit.type === UnitType.Soldier)!;
    slay(run.state, grunt);
    run.update();
    expect(run.api.outcome).toBeNull();
  });

});

describe('mission 6 (index 5): the siege', () => {
  it('opens with the captain and Galamar talking, enemy king at the far corner', () => {
    const { api, state } = runMission(5);
    expect(api.dialogue).toEqual([
      { speaker: Speaker.Captain, textIndex: 131 },
      { speaker: Speaker.Galamar, textIndex: 132 },
    ]);
    expect(kingOf(state, 1)).toMatchObject({ x: 13, y: 13 });
  });

  it('is won when the enemy king dies', () => {
    const run = runMission(5);
    slay(run.state, kingOf(run.state, 1)!);
    run.update();
    expect(run.api.outcome).toBe('won');
  });

  it('is not won by killing the rest of the enemy army while the king lives', () => {
    const run = runMission(5);
    for (const grunt of run.state.units.filter((unit) => unit.team === 1 && unit.type !== UnitType.King)) {
      slay(run.state, grunt);
    }
    run.update();
    expect(isAlive(kingOf(run.state, 1)!)).toBe(true);
    expect(run.api.outcome).toBeNull();
  });

  it('starts with the 10 units placed on the siege map, no scripted ambush', () => {
    const { state } = runMission(5);
    expect(state.units).toHaveLength(10);
  });
});

describe('every mission with Galamar on the field', () => {
  it.each([
    ['mission 2', 1],
    ['mission 3', 2],
    ['mission 4', 3],
    ['mission 5', 4],
    ['mission 6', 5],
    ['mission 7', 6],
  ])('%s is lost when Galamar is struck down', (_name, index) => {
    const run = runMission(index);
    slay(run.state, kingOf(run.state, 0)!);
    run.update();
    expect(run.api.outcome).toBe('lost');
  });
});
