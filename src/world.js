import * as THREE from 'three';

const DEFAULT_BOUNDS = Object.freeze({ minX: -15, maxX: 15, minZ: -25, maxZ: 5 });

function buildFallbackLayout() {
  const bounds = { ...DEFAULT_BOUNDS };
  const rooms = [];
  const gridCols = [-10, 0, 10];
  const gridRows = [0, -10, -20];
  for (let rowIndex = 0; rowIndex < gridRows.length; rowIndex++) {
    for (let colIndex = 0; colIndex < gridCols.length; colIndex++) {
      rooms.push({
        id: `room-${colIndex}-${rowIndex}`,
        x: gridCols[colIndex],
        z: gridRows[rowIndex],
        width: 10,
        depth: 10,
      });
    }
  }
  const obstacles = [
    { min: { x: -5.2, y: 0, z: -3.2 }, max: { x: -4.8, y: 5, z: 5 }, kind: 'wall' },
    { min: { x: 4.8, y: 0, z: -3.2 }, max: { x: 5.2, y: 5, z: 5 }, kind: 'wall' },
    { min: { x: -15, y: 0, z: -5.2 }, max: { x: -8.2, y: 5, z: -4.8 }, kind: 'wall' },
    { min: { x: -4.8, y: 0, z: -5.2 }, max: { x: -1.6, y: 5, z: -4.8 }, kind: 'wall' },
    { min: { x: 1.6, y: 0, z: -5.2 }, max: { x: 4.8, y: 5, z: -4.8 }, kind: 'wall' },
    { min: { x: 8.2, y: 0, z: -5.2 }, max: { x: 15, y: 5, z: -4.8 }, kind: 'wall' },
    { min: { x: -5.2, y: 0, z: -15 }, max: { x: -4.8, y: 5, z: -11.6 }, kind: 'wall' },
    { min: { x: 4.8, y: 0, z: -15 }, max: { x: 5.2, y: 5, z: -11.6 }, kind: 'wall' },
    { min: { x: -15, y: 0, z: -15.2 }, max: { x: -11.6, y: 5, z: -14.8 }, kind: 'wall' },
    { min: { x: -8.4, y: 0, z: -15.2 }, max: { x: -1.6, y: 5, z: -14.8 }, kind: 'wall' },
    { min: { x: 1.6, y: 0, z: -15.2 }, max: { x: 8.4, y: 5, z: -14.8 }, kind: 'wall' },
    { min: { x: 11.6, y: 0, z: -15.2 }, max: { x: 15, y: 5, z: -14.8 }, kind: 'wall' },
    { min: { x: -13.6, y: 0, z: -4.4 }, max: { x: -12.4, y: 2.3, z: -3.4 }, kind: 'locker' },
    { min: { x: 12.4, y: 0, z: -4.4 }, max: { x: 13.6, y: 2.3, z: -3.4 }, kind: 'locker' },
    { min: { x: -3.6, y: 0, z: -14.4 }, max: { x: -2.4, y: 2.3, z: -13.4 }, kind: 'locker' },
    { min: { x: 12.4, y: 0, z: -24.4 }, max: { x: 13.6, y: 2.3, z: -23.4 }, kind: 'locker' },
    { min: { x: -1.2, y: 0, z: -9.8 }, max: { x: 1.2, y: 1.8, z: -8.2 }, kind: 'crate' },
  ];
  const tasks = [
    {
      id: 'valve',
      kind: 'valve',
      title: 'Ballast Pressure Valve',
      position: { x: -10, z: -10 },
      approach: { x: -10, z: -8.5 },
      duration: 4,
    },
    {
      id: 'fuse',
      kind: 'fuse',
      title: 'High-Voltage Breaker Bank',
      position: { x: 10, z: -10 },
      approach: { x: 10, z: -8.5 },
      duration: 3,
    },
    {
      id: 'uplink',
      kind: 'uplink',
      title: 'Abyssal Comms Uplink',
      position: { x: 0, z: -20 },
      approach: { x: 0, z: -18.5 },
      duration: 8,
    },
  ];
  const hidingSpots = [
    { id: 'locker-1', position: { x: -13, z: -3.9 }, exitPosition: { x: -13, z: -2.7 }, rotation: 0 },
    { id: 'locker-2', position: { x: 13, z: -3.9 }, exitPosition: { x: 13, z: -2.7 }, rotation: 0 },
    { id: 'locker-3', position: { x: -3, z: -13.9 }, exitPosition: { x: -3, z: -12.7 }, rotation: 0 },
    { id: 'locker-4', position: { x: 13, z: -23.9 }, exitPosition: { x: 13, z: -22.7 }, rotation: 0 },
  ];
  return {
    seed: 1,
    bounds,
    spawn: { x: 0, z: 2 },
    exit: { x: 0, z: 3.6 },
    enemySpawn: { x: 0, z: -20 },
    rooms,
    obstacles,
    tasks,
    hidingSpots,
    patrolRoutes: [],
  };
}

