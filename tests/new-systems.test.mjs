import test, { before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createObjectives, updateObjectives, taskPrompt, nearestHidingSpot, canEnterHiding } from '../src/objectives.js';
import { clearLine, findPath } from '../src/logic.js';

let generateLayout;
let createBrain;
let updateBrain;
let blindBrain;

const radius = 0.46;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const box = (x1, z1, x2, z2) => ({ min: { x: x1, y: 0, z: z1 }, max: { x: x2, y: 3, z: z2 }, kind: 'wall' });

// Independent slab oracle also checks paths, rather than trusting clearLine alone.
function intersects(a, b, obstacle, padding = 0) {
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'z']) {
    const low = obstacle.min[axis] - padding + 1e-8;
    const high = obstacle.max[axis] + padding - 1e-8;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] <= low || a[axis] >= high) return false;
    } else {
      const t1 = (low - a[axis]) / delta;
      const t2 = (high - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return false;
    }
  }
  return enter <= leave;
}

function safePoint(point, layout, label, padding = radius) {
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z), `${label}: finite point`);
  const b = layout.bounds;
  assert.ok(point.x >= b.minX + padding && point.x <= b.maxX - padding, `${label}: X bounds`);
  assert.ok(point.z >= b.minZ + padding && point.z <= b.maxZ - padding, `${label}: Z bounds`);
  assert.ok(!layout.obstacles.some(o => intersects(point, point, o, padding)), `${label}: obstacle clearance`);
}

function safeSegment(a, b, layout, label) {
  safePoint(a, layout, label);
  safePoint(b, layout, label);
  assert.equal(clearLine(a, b, layout.obstacles, radius), true, `${label}: clearLine`);
  assert.ok(!layout.obstacles.some(o => intersects(a, b, o, radius)), `${label}: expanded obstacle intersection`);
}

function connected(layout, destination, label) {
  const path = findPath(layout.spawn, destination, layout.obstacles, layout.bounds, radius);
  assert.ok(path.length, `${label}: reachable from spawn`);
  let previous = layout.spawn;
  for (const point of path) {
    safeSegment(previous, point, layout, label);
    previous = point;
  }
  assert.ok(distance(previous, destination) <= 0.75, `${label}: reaches destination`);
  safeSegment(previous, destination, layout, `${label}: final approach`);
}

describe('generated layout contracts', () => {
before(async () => { ({ generateLayout } = await import('../src/layout.js')); });
test('240 generated seeds have connected objectives, locker exits and safe CLOSED patrol routes', () => {
  const signatures = new Set();
  for (let index = 0; index < 240; index++) {
    const seed = index < 200 ? index - 100 : `contract-${index}`;
    const layout = generateLayout(seed);
    const label = `seed ${seed}`;
    assert.deepEqual(layout, generateLayout(seed), `${label}: deterministic`);
    assert.deepEqual(layout.bounds, { minX: -15, maxX: 15, minZ: -25, maxZ: 5 });
    assert.deepEqual(layout.spawn, { x: 0, z: 2 });
    assert.deepEqual(layout.exit, { x: 0, z: 3.6 });
    assert.equal(layout.rooms.length, 9);
    assert.deepEqual(layout.rooms.map(r => `${r.x},${r.z}`).sort(),
      [-10, 0, 10].flatMap(x => [0, -10, -20].map(z => `${x},${z}`)).sort());
    for (const room of layout.rooms) {
      assert.equal(room.width, 10);
      assert.equal(room.depth, 10);
    }
    assert.ok(layout.obstacles.every(o => ['wall', 'locker', 'crate'].includes(o.kind)));
    signatures.add(JSON.stringify({ obstacles: layout.obstacles, tasks: layout.tasks }));
    for (const [name, point] of Object.entries({ spawn: layout.spawn, exit: layout.exit, enemy: layout.enemySpawn })) {
      safePoint(point, layout, `${label} ${name}`, 0.32);
      connected(layout, point, `${label} ${name}`);
    }
    assert.deepEqual(layout.tasks.map(t => t.kind).sort(), ['fuse', 'uplink', 'valve']);
    assert.equal(new Set(layout.tasks.map(t => t.id)).size, 3);
    const taskRooms = new Set();
    for (const task of layout.tasks) {
      assert.ok(task.title && task.duration > 0);
      assert.equal(task.approach.x, task.position.x);
      assert.ok(Math.abs(task.approach.z - task.position.z - 1.5) < 1e-8);
      const room = layout.rooms.find(r => Math.abs(task.position.x - r.x) < 5 && Math.abs(task.position.z - r.z) < 5);
      assert.ok(room, `${label}: task belongs to a room`);
      assert.notEqual(`${room.x},${room.z}`, '0,0', `${label}: tasks away from spawn room`);
      taskRooms.add(room.id);
      connected(layout, task.approach, `${label} task ${task.id}`);
    }
    assert.equal(taskRooms.size, 3, `${label}: distinct task rooms`);
    assert.ok(layout.hidingSpots.length >= 4 && layout.hidingSpots.length <= 6);
    assert.equal(new Set(layout.hidingSpots.map(s => s.id)).size, layout.hidingSpots.length);
    for (const spot of layout.hidingSpots) {
      assert.equal(spot.rotation, 0);
      assert.equal(spot.exitPosition.x, spot.position.x);
      assert.ok(spot.exitPosition.z > spot.position.z);
      assert.ok(layout.obstacles.some(o => o.kind === 'locker' && intersects(spot.position, spot.position, o)), `${label}: locker collider`);
      connected(layout, spot.exitPosition, `${label} locker ${spot.id}`);
    }
    assert.equal(layout.patrolRoutes.length, 2);
    for (const [routeIndex, route] of layout.patrolRoutes.entries()) {
      assert.ok(route.length >= 4);
      for (let i = 0; i < route.length; i++) {
        safeSegment(route[i], route[(i + 1) % route.length], layout, `${label} patrol ${routeIndex} segment ${i}, including closure`);
      }
    }
  }
  assert.ok(signatures.size > 100, 'different seeds produce varied station layouts');
});
});

