import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLang, parseMap } from '../../src/core/formats';

// Expected values were cross-checked against an independent Python parser of the same files.
const asset = (name: string) => new Uint8Array(readFileSync(`public/assets/ae1/${name}`));

describe('parseMap', () => {
  it('reads the first campaign map with its column-major tiles and units', () => {
    const map = parseMap(asset('m0'));
    expect([map.width, map.height]).toEqual([10, 10]);
    expect(map.tiles.slice(0, 10)).toEqual([6, 6, 6, 6, 6, 1, 2, 2, 0, 0]);
    expect(map.tiles[2 * 10 + 0]).toBe(26); // blue town at (0,2)
    expect(map.tiles[9 * 10 + 8]).toBe(24); // neutral castle at (8,9)
    expect(map.units).toEqual([
      { type: 0, team: 0, x: 1, y: 0 },
      { type: 9, team: 0, x: 0, y: 1 },
      { type: 1, team: 0, x: 2, y: 1 },
    ]);
  });

  it('builds mission 6 from mission 5 terrain plus its own units', () => {
    const map = parseMap(asset('m6'), asset('m5'));
    expect([map.width, map.height]).toEqual([14, 15]);
    expect(map.tiles.slice(0, 14)).toEqual([1, 1, 6, 1, 1, 6, 6, 6, 9, 21, 8, 1, 18, 23]);
    expect(map.units).toHaveLength(5);
    expect(map.units[1]).toEqual({ type: 9, team: 0, x: 10, y: 13 });
  });

  it('reads both kings of a skirmish map', () => {
    const map = parseMap(asset('s0'));
    expect(map.units).toEqual([
      { type: 9, team: 0, x: 1, y: 13 },
      { type: 9, team: 1, x: 13, y: 1 },
    ]);
  });
});

describe('parseLang', () => {
  it('reads all 138 strings in order', () => {
    const lang = parseLang(asset('lang.dat'));
    expect(lang).toHaveLength(138);
    expect(lang[27]).toBe('MOVE');
    expect(lang.slice(63, 66)).toEqual(['SOLDIER', 'ARCHER', 'LIZARD']);
  });
});
