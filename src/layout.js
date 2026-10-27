import { clearLine, findPath } from './logic.js';

const BOUNDS = Object.freeze({ minX: -15, maxX: 15, minZ: -25, maxZ: 5 });
const SPAWN = Object.freeze({ x: 0, z: 2 });
const EXIT = Object.freeze({ x: 0, z: 3.6 });
const COL_CENTERS = Object.freeze([-10, 0, 10]);
const ROW_CENTERS = Object.freeze([0, -10, -20]);
const CREATURE_RADIUS = 0.46;
const SAFE_PADDING = 0.48;
const WALL_HALF_THICK = 0.2;
const WALL_HEIGHT = 5;
const DOOR_WIDTHS = Object.freeze([3.2, 3.4, 3.6]);
const DOOR_OFFSETS = Object.freeze([-1, 0, 1]);

const TASK_SPECS = Object.freeze([
  { id: 'task-valve', kind: 'valve', title: 'Ballast Pressure Valve', duration: 4 },
  { id: 'task-fuse', kind: 'fuse', title: 'High-Voltage Fuse Box', duration: 3 },
  { id: 'task-uplink', kind: 'uplink', title: 'Telemetry Uplink Array', duration: 8 },
]);

function hashSeed(seedInput) {
  const text = String(seedInput ?? 'signal-lost');
  let state = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index++) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  if (typeof seedInput === 'number' && Number.isFinite(seedInput)) {
    state ^= (seedInput | 0) >>> 0;
  }
  state = Math.imul(state ^ (state >>> 16), 2246822507) >>> 0;
  state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  return state === 0 ? 0x9e3779b9 : state;
}

function createRandom(seedInput) {
  let state = hashSeed(seedInput);
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickItem(list, random) {
  return list[Math.floor(random() * list.length)];
}

function shuffleItems(items, random) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = temp;
  }
  return copy;
}

function makeBox(minX, minY, minZ, maxX, maxY, maxZ, kind) {
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    kind,
  };
}

function buildRooms() {
  const rooms = [];
  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    for (let colIndex = 0; colIndex < 3; colIndex++) {
      rooms.push({
        id: `room-${colIndex}-${rowIndex}`,
        x: COL_CENTERS[colIndex],
        z: ROW_CENTERS[rowIndex],
        width: 10,
        depth: 10,
      });
    }
  }
  return rooms;
}

function buildInternalEdges() {
  const edges = [];
  for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
    const roomZ = ROW_CENTERS[rowIndex];
    for (let colIndex = 0; colIndex < 2; colIndex++) {
      const leftRoom = rowIndex * 3 + colIndex;
      const rightRoom = leftRoom + 1;
      const wallX = colIndex === 0 ? -5 : 5;
      edges.push({
        id: `edge-v-${colIndex}-${rowIndex}`,
        roomA: leftRoom,
        roomB: rightRoom,
        axis: 'x',
        wallCoord: wallX,
        spanStart: roomZ - 5,
        spanEnd: roomZ + 5,
        spanMid: roomZ,
        rowIndex,
        colIndex,
      });
    }
  }
  for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
    const wallZ = rowIndex === 0 ? -5 : -15;
    for (let colIndex = 0; colIndex < 3; colIndex++) {
      const southRoom = rowIndex * 3 + colIndex;
      const northRoom = southRoom + 3;
      const roomX = COL_CENTERS[colIndex];
      edges.push({
        id: `edge-h-${colIndex}-${rowIndex}`,
        roomA: southRoom,
        roomB: northRoom,
        axis: 'z',
        wallCoord: wallZ,
        spanStart: roomX - 5,
        spanEnd: roomX + 5,
        spanMid: roomX,
        rowIndex,
        colIndex,
      });
    }
  }
  return edges;
}

