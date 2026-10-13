import { describe, expect, it } from 'vitest';
import { occupy } from '../../src/core/actions';
import { MISSIONS, MissionApi } from '../../src/core/missions';
import { kingOf } from '../../src/core/state';
import { resumeFromSave, runMission, slay } from './campaign';

// Mission index 1 has one-shot beats: lizards-in-trouble, then spiders (with reinforcements).
const playToSpiders = () => {
  const run = runMission(1);
  for (const [unit, x, y] of [[run.state.units[1], 9, 12], [run.state.units[2], 11, 13]] as const) {
    Object.assign(unit, { x, y });
    occupy(run.state, unit);
  }
  run.update();
  Object.assign(kingOf(run.state, 0)!, { x: 11, y: 4, status: 'done' });
  run.update();
  return run;
};

describe('resuming a saved campaign mission', () => {
  it('does not replay dialogue for beats that already fired', () => {
    const resumed = resumeFromSave(playToSpiders().api);
    MISSIONS[1].update(resumed);
    expect(resumed.dialogue).toEqual([]);
  });

  it('does not respawn reinforcements for beats that already fired', () => {
    const run = playToSpiders();
    const before = run.state.units.length;
    const resumed = resumeFromSave(run.api);
    MISSIONS[1].update(resumed);
    expect(resumed.state.units).toHaveLength(before);
  });

  it('remembers the fired beats across the JSON round-trip', () => {
    const { api } = playToSpiders();
    expect(resumeFromSave(api).firedBeats.sort()).toEqual(api.firedBeats.sort());
  });

  it('still finishes the mission: killing the spiders after a resume wins', () => {
    const resumed = resumeFromSave(playToSpiders().api);
    for (const spider of resumed.state.units.filter((unit) => unit.team === 1)) slay(resumed.state, spider);
    MISSIONS[1].update(resumed);
    expect(resumed.outcome).toBe('won');
  });

  it('would replay the beats if the fired list were lost (control for the tests above)', () => {
    const run = playToSpiders();
    const forgetful = new MissionApi(JSON.parse(JSON.stringify(run.state)));
    MISSIONS[1].update(forgetful);
    expect(forgetful.dialogue.length).toBeGreaterThan(0);
  });
});