function mergeBufferGeometries(geoList) {
  let totalVerts = 0;
  let totalIndices = 0;
  for (const partGeo of geoList) {
    totalVerts += partGeo.attributes.position.count;
    totalIndices += partGeo.index ? partGeo.index.count : partGeo.attributes.position.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalIndices);
  let vertOffset = 0;
  let idxOffset = 0;
  for (const partGeo of geoList) {
    const posAttr = partGeo.attributes.position;
    const normAttr = partGeo.attributes.normal;
    const uvAttr = partGeo.attributes.uv;
    positions.set(posAttr.array, vertOffset * 3);
    if (normAttr) normals.set(normAttr.array, vertOffset * 3);
    if (uvAttr) uvs.set(uvAttr.array, vertOffset * 2);
    if (partGeo.index) {
      const srcIdx = partGeo.index.array;
      for (let cursor = 0; cursor < srcIdx.length; cursor++) {
        indices[idxOffset + cursor] = srcIdx[cursor] + vertOffset;
      }
      idxOffset += srcIdx.length;
    } else {
      for (let cursor = 0; cursor < posAttr.count; cursor++) {
        indices[idxOffset + cursor] = vertOffset + cursor;
      }
      idxOffset += posAttr.count;
    }
    vertOffset += posAttr.count;
    partGeo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function makeTranslatedBox(width, height, depth, posX, posY, posZ) {
  const boxGeo = new THREE.BoxGeometry(width, height, depth);
  boxGeo.translate(posX, posY, posZ);
  return boxGeo;
}

function buildPortholeFrameGeometry(frameRadius) {
  const frameParts = [
    new THREE.TorusGeometry(frameRadius, 0.11, 12, 24).translate(0, 0, 0.045),
    new THREE.TorusGeometry(frameRadius - 0.09, 0.042, 10, 24).translate(0, 0, 0.065),
  ];
  const boltCount = 8;
  for (let boltIndex = 0; boltIndex < boltCount; boltIndex++) {
    const boltAngle = (boltIndex / boltCount) * Math.PI * 2;
    const boltGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6);
    boltGeo.rotateX(Math.PI / 2);
    boltGeo.translate(
      Math.cos(boltAngle) * frameRadius,
      Math.sin(boltAngle) * frameRadius,
      0.11
    );
    frameParts.push(boltGeo);
  }
  return mergeBufferGeometries(frameParts);
}

function buildPortholeWireGeometry(clipRadius) {
  const wireParts = [
    new THREE.TorusGeometry(clipRadius, 0.018, 8, 24).translate(0, 0, 0.004),
  ];
  const wireSpacing = 0.125;
  const diagonalAngles = [Math.PI / 4, -Math.PI / 4];
  for (let angleIndex = 0; angleIndex < diagonalAngles.length; angleIndex++) {
    const strandAngle = diagonalAngles[angleIndex];
    const layerOffsetZ = angleIndex === 0 ? -0.002 : 0.002;
    for (let stepIndex = -4; stepIndex <= 4; stepIndex++) {
      const signedOffset = stepIndex * wireSpacing;
      const halfChord = Math.sqrt(Math.max(0, clipRadius * clipRadius - signedOffset * signedOffset));
      if (halfChord <= 0.04) continue;
      const strandGeo = new THREE.BoxGeometry(halfChord * 2, 0.022, 0.012);
      strandGeo.rotateZ(strandAngle);
      strandGeo.translate(
        -Math.sin(strandAngle) * signedOffset,
        Math.cos(strandAngle) * signedOffset,
        layerOffsetZ
      );
      wireParts.push(strandGeo);
    }
  }
  return mergeBufferGeometries(wireParts);
}

function makeDeckTexture(textures) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0f1e29';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#1b3344';
  ctx.lineWidth = 3;
  for (let step = 0; step <= 512; step += 32) {
    ctx.beginPath();
    ctx.moveTo(step, 0);
    ctx.lineTo(step, 512);
    ctx.moveTo(0, step);
    ctx.lineTo(512, step);
    ctx.stroke();
  }
  ctx.strokeStyle = '#294c60';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 504, 504);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.moveTo(0, 256);
  ctx.lineTo(512, 256);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(15, 15);
  textures.add(texture);
  return texture;
}

function makeSignTexture(textures, { header, title, subtext, arrow = '', accent = '#f59e0b', dark = '#0a141c' }) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 512, 28);
  ctx.fillRect(0, 228, 512, 28);
  ctx.fillStyle = '#091015';
  for (let stripeX = -256; stripeX < 768; stripeX += 36) {
    ctx.beginPath();
    ctx.moveTo(stripeX, 0);
    ctx.lineTo(stripeX + 18, 0);
    ctx.lineTo(stripeX - 10, 28);
    ctx.lineTo(stripeX - 28, 28);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(stripeX, 228);
    ctx.lineTo(stripeX + 18, 228);
    ctx.lineTo(stripeX - 10, 256);
    ctx.lineTo(stripeX - 28, 256);
    ctx.fill();
  }

  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 36, 492, 184);
  ctx.fillStyle = accent;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(header, 26, 72);
  ctx.fillStyle = '#e6f7ff';
  ctx.font = 'bold 46px monospace';
  ctx.fillText(title, 26, 134);
  ctx.fillStyle = '#9ad0e6';
  ctx.font = 'bold 23px monospace';
  ctx.fillText(subtext, 26, 184);
  if (arrow) {
    ctx.fillStyle = accent;
    ctx.font = 'bold 88px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(arrow, 482, 158);
  }
  const texture = new THREE.CanvasTexture(canvas);
  textures.add(texture);
  return texture;
}

function findUncoveredSpans(rangeMin, rangeMax, coveredIntervals) {
  const sorted = coveredIntervals
    .map(([startVal, endVal]) => [Math.max(rangeMin, startVal), Math.min(rangeMax, endVal)])
    .filter(([startVal, endVal]) => endVal > startVal + 0.05)
    .sort((left, right) => left[0] - right[0]);

  const gaps = [];
  let cursor = rangeMin;
  for (const [startVal, endVal] of sorted) {
    if (startVal > cursor + 1.8) {
      gaps.push([cursor, startVal]);
    }
    cursor = Math.max(cursor, endVal);
  }
  if (rangeMax > cursor + 1.8) {
    gaps.push([cursor, rangeMax]);
  }
  return gaps.filter(([startVal, endVal]) => endVal - startVal < 9.5);
}

