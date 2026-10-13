import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { parseMap } from '../../src/core/formats';
import { createGame, type GameState } from '../../src/core/state';

export const hud = (page: Page) => page.locator('header.hud');

/** Clicks the centre of a map tile, whatever the board's current zoom. */
export async function clickTile(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.getByLabel('Battlefield');
  const box = (await canvas.boundingBox())!;
  const size = box.width / Number(await canvas.getAttribute('data-cols'));
  await canvas.click({ position: { x: (x + 0.5) * size, y: (y + 0.5) * size } });
}

export async function waitForHumanTurn(page: Page, turn: number): Promise<void> {
  await expect(hud(page)).toHaveAttribute('data-turn', String(turn));
  await expect(hud(page)).toHaveAttribute('data-phase', 'human');
  await expect(hud(page)).toHaveAttribute('data-busy', 'false');
}

/** A fresh game read from the shipped map file, for building saves to resume from. */
export function freshGame(map: string, gold: number): GameState {
  return createGame(parseMap(new Uint8Array(readFileSync(`public/assets/ae1/${map}`))), { gold });
}

export async function seedSave(page: Page, save: object): Promise<void> {
  await page.addInitScript((json) => localStorage.setItem('ae1.save', json), JSON.stringify(save));
}
