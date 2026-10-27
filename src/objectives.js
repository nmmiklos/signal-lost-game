export function createObjectives(tasks) {
  return { tasks: tasks.map((task) => ({ ...task, progress: 0, complete: false, started: false, steps: 0 })) };
}

export function updateObjectives(state, dt, { targetId, holding, pressed }) {
  const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const completed = [];
  const noises = [];
  for (const task of state.tasks) {
    if (task.complete) continue;
    const targeted = task.id === targetId;
    const previousProgress = task.progress;
    let madeNoise = false;
    if (task.kind === 'valve') {
      if (targeted && holding) {
        task.started = true;
        const duration = task.duration > 0 && Number.isFinite(task.duration) ? task.duration : 4;
        task.progress = Math.min(1, task.progress + elapsed / duration);
        madeNoise = elapsed > 0 && (previousProgress === 0 || Math.floor(previousProgress * 4) !== Math.floor(task.progress * 4));
      } else {
        task.progress = 0;
        task.started = false;
      }
    } else if (task.kind === 'fuse') {
      if (targeted && pressed) {
        task.started = true;
        task.steps = Math.min(3, task.steps + 1);
        task.progress = task.steps / 3;
        madeNoise = true;
      }
    } else if (task.kind === 'uplink') {
      if (targeted && pressed && !task.started) {
        task.started = true;
        madeNoise = true;
      }
      if (task.started) {
        const duration = task.duration > 0 && Number.isFinite(task.duration) ? task.duration : 8;
        task.progress = Math.min(1, task.progress + elapsed / duration);
        madeNoise ||= Math.floor(previousProgress * duration / 2) !== Math.floor(task.progress * duration / 2);
      }
    }
    if (madeNoise) {
      noises.push({ position: { x: task.position.x, z: task.position.z }, radius: task.kind === 'uplink' ? 14 : task.kind === 'valve' ? 12 : 8, kind: task.kind });
    }
    if (task.progress >= 1) {
      task.complete = true;
      completed.push(task.id);
    }
  }
  return { completed, noises };
}

export function taskPrompt(task) {
  if (task.complete) return 'Complete';
  if (task.kind === 'valve') return 'Hold E to turn valve';
  if (task.kind === 'fuse') return `Press E to fit fuse (${task.steps}/3)`;
  if (task.kind === 'uplink') return task.started ? 'Transmission in progress' : 'Press E to start uplink';
  return '';
}

export function nearestHidingSpot(player, spots, range = 1.8) {
  let nearest = null;
  let nearestDistance = range * range;
  for (const spot of spots) {
    const deltaX = player.x - spot.exitPosition.x;
    const deltaZ = player.z - spot.exitPosition.z;
    const distance = deltaX * deltaX + deltaZ * deltaZ;
    if (distance <= nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function canEnterHiding({ seesPlayer, stage, distance }) {
  return stage === 'blinded' || !seesPlayer || distance > 14;
}
