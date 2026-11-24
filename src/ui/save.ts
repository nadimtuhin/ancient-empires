import { MISSION_COUNT } from '../core/missions';
import type { GameState } from '../core/state';
import type { Player } from './session';

/** One autosave slot, written at the start of every human turn. */
export interface SavedBattle {
  version: 1;
  /** Campaign mission index, or null for a skirmish. */
  mission: number | null;
  /** Skirmish map file, so "play again" works after a resumed game. */
  map: string;
  firedBeats: string[];
  players: [Player, Player];
  state: GameState;
}

const SAVE_KEY = 'ae1.save';

// Storage can be disabled or full (private mode, quota); the game still plays, it just cannot resume.
export function writeSave(save: SavedBattle): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Returns null for a missing, old or corrupt save rather than crashing the menu. */
export function readSave(): SavedBattle | null {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as SavedBattle | null;
    const state = save?.state;
    const mission = save?.mission;
    const valid =
      save?.version === 1 &&
      (mission === null || (typeof mission === 'number' && Number.isInteger(mission) && mission >= 0 && mission < MISSION_COUNT)) &&
      typeof save.map === 'string' &&
      Array.isArray(save.players) &&
      save.players.length === 2 &&
      save.players.every((player) => player === 'human' || player === 'cpu') &&
      Array.isArray(save.firedBeats) &&
      !!state &&
      Array.isArray(state.tiles) &&
      Array.isArray(state.units) &&
      state.tiles.length === state.width * state.height &&
      (state.current === 0 || state.current === 1) &&
      Array.isArray(state.gold) &&
      state.gold.length === 2 &&
      state.gold.every((gold) => typeof gold === 'number');
    return valid ? save : null;
  } catch {
    return null;
  }
}
