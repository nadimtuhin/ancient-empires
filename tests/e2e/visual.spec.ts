import { expect, test } from '@playwright/test';
import { clickTile, waitForHumanTurn } from './helpers';

test('the Island Cross battlefield draws terrain, buildings, units and the move overlay', async ({ page }) => {
  await page.goto('/?fast&seed=1');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 1, 13);
  await expect(page.locator('canvas[aria-label=Battlefield]')).toHaveScreenshot('island-cross-king-selected.png');
});

test('the whole map stays in view when the action bar fills up', async ({ page }) => {
  await page.goto('/?fast&seed=1');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await waitForHumanTurn(page, 1);
  const canvas = page.locator('canvas[aria-label=Battlefield]');
  const idleSize = await canvas.evaluate((element) => [element.clientWidth, element.clientHeight]);
  await clickTile(page, 1, 13);
  await expect(page.getByRole('toolbar').getByRole('button', { name: 'Buy' })).toBeVisible();
  const overflow = () =>
    page.evaluate(() => {
      const board = document.querySelector('.board')!;
      return [board.scrollWidth - board.clientWidth, board.scrollHeight - board.clientHeight];
    });
  await expect.poll(overflow, { message: 'the board must not need scrolling to see the whole map' }).toEqual([0, 0]);
  // Two frames let any pending ResizeObserver refit land before the size is read.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await canvas.evaluate((element) => [element.clientWidth, element.clientHeight]), 'the map must not rescale under the cursor').toEqual(idleSize);
});
