import * as THREE from 'three';
import type {
  ColliderBox,
  GameStateSnapshot,
  Interactable,
  PBRTextureSet,
  PropModuleResult,
  TextureBundle,
} from '../types';

const APOTHEM = 6.8;
const CORNER_RADIUS = APOTHEM / Math.cos(Math.PI / 8); // ~7.3602m
const WALL_SIDE = 2 * APOTHEM * Math.tan(Math.PI / 8); // ~5.6333m
const WALL_HEIGHT = 5.0;
const DOME_RADIUS = 6.98;
const DOME_HEIGHT = 4.6; // Dome rises cleanly from y = 5.0m to y = 9.6m
const SHUTTER_HALF_W = 1.38;
const SHUTTER_REAR_Z = 0.85;

// Deterministic PRNG for books & subtle architectural variations
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneTextureWithRepeat(
  tex: THREE.CanvasTexture,
  rx: number,
  ry: number
): THREE.CanvasTexture {
  const cloned = tex.clone();
  cloned.wrapS = THREE.RepeatWrapping;
  cloned.wrapT = THREE.RepeatWrapping;
  cloned.repeat.set(rx, ry);
  cloned.needsUpdate = true;
  return cloned;
}

function createPBRMaterial(
  set: PBRTextureSet,
  opts: {
    color?: THREE.ColorRepresentation;
    roughness?: number;
    metalness?: number;
    bumpScale?: number;
    repeatX?: number;
    repeatY?: number;
    side?: THREE.Side;
    envMapIntensity?: number;
  } = {}
): THREE.MeshStandardMaterial {
  const rx = opts.repeatX ?? 1;
  const ry = opts.repeatY ?? 1;
  const map = rx === 1 && ry === 1 ? set.map : cloneTextureWithRepeat(set.map, rx, ry);
  const bumpMap =
    rx === 1 && ry === 1 ? set.bumpMap : cloneTextureWithRepeat(set.bumpMap, rx, ry);
  const roughnessMap =
    rx === 1 && ry === 1 ? set.roughnessMap : cloneTextureWithRepeat(set.roughnessMap, rx, ry);

  return new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    map,
    bumpMap,
    bumpScale: opts.bumpScale ?? 0.015,
    roughnessMap,
    roughness: opts.roughness ?? 0.65,
    metalness: opts.metalness ?? 0.08,
    side: opts.side ?? THREE.FrontSide,
    envMapIntensity: opts.envMapIntensity ?? 1.0,
  });
}

function createWallGroup(wallIndex: number): THREE.Group {
  // wallIndex 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
  const angle = wallIndex * (Math.PI / 4);
  const g = new THREE.Group();
  g.name = `Wall_${wallIndex}`;
  g.position.set(Math.sin(angle) * APOTHEM, 0, -Math.cos(angle) * APOTHEM);
  g.rotation.y = -angle;
  return g;
}

function wallLocalToWorld(wallIndex: number, local: THREE.Vector3): THREE.Vector3 {
  const angle = wallIndex * (Math.PI / 4);
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  // Wall origin is (sinA * APOTHEM, 0, -cosA * APOTHEM), rotY = -angle
  // Rotation by -angle around Y:
  // x' = x * cos(-a) + z * sin(-a) = x * cosA - z * sinA
  // z' = -x * sin(-a) + z * cos(-a) = x * sinA + z * cosA
  return new THREE.Vector3(
    sinA * APOTHEM + local.x * cosA - local.z * sinA,
    local.y,
    -cosA * APOTHEM + local.x * sinA + local.z * cosA
  );
}

/**
 * Builds an observatory dome copper shell with a true physical open North shutter slit
 * (x in [-1.12, 1.12], z < 0.65) and recessed tinted glass skylight bays on E/W/S quadrants.
 */
function buildObservatoryDomeGeometry(): {
  copperGeo: THREE.BufferGeometry;
  glassGeo: THREE.BufferGeometry;
} {
  const azSegs = 64;
  const elSegs = 22;

  const copperPos: number[] = [];
  const copperNorm: number[] = [];
  const copperUv: number[] = [];
  const copperIdx: number[] = [];

  const glassPos: number[] = [];
  const glassNorm: number[] = [];
  const glassUv: number[] = [];
  const glassIdx: number[] = [];

  const pushQuad = (
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[],
    p00: THREE.Vector3,
    p10: THREE.Vector3,
    p11: THREE.Vector3,
    p01: THREE.Vector3,
    u0: number,
    u1: number,
    v0: number,
    v1: number
  ) => {
    const base = positions.length / 3;
    const pts = [p00, p10, p11, p01];
    const uvPts = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    for (let k = 0; k < 4; k++) {
      const p = pts[k];
      positions.push(p.x, p.y, p.z);
      // Inward-pointing dome normal (for interior viewing)
      const nx = -p.x / DOME_RADIUS;
      const ny = -(p.y - WALL_HEIGHT) / (DOME_HEIGHT * (DOME_HEIGHT / DOME_RADIUS));
      const nz = -p.z / DOME_RADIUS;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
      uvs.push(uvPts[k][0], uvPts[k][1]);
    }
    // Counter-clockwise winding when viewed from inside the chamber (matches inward normals)
    indices.push(base, base + 1, base + 2);
    indices.push(base, base + 2, base + 3);
  };

  const sampleDome = (phi: number, theta: number, radiusOffset = 0): THREE.Vector3 => {
    // phi = 0 is North (-Z), increasing clockwise toward East (+X)
    const r = (DOME_RADIUS + radiusOffset) * Math.cos(theta);
    const x = Math.sin(phi) * r;
    const z = -Math.cos(phi) * r;
    const y = WALL_HEIGHT + (DOME_HEIGHT + radiusOffset * 0.72) * Math.sin(theta);
    return new THREE.Vector3(x, y, z);
  };

  for (let i = 0; i < azSegs; i++) {
    const phi0 = (i / azSegs) * Math.PI * 2;
    const phi1 = ((i + 1) / azSegs) * Math.PI * 2;
    const phiMid = (phi0 + phi1) * 0.5;

    for (let j = 0; j < elSegs; j++) {
      const th0 = (j / elSegs) * (Math.PI * 0.492);
      const th1 = ((j + 1) / elSegs) * (Math.PI * 0.492);
      const thMid = (th0 + th1) * 0.5;

      const mid = sampleDome(phiMid, thMid);

      // Physical North Shutter Opening: parallel slit x in [-SHUTTER_HALF_W, +SHUTTER_HALF_W], z < SHUTTER_REAR_Z
      const inShutterSlit =
        Math.abs(mid.x) < SHUTTER_HALF_W && mid.z < SHUTTER_REAR_Z && thMid > 0.04;
      if (inShutterSlit) {
        continue;
      }

      // Curved glass skylight windows on E, SE, S, SW, W bays in mid-upper elevation
      // 16 architectural bays -> bayIndex 0..15 (phi=0 is North)
      const bayIdx = Math.floor(((phiMid / (Math.PI * 2)) * 16) % 16);
      const isSkylightBay =
        (bayIdx === 3 || bayIdx === 4 || bayIdx === 7 || bayIdx === 8 || bayIdx === 11 || bayIdx === 12) &&
        j >= 5 &&
        j <= 13;

      const u0 = (i / azSegs) * 8;
      const u1 = ((i + 1) / azSegs) * 8;
      const v0 = (j / elSegs) * 3;
      const v1 = ((j + 1) / elSegs) * 3;

      if (isSkylightBay) {
        const p00 = sampleDome(phi0, th0, 0.04);
        const p10 = sampleDome(phi1, th0, 0.04);
        const p11 = sampleDome(phi1, th1, 0.04);
        const p01 = sampleDome(phi0, th1, 0.04);
        pushQuad(glassPos, glassNorm, glassUv, glassIdx, p00, p10, p11, p01, u0, u1, v0, v1);
      } else {
        const p00 = sampleDome(phi0, th0, 0);
        const p10 = sampleDome(phi1, th0, 0);
        const p11 = sampleDome(phi1, th1, 0);
        const p01 = sampleDome(phi0, th1, 0);
        pushQuad(copperPos, copperNorm, copperUv, copperIdx, p00, p10, p11, p01, u0, u1, v0, v1);
      }
    }
  }

  const copperGeo = new THREE.BufferGeometry();
  copperGeo.setAttribute('position', new THREE.Float32BufferAttribute(copperPos, 3));
  copperGeo.setAttribute('normal', new THREE.Float32BufferAttribute(copperNorm, 3));
  copperGeo.setAttribute('uv', new THREE.Float32BufferAttribute(copperUv, 2));
  copperGeo.setIndex(copperIdx);

  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(glassPos, 3));
  glassGeo.setAttribute('normal', new THREE.Float32BufferAttribute(glassNorm, 3));
  glassGeo.setAttribute('uv', new THREE.Float32BufferAttribute(glassUv, 2));
  glassGeo.setIndex(glassIdx);

  return { copperGeo, glassGeo };
}

