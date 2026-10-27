import { moveWithCollisions, clearLine, findPath } from './logic.js';

const CREATURE_RADIUS = 0.46;
const SAFE_CLEARANCE = 0.48;
const PATROL_SPEED = 2.2;
const NOTICE_SPEED = 2.65;
const SEARCH_SPEED = 2.4;
const CHASE_SPEED = 3.45;
const BLIND_SPEED = 0.55;
const VISION_RANGE = 16.0;
const VISION_CONE_DOT = 0.35;
const MID_VISION_RANGE = 7.0;
const MID_VISION_DOT = 0.05;
const PERIPHERAL_RANGE = 3.2;
const CATCH_RANGE = 1.05;
const WAYPOINT_REACH = 0.36;
const TARGET_REACH = 0.55;
const NOTICE_DURATION = 2.0;
const SEARCH_DURATION = 4.5;
const DEFAULT_BLIND_DURATION = 5.0;
const PATH_REFRESH_INTERVAL = 0.45;

const DEFAULT_BOUNDS = Object.freeze({
  minX: -15,
  maxX: 15,
  minZ: -25,
  maxZ: 5,
});

function clonePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return { x: Number(point.x), z: Number(point.z) };
}

function clampValue(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function distanceBetween(first, second) {
  if (!first || !second) return Infinity;
  return Math.hypot(second.x - first.x, second.z - first.z);
}

function isBlockedAt(position, obstacles, bounds, radius = CREATURE_RADIUS) {
  if (
    position.x < bounds.minX + radius ||
    position.x > bounds.maxX - radius ||
    position.z < bounds.minZ + radius ||
    position.z > bounds.maxZ - radius
  ) {
    return true;
  }
  for (const box of obstacles) {
    if (
      position.x >= box.min.x - radius &&
      position.x <= box.max.x + radius &&
      position.z >= box.min.z - radius &&
      position.z <= box.max.z + radius
    ) {
      return true;
    }
  }
  return false;
}

function sanitizePoint(targetPoint, obstacles, bounds, radius = SAFE_CLEARANCE) {
  if (!targetPoint || !Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.z)) {
    return { x: 0, z: -10 };
  }
  const clamped = {
    x: clampValue(targetPoint.x, bounds.minX + radius, bounds.maxX - radius),
    z: clampValue(targetPoint.z, bounds.minZ + radius, bounds.maxZ - radius),
  };
  if (!isBlockedAt(clamped, obstacles, bounds, radius)) {
    return clamped;
  }
  const ringRadii = [0.35, 0.65, 1.0, 1.4, 1.85, 2.4, 3.1];
  const angleSteps = 16;
  for (const ringRadius of ringRadii) {
    let bestCandidate = null;
    let bestCost = Infinity;
    for (let stepIndex = 0; stepIndex < angleSteps; stepIndex++) {
      const angle = (stepIndex / angleSteps) * Math.PI * 2;
      const candidate = {
        x: clampValue(targetPoint.x + Math.sin(angle) * ringRadius, bounds.minX + radius, bounds.maxX - radius),
        z: clampValue(targetPoint.z + Math.cos(angle) * ringRadius, bounds.minZ + radius, bounds.maxZ - radius),
      };
      if (!isBlockedAt(candidate, obstacles, bounds, radius)) {
        const cost = distanceBetween(targetPoint, candidate);
        if (cost < bestCost) {
          bestCost = cost;
          bestCandidate = candidate;
        }
      }
    }
    if (bestCandidate) return bestCandidate;
  }
  const minGridX = Math.ceil(bounds.minX + radius);
  const maxGridX = Math.floor(bounds.maxX - radius);
  const minGridZ = Math.ceil(bounds.minZ + radius);
  const maxGridZ = Math.floor(bounds.maxZ - radius);
  let bestGridPoint = clamped;
  let bestGridDistance = Infinity;
  for (let gridZ = minGridZ; gridZ <= maxGridZ; gridZ++) {
    for (let gridX = minGridX; gridX <= maxGridX; gridX++) {
      const candidate = { x: gridX, z: gridZ };
      if (!isBlockedAt(candidate, obstacles, bounds, radius)) {
        const cost = distanceBetween(targetPoint, candidate);
        if (cost < bestGridDistance) {
          bestGridDistance = cost;
          bestGridPoint = candidate;
        }
      }
    }
  }
  return bestGridPoint;
}

