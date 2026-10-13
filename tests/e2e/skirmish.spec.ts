import { expect, test } from '@playwright/test';
import { UnitType } from '../../src/core/rules';
import { clickTile, freshGame, hud, seedSave, waitForHumanTurn } from './helpers';

// Island Cross: the blue king starts on his castle at (1,13), grass lies just north at (1,12).
test('buy a soldier, place it, end the turn and let the computer reply', async ({ page }) => {
  await page.goto('/?fast&seed=3');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await waitForHumanTurn(page, 1);
  await expect(page.getByTestId('gold-blue')).toHaveText('Blue 1000g');

  await clickTile(page, 1, 13);
  await expect(page.locator('.info')).toContainText('Blue King HP 100');
  await page.getByRole('toolbar').getByRole('button', { name: 'Buy' }).click();
  await page.getByRole('dialog', { name: 'Buy' }).getByRole('button', { name: 'Soldier 150' }).click();
  await expect(page.getByTestId('gold-blue')).toHaveText('Blue 850g');

  await clickTile(page, 1, 12);
  await page.getByRole('toolbar').getByRole('button', { name: 'Wait' }).click();
  await expect(page.locator('.info')).toContainText('Blue Soldier HP 100');
  await expect(page.locator('.info')).toContainText('(done)');

  await page.getByRole('button', { name: 'End turn' }).click();
  await waitForHumanTurn(page, 2);
  await expect(hud(page)).toHaveAttribute('data-current', 'blue');
  // Red starts its turn with 1000g + 50g castle income; the cheapest troop costs 150g.
  const redGold = Number((await page.getByTestId('gold-red').textContent())!.match(/\d+/)![0]);
  expect(redGold, 'the computer bought at least one troop').toBeLessThanOrEqual(900);
});

test('the turn can be ended from the keyboard and the game resumes from its autosave', async ({ page }) => {
  await page.goto('/?fast&seed=5');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Rocky Bay' }).click();
  await waitForHumanTurn(page, 1);
  await page.keyboard.press('e');
  await waitForHumanTurn(page, 2);
  const goldBefore = await page.getByTestId('gold-red').textContent();

  await page.reload();
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForHumanTurn(page, 2);
  await expect(page.locator('canvas[aria-label=Battlefield]')).toHaveAttribute('data-cols', '17');
  await expect(page.getByTestId('gold-red')).toHaveText(goldBefore!);
});

test('striking down the enemy king wins the skirmish', async ({ page }) => {
  const state = freshGame('s0', 1000);
  const redKing = state.units.find((unit) => unit.team === 1 && unit.type === UnitType.King)!;
  Object.assign(redKing, { x: 1, y: 12, hp: 1 });
  await seedSave(page, { version: 1, mission: null, map: 's0', firedBeats: [], players: ['human', 'cpu'], state });

  await page.goto('/?fast&seed=1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 1, 13);
  await page.getByRole('toolbar').getByRole('button', { name: 'Attack' }).click();
  await clickTile(page, 1, 12);
  await expect(page.getByRole('dialog', { name: 'Blue wins!' })).toBeVisible();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
});
