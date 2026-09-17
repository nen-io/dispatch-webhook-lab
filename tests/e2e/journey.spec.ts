import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('all scenarios, deterministic clock, duplicate/conflict, pause/reset and export', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.getByText('BROWSER SIMULATION')).toBeVisible();
  await page.getByRole('button', { name: 'Inspect evt_0002', exact: true }).click();
  await expect(
    page
      .getByRole('complementary')
      .filter({ has: page.getByRole('heading', { name: 'evt_0002' }) })
      .getByText('HTTP 503'),
  ).toHaveCount(1);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Advance +1s' }).click();
  const inspector = page.locator('.inspector');
  await expect(inspector.getByText('Delivered', { exact: true })).toBeVisible();
  await expect(inspector.getByText('1 receiver effect', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Replay duplicate' }).click();
  await expect(page.getByRole('status')).toContainText('Original receipt');
  await expect(inspector.getByText('1 receiver effect', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try changed payload' }).click();
  await expect(page.getByRole('alert')).toContainText('409 Conflict');
  for (const name of [
    'Clean delivery',
    'A little turbulence',
    'Hard rejection',
    'Retry exhaustion',
  ])
    await page
      .getByRole('button')
      .filter({ has: page.getByRole('heading', { name }) })
      .click();
  await page.getByRole('button', { name: 'Auto-run' }).click();
  await page.clock.runFor(1000);
  await expect(page.getByTestId('clock')).toHaveText('00:04.000');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.runFor(2000);
  await expect(page.getByTestId('clock')).toHaveText('00:04.000');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export log' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dispatch-simulation.json');
  const stream = await download.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(buffers).toString());
  expect(exported.mode).toBe('simulation');
  expect(exported.events).toHaveLength(8);
  expect(exported.now).toBe(4000);
  await page.getByRole('button', { name: 'Reset session' }).click();
  await expect(page.getByRole('heading', { name: 'Your queue is clear.' })).toBeVisible();
  await expect(page.getByTestId('clock')).toHaveText('00:00.000');
});

test('custom input rejects invalid JSON and renders HTML-like content as text', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Custom event' }).click();
  await page.getByLabel('Event ID').fill('<bad>');
  await page.getByRole('button', { name: 'Send custom event' }).click();
  await expect(page.getByRole('alert')).toContainText('ID must be');
  await page.getByLabel('Event ID').fill('safe');
  await page.getByLabel('JSON payload').fill('{broken');
  await page.getByRole('button', { name: 'Send custom event' }).click();
  await expect(page.getByRole('alert')).toContainText('valid JSON');
  await page
    .getByLabel('JSON payload')
    .fill(JSON.stringify({ text: '<img src=x onerror=alert(1)>', scenario: 'success' }));
  await page.getByRole('button', { name: 'Send custom event' }).click();
  await expect(page.locator('.inspector pre')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.inspector img')).toHaveCount(0);
  await expect(
    page.locator('.inspector').getByText('1 receiver effect', { exact: true }),
  ).toBeVisible();
});

test('desktop and mobile populated screenshots; narrow layout and keyboard access', async ({
  page,
}) => {
  await mkdir('docs/screenshots', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Advance +1s' }).click();
  await page.screenshot({ path: 'docs/screenshots/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Advance +1s' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('clock')).toHaveText('00:02.000');
  await page.setViewportSize({ width: 720, height: 600 });
  await page.evaluate(() => {
    const elements = [
      ...document.querySelectorAll<HTMLElement>('button, p, label, h1, h2, h3, small'),
    ];
    const sizes = elements.map((el) => parseFloat(getComputedStyle(el).fontSize));
    elements.forEach((el, index) => {
      el.style.fontSize = `${sizes[index] * 2}px`;
    });
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('triages matching events without hiding inspector identity, then clears filters', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Delivery state').selectOption('pending');
  await expect(page.locator('.event-row')).toHaveCount(2);
  await page.getByLabel('Find event').fill('evt_0004');
  await expect(page.locator('.event-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Inspect evt_0004', exact: true }).click();
  await page.getByRole('button', { name: 'Next due attempt', exact: true }).click();
  await page.getByRole('button', { name: 'Next due attempt', exact: true }).click();
  await page.getByRole('button', { name: 'Next due attempt', exact: true }).click();
  await expect(page.getByTestId('clock')).toHaveText('00:07.000');
  await expect(page.getByRole('button', { name: 'Next due attempt', exact: true })).toBeDisabled();
  await expect(page.locator('.inspector').getByRole('heading', { name: 'evt_0004' })).toBeVisible();
  await expect(page.getByText('Selected event is outside these filters.')).toBeVisible();
  await expect(page.getByText('No events match your filters.')).toBeVisible();
  const exported = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export log' }).click();
  const stream = await (await exported).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const log = JSON.parse(Buffer.concat(chunks).toString());
  expect(log.events).toHaveLength(4);
  expect(log.now).toBe(7000);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.event-row')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Find event').fill('ORDER.COMPLETED');
  await expect(page.locator('.event-row')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
