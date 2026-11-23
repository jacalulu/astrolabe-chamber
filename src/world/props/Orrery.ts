import * as THREE from 'three';
import { applyOrreryRingClick } from '../../engine/DifficultyConfig';
import {
  ZODIAC_NAMES,
  type ColliderBox,
  type FocusTarget,
  type GameStateSnapshot,
  type Interactable,
  type PropModuleResult,
  type TextureBundle,
} from '../../types';

function enableShadows(root: THREE.Object3D, cast = true, receive = true): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}

function createExtrudedGearGeometry(
  teeth: number,
  innerRadius: number,
  outerRadius: number,
  holeRadius: number,
  depth: number,
  spokes = 4
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.22;
    const a2 = a0 + step * 0.34;
    const a3 = a0 + step * 0.66;
    const a4 = a0 + step * 0.78;

    const p0x = Math.cos(a0) * innerRadius;
    const p0y = Math.sin(a0) * innerRadius;
    if (i === 0) shape.moveTo(p0x, p0y);
    else shape.lineTo(p0x, p0y);

    shape.lineTo(Math.cos(a1) * innerRadius, Math.sin(a1) * innerRadius);
    shape.lineTo(Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius);
    shape.lineTo(Math.cos(a3) * outerRadius, Math.sin(a3) * outerRadius);
    shape.lineTo(Math.cos(a4) * innerRadius, Math.sin(a4) * innerRadius);
  }
  shape.closePath();

  const bore = new THREE.Path();
  bore.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  const midR0 = holeRadius + (innerRadius - holeRadius) * 0.28;
  const midR1 = innerRadius - (innerRadius - holeRadius) * 0.22;
  if (spokes > 0 && midR1 > midR0 + 0.012) {
    for (let s = 0; s < spokes; s++) {
      const sa0 = (s / spokes) * Math.PI * 2 + 0.18;
      const sa1 = ((s + 1) / spokes) * Math.PI * 2 - 0.18;
      const cutout = new THREE.Path();
      cutout.absarc(0, 0, midR1, sa0, sa1, false);
      cutout.absarc(0, 0, midR0, sa1, sa0, true);
      cutout.closePath();
      shape.holes.push(cutout);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.002,
    bevelThickness: 0.002,
  });
  geo.center();
  return geo;
}

function createEarthTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep antique sapphire oceans
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#c8dff0');
  ocean.addColorStop(0.1, '#184b85');
  ocean.addColorStop(0.5, '#133d73');
  ocean.addColorStop(0.9, '#194d88');
  ocean.addColorStop(1, '#d2e6f5');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // Stylized Victorian globe continents in emerald & antique gold-ochre
  const drawBlob = (cx: number, cy: number, rx: number, ry: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0.25, 0, Math.PI * 2);
    ctx.fill();
  };
  drawBlob(120, 96, 48, 34, '#2d6e4e');
  drawBlob(148, 165, 26, 44, '#3d7d52');
  drawBlob(275, 92, 54, 30, '#36754f');
  drawBlob(295, 148, 34, 42, '#8b7742');
  drawBlob(388, 102, 58, 34, '#477a4a');
  drawBlob(430, 175, 28, 22, '#9a7e46');

  // Wispy cream clouds
  ctx.fillStyle = 'rgba(255, 250, 240, 0.26)';
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 41 + 20) % w, 40 + ((i * 59) % 175), 34, 8, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle brass latitude/longitude globe graticule lines
  ctx.strokeStyle = 'rgba(220, 185, 108, 0.24)';
  ctx.lineWidth = 1;
  for (let y = 32; y < h; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let x = 0; x < w; x += 42.66) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createMarsTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#e8ddd0');
  base.addColorStop(0.08, '#b24b28');
  base.addColorStop(0.5, '#c95c30');
  base.addColorStop(0.92, '#a84322');
  base.addColorStop(1, '#e8ddd0');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Dark basaltic maria & rust canyons
  ctx.fillStyle = 'rgba(84, 28, 16, 0.45)';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 67 + 30) % w, 55 + ((i * 43) % 145), 36, 18, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(232, 146, 86, 0.28)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 89 + 15) % w, 45 + ((i * 53) % 165), 24, 14, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createSaturnTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const bands = ctx.createLinearGradient(0, 0, 0, h);
  bands.addColorStop(0.0, '#9e8455');
  bands.addColorStop(0.16, '#d9be82');
  bands.addColorStop(0.32, '#c49d56');
  bands.addColorStop(0.48, '#f0d89e');
  bands.addColorStop(0.55, '#c79e54');
  bands.addColorStop(0.72, '#e2c47e');
  bands.addColorStop(0.86, '#b08b4a');
  bands.addColorStop(1.0, '#8f7446');
  ctx.fillStyle = bands;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createSaturnRingTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  const rings: Array<[number, number, string]> = [
    [125, 16, 'rgba(205, 172, 108, 0.45)'],
    [154, 34, 'rgba(242, 212, 144, 0.88)'],
    [182, 12, 'rgba(210, 178, 114, 0.72)'],
    // Cassini division gap around r=196..206!
    [222, 24, 'rgba(232, 198, 128, 0.78)'],
    [242, 8, 'rgba(195, 162, 98, 0.48)'],
  ];

  for (const [r, lw, col] of rings) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createObsidianStarKeyMesh(
  obsidianMat: THREE.Material,
  goldMat: THREE.Material
): THREE.Group {
  const key = new THREE.Group();

  // 8-pointed celestial obsidian star bow
  const starShape = new THREE.Shape();
  const points = 8;
  const rOut = 0.054;
  const rIn = 0.024;
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();

  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.003,
    bevelThickness: 0.003,
  });
  starGeo.center();

  const starBow = new THREE.Mesh(starGeo, obsidianMat);
  starBow.position.y = 0.095;
  key.add(starBow);

  // Gold filigree halo ring & central gold star gem inside bow
  const bowHalo = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 8, 24), goldMat);
  bowHalo.position.y = 0.095;
  key.add(bowHalo);

  const bowGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), goldMat);
  bowGem.position.y = 0.095;
  key.add(bowGem);

  // Fluted brass & obsidian barrel shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.14, 12), obsidianMat);
  shaft.position.y = -0.015;
  key.add(shaft);

  for (const cy of [0.042, -0.02, -0.075]) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, 8, 16), goldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = cy;
    key.add(collar);
  }

  // Intricate twin-sided gilded astronomical key bit teeth
  const bitMain = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.032, 0.008), goldMat);
  bitMain.position.set(0.022, -0.06, 0);
  key.add(bitMain);

  const bitNotch = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.01), obsidianMat);
  bitNotch.position.set(0.032, -0.06, 0);
  key.add(bitNotch);

  return key;
}