function buildFallbackRoutes(obstacles, bounds) {
  const candidates = [
    { x: -10, z: -20 },
    { x: 0, z: -20 },
    { x: 10, z: -20 },
    { x: 10, z: -10 },
    { x: 0, z: -10 },
    { x: -10, z: -10 },
  ].map(point => sanitizePoint(point, obstacles, bounds));
  return [candidates];
}

function normalizeRoutes(rawRoutes, obstacles, bounds) {
  if (!Array.isArray(rawRoutes) || rawRoutes.length === 0) {
    return buildFallbackRoutes(obstacles, bounds);
  }
  if (rawRoutes[0] && !Array.isArray(rawRoutes[0]) && Number.isFinite(rawRoutes[0].x)) {
    const singleRoute = rawRoutes
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.z))
      .map(point => clonePoint(point));
    return singleRoute.length > 0 ? [singleRoute] : buildFallbackRoutes(obstacles, bounds);
  }
  const routes = rawRoutes
    .filter(route => Array.isArray(route) && route.length > 0)
    .map(route =>
      route
        .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.z))
        .map(point => clonePoint(point)),
    )
    .filter(route => route.length > 0);
  return routes.length > 0 ? routes : buildFallbackRoutes(obstacles, bounds);
}

function pointToSegmentDistance(point, segStart, segEnd) {
  const segX = segEnd.x - segStart.x;
  const segZ = segEnd.z - segStart.z;
  const lengthSq = segX * segX + segZ * segZ;
  if (lengthSq < 1e-8) return distanceBetween(point, segStart);
  const projection = clampValue(
    ((point.x - segStart.x) * segX + (point.z - segStart.z) * segZ) / lengthSq,
    0,
    1,
  );
  const closestX = segStart.x + projection * segX;
  const closestZ = segStart.z + projection * segZ;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

function selectInitialPatrolState(startPosition, routes) {
  let bestRouteIndex = 0;
  let bestWaypointIndex = 0;
  let bestDistance = Infinity;
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
    const route = routes[routeIndex];
    if (route.length === 1) {
      const singleDist = distanceBetween(startPosition, route[0]);
      if (singleDist < bestDistance) {
        bestDistance = singleDist;
        bestRouteIndex = routeIndex;
        bestWaypointIndex = 0;
      }
      continue;
    }
    for (let waypointIndex = 0; waypointIndex < route.length; waypointIndex++) {
      const nextIndex = (waypointIndex + 1) % route.length;
      const segStart = route[waypointIndex];
      const segEnd = route[nextIndex];
      const segDist = pointToSegmentDistance(startPosition, segStart, segEnd);
      const endDist = distanceBetween(startPosition, segEnd);
      if (segDist + 1e-4 < bestDistance && endDist > WAYPOINT_REACH) {
        bestDistance = segDist;
        bestRouteIndex = routeIndex;
        bestWaypointIndex = nextIndex;
      }
    }
  }
  return { routeIndex: bestRouteIndex, waypointIndex: bestWaypointIndex };
}

function segmentIntersectsBox(fromPoint, toPoint, box, padding = 0) {
  let startFraction = 0;
  let endFraction = 1;
  for (const axis of ['x', 'z']) {
    const delta = toPoint[axis] - fromPoint[axis];
    const minimum = box.min[axis] - padding;
    const maximum = box.max[axis] + padding;
    if (Math.abs(delta) < 1e-9) {
      if (fromPoint[axis] < minimum || fromPoint[axis] > maximum) return false;
    } else {
      const firstHit = (minimum - fromPoint[axis]) / delta;
      const secondHit = (maximum - fromPoint[axis]) / delta;
      startFraction = Math.max(startFraction, Math.min(firstHit, secondHit));
      endFraction = Math.min(endFraction, Math.max(firstHit, secondHit));
      if (startFraction > endFraction) return false;
    }
  }
  return startFraction <= endFraction;
}

function countIntersectingObstacles(fromPoint, toPoint, obstacles) {
  let wallCount = 0;
  for (const box of obstacles) {
    if (segmentIntersectsBox(fromPoint, toPoint, box, 0)) {
      wallCount += 1;
    }
  }
  return wallCount;
}

