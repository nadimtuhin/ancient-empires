import type { Point } from '../core/movement';
import { FIRST_BUILDING_TILE, MAX_HP, Terrain, buildingOwner, isBuildingTile } from '../core/rules';
import { terrainAt, type GameState, type Unit } from '../core/state';
import type { Tint } from './palette';
import { TILE, type Sprites } from './sprites';

export interface Floater {
  x: number;
  y: number;
  text: string;
  start: number;
}

export interface Walk {
  unitId: number;
  path: Point[];
  start: number;
  msPerStep: number;
}

/** Everything drawn on top of the bare game state. */
export interface BoardView {
  cursor: Point | null;
  reach: ReadonlySet<number>;
  targets: ReadonlySet<number>;
  walk: Walk | null;
  floaters: Floater[];
}

export const FLOATER_MS = 700;
const OWNER_TINT: Tint[] = ['blue', 'red'];
const tintOf = (owner: 0 | 1 | null): Tint => (owner === null ? 'grey' : OWNER_TINT[owner]);

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly terrainCache = document.createElement('canvas');
  private cachedTiles: number[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, private readonly sprites: Sprites) {
    this.context = canvas.getContext('2d')!;
  }

  draw(state: GameState, view: BoardView, now: number): void {
    const { context } = this;
    if (this.canvas.width !== state.width * TILE || this.canvas.height !== state.height * TILE) {
      this.canvas.width = state.width * TILE;
      this.canvas.height = state.height * TILE;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(this.terrainLayer(state), 0, 0);

    this.shade(state, view.reach, 'rgb(255 255 255 / 0.28)');
    this.shade(state, view.targets, 'rgb(230 40 30 / 0.45)');

    for (const unit of state.units) {
      if (unit.status === 'tombstone') context.drawImage(this.sprites.tombstone, unit.x * TILE, unit.y * TILE);
    }
    for (const unit of state.units) {
      if (unit.status !== 'tombstone') this.drawUnit(unit, this.positionOf(unit, view.walk, now));
    }
    if (view.cursor) context.drawImage(this.sprites.cursor, view.cursor.x * TILE - 1, view.cursor.y * TILE - 1);
    this.drawFloaters(view.floaters, now);
  }

  /** Terrain only changes on capture, so it is painted once and reused. */
  private terrainLayer(state: GameState): HTMLCanvasElement {
    const unchanged =
      this.cachedTiles.length === state.tiles.length && this.cachedTiles.every((tile, index) => tile === state.tiles[index]);
    if (unchanged) return this.terrainCache;

    this.cachedTiles = [...state.tiles];
    this.terrainCache.width = state.width * TILE;
    this.terrainCache.height = state.height * TILE;
    const context = this.terrainCache.getContext('2d')!;
    const castleTops: Array<[number, number, number]> = [];
    state.tiles.forEach((tile, index) => {
      const x = (index % state.width) * TILE;
      const y = Math.floor(index / state.width) * TILE;
      if (!isBuildingTile(tile)) {
        context.drawImage(this.sprites.terrain[tile] ?? this.sprites.terrain[3], x, y);
        return;
      }
      context.drawImage(this.sprites.terrain[3], x, y);
      this.drawBuilding(context, tile, x, y);
      if (terrainAt(state, x / TILE, y / TILE) === Terrain.Castle && y > 0) castleTops.push([tile + 1, x, y - TILE]);
    });
    for (const [tile, x, y] of castleTops) this.drawBuilding(context, tile, x, y);
    return this.terrainCache;
  }

  private drawBuilding(context: CanvasRenderingContext2D, tile: number, x: number, y: number): void {
    const frame = (tile - FIRST_BUILDING_TILE) % 3;
    const sheet = this.sprites.buildings[tintOf(buildingOwner(tile))];
    context.drawImage(sheet, frame * TILE, 0, TILE, TILE, x, y, TILE, TILE);
  }

  private shade(state: GameState, keys: ReadonlySet<number>, colour: string): void {
    this.context.fillStyle = colour;
    for (const key of keys) {
      this.context.fillRect((key % state.width) * TILE, Math.floor(key / state.width) * TILE, TILE, TILE);
    }
  }

  private positionOf(unit: Unit, walk: Walk | null, now: number): Point {
    if (!walk || walk.unitId !== unit.id || walk.path.length < 2) return unit;
    const progress = Math.max(0, (now - walk.start) / walk.msPerStep);
    const step = Math.min(Math.floor(progress), walk.path.length - 1);
    const from = walk.path[step];
    const to = walk.path[Math.min(step + 1, walk.path.length - 1)];
    const t = progress - step;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  private drawUnit(unit: Unit, at: Point): void {
    const { context } = this;
    const x = Math.round(at.x * TILE);
    const y = Math.round(at.y * TILE);
    const sheet = this.sprites.units[unit.status === 'done' ? 'grey' : OWNER_TINT[unit.team]];
    context.drawImage(sheet, unit.type * TILE, 0, TILE, TILE, x, y, TILE, TILE);

    const icons = [unit.poisoned && 0, unit.aura && 1, unit.level > 0 && 2].filter((icon) => icon !== false);
    icons.forEach((icon, slot) => context.drawImage(this.sprites.status, icon * 15, 0, 15, 15, x + TILE - 9, y + slot * 8, 9, 9));
    if (unit.hp < MAX_HP) this.label(String(unit.hp), x + 1, y + TILE - 1, '#fff');
  }

  private label(text: string, x: number, y: number, colour: string): void {
    const { context } = this;
    context.font = 'bold 9px monospace';
    context.textBaseline = 'bottom';
    context.lineWidth = 3;
    context.strokeStyle = '#000';
    context.strokeText(text, x, y);
    context.fillStyle = colour;
    context.fillText(text, x, y);
  }

  private drawFloaters(floaters: Floater[], now: number): void {
    for (const floater of floaters) {
      const rise = Math.min(1, (now - floater.start) / FLOATER_MS) * 10;
      this.label(floater.text, floater.x * TILE + 5, floater.y * TILE + 14 - rise, '#ffd23f');
    }
  }
}
