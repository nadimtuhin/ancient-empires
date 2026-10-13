import { expect, test } from '@playwright/test';
import { UnitType } from '../../src/core/rules';
import { clickTile, freshGame, hud, seedSave, waitForHumanTurn } from './helpers';

test('quitting while the computer moves stops that battle for good', async ({ page }) => {
  // A rich red army on its own turn keeps the computer busy for seconds, so the quit lands mid-turn.
  const state = freshGame('s0', 1000);
  Object.assign(state, { current: 1, turn: 1 });
  state.gold[1] = 5000;
  await seedSave(page, { version: 1, mission: null, map: 's0', firedBeats: [], players: ['human', 'cpu'], state });
  const savedTurn = () => page.evaluate(() => JSON.parse(localStorage.getItem('ae1.save')!).state.turn);

  await page.goto('/?seed=4');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(hud(page)).toHaveAttribute('data-phase', 'cpu');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Quit to menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
  expect(await savedTurn(), 'the computer finished before the quit; the test proves nothing').toBe(1);

  await page.waitForTimeout(2000);
  expect(await savedTurn(), 'the abandoned battle kept playing and overwrote the save').toBe(1);
});

test('a bought unit must be placed before the turn can end', async ({ page }) => {
  await page.goto('/?fast&seed=3');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 1, 13);
  await page.getByRole('toolbar').getByRole('button', { name: 'Buy' }).click();
  await page.getByRole('button', { name: 'Soldier 150' }).click();

  await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
  await page.keyboard.press('e');
  await expect(hud(page)).toHaveAttribute('data-turn', '1');
  await expect(hud(page)).toHaveAttribute('data-current', 'blue');

  await clickTile(page, 1, 12);
  await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
  await page.getByRole('toolbar').getByRole('button', { name: 'Wait' }).click();
  await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
});

test('a recruit aiming an attack still cannot end the turn on the castle', async ({ page }) => {
  const state = freshGame('s0', 1000);
  const redKing = state.units.find((unit) => unit.team === 1 && unit.type === UnitType.King)!;
  Object.assign(redKing, { x: 1, y: 11 });
  await seedSave(page, { version: 1, mission: null, map: 's0', firedBeats: [], players: ['human', 'cpu'], state });

  await page.goto('/?fast&seed=3');
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 1, 13);
  await page.getByRole('toolbar').getByRole('button', { name: 'Buy' }).click();
  await page.getByRole('button', { name: 'Soldier 150' }).click();
  await clickTile(page, 1, 12);
  await page.getByRole('toolbar').getByRole('button', { name: 'Attack' }).click();

  await expect(page.getByRole('button', { name: 'End turn' })).toBeDisabled();
  await page.keyboard.press('e');
  await expect(hud(page)).toHaveAttribute('data-current', 'blue');
  await expect(hud(page)).toHaveAttribute('data-turn', '1');
});

test('keyboard players can finish an order from the action bar', async ({ page }) => {
  await page.goto('/?fast&seed=3');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 1, 13);
  await page.getByRole('toolbar').getByRole('button', { name: 'Wait' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.info')).toContainText('Blue King HP 100');
  await expect(page.locator('.info')).toContainText('(done)');
});