function canSeePlayer(brain, player, hidden, obstacles) {
  if (hidden || !player || brain.stage === 'blinded' || brain.blindTimer > 0 || brain.postBlindTimer > 0) {
    return false;
  }
  const deltaX = player.x - brain.position.x;
  const deltaZ = player.z - brain.position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance > VISION_RANGE) return false;
  if (!clearLine(brain.position, player, obstacles, 0)) return false;
  if (distance <= PERIPHERAL_RANGE) return true;
  const forwardX = Math.sin(brain.yaw || 0);
  const forwardZ = Math.cos(brain.yaw || 0);
  const alignment = (forwardX * deltaX + forwardZ * deltaZ) / Math.max(distance, 1e-6);
  if (distance <= MID_VISION_RANGE && alignment >= MID_VISION_DOT) return true;
  return alignment >= VISION_CONE_DOT;
}

function evaluateNoises(brain, noises, obstacles) {
  if (!Array.isArray(noises) || noises.length === 0) return null;
  if (brain.stage === 'blinded' || brain.blindTimer > 0) return null;
  let chosenNoise = null;
  let bestScore = -Infinity;
  for (const noise of noises) {
    if (!noise) continue;
    const rawPosition = noise.position || noise;
    if (!rawPosition || !Number.isFinite(rawPosition.x) || !Number.isFinite(rawPosition.z)) continue;
    const baseRadius = Number.isFinite(noise.radius) ? noise.radius : 10;
    if (baseRadius <= 0) continue;
    const distance = distanceBetween(brain.position, rawPosition);
    const wallCount = countIntersectingObstacles(brain.position, rawPosition, obstacles);
    const attenuatedRadius = wallCount === 0 ? baseRadius : baseRadius * Math.pow(0.55, wallCount);
    if (distance <= attenuatedRadius) {
      const score = attenuatedRadius - distance;
      if (score > bestScore) {
        bestScore = score;
        chosenNoise = clonePoint(rawPosition);
      }
    }
  }
  return chosenNoise;
}

function buildSearchPoints(anchorPoint, obstacles, bounds) {
  const safeAnchor = sanitizePoint(anchorPoint, obstacles, bounds);
  const offsets = [
    { x: 0, z: 0 },
    { x: 2.2, z: 0 },
    { x: -2.2, z: 0 },
    { x: 0, z: 2.2 },
    { x: 0, z: -2.2 },
  ];
  const points = [];
  for (const offset of offsets) {
    const candidate = sanitizePoint(
      { x: safeAnchor.x + offset.x, z: safeAnchor.z + offset.z },
      obstacles,
      bounds,
    );
    const duplicate = points.some(existing => distanceBetween(existing, candidate) < 0.45);
    if (!duplicate) {
      points.push(candidate);
    }
  }
  return points.length > 0 ? points : [safeAnchor];
}

function computeSafePath(fromPoint, targetPoint, obstacles, bounds) {
  const safeStart = sanitizePoint(fromPoint, obstacles, bounds, SAFE_CLEARANCE);
  const safeGoal = sanitizePoint(targetPoint, obstacles, bounds, SAFE_CLEARANCE);
  if (clearLine(fromPoint, safeGoal, obstacles, CREATURE_RADIUS)) {
    return [safeGoal];
  }
  const computed = findPath(safeStart, safeGoal, obstacles, bounds, CREATURE_RADIUS);
  if (Array.isArray(computed) && computed.length > 0) {
    const cleaned = computed.map(point => sanitizePoint(point, obstacles, bounds, SAFE_CLEARANCE));
    while (cleaned.length > 1 && distanceBetween(fromPoint, cleaned[0]) < WAYPOINT_REACH) {
      cleaned.shift();
    }
    return cleaned;
  }
  return [safeGoal];
}

function getCompletedCount(completed) {
  if (typeof completed === 'number' && Number.isFinite(completed)) return completed;
  if (completed && typeof completed.size === 'number') return completed.size;
  if (Array.isArray(completed)) return completed.length;
  return 0;
}

