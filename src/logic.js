export const SETTINGS = Object.freeze({
  playerRadius: 0.32,
  walkSpeed: 2.6,
  sprintSpeed: 4.4,
  crouchSpeed: 1.25,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function blocked(position, obstacles, radius) {
  return obstacles.some(box => position.x > box.min.x - radius && position.x < box.max.x + radius && position.z > box.min.z - radius && position.z < box.max.z + radius);
}

export function moveWithCollisions(position, dx, dz, obstacles, bounds, radius = SETTINGS.playerRadius) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.16));
  for (let index = 0; index < steps; index++) {
    const nextX = clamp(position.x + dx / steps, bounds.minX + radius, bounds.maxX - radius);
    if (!blocked({ x: nextX, z: position.z }, obstacles, radius)) position.x = nextX;
    const nextZ = clamp(position.z + dz / steps, bounds.minZ + radius, bounds.maxZ - radius);
    if (!blocked({ x: position.x, z: nextZ }, obstacles, radius)) position.z = nextZ;
  }
  return position;
}

export function clearLine(from, to, obstacles, padding = 0) {
  return !obstacles.some(box => {
    let start = 0;
    let end = 1;
    for (const axis of ['x', 'z']) {
      const delta = to[axis] - from[axis];
      const minimum = box.min[axis] - padding;
      const maximum = box.max[axis] + padding;
      if (Math.abs(delta) < 1e-9) {
        if (from[axis] < minimum || from[axis] > maximum) return false;
      } else {
        const first = (minimum - from[axis]) / delta;
        const last = (maximum - from[axis]) / delta;
        start = Math.max(start, Math.min(first, last));
        end = Math.min(end, Math.max(first, last));
        if (start > end) return false;
      }
    }
    return start <= end;
  });
}

export function findPath(from, to, obstacles, bounds, radius = 0.4) {
  if (clearLine(from, to, obstacles, radius)) return [{ x: to.x, z: to.z }];
  const minimumX = Math.ceil(bounds.minX + radius);
  const minimumZ = Math.ceil(bounds.minZ + radius);
  const width = Math.floor(bounds.maxX - radius) - minimumX + 1;
  const height = Math.floor(bounds.maxZ - radius) - minimumZ + 1;
  const point = index => ({ x: minimumX + index % width, z: minimumZ + Math.floor(index / width) });
  const nearest = position => {
    let best = -1;
    let distance = Infinity;
    for (let index = 0; index < width * height; index++) {
      const candidate = point(index);
      const cost = (candidate.x - position.x) ** 2 + (candidate.z - position.z) ** 2;
      if (cost < distance && !blocked(candidate, obstacles, radius) && clearLine(position, candidate, obstacles, radius)) {
        best = index;
        distance = cost;
      }
    }
    return best;
  };
  const start = nearest(from);
  const goal = nearest(to);
  if (start < 0 || goal < 0) return [];
  const previous = new Int32Array(width * height).fill(-2);
  previous[start] = -1;
  const queue = [start];
  let cursor = 0;
  while (cursor < queue.length && previous[goal] === -2) {
    const current = queue[cursor++];
    const location = point(current);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const column = current % width + dx;
      const row = Math.floor(current / width) + dz;
      if (column < 0 || column >= width || row < 0 || row >= height) continue;
      const next = row * width + column;
      if (previous[next] !== -2) continue;
      if (!clearLine(location, point(next), obstacles, radius)) continue;
      previous[next] = current;
      queue.push(next);
    }
  }
  if (previous[goal] === -2) return [];
  const path = [];
  for (let current = goal; current !== start; current = previous[current]) path.push(point(current));
  path.reverse();
  if (Math.hypot(from.x - point(start).x, from.z - point(start).z) > 0.02) path.unshift(point(start));
  path.push({ x: to.x, z: to.z });
  return path;
}