export function createWorld(scene, layout) {
  const resolvedLayout = layout && typeof layout === 'object' ? layout : buildFallbackLayout();
  const bounds = resolvedLayout.bounds || { ...DEFAULT_BOUNDS };
  const layoutObstacles = Array.isArray(resolvedLayout.obstacles) ? resolvedLayout.obstacles : [];
  const layoutTasks = Array.isArray(resolvedLayout.tasks) ? resolvedLayout.tasks : [];
  const layoutHidingSpots = Array.isArray(resolvedLayout.hidingSpots) ? resolvedLayout.hidingSpots : [];

  const root = new THREE.Group();
  root.name = 'SignalLostWorld';
  if (scene && typeof scene.add === 'function') scene.add(root);
  if (scene) {
    scene.background = new THREE.Color(0x05131d);
    scene.fog = new THREE.FogExp2(0x071b28, 0.04);
  }

  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  const trackGeo = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const trackMat = (material) => {
    materials.add(material);
    return material;
  };

  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const wallHeight = 5.0;

  const hemiLight = new THREE.HemisphereLight(0x58a6c4, 0x182e3b, 1.5);
  hemiLight.position.set(centerX, 6.2, centerZ);
  root.add(hemiLight);
  root.add(new THREE.AmbientLight(0x2d586e, 0.98));

  const deckTex = makeDeckTexture(textures);
  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1d3444, map: deckTex, roughness: 0.65, metalness: 0.58 })
  );
  const ceilingMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x132634, roughness: 0.72, metalness: 0.55 })
  );
  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1a303f, roughness: 0.6, metalness: 0.65 })
  );
  const ribMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x264457, roughness: 0.48, metalness: 0.76 })
  );
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1c2f3d, roughness: 0.52, metalness: 0.78 })
  );
  const lockerShellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1f394a,
      emissive: 0x071822,
      emissiveIntensity: 0.35,
      roughness: 0.46,
      metalness: 0.74,
      side: THREE.DoubleSide,
    })
  );
  const pipeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2f5869, roughness: 0.42, metalness: 0.8 })
  );
  const copperMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x7a5032, roughness: 0.44, metalness: 0.75 })
  );
  const abyssWaterMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x062636, transparent: true, opacity: 0.94 })
  );
  const portholeGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2cb0d9,
      emissive: 0x116b8a,
      emissiveIntensity: 1.05,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.88,
    })
  );
  const portholeWireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9ab8c9,
      emissive: 0x091924,
      emissiveIntensity: 0.28,
      roughness: 0.3,
      metalness: 0.86,
    })
  );
  const cyanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5cecff,
      emissive: 0x18c5e6,
      emissiveIntensity: 1.55,
      roughness: 0.25,
      metalness: 0.3,
    })
  );
  const redMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff4d38,
      emissive: 0xe62210,
      emissiveIntensity: 1.5,
      roughness: 0.25,
      metalness: 0.3,
    })
  );
  const amberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0x451a03,
      emissiveIntensity: 0.42,
      roughness: 0.42,
      metalness: 0.65,
    })
  );
  const emeraldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.35,
      roughness: 0.28,
      metalness: 0.35,
    })
  );

  const addStaticBox = (width, height, depth, posX, posY, posZ, material) => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(width, height, depth)), material);
    mesh.position.set(posX, posY, posZ);
    root.add(mesh);
    return mesh;
  };

  addStaticBox(spanX + 1.2, 0.3, spanZ + 1.2, centerX, -0.15, centerZ, floorMat).receiveShadow = true;
  addStaticBox(spanX + 1.2, 0.3, spanZ + 1.2, centerX, wallHeight + 0.15, centerZ, ceilingMat);
  addStaticBox(spanX + 1.2, wallHeight + 0.2, 0.45, centerX, wallHeight * 0.5, bounds.minZ - 0.25, wallMat);
  addStaticBox(spanX + 1.2, wallHeight + 0.2, 0.45, centerX, wallHeight * 0.5, bounds.maxZ + 0.25, wallMat);
  addStaticBox(0.45, wallHeight + 0.2, spanZ + 1.2, bounds.minX - 0.25, wallHeight * 0.5, centerZ, wallMat);
  addStaticBox(0.45, wallHeight + 0.2, spanZ + 1.2, bounds.maxX + 0.25, wallHeight * 0.5, centerZ, wallMat);

  const ribGeos = [];
  for (const ribZ of [-22, -16, -10, -4, 2]) {
    ribGeos.push(makeTranslatedBox(0.36, 4.9, 0.46, bounds.minX + 0.12, 2.45, ribZ));
    ribGeos.push(makeTranslatedBox(0.36, 4.9, 0.46, bounds.maxX - 0.12, 2.45, ribZ));
    ribGeos.push(makeTranslatedBox(spanX, 0.34, 0.44, centerX, 4.82, ribZ));
  }
  for (const conduitZ of [0, -10, -20]) {
    ribGeos.push(makeTranslatedBox(spanX - 1.2, 0.03, 0.22, centerX, 0.015, conduitZ));
  }
  for (const conduitX of [-10, 0, 10]) {
    ribGeos.push(makeTranslatedBox(0.22, 0.03, spanZ - 1.2, conduitX, 0.015, centerZ));
  }
  root.add(new THREE.Mesh(trackGeo(mergeBufferGeometries(ribGeos)), ribMat));

  const pipeGeos = [];
  for (const pipeX of [-14.2, -5.0, 5.0, 14.2]) {
    const cylGeo = new THREE.CylinderGeometry(0.14, 0.14, spanZ, 10);
    cylGeo.rotateX(Math.PI / 2);
    cylGeo.translate(pipeX, 4.58, centerZ);
    pipeGeos.push(cylGeo);
  }
  root.add(new THREE.Mesh(trackGeo(mergeBufferGeometries(pipeGeos)), pipeMat));

  const pFrameGeo = trackGeo(buildPortholeFrameGeometry(0.7));
  const pGlassGeo = trackGeo(new THREE.CircleGeometry(0.62, 24));
  const pWaterGeo = trackGeo(new THREE.CircleGeometry(0.65, 24));
  const pWireGeo = trackGeo(buildPortholeWireGeometry(0.61));
  const addPorthole = (posX, posY, posZ, rotY) => {
    const portGroup = new THREE.Group();
    portGroup.position.set(posX, posY, posZ);
    portGroup.rotation.y = rotY;
    portGroup.add(new THREE.Mesh(pFrameGeo, ribMat));
    const water = new THREE.Mesh(pWaterGeo, abyssWaterMat);
    water.position.z = 0.012;
    portGroup.add(water);
    const glass = new THREE.Mesh(pGlassGeo, portholeGlassMat);
    glass.position.z = 0.024;
    portGroup.add(glass);
    const wireMesh = new THREE.Mesh(pWireGeo, portholeWireMat);
    wireMesh.position.z = 0.038;
    portGroup.add(wireMesh);
    root.add(portGroup);
  };
  addPorthole(bounds.minX - 0.02, 2.45, -20, Math.PI / 2);
  addPorthole(bounds.minX - 0.02, 2.45, -10, Math.PI / 2);
  addPorthole(bounds.maxX + 0.02, 2.45, -20, -Math.PI / 2);
  addPorthole(bounds.maxX + 0.02, 2.45, -10, -Math.PI / 2);
  addPorthole(-10, 2.45, bounds.minZ - 0.02, 0);
  addPorthole(10, 2.45, bounds.minZ - 0.02, 0);

  const isLockerObstacle = (obs) => {
    if (obs.kind === 'locker') return true;
    const midX = (obs.min.x + obs.max.x) * 0.5;
    const midZ = (obs.min.z + obs.max.z) * 0.5;
    for (const spot of layoutHidingSpots) {
      if (Math.hypot(spot.position.x - midX, spot.position.z - midZ) < 0.95) {
        return true;
      }
    }
    return false;
  };

  const wallObstacles = [];
  const crateTrimGeos = [];
  const wallTrimGeos = [];

  for (const obs of layoutObstacles) {
    if (!obs || !obs.min || !obs.max) continue;
    if (isLockerObstacle(obs)) continue;

    const width = obs.max.x - obs.min.x;
    const depth = obs.max.z - obs.min.z;
    const height = (obs.max.y ?? wallHeight) - (obs.min.y ?? 0);
    const posX = (obs.min.x + obs.max.x) * 0.5;
    const posZ = (obs.min.z + obs.max.z) * 0.5;

    if (
      posX <= bounds.minX - 0.05 ||
      posX >= bounds.maxX + 0.05 ||
      posZ <= bounds.minZ - 0.05 ||
      posZ >= bounds.maxZ + 0.05
    ) {
      continue;
    }

    const isCrate = obs.kind === 'crate' || (obs.kind !== 'wall' && height < 3.2 && width < 4.5 && depth < 4.5);
    if (isCrate) {
      const crateHeight = Math.min(height, 2.1);
      addStaticBox(width, crateHeight, depth, posX, crateHeight * 0.5, posZ, steelMat);
      crateTrimGeos.push(
        makeTranslatedBox(width + 0.04, 0.16, depth + 0.04, posX, crateHeight - 0.14, posZ),
        makeTranslatedBox(width + 0.04, 0.18, depth + 0.04, posX, 0.09, posZ)
      );
    } else {
      wallObstacles.push(obs);
      addStaticBox(width, height, depth, posX, height * 0.5, posZ, wallMat);
      wallTrimGeos.push(makeTranslatedBox(width + 0.03, 0.28, depth + 0.03, posX, 0.14, posZ));
    }
  }

  if (crateTrimGeos.length > 0) {
    root.add(new THREE.Mesh(trackGeo(mergeBufferGeometries(crateTrimGeos)), copperMat));
  }

  const doorframeGeos = [];
  const doorGlowGeos = [];
  const roomSpansZ = [
    [-25, -15],
    [-15, -5],
    [-5, 5],
  ];
  const roomSpansX = [
    [-15, -5],
    [-5, 5],
    [5, 15],
  ];

  for (const wallX of [-5, 5]) {
    const matchingWalls = wallObstacles.filter(
      (obs) => obs.min.x <= wallX + 0.35 && obs.max.x >= wallX - 0.35 && obs.max.z - obs.min.z >= obs.max.x - obs.min.x
    );
    for (const [segMinZ, segMaxZ] of roomSpansZ) {
      const covered = matchingWalls.map((obs) => [obs.min.z, obs.max.z]);
      const doorwayGaps = findUncoveredSpans(segMinZ, segMaxZ, covered);
      for (const [gapStart, gapEnd] of doorwayGaps) {
        const gapWidth = gapEnd - gapStart;
        const gapMidZ = (gapStart + gapEnd) * 0.5;
        doorframeGeos.push(
          makeTranslatedBox(0.58, 1.45, gapWidth + 0.28, wallX, 4.28, gapMidZ),
          makeTranslatedBox(0.56, 3.6, 0.16, wallX, 1.8, gapStart + 0.04),
          makeTranslatedBox(0.56, 3.6, 0.16, wallX, 1.8, gapEnd - 0.04),
          makeTranslatedBox(0.48, 0.03, gapWidth, wallX, 0.015, gapMidZ)
        );
        doorGlowGeos.push(makeTranslatedBox(0.62, 0.1, gapWidth - 0.3, wallX, 3.52, gapMidZ));
      }
    }
  }

  for (const wallZ of [-5, -15]) {
    const matchingWalls = wallObstacles.filter(
      (obs) => obs.min.z <= wallZ + 0.35 && obs.max.z >= wallZ - 0.35 && obs.max.x - obs.min.x >= obs.max.z - obs.min.z
    );
    for (const [segMinX, segMaxX] of roomSpansX) {
      const covered = matchingWalls.map((obs) => [obs.min.x, obs.max.x]);
      const doorwayGaps = findUncoveredSpans(segMinX, segMaxX, covered);
      for (const [gapStart, gapEnd] of doorwayGaps) {
        const gapWidth = gapEnd - gapStart;
        const gapMidX = (gapStart + gapEnd) * 0.5;
        doorframeGeos.push(
          makeTranslatedBox(gapWidth + 0.28, 1.45, 0.58, gapMidX, 4.28, wallZ),
          makeTranslatedBox(0.16, 3.6, 0.56, gapStart + 0.04, 1.8, wallZ),
          makeTranslatedBox(0.16, 3.6, 0.56, gapEnd - 0.04, 1.8, wallZ),
          makeTranslatedBox(gapWidth, 0.03, 0.48, gapMidX, 0.015, wallZ)
        );
        doorGlowGeos.push(makeTranslatedBox(gapWidth - 0.3, 0.1, 0.62, gapMidX, 3.52, wallZ));
      }
    }
  }

  const allRibTrimGeos = [...wallTrimGeos, ...doorframeGeos];
  if (allRibTrimGeos.length > 0) {
    root.add(new THREE.Mesh(trackGeo(mergeBufferGeometries(allRibTrimGeos)), ribMat));
  }
  if (doorGlowGeos.length > 0) {
    root.add(new THREE.Mesh(trackGeo(mergeBufferGeometries(doorGlowGeos)), cyanMat));
  }

  const lockerShellGeo = trackGeo(
    mergeBufferGeometries([
      makeTranslatedBox(1.16, 2.36, 0.08, 0, 1.18, -0.44),
      makeTranslatedBox(0.08, 2.36, 0.94, -0.54, 1.18, 0),
      makeTranslatedBox(0.08, 2.36, 0.94, 0.54, 1.18, 0),
      makeTranslatedBox(1.18, 0.1, 0.98, 0, 2.33, 0),
      makeTranslatedBox(1.18, 0.08, 0.98, 0, 0.04, 0),
      makeTranslatedBox(1.02, 1.04, 0.06, 0, 0.58, 0.44),
      makeTranslatedBox(1.02, 0.56, 0.06, 0, 2.02, 0.44),
      makeTranslatedBox(0.08, 0.64, 0.06, -0.34, 1.42, 0.44),
      makeTranslatedBox(0.08, 0.64, 0.06, 0.34, 1.42, 0.44),
      makeTranslatedBox(0.96, 0.04, 0.08, 0, 0.88, 0.46),
      makeTranslatedBox(0.96, 0.04, 0.08, 0, 0.72, 0.46),
      makeTranslatedBox(0.96, 0.04, 0.08, 0, 0.56, 0.46),
    ])
  );
  const lockerGlowGeo = trackGeo(
    mergeBufferGeometries([
      makeTranslatedBox(0.05, 0.64, 0.06, -0.46, 1.42, 0.46),
      makeTranslatedBox(0.05, 0.64, 0.06, 0.46, 1.42, 0.46),
      makeTranslatedBox(0.94, 0.06, 0.06, 0, 2.26, 0.47),
    ])
  );
  const lockerPadGeo = trackGeo(new THREE.BoxGeometry(1.06, 0.025, 0.86));
  const lockerSignGeo = trackGeo(new THREE.PlaneGeometry(0.88, 0.38));
  const lockerSignTex = makeSignTexture(textures, {
    header: 'PRESSURE REFUGE',
    title: 'HIDE [E]',
    subtext: 'ENTER / EXIT LOCKER',
    arrow: '\u25B6',
    accent: '#34d399',
  });
  const lockerSignMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: lockerSignTex,
      color: 0xffffff,
    })
  );

  for (const spot of layoutHidingSpots) {
    if (!spot || !spot.position) continue;
    const spotExit = spot.exitPosition || { x: spot.position.x, z: spot.position.z + 1.2 };
    const facingAngle =
      typeof spot.rotation === 'number'
        ? spot.rotation
        : Math.atan2(spotExit.x - spot.position.x, spotExit.z - spot.position.z);

    const lockerGroup = new THREE.Group();
    lockerGroup.name = spot.id || 'HideLocker';
    lockerGroup.position.set(spot.position.x, 0, spot.position.z);
    lockerGroup.rotation.y = facingAngle;

    lockerGroup.add(new THREE.Mesh(lockerShellGeo, lockerShellMat));
    lockerGroup.add(new THREE.Mesh(lockerGlowGeo, emeraldMat));

    const signMesh = new THREE.Mesh(lockerSignGeo, lockerSignMat);
    signMesh.position.set(0, 1.98, 0.48);
    lockerGroup.add(signMesh);

    root.add(lockerGroup);

    const exitPad = new THREE.Mesh(lockerPadGeo, emeraldMat);
    exitPad.position.set(spotExit.x, 0.015, spotExit.z);
    exitPad.rotation.y = facingAngle;
    root.add(exitPad);
  }

  const addSign = (posX, posY, posZ, rotY, width, height, cfg) => {
    const signTex = makeSignTexture(textures, cfg);
    const signMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: signTex,
        emissive: 0x264150,
        emissiveMap: signTex,
        emissiveIntensity: 0.68,
        roughness: 0.38,
        metalness: 0.28,
      })
    );
    const signMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(width, height)), signMat);
    signMesh.position.set(posX, posY, posZ);
    signMesh.rotation.y = rotY;
    root.add(signMesh);
  };

  addSign(0, 3.85, bounds.maxZ - 0.08, Math.PI, 3.2, 1.35, {
    header: 'EVACUATION ROUTE',
    title: 'EXIT AIRLOCK',
    subtext: 'COMPLETE 3 TASKS TO UNSEAL',
    arrow: '\u2191',
    accent: '#38bdf8',
  });
  addSign(-10, 3.85, bounds.minZ + 0.08, 0, 2.8, 1.25, {
    header: 'SECTOR PORT // DECK 04',
    title: 'BALLAST BAY',
    subtext: 'PRESSURE & AUXILIARY LINES',
    arrow: '\u2190',
    accent: '#f59e0b',
  });
  addSign(0, 3.85, bounds.minZ + 0.08, 0, 2.8, 1.25, {
    header: 'SECTOR CORE // DECK 04',
    title: 'TRENCH CONDUIT',
    subtext: 'SOUTH TO SURFACE AIRLOCK',
    arrow: '\u2193',
    accent: '#22d3ee',
  });
  addSign(10, 3.85, bounds.minZ + 0.08, 0, 2.8, 1.25, {
    header: 'SECTOR STBD // DECK 04',
    title: 'REACTOR BAY',
    subtext: 'HIGH VOLTAGE // USE CAUTION',
    arrow: '\u2192',
    accent: '#ef4444',
  });

  const fixtureGeo = trackGeo(new THREE.BoxGeometry(1.5, 0.12, 0.34));
  const redLights = [];
  const lightConfigs = [
    [0, 1.5, 0x46e0ff, 2.4, cyanMat],
    [-10, -4.5, 0x38d2f2, 2.1, cyanMat],
    [10, -4.5, 0xff422e, 1.95, redMat],
    [0, -10.0, 0x46e0ff, 2.3, cyanMat],
    [-10, -18.5, 0xff422e, 1.95, redMat],
    [10, -18.5, 0x38d2f2, 2.1, cyanMat],
  ];
  for (const [lightX, lightZ, lightColor, lightIntensity, stripMat] of lightConfigs) {
    const stripMesh = new THREE.Mesh(fixtureGeo, stripMat);
    stripMesh.position.set(lightX, 4.9, lightZ);
    root.add(stripMesh);
    const pointLight = new THREE.PointLight(lightColor, lightIntensity, 16.5, 1.35);
    pointLight.position.set(lightX, 4.4, lightZ);
    root.add(pointLight);
    if (stripMat === redMat) redLights.push(pointLight);
  }

  const exitCoord = resolvedLayout.exit || { x: 0, z: 3.6 };
  const exitPosition = new THREE.Vector3(exitCoord.x, 0, exitCoord.z);
  const doorOffsetZ = Math.max(0.4, bounds.maxZ - 0.18 - exitPosition.z);

  const exitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x243e4e,
      emissive: 0x330b08,
      emissiveIntensity: 0.6,
      roughness: 0.45,
      metalness: 0.78,
    })
  );
  const exitBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff3b28,
      emissive: 0xff2210,
      emissiveIntensity: 1.85,
      roughness: 0.2,
      metalness: 0.2,
    })
  );

  const exitDoorGeo = trackGeo(new THREE.BoxGeometry(2.6, 3.3, 0.34));
  exitDoorGeo.translate(0, 1.65, doorOffsetZ);
  const exitMesh = new THREE.Mesh(exitDoorGeo, exitMat);
  exitMesh.name = 'ExitAirlock';
  exitMesh.position.copy(exitPosition);
  root.add(exitMesh);

  const exitFrameGeo = trackGeo(
    mergeBufferGeometries([
      makeTranslatedBox(3.2, 3.55, 0.48, 0, 1.78, doorOffsetZ + 0.08),
      makeTranslatedBox(2.2, 0.03, 1.4, 0, 0.015, 0.2),
    ])
  );
  exitMesh.add(new THREE.Mesh(exitFrameGeo, amberMat));

  const exitWheel = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.45, 0.07, 8, 18)), ribMat);
  exitWheel.position.set(0, 1.65, doorOffsetZ - 0.22);
  exitMesh.add(exitWheel);

  const exitBeacon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.8, 0.24, 0.58)), exitBeaconMat);
  exitBeacon.position.set(0, 3.45, doorOffsetZ - 0.04);
  exitMesh.add(exitBeacon);

  const exitLight = new THREE.PointLight(0xff3824, 2.5, 11.5, 1.4);
  exitLight.position.set(exitPosition.x, 3.2, exitPosition.z + 0.3);
  root.add(exitLight);

  const valveBodyGeo = trackGeo(
    mergeBufferGeometries([
      makeTranslatedBox(1.36, 0.16, 1.12, 0, 0.08, 0),
      makeTranslatedBox(1.06, 2.1, 0.72, 0, 1.1, -0.08),
      new THREE.CylinderGeometry(0.22, 0.22, 2.25, 12).translate(-0.34, 1.18, 0.14),
      new THREE.CylinderGeometry(0.22, 0.22, 2.25, 12).translate(0.34, 1.18, 0.14),
    ])
  );
  const valveWheelGeo = trackGeo(
    mergeBufferGeometries([
      new THREE.TorusGeometry(0.38, 0.055, 8, 18),
      makeTranslatedBox(0.72, 0.06, 0.06, 0, 0, 0),
      makeTranslatedBox(0.06, 0.72, 0.06, 0, 0, 0),
    ])
  );
  const fuseBodyGeo = trackGeo(
    mergeBufferGeometries([
      makeTranslatedBox(1.42, 0.16, 1.1, 0, 0.08, 0),
      makeTranslatedBox(1.22, 2.18, 0.74, 0, 1.12, -0.06),
      makeTranslatedBox(1.28, 0.12, 0.88, 0, 2.22, 0),
    ])
  );
  const fuseCoresGeo = trackGeo(
    mergeBufferGeometries([
      new THREE.CylinderGeometry(0.095, 0.095, 0.64, 10).translate(-0.3, 1.46, 0.33),
      new THREE.CylinderGeometry(0.095, 0.095, 0.64, 10).translate(0, 1.46, 0.33),
      new THREE.CylinderGeometry(0.095, 0.095, 0.64, 10).translate(0.3, 1.46, 0.33),
      new THREE.SphereGeometry(0.12, 10, 8).translate(-0.3, 2.36, 0.1),
      new THREE.SphereGeometry(0.12, 10, 8).translate(0, 2.36, 0.1),
      new THREE.SphereGeometry(0.12, 10, 8).translate(0.3, 2.36, 0.1),
    ])
  );
  const uplinkBodyGeo = trackGeo(
    mergeBufferGeometries([
      makeTranslatedBox(1.38, 0.16, 1.16, 0, 0.08, 0),
      makeTranslatedBox(1.12, 1.32, 0.82, 0, 0.72, 0.04),
      makeTranslatedBox(1.06, 0.92, 0.56, 0, 1.65, -0.1),
      new THREE.CylinderGeometry(0.07, 0.09, 1.15, 10).translate(0, 2.35, -0.12),
    ])
  );
  const uplinkDishGeo = trackGeo(
    mergeBufferGeometries([
      new THREE.TorusGeometry(0.34, 0.045, 8, 16),
      makeTranslatedBox(0.66, 0.05, 0.05, 0, 0, 0),
      new THREE.ConeGeometry(0.14, 0.28, 10).rotateX(Math.PI / 2).translate(0, 0, 0.14),
    ])
  );
  const taskLabelGeo = trackGeo(new THREE.PlaneGeometry(0.92, 0.44));
  const taskPadGeo = trackGeo(new THREE.BoxGeometry(1.15, 0.025, 0.85));

  const taskRecords = layoutTasks.map((taskDef, taskIndex) => {
    const kind = taskDef.kind || (taskIndex === 0 ? 'valve' : taskIndex === 1 ? 'fuse' : 'uplink');
    const posX = taskDef.position?.x ?? 0;
    const posZ = taskDef.position?.z ?? -10;
    const approach = taskDef.approach
      ? { x: taskDef.approach.x, z: taskDef.approach.z }
      : { x: posX, z: posZ + 1.5 };
    const taskVector = new THREE.Vector3(posX, 0, posZ);

    const housingMat = trackMat(amberMat.clone());
    const baseHex = kind === 'valve' ? 0xff5520 : kind === 'fuse' ? 0xffb319 : 0xff2e55;
    const coreMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: baseHex,
        emissive: baseHex,
        emissiveIntensity: 1.7,
        roughness: 0.2,
        metalness: 0.25,
      })
    );

    const mesh = new THREE.Group();
    mesh.name = taskDef.id || kind;
    mesh.position.copy(taskVector);

    let animPart = null;
    let signConfig;

    if (kind === 'valve') {
      mesh.add(new THREE.Mesh(valveBodyGeo, housingMat));
      animPart = new THREE.Mesh(valveWheelGeo, coreMat);
      animPart.position.set(0, 1.48, 0.36);
      mesh.add(animPart);
      signConfig = {
        header: 'BALLAST MANIFOLD // 01',
        title: 'VALVE BLEED',
        subtext: 'HOLD [E] TO EQUALIZE',
        arrow: '\u21BB',
        accent: '#f97316',
      };
    } else if (kind === 'fuse') {
      mesh.add(new THREE.Mesh(fuseBodyGeo, housingMat));
      animPart = new THREE.Mesh(fuseCoresGeo, coreMat);
      mesh.add(animPart);
      signConfig = {
        header: 'HIGH VOLTAGE // 02',
        title: 'FUSE BANK',
        subtext: 'PRESS [E] X3 TO LATCH',
        arrow: '\u25B6',
        accent: '#eab308',
      };
    } else {
      mesh.add(new THREE.Mesh(uplinkBodyGeo, housingMat));
      animPart = new THREE.Mesh(uplinkDishGeo, coreMat);
      animPart.position.set(0, 2.86, -0.12);
      mesh.add(animPart);
      signConfig = {
        header: 'TELEMETRY ARRAY // 03',
        title: 'COMMS UPLINK',
        subtext: 'PRESS [E] TO TRANSMIT',
        arrow: '\u2191',
        accent: '#ec4899',
      };
    }

    const labelTex = makeSignTexture(textures, signConfig);
    const labelMat = trackMat(new THREE.MeshBasicMaterial({ map: labelTex }));
    const labelMesh = new THREE.Mesh(taskLabelGeo, labelMat);
    labelMesh.position.set(0, 0.72, 0.46);
    mesh.add(labelMesh);

    const approachPad = new THREE.Mesh(taskPadGeo, coreMat);
    approachPad.position.set(approach.x - posX, 0.015, approach.z - posZ);
    mesh.add(approachPad);

    root.add(mesh);

    const light = new THREE.PointLight(baseHex, 2.3, 9.5, 1.45);
    light.position.set(posX, 2.55, posZ + 0.35);
    root.add(light);

    return {
      descriptor: {
        ...taskDef,
        id: taskDef.id || kind,
        kind,
        title: taskDef.title || signConfig.title,
        position: taskVector,
        approach,
        mesh,
        light,
      },
      kind,
      baseHex,
      coreMat,
      housingMat,
      animPart,
      light,
      taskIndex,
    };
  });

  const isCompleted = (completedIds, record) =>
    Boolean(
      completedIds &&
        typeof completedIds.has === 'function' &&
        (completedIds.has(record.descriptor.id) ||
          completedIds.has(record.kind) ||
          completedIds.has(record.taskIndex) ||
          completedIds.has(record.taskIndex + 1))
    );

  function update(deltaSeconds = 0.016, elapsedSeconds = 0, completedIds = new Set()) {
    const safeDt = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0.016));
    const safeTime = Number(elapsedSeconds) || 0;
    let completedCount = 0;

    for (const record of taskRecords) {
      if (isCompleted(completedIds, record)) {
        completedCount++;
        const hum = 0.9 + 0.1 * Math.sin(safeTime * 5.5 + record.taskIndex);
        record.light.color.setHex(0x22f3ff);
        record.light.intensity = 2.8 * hum;
        record.light.distance = 12.0;
        record.coreMat.color.setHex(0x67f9ff);
        record.coreMat.emissive.setHex(0x00d9f5);
        record.coreMat.emissiveIntensity = 2.1 * hum;
        record.housingMat.emissive.setHex(0x0d4f5c);
        record.housingMat.emissiveIntensity = 0.48;
        if (record.animPart) {
          if (record.kind === 'valve') {
            record.animPart.rotation.z += safeDt * 1.4;
          } else if (record.kind === 'uplink') {
            record.animPart.rotation.y = safeTime * 1.6;
          }
        }
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(safeTime * 4.2 + record.taskIndex * 1.7);
        record.light.color.setHex(record.baseHex);
        record.light.intensity = 1.45 + pulse * 1.35;
        record.light.distance = 9.0;
        record.coreMat.color.setHex(record.baseHex);
        record.coreMat.emissive.setHex(record.baseHex);
        record.coreMat.emissiveIntensity = 1.05 + pulse * 1.25;
        record.housingMat.emissive.setHex(0x451a03);
        record.housingMat.emissiveIntensity = 0.32 + pulse * 0.2;
        if (record.animPart) {
          if (record.kind === 'valve') {
            record.animPart.rotation.z = Math.sin(safeTime * 2.2) * 0.18;
          } else if (record.kind === 'uplink') {
            record.animPart.rotation.y = Math.sin(safeTime * 0.9) * 0.65;
          }
        }
      }
    }

    for (let lightIdx = 0; lightIdx < redLights.length; lightIdx++) {
      redLights[lightIdx].intensity =
        1.85 * (0.88 + 0.12 * Math.sin(safeTime * 4.5 + lightIdx * 2.1));
    }
    portholeGlassMat.emissiveIntensity = 0.92 + 0.16 * Math.sin(safeTime * 1.8);

    if (taskRecords.length > 0 && completedCount >= taskRecords.length) {
      const beaconPulse = 0.65 + 0.35 * Math.sin(safeTime * 5.0);
      exitLight.color.setHex(0x22ffaa);
      exitLight.intensity = 2.6 + beaconPulse * 1.3;
      exitBeaconMat.color.setHex(0x44ffbb);
      exitBeaconMat.emissive.setHex(0x10e898);
      exitBeaconMat.emissiveIntensity = 1.6 + beaconPulse;
      exitMat.emissive.setHex(0x0a3d32);
      exitWheel.rotation.z = safeTime * 0.8;
    } else {
      const lockPulse = 0.5 + 0.5 * Math.sin(safeTime * 2.4);
      exitLight.color.setHex(0xff3824);
      exitLight.intensity = 1.9 + lockPulse * 0.75;
      exitBeaconMat.color.setHex(0xff3b28);
      exitBeaconMat.emissive.setHex(0xff2210);
      exitBeaconMat.emissiveIntensity = 1.3 + lockPulse * 0.65;
      exitMat.emissive.setHex(0x2b0906);
    }
  }

  function dispose() {
    if (root.parent) root.parent.remove(root);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
  }

  const spawnCoord = resolvedLayout.spawn || { x: 0, z: 2 };
  const spawnVector = new THREE.Vector3(spawnCoord.x, 1.65, spawnCoord.z);

  return {
    root,
    spawn: spawnVector,
    exit: { position: exitPosition, mesh: exitMesh },
    tasks: taskRecords.map((record) => record.descriptor),
    hidingSpots: layoutHidingSpots,
    obstacles: layoutObstacles,
    bounds,
    update,
    dispose,
  };
}