function stepNavigation(brain, destination, speed, stepDelta, obstacles, bounds) {
  if (!destination || stepDelta <= 0 || speed <= 0) return false;
  const safeDestination = sanitizePoint(destination, obstacles, bounds, SAFE_CLEARANCE);
  brain.pathTimer = Math.max(0, (brain.pathTimer || 0) - stepDelta);

  const targetShifted = !brain.pathTarget || distanceBetween(brain.pathTarget, safeDestination) > 0.35;
  const pathEmpty = !Array.isArray(brain.path) || brain.path.length === 0;
  const firstSegmentBlocked =
    !pathEmpty && !clearLine(brain.position, brain.path[0], obstacles, CREATURE_RADIUS * 0.92);

  if (targetShifted || pathEmpty || brain.pathTimer <= 0 || firstSegmentBlocked) {
    brain.path = computeSafePath(brain.position, safeDestination, obstacles, bounds);
    brain.pathTarget = clonePoint(safeDestination);
    brain.pathTimer = PATH_REFRESH_INTERVAL;
  }

  while (brain.path.length > 1 && distanceBetween(brain.position, brain.path[0]) < WAYPOINT_REACH) {
    brain.path.shift();
  }

  const nextWaypoint = brain.path[0] || safeDestination;
  const deltaX = nextWaypoint.x - brain.position.x;
  const deltaZ = nextWaypoint.z - brain.position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance < 0.04) {
    if (brain.path.length > 1) {
      brain.path.shift();
    }
    return false;
  }

  const stepLength = Math.min(distance, speed * stepDelta);
  const moveX = (deltaX / distance) * stepLength;
  const moveZ = (deltaZ / distance) * stepLength;
  const previousX = brain.position.x;
  const previousZ = brain.position.z;

  moveWithCollisions(brain.position, moveX, moveZ, obstacles, bounds, CREATURE_RADIUS);
  let actualMoved = Math.hypot(brain.position.x - previousX, brain.position.z - previousZ);

  if (actualMoved < stepLength * 0.25) {
    const slideAxes = Math.abs(deltaX) >= Math.abs(deltaZ)
      ? [
          { slideX: Math.sign(deltaX || 1) * stepLength, slideZ: 0 },
          { slideX: 0, slideZ: Math.sign(deltaZ || 1) * stepLength },
          { slideX: 0, slideZ: -Math.sign(deltaZ || 1) * stepLength },
        ]
      : [
          { slideX: 0, slideZ: Math.sign(deltaZ || 1) * stepLength },
          { slideX: Math.sign(deltaX || 1) * stepLength, slideZ: 0 },
          { slideX: -Math.sign(deltaX || 1) * stepLength, slideZ: 0 },
        ];
    for (const candidateSlide of slideAxes) {
      const beforeSlideX = brain.position.x;
      const beforeSlideZ = brain.position.z;
      moveWithCollisions(
        brain.position,
        candidateSlide.slideX,
        candidateSlide.slideZ,
        obstacles,
        bounds,
        CREATURE_RADIUS,
      );
      const slideMoved = Math.hypot(brain.position.x - beforeSlideX, brain.position.z - beforeSlideZ);
      if (slideMoved > actualMoved) {
        actualMoved = slideMoved;
        break;
      }
    }
  }

  if (actualMoved < stepLength * 0.2) {
    brain.stuckTimer = (brain.stuckTimer || 0) + stepDelta;
    if (brain.stuckTimer > 0.18) {
      const recovered = sanitizePoint(brain.position, obstacles, bounds, SAFE_CLEARANCE);
      moveWithCollisions(
        brain.position,
        recovered.x - brain.position.x,
        recovered.z - brain.position.z,
        obstacles,
        bounds,
        CREATURE_RADIUS,
      );
      if (brain.path.length > 1) {
        brain.path.shift();
      } else {
        brain.pathTimer = 0;
      }
      brain.stuckTimer = 0;
    }
  } else {
    brain.stuckTimer = Math.max(0, (brain.stuckTimer || 0) - stepDelta * 2);
  }

  const movedX = brain.position.x - previousX;
  const movedZ = brain.position.z - previousZ;
  if (Math.hypot(movedX, movedZ) > 1e-4) {
    brain.yaw = Math.atan2(movedX, movedZ);
    return true;
  }
  brain.yaw = Math.atan2(deltaX, deltaZ);
  return false;
}

function currentPatrolWaypoint(brain, patrolRoutes, obstacles, bounds) {
  const routes = normalizeRoutes(patrolRoutes, obstacles, bounds);
  const routeIndex = clampValue(brain.routeIndex || 0, 0, routes.length - 1);
  const route = routes[routeIndex];
  const waypointIndex = ((brain.waypointIndex || 0) % route.length + route.length) % route.length;
  brain.routeIndex = routeIndex;
  brain.waypointIndex = waypointIndex;
  return clonePoint(route[waypointIndex]);
}

