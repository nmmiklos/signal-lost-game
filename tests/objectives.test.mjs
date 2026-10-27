import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectives, updateObjectives, taskPrompt, nearestHidingSpot, canEnterHiding } from '../src/objectives.js';

const descriptors = ['valve', 'fuse', 'uplink'].map((kind) => ({ id: kind, kind, position: { x: 1, z: 2 } }));
const tick = (state, dt, targetId, holding = false, pressed = false) => updateObjectives(state, dt, { targetId, holding, pressed });

test('valve requires an uninterrupted hold and emits noise', () => {
  const state = createObjectives(descriptors);
  assert.equal(tick(state, 2, 'valve', true).noises[0].kind, 'valve');
  assert.equal(state.tasks[0].progress, 0.5);
  tick(state, 1, null);
  assert.equal(state.tasks[0].progress, 0);
  assert.deepEqual(tick(state, 4, 'valve', true).completed, ['valve']);
  assert.deepEqual(tick(state, 4, 'valve', true).completed, []);
});

test('fuse counts press edges rather than held frames', () => {
  const state = createObjectives(descriptors);
  tick(state, 0.1, 'fuse', true, true);
  for (let frame = 0; frame < 20; frame++) tick(state, 0.1, 'fuse', true, false);
  assert.equal(state.tasks[1].steps, 1);
  tick(state, 0.1, 'fuse', true, true);
  assert.match(taskPrompt(state.tasks[1]), /2\/3/);
  assert.deepEqual(tick(state, 0.1, 'fuse', true, true).completed, ['fuse']);
});

test('uplink progresses unattended with periodic noise', () => {
  const state = createObjectives(descriptors);
  assert.equal(tick(state, 0, 'uplink', false, true).noises.length, 1);
  assert.equal(tick(state, 2, null).noises[0].kind, 'uplink');
  assert.equal(state.tasks[2].progress, 0.25);
  tick(state, Infinity, null);
  assert.equal(state.tasks[2].progress, 0.25);
  assert.deepEqual(tick(state, 6, null).completed, ['uplink']);
});

test('hiding uses the exit and visibility boundary', () => {
  const spots = [{ position: { x: 0, z: 0 }, exitPosition: { x: 0, z: 3 } }];
  assert.equal(nearestHidingSpot({ x: 0, z: 0 }, spots), null);
  assert.equal(nearestHidingSpot({ x: 0, z: 3 }, spots), spots[0]);
  assert.equal(canEnterHiding({ seesPlayer: true, stage: 'chase', distance: 14 }), false);
  assert.equal(canEnterHiding({ seesPlayer: false, stage: 'search', distance: 1 }), true);
  assert.equal(canEnterHiding({ seesPlayer: true, stage: 'blinded', distance: 1 }), true);
  assert.equal(canEnterHiding({ seesPlayer: true, stage: 'chase', distance: 15 }), true);
});