export function buildObservatoryRoom(textures: TextureBundle): PropModuleResult {
  const group = new THREE.Group();
  group.name = 'ObservatoryRoom';

  const interactables: Interactable[] = [];
  const colliders: ColliderBox[] = [];
  const animatedFlames: Array<{ mesh: THREE.Mesh; baseScaleY: number; phase: number }> = [];
  let clockPendulum: THREE.Object3D | null = null;
  let clockMinuteHand: THREE.Object3D | null = null;
  let celestialGlobeBall: THREE.Object3D | null = null;

  // =========================================================================
  // 1. SHARED ARCHITECTURAL PBR MATERIALS
  // =========================================================================
  const walnutMat = createPBRMaterial(textures.walnut, {
    color: 0xd9c2aa,
    roughness: 0.52,
    metalness: 0.06,
    bumpScale: 0.018,
    repeatX: 2,
    repeatY: 2,
    envMapIntensity: 0.9,
  });

  const walnutDarkMat = createPBRMaterial(textures.walnut, {
    color: 0x997960,
    roughness: 0.48,
    metalness: 0.08,
    bumpScale: 0.02,
    repeatX: 1.5,
    repeatY: 2,
    envMapIntensity: 0.95,
  });

  const mahoganyMat = createPBRMaterial(textures.walnut, {
    color: 0x8f5642,
    roughness: 0.44,
    metalness: 0.07,
    bumpScale: 0.016,
    repeatX: 1.5,
    repeatY: 2,
    envMapIntensity: 0.95,
  });

  const brassMat = createPBRMaterial(textures.brass, {
    color: 0xf4d58d,
    roughness: 0.30,
    metalness: 0.86,
    bumpScale: 0.012,
    repeatX: 1,
    repeatY: 1,
    envMapIntensity: 1.25,
  });

  const brassBrightMat = createPBRMaterial(textures.brass, {
    color: 0xffe4a8,
    roughness: 0.22,
    metalness: 0.92,
    bumpScale: 0.008,
    repeatX: 1,
    repeatY: 1,
    envMapIntensity: 1.35,
  });

  const bronzeMat = createPBRMaterial(textures.brass, {
    color: 0xb68b52,
    roughness: 0.42,
    metalness: 0.82,
    bumpScale: 0.014,
    repeatX: 1,
    repeatY: 1,
    envMapIntensity: 1.1,
  });

  const darkIronMat = createPBRMaterial(textures.darkIron, {
    color: 0x5c626e,
    roughness: 0.50,
    metalness: 0.78,
    bumpScale: 0.018,
    repeatX: 2,
    repeatY: 2,
    envMapIntensity: 1.0,
  });

  const stoneMat = createPBRMaterial(textures.stonePlinth, {
    color: 0xb5b9c4,
    roughness: 0.68,
    metalness: 0.08,
    bumpScale: 0.024,
    repeatX: 2,
    repeatY: 2,
    envMapIntensity: 0.75,
  });

  const marbleFloorMat = createPBRMaterial(textures.marbleFloor, {
    color: 0xe6e8ee,
    roughness: 0.28,
    metalness: 0.15,
    bumpScale: 0.014,
    repeatX: 1,
    repeatY: 1,
    envMapIntensity: 1.15,
  });

  const copperDomeMat = createPBRMaterial(textures.copperDome, {
    color: 0xc2d8cc,
    roughness: 0.42,
    metalness: 0.62,
    bumpScale: 0.028,
    repeatX: 1,
    repeatY: 1,
    side: THREE.DoubleSide,
    envMapIntensity: 1.35,
  });

  const skylightGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b6ca8,
    roughness: 0.09,
    metalness: 0.12,
    transparent: true,
    opacity: 0.24,
    reflectivity: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const persianRugMat = createPBRMaterial(textures.persianRug, {
    color: 0xe6d4c8,
    roughness: 0.88,
    metalness: 0.02,
    bumpScale: 0.016,
    repeatX: 1,
    repeatY: 1,
    envMapIntensity: 0.45,
  });

  const velvetCrimsonMat = new THREE.MeshStandardMaterial({
    color: 0x6a1924,
    roughness: 0.88,
    metalness: 0.04,
    bumpMap: textures.leather.bumpMap,
    bumpScale: 0.008,
    envMapIntensity: 0.5,
  });

  const parchmentMat = new THREE.MeshStandardMaterial({
    color: 0xdccaa2,
    roughness: 0.82,
    metalness: 0.02,
  });

  const glassGlobeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffd79e,
    emissive: new THREE.Color('#ffaa46'),
    emissiveIntensity: 1.85,
    roughness: 0.28,
    metalness: 0.02,
    transparent: true,
    opacity: 0.88,
    transmission: 0.22,
    thickness: 0.04,
  });

  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xfff5d4,
    emissive: new THREE.Color('#ffda7a'),
    emissiveIntensity: 3.1,
    roughness: 0.2,
    metalness: 0.0,
  });

  // =========================================================================
  // 2. OCTAGONAL INLAID MARBLE & COMPASS-ROSE FLOOR + BRASS RINGS + RUGS
  // =========================================================================
  const floorGroup = new THREE.Group();
  floorGroup.name = 'Floor';
  group.add(floorGroup);

  const floorGeo = new THREE.CircleGeometry(CORNER_RADIUS + 0.12, 8);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.rotateY(Math.PI / 8); // Align flat edges with N/NE/E/SE/S/SW/W/NW walls
  const floorMesh = new THREE.Mesh(floorGeo, marbleFloorMat);
  floorMesh.receiveShadow = true;
  floorGroup.add(floorMesh);

  // Raised flush concentric brass trim rings at r = 1.65m, 3.85m, 6.4m
  const ringRadii = [
    { r: 1.65, w: 0.06 },
    { r: 3.85, w: 0.072 },
    { r: 6.4, w: 0.085 },
  ];
  for (const spec of ringRadii) {
    const ringGeo = new THREE.RingGeometry(spec.r - spec.w * 0.5, spec.r + spec.w * 0.5, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(ringGeo, brassBrightMat);
    ringMesh.position.y = 0.004;
    ringMesh.receiveShadow = true;
    floorGroup.add(ringMesh);

    // Thin dark-bronze chamfer border lines flanking each brass ring
    for (const dir of [-1, 1]) {
      const rimR = spec.r + dir * (spec.w * 0.5 + 0.009);
      const rimGeo = new THREE.RingGeometry(rimR - 0.008, rimR + 0.008, 64);
      rimGeo.rotateX(-Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, bronzeMat);
      rimMesh.position.y = 0.003;
      floorGroup.add(rimMesh);
    }
  }

  // 8 radial compass-rose brass inlay strips from r=1.65 to r=6.4
  const rayBarGeo = new THREE.BoxGeometry(0.04, 0.005, 4.75);
  for (let i = 0; i < 8; i++) {
    const a = i * (Math.PI / 4);
    const bar = new THREE.Mesh(rayBarGeo, brassMat);
    bar.position.set(Math.sin(a) * 4.025, 0.003, -Math.cos(a) * 4.025);
    bar.rotation.y = -a;
    bar.receiveShadow = true;
    floorGroup.add(bar);
  }

  // 48 brass degree-tick medallions inlaid along the r = 3.85m brass compass ring
  const tickGeo = new THREE.BoxGeometry(0.02, 0.006, 0.16);
  const tickInst = new THREE.InstancedMesh(tickGeo, brassBrightMat, 48);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 3.85, 0.0045, -Math.cos(a) * 3.85);
    dummy.rotation.set(0, -a, 0);
    dummy.scale.set(1, 1, i % 4 === 0 ? 1.55 : 0.85);
    dummy.updateMatrix();
    tickInst.setMatrixAt(i, dummy.matrix);
  }
  tickInst.instanceMatrix.needsUpdate = true;
  floorGroup.add(tickInst);

  // Persian Astronomical Rug under East Writing Desk zone (4.75, 0, -0.45) + chair (3.75, 0, -0.35)
  const buildPersianRug = (
    w: number,
    d: number,
    pos: [number, number, number],
    rotY: number
  ) => {
    const rugGroup = new THREE.Group();
    rugGroup.position.set(pos[0], pos[1], pos[2]);
    rugGroup.rotation.y = rotY;

    const rugGeo = new THREE.BoxGeometry(w, 0.014, d);
    const rugMesh = new THREE.Mesh(rugGeo, persianRugMat);
    rugMesh.position.y = 0.007;
    rugMesh.receiveShadow = true;
    rugGroup.add(rugMesh);

    // Subtle woven gold-thread fringe along both short edges (±Z)
    const fringeMat = new THREE.MeshStandardMaterial({
      color: 0xc8ae82,
      roughness: 0.92,
      metalness: 0.0,
    });
    const fringeCount = Math.floor(w * 20);
    const tasselGeo = new THREE.BoxGeometry(0.016, 0.004, 0.085);
    const tassels = new THREE.InstancedMesh(tasselGeo, fringeMat, fringeCount * 2);
    let idx = 0;
    for (const sideZ of [-1, 1]) {
      for (let i = 0; i < fringeCount; i++) {
        const fx = -w * 0.48 + (i / (fringeCount - 1)) * (w * 0.96);
        dummy.position.set(fx, 0.003, sideZ * (d * 0.5 + 0.042));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        tassels.setMatrixAt(idx++, dummy.matrix);
      }
    }
    tassels.instanceMatrix.needsUpdate = true;
    rugGroup.add(tassels);
    floorGroup.add(rugGroup);
  };

  // Grand rug beneath East Writing Desk & swivel chair zone
  buildPersianRug(2.85, 3.45, [4.55, 0, -0.42], 0);
  // Secondary cozy Persian rug beneath SW Reading Nook
  buildPersianRug(1.95, 2.35, [-5.05, 0, 2.38], Math.PI * 0.2);

  // =========================================================================
  // 3. OCTAGONAL WALLS, WAINSCOTING, ARCHED SOUTH DOORWAY & WALL ARTIFACTS
  // =========================================================================
  const wallsGroup = new THREE.Group();
  wallsGroup.name = 'OctagonalWalls';
  group.add(wallsGroup);

  const buildStandardWallBase = (
    wallGrp: THREE.Group,
    opts: { skipCenterPanel?: boolean; recessedBay?: boolean } = {}
  ) => {
    const w = WALL_SIDE + 0.24; // slight overlap behind corner pilasters for 0 seam light-leak
    // Main solid backing wall (z_local from -0.38 to 0)
    const backMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, WALL_HEIGHT, 0.36),
      walnutDarkMat
    );
    backMesh.position.set(0, WALL_HEIGHT * 0.5, -0.18);
    backMesh.receiveShadow = true;
    wallGrp.add(backMesh);

    // Multi-tiered chamfered baseboard skirting (y = 0..0.24)
    const basePlinth = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_SIDE, 0.18, 0.085),
      walnutDarkMat
    );
    basePlinth.position.set(0, 0.09, 0.042);
    basePlinth.receiveShadow = true;
    wallGrp.add(basePlinth);

    const baseCap = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_SIDE, 0.055, 0.105),
      walnutMat
    );
    baseCap.position.set(0, 0.205, 0.052);
    wallGrp.add(baseCap);

    const brassKick = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_SIDE, 0.025, 0.092),
      bronzeMat
    );
    brassKick.position.set(0, 0.015, 0.046);
    wallGrp.add(brassKick);

    // Wainscot chair rail at y = 1.12m (omitted on full-height recessed bookcase walls so it never clips bottom-shelf books)
    if (!opts.recessedBay) {
      const chairRail = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_SIDE, 0.08, 0.11),
        walnutMat
      );
      chairRail.position.set(0, 1.12, 0.055);
      chairRail.castShadow = true;
      chairRail.receiveShadow = true;
      wallGrp.add(chairRail);

      const chairBrass = new THREE.Mesh(
        new THREE.BoxGeometry(WALL_SIDE, 0.02, 0.12),
        brassMat
      );
      chairBrass.position.set(0, 1.12, 0.06);
      wallGrp.add(chairBrass);
    }

    // Lower wainscot dado panels (3 recessed bays scaled cleanly to WALL_SIDE = 5.63m)
    if (!opts.recessedBay) {
      for (let b = -1; b <= 1; b++) {
        const cx = b * 1.68;
        const frameOuter = new THREE.Mesh(
          new THREE.BoxGeometry(1.44, 0.72, 0.045),
          walnutMat
        );
        frameOuter.position.set(cx, 0.67, 0.022);
        frameOuter.receiveShadow = true;
        wallGrp.add(frameOuter);

        const insetPanel = new THREE.Mesh(
          new THREE.BoxGeometry(1.24, 0.54, 0.022),
          walnutDarkMat
        );
        insetPanel.position.set(cx, 0.67, 0.042);
        insetPanel.receiveShadow = true;
        wallGrp.add(insetPanel);
      }
    }

    // Upper recessed wainscot coffers (when skipCenterPanel is true, flank at x in [±1.27, ±2.41]
    // leaving a clean 2.54m centerpiece wall with ZERO vertical stiles clipping instruments or gilded frames!)
    if (!opts.recessedBay) {
      const bayIndices = opts.skipCenterPanel ? [-1, 1] : [-1, 0, 1];
      const bayOffset = opts.skipCenterPanel ? 1.84 : 1.68;
      const borderW = opts.skipCenterPanel ? 1.14 : 1.44;
      const borderH = 3.16;
      const centerY = 2.84;

      for (const b of bayIndices) {
        const cx = b * bayOffset;

        // Raised mitered trim border around recessed upper coffer
        const topBar = new THREE.Mesh(
          new THREE.BoxGeometry(borderW, 0.07, 0.06),
          walnutMat
        );
        topBar.position.set(cx, centerY + borderH * 0.5, 0.03);
        wallGrp.add(topBar);

        const botBar = new THREE.Mesh(
          new THREE.BoxGeometry(borderW, 0.07, 0.06),
          walnutMat
        );
        botBar.position.set(cx, centerY - borderH * 0.5, 0.03);
        wallGrp.add(botBar);

        for (const sx of [-1, 1]) {
          const stile = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, borderH, 0.06),
            walnutMat
          );
          stile.position.set(cx + sx * (borderW * 0.5 - 0.035), centerY, 0.03);
          wallGrp.add(stile);
        }

        // Subtle inlaid brass accent bar inside coffer header
        const brassTrim = new THREE.Mesh(
          new THREE.BoxGeometry(borderW - 0.14, 0.014, 0.04),
          bronzeMat
        );
        brassTrim.position.set(cx, centerY + borderH * 0.5 - 0.055, 0.032);
        wallGrp.add(brassTrim);
      }
    }
  };

  // --- WALL 0: NORTH (Behind Great Equatorial Telescope) ---
  const wallN = createWallGroup(0);
  buildStandardWallBase(wallN, { skipCenterPanel: true });
  wallsGroup.add(wallN);
  {
    // Grand brass Meridian Transit Arc sized cleanly within the expanded center bay (r=0.92m, clear of ±1.27m stiles)
    const meridianArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.030, 12, 48, Math.PI),
      brassBrightMat
    );
    meridianArc.position.set(0, 2.94, 0.055);
    wallN.add(meridianArc);

    const innerArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.74, 0.016, 10, 40, Math.PI),
      bronzeMat
    );
    innerArc.position.set(0, 2.94, 0.048);
    wallN.add(innerArc);

    // Radial brass spokes on the meridian transit scale
    for (let s = 0; s <= 6; s++) {
      const a = (s / 6) * Math.PI;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.19, 0.018), brassMat);
      spoke.position.set(Math.cos(a) * 0.83, 2.94 + Math.sin(a) * 0.83, 0.052);
      spoke.rotation.z = a - Math.PI / 2;
      wallN.add(spoke);
    }

    // Refined Engraved Brass Meridian Transit Ring & Suspended Brass Plumb Bob
    const transitGroup = new THREE.Group();
    transitGroup.position.set(0, 2.94, 0.055);
    wallN.add(transitGroup);

    // Dark walnut circular mounting plinth behind the brass transit dial
    const mountDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.49, 0.036, 36),
      walnutDarkMat
    );
    mountDisc.rotation.x = Math.PI / 2;
    transitGroup.add(mountDisc);

    // Engraved antique brass transit plate with fine degree graduations
    const transitTex = createMeridianTransitDialTexture();
    const transitFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.40, 36),
      new THREE.MeshStandardMaterial({
        map: transitTex,
        roughness: 0.42,
        metalness: 0.72,
        envMapIntensity: 0.85,
      })
    );
    transitFace.position.z = 0.022;
    transitGroup.add(transitFace);

    // Outer & inner turned brass transit bezel rings
    const outerTransitRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.41, 0.024, 12, 40),
      brassMat
    );
    outerTransitRing.position.z = 0.028;
    transitGroup.add(outerTransitRing);

    const innerTransitRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.011, 10, 32),
      brassBrightMat
    );
    innerTransitRing.position.z = 0.032;
    transitGroup.add(innerTransitRing);

    // Cardinal meridian vernier cross-bars
    for (const rz of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.014, 0.012), brassMat);
      bar.position.z = 0.032;
      bar.rotation.z = rz;
      transitGroup.add(bar);
    }

    // Top suspension bracket & delicate hanging brass plumb bob wire
    const plumbBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.14),
      brassMat
    );
    plumbBracket.position.set(0, 0.43, 0.07);
    transitGroup.add(plumbBracket);

    const plumbWire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 1.08, 6),
      brassBrightMat
    );
    plumbWire.position.set(0, -0.11, 0.11);
    transitGroup.add(plumbWire);

    // Sculpted conical turned-brass plumb bob suspended at the lower meridian point
    const bobPts = [
      new THREE.Vector2(0.0, -0.095),
      new THREE.Vector2(0.038, -0.015),
      new THREE.Vector2(0.044, 0.025),
      new THREE.Vector2(0.022, 0.055),
      new THREE.Vector2(0.012, 0.075),
    ];
    const plumbBob = new THREE.Mesh(new THREE.LatheGeometry(bobPts, 18), brassBrightMat);
    plumbBob.position.set(0, -0.68, 0.11);
    transitGroup.add(plumbBob);

    // Brass nadir reference cup mounted directly beneath the plumb bob tip
    const nadirCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.052, 0.032, 18),
      brassMat
    );
    nadirCup.position.set(0, -0.84, 0.10);
    transitGroup.add(nadirCup);
  }

  // --- SHARED BOOKCASE BUILDER FOR NE (1) AND NW (7) ---
  const rand = mulberry32(1898042);
  const bookPalette = [
    new THREE.Color('#6b1f22'), // Oxblood crimson
    new THREE.Color('#1d4430'), // Victorian forest green
    new THREE.Color('#1c2d4a'), // Midnight navy
    new THREE.Color('#4a2c1d'), // Espresso leather
    new THREE.Color('#7a4b22'), // Saddle tan
    new THREE.Color('#5a2638'), // Plum burgundy
    new THREE.Color('#2c3a2b'), // Dark olive
    new THREE.Color('#8e6e48'), // Aged calfskin
  ];

  // Collect all book transforms across both NE & NW bookcases for ultra-clean InstancedMesh rendering
  interface BookPlacement {
    wallIndex: number;
    localPos: THREE.Vector3;
    rotZ: number;
    w: number;
    h: number;
    d: number;
    color: THREE.Color;
  }
  const bookPlacements: BookPlacement[] = [];

  const buildObservatoryBookcase = (wallGrp: THREE.Group, wallIndex: number, addLadder: boolean) => {
    const bc = new THREE.Group();
    bc.name = `Bookcase_${wallIndex}`;
    wallGrp.add(bc);

    const caseW = 4.68;
    const caseD = 0.38;
    const caseH = 4.44;

    // Back panel
    const back = new THREE.Mesh(new THREE.BoxGeometry(caseW, caseH, 0.05), walnutDarkMat);
    back.position.set(0, caseH * 0.5, 0.025);
    back.receiveShadow = true;
    bc.add(back);

    // Lower cabinet base with 3 recessed cupboard doors & brass ring pulls (y = 0..0.96)
    const lowerBase = new THREE.Mesh(new THREE.BoxGeometry(caseW, 0.94, caseD), mahoganyMat);
    lowerBase.position.set(0, 0.47, caseD * 0.5);
    lowerBase.castShadow = true;
    lowerBase.receiveShadow = true;
    bc.add(lowerBase);

    const counterLedge = new THREE.Mesh(
      new THREE.BoxGeometry(caseW + 0.08, 0.06, caseD + 0.06),
      walnutMat
    );
    counterLedge.position.set(0, 0.96, caseD * 0.5 + 0.02);
    counterLedge.castShadow = true;
    counterLedge.receiveShadow = true;
    bc.add(counterLedge);

    // 3 lower cupboard door reliefs + brass ring pulls
    for (let b = -1; b <= 1; b++) {
      const bx = b * 1.52;
      const doorInset = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.64, 0.025),
        walnutDarkMat
      );
      doorInset.position.set(bx, 0.50, caseD + 0.01);
      bc.add(doorInset);

      const pullPlate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.015, 16),
        brassMat
      );
      pullPlate.rotation.x = Math.PI / 2;
      pullPlate.position.set(bx, 0.56, caseD + 0.025);
      bc.add(pullPlate);

      const pullRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.028, 0.006, 8, 16),
        brassBrightMat
      );
      pullRing.position.set(bx, 0.535, caseD + 0.036);
      bc.add(pullRing);
    }

    // 4 vertical dividers framing 3 tall arched bays
    const divXs = [-2.30, -0.76, 0.76, 2.30];
    for (const dx of divXs) {
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, caseH - 0.96, caseD),
        mahoganyMat
      );
      divider.position.set(dx, 0.96 + (caseH - 0.96) * 0.5, caseD * 0.5);
      divider.castShadow = true;
      divider.receiveShadow = true;
      bc.add(divider);

      // Decorative vertical brass flute strip on divider face
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, caseH - 1.12, 0.015),
        bronzeMat
      );
      strip.position.set(dx, 2.68, caseD + 0.006);
      bc.add(strip);
    }

    // Crown cornice header + arched bay trims
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(caseW + 0.14, 0.14, caseD + 0.09),
      mahoganyMat
    );
    crown.position.set(0, caseH - 0.05, caseD * 0.5 + 0.035);
    crown.castShadow = true;
    bc.add(crown);

    const crownBrass = new THREE.Mesh(
      new THREE.BoxGeometry(caseW + 0.10, 0.025, caseD + 0.10),
      brassMat
    );
    crownBrass.position.set(0, caseH - 0.13, caseD * 0.5 + 0.04);
    bc.add(crownBrass);

    // 3 arched mahogany spandrel headers at top of each bay
    for (let b = -1; b <= 1; b++) {
      const bx = b * 1.53;
      const archTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.70, 0.038, 10, 28, Math.PI),
        mahoganyMat
      );
      archTrim.position.set(bx, 3.64, caseD - 0.02);
      bc.add(archTrim);
    }

    // 6 shelves per grand bookcase (y = 1.44, 1.94, 2.44, 2.94, 3.44, 3.92)
    const shelfYs = [1.44, 1.94, 2.44, 2.94, 3.44, 3.92];
    for (const sy of shelfYs) {
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(caseW - 0.06, 0.038, caseD - 0.02),
        walnutMat
      );
      shelf.position.set(0, sy, caseD * 0.5);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      bc.add(shelf);
    }

    // Populate shelves with rich leather-bound books & small astronomical curios
    const supportYs = [0.99, 1.46, 1.96, 2.46, 2.96, 3.46];
    for (let row = 0; row < supportYs.length; row++) {
      const baseY = supportYs[row];
      for (let bay = -1; bay <= 1; bay++) {
        const bayCenter = bay * 1.53;
        const bayLeft = bayCenter - 0.68;
        const bayRight = bayCenter + 0.68;

        // Reserve one bay pocket per couple rows for a decorative astronomical artifact
        const leaveGapForCurio = (row === 1 && bay === 0) || (row === 2 && bay === (wallIndex === 1 ? -1 : 1));
        const curioStart = bayCenter - 0.19;
        const curioEnd = bayCenter + 0.19;

        let cursorX = bayLeft + 0.02;
        while (cursorX < bayRight - 0.06) {
          if (leaveGapForCurio && cursorX > curioStart - 0.05 && cursorX < curioEnd) {
            cursorX = curioEnd + 0.04;
            continue;
          }
          const bw = 0.032 + rand() * 0.034;
          const bh = 0.24 + rand() * 0.14;
          const bd = 0.19 + rand() * 0.07;

          if (cursorX + bw > bayRight) break;

          // Occasional gentle lean at end of clusters
          const nearGap =
            (leaveGapForCurio && Math.abs(cursorX + bw - curioStart) < 0.08) ||
            cursorX + bw > bayRight - 0.11;
          const tilt = nearGap && rand() > 0.45 ? (rand() > 0.5 ? 0.18 : -0.18) : (rand() - 0.5) * 0.035;

          const col = bookPalette[Math.floor(rand() * bookPalette.length)].clone();
          col.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06);

          bookPlacements.push({
            wallIndex,
            localPos: new THREE.Vector3(
              cursorX + bw * 0.5,
              baseY + bh * 0.5,
              caseD - bd * 0.5 - 0.02 - rand() * 0.025
            ),
            rotZ: tilt,
            w: bw,
            h: bh,
            d: bd,
            color: col,
          });

          cursorX += bw + 0.004 + (Math.abs(tilt) > 0.1 ? 0.035 : 0);
        }

        // Place curated shelf curios in the reserved pockets
        if (leaveGapForCurio) {
          const cx = bay * 1.53;
          if (row === 1) {
            // Tabletop Brass Armillary / Celestial Mini-Globe
            const miniBase = new THREE.Mesh(
              new THREE.CylinderGeometry(0.065, 0.085, 0.04, 16),
              brassMat
            );
            miniBase.position.set(cx, baseY + 0.02, 0.21);
            bc.add(miniBase);

            const miniStem = new THREE.Mesh(
              new THREE.CylinderGeometry(0.014, 0.018, 0.09, 10),
              brassMat
            );
            miniStem.position.set(cx, baseY + 0.08, 0.21);
            bc.add(miniStem);

            for (let r = 0; r < 3; r++) {
              const armRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.105 - r * 0.012, 0.008, 8, 24),
                brassBrightMat
              );
              armRing.position.set(cx, baseY + 0.21, 0.21);
              armRing.rotation.set(r * 0.7, r * 1.05, 0.35);
              bc.add(armRing);
            }
            const miniSphere = new THREE.Mesh(
              new THREE.SphereGeometry(0.045, 16, 12),
              new THREE.MeshStandardMaterial({
                color: 0x1d3f5c,
                roughness: 0.35,
                metalness: 0.25,
              })
            );
            miniSphere.position.set(cx, baseY + 0.21, 0.21);
            bc.add(miniSphere);
          } else {
            // Stacked Rolled Parchment Star Scrolls + Small Brass Sextant
            for (let sc = 0; sc < 3; sc++) {
              const scroll = new THREE.Mesh(
                new THREE.CylinderGeometry(0.026, 0.026, 0.28, 12),
                parchmentMat
              );
              scroll.rotation.x = Math.PI / 2;
              scroll.rotation.z = (sc - 1) * 0.14;
              scroll.position.set(
                cx - 0.05 + (sc === 2 ? 0.025 : sc * 0.055),
                baseY + (sc === 2 ? 0.072 : 0.028),
                0.20
              );
              bc.add(scroll);

              const ribbon = new THREE.Mesh(
                new THREE.CylinderGeometry(0.029, 0.029, 0.02, 12),
                velvetCrimsonMat
              );
              ribbon.rotation.copy(scroll.rotation);
              ribbon.position.copy(scroll.position);
              bc.add(ribbon);
            }
          }
        }
      }
    }

    // Brass Rolling Library Ladder on NE Bookcase
    if (addLadder) {
      // Horizontal brass rolling rail bar across upper bookcase
      const railBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, caseW - 0.14, 14),
        brassBrightMat
      );
      railBar.rotation.z = Math.PI / 2;
      railBar.position.set(0, 4.02, caseD + 0.07);
      bc.add(railBar);

      for (const rx of [-2.22, -0.76, 0.76, 2.22]) {
        const railBracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.05, 0.11),
          brassMat
        );
        railBracket.position.set(rx, 4.02, caseD + 0.03);
        bc.add(railBracket);
      }

      // Leaning brass & oak library ladder positioned slightly off-center (x = 1.05)
      const ladderGrp = new THREE.Group();
      const ladderX = 1.05;
      const topZ = caseD + 0.07;
      const botZ = caseD + 0.86;
      const topY = 4.02;
      const ladderLen = Math.hypot(topY, botZ - topZ);
      const leanAngle = Math.atan2(botZ - topZ, topY); // positive tilts bottom toward +Z

      ladderGrp.position.set(ladderX, 0, botZ);
      ladderGrp.rotation.x = -leanAngle;

      for (const sx of [-0.21, 0.21]) {
        const rail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.021, 0.021, ladderLen, 12),
          walnutMat
        );
        rail.position.set(sx, ladderLen * 0.5, 0);
        rail.castShadow = true;
        ladderGrp.add(rail);

        // Top brass roller wheel hook
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(0.036, 0.011, 8, 16),
          brassBrightMat
        );
        wheel.rotation.y = Math.PI / 2;
        wheel.position.set(sx, ladderLen - 0.02, -0.02);
        ladderGrp.add(wheel);

        // Bottom brass floor shoe
        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.03, 0.06, 10),
          brassMat
        );
        foot.position.set(sx, 0.03, 0);
        ladderGrp.add(foot);
      }

      // 10 beveled oak steps with under-step brass tie rods
      const steps = 10;
      for (let st = 1; st <= steps; st++) {
        const ty = (st / (steps + 1)) * ladderLen;
        const tread = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.024, 0.095),
          walnutMat
        );
        tread.position.set(0, ty, 0);
        tread.rotation.x = leanAngle; // horizontal steps!
        tread.castShadow = true;
        ladderGrp.add(tread);

        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.43, 8),
          brassMat
        );
        rod.rotation.z = Math.PI / 2;
        rod.position.set(0, ty - 0.022, 0);
        ladderGrp.add(rod);
      }

      bc.add(ladderGrp);
    }
  };

  // --- WALL 1: NE (Bookcase + Rolling Ladder) ---
  const wallNE = createWallGroup(1);
  buildStandardWallBase(wallNE, { recessedBay: true });
  buildObservatoryBookcase(wallNE, 1, true);
  wallsGroup.add(wallNE);

  // --- WALL 7: NW (Bookcase) ---
  const wallNW = createWallGroup(7);
  buildStandardWallBase(wallNW, { recessedBay: true });
  buildObservatoryBookcase(wallNW, 7, false);
  wallsGroup.add(wallNW);

  // Build single batched InstancedMesh for ALL ~130 leather-bound books + gold spine bands!
  if (bookPlacements.length > 0) {
    const bookGeo = new THREE.BoxGeometry(1, 1, 1);
    const bookMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: textures.leather.map,
      bumpMap: textures.leather.bumpMap,
      bumpScale: 0.012,
      roughnessMap: textures.leather.roughnessMap,
      roughness: 0.62,
      metalness: 0.08,
    });
    const booksInst = new THREE.InstancedMesh(bookGeo, bookMat, bookPlacements.length);
    booksInst.castShadow = true;
    booksInst.receiveShadow = true;

    // 2 horizontal gold-foil spine bands per book!
    const bandGeo = new THREE.BoxGeometry(1, 1, 1);
    const bandsInst = new THREE.InstancedMesh(
      bandGeo,
      brassBrightMat,
      bookPlacements.length * 2
    );

    const wallQuat = new THREE.Quaternion();
    const tiltQuat = new THREE.Quaternion();
    const finalQuat = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();

    bookPlacements.forEach((bp, i) => {
      const angle = bp.wallIndex * (Math.PI / 4);
      const worldPos = wallLocalToWorld(bp.wallIndex, bp.localPos);
      wallQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
      tiltQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), bp.rotZ);
      finalQuat.copy(wallQuat).multiply(tiltQuat);
      scaleVec.set(bp.w, bp.h, bp.d);
      mat4.compose(worldPos, finalQuat, scaleVec);

      booksInst.setMatrixAt(i, mat4);
      booksInst.setColorAt(i, bp.color);

      // Upper and lower gold spine foil bands on the front (+Z local) spine face
      for (let bandIdx = 0; bandIdx < 2; bandIdx++) {
        const yOff = (bandIdx === 0 ? 0.28 : -0.26) * bp.h;
        const localBandPos = new THREE.Vector3(
          bp.localPos.x - Math.sin(bp.rotZ) * yOff,
          bp.localPos.y + Math.cos(bp.rotZ) * yOff,
          bp.localPos.z + bp.d * 0.5 + 0.0025
        );
        const wBandPos = wallLocalToWorld(bp.wallIndex, localBandPos);
        scaleVec.set(bp.w * 0.94, 0.011, 0.005);
        mat4.compose(wBandPos, finalQuat, scaleVec);
        bandsInst.setMatrixAt(i * 2 + bandIdx, mat4);
      }
    });

    booksInst.instanceMatrix.needsUpdate = true;
    if (booksInst.instanceColor) booksInst.instanceColor.needsUpdate = true;
    bandsInst.instanceMatrix.needsUpdate = true;
    group.add(booksInst);
    group.add(bandsInst);
  }

  // --- WALL 2: EAST (Behind Writing Desk — Ornate Victorian Regulator Clock & Barometer) ---
  const wallE = createWallGroup(2);
  buildStandardWallBase(wallE, { skipCenterPanel: true });
  wallsGroup.add(wallE);
  {
    // Ornate Mahogany & Brass Victorian Observatory Regulator Clock mounted flush & centered in the clean center bay
    const clockGrp = new THREE.Group();
    clockGrp.position.set(0.0, 2.86, 0.0);
    wallE.add(clockGrp);

    // Sculpted upper mahogany dial hood seated flush against wall (z = 0..0.14)
    const upperHood = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.78, 0.14),
      mahoganyMat
    );
    upperHood.position.set(0, 0.02, 0.07);
    upperHood.castShadow = true;
    upperHood.receiveShadow = true;
    clockGrp.add(upperHood);

    // Molded horizontal mahogany cornice shelf above the hood (z = 0..0.18)
    const pedimentBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 0.07, 0.18),
      walnutDarkMat
    );
    pedimentBase.position.set(0, 0.445, 0.09);
    pedimentBase.castShadow = true;
    clockGrp.add(pedimentBase);

    // Solid closed ExtrudeGeometry semicircular mahogany pediment crown (flush back at z = 0, zero hollow or stray geometry!)
    const pedShape = new THREE.Shape();
    pedShape.moveTo(-0.34, 0);
    pedShape.absarc(0, 0, 0.34, Math.PI, 0, true);
    pedShape.closePath();
    const pedGeo = new THREE.ExtrudeGeometry(pedShape, {
      depth: 0.13,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 24,
    });
    const pedimentArch = new THREE.Mesh(pedGeo, mahoganyMat);
    pedimentArch.position.set(0, 0.48, 0.012);
    pedimentArch.castShadow = true;
    clockGrp.add(pedimentArch);

    // Recessed circular brass rosette medallion centered on the arched mahogany pediment
    const pedMedallion = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.012, 8, 24),
      brassMat
    );
    pedMedallion.position.set(0, 0.62, 0.155);
    clockGrp.add(pedMedallion);

    // 3 classic turned brass ball-and-spire urn finials seated cleanly atop cornice shoulders & crown
    for (const [fx, fy] of [
      [-0.37, 0.515],
      [0, 0.855],
      [0.37, 0.515],
    ]) {
      const urnBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), brassBrightMat);
      urnBall.position.set(fx, fy, 0.10);
      clockGrp.add(urnBall);
      const urnTip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 10), brassBrightMat);
      urnTip.position.set(fx, fy + 0.042, 0.10);
      clockGrp.add(urnTip);
    }

    // Twin turned mahogany & brass side colonnettes framing the clock dial
    for (const sx of [-0.355, 0.355]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.030, 0.034, 0.76, 12),
        walnutDarkMat
      );
      col.position.set(sx, 0.02, 0.135);
      clockGrp.add(col);
      for (const cy of [-0.34, 0.38]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.04, 12), brassMat);
        cap.position.set(sx, cy, 0.135);
        clockGrp.add(cap);
      }
    }

    // Heavy stepped circular brass clock bezel
    const brassBezelOuter = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.032, 14, 40),
      brassBrightMat
    );
    brassBezelOuter.position.z = 0.152;
    clockGrp.add(brassBezelOuter);

    const brassBezelInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.282, 0.011, 10, 36),
      bronzeMat
    );
    brassBezelInner.position.z = 0.162;
    clockGrp.add(brassBezelInner);

    // High-resolution Roman-numeral Victorian enamel regulator clock face
    const clockDialTex = createRegulatorClockDialTexture();
    const dialFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.292, 36),
      new THREE.MeshStandardMaterial({
        map: clockDialTex,
        roughness: 0.46,
        metalness: 0.05,
      })
    );
    dialFace.position.z = 0.148;
    clockGrp.add(dialFace);

    // Blued-steel spade hour & animated minute hands + brass center collet
    const handMat = new THREE.MeshStandardMaterial({
      color: 0x162238,
      roughness: 0.32,
      metalness: 0.85,
    });
    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.008), handMat);
    hourHand.position.set(-0.045, 0.052, 0.160);
    hourHand.rotation.z = 0.72;
    clockGrp.add(hourHand);

    const minPivot = new THREE.Group();
    minPivot.position.set(0, 0, 0.166);
    const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.225, 0.008), handMat);
    minHand.position.y = 0.095;
    minPivot.add(minHand);
    clockGrp.add(minPivot);
    clockMinuteHand = minPivot;

    const handPin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), brassBrightMat);
    handPin.position.z = 0.172;
    clockGrp.add(handPin);

    // Molded mahogany waist transition shelf between dial hood and pendulum trunk
    const waistShelf = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.055, 0.165), walnutDarkMat);
    waistShelf.position.set(0, -0.39, 0.082);
    clockGrp.add(waistShelf);

    // Lower walnut pendulum trunk seated flush against wall (z = 0..0.12)
    const pendTrunk = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.72, 0.12), mahoganyMat);
    pendTrunk.position.set(0, -0.76, 0.06);
    pendTrunk.castShadow = true;
    clockGrp.add(pendTrunk);

    const pendWell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.56, 0.03), walnutDarkMat);
    pendWell.position.set(0, -0.76, 0.112);
    clockGrp.add(pendWell);

    // Brass framed viewing door around pendulum chamber
    const pendFrameT = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.024, 0.018), brassMat);
    pendFrameT.position.set(0, -0.47, 0.132);
    clockGrp.add(pendFrameT);
    const pendFrameB = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.024, 0.018), brassMat);
    pendFrameB.position.set(0, -1.05, 0.132);
    clockGrp.add(pendFrameB);
    for (const sx of [-0.18, 0.18]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.60, 0.018), brassMat);
      st.position.set(sx, -0.76, 0.132);
      clockGrp.add(st);
    }

    // Swinging brass gridiron pendulum (3 parallel brass rods + lenticular bob)
    const pendPivot = new THREE.Group();
    pendPivot.position.set(0, -0.49, 0.126);
    for (const rx of [-0.018, 0, 0.018]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.42, 8), brassMat);
      rod.position.set(rx, -0.21, 0);
      pendPivot.add(rod);
    }
    const pendBob = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.070, 0.022, 24), brassBrightMat);
    pendBob.rotation.x = Math.PI / 2;
    pendBob.position.y = -0.42;
    pendPivot.add(pendBob);
    clockGrp.add(pendPivot);
    clockPendulum = pendPivot;

    // Clean stepped mahogany base plinth & subtle brass orb drop (sits well above chair rail at y ≈ 1.48m)
    const clockTailTop = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.15), walnutDarkMat);
    clockTailTop.position.set(0, -1.14, 0.075);
    clockGrp.add(clockTailTop);

    const clockTailLower = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.12), mahoganyMat);
    clockTailLower.position.set(0, -1.195, 0.06);
    clockGrp.add(clockTailLower);

    const lowerBrassOrb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), brassMat);
    lowerBrassOrb.position.set(0, -1.24, 0.075);
    clockGrp.add(lowerBrassOrb);

    // Ornate Victorian Brass & Mahogany Aneroid Wheel Barometer centered cleanly in left bay (x = -1.84, flush at z = 0)
    const baroGrp = new THREE.Group();
    baroGrp.position.set(-1.84, 2.58, 0.0);
    wallE.add(baroGrp);

    // Carved mahogany banjo-frame plaque backing flush against wall
    const baroPlaque = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.055, 28),
      mahoganyMat
    );
    baroPlaque.rotation.x = Math.PI / 2;
    baroPlaque.position.z = 0.028;
    baroGrp.add(baroPlaque);

    const baroNeck = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.045), mahoganyMat);
    baroNeck.position.set(0, 0.33, 0.023);
    baroGrp.add(baroNeck);

    const baroCap = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.055), walnutDarkMat);
    baroCap.position.set(0, 0.51, 0.028);
    baroGrp.add(baroCap);

    // Thermometer brass strip on barometer neck
    const thermPlate = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.23, 0.014), brassMat);
    thermPlate.position.set(0, 0.33, 0.050);
    baroGrp.add(thermPlate);

    const baroBezel = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.022, 12, 32),
      brassBrightMat
    );
    baroBezel.position.z = 0.062;
    baroGrp.add(baroBezel);

    // Crisp procedural engraved barometer face (STORM / RAIN / CHANGE / FAIR / VERY DRY)
    const baroTex = createBarometerDialTexture();
    const baroFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.21, 32),
      new THREE.MeshStandardMaterial({
        map: baroTex,
        roughness: 0.48,
        metalness: 0.14,
      })
    );
    baroFace.position.z = 0.059;
    baroGrp.add(baroFace);

    // Blued-steel barometer indicator needle + gold reference pointer
    const baroNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.16, 0.006), handMat);
    baroNeedle.position.set(0.03, 0.025, 0.069);
    baroNeedle.rotation.z = -0.68;
    baroGrp.add(baroNeedle);

    const baroGoldRef = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.145, 0.006), brassBrightMat);
    baroGoldRef.position.set(0.01, 0.03, 0.073);
    baroGoldRef.rotation.z = -0.35;
    baroGrp.add(baroGoldRef);
  }

  // --- WALL 6: WEST (Behind Star Chart Lectern & Curio Cabinet — Brass Planisphere) ---
  const wallW = createWallGroup(6);
  buildStandardWallBase(wallW, { skipCenterPanel: true });
  wallsGroup.add(wallW);
  {
    // Grand Wall-Mounted Brass Planisphere / Celestial Meridian Plaque mounted flush in clean center bay
    const planiGrp = new THREE.Group();
    planiGrp.position.set(0, 2.78, 0.026);
    wallW.add(planiGrp);

    const plaqueBacking = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.65, 0.05, 36),
      walnutDarkMat
    );
    plaqueBacking.rotation.x = Math.PI / 2;
    planiGrp.add(plaqueBacking);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.032, 14, 48),
      brassBrightMat
    );
    outerRing.position.z = 0.035;
    planiGrp.add(outerRing);

    const midRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.018, 12, 36),
      brassMat
    );
    midRing.position.z = 0.045;
    planiGrp.add(midRing);

    // Off-center ecliptic brass ring (authentic astrolabe rete look!)
    const reteRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.016, 10, 32),
      brassBrightMat
    );
    reteRing.position.set(0.08, 0.09, 0.058);
    planiGrp.add(reteRing);

    // Crosshair meridian rule & alidade pointer bar
    for (const rotZ of [0, Math.PI / 2, 0.58]) {
      const rule = new THREE.Mesh(
        new THREE.BoxGeometry(rotZ === 0.58 ? 1.08 : 1.12, rotZ === 0.58 ? 0.032 : 0.018, 0.016),
        rotZ === 0.58 ? brassBrightMat : bronzeMat
      );
      rule.position.z = rotZ === 0.58 ? 0.07 : 0.04;
      rule.rotation.z = rotZ;
      planiGrp.add(rule);
    }

    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), brassBrightMat);
    hub.scale.set(1, 1, 0.5);
    hub.position.z = 0.082;
    planiGrp.add(hub);

    // Flanking ornate miniature brass astrolabe medallions centered cleanly inside side bays (±1.84, flush-mounted)
    for (const sx of [-1.84, 1.84]) {
      const medGrp = new THREE.Group();
      medGrp.position.set(sx, 2.66, 0.022);
      wallW.add(medGrp);

      // Flush dark-walnut circular mounting plaque so medallion sits solidly against wall
      const medBack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.215, 0.225, 0.032, 28),
        walnutDarkMat
      );
      medBack.rotation.x = Math.PI / 2;
      medGrp.add(medBack);

      // Outer graduated ring & top suspension ring
      const miniAstro = new THREE.Mesh(
        new THREE.TorusGeometry(0.195, 0.019, 10, 28),
        brassMat
      );
      miniAstro.position.z = 0.022;
      medGrp.add(miniAstro);

      const suspRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.034, 0.008, 8, 16),
        brassBrightMat
      );
      suspRing.position.set(0, 0.228, 0.022);
      medGrp.add(suspRing);

      // Inner offset celestial rete ring
      const innerRete = new THREE.Mesh(
        new THREE.TorusGeometry(0.115, 0.011, 8, 24),
        brassBrightMat
      );
      innerRete.position.set(0.022, 0.024, 0.030);
      medGrp.add(innerRete);

      // Perpendicular meridian & horizon crossbars + diagonal alidade rule
      for (const rz of [0, Math.PI / 2]) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.014, 0.010), bronzeMat);
        cross.position.z = 0.026;
        cross.rotation.z = rz;
        medGrp.add(cross);
      }
      const alidade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.016, 0.012), brassBrightMat);
      alidade.position.z = 0.036;
      alidade.rotation.z = sx > 0 ? 0.55 : -0.55;
      medGrp.add(alidade);

      // Turned central brass boss
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), brassBrightMat);
      boss.scale.set(1, 1, 0.55);
      boss.position.z = 0.042;
      medGrp.add(boss);
    }
  }

  // --- HELPER: GILDED CARVED FRAME + BRASS PICTURE LIGHT (SE & SW WALLS) ---
  const buildFramedArtworkStation = (opts: {
    wallIndex: number;
    artTexture: THREE.CanvasTexture;
    width: number;
    height: number;
    centerY: number;
    id: string;
    label: string;
    hint: string;
    onInspect: (ctx: Parameters<Interactable['onInteract']>[0]) => void;
  }) => {
    const wallGrp = createWallGroup(opts.wallIndex);
    buildStandardWallBase(wallGrp, { skipCenterPanel: true });
    wallsGroup.add(wallGrp);

    const frameGrp = new THREE.Group();
    frameGrp.name = `FramedArt_${opts.id}`;
    frameGrp.position.set(0, opts.centerY, 0.06);
    wallGrp.add(frameGrp);

    const w = opts.width;
    const h = opts.height;
    const frameThick = 0.11;

    // Outer dark-walnut shadowbox backing
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(w + frameThick * 2, h + frameThick * 2, 0.055),
      walnutDarkMat
    );
    backing.castShadow = true;
    backing.receiveShadow = true;
    frameGrp.add(backing);

    // 4 sculpted gilded-brass outer moldings
    const hBarGeo = new THREE.BoxGeometry(w + frameThick * 2.12, frameThick, 0.095);
    const vBarGeo = new THREE.BoxGeometry(frameThick, h + frameThick * 2.12, 0.095);

    const topFrame = new THREE.Mesh(hBarGeo, brassMat);
    topFrame.position.set(0, h * 0.5 + frameThick * 0.5, 0.025);
    topFrame.castShadow = true;
    frameGrp.add(topFrame);

    const botFrame = new THREE.Mesh(hBarGeo, brassMat);
    botFrame.position.set(0, -h * 0.5 - frameThick * 0.5, 0.025);
    botFrame.castShadow = true;
    frameGrp.add(botFrame);

    const leftFrame = new THREE.Mesh(vBarGeo, brassMat);
    leftFrame.position.set(-w * 0.5 - frameThick * 0.5, 0, 0.025);
    leftFrame.castShadow = true;
    frameGrp.add(leftFrame);

    const rightFrame = new THREE.Mesh(vBarGeo, brassMat);
    rightFrame.position.set(w * 0.5 + frameThick * 0.5, 0, 0.025);
    rightFrame.castShadow = true;
    frameGrp.add(rightFrame);

    // Inner gleaming bright-brass fillet trim & 4 corner floral rosettes
    const filletH = new THREE.BoxGeometry(w + 0.04, 0.026, 0.08);
    const filletV = new THREE.BoxGeometry(0.026, h + 0.04, 0.08);
    for (const sy of [-1, 1]) {
      const f = new THREE.Mesh(filletH, brassBrightMat);
      f.position.set(0, sy * (h * 0.5 + 0.013), 0.036);
      frameGrp.add(f);
    }
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(filletV, brassBrightMat);
      f.position.set(sx * (w * 0.5 + 0.013), 0, 0.036);
      frameGrp.add(f);
    }
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const rosette = new THREE.Mesh(
          new THREE.CylinderGeometry(0.058, 0.068, 0.032, 8),
          brassBrightMat
        );
        rosette.rotation.x = Math.PI / 2;
        rosette.position.set(
          sx * (w * 0.5 + frameThick * 0.52),
          sy * (h * 0.5 + frameThick * 0.52),
          0.072
        );
        frameGrp.add(rosette);
      }
    }

    // Crisp illuminated CanvasTexture Artwork Plane (matte parchment finish so picture-light never leaves a specular dot)
    const artMat = new THREE.MeshStandardMaterial({
      map: opts.artTexture,
      roughness: 0.78,
      metalness: 0.02,
      envMapIntensity: 0.25,
      emissive: new THREE.Color('#fff1d6'),
      emissiveMap: opts.artTexture,
      emissiveIntensity: 0.30,
    });
    const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat);
    artMesh.position.z = 0.042;
    artMesh.receiveShadow = true;
    frameGrp.add(artMesh);

    // Brass Museum Picture-Light Bar mounted above the frame
    const lightY = h * 0.5 + frameThick + 0.16;
    const picLightGrp = new THREE.Group();
    picLightGrp.position.set(0, lightY, 0.02);
    frameGrp.add(picLightGrp);

    const mountPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.035), brassMat);
    picLightGrp.add(mountPlate);

    for (const ax of [-0.11, 0.11]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.24, 10), brassMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(ax, 0.01, 0.12);
      picLightGrp.add(arm);
    }

    const hood = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.68, 16, 1, false, 0, Math.PI * 1.25),
      brassBrightMat
    );
    hood.rotation.z = Math.PI / 2;
    hood.rotation.x = 0.35;
    hood.position.set(0, 0.01, 0.24);
    picLightGrp.add(hood);

    // Glowing warm picture-light filament strip underneath hood
    const filament = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.60, 10),
      new THREE.MeshStandardMaterial({
        color: 0xfff2cf,
        emissive: new THREE.Color('#ffcf7a'),
        emissiveIntensity: 2.3,
        roughness: 0.2,
      })
    );
    filament.rotation.z = Math.PI / 2;
    filament.position.set(0, -0.012, 0.235);
    picLightGrp.add(filament);

    // Dedicated warm local PointLight shifted outward to wash the framed plate evenly with zero hotspot dot
    const picPoint = new THREE.PointLight('#ffd08a', 1.15, 3.4, 1.75);
    picPoint.position.set(0, -0.18, 0.56);
    picLightGrp.add(picPoint);

    // Register directly as a readable wall plate — opens large dialog directly with NO sticky 3D zoom!
    interactables.push({
      id: opts.id,
      object: frameGrp,
      label: opts.label,
      hint: opts.hint,
      cursor: 'pointer',
      maxDistance: 4.2,
      onInteract: (ctx) => opts.onInspect(ctx),
    });
  };

  // --- WALL 3: SE (Framed Star Chart — Great Conjunction Clue) ---
  buildFramedArtworkStation({
    wallIndex: 3,
    artTexture: textures.starChartWall,
    width: 1.72,
    height: 1.30,
    centerY: 2.18,
    id: 'wall_star_chart',
    label: 'Framed Celestial Star Chart',
    hint: 'Click to read the Great Conjunction',
    onInspect: (ctx) => {
      ctx.audio.playClick();
      ctx.state.update((d) => {
        d.hasViewedStarChart = true;
      });
      ctx.ui.openStarChart();
    },
  });

  // --- WALL 5: SW (Framed Lunar Almanac — 4 Encircled Phases Clue) ---
  buildFramedArtworkStation({
    wallIndex: 5,
    artTexture: textures.lunarAlmanac,
    width: 1.52,
    height: 1.52,
    centerY: 2.18,
    id: 'wall_lunar_almanac',
    label: 'Framed Lunar Almanac (1898)',
    hint: 'Click to study the marked lunar phases',
    onInspect: (ctx) => {
      ctx.audio.playClick();
      ctx.state.update((d) => {
        d.hasViewedAlmanac = true;
      });
      ctx.ui.openAlmanac();
    },
  });

  // --- WALL 4: SOUTH (EXACT CLEAN ARCHED DOORWAY OPENING x in [-1.25, 1.25], y in [0, 3.45]) ---
  const wallS = createWallGroup(4);
  wallsGroup.add(wallS);
  {
    const halfW = WALL_SIDE * 0.5 + 0.14;
    const doorHalfW = 1.26; // slightly wider than 1.25 for zero door-edge clipping
    const archSpringY = 2.24;
    const archRadius = doorHalfW; // crown at y = 2.24 + 1.26 = 3.50m (> 3.45m!)

    // Extruded South wall with TRUE physical arched doorway cutout
    const wallShape = new THREE.Shape();
    wallShape.moveTo(-halfW, 0);
    wallShape.lineTo(-doorHalfW, 0);
    wallShape.lineTo(-doorHalfW, archSpringY);
    wallShape.absarc(0, archSpringY, archRadius, Math.PI, 0, true);
    wallShape.lineTo(doorHalfW, 0);
    wallShape.lineTo(halfW, 0);
    wallShape.lineTo(halfW, WALL_HEIGHT);
    wallShape.lineTo(-halfW, WALL_HEIGHT);
    wallShape.closePath();

    const southWallGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: 0.40,
      bevelEnabled: false,
      curveSegments: 32,
    });
    // ExtrudeGeometry goes from z=0 to z=+0.40; shift back so inner face is at z=0 and wall extends outward z=-0.40..0
    southWallGeo.translate(0, 0, -0.40);
    // Normalize ExtrudeGeometry world-meter UVs to [0..1] so walnut grain scale matches the other 7 walls
    const sUv = southWallGeo.attributes.uv;
    for (let u = 0; u < sUv.count; u++) {
      sUv.setXY(u, (sUv.getX(u) + halfW) / (halfW * 2), sUv.getY(u) / WALL_HEIGHT);
    }
    sUv.needsUpdate = true;
    const southWallMesh = new THREE.Mesh(southWallGeo, walnutDarkMat);
    southWallMesh.receiveShadow = true;
    southWallMesh.castShadow = true;
    wallS.add(southWallMesh);

    // Side baseboards & wainscot panels flanking the doorway (|x| > 1.55)
    for (const sx of [-1, 1]) {
      const sideWidth = halfW - 1.56;
      const sideCenterX = sx * (1.56 + sideWidth * 0.5);

      const base = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, 0.22, 0.09), walnutDarkMat);
      base.position.set(sideCenterX, 0.11, 0.045);
      wallS.add(base);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, 0.08, 0.10), walnutMat);
      rail.position.set(sideCenterX, 1.12, 0.05);
      wallS.add(rail);

      const panel = new THREE.Mesh(new THREE.BoxGeometry(sideWidth - 0.16, 2.85, 0.04), walnutMat);
      panel.position.set(sideCenterX, 2.80, 0.02);
      wallS.add(panel);
    }

    // Carved Stone & Walnut Architectural Archway Surround framing the opening (strictly outside |x|>=1.26)
    for (const sx of [-1, 1]) {
      // Engaged stone door jamb pilasters
      const jambBase = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.28), stoneMat);
      jambBase.position.set(sx * 1.42, 0.21, 0.06);
      jambBase.castShadow = true;
      jambBase.receiveShadow = true;
      wallS.add(jambBase);

      const jambShaft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.82, 0.24), stoneMat);
      jambShaft.position.set(sx * 1.42, 1.33, 0.05);
      jambShaft.castShadow = true;
      jambShaft.receiveShadow = true;
      wallS.add(jambShaft);

      // Compact bronze impost capital tucked cleanly inside ExitDoor's classical bronze-marble capital
      const impost = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.22), bronzeMat);
      impost.position.set(sx * 1.42, archSpringY + 0.02, 0.05);
      wallS.add(impost);
    }

    // 11 sculpted stone voussoir arch stones around the archway
    const voussoirCount = 11;
    for (let v = 0; v < voussoirCount; v++) {
      const a = ((v + 0.5) / voussoirCount) * Math.PI;
      const isKeystone = v === 5;
      const vr = archRadius + (isKeystone ? 0.19 : 0.15);
      const blockW = isKeystone ? 0.28 : 0.26;
      const blockH = isKeystone ? 0.42 : 0.30;
      const blockD = isKeystone ? 0.28 : 0.22;

      const block = new THREE.Mesh(
        new THREE.BoxGeometry(blockW, blockH, blockD),
        stoneMat
      );
      block.position.set(Math.cos(a) * vr, archSpringY + Math.sin(a) * vr, 0.05);
      block.rotation.z = a - Math.PI / 2;
      block.castShadow = true;
      block.receiveShadow = true;
      wallS.add(block);

      if (isKeystone) {
        // Gleaming brass compass emblem on the archway keystone
        const star = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.11, 0),
          brassBrightMat
        );
        star.scale.set(1, 1, 0.4);
        star.position.set(0, archSpringY + vr, 0.20);
        wallS.add(star);
      }
    }

    // Inner brass arch trim molding hugging r = 1.27m
    const innerArchMold = new THREE.Mesh(
      new THREE.TorusGeometry(archRadius + 0.015, 0.028, 12, 36, Math.PI),
      brassMat
    );
    innerArchMold.position.set(0, archSpringY, 0.04);
    wallS.add(innerArchMold);

    // Carved Walnut Overdoor Cornice Pediment above keystone
    const overdoorCornice = new THREE.Mesh(
      new THREE.BoxGeometry(3.55, 0.18, 0.24),
      walnutMat
    );
    overdoorCornice.position.set(0, 4.08, 0.10);
    overdoorCornice.castShadow = true;
    wallS.add(overdoorCornice);
  }

  // =========================================================================
  // 4. 8 GRAND FLUTED CORNER PILASTERS + 8 GASLAMP SCONCES
  // =========================================================================
  const pilastersGroup = new THREE.Group();
  pilastersGroup.name = 'CornerPilastersAndSconces';
  group.add(pilastersGroup);

  // Sculpted Victorian frosted tulip glass globe profile (LatheGeometry)
  const globePoints: THREE.Vector2[] = [
    new THREE.Vector2(0.032, 0.0),
    new THREE.Vector2(0.068, 0.025),
    new THREE.Vector2(0.095, 0.075),
    new THREE.Vector2(0.098, 0.135),
    new THREE.Vector2(0.082, 0.19),
    new THREE.Vector2(0.092, 0.225), // subtle Victorian ruffled tulip flare!
    new THREE.Vector2(0.084, 0.235),
  ];
  const tulipGlobeGeo = new THREE.LatheGeometry(globePoints, 20);

  for (let i = 0; i < 8; i++) {
    const cornerAngle = i * (Math.PI / 4) + Math.PI / 8;
    const pGrp = new THREE.Group();
    const pr = CORNER_RADIUS - 0.26; // tucked firmly into the octagonal corner junction
    pGrp.position.set(Math.sin(cornerAngle) * pr, 0, -Math.cos(cornerAngle) * pr);
    pGrp.rotation.y = -cornerAngle; // local +Z points straight toward room center!
    pilastersGroup.add(pGrp);

    // Octagonal stone & dark walnut stepped plinth base (y = 0..0.64)
    const stoneFoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.38, 0.26, 8),
      stoneMat
    );
    stoneFoot.position.y = 0.13;
    stoneFoot.castShadow = true;
    stoneFoot.receiveShadow = true;
    pGrp.add(stoneFoot);

    const walnutBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.32, 0.38, 8),
      walnutDarkMat
    );
    walnutBase.position.y = 0.45;
    walnutBase.castShadow = true;
    pGrp.add(walnutBase);

    const baseCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.255, 0.026, 10, 20),
      brassMat
    );
    baseCollar.rotation.x = Math.PI / 2;
    baseCollar.position.y = 0.65;
    pGrp.add(baseCollar);

    // Tall fluted walnut pilaster shaft scaled to WALL_HEIGHT = 5.0m (y = 0.65..4.34)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.225, 0.24, 3.70, 12),
      walnutMat
    );
    shaft.position.y = 2.50;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    pGrp.add(shaft);

    // 5 proud half-round vertical flutes facing inward into the room
    for (let fl = -2; fl <= 2; fl++) {
      const fa = fl * 0.38;
      const flute = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.027, 3.54, 8),
        walnutDarkMat
      );
      flute.position.set(Math.sin(fa) * 0.226, 2.50, Math.cos(fa) * 0.226);
      pGrp.add(flute);
    }

    // Mid-height decorative brass astragal band
    const midBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.018, 10, 20),
      bronzeMat
    );
    midBand.rotation.x = Math.PI / 2;
    midBand.position.y = 1.12;
    pGrp.add(midBand);

    // Ornate Bronze Corinthian-inspired Capital (y = 4.34..4.76)
    const neckRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.028, 10, 20),
      brassBrightMat
    );
    neckRing.rotation.x = Math.PI / 2;
    neckRing.position.y = 4.36;
    pGrp.add(neckRing);

    const capBell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.225, 0.30, 8),
      bronzeMat
    );
    capBell.position.y = 4.52;
    pGrp.add(capBell);

    const capAbacus = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.11, 0.66),
      brassMat
    );
    capAbacus.position.y = 4.72;
    pGrp.add(capAbacus);

    // --- BRASS WALL GASLAMP SCONCE MOUNTED AT y = 2.65m ---
    const sconce = new THREE.Group();
    sconce.position.set(0, 2.65, 0.225);
    pGrp.add(sconce);

    // Embossed oval brass wall backplate
    const backplate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.095, 0.028, 16),
      brassMat
    );
    backplate.rotation.x = Math.PI / 2;
    backplate.scale.set(0.82, 1.35, 1);
    sconce.add(backplate);

    // Sculpted S-curve swan-neck brass arm (TubeGeometry)
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.0, 0.01),
      new THREE.Vector3(0, -0.04, 0.12),
      new THREE.Vector3(0, -0.09, 0.22),
      new THREE.Vector3(0, -0.02, 0.31),
      new THREE.Vector3(0, 0.05, 0.33),
    ]);
    const armMesh = new THREE.Mesh(
      new THREE.TubeGeometry(armCurve, 16, 0.013, 8, false),
      brassBrightMat
    );
    sconce.add(armMesh);

    // Gas valve stopcock thumbscrew
    const valve = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.014, 0.014),
      brassBrightMat
    );
    valve.position.set(0, -0.075, 0.24);
    sconce.add(valve);

    // Fluted brass burner gallery cup
    const burnerCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.032, 0.05, 16),
      brassBrightMat
    );
    burnerCup.position.set(0, 0.065, 0.33);
    sconce.add(burnerCup);

    // Glowing Frosted Warm-Amber Tulip Glass Globe
    const globe = new THREE.Mesh(tulipGlobeGeo, glassGlobeMat);
    globe.position.set(0, 0.085, 0.33);
    sconce.add(globe);

    // Animated Warm Inner Flame Teardrop
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.024, 0.085, 10),
      flameMat
    );
    flame.position.set(0, 0.165, 0.33);
    sconce.add(flame);
    animatedFlames.push({ mesh: flame, baseScaleY: 1.0, phase: i * 1.37 });
  }

  // =========================================================================
  // 5. MOLDED DENTIL CORNICE & MEZZANINE BRASS CATWALK GALLERY (y = 4.78m)
  // =========================================================================
  const galleryGroup = new THREE.Group();
  galleryGroup.name = 'MezzanineCatwalkGallery';
  group.add(galleryGroup);

  const catwalkApothem = APOTHEM - 0.68; // 6.12m inner rail apothem
  const catwalkSide = 2 * catwalkApothem * Math.tan(Math.PI / 8); // ~5.07m
  const galleryY = 4.78;

  // Instanced dentil blocks + gallery balusters for clean draw-call budget
  const dentilMatrices: THREE.Matrix4[] = [];
  const balusterMatrices: THREE.Matrix4[] = [];
  const bracketMatrices: THREE.Matrix4[] = [];

  const qRot = new THREE.Quaternion();
  const sOne = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < 8; i++) {
    const a = i * (Math.PI / 4);
    const sideGrp = createWallGroup(i);
    galleryGroup.add(sideGrp);

    // Molded entablature frieze & cornice at wall top (y = 4.58..4.92)
    const frieze = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_SIDE + 0.32, 0.26, 0.18),
      walnutDarkMat
    );
    frieze.position.set(0, galleryY - 0.08, 0.08);
    sideGrp.add(frieze);

    // Cantilevered wooden catwalk walkway deck (sealing cleanly out past wall corners!)
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_SIDE + 0.45, 0.12, 0.96),
      walnutMat
    );
    deck.position.set(0, galleryY + 0.04, 0.26);
    deck.castShadow = true;
    deck.receiveShadow = true;
    sideGrp.add(deck);

    // Gleaming brass catwalk nosing fascia trim
    const nosing = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkSide + 0.10, 0.14, 0.055),
      brassMat
    );
    nosing.position.set(0, galleryY + 0.04, 0.74);
    sideGrp.add(nosing);

    // Top & bottom brass gallery handrails along inner edge (z_local = 0.69)
    const topRail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, catwalkSide + 0.06, 12),
      brassBrightMat
    );
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, galleryY + 0.80, 0.69);
    sideGrp.add(topRail);

    const midRail = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkSide, 0.022, 0.026),
      brassMat
    );
    midRail.position.set(0, galleryY + 0.68, 0.69);
    sideGrp.add(midRail);

    const botRail = new THREE.Mesh(
      new THREE.BoxGeometry(catwalkSide, 0.032, 0.038),
      bronzeMat
    );
    botRail.position.set(0, galleryY + 0.14, 0.69);
    sideGrp.add(botRail);

    // Mid-bay turned brass newel post with finial ball
    const midPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.038, 0.76, 10),
      brassMat
    );
    midPost.position.set(0, galleryY + 0.47, 0.69);
    sideGrp.add(midPost);
    const midFinial = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 10),
      brassBrightMat
    );
    midFinial.position.set(0, galleryY + 0.86, 0.69);
    sideGrp.add(midFinial);

    // Collect dentil block matrices (18 per wider wall)
    qRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    for (let d = 0; d < 18; d++) {
      const lx = -WALL_SIDE * 0.44 + (d / 17) * (WALL_SIDE * 0.88);
      const wp = wallLocalToWorld(i, new THREE.Vector3(lx, galleryY - 0.14, 0.19));
      const m = new THREE.Matrix4().compose(wp, qRot, sOne);
      dentilMatrices.push(m);
    }

    // Collect vertical balusters (18 per wider wall)
    for (let b = 0; b < 18; b++) {
      const lx = -catwalkSide * 0.46 + (b / 17) * (catwalkSide * 0.92);
      if (Math.abs(lx) < 0.15) continue; // skip mid-post
      const wp = wallLocalToWorld(i, new THREE.Vector3(lx, galleryY + 0.44, 0.69));
      const m = new THREE.Matrix4().compose(wp, qRot, sOne);
      balusterMatrices.push(m);
    }

    // Collect under-catwalk support iron corbel brackets tucked cleanly inside the cornice-to-catwalk cove
    for (const bx of [-2.05, 0, 2.05]) {
      const wp = wallLocalToWorld(i, new THREE.Vector3(bx, galleryY - 0.015, 0.01));
      const m = new THREE.Matrix4().compose(wp, qRot, sOne);
      bracketMatrices.push(m);
    }
  }

  // Corner newel posts on the octagonal gallery railing
  const cornerRailR = catwalkApothem / Math.cos(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const ca = i * (Math.PI / 4) + Math.PI / 8;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.048, 0.80, 12),
      brassBrightMat
    );
    post.position.set(Math.sin(ca) * cornerRailR, galleryY + 0.48, -Math.cos(ca) * cornerRailR);
    galleryGroup.add(post);

    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.056, 12, 10), brassBrightMat);
    orb.position.set(Math.sin(ca) * cornerRailR, galleryY + 0.90, -Math.cos(ca) * cornerRailR);
    galleryGroup.add(orb);
  }

  // Build InstancedMeshes for dentils, balusters, and anchored architectural corbel brackets
  const dentilInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.09, 0.11, 0.08),
    brassMat,
    dentilMatrices.length
  );
  dentilMatrices.forEach((m, idx) => dentilInst.setMatrixAt(idx, m));
  dentilInst.instanceMatrix.needsUpdate = true;
  galleryGroup.add(dentilInst);

  const balusterInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.011, 0.013, 0.60, 8),
    darkIronMat,
    balusterMatrices.length
  );
  balusterMatrices.forEach((m, idx) => balusterInst.setMatrixAt(idx, m));
  balusterInst.instanceMatrix.needsUpdate = true;
  galleryGroup.add(balusterInst);

  // Compact cast-iron structural corbel bracket tucked flush inside cornice-to-catwalk cove (y=4.01..4.245)
  const bracketShape = new THREE.Shape();
  bracketShape.moveTo(0.0, 0.0);
  bracketShape.lineTo(0.64, 0.0); // Top horizontal flange bolted flush under catwalk deck!
  bracketShape.lineTo(0.64, -0.048);
  // Sweeping Victorian cove arch nesting cleanly against the frieze above the wall coffers
  bracketShape.quadraticCurveTo(0.42, -0.06, 0.25, -0.15);
  bracketShape.quadraticCurveTo(0.14, -0.21, 0.08, -0.24);
  bracketShape.lineTo(0.0, -0.24); // Vertical backplate flush with frieze!
  bracketShape.closePath();

  const bracketGeo = new THREE.ExtrudeGeometry(bracketShape, {
    depth: 0.072,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  // Rotate -PI/2 around Y so Shape +X extends straight out along local +Z (into room under catwalk)
  bracketGeo.rotateY(-Math.PI / 2);
  bracketGeo.translate(0.036, 0, 0);

  const bracketInst = new THREE.InstancedMesh(
    bracketGeo,
    darkIronMat,
    bracketMatrices.length
  );
  bracketMatrices.forEach((m, idx) => bracketInst.setMatrixAt(idx, m));
  bracketInst.instanceMatrix.needsUpdate = true;
  galleryGroup.add(bracketInst);

  // Decorative brass scroll ring tucked cleanly inside each corbel cove spandrel
  const voluteGeo = new THREE.TorusGeometry(0.056, 0.012, 8, 18);
  voluteGeo.rotateY(Math.PI / 2);
  const voluteInst = new THREE.InstancedMesh(voluteGeo, brassMat, bracketMatrices.length);
  const voluteOff = new THREE.Matrix4().makeTranslation(0, -0.095, 0.26);
  bracketMatrices.forEach((m, idx) => {
    voluteInst.setMatrixAt(idx, m.clone().multiply(voluteOff));
  });
  voluteInst.instanceMatrix.needsUpdate = true;
  galleryGroup.add(voluteInst);

  // =========================================================================
  // 6. THE GRAND OBSERVATORY DOME (y = 4.4m to 8.4m) WITH OPEN NORTH SLIT
  // =========================================================================
  const domeGroup = new THREE.Group();
  domeGroup.name = 'ObservatoryDome';
  group.add(domeGroup);

  // Circular stone & iron dome drum base + geared brass rotation rack ring at y = 4.38m
  const drumRing = new THREE.Mesh(
    new THREE.CylinderGeometry(DOME_RADIUS + 0.05, DOME_RADIUS + 0.05, 0.42, 48, 1, true),
    darkIronMat
  );
  drumRing.material = darkIronMat.clone();
  drumRing.material.side = THREE.DoubleSide;
  drumRing.position.y = WALL_HEIGHT + 0.14;
  domeGroup.add(drumRing);

  const trackTorus = new THREE.Mesh(
    new THREE.TorusGeometry(DOME_RADIUS - 0.08, 0.08, 12, 64),
    brassMat
  );
  trackTorus.rotation.x = Math.PI / 2;
  trackTorus.position.y = WALL_HEIGHT + 0.02;
  domeGroup.add(trackTorus);

  // 112 instanced brass rack gear teeth lining the expanded dome rotation track!
  const toothGeo = new THREE.BoxGeometry(0.095, 0.095, 0.12);
  const toothInst = new THREE.InstancedMesh(toothGeo, brassBrightMat, 112);
  for (let t = 0; t < 112; t++) {
    const a = (t / 112) * Math.PI * 2;
    const r = DOME_RADIUS - 0.16;
    dummy.position.set(Math.sin(a) * r, WALL_HEIGHT + 0.02, -Math.cos(a) * r);
    dummy.rotation.set(0, -a, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    toothInst.setMatrixAt(t, dummy.matrix);
  }
  toothInst.instanceMatrix.needsUpdate = true;
  domeGroup.add(toothInst);

  // Hammered Verdigris Copper Dome Shell + Curved Sapphire-Tinted Glass Skylights
  const { copperGeo, glassGeo } = buildObservatoryDomeGeometry();
  const copperDomeMesh = new THREE.Mesh(copperGeo, copperDomeMat);
  copperDomeMesh.receiveShadow = true;
  domeGroup.add(copperDomeMesh);

  const glassSkylightMesh = new THREE.Mesh(glassGeo, skylightGlassMat);
  glassSkylightMesh.userData.noRaycast = true;
  domeGroup.add(glassSkylightMesh);

  // 16 Structural Arched Riveted Iron & Brass Meridian Ribs
  for (let i = 0; i < 16; i++) {
    const phi = (i / 16) * Math.PI * 2;
    // Skip rib i=0 (dead center of North shutter slit!)
    if (i === 0) continue;

    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 18; s++) {
      const th = (s / 18) * (Math.PI * 0.485);
      const r = (DOME_RADIUS - 0.08) * Math.cos(th);
      const x = Math.sin(phi) * r;
      const z = -Math.cos(phi) * r;
      const y = WALL_HEIGHT + (DOME_HEIGHT - 0.06) * Math.sin(th);
      // Stop rib cleanly if it enters the North shutter opening
      if (Math.abs(x) < SHUTTER_HALF_W - 0.02 && z < SHUTTER_REAR_Z - 0.03) break;
      pts.push(new THREE.Vector3(x, y, z));
    }
    if (pts.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts);
      const rib = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 20, i % 2 === 0 ? 0.075 : 0.048, 8, false),
        i % 2 === 0 ? darkIronMat : bronzeMat
      );
      domeGroup.add(rib);
    }
  }

  // 3 Horizontal Purlin Ring Girders (interrupted cleanly across the North shutter slit)
  const purlinElevations = [0.28, 0.62, 0.98];
  for (const th of purlinElevations) {
    const pr = (DOME_RADIUS - 0.09) * Math.cos(th);
    const py = WALL_HEIGHT + (DOME_HEIGHT - 0.07) * Math.sin(th);

    // Determine starting azimuth outside x = ±SHUTTER_HALF_W on North side
    const minRatio = Math.min(0.98, (SHUTTER_HALF_W + 0.02) / pr);
    const startPhi = pr > SHUTTER_HALF_W + 0.04 ? Math.asin(minRatio) : Math.PI * 0.45;
    const pts: THREE.Vector3[] = [];
    const steps = 44;
    for (let k = 0; k <= steps; k++) {
      const phi = startPhi + (k / steps) * (Math.PI * 2 - startPhi * 2);
      pts.push(new THREE.Vector3(Math.sin(phi) * pr, py, -Math.cos(phi) * pr));
    }
    const purlinCurve = new THREE.CatmullRomCurve3(pts);
    const purlin = new THREE.Mesh(
      new THREE.TubeGeometry(purlinCurve, 44, 0.046, 8, false),
      brassMat
    );
    domeGroup.add(purlin);
  }

  // TWIN HEAVY PARALLEL ARCHED SHUTTER GIRDERS framing the open North shutter slit (x = ±SHUTTER_HALF_W)
  for (const sx of [-SHUTTER_HALF_W, SHUTTER_HALF_W]) {
    const girderPts: THREE.Vector3[] = [];
    const railPts: THREE.Vector3[] = [];
    const effR = Math.sqrt(DOME_RADIUS * DOME_RADIUS - sx * sx);
    for (let k = 0; k <= 28; k++) {
      // Runs from North horizon (-Z) over the zenith to z = +SHUTTER_REAR_Z
      const t = k / 28;
      const angle = t * (Math.PI * 0.56);
      const z = -Math.cos(angle) * (effR - 0.06);
      const y = WALL_HEIGHT + Math.sin(angle) * (DOME_HEIGHT * (effR / DOME_RADIUS) - 0.04);
      girderPts.push(new THREE.Vector3(sx, y, z));
      railPts.push(new THREE.Vector3(sx * 0.97, y - 0.07, z));
    }
    const girderCurve = new THREE.CatmullRomCurve3(girderPts);
    const girder = new THREE.Mesh(
      new THREE.TubeGeometry(girderCurve, 32, 0.105, 10, false),
      darkIronMat
    );
    domeGroup.add(girder);

    // Inner gleaming brass shutter track trim
    const brassTrack = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 28, 0.036, 8, false),
      brassBrightMat
    );
    domeGroup.add(brassTrack);

    // Retracted curved shutter leaf edge visible peeking along the side of the slit
    const leafPts = girderPts.map(
      (p) => new THREE.Vector3(p.x + Math.sign(sx) * 0.28, p.y - 0.03, p.z)
    );
    const leaf = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leafPts), 24, 0.062, 6, false),
      bronzeMat
    );
    domeGroup.add(leaf);
  }

  // Rear crossbar closing the South end of the shutter slit
  const slitRearBar = new THREE.Mesh(
    new THREE.BoxGeometry(SHUTTER_HALF_W * 2 + 0.14, 0.18, 0.18),
    darkIronMat
  );
  slitRearBar.position.set(0, WALL_HEIGHT + DOME_HEIGHT - 0.16, SHUTTER_REAR_Z + 0.04);
  domeGroup.add(slitRearBar);

  // Brass Celestial Compass Ring suspended gently just South of the zenith
  const zenithRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.040, 12, 36),
    brassBrightMat
  );
  zenithRing.rotation.x = Math.PI / 2;
  zenithRing.position.set(0, WALL_HEIGHT + DOME_HEIGHT - 0.48, 1.65);
  domeGroup.add(zenithRing);

  // =========================================================================
  // 7. AMBIENT STORYTELLING PROPS (100% GROUNDED & CLEAR OF HERO FOOTPRINTS)
  // =========================================================================
  const storytellingGroup = new THREE.Group();
  storytellingGroup.name = 'AmbientStorytellingProps';
  group.add(storytellingGroup);

  // --- 7A. SE CORNER: Brass Standing Celestial Globe on Turned Walnut Tripod (5.15, 0, 2.55) ---
  {
    const globeGrp = new THREE.Group();
    globeGrp.name = 'StandingCelestialGlobe';
    globeGrp.position.set(5.15, 0, 2.55);
    globeGrp.rotation.y = -Math.PI * 0.65;
    storytellingGroup.add(globeGrp);

    // 3 gracefully splayed walnut tripod legs with brass claw ferrules
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2;
      const legCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.36, 0),
        new THREE.Vector3(Math.sin(a) * 0.16, 0.24, Math.cos(a) * 0.16),
        new THREE.Vector3(Math.sin(a) * 0.32, 0.04, Math.cos(a) * 0.32),
      ]);
      const leg = new THREE.Mesh(
        new THREE.TubeGeometry(legCurve, 12, 0.026, 8, false),
        walnutMat
      );
      leg.castShadow = true;
      globeGrp.add(leg);

      const foot = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 10, 8),
        brassBrightMat
      );
      foot.position.set(Math.sin(a) * 0.32, 0.032, Math.cos(a) * 0.32);
      globeGrp.add(foot);
    }

    // Turned central walnut baluster column
    const colPoints = [
      new THREE.Vector2(0.055, 0.14),
      new THREE.Vector2(0.085, 0.26),
      new THREE.Vector2(0.048, 0.42),
      new THREE.Vector2(0.068, 0.56),
      new THREE.Vector2(0.042, 0.72),
      new THREE.Vector2(0.075, 0.78),
    ];
    const turnedCol = new THREE.Mesh(new THREE.LatheGeometry(colPoints, 18), walnutMat);
    turnedCol.castShadow = true;
    globeGrp.add(turnedCol);

    // Horizontal brass zodiac horizon ring + 4 curved support arms
    const horizonRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.028, 10, 36),
      brassMat
    );
    horizonRing.rotation.x = Math.PI / 2;
    horizonRing.scale.set(1, 1, 0.45);
    horizonRing.position.y = 1.12;
    horizonRing.castShadow = true;
    globeGrp.add(horizonRing);

    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
      const armC = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.sin(a) * 0.05, 0.76, Math.cos(a) * 0.05),
        new THREE.Vector3(Math.sin(a) * 0.28, 0.88, Math.cos(a) * 0.28),
        new THREE.Vector3(Math.sin(a) * 0.36, 1.11, Math.cos(a) * 0.36),
      ]);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(armC, 12, 0.015, 8, false), brassMat);
      globeGrp.add(arm);
    }

    // Engraved brass meridian ring + tilted celestial globe sphere
    const meridianRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.305, 0.016, 10, 36),
      brassBrightMat
    );
    meridianRing.position.y = 1.12;
    globeGrp.add(meridianRing);

    const globeAxis = new THREE.Group();
    globeAxis.position.y = 1.12;
    globeAxis.rotation.z = THREE.MathUtils.degToRad(23.5);
    globeGrp.add(globeAxis);

    const globeMat = new THREE.MeshStandardMaterial({
      map: textures.constellationMap,
      roughness: 0.32,
      metalness: 0.22,
      color: 0xd0d8e8,
      envMapIntensity: 1.1,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.27, 28, 20), globeMat);
    sphere.castShadow = true;
    globeAxis.add(sphere);
    celestialGlobeBall = sphere;

    // Brass equatorial band hugging the globe
    const eqBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.274, 0.006, 8, 32),
      brassBrightMat
    );
    eqBand.rotation.x = Math.PI / 2;
    sphere.add(eqBand);

    colliders.push({
      minX: 4.72,
      maxX: 5.58,
      minZ: 2.12,
      maxZ: 2.98,
      label: 'Standing Celestial Globe',
    });
  }

  // --- 7B. NORTH-NW CORNER: Astronomer's Expedition Crates & Brass Compass Case (-3.15, 0, -5.45) ---
  {
    const crateGrp = new THREE.Group();
    crateGrp.name = 'ExpeditionCrates';
    crateGrp.position.set(-3.15, 0, -5.45);
    crateGrp.rotation.y = 0.42;
    storytellingGroup.add(crateGrp);

    // Lower slatted oak shipping crate (0.76 x 0.48 x 0.54)
    const lowerCrate = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.48, 0.54),
      walnutMat
    );
    lowerCrate.position.y = 0.24;
    lowerCrate.castShadow = true;
    lowerCrate.receiveShadow = true;
    crateGrp.add(lowerCrate);

    // Iron reinforcement edge bands on lower crate
    for (const sx of [-0.36, 0.36]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.495, 0.555), darkIronMat);
      band.position.set(sx, 0.24, 0);
      crateGrp.add(band);
    }

    // Smaller angled brass-bound instrument chest resting squarely on top (y = 0.48..0.78)
    const chest = new THREE.Group();
    chest.position.set(-0.04, 0.48, 0.02);
    chest.rotation.y = -0.26;
    crateGrp.add(chest);

    const chestBox = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.34), mahoganyMat);
    chestBox.position.y = 0.14;
    chestBox.castShadow = true;
    chestBox.receiveShadow = true;
    chest.add(chestBox);

    // Brass corner L-brackets & front clasp on instrument chest
    for (const sx of [-0.23, 0.23]) {
      for (const sz of [-0.16, 0.16]) {
        const corner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.29, 0.04), brassMat);
        corner.position.set(sx, 0.14, sz);
        chest.add(corner);
      }
    }
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.02), brassBrightMat);
    clasp.position.set(0, 0.19, 0.175);
    chest.add(clasp);

    // Brass transit compass sitting atop the instrument chest (y = 0.28)
    const compassBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.105, 0.036, 20),
      brassBrightMat
    );
    compassBase.position.set(0.06, 0.298, 0.0);
    chest.add(compassBase);
    const compassGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0xe2d6b6, roughness: 0.3 })
    );
    compassGlass.rotation.x = -Math.PI / 2;
    compassGlass.position.set(0.06, 0.318, 0.0);
    chest.add(compassGlass);

    // Rolled parchment star-chart tubes leaning cleanly on the floor against the lower crate
    for (let r = 0; r < 3; r++) {
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.034, 0.034, 0.68, 12),
        parchmentMat
      );
      tube.position.set(0.44 + r * 0.055, 0.335, -0.05 + r * 0.06);
      tube.rotation.z = 0.24;
      tube.rotation.x = 0.1;
      tube.castShadow = true;
      crateGrp.add(tube);
    }

    colliders.push({
      minX: -3.66,
      maxX: -2.62,
      minZ: -5.92,
      maxZ: -4.98,
      label: 'Expedition Crates',
    });
  }

  // --- 7C. SW READING NOOK: Velvet Victorian Armchair + Side Table & Brass Candleholder ---
  {
    const chairGrp = new THREE.Group();
    chairGrp.name = 'VictorianReadingArmchair';
    chairGrp.position.set(-5.18, 0, 2.52);
    chairGrp.rotation.y = Math.PI * 0.62; // Angled invitingly toward center Orrery & Telescope
    storytellingGroup.add(chairGrp);

    // 4 sculpted Queen Anne cabriole mahogany legs with brass claw feet (y = 0..0.34)
    for (const sx of [-0.32, 0.32]) {
      for (const sz of [-0.30, 0.30]) {
        const legCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sx, 0.34, sz),
          new THREE.Vector3(sx * 1.12, 0.22, sz * 1.10),
          new THREE.Vector3(sx * 0.96, 0.10, sz * 0.98),
          new THREE.Vector3(sx * 1.04, 0.03, sz * 1.04),
        ]);
        const leg = new THREE.Mesh(
          new THREE.TubeGeometry(legCurve, 12, 0.028, 10, false),
          walnutDarkMat
        );
        leg.castShadow = true;
        chairGrp.add(leg);

        const clawFoot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), brassMat);
        clawFoot.position.set(sx * 1.04, 0.026, sz * 1.04);
        chairGrp.add(clawFoot);
      }
    }

    // Carved mahogany lower apron frame with rounded front rail
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.11, 0.70), mahoganyMat);
    apron.position.y = 0.355;
    apron.castShadow = true;
    chairGrp.add(apron);

    // Plush beveled rounded crimson velvet seat cushion (ExtrudeGeometry with deep soft bevels!)
    const cushionShape = new THREE.Shape();
    const cw = 0.31;
    const cd = 0.29;
    cushionShape.moveTo(-cw, -cd);
    cushionShape.quadraticCurveTo(0, -cd - 0.04, cw, -cd);
    cushionShape.lineTo(cw, cd);
    cushionShape.quadraticCurveTo(0, cd + 0.05, -cw, cd);
    cushionShape.closePath();

    const cushionGeo = new THREE.ExtrudeGeometry(cushionShape, {
      depth: 0.10,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.042,
      bevelSegments: 5,
    });
    cushionGeo.rotateX(Math.PI / 2);
    const seat = new THREE.Mesh(cushionGeo, velvetCrimsonMat);
    seat.position.set(0, 0.545, 0.03);
    seat.castShadow = true;
    seat.receiveShadow = true;
    chairGrp.add(seat);

    // Arched Victorian Wingback Backrest (sculpted curved silhouette + plush beveled cushion)
    const backShape = new THREE.Shape();
    backShape.moveTo(-0.33, 0.0);
    backShape.lineTo(0.33, 0.0);
    backShape.lineTo(0.35, 0.58);
    backShape.quadraticCurveTo(0.30, 0.80, 0.0, 0.84); // gracefully arched camelback crest!
    backShape.quadraticCurveTo(-0.30, 0.80, -0.35, 0.58);
    backShape.closePath();

    const backGeo = new THREE.ExtrudeGeometry(backShape, {
      depth: 0.10,
      bevelEnabled: true,
      bevelThickness: 0.048,
      bevelSize: 0.035,
      bevelSegments: 5,
    });
    const backrest = new THREE.Mesh(backGeo, velvetCrimsonMat);
    backrest.position.set(0, 0.44, -0.33);
    backrest.rotation.x = -0.15;
    backrest.castShadow = true;
    backrest.receiveShadow = true;
    chairGrp.add(backrest);

    // Classic Chesterfield Diamond-Tufted Recessed Velvet Buttons across backrest!
    const tuftDarkMat = new THREE.MeshStandardMaterial({
      color: 0x3b0b12,
      roughness: 0.92,
      metalness: 0.02,
    });
    const tuftCoords: Array<[number, number]> = [
      [-0.18, 0.72],
      [0.0, 0.72],
      [0.18, 0.72],
      [-0.09, 0.86],
      [0.09, 0.86],
      [-0.18, 1.00],
      [0.0, 1.00],
      [0.18, 1.00],
      [-0.09, 1.13],
      [0.09, 1.13],
    ];
    for (const [tx, ty] of tuftCoords) {
      const zSlope = -0.22 - (ty - 0.55) * 0.15;
      const dimple = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 6, 12), tuftDarkMat);
      dimple.position.set(tx, ty, zSlope + 0.028);
      dimple.rotation.x = -0.15;
      chairGrp.add(dimple);

      const button = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), velvetCrimsonMat);
      button.scale.set(1, 1, 0.55);
      button.position.set(tx, ty, zSlope + 0.032);
      chairGrp.add(button);
    }

    // Sculpted Rolled Outward-Flaring Padded Armrests + Curved Wingback Ears + Brass Nailhead Trim
    for (const sx of [-1, 1]) {
      const xArm = sx * 0.37;

      // Padded lower arm body
      const armSide = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.28, 0.62),
        velvetCrimsonMat
      );
      armSide.position.set(xArm, 0.56, 0.0);
      armSide.castShadow = true;
      chairGrp.add(armSide);

      // Generous rounded velvet rolled armrest cylinder
      const armRoll = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.076, 0.66, 16),
        velvetCrimsonMat
      );
      armRoll.rotation.x = Math.PI / 2;
      armRoll.position.set(xArm + sx * 0.025, 0.72, 0.02);
      armRoll.castShadow = true;
      chairGrp.add(armRoll);

      // Front rolled armrest mahogany scroll cap & brass nailhead perimeter
      const rollCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.080, 0.080, 0.025, 16),
        mahoganyMat
      );
      rollCap.rotation.x = Math.PI / 2;
      rollCap.position.set(xArm + sx * 0.025, 0.72, 0.345);
      chairGrp.add(rollCap);

      // Ring of gleaming brass upholstery nailheads around the front arm scroll!
      for (let st = 0; st < 8; st++) {
        const a = (st / 8) * Math.PI * 2;
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 6, 6), brassBrightMat);
        stud.position.set(
          xArm + sx * 0.025 + Math.cos(a) * 0.066,
          0.72 + Math.sin(a) * 0.066,
          0.36
        );
        chairGrp.add(stud);
      }
      // Vertical row of brass nailhead studs down the front arm post
      for (let st = 0; st < 5; st++) {
        const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 6, 6), brassBrightMat);
        stud.position.set(xArm, 0.43 + st * 0.052, 0.325);
        chairGrp.add(stud);
      }

      // Sculpted curved wingback side ear (ExtrudeGeometry with curved profile & soft bevel)
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(0.24, 0.04);
      wingShape.quadraticCurveTo(0.28, 0.24, 0.21, 0.44);
      wingShape.quadraticCurveTo(0.14, 0.52, 0, 0.50);
      wingShape.closePath();
      const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
        depth: 0.045,
        bevelEnabled: true,
        bevelThickness: 0.022,
        bevelSize: 0.020,
        bevelSegments: 4,
      });
      wingGeo.rotateY(-Math.PI / 2);
      wingGeo.translate(0.0225, 0, 0);
      const wing = new THREE.Mesh(wingGeo, velvetCrimsonMat);
      wing.position.set(sx * 0.36, 0.72, -0.31);
      wing.rotation.y = sx * -0.22;
      wing.castShadow = true;
      chairGrp.add(wing);
    }

    // Small gold-trimmed midnight-velvet throw pillow nestled casually in the corner of the seat
    const pillowMat = new THREE.MeshStandardMaterial({
      color: 0x1b2b4a,
      roughness: 0.85,
      metalness: 0.04,
    });
    const pillow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), pillowMat);
    pillow.scale.set(1.15, 0.92, 0.42);
    pillow.position.set(-0.15, 0.68, -0.14);
    pillow.rotation.set(-0.22, 0.36, 0.14);
    pillow.castShadow = true;
    chairGrp.add(pillow);

    // Small Turned-Walnut Round Side Table beside the armchair (-5.42, 0, 1.68)
    const tableGrp = new THREE.Group();
    tableGrp.name = 'ReadingSideTable';
    tableGrp.position.set(-5.42, 0, 1.68);
    storytellingGroup.add(tableGrp);

    // Tripod pedestal foot
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.24), walnutDarkMat);
      foot.position.set(Math.sin(a) * 0.11, 0.035, Math.cos(a) * 0.11);
      foot.rotation.y = a;
      tableGrp.add(foot);
    }

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.052, 0.58, 14),
      walnutMat
    );
    stem.position.y = 0.33;
    stem.castShadow = true;
    tableGrp.add(stem);

    const tableTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.28, 0.042, 28),
      walnutMat
    );
    tableTop.position.y = 0.63;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    tableGrp.add(tableTop);

    const tableRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.295, 0.01, 8, 32),
      brassMat
    );
    tableRim.rotation.x = Math.PI / 2;
    tableRim.position.y = 0.65;
    tableGrp.add(tableRim);

    // Brass Chamberstick Candleholder + Wax Candle + Animated Flickering Flame (y = 0.65)
    const saucer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.062, 0.022, 18),
      brassBrightMat
    );
    saucer.position.set(-0.04, 0.662, 0.04);
    tableGrp.add(saucer);

    const candleHolder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.028, 0.06, 12),
      brassBrightMat
    );
    candleHolder.position.set(-0.04, 0.695, 0.04);
    tableGrp.add(candleHolder);

    const waxCandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.019, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0xf0e4c8, roughness: 0.72 })
    );
    waxCandle.position.set(-0.04, 0.78, 0.04);
    tableGrp.add(waxCandle);

    const candleFlame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.052, 8), flameMat);
    candleFlame.position.set(-0.04, 0.875, 0.04);
    tableGrp.add(candleFlame);
    animatedFlames.push({ mesh: candleFlame, baseScaleY: 1.0, phase: 4.9 });

    // Small stack of 2 leather astronomy volumes on the side table
    const tBook1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.036, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x203552, roughness: 0.62 })
    );
    tBook1.position.set(0.10, 0.67, -0.05);
    tBook1.rotation.y = 0.35;
    tableGrp.add(tBook1);

    const tBook2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.032, 0.21),
      new THREE.MeshStandardMaterial({ color: 0x6b2226, roughness: 0.62 })
    );
    tBook2.position.set(0.09, 0.704, -0.05);
    tBook2.rotation.y = 0.58;
    tableGrp.add(tBook2);

    colliders.push({
      minX: -5.82,
      maxX: -4.64,
      minZ: 1.32,
      maxZ: 3.08,
      label: 'Reading Armchair & Side Table',
    });
  }

  // =========================================================================
  // 8. ANIMATION LOOP (Flame Micro-Dance, Clock Pendulum, Subtle Globe Turn)
  // =========================================================================
  const update = (elapsed: number, _delta: number, _state: Readonly<GameStateSnapshot>): void => {
    for (const f of animatedFlames) {
      const wave =
        Math.sin(elapsed * 7.4 + f.phase) * 0.11 +
        Math.sin(elapsed * 13.7 + f.phase * 2.1) * 0.06;
      f.mesh.scale.set(1 - wave * 0.35, f.baseScaleY + wave, 1 - wave * 0.35);
    }

    if (clockPendulum) {
      clockPendulum.rotation.z = Math.sin(elapsed * Math.PI) * 0.14; // authentic 1-second sweep
    }
    if (clockMinuteHand) {
      clockMinuteHand.rotation.z = -elapsed * 0.012;
    }
    if (celestialGlobeBall) {
      celestialGlobeBall.rotation.y = elapsed * 0.04;
    }
  };

  return {
    group,
    interactables,
    colliders,
    update,
  };
}

function createRegulatorClockDialTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Aged ivory enamel radial gradient
  const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
  bg.addColorStop(0, '#efe4cb');
  bg.addColorStop(0.75, '#e2d2ae');
  bg.addColorStop(1, '#c3ad81');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Inner antique brass guilloche chapter ring
  ctx.strokeStyle = '#8b6a32';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 232, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#221c15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 218, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 204, 0, Math.PI * 2);
  ctx.stroke();

  // 60 crisp railway minute ticks
  for (let m = 0; m < 60; m++) {
    const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
    const isMajor = m % 5 === 0;
    ctx.strokeStyle = '#1c1712';
    ctx.lineWidth = isMajor ? 3.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (isMajor ? 202 : 206), cy + Math.sin(a) * (isMajor ? 202 : 206));
    ctx.lineTo(cx + Math.cos(a) * 218, cy + Math.sin(a) * 218);
    ctx.stroke();
  }

  // Crisp Victorian Serif Roman Numerals I..XII
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#19140f';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const rx = cx + Math.cos(a) * 168;
    const ry = cy + Math.sin(a) * 168;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(romans[h], 0, 0);
    ctx.restore();
  }

  // Inner brass rosette ring + subsidiary observatory seconds dial
  ctx.strokeStyle = '#997538';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 130, 0, Math.PI * 2);
  ctx.stroke();

  const subY = cy - 66;
  ctx.strokeStyle = '#2a2219';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, subY, 36, 0, Math.PI * 2);
  ctx.stroke();
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 29, subY + Math.sin(a) * 29);
    ctx.lineTo(cx + Math.cos(a) * 35, subY + Math.sin(a) * 35);
    ctx.stroke();
  }

  // Horological signature
  ctx.fillStyle = '#2c2216';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.fillText('VANCE & SONS', cx, cy + 52);
  ctx.font = '13px Georgia, serif';
  ctx.fillText('ROYAL OBSERVATORY · 1898', cx, cy + 74);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createBarometerDialTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Silvered-brass antique barometer face
  const bg = ctx.createRadialGradient(cx, cy, 30, cx, cy, 250);
  bg.addColorStop(0, '#dcd2b4');
  bg.addColorStop(0.7, '#c7b88f');
  bg.addColorStop(1, '#9e8a5c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Concentric pressure scale rings
  ctx.strokeStyle = '#1f1a14';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 224, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 188, 0, Math.PI * 2);
  ctx.stroke();

  // Pressure graduation ticks along upper 260-degree arc
  for (let i = 0; i <= 50; i++) {
    const a = Math.PI * 0.78 + (i / 50) * (Math.PI * 1.44);
    const major = i % 5 === 0;
    ctx.strokeStyle = '#1b1611';
    ctx.lineWidth = major ? 3 : 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (major ? 188 : 198), cy + Math.sin(a) * (major ? 188 : 198));
    ctx.lineTo(cx + Math.cos(a) * 222, cy + Math.sin(a) * 222);
    ctx.stroke();
  }

  // Victorian weather legends around inner arc
  const labels = [
    { text: 'STORMY', angle: -Math.PI * 0.92 },
    { text: 'RAIN', angle: -Math.PI * 0.72 },
    { text: 'CHANGE', angle: -Math.PI * 0.5 },
    { text: 'FAIR', angle: -Math.PI * 0.28 },
    { text: 'VERY DRY', angle: -Math.PI * 0.08 },
  ];
  ctx.fillStyle = '#201912';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const item of labels) {
    ctx.save();
    ctx.translate(cx + Math.cos(item.angle) * 146, cy + Math.sin(item.angle) * 146);
    ctx.rotate(item.angle + Math.PI / 2);
    ctx.fillText(item.text, 0, 0);
    ctx.restore();
  }

  // Central exposed antique brass aneroid movement aperture
  ctx.fillStyle = '#3a2c1a';
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d4af5e';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.strokeStyle = '#c29947';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 42, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#241c13';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.fillText('ANEROID BAROMETER', cx, cy + 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createMeridianTransitDialTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Antique brushed bronze-brass radial dial
  const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
  bg.addColorStop(0, '#c8a560');
  bg.addColorStop(0.6, '#9c7b3e');
  bg.addColorStop(1, '#684f24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Fine concentric brushed-lathe rings
  for (let r = 24; r < 245; r += 6) {
    ctx.strokeStyle = r % 18 === 0 ? 'rgba(40,28,12,0.22)' : 'rgba(255,232,175,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Crisp etched degree scale (72 ticks every 5 degrees)
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const major = i % 6 === 0;
    ctx.strokeStyle = '#24190a';
    ctx.lineWidth = major ? 3.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (major ? 196 : 212), cy + Math.sin(a) * (major ? 196 : 212));
    ctx.lineTo(cx + Math.cos(a) * 238, cy + Math.sin(a) * 238);
    ctx.stroke();
  }

  // Engraved meridian crosshairs & zenith compass rose
  ctx.strokeStyle = '#24190a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 188, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 118, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#201609';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ZENITH · 0°', cx, cy - 152);
  ctx.fillText('MERIDIAN', cx, cy + 152);
  ctx.fillText('90°', cx + 154, cy);
  ctx.fillText('90°', cx - 154, cy);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