function advancePatrolWaypoint(brain, patrolRoutes, obstacles, bounds) {
  const routes = normalizeRoutes(patrolRoutes, obstacles, bounds);
  const routeIndex = clampValue(brain.routeIndex || 0, 0, routes.length - 1);
  const route = routes[routeIndex];
  brain.routeIndex = routeIndex;
  brain.waypointIndex = ((brain.waypointIndex || 0) + 1) % route.length;
  const waypoint = clonePoint(route[brain.waypointIndex]);
  brain.target = waypoint;
  brain.pathTimer = 0;
  return waypoint;
}

function enterSearchStage(brain, anchorPoint, obstacles, bounds) {
  const safeAnchor = sanitizePoint(anchorPoint || brain.lastSeen || brain.lastHeard || brain.target || brain.position, obstacles, bounds);
  brain.stage = 'search';
  brain.stageElapsed = 0;
  brain.stateTimer = SEARCH_DURATION;
  brain.searchPoints = buildSearchPoints(safeAnchor, obstacles, bounds);
  brain.searchIndex = 0;
  brain.target = clonePoint(brain.searchPoints[0]);
  brain.investigatePosition = clonePoint(safeAnchor);
  brain.pathTimer = 0;
}

function enterPatrolStage(brain, patrolRoutes, obstacles, bounds) {
  brain.stage = 'patrol';
  brain.stageElapsed = 0;
  brain.stateTimer = 0;
  brain.investigatePosition = null;
  const initial = selectInitialPatrolState(brain.position, patrolRoutes);
  brain.routeIndex = initial.routeIndex;
  brain.waypointIndex = initial.waypointIndex;
  brain.target = currentPatrolWaypoint(brain, patrolRoutes, obstacles, bounds);
  brain.pathTimer = 0;
}

function computeDanger(brain, player) {
  if (brain.caught) return 1;
  if (brain.stage === 'patrol' && !brain.seesPlayer) return 0;
  const distance = player ? distanceBetween(brain.position, player) : Infinity;
  const proximity = Number.isFinite(distance) ? clampValue(1 - distance / 16, 0, 1) : 0;
  if (brain.seesPlayer || brain.stage === 'chase') {
    return clampValue(0.65 + proximity * 0.35, 0.65, 1);
  }
  if (brain.stage === 'search') {
    return clampValue(0.32 + proximity * 0.36, 0.32, 0.68);
  }
  if (brain.stage === 'notice') {
    return clampValue(0.24 + proximity * 0.32, 0.24, 0.56);
  }
  if (brain.stage === 'blinded') {
    return clampValue(0.18 + proximity * 0.22, 0.18, 0.4);
  }
  return 0;
}

export function createBrain(layout = {}) {
  const bounds = layout?.bounds || DEFAULT_BOUNDS;
  const obstacles = Array.isArray(layout?.obstacles) ? layout.obstacles : [];
  const spawnPoint = layout?.enemySpawn && Number.isFinite(layout.enemySpawn.x) && Number.isFinite(layout.enemySpawn.z)
    ? clonePoint(layout.enemySpawn)
    : sanitizePoint({ x: 0, z: -20 }, obstacles, bounds);
  const patrolRoutes = normalizeRoutes(layout?.patrolRoutes, obstacles, bounds);
  const initialPatrol = selectInitialPatrolState(spawnPoint, patrolRoutes);
  const initialTarget = clonePoint(patrolRoutes[initialPatrol.routeIndex][initialPatrol.waypointIndex]);
  const initialYaw = initialTarget
    ? Math.atan2(initialTarget.x - spawnPoint.x, initialTarget.z - spawnPoint.z)
    : 0;

  return {
    position: spawnPoint,
    yaw: initialYaw,
    stage: 'patrol',
    seesPlayer: false,
    danger: 0,
    caught: false,
    moving: false,
    speed: PATROL_SPEED,
    radius: CREATURE_RADIUS,
    target: initialTarget,
    lastSeen: null,
    lastHeard: null,
    investigatePosition: null,
    blindTimer: 0,
    postBlindTimer: 0,
    stateTimer: 0,
    stageElapsed: 0,
    routeIndex: initialPatrol.routeIndex,
    waypointIndex: initialPatrol.waypointIndex,
    path: [],
    pathTarget: null,
    pathTimer: 0,
    searchPoints: [],
    searchIndex: 0,
    stuckTimer: 0,
    bounds,
    obstacles,
    patrolRoutes,
  };
}