function selectDoorNetwork(edges, random) {
  const shuffled = shuffleItems(edges, random);
  const parents = Array.from({ length: 9 }, (unused, roomIndex) => roomIndex);
  const degrees = new Int32Array(9);
  const openIds = new Set();

  function findRoot(node) {
    let current = node;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  }

  const remaining = [];
  for (const edge of shuffled) {
    const rootA = findRoot(edge.roomA);
    const rootB = findRoot(edge.roomB);
    if (rootA !== rootB) {
      parents[rootA] = rootB;
      openIds.add(edge.id);
      degrees[edge.roomA]++;
      degrees[edge.roomB]++;
    } else {
      remaining.push(edge);
    }
  }

  const targetLoopDoors = random() < 0.5 ? 2 : 3;
  let addedLoops = 0;
  for (const edge of remaining) {
    if (addedLoops >= targetLoopDoors) break;
    if (degrees[edge.roomA] <= 1 || degrees[edge.roomB] <= 1) {
      openIds.add(edge.id);
      degrees[edge.roomA]++;
      degrees[edge.roomB]++;
      addedLoops++;
    }
  }
  for (const edge of remaining) {
    if (addedLoops >= targetLoopDoors) break;
    if (!openIds.has(edge.id)) {
      openIds.add(edge.id);
      degrees[edge.roomA]++;
      degrees[edge.roomB]++;
      addedLoops++;
    }
  }

  return edges.map(edge => {
    const isOpen = openIds.has(edge.id);
    const doorOffset = isOpen ? pickItem(DOOR_OFFSETS, random) : 0;
    const doorWidth = isOpen ? pickItem(DOOR_WIDTHS, random) : 0;
    return {
      ...edge,
      open: isOpen,
      doorOffset,
      doorWidth,
      doorCenter: edge.spanMid + doorOffset,
    };
  });
}

function buildWallObstacles(edgeStates) {
  const walls = [];
  for (const edge of edgeStates) {
    if (!edge.open) {
      if (edge.axis === 'x') {
        walls.push(
          makeBox(
            edge.wallCoord - WALL_HALF_THICK,
            0,
            edge.spanStart,
            edge.wallCoord + WALL_HALF_THICK,
            WALL_HEIGHT,
            edge.spanEnd,
            'wall'
          )
        );
      } else {
        walls.push(
          makeBox(
            edge.spanStart,
            0,
            edge.wallCoord - WALL_HALF_THICK,
            edge.spanEnd,
            WALL_HEIGHT,
            edge.wallCoord + WALL_HALF_THICK,
            'wall'
          )
        );
      }
      continue;
    }

    const halfGap = edge.doorWidth * 0.5;
    const firstEnd = Number((edge.doorCenter - halfGap).toFixed(3));
    const secondStart = Number((edge.doorCenter + halfGap).toFixed(3));
    if (edge.axis === 'x') {
      walls.push(
        makeBox(
          edge.wallCoord - WALL_HALF_THICK,
          0,
          edge.spanStart,
          edge.wallCoord + WALL_HALF_THICK,
          WALL_HEIGHT,
          firstEnd,
          'wall'
        ),
        makeBox(
          edge.wallCoord - WALL_HALF_THICK,
          0,
          secondStart,
          edge.wallCoord + WALL_HALF_THICK,
          WALL_HEIGHT,
          edge.spanEnd,
          'wall'
        )
      );
    } else {
      walls.push(
        makeBox(
          edge.spanStart,
          0,
          edge.wallCoord - WALL_HALF_THICK,
          firstEnd,
          WALL_HEIGHT,
          edge.wallCoord + WALL_HALF_THICK,
          'wall'
        ),
        makeBox(
          secondStart,
          0,
          edge.wallCoord - WALL_HALF_THICK,
          edge.spanEnd,
          WALL_HEIGHT,
          edge.wallCoord + WALL_HALF_THICK,
          'wall'
        )
      );
    }
  }
  return walls;
}

function findHorizontalEdge(edgeStates, colIndex, wallZ) {
  return edgeStates.find(edge => edge.axis === 'z' && edge.colIndex === colIndex && edge.wallCoord === wallZ) || null;
}

function chooseSafeAlcoveSide(doorEdge, random) {
  if (!doorEdge || !doorEdge.open || doorEdge.doorOffset === 0) {
    return random() < 0.5 ? -1 : 1;
  }
  return doorEdge.doorOffset < 0 ? 1 : -1;
}

