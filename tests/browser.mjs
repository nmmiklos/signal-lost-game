import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Run after integration: PLAYWRIGHT_CHROMIUM_EXECUTABLE may override the local build.
const root = fileURLToPath(new URL('../', import.meta.url));
const localChromium = fileURLToPath(new URL('../test-results/chromium/chrome-win64/chrome.exe', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(localChromium) ? localChromium : undefined);
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root, env: { ...process.env, PORT: '5174' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let serverErrors = '';
server.stderr.on('data', data => { serverErrors += data; });
const errors = [];
const artifact = name => fileURLToPath(new URL(`../test-results/${name}`, import.meta.url));

function recordErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}

async function waitFrames(page, seconds = 0.1) {
  const before = await page.evaluate(() => window.__game.run.elapsed);
  await page.waitForFunction(({ before, seconds }) => window.__game.run.elapsed >= before + seconds,
    { before, seconds }, { timeout: 15000 });
}

async function pressE(page) {
  await page.keyboard.down('KeyE');
  await waitFrames(page);
  await page.keyboard.up('KeyE');
  await waitFrames(page);
}

async function freezeAI(page) {
  await page.evaluate(() => { window.__game.run.elapsed = -100; });
}

async function playing(page) {
  await page.waitForFunction(() => document.body.classList.contains('playing') && !window.__game.run.won && !window.__game.run.lost);
  await freezeAI(page);
}

async function layoutSignature(page) {
  return page.evaluate(() => ({
    seed: document.getElementById('seed-value').textContent,
    geometry: JSON.stringify({ obstacles: window.__game.world.obstacles, tasks: window.__game.world.tasks.map(({ id, kind, approach }) => ({ id, kind, approach })) }),
  }));
}

// Locate open floor in the CURRENT generated world, never hard-code an old station.
async function clearFixture(page) {
  return page.evaluate(async () => {
    const { clearLine } = await import('/src/logic.js');
    const { world } = window.__game;
    for (const x of [-10, 0, 10]) {
      for (const z of [0, -10, -20]) {
        const player = { x, z: z + 2 };
        const enemy = { x, z: z - 2 };
        if (clearLine(player, enemy, world.obstacles, 0.7)
          && clearLine(enemy, { x, z: z - 3.5 }, world.obstacles, 0.7)) return { player, enemy };
      }
    }
    throw new Error('Generated layout has no clear floor fixture for flash/chase tests');
  });
}

async function placeOnFloor(page, fixture, { active = false, contact = false } = {}) {
  await page.evaluate(({ fixture, active, contact }) => {
    const game = window.__game;
    game.run.elapsed = active ? 10 : -100;
    game.camera.position.set(fixture.player.x, 1.65, fixture.player.z);
    game.aim(0);
    game.brain.position.x = contact ? fixture.player.x : fixture.enemy.x;
    game.brain.position.z = contact ? fixture.player.z - 0.25 : fixture.enemy.z;
    game.creature.group.position.set(game.brain.position.x, 0, game.brain.position.z);
  }, { fixture, active, contact });
}

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server startup timed out: ${serverErrors}`)), 15000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited ${code}: ${serverErrors}`)); });
    server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
  });
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}), headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.5 });
  page.setDefaultTimeout(45000);
  recordErrors(page);
  // Exercise the documented drag fallback without depending on headless pointer-lock support.
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', { configurable: true, value: undefined });
  });
  await page.goto('http://localhost:5174/?test=1');
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.renderer.setPixelRatio(0.5));
  assert.equal(await page.locator('#menu').isVisible(), true);
  assert.equal(await page.locator('#battery-fill, #battery-value').count(), 0);
  for (const id of ['flash-count', 'noise-fill', 'stealth-status', 'seed-value', 'flash-overlay']) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `required HUD ${id}`);
  }
  await page.screenshot({ path: artifact('menu.png') });
  await page.locator('#start').click();
  await playing(page);
  assert.deepEqual(await page.evaluate(() => ({
    charges: window.__game.run.flashCharges,
    completed: window.__game.run.completed.size,
    kinds: window.__game.world.tasks.map(t => t.kind).sort(),
  })), { charges: 3, completed: 0, kinds: ['fuse', 'uplink', 'valve'] });
  console.log('PASS: WebGL, test hooks, new HUD and all three task types');

  const paths = await page.evaluate(async () => {
    const { findPath, clearLine } = await import('/src/logic.js');
    const { world } = window.__game;
    const destinations = [...world.tasks.map(task => task.approach), ...world.hidingSpots.map(s => s.exitPosition), world.exit.position];
    return destinations.map(point => {
      const path = findPath(world.spawn, point, world.obstacles, world.bounds, 0.46);
      let previous = world.spawn;
      return path.length > 0 && [...path, point].every(next => {
        const clear = clearLine(previous, next, world.obstacles, 0.46);
        previous = next;
        return clear;
      });
    });
  });
  assert.ok(paths.every(Boolean), 'current world objectives and locker exits must be reachable');

  const startZ = await page.evaluate(() => window.__game.camera.position.z);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(start => window.__game.camera.position.z < start - 0.2, startZ);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => window.__game.run.crouched && document.body.classList.contains('is-crouched'));
  await page.keyboard.press('KeyC');
  await page.waitForFunction(() => !window.__game.run.crouched);
  const oldYaw = await page.evaluate(() => window.__game.camera.rotation.y);
  await page.mouse.move(720, 430);
  await page.mouse.down();
  await page.mouse.move(840, 450, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(yaw => Math.abs(window.__game.camera.rotation.y - yaw) > 0.05, oldYaw);
  console.log('PASS: Keyboard movement, crouch and drag look');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('pause').hidden);
  const pausedAt = await page.evaluate(() => window.__game.run.elapsed);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__game.run.elapsed), pausedAt);
  await page.locator('#resume').click();
  await playing(page);
  console.log('PASS: Pause freezes simulation and resumes');

  const flashFixture = await clearFixture(page);
  await placeOnFloor(page, flashFixture);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__game.run.flashCharges === 2);
  await page.waitForFunction(() => window.__game.brain.stage === 'blinded');
  assert.equal(await page.evaluate(() => window.__game.run.lost), false);
  console.log('PASS: F consumes one charge; physical flash blast blinds at clear LOS');

  const spotId = await page.evaluate(() => {
    const game = window.__game;
    const spot = game.world.hidingSpots[0];
    game.camera.position.set(spot.exitPosition.x, 1.65, spot.exitPosition.z);
    game.aim(0);
    game.brain.position.x = spot.exitPosition.x;
    game.brain.position.z = spot.exitPosition.z + 2;
    game.brain.stage = 'chase';
    game.brain.seesPlayer = true;
    return spot.id;
  });
  await pressE(page);
  assert.equal(await page.evaluate(() => Boolean(window.__game.run.hiddenId)), false, 'cannot hide while watched nearby');
  await page.evaluate(() => {
    window.__game.brain.seesPlayer = false;
    window.__game.brain.stage = 'patrol';
  });
  await pressE(page);
  await page.waitForFunction(id => window.__game.run.hiddenId === id && document.body.classList.contains('is-hidden'), spotId);
  const hiddenPosition = await page.evaluate(() => ({ x: window.__game.camera.position.x, z: window.__game.camera.position.z }));
  await page.keyboard.down('KeyW');
  await waitFrames(page, 0.3);
  await page.keyboard.up('KeyW');
  assert.deepEqual(await page.evaluate(() => ({ x: window.__game.camera.position.x, z: window.__game.camera.position.z })), hiddenPosition);
  const hiddenYaw = await page.evaluate(() => window.__game.camera.rotation.y);
  await page.mouse.move(720, 430);
  await page.mouse.down();
  await page.mouse.move(740, 430, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(yaw => Math.abs(window.__game.camera.rotation.y - yaw) > 0.005, hiddenYaw);
  await pressE(page);
  await page.waitForFunction(() => !window.__game.run.hiddenId && !document.body.classList.contains('is-hidden'));
  assert.ok(await page.evaluate(id => {
    const game = window.__game;
    const exit = game.world.hidingSpots.find(s => s.id === id).exitPosition;
    return Math.hypot(game.camera.position.x - exit.x, game.camera.position.z - exit.z) < 0.05;
  }, spotId));
  console.log('PASS: Watched hiding rejected; unseen enter, movement lock, view and clear exit');

  async function targetTask(kind) {
    await page.evaluate(kind => {
      const game = window.__game;
      const task = game.world.tasks.find(task => task.kind === kind);
      game.run.elapsed = -100;
      game.camera.position.set(task.approach.x, 1.65, task.approach.z);
      game.aim(0);
    }, kind);
    await waitFrames(page);
    await page.waitForFunction(() => !document.getElementById('interact').hidden);
  }
  await targetTask('valve');
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__game.objectives.tasks.find(t => t.kind === 'valve').progress > 0.1);
  await page.keyboard.up('KeyE');
  await page.waitForFunction(() => window.__game.objectives.tasks.find(t => t.kind === 'valve').progress === 0);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__game.objectives.tasks.find(t => t.kind === 'valve').complete, null, { timeout: 60000 });
  await page.keyboard.up('KeyE');
  await waitFrames(page);
  assert.equal(await page.evaluate(() => window.__game.run.flashCharges), 3, 'repair refills one flash charge');

  await targetTask('fuse');
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__game.objectives.tasks.find(t => t.kind === 'fuse').steps === 1);
  await waitFrames(page, 0.4);
  assert.equal(await page.evaluate(() => window.__game.objectives.tasks.find(t => t.kind === 'fuse').steps), 1);
  await page.keyboard.up('KeyE');
  await waitFrames(page);
  await pressE(page);
  assert.equal(await page.evaluate(() => window.__game.objectives.tasks.find(t => t.kind === 'fuse').steps), 2);
  await pressE(page);
  assert.equal(await page.evaluate(() => window.__game.objectives.tasks.find(t => t.kind === 'fuse').complete), true);

  await targetTask('uplink');
  await pressE(page);
  await page.waitForFunction(() => window.__game.objectives.tasks.find(t => t.kind === 'uplink').started);
  await page.evaluate(() => {
    const game = window.__game;
    game.camera.position.copy(game.world.spawn);
    game.aim(Math.PI);
  });
  await page.waitForFunction(() => window.__game.objectives.tasks.find(t => t.kind === 'uplink').complete, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__game.run.completed.size), 3);
  assert.equal((await page.locator('#relay-count').textContent()).replace(/\s/g, ''), '3/3');
  assert.equal(await page.evaluate(() => window.__game.run.flashCharges), 3, 'refills cap at three');
  await page.screenshot({ path: artifact('gameplay.png') });
  console.log('PASS: Actual E input completes held valve, three-press fuse and unattended uplink');

  const beforeRestart = await layoutSignature(page);
  await page.evaluate(() => {
    const game = window.__game;
    game.camera.position.set(game.world.exit.position.x, 1.65, game.world.exit.position.z - 1);
    game.aim(Math.PI);
  });
  await waitFrames(page);
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.__game.run.won);
  await page.keyboard.up('KeyE');
  assert.equal(await page.locator('#ending').isVisible(), true);
  await page.locator('#restart').click();
  await playing(page);
  const afterRestart = await layoutSignature(page);
  assert.notEqual(afterRestart.seed, beforeRestart.seed, 'new run has a fresh seed');
  assert.notEqual(afterRestart.geometry, beforeRestart.geometry, 'new run regenerates the world');
  assert.equal(await page.evaluate(() => window.__game.run.completed.size), 0);
  assert.equal(await page.evaluate(() => window.__game.objectives.tasks.every(t => !t.complete && t.progress === 0)), true);
  assert.equal(await page.evaluate(() => window.__game.run.flashCharges), 3);
  console.log('PASS: Airlock win and regenerated clean restart');

  const chaseFixture = await clearFixture(page);
  chaseFixture.enemy = { x: chaseFixture.player.x, z: chaseFixture.player.z - 1.6 };
  await placeOnFloor(page, chaseFixture, { active: true });
  await page.waitForFunction(() => window.__game.brain.stage === 'chase' && window.__game.brain.seesPlayer);
  await placeOnFloor(page, chaseFixture, { active: true, contact: true });
  await page.waitForFunction(() => window.__game.run.lost);
  assert.equal(await page.locator('#ending').isVisible(), true);
  console.log('PASS: Clear sight triggers chase; contact at the same clear point triggers loss');

  await page.locator('#mute').click();
  assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 0.5 });
  const phone = await mobile.newPage();
  phone.setDefaultTimeout(45000);
  recordErrors(phone);
  await phone.goto('http://localhost:5174/?test=1');
  await phone.waitForFunction(() => window.__game, null, { timeout: 60000 });
  await phone.evaluate(() => window.__game.renderer.setPixelRatio(0.5));
  assert.equal(await phone.locator('#start').isVisible(), true);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await phone.locator('#mute').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  }), true, 'mobile mute fully inside viewport');
  await phone.screenshot({ path: artifact('mobile.png') });
  await phone.locator('#start').tap();
  await playing(phone);
  for (const action of ['forward', 'backward', 'left', 'right', 'sprint', 'flash', 'interact', 'crouch']) {
    assert.equal(await phone.locator(`[data-action="${action}"]`).isVisible(), true, `touch ${action}`);
  }
  await phone.locator('[data-action="crouch"]').tap();
  await phone.waitForFunction(() => window.__game.run.crouched);
  await phone.locator('[data-action="crouch"]').tap();
  await phone.waitForFunction(() => !window.__game.run.crouched);
  const mobileZ = await phone.evaluate(() => window.__game.camera.position.z);
  const forward = await phone.locator('[data-action="forward"]').boundingBox();
  const cdp = await mobile.newCDPSession(phone);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: forward.x + forward.width / 2, y: forward.y + forward.height / 2 }] });
  await phone.waitForFunction(z => window.__game.camera.position.z < z - 0.15, mobileZ);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const mobileYaw = await phone.evaluate(() => window.__game.camera.rotation.y);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 210, y: 350 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 270, y: 350 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await phone.waitForFunction(yaw => Math.abs(window.__game.camera.rotation.y - yaw) > 0.03, mobileYaw);
  await phone.locator('[data-action="flash"]').tap();
  await phone.waitForFunction(() => window.__game.run.flashCharges === 2);
  await cdp.detach();
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log('PASS: Mobile layout, visible mute, touch movement/look/crouch/flash; zero browser errors');
  await mobile.close();
} finally {
  try {
    await browser?.close();
  } finally {
    server.kill();
  }
}
