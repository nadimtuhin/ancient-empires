// Numbers below come straight from the original J2ME game (unit class c, game class i).

export type Team = 0 | 1;

export const UnitType = {
  Soldier: 0,
  Archer: 1,
  Lizard: 2,
  Wizard: 3,
  Wisp: 4,
  Spider: 5,
  Golem: 6,
  Catapult: 7,
  Wyvern: 8,
  King: 9,
  Skeleton: 10,
} as const;
export type UnitType = (typeof UnitType)[keyof typeof UnitType];

export interface UnitStats {
  name: string;
  move: number;
  attack: number;
  defense: number;
  minRange: number;
  maxRange: number;
  /** Gold price, or null when the unit cannot be bought. */
  cost: number | null;
  flying?: boolean;
  amphibious?: boolean;
  canOccupyTown?: boolean;
  canOccupyCastle?: boolean;
  canBuy?: boolean;
  canRaise?: boolean;
  poisons?: boolean;
  givesAura?: boolean;
  /** Extra attack against flying units. */
  antiAir?: boolean;
  /** Cannot move and attack in the same turn. */
  heavy?: boolean;
}

export const UNIT_STATS: readonly UnitStats[] = [
  { name: 'Soldier', move: 4, attack: 5, defense: 1, minRange: 1, maxRange: 1, cost: 150, canOccupyTown: true },
  { name: 'Archer', move: 4, attack: 5, defense: 1, minRange: 1, maxRange: 2, cost: 250, antiAir: true },
  { name: 'Lizard', move: 6, attack: 5, defense: 2, minRange: 1, maxRange: 1, cost: 300, amphibious: true },
  { name: 'Wizard', move: 4, attack: 4, defense: 1, minRange: 1, maxRange: 1, cost: 400, canRaise: true },
  { name: 'Wisp', move: 4, attack: 3, defense: 2, minRange: 1, maxRange: 1, cost: 500, givesAura: true },
  { name: 'Spider', move: 5, attack: 6, defense: 2, minRange: 1, maxRange: 1, cost: 600, poisons: true },
  { name: 'Golem', move: 4, attack: 6, defense: 4, minRange: 1, maxRange: 1, cost: 600 },
  { name: 'Catapult', move: 3, attack: 7, defense: 2, minRange: 2, maxRange: 4, cost: 700, heavy: true },
  { name: 'Wyvern', move: 7, attack: 8, defense: 3, minRange: 1, maxRange: 1, cost: 1000, flying: true },
  {
    name: 'King', move: 4, attack: 5, defense: 3, minRange: 1, maxRange: 1, cost: null,
    canBuy: true, canOccupyTown: true, canOccupyCastle: true,
  },
  { name: 'Skeleton', move: 4, attack: 5, defense: 1, minRange: 1, maxRange: 1, cost: null },
];

export const MAX_HP = 10;
export const MAX_LEVEL = 3;
/** XP needed for the next level: 75, 150, 300. */
export const xpForNextLevel = (level: number): number => 75 << level;

export const Terrain = {
  Road: 0,
  Grass: 1,
  Woods: 2,
  Hill: 3,
  Mountain: 4,
  Water: 5,
  Bridge: 6,
  Town: 7,
  Castle: 8,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_NAMES = ['Road', 'Grass', 'Woods', 'Hill', 'Mountain', 'Water', 'Bridge', 'Town', 'Castle'];
export const TERRAIN_DEFENSE = [0, 1, 2, 2, 3, 0, 0, 3, 3];
export const TERRAIN_MOVE_COST = [1, 1, 2, 2, 3, 3, 1, 1, 1];

/** Tile index -> terrain, from tiles0.prop. Tiles 23..31 are buildings in grey/blue/red. */
const TILE_TERRAIN = [
  4, 2, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 6, 6, 5, 5,
  7, 8, 8, 7, 8, 8, 7, 8, 8,
];

export const FIRST_BUILDING_TILE = 23;

export function terrainOfTile(tile: number): Terrain {
  return (TILE_TERRAIN[tile] ?? Terrain.Grass) as Terrain;
}

export function isBuildingTile(tile: number): boolean {
  return tile >= FIRST_BUILDING_TILE;
}

/** Building tiles come in triples (town, castle, castle-top) per owner: neutral, blue, red. */
export function buildingOwner(tile: number): Team | null {
  if (!isBuildingTile(tile)) return null;
  const owner = Math.floor((tile - FIRST_BUILDING_TILE) / 3) - 1;
  return owner < 0 ? null : (owner as Team);
}

export function buildingTileFor(tile: number, owner: Team): number {
  return FIRST_BUILDING_TILE + (owner + 1) * 3 + ((tile - FIRST_BUILDING_TILE) % 3);
}

export const INCOME_PER_TOWN = 30;
export const INCOME_PER_CASTLE = 50;
export const HEAL_PER_TURN = 2;
export const TOMBSTONE_LIFETIME = 3;
