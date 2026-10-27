import * as THREE from 'three';

const STAGE_AGGRESSION = Object.freeze({
  patrol: 0,
  blinded: 0.25,
  notice: 0.45,
  search: 0.65,
  chase: 1,
});

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function resolveAggression(aggressionInput, stageInput) {
  if (typeof aggressionInput === 'string' && aggressionInput in STAGE_AGGRESSION) {
    return STAGE_AGGRESSION[aggressionInput];
  }
  const numericAggression = Number(aggressionInput);
  const stageAggression =
    typeof stageInput === 'string' && stageInput in STAGE_AGGRESSION ? STAGE_AGGRESSION[stageInput] : 0;
  if (Number.isFinite(numericAggression)) {
    return Math.max(0, Math.min(1, Math.max(numericAggression, stageAggression)));
  }
  return stageAggression;
}

export function createCreature(scene) {
  const group = new THREE.Group();
  group.name = 'AbyssalDiveSuit';
  if (scene && typeof scene.add === 'function') scene.add(group);

  const geometries = new Set();
  const materials = new Set();

  const trackGeo = (geometry) => {
    geometries.add(geometry);
    return geometry;
  };
  const trackMat = (material) => {
    materials.add(material);
    return material;
  };

  const suitMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x162228, roughness: 0.86, metalness: 0.28 })
  );
  const bronzeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c4928,
      emissive: 0x120d04,
      emissiveIntensity: 0.25,
      roughness: 0.48,
      metalness: 0.78,
    })
  );
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e282e, roughness: 0.54, metalness: 0.84 })
  );
  const hoseMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x10181d, roughness: 0.72, metalness: 0.35 })
  );
  const voidMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x020406, side: THREE.BackSide })
  );
  const barnacleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x6f7d73, roughness: 0.92, metalness: 0.12 })
  );
  const eyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xff6b1a,
      emissiveIntensity: 3.2,
      roughness: 0.1,
      metalness: 0.1,
    })
  );
  const gaugeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38e8ff,
      emissive: 0x1499b8,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.2,
    })
  );

  const limbGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.095, 0.68, 10));
  const jointGeo = trackGeo(new THREE.SphereGeometry(0.135, 10, 8));
  const cuffGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.135, 0.14, 10));
  const clawProxGeo = trackGeo(new THREE.BoxGeometry(0.036, 0.18, 0.042));
  clawProxGeo.translate(0, -0.09, 0);
  const clawDistGeo = trackGeo(new THREE.ConeGeometry(0.024, 0.16, 6));
  clawDistGeo.rotateX(Math.PI);
  clawDistGeo.translate(0, -0.08, 0);
  const barnacleGeo = trackGeo(new THREE.ConeGeometry(0.065, 0.09, 6, 1, true));

  const pelvisPivot = new THREE.Group();
  pelvisPivot.position.set(0, 1.18, 0);
  group.add(pelvisPivot);
  pelvisPivot.add(new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.28, 0.32, 12)), ironMat));

  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.16, 0);
  pelvisPivot.add(torsoPivot);

  const abdomen = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.35, 0.29, 0.42, 12)), suitMat);
  abdomen.position.set(0, 0.2, 0);
  torsoPivot.add(abdomen);

  const chest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.84, 0.62, 0.56)), suitMat);
  chest.position.set(0, 0.62, 0.02);
  torsoPivot.add(chest);

  const breastplate = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.44, 0.36, 0.58, 10)), bronzeMat);
  breastplate.scale.set(1.05, 1.0, 0.72);
  breastplate.position.set(0, 0.64, 0.05);
  torsoPivot.add(breastplate);

  const regBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.34, 0.28, 0.18)), ironMat);
  regBox.position.set(0, 0.58, 0.32);
  torsoPivot.add(regBox);

  const chestGauge = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12)), gaugeMat);
  chestGauge.rotation.x = Math.PI / 2;
  chestGauge.position.set(0, 0.6, 0.41);
  torsoPivot.add(chestGauge);

  const tankGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.74, 10));
  const leftTank = new THREE.Mesh(tankGeo, bronzeMat);
  leftTank.position.set(-0.18, 0.64, -0.34);
  torsoPivot.add(leftTank);

  const rightTank = new THREE.Mesh(tankGeo, bronzeMat);
  rightTank.position.set(0.18, 0.64, -0.34);
  torsoPivot.add(rightTank);

  const collar = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.28, 0.065, 10, 18)), bronzeMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.82, 0.04);
  torsoPivot.add(collar);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.8, 0.05);
  torsoPivot.add(headPivot);

  const helmetOuter = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.36, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.85)),
    bronzeMat
  );
  helmetOuter.position.set(0, 0.18, 0);
  headPivot.add(helmetOuter);

  const helmetHollow = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.31, 12, 10)), voidMat);
  helmetHollow.position.set(0, 0.18, 0.04);
  headPivot.add(helmetHollow);

  const viewportRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.21, 0.045, 10, 16)), ironMat);
  viewportRim.position.set(0, 0.18, 0.31);
  headPivot.add(viewportRim);

  const grilleBar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 6)), bronzeMat);
  grilleBar.position.set(0, 0.18, 0.34);
  headPivot.add(grilleBar);

  const crest = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.12, 0.32)), bronzeMat);
  crest.position.set(0, 0.5, 0);
  headPivot.add(crest);

  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.042, 10, 8));
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.085, 0.2, 0.18);
  headPivot.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.085, 0.2, 0.18);
  headPivot.add(rightEye);

  const helmetLight = new THREE.PointLight(0xff7722, 1.35, 4.5, 1.6);
  helmetLight.position.set(0, 0.23, 0.36);
  headPivot.add(helmetLight);

  const makeHose = (curvePoints) =>
    new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints), 12, 0.042, 8, false)),
      hoseMat
    );
  torsoPivot.add(
    makeHose([
      new THREE.Vector3(-0.18, 0.88, -0.32),
      new THREE.Vector3(-0.38, 1.02, -0.05),
      new THREE.Vector3(-0.27, 1.12, 0.22),
    ])
  );
  torsoPivot.add(
    makeHose([
      new THREE.Vector3(0.14, 0.58, 0.36),
      new THREE.Vector3(0.36, 0.78, 0.32),
      new THREE.Vector3(0.26, 1.08, 0.2),
    ])
  );

  const pauldronGeo = trackGeo(new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65));
  const palmGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.14, 0.08));

  const buildArm = (sideSign) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(sideSign * 0.54, 0.86, 0.04);
    torsoPivot.add(shoulderPivot);

    const pauldron = new THREE.Mesh(pauldronGeo, bronzeMat);
    pauldron.rotation.z = -sideSign * 0.35;
    shoulderPivot.add(pauldron);

    const upperArm = new THREE.Mesh(limbGeo, suitMat);
    upperArm.position.set(0, -0.34, 0);
    shoulderPivot.add(upperArm);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.68, 0);
    shoulderPivot.add(elbowPivot);
    elbowPivot.add(new THREE.Mesh(jointGeo, ironMat));

    const forearm = new THREE.Mesh(limbGeo, suitMat);
    forearm.scale.set(0.92, 1.08, 0.92);
    forearm.position.set(0, -0.36, 0);
    elbowPivot.add(forearm);

    const cuff = new THREE.Mesh(cuffGeo, bronzeMat);
    cuff.position.set(0, -0.7, 0);
    elbowPivot.add(cuff);

    const handPivot = new THREE.Group();
    handPivot.position.set(0, -0.76, 0);
    elbowPivot.add(handPivot);

    const palm = new THREE.Mesh(palmGeo, ironMat);
    palm.position.set(0, -0.06, 0);
    handPivot.add(palm);

    const fingers = [];
    for (let fingerSlot = -1; fingerSlot <= 1; fingerSlot++) {
      const fingerRoot = new THREE.Group();
      fingerRoot.position.set(fingerSlot * 0.045, -0.12, 0.01);
      handPivot.add(fingerRoot);
      fingerRoot.add(new THREE.Mesh(clawProxGeo, ironMat));

      const distal = new THREE.Mesh(clawDistGeo, bronzeMat);
      distal.position.set(0, -0.17, 0.01);
      distal.rotation.x = 0.38;
      fingerRoot.add(distal);
      fingers.push({ root: fingerRoot, distal });
    }

    const thumbRoot = new THREE.Group();
    thumbRoot.position.set(-sideSign * 0.075, -0.08, 0.035);
    thumbRoot.rotation.z = sideSign * 0.45;
    handPivot.add(thumbRoot);
    const thumbClaw = new THREE.Mesh(clawDistGeo, bronzeMat);
    thumbRoot.add(thumbClaw);
    fingers.push({ root: thumbRoot, distal: thumbClaw });

    return { shoulderPivot, elbowPivot, handPivot, fingers, side: sideSign };
  };

  const leftArm = buildArm(1);
  const rightArm = buildArm(-1);

  const thighGeo = trackGeo(new THREE.CylinderGeometry(0.145, 0.125, 0.54, 10));
  const shinGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.14, 0.46, 10));
  const bootGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.2, 0.42));

  const buildLeg = (sideSign) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(sideSign * 0.21, -0.06, 0);
    pelvisPivot.add(hipPivot);

    const thigh = new THREE.Mesh(thighGeo, suitMat);
    thigh.position.set(0, -0.27, 0);
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.54, 0);
    hipPivot.add(kneePivot);
    kneePivot.add(new THREE.Mesh(jointGeo, bronzeMat));

    const shin = new THREE.Mesh(shinGeo, suitMat);
    shin.position.set(0, -0.23, 0);
    kneePivot.add(shin);

    const boot = new THREE.Mesh(bootGeo, ironMat);
    boot.position.set(0, -0.48, 0.07);
    kneePivot.add(boot);

    return { hipPivot, kneePivot, side: sideSign };
  };

  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);

  const barnacles = [
    [helmetOuter, [-0.22, 0.18, 0.14], [0.4, 0.2, 0.9], 1.1],
    [helmetOuter, [-0.14, 0.28, -0.16], [-0.6, 0.1, 0.4], 0.85],
    [leftArm.shoulderPivot, [0.12, 0.12, 0.08], [0.3, 0, -0.8], 1.2],
    [breastplate, [0.24, -0.1, 0.22], [1.2, 0.3, -0.4], 1.0],
    [leftTank, [-0.08, 0.15, -0.11], [-1.3, 0, 0.2], 1.15],
    [rightLeg.kneePivot, [-0.09, -0.42, 0.18], [1.1, 0.2, 0], 0.95],
  ];
  for (const [parentNode, offsetCoords, eulerAngles, scaleFactor] of barnacles) {
    const barnacleMesh = new THREE.Mesh(barnacleGeo, barnacleMat);
    barnacleMesh.position.set(...offsetCoords);
    barnacleMesh.rotation.set(...eulerAngles);
    barnacleMesh.scale.setScalar(scaleFactor);
    parentNode.add(barnacleMesh);
  }

  let gaitPhase = 0;

  function applyNeutralPose() {
    pelvisPivot.position.set(0, 1.18, 0);
    pelvisPivot.rotation.set(0, 0, 0);
    torsoPivot.rotation.set(0.08, 0, 0);
    torsoPivot.scale.set(1, 1, 1);
    headPivot.rotation.set(0.05, 0, 0);

    leftArm.shoulderPivot.rotation.set(-0.22, 0, -0.12);
    leftArm.elbowPivot.rotation.set(-0.42, 0, 0);
    leftArm.handPivot.rotation.set(0, 0, 0);

    rightArm.shoulderPivot.rotation.set(-0.22, 0, 0.12);
    rightArm.elbowPivot.rotation.set(-0.42, 0, 0);
    rightArm.handPivot.rotation.set(0, 0, 0);

    for (const arm of [leftArm, rightArm]) {
      for (const finger of arm.fingers) finger.root.rotation.x = 0.35;
    }

    leftLeg.hipPivot.rotation.set(0, 0, 0);
    leftLeg.kneePivot.rotation.set(0, 0, 0);
    rightLeg.hipPivot.rotation.set(0, 0, 0);
    rightLeg.kneePivot.rotation.set(0, 0, 0);

    eyeMat.emissive.setHex(0xff6b1a);
    eyeMat.emissiveIntensity = 3.2;
    helmetLight.color.setHex(0xff7722);
    helmetLight.intensity = 1.35;
  }

  applyNeutralPose();

  function update(deltaSeconds = 0.016, elapsedSeconds = 0, state = {}) {
    const safeDt = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0.016));
    const safeTime = Number(elapsedSeconds) || 0;
    const { moving = false, aggression = 0, lit = false, blinded = false, stage = '' } = state || {};

    const reducedMotion = prefersReducedMotion();
    const aggr = resolveAggression(aggression, stage);
    const isMoving = Boolean(moving) && (typeof moving !== 'number' || moving > 0.01);
    const isBlinded = Boolean(lit || blinded || stage === 'blinded');

    gaitPhase += safeDt * (isMoving ? 2.4 + aggr * 1.9 : 0.6);
    const breath = Math.sin(safeTime * (1.6 + aggr * 2.2));
    torsoPivot.scale.set(1 + breath * 0.022, 1 + breath * 0.015, 1 + breath * 0.032);

    if (isMoving) {
      const stride = Math.sin(gaitPhase * 2.0);
      const liftLeft = Math.max(0, Math.cos(gaitPhase * 2.0));
      const liftRight = Math.max(0, -Math.cos(gaitPhase * 2.0));

      leftLeg.hipPivot.rotation.x = -stride * (0.46 + aggr * 0.16);
      leftLeg.kneePivot.rotation.x = 0.14 + liftLeft * 0.48;
      rightLeg.hipPivot.rotation.x = stride * (0.42 + aggr * 0.14);
      rightLeg.kneePivot.rotation.x = 0.18 + liftRight * 0.42;

      pelvisPivot.position.y = 1.18 - Math.abs(stride) * 0.065;
      pelvisPivot.rotation.z = stride * 0.065;
      pelvisPivot.rotation.y = -stride * 0.08;
    } else {
      leftLeg.hipPivot.rotation.x *= 0.85;
      leftLeg.kneePivot.rotation.x *= 0.85;
      rightLeg.hipPivot.rotation.x *= 0.85;
      rightLeg.kneePivot.rotation.x *= 0.85;
      pelvisPivot.position.y = 1.18 + breath * 0.018;
      pelvisPivot.rotation.z = Math.sin(safeTime * 0.9) * 0.025;
      pelvisPivot.rotation.y = Math.cos(safeTime * 0.7) * 0.03;
    }

    const blindWave = reducedMotion ? Math.sin(safeTime * 2.4) * 0.03 : Math.sin(safeTime * 11.0) * 0.05;
    const flinch = isBlinded ? -0.24 + blindWave : 0;
    torsoPivot.rotation.x = 0.08 + aggr * 0.24 + breath * 0.03 + flinch * 0.5;
    torsoPivot.rotation.z = Math.sin(gaitPhase) * (isMoving ? 0.05 : 0.015);

    const headShake = isBlinded
      ? reducedMotion
        ? Math.cos(safeTime * 2.2) * 0.08
        : Math.cos(safeTime * 9.5) * 0.13
      : 0;
    headPivot.rotation.x = 0.05 - aggr * 0.12 + flinch;
    headPivot.rotation.y = Math.sin(safeTime * (1.3 + aggr * 1.4)) * 0.18 + headShake;
    headPivot.rotation.z = Math.cos(safeTime * 1.1) * 0.06;

    const armSwing = isMoving ? Math.sin(gaitPhase * 2.0) * 0.34 : Math.sin(safeTime * 1.4) * 0.06;
    const reach = -0.25 - aggr * 0.75 - (isBlinded ? 0.42 : 0);

    leftArm.shoulderPivot.rotation.x = reach + armSwing;
    leftArm.shoulderPivot.rotation.z = -0.14 - aggr * 0.12 + (isBlinded ? 0.24 : 0);
    leftArm.elbowPivot.rotation.x = -0.45 - aggr * 0.35 - (isBlinded ? 0.38 : 0);

    rightArm.shoulderPivot.rotation.x = reach - armSwing;
    rightArm.shoulderPivot.rotation.z = 0.14 + aggr * 0.12 - (isBlinded ? 0.24 : 0);
    rightArm.elbowPivot.rotation.x = -0.45 - aggr * 0.35 - (isBlinded ? 0.32 : 0);

    for (const arm of [leftArm, rightArm]) {
      for (let fingerIndex = 0; fingerIndex < arm.fingers.length; fingerIndex++) {
        arm.fingers[fingerIndex].root.rotation.x =
          0.35 +
          aggr * 0.45 +
          Math.sin(safeTime * (3.5 + aggr * 4.0) + fingerIndex * 1.3 + arm.side) * (0.14 + aggr * 0.18);
      }
    }

    if (isBlinded) {
      const blindPulse = reducedMotion ? 0.88 : 0.72 + 0.28 * Math.sin(safeTime * 6.5);
      eyeMat.emissive.setHex(0xffffff);
      eyeMat.emissiveIntensity = 3.6 * blindPulse;
      helmetLight.color.setHex(0xffaa44);
      helmetLight.intensity = 2.0 * blindPulse;
    } else if (aggr > 0.35) {
      const aggrPulse = reducedMotion ? 0.92 : 0.82 + 0.18 * Math.sin(safeTime * 5.5);
      eyeMat.emissive.setHex(0xff2a00);
      eyeMat.emissiveIntensity = (3.4 + aggr * 2.2) * aggrPulse;
      helmetLight.color.setHex(0xff3300);
      helmetLight.intensity = (1.5 + aggr * 1.2) * aggrPulse;
    } else {
      const slowPulse = 0.85 + 0.15 * Math.sin(safeTime * 2.8);
      eyeMat.emissive.setHex(0xff6b1a);
      eyeMat.emissiveIntensity = 3.0 * slowPulse;
      helmetLight.color.setHex(0xff7722);
      helmetLight.intensity = 1.35 * slowPulse;
    }
    gaugeMat.emissiveIntensity = 1.0 + 0.4 * breath + aggr * 0.9;
  }

  function reset() {
    gaitPhase = 0;
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    applyNeutralPose();
  }

  function dispose() {
    if (group.parent) group.parent.remove(group);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    geometries.clear();
    materials.clear();
  }

  return { group, root: group, position: group.position, update, reset, dispose };
}