function aiFixture(obstacles = []) {
  const layout = {
    enemySpawn: { x: 0, z: 0 },
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    obstacles,
    patrolRoutes: [[{ x: 0, z: 0 }, { x: 0, z: 6 }, { x: -6, z: 6 }, { x: -6, z: 0 }]],
  };
  const brain = createBrain(layout);
  const context = { player: { x: 18, z: 18 }, hidden: false, noises: [], completed: 0, ...layout };
  return { brain, context, layout };
}

function advance(brain, context, seconds, check = () => {}) {
  let result;
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    result = updateBrain(brain, 0.05, context);
    assert.equal(result.stage, brain.stage);
    assert.equal(result.seesPlayer, brain.seesPlayer);
    assert.equal(typeof result.caught, 'boolean');
    assert.equal(typeof result.moving, 'boolean');
    assert.ok(Number.isFinite(result.danger));
    check(result);
  }
  return result;
}

describe('AI contracts', () => {
before(async () => { ({ createBrain, updateBrain, blindBrain } = await import('../src/ai.js')); });
test('AI starts at enemy spawn; audible sound produces notice, distant silence does not', () => {
  const { brain, context } = aiFixture();
  assert.deepEqual(brain.position, { x: 0, z: 0 });
  assert.equal(brain.stage, 'patrol');
  const unheard = structuredClone(brain);
  advance(unheard, { ...context, noises: [{ position: { x: 18, z: -18 }, radius: 2, kind: 'step' }] }, 0.05);
  assert.equal(unheard.stage, 'patrol');
  const heard = { position: { x: -5, z: 0 }, radius: 10, kind: 'task' };
  advance(brain, { ...context, noises: [heard] }, 0.05);
  assert.equal(brain.stage, 'notice');
  assert.equal(brain.seesPlayer, false);
  const before = distance(brain.position, heard.position);
  advance(brain, context, 0.75);
  assert.ok(distance(brain.position, heard.position) < before, 'investigates sound, not the far player');
});

test('walls attenuate marginal sounds and prevent sight', () => {
  const wall = box(3, -12, 3.4, 12);
  const open = aiFixture();
  const blocked = aiFixture([wall]);
  const noise = { position: { x: 8, z: 0 }, radius: 9, kind: 'step' };
  advance(open.brain, { ...open.context, hidden: true, noises: [noise] }, 0.05);
  advance(blocked.brain, { ...blocked.context, hidden: true, noises: [noise] }, 0.05);
  assert.equal(open.brain.stage, 'notice');
  assert.equal(blocked.brain.stage, 'patrol');
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const fixture = aiFixture([wall]);
    fixture.brain.yaw = yaw;
    advance(fixture.brain, { ...fixture.context, player: noise.position }, 0.05, result => {
      assert.equal(result.seesPlayer, false);
      assert.equal(result.caught, false);
    });
  }
});

test('sight has a forward cone, close peripheral awareness and initiates chase', () => {
  const observations = [];
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const { brain, context } = aiFixture();
    brain.yaw = yaw;
    observations.push(advance(brain, { ...context, player: { x: 0, z: 6 } }, 0.05).seesPlayer);
  }
  assert.ok(observations.includes(true), 'a forward-facing enemy sees a clear player');
  assert.ok(observations.includes(false), 'distant sight is not omnidirectional');
  const { brain, context } = aiFixture();
  const result = advance(brain, { ...context, player: { x: 0, z: 1.6 } }, 0.05);
  assert.equal(result.seesPlayer, true);
  assert.equal(result.stage, 'chase');
});

