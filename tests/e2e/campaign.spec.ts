import { expect, test } from '@playwright/test';
import { UnitType } from '../../src/core/rules';
import { clickTile, freshGame, seedSave, waitForHumanTurn } from './helpers';

test('mission 1 opens with its briefing and the captain\'s dialogue', async ({ page }) => {
  await page.goto('/?fast');
  await page.getByRole('button', { name: 'Campaign' }).click();
  await page.getByRole('button', { name: '1. REGROUP' }).click();

  const briefing = page.getByRole('dialog', { name: 'REGROUP' });
  await expect(briefing).toContainText('King Galamar must occupy castle, keep all troops alive.');
  await briefing.getByRole('button', { name: 'Start' }).click();

  for (const speaker of ['Captain', 'Galamar', 'Captain']) {
    const line = page.getByRole('dialog', { name: speaker });
    await expect(line).toBeVisible();
    await line.getByRole('button', { name: 'Next' }).click();
  }
  await waitForHumanTurn(page, 1);
});

// Regroup is won by occupying the castle at (8,9); the road at (7,9) is one step away.
test('occupying the castle completes mission 1 and unlocks mission 2', async ({ page }) => {
  const state = freshGame('m0', 0);
  const galamar = state.units.find((unit) => unit.type === UnitType.King)!;
  Object.assign(galamar, { x: 7, y: 9 });
  await seedSave(page, { version: 1, mission: 0, map: 'm0', firedBeats: ['ambush'], players: ['human', 'cpu'], state });

  await page.goto('/?fast');
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 7, 9);
  await clickTile(page, 8, 9);
  await page.getByRole('toolbar').getByRole('button', { name: 'Occupy' }).click();

  const complete = page.getByRole('dialog', { name: 'MISSION COMPLETE' });
  await expect(complete).toBeVisible();
  await complete.getByRole('button', { name: 'Next mission' }).click();
  await expect(page.getByRole('dialog', { name: 'FRIENDS&ENEMIES' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ae1.unlockedMission'))).toBe('1');
});
