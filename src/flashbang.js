import * as THREE from 'three';
import { clearLine } from './logic.js';

const POOL_CAPACITY = 3;
const PROJECTILE_RADIUS = 0.1;
const FLOOR_HEIGHT = 0.0;
const CEILING_HEIGHT = 5.0;
const GRAVITY_ACCELERATION = 14.0;
const THROW_SPEED = 12.0;
const FUSE_DURATION = 1.1;
const WALL_RESTITUTION = 0.45;
const FLOOR_RESTITUTION = 0.45;
const GROUND_FRICTION = 0.90;
const BLAST_RADIUS = 9;
const BLAST_DURATION = 5;
const PULSE_DURATION_NORMAL = 0.28;
const PULSE_DURATION_REDUCED = 0.38;
const PEAK_INTENSITY_NORMAL = 75.0;
const PEAK_INTENSITY_REDUCED = 18.0;
const MESH_LINGER_DURATION = 0.35;
const DEFAULT_BOUNDS = Object.freeze({
  minX: -14.8,
  maxX: 14.8,
  minZ: -24.8,
  maxZ: 4.8
});

function checkObstacleIntersection(checkPositionX, checkPositionY, checkPositionZ, obstacleList, paddingRadius) {
  for (let obstacleIndex = 0; obstacleIndex < obstacleList.length; obstacleIndex++) {
    const obstacleBox = obstacleList[obstacleIndex];
    const boxMinY = (obstacleBox.min && obstacleBox.min.y !== undefined) ? obstacleBox.min.y : -2.0;
    const boxMaxY = (obstacleBox.max && obstacleBox.max.y !== undefined) ? obstacleBox.max.y : 6.0;
    if (checkPositionY >= boxMinY - paddingRadius && checkPositionY <= boxMaxY + paddingRadius) {
      if (checkPositionX >= obstacleBox.min.x - paddingRadius && checkPositionX <= obstacleBox.max.x + paddingRadius &&
          checkPositionZ >= obstacleBox.min.z - paddingRadius && checkPositionZ <= obstacleBox.max.z + paddingRadius) {
        return true;
      }
    }
  }
  return false;
}