export function blindBrain(brain, seconds = DEFAULT_BLIND_DURATION) {
  if (!brain) return brain;
  const duration = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_BLIND_DURATION;
  brain.blindTimer = Math.max(brain.blindTimer || 0, duration);
  brain.postBlindTimer = 0;
  brain.stage = 'blinded';
  brain.stageElapsed = 0;
  brain.seesPlayer = false;
  brain.caught = false;
  brain.speed = BLIND_SPEED;
  if (!brain.target) {
    brain.target = clonePoint(brain.lastSeen || brain.lastHeard || brain.position);
  }
  return brain;
}

export function updateBrain(brain, deltaTime, inputs = {}) {
  const totalDelta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
  const player = inputs?.player && Number.isFinite(inputs.player.x) && Number.isFinite(inputs.player.z)
    ? inputs.player
    : null;
  const hidden = Boolean(inputs?.hidden);
  const noises = Array.isArray(inputs?.noises) ? inputs.noises : [];
  const obstacles = Array.isArray(inputs?.obstacles) ? inputs.obstacles : (brain.obstacles || []);
  const bounds = inputs?.bounds || brain.bounds || DEFAULT_BOUNDS;
  const patrolRoutes = normalizeRoutes(inputs?.patrolRoutes ?? brain.patrolRoutes, obstacles, bounds);
  const completedCount = getCompletedCount(inputs?.completed);

  brain.obstacles = obstacles;
  brain.bounds = bounds;
  brain.patrolRoutes = patrolRoutes;
  brain.caught = false;

  const heardPoint = evaluateNoises(brain, noises, obstacles);
  let heardThisCall = false;
  if (heardPoint && brain.stage !== 'blinded' && brain.blindTimer <= 0) {
    brain.lastHeard = clonePoint(heardPoint);
    if (brain.stage !== 'chase') {
      brain.stage = 'notice';
      brain.stageElapsed = 0;
      brain.stateTimer = NOTICE_DURATION;
      brain.target = clonePoint(heardPoint);
      brain.investigatePosition = clonePoint(heardPoint);
      brain.pathTimer = 0;
      heardThisCall = true;
    }
  }

  const stepCount = totalDelta > 0 ? Math.max(1, Math.min(240, Math.ceil(totalDelta / 0.05))) : 1;
  const stepDelta = totalDelta / stepCount;
  let movedAnyStep = false;

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
    if (brain.postBlindTimer > 0) {
      brain.postBlindTimer = Math.max(0, brain.postBlindTimer - stepDelta);
    }

    if (brain.stage === 'blinded' || brain.blindTimer > 0) {
      brain.stage = 'blinded';
      brain.seesPlayer = false;
      brain.caught = false;
      brain.speed = BLIND_SPEED;
      brain.stageElapsed = (brain.stageElapsed || 0) + stepDelta;
      brain.blindTimer = Math.max(0, (brain.blindTimer || 0) - stepDelta);

      const blindTarget = brain.target || brain.lastSeen || brain.lastHeard || currentPatrolWaypoint(brain, patrolRoutes, obstacles, bounds);
      if (stepDelta > 0 && blindTarget) {
        if (distanceBetween(brain.position, blindTarget) < WAYPOINT_REACH) {
          advancePatrolWaypoint(brain, patrolRoutes, obstacles, bounds);
        }
        if (stepNavigation(brain, brain.target || blindTarget, BLIND_SPEED, stepDelta, obstacles, bounds)) {
          movedAnyStep = true;
        }
      }

      if (brain.blindTimer <= 0) {
        const searchAnchor = brain.lastSeen || brain.lastHeard || brain.target || brain.position;
        enterSearchStage(brain, searchAnchor, obstacles, bounds);
        brain.postBlindTimer = 0;
      }
      continue;
    }

    const visibleNow = canSeePlayer(brain, player, hidden, obstacles);
    brain.seesPlayer = visibleNow;

    if (visibleNow) {
      const snapshot = clonePoint(player);
      brain.stage = 'chase';
      brain.lastSeen = snapshot;
      brain.target = clonePoint(snapshot);
      brain.investigatePosition = clonePoint(snapshot);
      brain.stateTimer = SEARCH_DURATION;
      heardThisCall = false;
    } else if (brain.stage === 'chase') {
      const lastKnown = clonePoint(brain.lastSeen || brain.target || brain.position);
      enterSearchStage(brain, lastKnown, obstacles, bounds);
    }

    brain.stageElapsed = (brain.stageElapsed || 0) + stepDelta;
    const speedBonus = Math.min(completedCount, 3) * 0.18;

    if (brain.stage === 'chase') {
      const chaseSpeed = CHASE_SPEED + speedBonus;
      brain.speed = chaseSpeed;
      if (stepDelta > 0 && brain.target) {
        if (stepNavigation(brain, brain.target, chaseSpeed, stepDelta, obstacles, bounds)) {
          movedAnyStep = true;
        }
      }
      if (visibleNow && player) {
        brain.yaw = Math.atan2(player.x - brain.position.x, player.z - brain.position.z);
        if (
          !hidden &&
          distanceBetween(brain.position, player) <= CATCH_RANGE &&
          clearLine(brain.position, player, obstacles, 0)
        ) {
          brain.caught = true;
          break;
        }
      }
    } else if (brain.stage === 'notice') {
      const noticeSpeed = NOTICE_SPEED + speedBonus * 0.5;
      brain.speed = noticeSpeed;
      brain.stateTimer = Math.max(0, (brain.stateTimer || NOTICE_DURATION) - stepDelta);
      if (!brain.target) {
        brain.target = clonePoint(brain.lastHeard || brain.position);
      }
      if (stepDelta > 0 && brain.target) {
        if (stepNavigation(brain, brain.target, noticeSpeed, stepDelta, obstacles, bounds)) {
          movedAnyStep = true;
        }
      }
      const reachedNoticePoint =
        brain.target && distanceBetween(brain.position, brain.target) <= TARGET_REACH;
      if ((!heardThisCall && reachedNoticePoint && brain.stageElapsed >= 0.15) || brain.stateTimer <= 0) {
        enterSearchStage(brain, brain.target || brain.lastHeard || brain.position, obstacles, bounds);
      }
    } else if (brain.stage === 'search') {
      const searchSpeed = SEARCH_SPEED + speedBonus * 0.4;
      brain.speed = searchSpeed;
      brain.stateTimer = Math.max(0, (brain.stateTimer || SEARCH_DURATION) - stepDelta);
      if (!Array.isArray(brain.searchPoints) || brain.searchPoints.length === 0) {
        brain.searchPoints = buildSearchPoints(
          brain.investigatePosition || brain.lastSeen || brain.lastHeard || brain.position,
          obstacles,
          bounds,
        );
        brain.searchIndex = 0;
      }
      if (!brain.target) {
        brain.target = clonePoint(brain.searchPoints[brain.searchIndex || 0]);
      }
      if (stepDelta > 0 && brain.target) {
        if (stepNavigation(brain, brain.target, searchSpeed, stepDelta, obstacles, bounds)) {
          movedAnyStep = true;
        }
      }
      if (brain.target && distanceBetween(brain.position, brain.target) <= TARGET_REACH) {
        brain.searchIndex = (brain.searchIndex + 1) % brain.searchPoints.length;
        brain.target = clonePoint(brain.searchPoints[brain.searchIndex]);
        brain.pathTimer = 0;
      }
      if (brain.stateTimer <= 0) {
        enterPatrolStage(brain, patrolRoutes, obstacles, bounds);
      }
    } else {
      brain.stage = 'patrol';
      const patrolSpeed = PATROL_SPEED + speedBonus * 0.35;
      brain.speed = patrolSpeed;
      if (!brain.target) {
        brain.target = currentPatrolWaypoint(brain, patrolRoutes, obstacles, bounds);
      }
      if (distanceBetween(brain.position, brain.target) <= WAYPOINT_REACH) {
        advancePatrolWaypoint(brain, patrolRoutes, obstacles, bounds);
      }
      if (stepDelta > 0 && brain.target) {
        if (stepNavigation(brain, brain.target, patrolSpeed, stepDelta, obstacles, bounds)) {
          movedAnyStep = true;
        }
      }
      if (distanceBetween(brain.position, brain.target) <= WAYPOINT_REACH) {
        advancePatrolWaypoint(brain, patrolRoutes, obstacles, bounds);
      }
    }
  }

  brain.moving = movedAnyStep;
  brain.danger = computeDanger(brain, player);

  return {
    stage: brain.stage,
    seesPlayer: brain.seesPlayer,
    danger: brain.danger,
    caught: brain.caught,
    moving: brain.moving,
  };
}
