import { loadImage, tinted } from './assets';
import type { Tint } from './palette';

export const TILE = 24;
const TERRAIN_FRAMES = 23;

export type Sprite = HTMLImageElement | HTMLCanvasElement;

export interface Sprites {
  terrain: Sprite[];
  /** Strip of town, castle and castle top, per owner: neutral grey, blue, red. */
  buildings: Record<Tint, Sprite>;
  /** 11 unit types across, 2 animation rows; done units use the grey copy. */
  units: Record<Tint, Sprite>;
  tombstone: Sprite;
  cursor: Sprite;
  /** Poison, aura, level star. */
  status: Sprite;
  portraits: Sprite;
  splash: Sprite;
}

export async function loadSprites(): Promise<Sprites> {
  const frame = (index: number) => `tiles0_${String(index).padStart(2, '0')}.png`;
  const [terrain, buildings, units, tombstone, cursor, status, portraits, splash] = await Promise.all([
    Promise.all(Array.from({ length: TERRAIN_FRAMES }, (_, index) => loadImage(frame(index)))),
    loadImage('buildings.png'),
    loadImage('unit_icons.png'),
    loadImage('tombstone.png'),
    loadImage('cursor_00.png'),
    loadImage('status.png'),
    loadImage('portrait.png'),
    loadImage('splash.png'),
  ]);
  return {
    terrain,
    buildings: { blue: buildings, red: tinted(buildings, 'red'), grey: tinted(buildings, 'grey') },
    units: { blue: units, red: tinted(units, 'red'), grey: tinted(units, 'grey') },
    tombstone,
    cursor,
    status,
    portraits,
    splash,
  };
}
