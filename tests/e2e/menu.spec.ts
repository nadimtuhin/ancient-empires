import { expect, test } from '@playwright/test';

test('main menu offers campaign, skirmish and help, with no save to continue', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(menu.getByRole('img', { name: 'Ancient Empires' })).toBeVisible();
  await expect(menu.getByRole('button')).toHaveText(['Campaign', 'Skirmish', 'How to play']);

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'How to play' })).toContainText('King Galamar');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(menu).toBeVisible();
});

test('campaign starts with only the first of seven missions unlocked', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Campaign' }).click();
  const missions = page.getByRole('navigation', { name: 'Campaign' }).getByRole('button', { name: /^\d\. / });
  await expect(missions).toHaveCount(7);
  await expect(missions.first()).toHaveText('1. REGROUP');
  await expect(missions.first()).toBeEnabled();
  for (let index = 1; index < 7; index++) await expect(missions.nth(index)).toBeDisabled();
});
