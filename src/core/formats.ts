// Readers for the original binary resources (big-endian, Java DataInputStream style).
import type { Team, UnitType } from './rules';

class Reader {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  int8(): number {
    return this.view.getInt8(this.offset++);
  }

  int16(): number {
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  int32(): number {
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  utf(): string {
    const length = this.view.getUint16(this.offset);
    this.offset += 2;
    const text = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return text;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }
}

export interface MapUnit {
  type: UnitType;
  team: Team;
  x: number;
  y: number;
}

export interface MapData {
  width: number;
  height: number;
  /** Row-major tile indices: tiles[y * width + x]. */
  tiles: number[];
  units: MapUnit[];
}

/**
 * Map files: int32 width, int32 height, width*height tile bytes stored column by column,
 * an unused int32-counted block, then int32 count × {int8 type+11*team, int16 px, int16 py}
 * where px/py sit on a 16px grid.
 *
 * Mission 6 reuses mission 5's terrain: pass m5 as `terrainSource`.
 */
export function parseMap(bytes: Uint8Array, terrainSource: Uint8Array = bytes): MapData {
  const terrain = new Reader(terrainSource);
  const width = terrain.int32();
  const height = terrain.int32();
  const tiles: number[] = Array.from({ length: width * height }, () => 0);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) tiles[y * width + x] = terrain.int8();
  }

  const reader = terrainSource === bytes ? terrain : new Reader(bytes);
  if (terrainSource !== bytes) {
    reader.int32();
    reader.int32();
  }
  const skipped = reader.int32();
  for (let i = 0; i < skipped; i++) reader.int32();

  const units: MapUnit[] = [];
  const count = reader.int32();
  for (let i = 0; i < count; i++) {
    const code = reader.int8();
    const px = reader.int16();
    const py = reader.int16();
    units.push({
      type: (code % 11) as UnitType,
      team: Math.floor(code / 11) as Team,
      x: Math.floor(Math.floor((px * 24) / 16) / 24),
      y: Math.floor(Math.floor((py * 24) / 16) / 24),
    });
  }
  return { width, height, tiles, units };
}

/** lang.dat: int32 count, then count Java UTF strings. */
export function parseLang(bytes: Uint8Array): string[] {
  const reader = new Reader(bytes);
  const count = reader.int32();
  const strings: string[] = [];
  for (let i = 0; i < count; i++) strings.push(reader.utf());
  return strings;
}