test('lost sight leads to search then patrol without following unseen live coordinates', () => {
  const { brain, context } = aiFixture();
  advance(brain, { ...context, player: { x: 0, z: 1.6 } }, 0.05);
  assert.equal(brain.stage, 'chase');
  const twin = structuredClone(brain);
  const obstacles = [box(-20, 3, 20, 3.4)];
  const left = { ...context, obstacles, player: { x: -12, z: 10 } };
  const right = { ...context, obstacles, player: { x: 12, z: 10 } };
  const stages = new Set();
  for (let i = 0; i < 600; i++) {
    const result = advance(brain, left, 0.05);
    advance(twin, right, 0.05);
    assert.equal(result.seesPlayer, false);
    assert.equal(result.caught, false);
    assert.deepEqual(brain.position, twin.position, 'unseen player location must not steer search');
    assert.equal(brain.stage, twin.stage);
    stages.add(result.stage);
    if (stages.has('search') && result.stage === 'patrol') break;
  }
  assert.ok(stages.has('search'), 'sight loss causes search');
  assert.equal(brain.stage, 'patrol', 'search eventually expires');
});

test('hidden players cannot be seen or caught, including at contact distance', () => {
  const { brain, context } = aiFixture();
  advance(brain, { ...context, player: { x: 0, z: 1.6 } }, 0.05);
  for (let i = 0; i < 200; i++) {
    advance(brain, { ...context, hidden: true, player: { ...brain.position } }, 0.05, result => {
      assert.equal(result.seesPlayer, false);
      assert.equal(result.caught, false);
    });
  }
});

test('five-second blindness blocks sight and catches, then expires', () => {
  const { brain, context } = aiFixture();
  blindBrain(brain, 5);
  for (let i = 0; i < 95; i++) {
    advance(brain, { ...context, player: { ...brain.position } }, 0.05, result => {
      assert.equal(result.stage, 'blinded');
      assert.equal(result.seesPlayer, false);
      assert.equal(result.caught, false);
    });
  }
  advance(brain, { ...context, hidden: true }, 0.5);
  assert.notEqual(brain.stage, 'blinded');
  const result = advance(brain, { ...context, player: { ...brain.position } }, 0.05);
  assert.equal(result.seesPlayer, true);
  assert.equal(result.caught, true);
});

test('AI investigates across a wall via a collision-safe detour', () => {
  const { brain, context, layout } = aiFixture([box(2, -3, 2.5, 3)]);
  const target = { x: 5, z: 0 };
  advance(brain, { ...context, hidden: true, noises: [{ position: target, radius: 26, kind: 'flash' }] }, 0.05);
  assert.equal(brain.stage, 'notice');
  let closest = distance(brain.position, target);
  for (let i = 0; i < 200; i++) {
    const previous = { ...brain.position };
    advance(brain, { ...context, hidden: true }, 0.05);
    safeSegment(previous, brain.position, layout, 'AI movement');
    closest = Math.min(closest, distance(brain.position, target));
  }
  assert.ok(closest < 1.5, 'AI reaches the sound around the wall');
});
});

const descriptors = ['valve', 'fuse', 'uplink'].map((kind, index) => ({
  id: kind, kind, title: kind.toUpperCase(), position: { x: index * 5, z: 0 },
  approach: { x: index * 5, z: 1.5 }, duration: kind === 'uplink' ? 8 : 4,
}));
const idle = { targetId: null, holding: false, pressed: false };
const taskOf = (state, id) => state.tasks.find(task => task.id === id);
function tick(state, dt, input = idle) {
  const result = updateObjectives(state, dt, input);
  assert.ok(Array.isArray(result.completed) && Array.isArray(result.noises));
  for (const task of state.tasks) assert.ok(task.progress >= 0 && task.progress <= 1);
  for (const noise of result.noises) {
    assert.ok(Number.isFinite(noise.position.x) && Number.isFinite(noise.position.z));
    assert.ok(noise.radius >= 8 && noise.radius <= 14);
  }
  return result;
}

