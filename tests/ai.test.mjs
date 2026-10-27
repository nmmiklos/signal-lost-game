import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrain, updateBrain, blindBrain } from '../src/ai.js';
import { generateLayout } from '../src/layout.js';

function createMockLayout() {
  const bounds = { minX: -15, maxX: 15, minZ: -25, maxZ: 5 };
  const obstacles = [
    {
      min: { x: -4, y: 0, z: -15 },
      max: { x: 4, y: 3, z: -14 },
      kind: 'wall',
    },
  ];
  const patrolRoutes = [
    [
      { x: -8, z: -20 },
      { x: 8, z: -20 },
      { x: 8, z: -8 },
      { x: -8, z: -8 },
    ],
  ];
  return {
    bounds,
    obstacles,
    enemySpawn: { x: -8, z: -20 },
    patrolRoutes,
  };
}

test('patrol follows waypoints around obstacles without supernatural danger', () => {
  const layout = createMockLayout();
  const brain = createBrain(layout);
  assert.equal(brain.stage, 'patrol');
  assert.equal(brain.seesPlayer, false);

  const playerBehindWall = { x: 0, z: -10 };
  const result = updateBrain(brain, 1.0, {
    player: playerBehindWall,
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
    completed: new Set(),
  });

  assert.equal(result.stage, 'patrol');
  assert.equal(result.seesPlayer, false);
  assert.equal(result.danger, 0);
  assert.equal(result.moving, true);
  assert.ok(brain.position.x > -8);
});

test('hearing noise enters notice with snapshot, then search, then patrol', () => {
  const layout = createMockLayout();
  const brain = createBrain(layout);
  const livePlayer = { x: 6, z: -18 };
  const noiseSource = { x: 0, z: -18 };

  const noticeState = updateBrain(brain, 0.2, {
    player: { x: -12, z: 2 },
    hidden: false,
    noises: [{ position: noiseSource, radius: 12, kind: 'valve' }],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });

  assert.equal(noticeState.stage, 'notice');
  assert.ok(noticeState.danger > 0);
  assert.deepEqual(brain.lastHeard, { x: 0, z: -18 });

  noiseSource.x = 12;
  livePlayer.x = -12;
  assert.deepEqual(brain.lastHeard, { x: 0, z: -18 });

  const searchState = updateBrain(brain, 2.5, {
    player: { x: -12, z: 2 },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(searchState.stage, 'search');

  const patrolState = updateBrain(brain, 5.0, {
    player: { x: -12, z: 2 },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(patrolState.stage, 'patrol');
  assert.equal(patrolState.danger, 0);
});

test('wall attenuates quiet noise across obstacle', () => {
  const layout = createMockLayout();
  layout.enemySpawn = { x: 0, z: -19 };
  const brain = createBrain(layout);

  const blockedNoise = updateBrain(brain, 0.1, {
    player: { x: -12, z: 2 },
    hidden: false,
    noises: [{ position: { x: 0, z: -11 }, radius: 10, kind: 'step' }],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(blockedNoise.stage, 'patrol');

  const loudNoise = updateBrain(brain, 0.1, {
    player: { x: -12, z: 2 },
    hidden: false,
    noises: [{ position: { x: 0, z: -11 }, radius: 16, kind: 'uplink' }],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(loudNoise.stage, 'notice');
});

test('sight triggers chase and occlusion transitions to search at lastSeen snapshot', () => {
  const layout = createMockLayout();
  layout.enemySpawn = { x: -6, z: -20 };
  const brain = createBrain(layout);
  const playerPosition = { x: 0, z: -20 };

  const chaseState = updateBrain(brain, 0.2, {
    player: playerPosition,
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });

  assert.equal(chaseState.stage, 'chase');
  assert.equal(chaseState.seesPlayer, true);
  assert.ok(chaseState.danger >= 0.65);
  assert.deepEqual(brain.lastSeen, { x: 0, z: -20 });

  playerPosition.x = 0;
  playerPosition.z = -10;

  const occludedState = updateBrain(brain, 0.2, {
    player: playerPosition,
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });

  assert.equal(occludedState.stage, 'search');
  assert.equal(occludedState.seesPlayer, false);
  assert.deepEqual(brain.lastSeen, { x: 0, z: -20 });
  assert.notEqual(brain.target.z, -10);
});

test('close peripheral sight detects nearby player while distant rear player stays unseen', () => {
  const layout = createMockLayout();
  layout.enemySpawn = { x: 0, z: -20 };
  const brain = createBrain(layout);
  brain.yaw = 0;

  const farBehind = updateBrain(brain, 0.1, {
    player: { x: 0, z: -24.2 },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(farBehind.seesPlayer, false);

  const closePeripheral = updateBrain(brain, 0.1, {
    player: { x: brain.position.x - 1.8, z: brain.position.z - 1.2 },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(closePeripheral.seesPlayer, true);
  assert.equal(closePeripheral.stage, 'chase');
});

test('hidden player cannot be seen or caught', () => {
  const layout = createMockLayout();
  layout.enemySpawn = { x: 0, z: -20 };
  const brain = createBrain(layout);

  const hiddenResult = updateBrain(brain, 0.2, {
    player: { x: 0.4, z: -20 },
    hidden: true,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });

  assert.equal(hiddenResult.seesPlayer, false);
  assert.equal(hiddenResult.caught, false);
  assert.equal(hiddenResult.stage, 'patrol');
});

test('blindBrain slows movement, prevents sight and catch, then searches after expiry', () => {
  const layout = createMockLayout();
  layout.enemySpawn = { x: -6, z: -20 };
  const brain = createBrain(layout);

  updateBrain(brain, 0.1, {
    player: { x: -3, z: -20 },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(brain.stage, 'chase');

  blindBrain(brain, 5);
  assert.equal(brain.stage, 'blinded');

  const startX = brain.position.x;
  const startZ = brain.position.z;
  const midBlind = updateBrain(brain, 1.0, {
    player: { x: brain.position.x + 0.3, z: brain.position.z },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });

  const blindMoved = Math.hypot(brain.position.x - startX, brain.position.z - startZ);
  assert.equal(midBlind.stage, 'blinded');
  assert.equal(midBlind.seesPlayer, false);
  assert.equal(midBlind.caught, false);
  assert.ok(blindMoved > 0.1 && blindMoved < 0.8);

  const afterBlind = updateBrain(brain, 4.1, {
    player: { x: 10, z: 2 },
    hidden: false,
    noises: [],
    obstacles: layout.obstacles,
    bounds: layout.bounds,
    patrolRoutes: layout.patrolRoutes,
  });
  assert.equal(afterBlind.stage, 'search');
});

test('generated layouts patrol cleanly without colliding or getting stuck', () => {
  for (let seedValue = 1; seedValue <= 12; seedValue++) {
    const layout = generateLayout(seedValue);
    const brain = createBrain(layout);
    for (let tickIndex = 0; tickIndex < 30; tickIndex++) {
      const state = updateBrain(brain, 0.25, {
        player: layout.spawn,
        hidden: true,
        noises: [],
        obstacles: layout.obstacles,
        bounds: layout.bounds,
        patrolRoutes: layout.patrolRoutes,
      });
      assert.equal(state.stage, 'patrol');
      assert.equal(state.moving, true);
      for (const box of layout.obstacles) {
        const insideX = brain.position.x > box.min.x - 0.46 && brain.position.x < box.max.x + 0.46;
        const insideZ = brain.position.z > box.min.z - 0.46 && brain.position.z < box.max.z + 0.46;
        assert.equal(insideX && insideZ, false);
      }
    }
  }
});
