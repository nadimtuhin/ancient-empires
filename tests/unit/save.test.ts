import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { board } from './board';
import { readSave, writeSave, type SavedBattle } from '../../src/ui/save';

const KEY = 'ae1.save';

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

const battle = (): SavedBattle => ({
  version: 1,
  mission: 3,
  map: 'map3.map',
  firedBeats: ['intro'],
  players: ['human', 'cpu'],
  state: board(['..t', '.f.']),
});

const stored = (patch: (save: Record<string, unknown>) => void): void => {
  const save = JSON.parse(JSON.stringify(battle())) as Record<string, unknown>;
  patch(save);
  storage.set(KEY, JSON.stringify(save));
};

describe('readSave', () => {
  it('returns null when nothing was saved', () => {
    expect(readSave()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    storage.set(KEY, '{"version":1,');
    expect(readSave()).toBeNull();
  });

  it('returns null for a save from another version', () => {
    stored((save) => (save.version = 2));
    expect(readSave()).toBeNull();
  });

  it('returns null when the tile count does not match the map size', () => {
    stored((save) => ((save.state as { tiles: number[] }).tiles = [3, 3, 3]));
    expect(readSave()).toBeNull();
  });

  it.each(['players', 'firedBeats'])('returns null when %s is missing', (field) => {
    stored((save) => delete save[field]);
    expect(readSave()).toBeNull();
  });

  it.each(['tiles', 'units'])('returns null when state.%s is missing', (field) => {
    stored((save) => delete (save.state as Record<string, unknown>)[field]);
    expect(readSave()).toBeNull();
  });

  // Continue would crash on these, and the broken save would offer Continue again on every visit.
  it.each([
    ['a mission past the last one', (save: Record<string, unknown>) => (save.mission = 7)],
    ['a negative mission', (save: Record<string, unknown>) => (save.mission = -1)],
    ['a fractional mission', (save: Record<string, unknown>) => (save.mission = 1.5)],
    ['an unknown player kind', (save: Record<string, unknown>) => (save.players = ['human', 'robot'])],
    ['a single player', (save: Record<string, unknown>) => (save.players = ['human'])],
    ['a skirmish without a map name', (save: Record<string, unknown>) => Object.assign(save, { mission: null, map: 7 })],
    ['a current team other than 0 or 1', (save: Record<string, unknown>) => ((save.state as { current: number }).current = 2)],
    ['gold that is not a pair of numbers', (save: Record<string, unknown>) => ((save.state as { gold: unknown }).gold = 5)],
  ])('returns null for %s', (_, patch) => {
    stored(patch);
    expect(readSave()).toBeNull();
  });

  it('accepts a skirmish save (mission null)', () => {
    stored((save) => Object.assign(save, { mission: null, map: 's0' }));
    expect(readSave()?.mission).toBeNull();
  });

  it('returns null when state is missing', () => {
    stored((save) => delete save.state);
    expect(readSave()).toBeNull();
  });

  it('returns exactly what writeSave stored', () => {
    const save = battle();
    writeSave(save);
    expect(readSave()).toEqual(JSON.parse(JSON.stringify(save)));
  });
});
