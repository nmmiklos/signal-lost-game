import * as THREE from 'three';
import { generateLayout } from './layout.js';
import { createWorld } from './world.js';
import { createCreature } from './creature.js';
import { createBrain, updateBrain, blindBrain } from './ai.js';
import { createObjectives, updateObjectives, taskPrompt, nearestHidingSpot, canEnterHiding } from './objectives.js';
import { createFlashbang } from './flashbang.js';
import { Soundscape } from './audio.js';
import { SETTINGS, moveWithCollisions, clearLine } from './logic.js';

const element = id => document.getElementById(id);
const canvas = element('game');
const audio = new Soundscape();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 80);
camera.rotation.order = 'YXZ';
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 1.6, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
} catch {
  element('error').hidden = false;
  element('error-message').textContent = 'WebGL unavailable. Enable hardware acceleration and reload.';
  element('start').disabled = true;
}
if (renderer) initialize();

function initialize() {
  scene.add(camera);
  const creature = createCreature(scene);
  const flashbang = createFlashbang(scene);
  const fill = new THREE.PointLight(0x66aebc, 1.0, 4.5, 1.5);
  scene.add(fill);
  const forward = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const keys = new Set();
  const stageNames = { patrol: 'PATROL', notice: 'INVESTIGATING', search: 'SEARCHING', chase: 'HUNTED', blinded: 'BLINDED' };
  let layout;
  let world;
  let brain;
  let objectives;
  let run;
  let state = 'menu';
  let yaw = 0;
  let pitch = 0;
  let hiddenYaw = 0;
  let drag = null;
  let dragLook = false;
  let wasLocked = false;
  let interactPressed = false;
  let stamina = 4;
  let staminaDelay = 0;
  let speed = 0;
  let danger = 0;
  let stepDistance = 0;
  let hintTimer = 0;
  let flashPulse = 0;
  let deathTime = 0;
  let muted = false;
  let previousStage = 'patrol';
  let lastTime = performance.now();
  const taskCueTimes = new Map();

  function freshSeed() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] === layout?.seed ? (values[0] + 1) >>> 0 : values[0];
  }

  function rebuild(seed = freshSeed()) {
    world?.dispose();
    flashbang.reset();
    layout = generateLayout(seed);
    world = createWorld(scene, layout);
    brain = createBrain(layout);
    objectives = createObjectives(layout.tasks);
    run = { elapsed: 0, won: false, lost: false, hiddenId: null, crouched: false, flashCharges: 3, flashCooldown: 0, completed: new Set(), noise: 0 };
    element('seed-value').textContent = String(layout.seed);
    creature.reset();
    creature.group.position.set(brain.position.x, 0, brain.position.z);
    taskCueTimes.clear();
  }

  function hint(text, duration = 4) {
    element('hint').textContent = text;
    hintTimer = duration;
  }

  function enableDragLook() {
    dragLook = true;
    canvas.classList.add('drag-look');
    if (state === 'playing') hint('Drag to look / WASD move / C sneak / F flashbang', 6);
  }

  function lockPointer() {
    if (coarse) return;
    if (dragLook || !canvas.requestPointerLock || document.pointerLockEnabled === false) {
      enableDragLook();
      return;
    }
    try { canvas.requestPointerLock()?.catch(enableDragLook); } catch { enableDragLook(); }
  }

  function releaseInput() {
    keys.clear();
    if (drag && canvas.hasPointerCapture?.(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    interactPressed = false;
    speed = 0;
  }

  function begin(seed) {
    rebuild(typeof seed === 'number' || typeof seed === 'string' ? seed : undefined);
    releaseInput();
    yaw = 0;
    pitch = 0;
    stamina = 4;
    staminaDelay = 0;
    danger = 0;
    stepDistance = 0;
    flashPulse = 0;
    deathTime = 0;
    previousStage = 'patrol';
    camera.position.copy(world.spawn);
    camera.position.y = 1.65;
    camera.rotation.set(0, 0, 0);
    state = 'playing';
    document.body.classList.remove('is-hidden', 'is-crouched', 'is-danger');
    document.body.classList.add('playing');
    element('menu').hidden = true;
    element('ending').hidden = true;
    element('pause').hidden = true;
    element('hud').hidden = false;
    element('objective').textContent = 'RESTORE THREE SYSTEMS';
    hint('C to sneak. E at lockers to hide. F throws a flashbang.', 7);
    audio.start().catch(() => {});
    lockPointer();
    updateHud();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    releaseInput();
    element('pause').hidden = false;
    element('interact').hidden = true;
    document.exitPointerLock?.();
    element('resume').focus();
  }

  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    element('pause').hidden = true;
    audio.start().catch(() => {});
    lockPointer();
  }

  function finish(won) {
    if (state !== 'playing' && state !== 'dying') return;
    run.won = won;
    run.lost = !won;
    state = 'ended';
    releaseInput();
    element('hud').hidden = true;
    element('interact').hidden = true;
    element('ending').hidden = false;
    element('ending-title').textContent = won ? 'SIGNAL RESTORED' : 'DEPTH CLAIMED';
    element('ending-description').textContent = won ? `${formatTime(run.elapsed)} below. You left no trace.` : 'It followed the sound. Try another route.';
    document.body.classList.remove('playing', 'is-hidden', 'is-crouched', 'is-danger');
    document.body.style.setProperty('--danger', 0);
    document.exitPointerLock?.();
    if (won) audio.cue('win');
    element('restart').focus();
  }

  function throwFlash() {
    if (state !== 'playing') return;
    if (run.hiddenId) { hint('Leave cover before throwing.', 2); return; }
    if (run.flashCharges <= 0) { hint('No flashbangs. Complete a system to resupply.', 3); return; }
    if (run.flashCooldown > 0) return;
    camera.getWorldDirection(forward);
    const origin = camera.position.clone().addScaledVector(forward, 0.35);
    if (flashbang.throw(origin, forward.clone())) {
      run.flashCharges--;
      run.flashCooldown = 1.3;
      audio.cue('throw');
      hint('Flash out. Break sight and move.', 2);
    }
  }

  function toggleCrouch() {
    if (state !== 'playing' || run.hiddenId) return;
    run.crouched = !run.crouched;
    document.body.classList.toggle('is-crouched', run.crouched);
  }

  function updateHud() {
    element('relay-count').textContent = `${run.completed.size} / 3`;
    element('flash-count').textContent = `${run.flashCharges} / 3`;
    element('noise-fill').style.width = `${Math.min(100, run.noise * 100)}%`;
    element('noise-fill').parentElement.setAttribute('aria-valuenow', String(Math.round(run.noise * 100)));
    element('stealth-status').textContent = run.hiddenId ? 'HIDDEN' : run.crouched && brain.stage === 'patrol' ? 'LOW PROFILE' : stageNames[brain.stage] || 'PATROL';
    document.querySelectorAll('[data-relay]').forEach((indicator, index) => indicator.classList.toggle('is-active', objectives.tasks[index]?.complete));
    document.body.classList.toggle('is-danger', danger > 0.5 && !run.hiddenId);
    document.body.style.setProperty('--danger', run.hiddenId ? danger * 0.25 : danger);
  }

  function targetTask() {
    camera.getWorldDirection(forward);
    let target = null;
    let nearest = Infinity;
    for (const task of objectives.tasks) {
      if (task.complete) continue;
      const distance = Math.hypot(camera.position.x - task.position.x, camera.position.z - task.position.z);
      const tether = task.kind === 'valve' && task.progress > 0 && keys.has('KeyE');
      toward.set(task.position.x, 1.35, task.position.z).sub(camera.position).normalize();
      if (distance < (tether ? 2.9 : 2.6) && distance < nearest && (tether || forward.dot(toward) > 0.15)) {
        target = task;
        nearest = distance;
      }
    }
    return target;
  }

  function enterHiding(spot) {
    const distance = Math.hypot(brain.position.x - camera.position.x, brain.position.z - camera.position.z);
    if (!canEnterHiding({ seesPlayer: brain.seesPlayer, stage: brain.stage, distance })) {
      hint('It saw you. Break line of sight before hiding.', 3);
      return;
    }
    run.hiddenId = spot.id;
    hiddenYaw = spot.rotation + Math.PI;
    yaw = hiddenYaw;
    pitch = 0;
    camera.position.set(spot.position.x, 1.25, spot.position.z + 0.12);
    document.body.classList.add('is-hidden');
    audio.cue('hide');
    hint('Stay still. E to leave cover.', 5);
    stepDistance = 0;
  }

  function exitHiding() {
    const spot = world.hidingSpots.find(candidate => candidate.id === run.hiddenId);
    if (spot) camera.position.set(spot.exitPosition.x, run.crouched ? 1.05 : 1.65, spot.exitPosition.z);
    run.hiddenId = null;
    document.body.classList.remove('is-hidden');
    audio.cue('hide');
  }

  function interact(dt, noises) {
    let task = null;
    element('interact').hidden = true;
    if (run.hiddenId) {
      element('interact').hidden = false;
      element('interact-text').textContent = 'E / LEAVE COVER';
      if (interactPressed) exitHiding();
    } else {
      task = targetTask();
      const spot = nearestHidingSpot(camera.position, world.hidingSpots);
      const atExit = Math.hypot(camera.position.x - world.exit.position.x, camera.position.z - world.exit.position.z) < 1.9;
      if (task) {
        element('interact').hidden = false;
        element('interact-text').textContent = taskPrompt(task);
      } else if (spot) {
        element('interact').hidden = false;
        element('interact-text').textContent = 'E / HIDE';
        if (interactPressed) enterHiding(spot);
      } else if (atExit) {
        element('interact').hidden = false;
        element('interact-text').textContent = run.completed.size === 3 ? 'E / ASCEND' : 'AIRLOCK / SYSTEMS OFFLINE';
        if (interactPressed && run.completed.size === 3) finish(true);
      }
    }
    const changes = updateObjectives(objectives, dt, { targetId: task?.id ?? null, holding: keys.has('KeyE') && !run.hiddenId, pressed: interactPressed && Boolean(task) });
    noises.push(...changes.noises);
    for (const noise of changes.noises) {
      const previous = taskCueTimes.get(noise.kind) ?? -Infinity;
      if (run.elapsed - previous > 0.6) { audio.cue(noise.kind); taskCueTimes.set(noise.kind, run.elapsed); }
    }
    for (const id of changes.completed) {
      run.completed.add(id);
      run.flashCharges = Math.min(3, run.flashCharges + 1);
      audio.cue('task');
      hint(run.completed.size === 3 ? 'All systems online. Return to the AIRLOCK.' : 'System online. Flashbang resupplied.', 5);
      if (run.completed.size === 3) element('objective').textContent = 'RETURN TO THE AIRLOCK';
    }
    element('hold-fill').style.width = `${(task?.progress ?? 0) * 100}%`;
    interactPressed = false;
  }

  function movePlayer(dt, noises) {
    if (run.hiddenId) { speed = 0; return; }
    const walking = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const moving = Boolean(walking || strafe);
    const sprinting = keys.has('ShiftLeft') && moving && !run.crouched && stamina > 0.1;
    if (sprinting) {
      stamina = Math.max(0, stamina - dt);
      staminaDelay = 1.2;
    } else {
      staminaDelay -= dt;
      if (staminaDelay <= 0) stamina = Math.min(4, stamina + dt * 0.65);
    }
    const magnitude = Math.hypot(walking, strafe) || 1;
    const movementSpeed = run.crouched ? SETTINGS.crouchSpeed : sprinting ? SETTINGS.sprintSpeed : SETTINGS.walkSpeed;
    const deltaX = (-Math.sin(yaw) * walking + Math.cos(yaw) * strafe) / magnitude * movementSpeed * dt;
    const deltaZ = (-Math.cos(yaw) * walking - Math.sin(yaw) * strafe) / magnitude * movementSpeed * dt;
    const oldX = camera.position.x;
    const oldZ = camera.position.z;
    moveWithCollisions(camera.position, deltaX, deltaZ, world.obstacles, world.bounds);
    const distance = Math.hypot(camera.position.x - oldX, camera.position.z - oldZ);
    speed = distance / Math.max(dt, 0.001);
    stepDistance += distance;
    if (stepDistance > (run.crouched ? 1.4 : 1.2)) {
      stepDistance = 0;
      const radius = run.crouched ? 2 : sprinting ? 17 : 7;
      noises.push({ position: { x: camera.position.x, z: camera.position.z }, radius, kind: 'step' });
      run.noise = Math.max(run.noise, radius / 20);
    }
    const bob = reducedMotion ? 0 : Math.sin(run.elapsed * (sprinting ? 12 : 8)) * 0.018 * Math.min(speed, 2);
    const eyeHeight = (run.crouched ? 1.05 : 1.65) + bob;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, eyeHeight, 1 - Math.exp(-dt * 12));
  }

  function updatePredator(dt, noises, time) {
    let perception = { moving: false, danger: 0, caught: false };
    if (run.elapsed > 5) {
      perception = updateBrain(brain, dt, { player: camera.position, hidden: Boolean(run.hiddenId), noises, obstacles: world.obstacles, bounds: world.bounds, patrolRoutes: layout.patrolRoutes, completed: run.completed.size });
    }
    danger = perception.danger;
    creature.group.position.set(brain.position.x, 0, brain.position.z);
    creature.group.rotation.y = brain.yaw;
    creature.update(dt, time, { moving: perception.moving, aggression: brain.stage === 'chase' ? 1 : danger, lit: brain.stage === 'blinded' });
    if (brain.stage !== previousStage) {
      if (brain.stage === 'chase') hint('It saw you. Break sight. Find cover.', 3);
      previousStage = brain.stage;
    }
    if (perception.caught && !run.hiddenId) {
      state = 'dying';
      deathTime = 0;
      releaseInput();
      element('interact').hidden = true;
      audio.cue('hurt');
    }
  }

  function updateFlash(dt, noises) {
    run.flashCooldown = Math.max(0, run.flashCooldown - dt);
    for (const blast of flashbang.update(dt, { obstacles: world.obstacles, bounds: world.bounds })) {
      audio.cue('flash');
      noises.push({ position: blast.position, radius: 26, kind: 'flash' });
      run.noise = 1;
      const distance = Math.hypot(brain.position.x - blast.position.x, brain.position.z - blast.position.z);
      if (distance <= blast.radius && clearLine(blast.position, brain.position, world.obstacles, 0.02)) {
        blindBrain(brain, blast.duration);
        hint('Blinded. Move quietly and disappear.', 3);
      }
      if (Math.hypot(camera.position.x - blast.position.x, camera.position.z - blast.position.z) < 6) flashPulse = reducedMotion ? 0.04 : 0.2;
    }
    flashPulse = Math.max(0, flashPulse - dt * 0.8);
    element('flash-overlay').style.opacity = String(flashPulse);
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const time = now / 1000;
    if (state === 'playing') {
      const noises = [];
      run.elapsed += dt;
      run.noise = Math.max(0, run.noise - dt * 0.65);
      movePlayer(dt, noises);
      camera.rotation.set(pitch, yaw, 0);
      interact(dt, noises);
      for (const noise of noises) run.noise = Math.max(run.noise, Math.min(1, noise.radius / 20));
      if (state === 'playing') {
        updateFlash(dt, noises);
        updatePredator(dt, noises, time);
      }
      hintTimer -= dt;
      if (hintTimer <= 0) element('hint').textContent = run.hiddenId ? 'E / LEAVE COVER' : run.crouched ? 'CROUCHED / QUIET FOOTSTEPS' : '';
      updateHud();
    } else if (state === 'menu') {
      camera.position.set(3.2 + Math.sin(time * 0.12) * 0.25, 2.0, 3.2);
      camera.lookAt(-2, 1.3, -4);
      creature.group.position.set(2.5, 0, -2.8);
      creature.group.rotation.y = -0.3;
      creature.update(dt, time, { moving: false, aggression: 0, lit: false });
    } else if (state === 'dying') {
      deathTime += dt;
      toward.set(brain.position.x, 2.0, brain.position.z);
      camera.lookAt(toward);
      if (!reducedMotion) camera.rotation.z = Math.sin(deathTime * 23) * 0.04;
      document.body.style.setProperty('--danger', 1);
      if (deathTime > 0.85) finish(false);
    }
    world.update(state === 'playing' ? dt : 0, time, run.completed);
    fill.position.copy(camera.position);
    fill.intensity = run.hiddenId ? 0.12 : 1.0;
    audio.update(dt, { danger, speed: state === 'playing' ? speed : 0, powered: run.completed.size, paused: state !== 'playing' && state !== 'dying', stage: brain.stage, hidden: Boolean(run.hiddenId), crouched: run.crouched });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function changeLook(deltaX, deltaY, sensitivity) {
    yaw -= deltaX * sensitivity;
    pitch -= deltaY * sensitivity;
    if (run.hiddenId) {
      yaw = THREE.MathUtils.clamp(yaw, hiddenYaw - 0.9, hiddenYaw + 0.9);
      pitch = THREE.MathUtils.clamp(pitch, -0.45, 0.4);
    } else pitch = THREE.MathUtils.clamp(pitch, -1.35, 1.35);
  }

  function pressAction(action) {
    if (state !== 'playing') return;
    if (action === 'flash') throwFlash();
    else if (action === 'crouch') toggleCrouch();
    else if (action === 'interact') { if (!keys.has('KeyE')) interactPressed = true; keys.add('KeyE'); }
    else {
      const bindings = { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft' };
      if (bindings[action]) keys.add(bindings[action]);
    }
  }

  function releaseAction(action) {
    const bindings = { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', interact: 'KeyE' };
    if (bindings[action]) keys.delete(bindings[action]);
  }

  element('start').addEventListener('click', () => begin());
  element('restart').addEventListener('click', () => begin());
  element('restart-pause').addEventListener('click', () => begin());
  element('resume').addEventListener('click', resume);
  element('mute').addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    element('mute').setAttribute('aria-pressed', String(muted));
    element('mute').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
    const label = element('mute').querySelector('.mute-label');
    if (label) label.textContent = muted ? 'MUTED' : 'AUDIO';
  });
  document.addEventListener('keydown', event => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyC', 'ShiftLeft', 'ShiftRight', 'Escape', 'KeyP'].includes(event.code)) return;
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (!event.repeat) { if (state === 'paused') resume(); else pause(); }
      return;
    }
    if (state !== 'playing') return;
    event.preventDefault();
    if (event.code === 'KeyF' && !event.repeat) throwFlash();
    if (event.code === 'KeyC' && !event.repeat) toggleCrouch();
    if (event.code === 'KeyE' && !event.repeat && !keys.has('KeyE')) interactPressed = true;
    keys.add(event.code === 'ShiftRight' ? 'ShiftLeft' : event.code);
  });
  document.addEventListener('keyup', event => keys.delete(event.code === 'ShiftRight' ? 'ShiftLeft' : event.code));
  document.addEventListener('pointerlockerror', enableDragLook);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (wasLocked && !locked) pause();
    wasLocked = locked;
    drag = null;
  });
  document.addEventListener('mousemove', event => {
    if (state === 'playing' && document.pointerLockElement === canvas) changeLook(event.movementX, event.movementY, 0.0022);
  });
  canvas.addEventListener('pointerdown', event => {
    if (state !== 'playing' || document.pointerLockElement === canvas) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (state !== 'playing' || !drag || drag.id !== event.pointerId || document.pointerLockElement === canvas) return;
    changeLook(event.clientX - drag.x, event.clientY - drag.y, drag.touch ? 0.004 : 0.0022);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  const endDrag = event => { if (drag?.id === event.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('click', () => { if (state === 'playing' && !dragLook) lockPointer(); });
  document.querySelectorAll('[data-action]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (state !== 'playing') return;
      button.setPointerCapture(event.pointerId);
      pressAction(button.dataset.action);
    });
    const release = () => releaseAction(button.dataset.action);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    pause();
    element('error').hidden = false;
    element('error-message').textContent = 'Graphics connection lost. Reload to reconnect.';
  });
  rebuild();
  if (new URLSearchParams(location.search).has('test')) {
    window.__game = { get run() { return run; }, get state() { return state; }, get world() { return world; }, get layout() { return layout; }, get brain() { return brain; }, get objectives() { return objectives; }, camera, creature, flashbang, renderer, begin, pause, resume,
      aim(nextYaw, nextPitch = 0) { yaw = nextYaw; pitch = nextPitch; } };
  }
  requestAnimationFrame(frame);
}

function formatTime(seconds) {
  const elapsed = Math.max(0, seconds);
  return `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
}
