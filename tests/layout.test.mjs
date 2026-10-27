import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateLayout } from '../src/layout.js';
import { clearLine, findPath } from '../src/logic.js';

const CREATURE_RADIUS = 0.46;
const PLAYER_RADIUS = 0.32;

function crossesInterior(fromPoint, toPoint, obstacle, padding = 0) {
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'z']) {
    const low = obstacle.min[axis] - padding + 1e-8;
    const high = obstacle.max[axis] + padding - 1e-8;
    const delta = toPoint[axis] - fromPoint[axis];
    if (Math.abs(delta) < 1e-10) {
      if (fromPoint[axis] <= low || fromPoint[axis] >= high) return false;
    } else {
      const first = (low - fromPoint[axis]) / delta;
      const second = (high - fromPoint[axis]) / delta;
      enter = Math.max(enter, Math.min(first, second));
      leave = Math.min(leave, Math.max(first, second));
      if (enter > leave) return false;
    }
  }
  return enter <= leave;
}

function assertPointClear(point, layout, radius, label) {
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z), label);
  assert.ok(
    point.x >= layout.bounds.minX + radius && point.x <= layout.bounds.maxX - radius,
    label
  );
  assert.ok(
    point.z >= layout.bounds.minZ + radius && point.z <= layout.bounds.maxZ - radius,
    label
  );
  assert.equal(
    layout.obstacles.some(box => crossesInterior(point, point, box, radius)),
    false,
    label
  );
}

function assertSegmentClear(fromPoint, toPoint, layout, label) {
  assertPointClear(fromPoint, layout, CREATURE_RADIUS, label);
  assertPointClear(toPoint, layout, CREATURE_RADIUS, label);
  assert.equal(clearLine(fromPoint, toPoint, layout.obstacles, CREATURE_RADIUS), true, label);
  assert.equal(
    layout.obstacles.some(box => crossesInterior(fromPoint, toPoint, box, CREATURE_RADIUS)),
    false,
    label
  );
}

function assertReachable(layout, targetPoint, label) {
  const path = findPath(layout.spawn, targetPoint, layout.obstacles, layout.bounds, CREATURE_RADIUS);
  assert.ok(path.length > 0, label);
  let previous = layout.spawn;
  for (const waypoint of path) {
    assertSegmentClear(previous, waypoint, layout, label);
    previous = waypoint;
  }
  assert.ok(Math.hypot(previous.x - targetPoint.x, previous.z - targetPoint.z) <= 0.75, label);
  assertSegmentClear(previous, targetPoint, layout, label);
}

test('layout source has no comments, no Three.js imports, and no one-letter locals', () => {
  const source = readFileSync(new URL('../src/layout.js', import.meta.url), 'utf8');
  assert.equal(/\/\/|\/\*/.test(source), false);
  assert.equal(/three/i.test(source), false);
  assert.equal(/\b(?:const|let|var|function)\s+[A-Za-z_$]\b/.test(source), false);
});

