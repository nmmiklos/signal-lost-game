import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS,
  moveWithCollisions,
  clearLine,
  findPath,
} from '../src/logic.js';

const EPSILON = 1e-7;
const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const box = (minX, minZ, maxX, maxZ) => ({
  min: { x: minX, z: minZ },
  max: { x: maxX, z: maxZ },
});

function near(actual, expected, message = '') {
  assert.ok(Number.isFinite(actual), `${message}: expected a finite number, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, got ${actual}`);
}

// Independent slab intersection oracle: do not validate navigation using the
// production clearLine implementation, since both could share the same bug.
function crossesInterior(from, to, obstacle, padding = 0) {
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'z']) {
    const low = obstacle.min[axis] - padding + EPSILON;
    const high = obstacle.max[axis] + padding - EPSILON;
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (from[axis] <= low || from[axis] >= high) return false;
      continue;
    }
    const a = (low - from[axis]) / delta;
    const b = (high - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return enter <= leave;
}

function assertRoute(from, to, obstacles, area, radius) {
  const inputs = structuredClone({ from, to, obstacles, area });
  const path = findPath(from, to, obstacles, area, radius);
  assert.ok(Array.isArray(path), 'a route must be an array');
  assert.ok(path.length > 0, 'a reachable destination must have a route');
  let previous = from;
  for (const point of path) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z), 'waypoints must be finite');
    assert.ok(point.x >= area.minX + radius - EPSILON);
    assert.ok(point.x <= area.maxX - radius + EPSILON);
    assert.ok(point.z >= area.minZ + radius - EPSILON);
    assert.ok(point.z <= area.maxZ - radius + EPSILON);
    for (const obstacle of obstacles) {
      assert.equal(crossesInterior(previous, point, obstacle, radius), false,
        `route crosses an expanded obstacle: ${JSON.stringify({ previous, point, obstacle })}`);
    }
    previous = point;
  }
  // Allow a grid-center destination without prescribing the grid resolution.
  assert.ok(Math.hypot(previous.x - to.x, previous.z - to.z) <= 0.75,
    'the route must reach the destination neighborhood');
  for (const obstacle of obstacles) {
    assert.equal(crossesInterior(previous, to, obstacle, radius), false,
      'the final approach must be clear');
  }
  assert.deepEqual({ from, to, obstacles, area }, inputs, 'pathfinding must not change inputs');
  return path;
}

test('SETTINGS exposes the agreed gameplay values', () => {
  assert.deepEqual(SETTINGS, {
    playerRadius: 0.32,
    walkSpeed: 2.6,
    sprintSpeed: 4.4,
    crouchSpeed: 1.25,
  });
});

test('movement mutates the supplied position and preserves unrelated properties', () => {
  const position = { x: 1, z: -2, y: 7 };
  moveWithCollisions(position, 2.25, -1.5, [], bounds);
  near(position.x, 3.25);
  near(position.z, -3.5);
  assert.equal(position.y, 7);
});

test('zero movement leaves a valid position unchanged', () => {
  const position = { x: -3, z: 2 };
  moveWithCollisions(position, 0, 0, [box(1, 1, 2, 2)], bounds);
  assert.deepEqual(position, { x: -3, z: 2 });
});

test('movement clamps all four bounds using the default radius', () => {
  for (const direction of [-1, 1]) {
    const position = { x: 0, z: 0 };
    moveWithCollisions(position, direction * 100, direction * 100, [], bounds);
    near(position.x, direction * (10 - 0.32));
    near(position.z, direction * (10 - 0.32));
  }
});

test('movement honors an explicit radius and asymmetric bounds', () => {
  const area = { minX: -2, maxX: 5, minZ: -4, maxZ: 3 };
  const position = { x: 0, z: 0 };
  moveWithCollisions(position, 100, -100, [], area, 0.8);
  near(position.x, 4.2);
  near(position.z, -3.2);
});

test('substeps prevent tunnelling through thin walls on either axis and direction', () => {
  for (const axis of ['x', 'z']) {
    for (const direction of [-1, 1]) {
      const position = { x: 0, z: 0 };
      position[axis] = -direction * 4;
      const wall = axis === 'x' ? box(-0.025, -9, 0.025, 9) : box(-9, -0.025, 9, 0.025);
      moveWithCollisions(position, axis === 'x' ? direction * 8 : 0,
        axis === 'z' ? direction * 8 : 0, [wall], bounds);
      assert.ok(position[axis] * direction <= -0.025 - 0.32 + EPSILON,
        `${axis} movement in direction ${direction} crossed the wall`);
      assert.ok(position[axis] * direction > -4, 'movement should approach the wall');
    }
  }
});

test('diagonal movement slides along a wall when one axis is blocked', () => {
  for (const axis of ['x', 'z']) {
    const position = { x: -1, z: -1 };
    const wall = axis === 'x' ? box(0, -9, 1, 9) : box(-9, 0, 9, 1);
    moveWithCollisions(position, 3, 3, [wall], bounds);
    assert.ok(position[axis] <= -0.32 + EPSILON);
    near(position[axis === 'x' ? 'z' : 'x'], 2, 'unblocked axis should slide');
  }
});