function buildHidingSpotsAndLockers(rooms, edgeStates, random) {
  const desiredCount = 4 + Math.floor(random() * 3);
  const roomOrder = shuffleItems([0, 2, 3, 4, 5, 6, 7, 8, 1], random);
  const selectedRooms = roomOrder.slice(0, desiredCount);
  const hidingSpots = [];
  const lockerObstacles = [];

  for (let spotIndex = 0; spotIndex < selectedRooms.length; spotIndex++) {
    const roomIndex = selectedRooms[spotIndex];
    const room = rooms[roomIndex];
    const colIndex = roomIndex % 3;
    const northWallZ = room.z - 5;
    const northEdge = findHorizontalEdge(edgeStates, colIndex, northWallZ);
    const sideSign = chooseSafeAlcoveSide(northEdge, random);
    const lockerX = room.x + sideSign * 3;
    const lockerZ = room.z - 4.2;
    const exitZ = room.z - 3;

    lockerObstacles.push(
      makeBox(
        lockerX - 0.48,
        0,
        room.z - 4.65,
        lockerX + 0.48,
        2.4,
        room.z - 3.75,
        'locker'
      )
    );

    hidingSpots.push({
      id: `locker-${spotIndex + 1}`,
      position: { x: lockerX, z: lockerZ },
      exitPosition: { x: lockerX, z: exitZ },
      rotation: 0,
    });
  }

  return { hidingSpots, lockerObstacles };
}

function buildCrateObstacles(rooms, edgeStates, random) {
  const candidateRooms = shuffleItems([0, 2, 3, 4, 5, 6, 7, 8], random);
  const crateCount = 5 + Math.floor(random() * 4);
  const crates = [];

  for (let index = 0; index < crateCount && index < candidateRooms.length; index++) {
    const roomIndex = candidateRooms[index];
    const room = rooms[roomIndex];
    const colIndex = roomIndex % 3;
    const southWallZ = room.z + 5;
    const southEdge = findHorizontalEdge(edgeStates, colIndex, southWallZ);
    const sideSign = chooseSafeAlcoveSide(southEdge, random);
    const crateX = room.x + sideSign * 3.6;
    const crateZ = room.z + 3.6;
    crates.push(
      makeBox(
        Number((crateX - 0.48).toFixed(3)),
        0,
        Number((crateZ - 0.48).toFixed(3)),
        Number((crateX + 0.48).toFixed(3)),
        1.2,
        Number((crateZ + 0.48).toFixed(3)),
        'crate'
      )
    );
  }

  return crates;
}

function buildTasks(rooms, random) {
  const middleAndSideRooms = shuffleItems([0, 2, 3, 4, 5], random);
  const deepRooms = shuffleItems([6, 7, 8], random);
  const chosenRoomIndices = shuffleItems(
    [deepRooms[0], deepRooms[1], middleAndSideRooms[0]],
    random
  );
  const shuffledSpecs = shuffleItems(TASK_SPECS, random);
  const tasks = [];

  for (let index = 0; index < 3; index++) {
    const spec = shuffledSpecs[index];
    const room = rooms[chosenRoomIndices[index]];
    const offsetX = pickItem([-1, 0, 1], random);
    const posX = room.x + offsetX;
    const posZ = room.z - 1.5;
    tasks.push({
      id: spec.id,
      kind: spec.kind,
      title: spec.title,
      position: { x: posX, z: posZ },
      approach: { x: posX, z: posZ + 1.5 },
      duration: spec.duration,
    });
  }

  return tasks;
}

function selectEnemySpawn(rooms, random) {
  const deepIndices = shuffleItems([6, 7, 8], random);
  const chosenRoom = rooms[deepIndices[0]];
  const offsetX = pickItem([-1, 0, 1], random);
  const offsetZ = pickItem([0, 1], random);
  return {
    point: { x: chosenRoom.x + offsetX, z: chosenRoom.z + offsetZ },
    roomIndex: deepIndices[0],
  };
}

function simplifyLeg(fromPoint, legPoints, obstacles) {
  if (legPoints.length === 0) return [];
  const simplified = [];
  let current = fromPoint;
  let cursor = 0;

  while (cursor < legPoints.length) {
    let chosenIndex = cursor;
    for (let probe = legPoints.length - 1; probe > cursor; probe--) {
      const candidate = legPoints[probe];
      if (
        clearLine(current, candidate, obstacles, SAFE_PADDING) &&
        clearLine(current, candidate, obstacles, CREATURE_RADIUS)
      ) {
        chosenIndex = probe;
        break;
      }
    }
    const nextPoint = legPoints[chosenIndex];
    simplified.push({ x: nextPoint.x, z: nextPoint.z });
    current = nextPoint;
    cursor = chosenIndex + 1;
  }

  return simplified;
}

