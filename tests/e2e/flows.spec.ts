import { expect, test, type Page } from '@playwright/test';
import { UnitType } from '../../src/core/rules';
import { spawnUnit } from '../../src/core/state';
import { clickTile, freshGame, hud, seedSave, waitForHumanTurn } from './helpers';

const toolbar = (page: Page) => page.getByRole('toolbar');
const savedBattle = (page: Page) => page.evaluate(() => localStorage.getItem('ae1.save'));

async function hoverTile(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.getByLabel('Battlefield');
  const box = (await canvas.boundingBox())!;
  const size = box.width / Number(await canvas.getAttribute('data-cols'));
  await canvas.hover({ position: { x: (x + 0.5) * size, y: (y + 0.5) * size } });
}

const corruptSaves = {
  'malformed JSON': '{oops',
  'an unsupported version': JSON.stringify({ version: 2, mission: null, map: 's0', firedBeats: [], players: ['human', 'cpu'], state: {} }),
};

for (const [description, raw] of Object.entries(corruptSaves)) {
  test(`a save with ${description} leaves the main menu without Continue`, async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (error) => errors.push(error));
    await page.addInitScript((json) => localStorage.setItem('ae1.save', json), raw);

    await page.goto('/?fast');
    await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Campaign' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

// Mission 1 is lost the moment any blue unit dies. Red's Golem stands beside Galamar, who has 10 hp left.
test('losing mission 1 offers a retry that restarts at the briefing and clears the save', async ({ page }) => {
  const state = freshGame('m0', 0);
  const galamar = state.units.find((unit) => unit.team === 0 && unit.type === UnitType.King)!;
  galamar.hp = 1;
  spawnUnit(state, UnitType.Golem, 1, galamar.x, galamar.y + 1);
  Object.assign(state, { current: 1, turn: 1 });
  await seedSave(page, { version: 1, mission: 0, map: 'm0', firedBeats: ['ambush'], players: ['human', 'cpu'], state });

  await page.goto('/?fast&seed=1');
  await page.getByRole('button', { name: 'Continue' }).click();
  const failed = page.getByRole('dialog', { name: 'Mission failed' });
  await expect(failed).toBeVisible();
  expect(await savedBattle(page), 'the lost battle must not stay resumable').toBeNull();

  await failed.getByRole('button', { name: 'Try again' }).click();
  const briefing = page.getByRole('dialog', { name: 'REGROUP' });
  await expect(briefing).toContainText('Objective:');
  expect(await savedBattle(page)).toBeNull();

  await briefing.getByRole('button', { name: 'Start' }).click();
  for (const speaker of ['Captain', 'Galamar', 'Captain']) {
    await page.getByRole('dialog', { name: speaker }).getByRole('button', { name: 'Next' }).click();
  }
  await waitForHumanTurn(page, 1);
  await clickTile(page, galamar.x, galamar.y);
  await expect(page.locator('.info')).toContainText('Blue King HP 100');
});

test('two players take turns on one screen with a hand-over dialog between them', async ({ page }) => {
  await page.goto('/?fast&seed=3');
  await page.getByRole('button', { name: 'Skirmish' }).click();
  await page.getByRole('radio', { name: 'Second player' }).check();
  await page.getByRole('button', { name: 'Island Cross' }).click();
  await page.getByRole('dialog', { name: "Blue's turn" }).getByRole('button', { name: 'Ready' }).click();
  await waitForHumanTurn(page, 1);

  await page.getByRole('button', { name: 'End turn' }).click();
  const handOver = page.getByRole('dialog', { name: "Red's turn" });
  await expect(handOver.getByRole('button', { name: 'Ready' })).toBeVisible();
  await handOver.getByRole('button', { name: 'Ready' }).click();

  await waitForHumanTurn(page, 1);
  await expect(hud(page)).toHaveAttribute('data-current', 'red');
  await expect(hud(page)).toHaveAttribute('data-phase', 'human');
  // Red's king starts on its castle at (13,1).
  await clickTile(page, 13, 1);
  await expect(page.locator('.info')).toContainText('Red King HP 100');
  await expect(toolbar(page).getByRole('button', { name: 'Buy' })).toBeVisible();
});

test('a wizard raises the tombstone beside it into a blue skeleton', async ({ page }) => {
  const state = freshGame('s0', 1000);
  spawnUnit(state, UnitType.Wizard, 0, 3, 12);
  const fallen = spawnUnit(state, UnitType.Soldier, 1, 4, 12);
  fallen.status = 'tombstone';
  await seedSave(page, { version: 1, mission: null, map: 's0', firedBeats: [], players: ['human', 'cpu'], state });

  await page.goto('/?fast&seed=1');
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForHumanTurn(page, 1);
  await clickTile(page, 4, 12);
  await expect(page.locator('.info')).toContainText('Tombstone');

  await clickTile(page, 3, 12);
  await toolbar(page).getByRole('button', { name: 'Raise' }).click();
  await clickTile(page, 4, 12);

  await expect(page.locator('.info')).toContainText('Blue Skeleton HP 100');
  await expect(page.locator('.info')).not.toContainText('Tombstone');
  await clickTile(page, 3, 12);
  await expect(page.locator('.info')).toContainText('Blue Wizard HP 100');
  await expect(page.locator('.info')).toContainText('(done)');
});

// Island Cross: the blue king starts on his castle at (1,13); grass lies north at (1,12).
const cancelWays = {
  'pressing Escape': (page: Page) => page.keyboard.press('Escape'),
  'clicking Cancel': (page: Page) => toolbar(page).getByRole('button', { name: 'Cancel' }).click(),
} as const;

for (const [description, cancel] of Object.entries(cancelWays)) {
  test(`${description} after a move puts the unit back on its starting tile, ready to act`, async ({ page }) => {
    await page.goto('/?fast&seed=3');
    await page.getByRole('button', { name: 'Skirmish' }).click();
    await page.getByRole('button', { name: 'Island Cross' }).click();
    await waitForHumanTurn(page, 1);

    await clickTile(page, 1, 13);
    await clickTile(page, 1, 12);
    await expect(page.locator('.info')).toContainText('Blue King HP 100');
    await expect(toolbar(page).getByRole('button', { name: 'Buy' })).toHaveCount(0);

    await cancel(page);
    await expect(toolbar(page).getByRole('button', { name: 'Buy' }), 'the king is back on his castle').toBeVisible();
    await expect(page.locator('.info')).toContainText('Blue King HP 100');
    await expect(page.locator('.info')).not.toContainText('(done)');
    await hoverTile(page, 1, 12);
    await expect(page.locator('.info')).not.toContainText('King');

    await page.keyboard.press('Escape');
    await expect(toolbar(page).getByRole('button')).toHaveCount(0);
    await clickTile(page, 1, 13);
    await expect(toolbar(page).getByRole('button', { name: 'Buy' })).toBeVisible();
  });
}
