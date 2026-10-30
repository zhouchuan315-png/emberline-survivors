const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
let playwright, PNG;
try { playwright = require('playwright'); } catch {
  playwright = require(process.env.PLAYWRIGHT_PATH || '/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
}
try { ({ PNG } = require('pngjs')); } catch {
  ({ PNG } = require('/Users/xm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs'));
}

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.QA_OUT || path.join(root, 'evidence/desktop-20260928'));
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(path.join(root, 'build/desktop-qa-'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'desktop/package.json'), 'utf8')).version;
const archive = path.join(root, `dist/desktop/EmberlineSurvivors-${version}-macOS-AppleSilicon.zip`);
execFileSync('ditto', ['-xk', archive, scratch]);
const bundle = path.join(scratch, 'Emberline Survivors-darwin-arm64/Emberline Survivors.app');
execFileSync('codesign', ['--verify', '--deep', '--strict', bundle]);
const executablePath = path.join(bundle, 'Contents/MacOS/EmberlineSurvivors');
const userData = path.join(scratch, 'qa-profile');
const report = {
  result: 'pending', archive, archiveSha256: createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
  executablePath, userData, checks: {},
  policy: 'Extracted release ZIP, real desktop executable, isolated save directory; normal keyboard/mouse input except a documented shop balance fixture. No preview server or production save is used.',
};
let app, page;
const errors = [], externalRequests = [];
const state = () => page.evaluate(() => JSON.parse(render_game_to_text()));
const fixture = source => page.evaluate(async source => {
  const cc = System.get(System.resolve('cc'));
  const h = cc.director.getScene().getChildByName('Game').getComponent('Emberline');
  return new (Object.getPrototypeOf(async function () {}).constructor)('h', 'cc', source)(h, cc);
}, source);

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await playwright._electron.launch({ executablePath, args: [`--user-data-dir=${userData}`], env, timeout: 60000 });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  await page.waitForFunction(() => window.emberlineReady === true, null, { timeout: 60000 });
  await page.locator('#GameCanvas').focus();
}

async function shot(name) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const buffer = await page.screenshot({ path: path.join(out, name + '.png') });
  const png = PNG.sync.read(buffer), colors = new Set();
  for (let i = 0; i < png.data.length; i += 64) colors.add(png.data.subarray(i, i + 3).toString('hex'));
  assert(colors.size > 250, 'Rendered game must contain textured content, not a blank canvas');
  return { width: png.width, height: png.height, sampledColors: colors.size };
}

async function click(name) {
  const p = await fixture(`
    const find=n=>n.name===${JSON.stringify(name)}?n:n.children.map(find).find(Boolean);
    const n=find(h.overlay)||find(h.hud);if(!n)throw new Error('Button missing');
    const a=n.worldPosition,b=h.canvas.worldPosition;
    return {x:a.x-b.x,y:a.y-b.y,W:h.W,H:h.H};
  `);
  const rect = await page.locator('#GameCanvas').boundingBox();
  const scale = Math.min(rect.width / p.W, rect.height / p.H);
  await page.mouse.click(rect.x + rect.width / 2 + p.x * scale, rect.y + rect.height / 2 - p.y * scale);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

(async () => {
  try {
    await launch();
    report.checks.environment = await page.evaluate(() => ({
      url: location.href, secureContext: isSecureContext, locks: Boolean(navigator.locks),
      node: typeof process, require: typeof require, online: navigator.onLine,
    }));
    assert.equal(report.checks.environment.url, 'emberline://game/index.html');
    assert.equal(report.checks.environment.secureContext, true);
    assert.equal(report.checks.environment.locks, true);
    assert.equal(report.checks.environment.node, 'undefined');
    assert.equal(report.checks.environment.require, 'undefined');
    assert((await state()).assetsLoaded > 60);
    report.checks.menu = await shot('mac-menu');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).phase === 'playing');
    const before = await state();
    await page.keyboard.down('d');
    await page.waitForTimeout(600);
    await page.keyboard.up('d');
    const moved = await state();
    assert(moved.player.x > before.player.x + 20);
    report.checks.keyboardMovement = { before: before.player, after: moved.player };
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).campaign.coins > 0, null, { timeout: 45000 });
    await page.keyboard.press('p');
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).phase === 'paused');
    const paused = await state();
    await page.waitForTimeout(450);
    assert.equal((await state()).time, paused.time);
    assert(paused.kills > 0);
    report.checks.earnedCoins = { coins: paused.profile.coins, kills: paused.kills };
    report.checks.pause = true;
    report.checks.combat = await shot('mac-combat-paused');
    await page.keyboard.press('r');
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).phase === 'menu');
    await click('OpenShop');
    // This fixture is restricted to the disposable QA save, then uses real shop buttons.
    await fixture('h.profile=(await h.profileStore.transact(p=>{p.coins=500;})).profile;h.showPhase();');
    await click('BuyTalent:arsenal');
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).profile.heroTalents.vanguard.arsenal === 1);
    const purchased = await state();
    assert.equal(purchased.profile.coins, 420);
    assert.equal(purchased.saveWarning, '');
    report.checks.shop = await shot('mac-shop');
    const savedProfile = purchased.profile;
    await app.close(); app = null;
    await launch();
    assert.deepEqual((await state()).profile, savedProfile);
    report.checks.relaunchRestoresProfile = true;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => JSON.parse(render_game_to_text()).phase === 'playing');
    assert.equal((await state()).maxHp, 100);
    assert.equal((await state()).campaign.heroTalents.vanguard.arsenal, 1);
    report.checks.talentApplied = true;
    await page.keyboard.press('p');
    // CDP keyboard events bypass macOS menu accelerators; exercise the native menu command.
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === '游戏').submenu.items[0].click());
    await page.waitForTimeout(1200);
    report.checks.fullscreen = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
    assert.equal(report.checks.fullscreen, true);
    report.checks.fullscreenRender = await shot('mac-fullscreen');
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === '游戏').submenu.items[0].click());
    await page.waitForTimeout(1200);
    report.checks.externalRequests = externalRequests;
    report.checks.errors = errors;
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(errors, []);
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed'; report.error = error.stack;
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
    fs.writeFileSync(path.join(out, 'desktop-runtime-report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ result: report.result, checks: Object.keys(report.checks) }));
})().catch(error => { console.error(error); process.exitCode = 1; });
