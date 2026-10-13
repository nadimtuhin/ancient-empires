import { readFileSync } from 'node:fs';
import { attack } from '../../src/core/actions';
import { MISSIONS, MissionApi, startMission } from '../../src/core/missions';
import { UnitType, type Team } from '../../src/core/rules';
import { inBounds, spawnUnit, type GameState, type Unit } from '../../src/core/state';
import { noLuck } from './board';

export const readMap = (name: string) => new Uint8Array(readFileSync(`public/assets/ae1/${name}`));

export const runMission = (index: number) => {
  const api = startMission(index, readMap);
  return { api, state: api.state, update: () => MISSIONS[index].update(api) };
};

/** Kills `victim` through the real attack action: a wyvern of the other team strikes it down. */
export function slay(state: GameState, victim: Unit): void {
  victim.hp = 1;
  const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(
    ([ox, oy]) => inBounds(state, victim.x + ox, victim.y + oy),
  )!;
  const killer = spawnUnit(state, UnitType.Wyvern, (1 - victim.team) as Team, victim.x + dx, victim.y + dy);
  attack(state, killer, victim, noLuck);
}

/** What a real save and load does to a mission: everything goes through JSON. */
export function resumeFromSave(api: MissionApi): MissionApi {
  const saved = JSON.parse(JSON.stringify({ state: api.state, firedBeats: api.firedBeats })) as {
    state: GameState;
    firedBeats: string[];
  };
  return new MissionApi(saved.state, saved.firedBeats);
}