test('360 diverse seeds satisfy all 3x3 layout, doorway, task, locker, and closed patrol contracts', () => {
  const layoutSignatures = new Set();
  const routeSignatures = new Set();
  const spotCounts = new Set();

  for (let index = 0; index < 360; index++) {
    const seedValue = index < 260 ? index - 80 : `station-seed-${index}`;
    const layout = generateLayout(seedValue);
    const label = `seed=${seedValue}`;

    assert.deepEqual(layout, generateLayout(seedValue), label);
    assert.deepEqual(layout.bounds, { minX: -15, maxX: 15, minZ: -25, maxZ: 5 });
    assert.deepEqual(layout.spawn, { x: 0, z: 2 });
    assert.deepEqual(layout.exit, { x: 0, z: 3.6 });
    assert.equal(layout.rooms.length, 9);
    assert.ok(layout.obstacles.length > 15 && layout.obstacles.length < 100, label);
    assert.ok(
      layout.obstacles.every(
        box =>
          ['wall', 'locker', 'crate'].includes(box.kind) &&
          box.min.x < box.max.x &&
          box.min.y < box.max.y &&
          box.min.z < box.max.z
      ),
      label
    );

    assertPointClear(layout.spawn, layout, PLAYER_RADIUS, `${label} spawn`);
    assertPointClear(layout.exit, layout, PLAYER_RADIUS, `${label} exit`);
    assertPointClear(layout.enemySpawn, layout, CREATURE_RADIUS, `${label} enemySpawn`);
    assert.ok(
      Math.hypot(layout.enemySpawn.x - layout.spawn.x, layout.enemySpawn.z - layout.spawn.z) >= 18,
      `${label} enemySpawn distant`
    );
    assertReachable(layout, layout.exit, `${label} exit reachable`);
    assertReachable(layout, layout.enemySpawn, `${label} enemySpawn reachable`);

    for (const room of layout.rooms) {
      assertReachable(layout, { x: room.x, z: room.z }, `${label} room ${room.id}`);
    }

    assert.deepEqual(layout.tasks.map(task => task.kind).sort(), ['fuse', 'uplink', 'valve']);
    const taskRoomIds = new Set();
    for (const task of layout.tasks) {
      assert.equal(task.approach.x, task.position.x);
      assert.ok(Math.abs(task.approach.z - (task.position.z + 1.5)) < 1e-8);
      assertPointClear(task.position, layout, PLAYER_RADIUS, `${label} task pos`);
      assertPointClear(task.approach, layout, CREATURE_RADIUS, `${label} task approach`);
      assertReachable(layout, task.approach, `${label} task reachable`);
      const ownerRoom = layout.rooms.find(
        room => Math.abs(task.position.x - room.x) < 5 && Math.abs(task.position.z - room.z) < 5
      );
      assert.ok(ownerRoom && !(ownerRoom.x === 0 && ownerRoom.z === 0), `${label} task room`);
      taskRoomIds.add(ownerRoom.id);
    }
    assert.equal(taskRoomIds.size, 3);

    assert.ok(layout.hidingSpots.length >= 4 && layout.hidingSpots.length <= 6);
    spotCounts.add(layout.hidingSpots.length);
    for (const spot of layout.hidingSpots) {
      assert.equal(spot.rotation, 0);
      assert.equal(spot.exitPosition.x, spot.position.x);
      assert.ok(spot.exitPosition.z > spot.position.z);
      assert.equal(
        layout.obstacles.some(
          box => box.kind === 'locker' && crossesInterior(spot.position, spot.position, box, 0)
        ),
        true,
        `${label} locker covers spot.position`
      );
      assertPointClear(spot.exitPosition, layout, CREATURE_RADIUS, `${label} locker exit`);
      assertReachable(layout, spot.exitPosition, `${label} locker reachable`);
    }

    assert.equal(layout.patrolRoutes.length, 2);
    const coveredRooms = new Set();
    for (const route of layout.patrolRoutes) {
      assert.ok(route.length >= 4, `${label} route length`);
      for (let stepIdx = 0; stepIdx < route.length; stepIdx++) {
        const current = route[stepIdx];
        const nextPoint = route[(stepIdx + 1) % route.length];
        assertSegmentClear(current, nextPoint, layout, `${label} patrol segment`);
        const matchingRoom = layout.rooms.find(
          room => Math.abs(current.x - room.x) < 5 && Math.abs(current.z - room.z) < 5
        );
        if (matchingRoom) coveredRooms.add(matchingRoom.id);
      }
    }
    assert.equal(coveredRooms.size, 9, `${label} patrol covers all 9 rooms`);

    layoutSignatures.add(JSON.stringify({ obstacles: layout.obstacles, tasks: layout.tasks }));
    routeSignatures.add(JSON.stringify(layout.patrolRoutes));
  }

  assert.ok(layoutSignatures.size > 300);
  assert.ok(routeSignatures.size > 300);
  assert.deepEqual([...spotCounts].sort(), [4, 5, 6]);
});