export function createFlashbang(scene) {
  const sharedBodyGeometry = new THREE.CylinderGeometry(0.065, 0.065, 0.16, 12);
  const sharedCapGeometry = new THREE.CylinderGeometry(0.068, 0.068, 0.03, 12);
  const sharedBandGeometry = new THREE.CylinderGeometry(0.067, 0.067, 0.035, 12);

  const sharedBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d3748,
    roughness: 0.42,
    metalness: 0.82
  });
  const sharedCapMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a202c,
    roughness: 0.52,
    metalness: 0.88
  });
  const sharedBandMaterial = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.36,
    metalness: 0.32,
    emissive: 0x78350f,
    emissiveIntensity: 0.45
  });

  const projectilePool = [];

  for (let poolIndex = 0; poolIndex < POOL_CAPACITY; poolIndex++) {
    const grenadeGroup = new THREE.Group();
    const bodyMesh = new THREE.Mesh(sharedBodyGeometry, sharedBodyMaterial);
    const topCapMesh = new THREE.Mesh(sharedCapGeometry, sharedCapMaterial);
    topCapMesh.position.y = 0.085;
    const bottomCapMesh = new THREE.Mesh(sharedCapGeometry, sharedCapMaterial);
    bottomCapMesh.position.y = -0.085;
    const bandMesh = new THREE.Mesh(sharedBandGeometry, sharedBandMaterial);

    grenadeGroup.add(bodyMesh);
    grenadeGroup.add(topCapMesh);
    grenadeGroup.add(bottomCapMesh);
    grenadeGroup.add(bandMesh);
    grenadeGroup.visible = false;

    const pointLight = new THREE.PointLight(0xfffaed, 0, 24, 1.5);

    projectilePool.push({
      mesh: grenadeGroup,
      pointLight: pointLight,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotationVelocity: new THREE.Vector3(),
      fuseTimer: 0,
      pulseTimer: 0,
      pulseDuration: PULSE_DURATION_NORMAL,
      pulsePeakIntensity: PEAK_INTENSITY_NORMAL,
      meshLingerTimer: 0,
      state: 'idle',
      meshInScene: false,
      lightInScene: false
    });
  }

  function throwGrenade(originVector, directionVector) {
    if (!originVector || !directionVector) {
      return false;
    }

    let availableProjectile = null;
    for (let searchIndex = 0; searchIndex < projectilePool.length; searchIndex++) {
      if (projectilePool[searchIndex].state === 'idle') {
        availableProjectile = projectilePool[searchIndex];
        break;
      }
    }

    if (!availableProjectile) {
      return false;
    }

    const directionX = directionVector.x !== undefined ? directionVector.x : 0;
    const directionY = directionVector.y !== undefined ? directionVector.y : 0;
    const directionZ = directionVector.z !== undefined ? directionVector.z : 0;
    const directionLength = Math.hypot(directionX, directionY, directionZ);

    if (directionLength < 1e-6) {
      return false;
    }

    const normalizedDirectionX = directionX / directionLength;
    const normalizedDirectionY = directionY / directionLength;
    const normalizedDirectionZ = directionZ / directionLength;

    availableProjectile.position.set(
      originVector.x !== undefined ? originVector.x : 0,
      originVector.y !== undefined ? originVector.y : 1.5,
      originVector.z !== undefined ? originVector.z : 0
    );

    availableProjectile.velocity.set(
      normalizedDirectionX * THROW_SPEED,
      normalizedDirectionY * THROW_SPEED + 1.6,
      normalizedDirectionZ * THROW_SPEED
    );

    availableProjectile.rotationVelocity.set(
      (Math.random() - 0.5) * 8.0 + 4.0,
      (Math.random() - 0.5) * 6.0,
      (Math.random() - 0.5) * 8.0 + 4.0
    );

    availableProjectile.fuseTimer = FUSE_DURATION;
    availableProjectile.pulseTimer = 0;
    availableProjectile.meshLingerTimer = 0;
    availableProjectile.state = 'flying';

    availableProjectile.mesh.position.copy(availableProjectile.position);
    availableProjectile.mesh.rotation.set(0, 0, 0);
    availableProjectile.mesh.visible = true;

    if (scene && typeof scene.add === 'function' && !availableProjectile.meshInScene) {
      scene.add(availableProjectile.mesh);
      availableProjectile.meshInScene = true;
    }

    return true;
  }

  function updateFlashbangs(deltaTime, context) {
    const blastList = [];
    const clampedDeltaTime = Math.min(Math.max(0, deltaTime), 0.1);
    if (clampedDeltaTime <= 0) {
      return blastList;
    }

    const obstacleList = (context && Array.isArray(context.obstacles)) ? context.obstacles : [];
    const boundsObject = (context && context.bounds) ? context.bounds : DEFAULT_BOUNDS;
    const boundMinX = (boundsObject.minX !== undefined ? boundsObject.minX : (boundsObject.min ? boundsObject.min.x : DEFAULT_BOUNDS.minX)) + PROJECTILE_RADIUS;
    const boundMaxX = (boundsObject.maxX !== undefined ? boundsObject.maxX : (boundsObject.max ? boundsObject.max.x : DEFAULT_BOUNDS.maxX)) - PROJECTILE_RADIUS;
    const boundMinZ = (boundsObject.minZ !== undefined ? boundsObject.minZ : (boundsObject.min ? boundsObject.min.z : DEFAULT_BOUNDS.minZ)) + PROJECTILE_RADIUS;
    const boundMaxZ = (boundsObject.maxZ !== undefined ? boundsObject.maxZ : (boundsObject.max ? boundsObject.max.z : DEFAULT_BOUNDS.maxZ)) - PROJECTILE_RADIUS;

    const motionQuery = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const prefersReducedMotion = Boolean(motionQuery && motionQuery.matches);

    for (let poolIndex = 0; poolIndex < projectilePool.length; poolIndex++) {
      const projectile = projectilePool[poolIndex];

      if (projectile.state === 'flying') {
        const totalVelocityLength = projectile.velocity.length();
        const totalDisplacement = totalVelocityLength * clampedDeltaTime;
        const substepCount = Math.max(1, Math.min(16, Math.ceil(totalDisplacement / 0.06)));
        const substepDelta = clampedDeltaTime / substepCount;

        for (let substepIndex = 0; substepIndex < substepCount; substepIndex++) {
          projectile.velocity.y -= GRAVITY_ACCELERATION * substepDelta;

          const candidatePositionY = projectile.position.y + projectile.velocity.y * substepDelta;
          if (candidatePositionY <= FLOOR_HEIGHT + PROJECTILE_RADIUS) {
            projectile.position.y = FLOOR_HEIGHT + PROJECTILE_RADIUS;
            if (projectile.velocity.y < 0) {
              projectile.velocity.y = -projectile.velocity.y * FLOOR_RESTITUTION;
              if (Math.abs(projectile.velocity.y) < 0.25) {
                projectile.velocity.y = 0;
              }
            }
            projectile.velocity.x *= GROUND_FRICTION;
            projectile.velocity.z *= GROUND_FRICTION;
          } else if (candidatePositionY >= CEILING_HEIGHT - PROJECTILE_RADIUS) {
            projectile.position.y = CEILING_HEIGHT - PROJECTILE_RADIUS;
            if (projectile.velocity.y > 0) {
              projectile.velocity.y = -projectile.velocity.y * FLOOR_RESTITUTION;
            }
          } else {
            projectile.position.y = candidatePositionY;
          }

          const originCoordinate = {
            x: projectile.position.x,
            z: projectile.position.z
          };

          const candidatePositionX = projectile.position.x + projectile.velocity.x * substepDelta;
          const targetCoordinateX = {
            x: candidatePositionX,
            z: projectile.position.z
          };

          if (candidatePositionX <= boundMinX) {
            projectile.position.x = boundMinX;
            projectile.velocity.x = Math.abs(projectile.velocity.x) * WALL_RESTITUTION;
          } else if (candidatePositionX >= boundMaxX) {
            projectile.position.x = boundMaxX;
            projectile.velocity.x = -Math.abs(projectile.velocity.x) * WALL_RESTITUTION;
          } else if (
            checkObstacleIntersection(candidatePositionX, projectile.position.y, projectile.position.z, obstacleList, PROJECTILE_RADIUS) ||
            !clearLine(originCoordinate, targetCoordinateX, obstacleList, PROJECTILE_RADIUS)
          ) {
            projectile.velocity.x = -projectile.velocity.x * WALL_RESTITUTION;
          } else {
            projectile.position.x = candidatePositionX;
          }

          const currentCoordinate = {
            x: projectile.position.x,
            z: projectile.position.z
          };

          const candidatePositionZ = projectile.position.z + projectile.velocity.z * substepDelta;
          const targetCoordinateZ = {
            x: projectile.position.x,
            z: candidatePositionZ
          };

          if (candidatePositionZ <= boundMinZ) {
            projectile.position.z = boundMinZ;
            projectile.velocity.z = Math.abs(projectile.velocity.z) * WALL_RESTITUTION;
          } else if (candidatePositionZ >= boundMaxZ) {
            projectile.position.z = boundMaxZ;
            projectile.velocity.z = -Math.abs(projectile.velocity.z) * WALL_RESTITUTION;
          } else if (
            checkObstacleIntersection(projectile.position.x, projectile.position.y, candidatePositionZ, obstacleList, PROJECTILE_RADIUS) ||
            !clearLine(currentCoordinate, targetCoordinateZ, obstacleList, PROJECTILE_RADIUS)
          ) {
            projectile.velocity.z = -projectile.velocity.z * WALL_RESTITUTION;
          } else {
            projectile.position.z = candidatePositionZ;
          }

          projectile.mesh.position.copy(projectile.position);
          projectile.mesh.rotation.x += projectile.rotationVelocity.x * substepDelta;
          projectile.mesh.rotation.y += projectile.rotationVelocity.y * substepDelta;
          projectile.mesh.rotation.z += projectile.rotationVelocity.z * substepDelta;

          projectile.fuseTimer -= substepDelta;
          if (projectile.fuseTimer <= 0) {
            projectile.state = 'detonated';
            projectile.pulseDuration = prefersReducedMotion ? PULSE_DURATION_REDUCED : PULSE_DURATION_NORMAL;
            projectile.pulsePeakIntensity = prefersReducedMotion ? PEAK_INTENSITY_REDUCED : PEAK_INTENSITY_NORMAL;
            projectile.pulseTimer = projectile.pulseDuration;
            projectile.meshLingerTimer = MESH_LINGER_DURATION;

            projectile.pointLight.position.set(
              projectile.position.x,
              projectile.position.y + 0.2,
              projectile.position.z
            );
            projectile.pointLight.intensity = projectile.pulsePeakIntensity;

            if (scene && typeof scene.add === 'function' && !projectile.lightInScene) {
              scene.add(projectile.pointLight);
              projectile.lightInScene = true;
            }

            blastList.push({
              position: {
                x: projectile.position.x,
                y: projectile.position.y,
                z: projectile.position.z
              },
              radius: BLAST_RADIUS,
              duration: BLAST_DURATION
            });

            break;
          }
        }
      } else if (projectile.state === 'detonated') {
        if (projectile.pulseTimer > 0) {
          projectile.pulseTimer -= clampedDeltaTime;
          if (projectile.pulseTimer > 0) {
            const progressRatio = 1.0 - (projectile.pulseTimer / projectile.pulseDuration);
            const linearFalloff = Math.max(0, 1.0 - progressRatio);
            projectile.pointLight.intensity = projectile.pulsePeakIntensity * (prefersReducedMotion ? linearFalloff : (linearFalloff * linearFalloff));
          } else {
            projectile.pointLight.intensity = 0;
            if (scene && typeof scene.remove === 'function' && projectile.lightInScene) {
              scene.remove(projectile.pointLight);
              projectile.lightInScene = false;
            }
          }
        }

        if (projectile.meshLingerTimer > 0) {
          projectile.meshLingerTimer -= clampedDeltaTime;
          if (projectile.meshLingerTimer <= 0) {
            projectile.mesh.visible = false;
            if (scene && typeof scene.remove === 'function' && projectile.meshInScene) {
              scene.remove(projectile.mesh);
              projectile.meshInScene = false;
            }
          }
        }

        if (projectile.pulseTimer <= 0 && projectile.meshLingerTimer <= 0) {
          projectile.state = 'idle';
        }
      }
    }

    return blastList;
  }

  function resetFlashbangs() {
    for (let poolIndex = 0; poolIndex < projectilePool.length; poolIndex++) {
      const projectile = projectilePool[poolIndex];
      projectile.state = 'idle';
      projectile.fuseTimer = 0;
      projectile.pulseTimer = 0;
      projectile.meshLingerTimer = 0;
      projectile.pointLight.intensity = 0;
      projectile.mesh.visible = false;

      if (scene && typeof scene.remove === 'function') {
        if (projectile.meshInScene) {
          scene.remove(projectile.mesh);
          projectile.meshInScene = false;
        }
        if (projectile.lightInScene) {
          scene.remove(projectile.pointLight);
          projectile.lightInScene = false;
        }
      }
    }
  }

  function disposeFlashbangs() {
    resetFlashbangs();

    sharedBodyGeometry.dispose();
    sharedCapGeometry.dispose();
    sharedBandGeometry.dispose();

    sharedBodyMaterial.dispose();
    sharedCapMaterial.dispose();
    sharedBandMaterial.dispose();

    for (let poolIndex = 0; poolIndex < projectilePool.length; poolIndex++) {
      const projectile = projectilePool[poolIndex];
      if (projectile.pointLight && typeof projectile.pointLight.dispose === 'function') {
        projectile.pointLight.dispose();
      }
    }

    projectilePool.length = 0;
  }

  return {
    throw: throwGrenade,
    update: updateFlashbangs,
    reset: resetFlashbangs,
    dispose: disposeFlashbangs
  };
}

export default createFlashbang;