test('meeting two perpendicular walls blocks both axes', () => {
  const position = { x: -2, z: -2 };
  moveWithCollisions(position, 6, 6,
    [box(0, -9, 1, 9), box(-9, 0, 9, 1)], bounds);
  assert.ok(position.x <= -0.32 + EPSILON);
  assert.ok(position.z <= -0.32 + EPSILON);
});

test('movement uses an explicit radius for obstacle clearance', () => {
  const position = { x: -3, z: 0 };
  const obstacles = [box(0, -5, 1, 5)];
  const snapshot = structuredClone({ obstacles, bounds });
  moveWithCollisions(position, 6, 0, obstacles, bounds, 0.8);
  assert.ok(position.x <= -0.8 + EPSILON);
  assert.ok(position.x > -3);
  assert.deepEqual({ obstacles, bounds }, snapshot);
});

test('clearLine handles empty space and obstacles outside the finite segment', () => {
  const from = { x: -2, z: 0 };
  const to = { x: 2, z: 0 };
  assert.equal(clearLine(from, to, []), true);
  assert.equal(clearLine(from, to, [box(3, -1, 4, 1), box(-4, -1, -3, 1)]), true);
});

test('clearLine blocks horizontal, vertical and diagonal crossings in both directions', () => {
  const obstacles = [box(-1, -1, 1, 1)];
  for (const [from, to] of [
    [{ x: -3, z: 0 }, { x: 3, z: 0 }],
    [{ x: 0, z: -3 }, { x: 0, z: 3 }],
    [{ x: -3, z: -3 }, { x: 3, z: 3 }],
  ]) {
    assert.equal(clearLine(from, to, obstacles), false);
    assert.equal(clearLine(to, from, obstacles), false);
  }
});

test('clearLine permits a diagonal near miss even when segment bounding boxes overlap', () => {
  assert.equal(clearLine({ x: -2, z: 0 }, { x: 0, z: 2 }, [box(-0.5, -0.5, 0.5, 0.5)]), true);
});

test('clearLine handles parallel misses and padding', () => {
  const from = { x: -3, z: 1.2 };
  const to = { x: 3, z: 1.2 };
  const obstacles = [box(-1, -1, 1, 1)];
  assert.equal(clearLine(from, to, obstacles), true);
  assert.equal(clearLine(from, to, obstacles, 0.3), false);
  assert.equal(clearLine(to, from, obstacles, 0.3), false);
});

test('clearLine blocks an endpoint inside an obstacle', () => {
  const inside = { x: 0, z: 0 };
  const outside = { x: 3, z: 0 };
  const obstacles = [box(-1, -1, 1, 1)];
  assert.equal(clearLine(inside, outside, obstacles), false);
  assert.equal(clearLine(outside, inside, obstacles), false);
});

test('clearLine handles zero-length segments inside and outside obstacles', () => {
  const obstacles = [box(-1, -1, 1, 1)];
  assert.equal(clearLine({ x: 0, z: 0 }, { x: 0, z: 0 }, obstacles), false);
  assert.equal(clearLine({ x: 2, z: 2 }, { x: 2, z: 2 }, obstacles), true);
});

test('clearLine checks every obstacle without changing its inputs', () => {
  const from = { x: -3, z: 0 };
  const to = { x: 3, z: 0 };
  const obstacles = [box(-1, 3, 1, 4), box(-0.01, -1, 0.01, 1)];
  const snapshot = structuredClone({ from, to, obstacles });
  assert.equal(clearLine(from, to, obstacles), false);
  assert.deepEqual({ from, to, obstacles }, snapshot);
});

test('findPath provides a safe route across open space', () => {
  assertRoute({ x: -6, z: -4 }, { x: 6, z: 4 }, [], bounds, 0.4);
});

test('findPath detours around a wall and returns deterministic waypoints', () => {
  const from = { x: -5, z: 0 };
  const to = { x: 5, z: 0 };
  const obstacles = [box(-1, -3, 1, 3)];
  const path = assertRoute(from, to, obstacles, bounds, 0.4);
  assert.deepEqual(findPath(from, to, obstacles, bounds, 0.4), path);
});

test('findPath respects a larger radius while routing around an obstacle', () => {
  assertRoute({ x: -5, z: 0 }, { x: 5, z: 0 },
    [box(-1, -3, 1, 3)], bounds, 0.8);
});

test('findPath returns no route through a wall joining opposite bounds', () => {
  assert.deepEqual(findPath({ x: -5, z: 0 }, { x: 5, z: 0 },
    [box(-0.2, -10, 0.2, 10)], bounds), []);
});

test('findPath cannot squeeze through a gap narrower than the diameter', () => {
  const obstacles = [box(-0.5, -10, 0.5, -0.25), box(-0.5, 0.25, 0.5, 10)];
  assert.deepEqual(findPath({ x: -5, z: 0 }, { x: 5, z: 0 }, obstacles, bounds, 0.4), []);
});