function buildClosedRoute(anchors, obstacles, bounds) {
  const route = [{ x: anchors[0].x, z: anchors[0].z }];

  for (let stepIndex = 0; stepIndex < anchors.length; stepIndex++) {
    const fromPoint = route[route.length - 1];
    const targetPoint = anchors[(stepIndex + 1) % anchors.length];
    if (Math.hypot(fromPoint.x - targetPoint.x, fromPoint.z - targetPoint.z) < 0.05) {
      continue;
    }
    const rawLeg = findPath(fromPoint, targetPoint, obstacles, bounds, CREATURE_RADIUS);
    const legSteps = simplifyLeg(fromPoint, rawLeg, obstacles);
    for (const point of legSteps) {
      const lastPoint = route[route.length - 1];
      if (Math.hypot(lastPoint.x - point.x, lastPoint.z - point.z) >= 0.05) {
        route.push({ x: point.x, z: point.z });
      }
    }
  }

  while (
    route.length > 1 &&
    Math.hypot(route[route.length - 1].x - route[0].x, route[route.length - 1].z - route[0].z) < 0.05
  ) {
    route.pop();
  }

  if (!clearLine(route[route.length - 1], route[0], obstacles, CREATURE_RADIUS)) {
    const closingLeg = findPath(route[route.length - 1], route[0], obstacles, bounds, CREATURE_RADIUS);
    const closingSteps = simplifyLeg(route[route.length - 1], closingLeg, obstacles);
    for (const point of closingSteps) {
      if (Math.hypot(point.x - route[0].x, route[0].z - point.z) < 0.05) continue;
      const lastPoint = route[route.length - 1];
      if (Math.hypot(lastPoint.x - point.x, lastPoint.z - point.z) >= 0.05) {
        route.push({ x: point.x, z: point.z });
      }
    }
  }

  return route;
}

function buildPatrolRoutes(rooms, enemyInfo, obstacles, random) {
  const otherRooms = shuffleItems(
    [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(roomIdx => roomIdx !== enemyInfo.roomIndex),
    random
  );
  const firstRooms = [enemyInfo.roomIndex, ...otherRooms.slice(0, 4)];
  const secondRooms = [...otherRooms.slice(4), otherRooms[0]];

  const firstAnchors = firstRooms.map((roomIdx, orderIdx) => {
    if (orderIdx === 0) return { x: enemyInfo.point.x, z: enemyInfo.point.z };
    const room = rooms[roomIdx];
    const jitterX = pickItem([-1, 0, 1], random);
    const jitterZ = pickItem([0, 1], random);
    return { x: room.x + jitterX, z: room.z + jitterZ };
  });

  const secondAnchors = secondRooms.map(roomIdx => {
    const room = rooms[roomIdx];
    const jitterX = pickItem([-1, 0, 1], random);
    const jitterZ = pickItem([-1, 0, 1], random);
    return { x: room.x + jitterX, z: room.z + jitterZ };
  });

  return [
    buildClosedRoute(firstAnchors, obstacles, BOUNDS),
    buildClosedRoute(secondAnchors, obstacles, BOUNDS),
  ];
}

export function generateLayout(seed = 1) {
  const normalizedSeed = seed === undefined || seed === null || seed === '' ? 1 : seed;
  const random = createRandom(normalizedSeed);
  const rooms = buildRooms();
  const internalEdges = buildInternalEdges();
  const edgeStates = selectDoorNetwork(internalEdges, random);
  const wallObstacles = buildWallObstacles(edgeStates);
  const { hidingSpots, lockerObstacles } = buildHidingSpotsAndLockers(rooms, edgeStates, random);
  const crateObstacles = buildCrateObstacles(rooms, edgeStates, random);
  const obstacles = [...wallObstacles, ...lockerObstacles, ...crateObstacles];
  const tasks = buildTasks(rooms, random);
  const enemyInfo = selectEnemySpawn(rooms, random);
  const patrolRoutes = buildPatrolRoutes(rooms, enemyInfo, obstacles, random);

  return {
    seed: normalizedSeed,
    bounds: { ...BOUNDS },
    spawn: { ...SPAWN },
    exit: { ...EXIT },
    enemySpawn: enemyInfo.point,
    rooms,
    obstacles,
    tasks,
    hidingSpots,
    patrolRoutes,
  };
}

export default generateLayout;
