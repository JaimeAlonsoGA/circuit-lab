import { chromium } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = '/workspace/circuit-lab-shots';
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '✔' : '✖'} ${name} ${extra}`); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const project = () => page.evaluate(() => JSON.parse(localStorage.getItem('circuitlab.project') ?? '{}'));
const tpl = async (name) => { await page.getByTestId('templates').click(); await page.getByRole('menuitem', { name: new RegExp(name) }).click(); await page.waitForTimeout(800); };
const power = async (on) => { const p = page.getByTestId('power'); if ((await p.getAttribute('aria-pressed') === 'true') !== on) await p.click(); };

await page.goto(BASE);
await page.waitForSelector('[data-comp]');
check('starter circuit loads', (await page.locator('[data-comp]').count()) >= 3);
await page.screenshot({ path: `${OUT}/01-start.png` });
await power(true); await page.waitForTimeout(1500);
check('power on energises pins', (await page.locator('[data-live]').count()) > 0);
await page.screenshot({ path: `${OUT}/02-powered-led.png` });

await tpl('Burn');
await power(true);
await page.locator('[data-action="toggle"]').first().click();
await page.waitForTimeout(2500);
check('LED burns without resistor', (await page.locator('[data-burnt]').count()) > 0);
check('pet reacts to burn', await page.getByTestId('pet').getByRole('status').isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/03-burnt.png` });
await page.locator('[data-burnt]').first().click({ force: true });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-inspector-burnt.png` });
await power(false); await page.waitForTimeout(300);
await page.getByTestId('repair').click();
await page.waitForTimeout(300);
check('repair clears burn', (await page.locator('[data-burnt]').count()) === 0);

await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
await tpl('Blink');
await power(true);
await page.getByTestId('tab-code').click();
await page.waitForSelector('.monaco-editor', { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);
check('monaco editor loads', (await page.locator('.monaco-editor').count()) > 0);
await page.screenshot({ path: `${OUT}/05-code-blink.png` });
await page.getByTestId('code-drawer').getByRole('button', { name: 'Close' }).click();

await tpl('OLED'); await power(true); await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/06-oled.png` });
await tpl('Transistor motor'); await power(true); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/07-motor.png` });
await tpl('Breadboard'); await power(true); await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/08-breadboard.png` });
await tpl('RC'); await power(true); await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/09-rc-scope.png` });
await power(false);

// palette click-to-add + pin drag wiring
await tpl('LED \\+ resistor');
const before = (await project()).components?.length ?? 0;
await page.locator('[data-part="resistor"]').click();
await page.locator('[data-part="resistor"]').click();
await page.waitForTimeout(700);
const p1 = await project();
check('palette adds parts', p1.components.length === before + 2, `${before} -> ${p1.components.length}`);
const [r1, r2] = p1.components.slice(-2).map((c) => c.id);
const a = page.locator(`[data-pin="${r1}|b"]`), b = page.locator(`[data-pin="${r2}|a"]`);
const ba = await a.boundingBox(), bb = await b.boundingBox();
if (ba && bb) {
  await page.mouse.move(ba.x + ba.width / 2, ba.y + ba.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 12 }); await page.mouse.up();
}
await page.waitForTimeout(700);
check('drag pin→pin creates wire', (await project()).wires.length === p1.wires.length + 1);

// drag & drop from palette
const canvas = await page.getByTestId('canvas').boundingBox();
await page.locator('[data-part="led"]').dragTo(page.getByTestId('canvas'), { targetPosition: { x: canvas.width * 0.7, y: canvas.height * 0.75 } });
await page.waitForTimeout(700);
check('drag-and-drop adds part', (await project()).components.length === p1.components.length + 1);

// exports
await page.getByTestId('export').click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /SPICE/i }).click()]);
const spicePath = `${OUT}/export.cir`; await dl.saveAs(spicePath);
check('SPICE export downloads', true, dl.suggestedFilename());
for (const n of [/Image/i, /Vector/i, /KiCad/i, /Bill/i, /Project/i]) {
  await page.getByTestId('export').click();
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByRole('menuitem', { name: n }).first().click()]);
  await d.saveAs(`${OUT}/export-${d.suggestedFilename()}`);
  check(`export ${n}`, true, d.suggestedFilename());
}

// AI agent with mocked provider proxy (no real key used)
let round = 0;
await page.route('**/api/agent', async (route) => {
  const body = route.request().postDataJSON();
  const hdr = route.request().headers()['x-user-key'];
  round++;
  const reply = round === 1
    ? { text: 'On it!', toolCalls: [
      { id: '1', name: 'clear', args: {} },
      { id: '2', name: 'add_component', args: { type: 'battery9v' } },
      { id: '3', name: 'add_component', args: { type: 'resistor', props: { resistance: 470 } } },
      { id: '4', name: 'add_component', args: { type: 'led', props: { color: 'green' } } },
      { id: '5', name: 'connect', args: { from: 'BT1.+', to: 'R1.a' } },
      { id: '6', name: 'connect', args: { from: 'R1.b', to: 'D1.anode' } },
      { id: '7', name: 'connect', args: { from: 'D1.K', to: 'BT1.-' } },
      { id: '8', name: 'run', args: { seconds: 1 } }] }
    : { text: `Your green LED is glowing (${body.messages.length} msgs, key ${hdr ? 'sent' : 'missing'}).`, toolCalls: [] };
  await route.fulfill({ json: reply });
});
await page.getByTestId('tab-ai').click();
await page.getByTestId('ai-key').fill('test-key-not-real');
await page.getByRole('button', { name: 'Done' }).click();
await page.getByTestId('ai-input').fill('Build me a green LED circuit');
await page.keyboard.press('Enter');
await page.getByText(/glowing/).first().waitFor({ timeout: 15000 }).catch(() => {});
const pa = await project();
check('AI agent builds circuit via tools', pa.components?.length === 3 && pa.wires?.length === 3);
check('AI reply shown', await page.getByText(/key sent/).first().isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/10-ai-agent.png` });
await page.unroute('**/api/agent');

// mobile
const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await m.goto(BASE); await m.waitForSelector('[data-comp]'); await m.waitForTimeout(800);
await m.screenshot({ path: `${OUT}/11-mobile.png` });

const benign = errors.filter((e) => !/favicon|AudioContext|Failed to load resource/.test(e));
check('no console errors', benign.length === 0, benign.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