export function buildOrrery(textures: TextureBundle): PropModuleResult {
  const root = new THREE.Group();
  root.name = 'CentralOrreryShowpiece';
  root.position.set(0, 0, 0);

  // Shared PBR Materials
  const marbleMat = new THREE.MeshStandardMaterial({
    map: textures.marbleFloor.map,
    bumpMap: textures.marbleFloor.bumpMap,
    bumpScale: 0.01,
    roughnessMap: textures.marbleFloor.roughnessMap,
    color: new THREE.Color('#222a2e'),
    roughness: 0.24,
    metalness: 0.14,
  });

  const walnutMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.012,
    roughnessMap: textures.walnut.roughnessMap,
    color: new THREE.Color('#4f2c1c'),
    roughness: 0.4,
    metalness: 0.06,
  });

  const polishedBrassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.006,
    roughnessMap: textures.brass.roughnessMap,
    color: new THREE.Color('#e6c06a'),
    roughness: 0.22,
    metalness: 0.92,
  });

  const antiqueBronzeMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.01,
    color: new THREE.Color('#9c7330'),
    roughness: 0.36,
    metalness: 0.86,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#bcc4d0'),
    roughness: 0.2,
    metalness: 0.94,
  });

  // ============================================================================
  // 1. OCTAGONAL DARK-MARBLE & WALNUT PEDESTAL (r = 0.92m, h = 1.02m)
  // ============================================================================
  // Stepped octagonal marble base plinth
  const baseTier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.96, 0.11, 8), marbleMat);
  baseTier1.rotation.y = Math.PI / 8;
  baseTier1.position.y = 0.055;
  root.add(baseTier1);

  const baseBrassBand = new THREE.Mesh(new THREE.CylinderGeometry(0.89, 0.91, 0.025, 8), antiqueBronzeMat);
  baseBrassBand.rotation.y = Math.PI / 8;
  baseBrassBand.position.y = 0.12;
  root.add(baseBrassBand);

  const baseTier2 = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.87, 0.08, 8), walnutMat);
  baseTier2.rotation.y = Math.PI / 8;
  baseTier2.position.y = 0.17;
  root.add(baseTier2);

  // Main fluted octagonal walnut body with 8 recessed panels & brass corner ribs
  const pedBody = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.78, 0.68, 8), walnutMat);
  pedBody.rotation.y = Math.PI / 8;
  pedBody.position.y = 0.55;
  root.add(pedBody);

  for (let i = 0; i < 8; i++) {
    const cornerA = (i * Math.PI) / 4 + Math.PI / 8;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.7, 10), antiqueBronzeMat);
    rib.position.set(Math.cos(cornerA) * 0.77, 0.55, Math.sin(cornerA) * 0.77);
    root.add(rib);

    // Recessed ornamental brass rosette medallion on each octagonal face
    const faceA = (i * Math.PI) / 4;
    const med = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 20), polishedBrassMat);
    med.position.set(Math.cos(faceA) * 0.725, 0.55, Math.sin(faceA) * 0.725);
    med.rotation.y = -faceA + Math.PI / 2;
    root.add(med);

    const medBoss = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), antiqueBronzeMat);
    medBoss.scale.set(1, 1, 0.45);
    medBoss.position.set(Math.cos(faceA) * 0.728, 0.55, Math.sin(faceA) * 0.728);
    medBoss.rotation.y = -faceA + Math.PI / 2;
    root.add(medBoss);
  }

  // Upper stepped marble frieze & circular Zodiac Bezel Table at y = 1.02m
  const capTier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.81, 0.08, 8), marbleMat);
  capTier1.rotation.y = Math.PI / 8;
  capTier1.position.y = 0.93;
  root.add(capTier1);

  const zodiacDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.9, 0.055, 48), marbleMat);
  zodiacDeck.position.y = 0.995;
  root.add(zodiacDeck);

  // Flush inlaid Zodiac Bezel Ring (`textures.zodiacRing`: ARIES at 0° / North -Z, clockwise!)
  // Satin-matte brushed engraving prevents specular washout over Virgo/Leo
  const zodiacMat = new THREE.MeshStandardMaterial({
    map: textures.zodiacRing,
    roughness: 0.48,
    metalness: 0.42,
    envMapIntensity: 0.34,
    emissive: new THREE.Color('#2d210d'),
    emissiveIntensity: 0.24,
  });
  const zodiacMesh = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.9, 64), zodiacMat);
  zodiacMesh.rotation.x = -Math.PI / 2;
  zodiacMesh.position.y = 1.026;
  root.add(zodiacMesh);

  // Raised machined outer & inner brass bezel rings + 12 zodiac house divider studs
  const outerBezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.905, 0.018, 12, 64), polishedBrassMat);
  outerBezelRing.rotation.x = Math.PI / 2;
  outerBezelRing.position.y = 1.03;
  root.add(outerBezelRing);

  const innerBezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.015, 10, 48), polishedBrassMat);
  innerBezelRing.rotation.x = Math.PI / 2;
  innerBezelRing.position.y = 1.032;
  root.add(innerBezelRing);

  // Deep recessed dark-brass clockwork well inside the zodiac ring
  const clockworkWell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.455, 0.455, 0.015, 36),
    new THREE.MeshStandardMaterial({ color: '#171109', roughness: 0.5, metalness: 0.65 })
  );
  clockworkWell.position.y = 1.02;
  root.add(clockworkWell);

  // ============================================================================
  // 2. OPEN BRONZE CLOCKWORK GALLERY CAGE & INTERLOCKING SPINNING GEARS
  // ============================================================================
  // 8 gracefully curved bronze scroll struts rising from r=0.46 to support the open gallery rim
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.46, 1.03, Math.sin(a) * 0.46),
      new THREE.Vector3(Math.cos(a) * 0.51, 1.15, Math.sin(a) * 0.51),
      new THREE.Vector3(Math.cos(a) * 0.41, 1.28, Math.sin(a) * 0.41),
      new THREE.Vector3(Math.cos(a) * 0.44, 1.36, Math.sin(a) * 0.44),
    ]);
    const strut = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 8, false), antiqueBronzeMat);
    root.add(strut);
  }

  const galleryTopRing = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.012, 10, 48), polishedBrassMat);
  galleryTopRing.rotation.x = Math.PI / 2;
  galleryTopRing.position.y = 1.36;
  root.add(galleryTopRing);

  // Central concentric vertical drive column
  const centerSpindle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.056, 0.072, 0.56, 24),
    antiqueBronzeMat
  );
  centerSpindle.position.y = 1.3;
  root.add(centerSpindle);

  // Exposed Interlocking Clockwork Gear Train spinning visibly inside the open gallery!
  const animatedGears: Array<{ mesh: THREE.Object3D; speed: number; axis: 'y' | 'z' }> = [];

  const gearSpecs: Array<{
    teeth: number;
    rIn: number;
    rOut: number;
    x: number;
    y: number;
    z: number;
    speed: number;
    spokes: number;
  }> = [
    { teeth: 28, rIn: 0.24, rOut: 0.268, x: 0, y: 1.08, z: 0, speed: 0.45, spokes: 6 },
    { teeth: 20, rIn: 0.16, rOut: 0.184, x: 0, y: 1.16, z: 0, speed: -0.75, spokes: 5 },
    { teeth: 16, rIn: 0.12, rOut: 0.142, x: 0, y: 1.24, z: 0, speed: 1.1, spokes: 4 },
    { teeth: 14, rIn: 0.09, rOut: 0.11, x: -0.26, y: 1.08, z: 0.18, speed: -0.9, spokes: 4 },
    { teeth: 12, rIn: 0.078, rOut: 0.096, x: 0.26, y: 1.08, z: -0.18, speed: -1.05, spokes: 3 },
    { teeth: 14, rIn: 0.088, rOut: 0.106, x: -0.22, y: 1.16, z: -0.2, speed: 0.95, spokes: 4 },
  ];

  for (const g of gearSpecs) {
    const geo = createExtrudedGearGeometry(g.teeth, g.rIn, g.rOut, 0.024, 0.016, g.spokes);
    geo.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, g.speed > 0 ? polishedBrassMat : antiqueBronzeMat);
    mesh.position.set(g.x, g.y, g.z);
    root.add(mesh);
    animatedGears.push({ mesh, speed: g.speed, axis: 'y' });
  }

  // --- EXPOSED BRASS SPINDLE SOCKET ('orrery_gear_slot') on front South-East edge ---
  const gearSlotGroup = new THREE.Group();
  gearSlotGroup.position.set(0.24, 1.15, 0.36);
  root.add(gearSlotGroup);

  const slotCollarMat = polishedBrassMat.clone();
  const slotPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.074, 0.24, 18), antiqueBronzeMat);
  slotPedestal.position.y = -0.02;
  gearSlotGroup.add(slotPedestal);

  const slotBushing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.013, 10, 24), slotCollarMat);
  slotBushing.rotation.x = Math.PI / 2;
  slotBushing.position.y = 0.098;
  gearSlotGroup.add(slotBushing);

  // Protruding machined steel drive spindle pin waiting for the Saturn Brass Gear!
  const spindlePin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.115, 14), steelMat);
  spindlePin.position.y = 0.145;
  gearSlotGroup.add(spindlePin);

  // Subtle glowing amber indicator ring while gear is missing so players notice the empty socket!
  const missingSocketHaloMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffcf70'),
    emissive: new THREE.Color('#ffaa2b'),
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: 0.72,
    roughness: 0.2,
  });
  const missingSocketHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.094, 0.0065, 8, 28),
    missingSocketHaloMat
  );
  missingSocketHalo.rotation.x = Math.PI / 2;
  missingSocketHalo.position.y = 0.132;
  gearSlotGroup.add(missingSocketHalo);

  // Installed Saturn Brass Gear mesh (snaps onto spindle when orreryGearInstalled === true!)
  const installedSaturnGear = new THREE.Group();
  installedSaturnGear.position.y = 0.125;
  installedSaturnGear.visible = false;
  gearSlotGroup.add(installedSaturnGear);

  const saturnGearGeo = createExtrudedGearGeometry(18, 0.088, 0.112, 0.022, 0.02, 4);
  saturnGearGeo.rotateX(Math.PI / 2);
  const saturnGearMesh = new THREE.Mesh(saturnGearGeo, polishedBrassMat);
  installedSaturnGear.add(saturnGearMesh);
  const saturnCapRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 8, 24), polishedBrassMat);
  saturnCapRing.rotation.x = Math.PI / 2;
  saturnCapRing.position.y = 0.014;
  installedSaturnGear.add(saturnCapRing);

  // ============================================================================
  // 3. CENTRAL RADIANT BRASS SUN SPHERE + ARTICULATED IRIS PETALS + OBSIDIAN KEY
  // ============================================================================
  const sunCenterY = 1.62;
  const sunGroup = new THREE.Group();
  sunGroup.position.set(0, sunCenterY, 0);
  root.add(sunGroup);

  // Molten incandescent solar core (controlled bloom so Obsidian Star Key stays razor-sharp)
  const sunCoreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe086'),
    emissive: new THREE.Color('#ffa224'),
    emissiveIntensity: 1.95,
    roughness: 0.2,
    metalness: 0.08,
  });
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.118, 28, 20), sunCoreMat);
  sunGroup.add(sunCore);

  // Warm golden Sun PointLight illuminating the Orrery planets, brass clockwork & marble floor
  const sunLight = new THREE.PointLight('#ffbd5c', 2.4, 7.5, 1.7);
  sunGroup.add(sunLight);

  // Ornamental equatorial brass collar around the sun's lower cup
  const sunBaseCup = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.012, 10, 32), polishedBrassMat);
  sunBaseCup.rotation.x = Math.PI / 2;
  sunBaseCup.position.y = -0.055;
  sunGroup.add(sunBaseCup);

  // 8 Articulated Curved Brass Iris Petals enclosing the sun (bloom open 74° on solve!)
  const petalPivots: THREE.Group[] = [];
  const petalGeo = new THREE.SphereGeometry(
    0.146,
    12,
    12,
    -Math.PI / 10,
    Math.PI / 5,
    0.16,
    Math.PI * 0.62
  );
  const petalMat = polishedBrassMat.clone();
  petalMat.side = THREE.DoubleSide;

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.rotation.y = a;
    sunGroup.add(holder);

    const hinge = new THREE.Group();
    hinge.position.set(0, -0.072, 0.122);
    holder.add(hinge);

    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(0, 0.072, -0.122);
    petal.rotation.y = Math.PI / 2; // Align spherical patch toward +Z
    hinge.add(petal);

    // Subtle filigree brass rib along outside of each petal
    const petalFin = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.014), antiqueBronzeMat);
    petalFin.position.set(0, 0.09, 0.025);
    petalFin.rotation.x = -0.25;
    hinge.add(petalFin);

    petalPivots.push(hinge);
  }

  // Telescopic Brass Piston + Obsidian Star Key rising out of the Sun core on solve!
  const keyPistonGroup = new THREE.Group();
  keyPistonGroup.position.set(0, sunCenterY - 0.02, 0);
  root.add(keyPistonGroup);

  const pistonRod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.34, 12), polishedBrassMat);
  pistonRod.position.y = -0.16;
  keyPistonGroup.add(pistonRod);

  const obsidianMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0e14'),
    emissive: new THREE.Color('#251936'),
    emissiveIntensity: 0.45,
    roughness: 0.08,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const keyGoldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffd66b'),
    emissive: new THREE.Color('#ffaa22'),
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.95,
  });

  const obsidianKeyPickup = createObsidianStarKeyMesh(obsidianMat, keyGoldMat);
  obsidianKeyPickup.position.y = 0.06;
  keyPistonGroup.add(obsidianKeyPickup);

  const keyBeaconLight = new THREE.PointLight('#ffd27a', 0, 1.8, 2);
  keyBeaconLight.position.y = 0.12;
  keyPistonGroup.add(keyBeaconLight);

  // ============================================================================
  // 4. FAST INNER DECORATIVE PLANETS (MERCURY & VENUS)
  // ============================================================================
  const mercuryPivot = new THREE.Group();
  mercuryPivot.position.y = 1.44;
  root.add(mercuryPivot);
  const mercArm = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 8), polishedBrassMat);
  mercArm.rotation.x = Math.PI / 2;
  mercArm.position.z = -0.11;
  mercuryPivot.add(mercArm);
  const mercStem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.11, 8), polishedBrassMat);
  mercStem.position.set(0, 0.055, -0.22);
  mercuryPivot.add(mercStem);
  const mercurySphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#9c9288', roughness: 0.45, metalness: 0.35 })
  );
  mercurySphere.position.set(0, 0.12, -0.22);
  mercuryPivot.add(mercurySphere);

  const venusPivot = new THREE.Group();
  venusPivot.position.y = 1.4;
  root.add(venusPivot);
  const venArm = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.31, 8), polishedBrassMat);
  venArm.rotation.x = Math.PI / 2;
  venArm.position.z = -0.155;
  venusPivot.add(venArm);
  const venStem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.15, 8), polishedBrassMat);
  venStem.position.set(0, 0.075, -0.31);
  venusPivot.add(venStem);
  const venusSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.036, 18, 14),
    new THREE.MeshStandardMaterial({ color: '#e6c996', roughness: 0.38, metalness: 0.15 })
  );
  venusSphere.position.set(0, 0.16, -0.31);
  venusPivot.add(venusSphere);

  // ============================================================================
  // 5. THREE INTERACTIVE CONCENTRIC PLANETARY RINGS (EARTH, MARS, SATURN)
  // Pointer arms lie along local -Z so rotation.y = -houseIndex * (PI/6) points
  // directly at the matching Zodiac House on textures.zodiacRing!
  // ============================================================================
  interface PlanetRingRig {
    pivot: THREE.Group;
    planetMesh: THREE.Object3D;
    currentAngle: number;
  }

  function createInteractivePlanetRing(options: {
    ringRadius: number;
    ringY: number;
    planetY: number;
    accentColor: string;
    planetObject: THREE.Object3D;
  }): { pivot: THREE.Group; collarHandle: THREE.Group } {
    const pivot = new THREE.Group();
    pivot.position.y = options.ringY;
    root.add(pivot);

    // Unique brass material per ring so hover highlights ONLY the hovered planet's ring!
    const ringBrassMat = polishedBrassMat.clone();
    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(options.accentColor),
      emissive: new THREE.Color(options.accentColor),
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.4,
    });

    // Machined horizontal brass orbital track ring
    const track = new THREE.Mesh(
      new THREE.TorusGeometry(options.ringRadius, 0.011, 10, 64),
      ringBrassMat
    );
    track.rotation.x = Math.PI / 2;
    pivot.add(track);

    // Radial brass arm connecting central sleeve to planet at local -Z
    const radialArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.014, options.ringRadius),
      ringBrassMat
    );
    radialArm.position.set(0, 0, -options.ringRadius / 2);
    pivot.add(radialArm);

    // Clickable adjustment collar + vertical stanchion + zodiac pointer needle
    const collarHandle = new THREE.Group();
    pivot.add(collarHandle);

    // Knurled brass adjustment sleeve at planet mount
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.04, 18), ringBrassMat);
    collar.position.set(0, 0.01, -options.ringRadius);
    collarHandle.add(collar);

    const gemStud = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), accentMat);
    gemStud.position.set(0, 0.034, -options.ringRadius);
    collarHandle.add(gemStud);

    // Tapered vertical stanchion holding the planet globe aloft
    const stemH = options.planetY - options.ringY;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, stemH, 12), ringBrassMat);
    stem.position.set(0, stemH / 2, -options.ringRadius);
    collarHandle.add(stem);

    // Sleek downward-sloping brass Zodiac Pointer Needle extending out to r = 0.78m over the Zodiac Bezel!
    const pointerTargetZ = -0.78;
    const pointerLen = Math.max(0.05, Math.abs(pointerTargetZ) - options.ringRadius);
    const pointerBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.008, pointerLen),
      ringBrassMat
    );
    pointerBar.position.set(0, -0.02, -(options.ringRadius + pointerLen / 2));
    collarHandle.add(pointerBar);

    const dropH = options.ringY - 1.055;
    const dropNeedle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, dropH, 8), ringBrassMat);
    dropNeedle.position.set(0, -0.02 - dropH / 2, pointerTargetZ);
    collarHandle.add(dropNeedle);

    // Sharp downward triangular pointer tip hovering right over the Zodiac sign!
    const pointerTip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.042, 4), accentMat);
    pointerTip.rotation.x = Math.PI;
    pointerTip.position.set(0, -(options.ringY - 1.05), pointerTargetZ);
    collarHandle.add(pointerTip);

    // Attach planet sphere at top of stanchion
    options.planetObject.position.set(0, stemH, -options.ringRadius);
    pivot.add(options.planetObject);

    return { pivot, collarHandle };
  }

  // --- EARTH (+ tiny orbiting silver Moon) ---
  const earthGroup = new THREE.Group();
  const earthGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.056, 28, 20),
    new THREE.MeshStandardMaterial({
      map: createEarthTexture(),
      roughness: 0.42,
      metalness: 0.08,
    })
  );
  earthGlobe.rotation.z = 0.41; // 23.5 deg axial tilt
  earthGroup.add(earthGlobe);

  const moonOrbit = new THREE.Group();
  earthGroup.add(moonOrbit);
  const moonWire = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.095, 6), polishedBrassMat);
  moonWire.rotation.z = Math.PI / 2;
  moonWire.position.x = 0.048;
  moonOrbit.add(moonWire);
  const moonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 14, 12),
    new THREE.MeshStandardMaterial({ color: '#dce2ec', roughness: 0.55, metalness: 0.2 })
  );
  moonSphere.position.set(0.095, 0.012, 0);
  moonOrbit.add(moonSphere);

  const earthRigBuilt = createInteractivePlanetRing({
    ringRadius: 0.45,
    ringY: 1.34,
    planetY: 1.62,
    accentColor: '#3aa3ff',
    planetObject: earthGroup,
  });

  // --- MARS ---
  const marsGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.046, 26, 18),
    new THREE.MeshStandardMaterial({
      map: createMarsTexture(),
      roughness: 0.62,
      metalness: 0.06,
    })
  );
  const marsRigBuilt = createInteractivePlanetRing({
    ringRadius: 0.58,
    ringY: 1.26,
    planetY: 1.56,
    accentColor: '#e85a38',
    planetObject: marsGlobe,
  });

  // --- SATURN (golden banded gas giant + tilted translucent concentric rings!) ---
  const saturnGroup = new THREE.Group();
  const saturnGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.074, 28, 20),
    new THREE.MeshStandardMaterial({
      map: createSaturnTexture(),
      roughness: 0.46,
      metalness: 0.1,
    })
  );
  saturnGroup.add(saturnGlobe);

  const saturnRingsMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.096, 0.175, 48),
    new THREE.MeshStandardMaterial({
      map: createSaturnRingTexture(),
      transparent: true,
      opacity: 0.92,
      roughness: 0.35,
      metalness: 0.22,
      side: THREE.DoubleSide,
    })
  );
  saturnRingsMesh.rotation.x = Math.PI / 2 - 0.46; // Iconic 26.7° ring tilt!
  saturnRingsMesh.rotation.y = 0.25;
  saturnGroup.add(saturnRingsMesh);

  const saturnRigBuilt = createInteractivePlanetRing({
    ringRadius: 0.72,
    ringY: 1.18,
    planetY: 1.64,
    accentColor: '#f2c14e',
    planetObject: saturnGroup,
  });

  const planetRigs: Record<'earth' | 'mars' | 'saturn', PlanetRingRig> = {
    earth: { pivot: earthRigBuilt.pivot, planetMesh: earthGlobe, currentAngle: -3 * (Math.PI / 6) },
    mars: { pivot: marsRigBuilt.pivot, planetMesh: marsGlobe, currentAngle: -8 * (Math.PI / 6) },
    saturn: { pivot: saturnRigBuilt.pivot, planetMesh: saturnGroup, currentAngle: -1 * (Math.PI / 6) },
  };
  planetRigs.earth.pivot.rotation.y = planetRigs.earth.currentAngle;
  planetRigs.mars.pivot.rotation.y = planetRigs.mars.currentAngle;
  planetRigs.saturn.pivot.rotation.y = planetRigs.saturn.currentAngle;

  // Unified invisible bounding cylinder covering full Orrery pedestal, rings, planets & sun
  // (stops at y = 1.78 so the risen Obsidian Star Key above y = 1.88 remains clickable outside Focus Mode!)
  const orreryHitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.96, 0.96, 1.78, 24),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  orreryHitbox.position.y = 0.89;
  orreryHitbox.userData.interactableId = 'orrery_pedestal';
  root.add(orreryHitbox);

  enableShadows(root, true, true);
  sunCore.castShadow = false;
  saturnRingsMesh.castShadow = false;
  missingSocketHalo.castShadow = false;
  orreryHitbox.castShadow = false;
  orreryHitbox.receiveShadow = false;

  // ============================================================================
  // FOCUS TARGET, INTERACTABLES & COLLIDERS
  // ============================================================================
  const orreryFocus: FocusTarget = {
    id: 'orrery',
    label: 'The Grand Celestial Orrery',
    position: new THREE.Vector3(0, 2.32, 1.82),
    lookAt: new THREE.Vector3(0, 1.22, 0),
  };

  const checkOrrerySolved = (ctx: Parameters<Interactable['onInteract']>[0]): void => {
    const snap = ctx.state.get();
    const sol = snap.puzzleConfig.orrerySolution;
    if (
      snap.orreryGearInstalled &&
      snap.orreryAngles.earth === sol.earth &&
      snap.orreryAngles.mars === sol.mars &&
      snap.orreryAngles.saturn === sol.saturn
    ) {
      ctx.state.markSolved('orrery');
      ctx.audio.playPuzzleSolved();
      ctx.ui.showToast(
        'The Great Conjunction aligns! The Sun core blooms open, revealing the Obsidian Star Key!',
        5200
      );
    }
  };

  const makePlanetInteractable = (
    planet: 'earth' | 'mars' | 'saturn',
    displayName: string,
    object: THREE.Object3D
  ): Interactable => ({
    id: `orrery_ring_${planet}`,
    object,
    stationId: 'orrery',
    focusOnly: true,
    cursor: 'grab',
    label: `${displayName} Ring`,
    getLabel: (s) => {
      const idx = s.orreryAngles[planet];
      if (planet === 'saturn' && !s.orreryGearInstalled) {
        return `Saturn Ring (Disengaged — ${ZODIAC_NAMES[idx]})`;
      }
      return `${displayName} Ring — ${ZODIAC_NAMES[idx]} (${idx * 30}°)`;
    },
    getHint: (s) => {
      if (s.solved.orrery) return 'Great Conjunction aligned';
      if (planet === 'saturn' && !s.orreryGearInstalled) {
        return 'Missing drive gear on the empty foreground spindle';
      }
      if (s.puzzleConfig.orreryCoupled) {
        if (planet === 'saturn') return 'Coupled gear: +1 Saturn, +2 Mars';
        if (planet === 'mars') return 'Coupled gear: +1 Mars, +1 Earth';
        return 'Free gear: +1 Earth';
      }
      return 'Click to rotate +30° (1 Zodiac House)';
    },
    focusTarget: orreryFocus,
    onInteract: (ctx) => {
      const snap = ctx.state.get();
      if (snap.solved.orrery) {
        ctx.audio.playClick();
        ctx.ui.showToast('The Great Conjunction is already aligned.');
        return;
      }
      if (planet === 'saturn' && !snap.orreryGearInstalled) {
        ctx.audio.playError();
        ctx.ui.showToast(
          'Saturn’s drive ring is disengaged — equip the missing brass gear and fit it onto the exposed spindle.',
          3600
        );
        return;
      }
      const coupled = snap.puzzleConfig.orreryCoupled;
      const next = applyOrreryRingClick(snap.orreryAngles, planet, coupled);
      ctx.state.update((d) => {
        d.orreryAngles = next;
      });
      ctx.audio.playBrassGear();
      if (coupled && planet === 'saturn') {
        ctx.ui.showToast(
          `Saturn → ${ZODIAC_NAMES[next.saturn].toUpperCase()} (${next.saturn * 30}°) · Coupled Mars → ${ZODIAC_NAMES[next.mars].toUpperCase()}`,
          2400
        );
      } else if (coupled && planet === 'mars') {
        ctx.ui.showToast(
          `Mars → ${ZODIAC_NAMES[next.mars].toUpperCase()} (${next.mars * 30}°) · Coupled Earth → ${ZODIAC_NAMES[next.earth].toUpperCase()}`,
          2400
        );
      } else {
        ctx.ui.showToast(
          `${displayName} aligned to ${ZODIAC_NAMES[next[planet]].toUpperCase()} (${next[planet] * 30}°)`,
          2000
        );
      }
      checkOrrerySolved(ctx);
    },
  });

  const interactables: Interactable[] = [
    {
      id: 'orrery_pedestal',
      object: pedBody,
      stationId: 'orrery',
      cursor: 'inspect',
      label: 'The Grand Celestial Orrery',
      getLabel: () => 'The Grand Celestial Orrery',
      getHint: () => 'Click to step in & inspect',
      focusTarget: orreryFocus,
      onInteract: (ctx) => {
        ctx.audio.playClick();
        ctx.focusOn(orreryFocus);
      },
    },
    {
      id: 'orrery_gear_slot',
      object: gearSlotGroup,
      stationId: 'orrery',
      focusOnly: true,
      cursor: 'pointer',
      label: 'Empty Brass Gear Spindle Socket',
      getLabel: (s) =>
        s.orreryGearInstalled
          ? 'Saturn Drive Gear (Engaged)'
          : 'Empty Brass Gear Spindle Socket',
      getHint: (s) => {
        if (s.orreryGearInstalled) return 'Clockwork train engaged';
        if (s.selectedItem === 'saturn_gear') return 'Click to seat Saturn Brass Gear';
        return 'Select the right artifact from your tray to fit';
      },
      focusTarget: orreryFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (snap.orreryGearInstalled) {
          ctx.audio.playClick();
          ctx.ui.showToast('The Saturn Brass Gear is meshed cleanly with the clockwork.');
          return;
        }
        if (snap.selectedItem === 'saturn_gear') {
          ctx.state.placeItem('saturn_gear');
          ctx.state.update((d) => {
            d.orreryGearInstalled = true;
          });
          ctx.audio.playHeavyLatch();
          ctx.ui.showToast(
            'Saturn Brass Gear engaged! Align Earth, Mars & Saturn to the Great Conjunction.',
            4400
          );
          checkOrrerySolved(ctx);
          if (ctx.getFocusedStation() !== orreryFocus.id) {
            ctx.focusOn(orreryFocus);
          }
        } else if (snap.selectedItem !== null) {
          ctx.audio.playError();
          ctx.ui.showToast("That artifact doesn't fit this mechanism.");
        } else {
          ctx.audio.playClick();
          ctx.ui.showToast(
            'An exposed brass drive spindle — equip the right artifact from your tray below to seat it here.',
            3600
          );
        }
      },
    },
    makePlanetInteractable('earth', 'Earth', earthRigBuilt.pivot),
    makePlanetInteractable('mars', 'Mars', marsRigBuilt.pivot),
    makePlanetInteractable('saturn', 'Saturn', saturnRigBuilt.pivot),
    {
      id: 'pickup_obsidian_key',
      object: obsidianKeyPickup,
      stationId: 'orrery',
      focusOnly: false,
      cursor: 'pointer',
      label: 'Obsidian Star Key',
      hint: 'Click to collect',
      enabled: (s) =>
        s.solved.orrery &&
        !s.inventory.includes('obsidian_key') &&
        !s.placedItems.includes('obsidian_key') &&
        !s.doorKeyInserted,
      focusTarget: orreryFocus,
      onInteract: (ctx) => {
        ctx.state.addItem('obsidian_key');
        ctx.audio.playPickup();
        ctx.ui.showToast(
          'Collected Obsidian Star Key — forged for the Astrolabe Exit Door!',
          4500
        );
      },
    },
  ];

  const colliders: ColliderBox[] = [
    { minX: -1.04, maxX: 1.04, minZ: -1.04, maxZ: 1.04, label: 'Central Orrery Pedestal' },
  ];

  // Smooth animation state
  let currentPetalOpen = 0;
  let currentKeyLift = 0;
  let gearSpeedBoost = 1;

  const update = (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>): void => {
    const smooth = 1 - Math.exp(-6.5 * delta);

    // Accelerate clockwork gears smoothly when solved!
    const targetBoost = state.solved.orrery ? 3.2 : 1.0;
    gearSpeedBoost += (targetBoost - gearSpeedBoost) * (1 - Math.exp(-2.5 * delta));

    for (const g of animatedGears) {
      g.mesh.rotation.y += g.speed * gearSpeedBoost * delta;
    }

    // Installed Saturn Gear & empty socket halo
    installedSaturnGear.visible = state.orreryGearInstalled;
    missingSocketHalo.visible = !state.orreryGearInstalled;
    if (state.orreryGearInstalled) {
      installedSaturnGear.rotation.y -= 0.9 * gearSpeedBoost * delta;
    } else {
      missingSocketHaloMat.emissiveIntensity = 0.85 + Math.sin(elapsed * 3.4) * 0.45;
      missingSocketHalo.scale.setScalar(1 + Math.sin(elapsed * 3.4) * 0.06);
    }

    // Fast decorative inner Mercury & Venus orbits + planet axial spin
    mercuryPivot.rotation.y = elapsed * 0.85 * (state.solved.orrery ? 1.6 : 1.0);
    venusPivot.rotation.y = elapsed * 0.52 * (state.solved.orrery ? 1.6 : 1.0);
    earthGlobe.rotation.y = elapsed * 0.35;
    moonOrbit.rotation.y = elapsed * 1.45;
    marsGlobe.rotation.y = elapsed * 0.28;
    saturnGlobe.rotation.y = elapsed * 0.22;

    // Smoothly rotate Earth, Mars & Saturn rings to their target Zodiac house!
    (['earth', 'mars', 'saturn'] as const).forEach((p) => {
      const rig = planetRigs[p];
      const targetAngle = -state.orreryAngles[p] * (Math.PI / 6);
      let diff = targetAngle - rig.currentAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      rig.currentAngle += diff * smooth;
      rig.pivot.rotation.y = rig.currentAngle;
    });

    // Radiant Sun core pulse & articulated brass iris petals blooming open on solve
    // Softened ~18% when solved so the rising Obsidian Star Key reads crisply in high contrast
    sunCoreMat.emissiveIntensity = state.solved.orrery
      ? 2.15 + Math.sin(elapsed * 3.6) * 0.22
      : 1.95 + Math.sin(elapsed * 2.2) * 0.14;
    sunLight.intensity = state.solved.orrery
      ? 2.45 + Math.sin(elapsed * 3.6) * 0.16
      : 2.1 + Math.sin(elapsed * 2.2) * 0.1;

    const targetOpen = state.solved.orrery ? THREE.MathUtils.degToRad(74) : 0;
    currentPetalOpen += (targetOpen - currentPetalOpen) * (1 - Math.exp(-3.4 * delta));
    for (const pivot of petalPivots) {
      pivot.rotation.x = currentPetalOpen;
    }

    // Telescopic piston rises Obsidian Star Key smoothly out of the blooming Sun core!
    const showKey =
      state.solved.orrery &&
      !state.inventory.includes('obsidian_key') &&
      !state.doorKeyInserted;
    const targetLift = state.solved.orrery ? 0.28 : 0;
    currentKeyLift += (targetLift - currentKeyLift) * (1 - Math.exp(-2.8 * delta));
    keyPistonGroup.position.y = sunCenterY - 0.02 + currentKeyLift;
    keyPistonGroup.visible = currentKeyLift > 0.02;
    obsidianKeyPickup.visible = showKey;

    if (showKey) {
      obsidianKeyPickup.rotation.y = elapsed * 1.1;
      keyBeaconLight.intensity = 1.1 + Math.sin(elapsed * 3.5) * 0.25;
    } else {
      keyBeaconLight.intensity = 0;
    }
  };

  return { group: root, interactables, colliders, update };
}
