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