test('objective states are independent and expose all three distinct task prompts', () => {
  const snapshot = structuredClone(descriptors);
  const state = createObjectives(descriptors);
  const other = createObjectives(descriptors);
  for (const task of state.tasks) {
    assert.equal(task.progress, 0);
    assert.equal(task.complete, false);
    assert.equal(task.started, false);
    assert.equal(task.steps, 0);
    assert.ok(taskPrompt(task).length > 0);
  }
  assert.equal(new Set(state.tasks.map(taskPrompt)).size, 3);
  tick(state, 1, { targetId: 'valve', holding: true, pressed: true });
  assert.equal(taskOf(other, 'valve').progress, 0);
  assert.deepEqual(descriptors, snapshot);
});

test('valve requires a continuous hold; release and lost targeting cancel partial progress', () => {
  for (const cancel of [idle, { targetId: 'fuse', holding: true, pressed: false }]) {
    const state = createObjectives(descriptors);
    const hold = { targetId: 'valve', holding: true, pressed: true };
    assert.deepEqual(tick(state, 2, hold).completed, []);
    assert.ok(taskOf(state, 'valve').progress > 0);
    tick(state, 0.1, cancel);
    assert.equal(taskOf(state, 'valve').progress, 0);
    assert.deepEqual(tick(state, 2, hold).completed, []);
    assert.deepEqual(tick(state, 2, { ...hold, pressed: false }).completed, ['valve']);
    assert.equal(taskOf(state, 'valve').complete, true);
    assert.deepEqual(tick(state, 10, hold).completed, [], 'completion emitted only once');
  }
});

test('fuse requires three distinct E presses; holding frames and elapsed time do not count', () => {
  const state = createObjectives(descriptors);
  const press = { targetId: 'fuse', holding: true, pressed: true };
  assert.deepEqual(tick(state, 0.05, press).completed, []);
  assert.equal(taskOf(state, 'fuse').steps, 1);
  for (let i = 0; i < 100; i++) tick(state, 0.05, { ...press, pressed: false });
  assert.equal(taskOf(state, 'fuse').steps, 1);
  assert.equal(taskOf(state, 'fuse').complete, false);
  tick(state, 0.05, idle);
  assert.deepEqual(tick(state, 0.05, press).completed, []);
  assert.equal(taskOf(state, 'fuse').steps, 2);
  tick(state, 0.05, idle);
  assert.deepEqual(tick(state, 0.05, press).completed, ['fuse']);
  tick(state, 0.05, idle);
  assert.deepEqual(tick(state, 1, press).completed, []);
});

test('uplink starts on E, runs unattended and emits periodic audible noise', () => {
  const state = createObjectives(descriptors);
  tick(state, 10, { targetId: 'uplink', holding: true, pressed: false });
  assert.equal(taskOf(state, 'uplink').started, false);
  const events = [tick(state, 0.05, { targetId: 'uplink', holding: true, pressed: true })];
  assert.equal(taskOf(state, 'uplink').started, true);
  for (let i = 0; i < 80; i++) events.push(tick(state, 0.1));
  assert.equal(taskOf(state, 'uplink').complete, true);
  assert.deepEqual(events.flatMap(e => e.completed), ['uplink']);
  assert.ok(events.filter(e => e.noises.length > 0).length >= 2, 'transmission makes periodic noise');
  assert.equal(taskOf(state, 'valve').complete, false);
  assert.equal(taskOf(state, 'fuse').complete, false);
  assert.deepEqual(tick(state, 20).completed, []);
});

test('hiding uses nearest locker exit, range and enemy awareness', () => {
  const spots = [
    { id: 'far', position: { x: 0, z: 0 }, exitPosition: { x: 0, z: 10 } },
    { id: 'near', position: { x: 0, z: -2 }, exitPosition: { x: 0, z: 1 } },
  ];
  assert.equal(nearestHidingSpot({ x: 0, z: 0 }, spots)?.id, 'near');
  assert.equal(nearestHidingSpot({ x: 20, z: 20 }, spots), null);
  assert.equal(nearestHidingSpot({ x: 0, z: 0 }, spots, 0.5), null);
  assert.equal(nearestHidingSpot({ x: 0, z: 0 }, []), null);
  for (const distance of [0, 5, 14]) {
    assert.equal(canEnterHiding({ seesPlayer: true, stage: 'chase', distance }), false);
    assert.equal(canEnterHiding({ seesPlayer: false, stage: 'search', distance }), true);
    assert.equal(canEnterHiding({ seesPlayer: false, stage: 'blinded', distance }), true);
  }
});
