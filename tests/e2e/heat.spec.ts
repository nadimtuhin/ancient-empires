import { expect, test, type Page } from '@playwright/test';
import { clickTile, waitForHumanTurn } from './helpers';

const IDLE_MS = 1000;

async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counter = window as unknown as { frames: number };
    counter.frames = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      counter.frames++;
      return request(callback);
    };
  });
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { frames: number }).frames);

async function expectIdle(page: Page): Promise<void> {
  await page.waitForTimeout(100);
  const before = await frames(page);
  await page.waitForTimeout(IDLE_MS);
  expect(await frames(page), 'no frames requested while nothing moves').toBe(before);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
}

// The laptop stays cool when the game draws nothing while waiting for the player.
test('an idle battle requests no animation frames, before and after the computer moves', async ({ page }) => {
  await countFrames(page);
  await page.goto('/?seed=2');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await waitForHumanTurn(page, 1);
  expect(await frames(page)).toBeGreaterThan(0);
  await expectIdle(page);

  await clickTile(page, 1, 13);
  await expectIdle(page);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'End turn' }).click();
  await waitForHumanTurn(page, 2);
  await expectIdle(page);
});
