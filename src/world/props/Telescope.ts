import * as THREE from 'three';
import {
  TELESCOPE_DEC_STEPS,
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

function createSettingCircleTexture(
  title: string,
  labels: string[],
  highlightIndex: number
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Brushed antique brass disc gradient
  const grad = ctx.createRadialGradient(cx, cy, 24, cx, cy, size / 2);
  grad.addColorStop(0, '#c49642');
  grad.addColorStop(0.55, '#dfc072');
  grad.addColorStop(0.86, '#9c7129');
  grad.addColorStop(1, '#5c3f14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Dark enameled graduation track
  ctx.strokeStyle = '#18130d';
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.arc(cx, cy, 200, 0, Math.PI * 2);
  ctx.stroke();

  // Concentric hairline brass rings
  for (const r of [226, 174, 130, 62]) {
    ctx.strokeStyle = '#e5c678';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Fine 1-degree & major engraved vernier ticks
  for (let i = 0; i < 144; i++) {
    const a = (i / 144) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % (144 / labels.length) === 0;
    const isMid = i % 6 === 0;
    const r0 = isMajor ? 172 : isMid ? 184 : 194;
    const r1 = 224;
    ctx.strokeStyle = isMajor ? '#fff2bd' : isMid ? '#ebd082' : 'rgba(232, 200, 128, 0.58)';
    ctx.lineWidth = isMajor ? 3.2 : isMid ? 2.0 : 1.1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Labels around track
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((lbl, idx) => {
    const a = (idx / labels.length) * Math.PI * 2 - Math.PI / 2;
    const rx = cx + Math.cos(a) * 199;
    const ry = cy + Math.sin(a) * 199;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = idx === highlightIndex ? '#ffe89c' : '#e6ca83';
    ctx.font = 'bold 20px Georgia, serif';
    ctx.fillText(lbl, 0, 0);
    ctx.restore();
  });

  // Engraved center label
  ctx.fillStyle = '#24180a';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(title, cx, cy - 12);
  ctx.font = '600 16px Georgia, serif';
  ctx.fillText('VERNIER SCALE', cx, cy + 18);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function createNameplateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1c150c';
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#d9b25f';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 140);
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 472, 120);

  ctx.fillStyle = '#f2d388';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('VANCE & SONS · LONDON', 256, 62);
  ctx.font = '600 22px Georgia, serif';
  ctx.fillStyle = '#cfa957';
  ctx.fillText('GREAT EQUATORIAL REFRACTOR · 1898', 256, 108);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createSpokedHandwheel(
  radius: number,
  brassMat: THREE.Material,
  ivoryMat: THREE.Material
): THREE.Group {
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.11, 12, 32), brassMat);
  wheel.add(rim);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.24, radius * 0.28, radius * 0.28, 16),
    brassMat
  );
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.055, radius * 0.075, radius * 1.85, 8),
      brassMat
    );
    spoke.rotation.z = a;
    wheel.add(spoke);
  }

  // Turned ivory crank handle on outer rim
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.09, radius * 0.11, radius * 0.55, 12),
    ivoryMat
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(radius * 0.88, 0, radius * 0.34);
  wheel.add(handle);

  return wheel;
}

export function buildTelescope(textures: TextureBundle): PropModuleResult {
  const root = new THREE.Group();
  root.name = 'GreatTelescopeStation';
  root.position.set(0, 0, -4.65);

  // Materials
  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stonePlinth.map,
    bumpMap: textures.stonePlinth.bumpMap,
    bumpScale: 0.018,
    roughnessMap: textures.stonePlinth.roughnessMap,
    color: new THREE.Color('#343844'),
    roughness: 0.72,
    metalness: 0.08,
  });

  const ironMat = new THREE.MeshStandardMaterial({
    map: textures.darkIron.map,
    bumpMap: textures.darkIron.bumpMap,
    bumpScale: 0.016,
    roughnessMap: textures.darkIron.roughnessMap,
    color: new THREE.Color('#3b4454'),
    roughness: 0.36,
    metalness: 0.72,
    envMapIntensity: 1.18,
  });

  const polishedBrassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.006,
    roughnessMap: textures.brass.roughnessMap,
    color: new THREE.Color('#e2bc68'),
    roughness: 0.22,
    metalness: 0.92,
  });

  const agedBrassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.01,
    color: new THREE.Color('#ad8438'),
    roughness: 0.36,
    metalness: 0.86,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#a8b0bc'),
    roughness: 0.24,
    metalness: 0.92,
  });

  const ivoryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#efe4ca'),
    roughness: 0.35,
    metalness: 0.04,
  });

  const interiorDarkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#06070a'),
    roughness: 0.92,
    metalness: 0.05,
  });

  // ============================================================================
  // 1. STEPPED CIRCULAR BASALT & BRASS-RIMMED PLINTH (r = 1.35m, h = 0.24m)
  // ============================================================================
  const plinthStep1 = new THREE.Mesh(new THREE.CylinderGeometry(1.33, 1.37, 0.12, 32), stoneMat);
  plinthStep1.position.y = 0.06;
  root.add(plinthStep1);

  const plinthBrass1 = new THREE.Mesh(new THREE.TorusGeometry(1.345, 0.018, 10, 48), agedBrassMat);
  plinthBrass1.rotation.x = Math.PI / 2;
  plinthBrass1.position.y = 0.12;
  root.add(plinthBrass1);

  const plinthStep2 = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.18, 0.12, 32), stoneMat);
  plinthStep2.position.y = 0.18;
  root.add(plinthStep2);

  const plinthBrass2 = new THREE.Mesh(new THREE.TorusGeometry(1.145, 0.016, 10, 48), polishedBrassMat);
  plinthBrass2.rotation.x = Math.PI / 2;
  plinthBrass2.position.y = 0.24;
  root.add(plinthBrass2);

  // 12 heavy brass anchor bolts around the upper stone collar
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.032, 6), agedBrassMat);
    bolt.position.set(Math.cos(a) * 0.96, 0.252, Math.sin(a) * 0.96);
    root.add(bolt);
  }

  // ============================================================================
  // 2. FLUTED CAST-IRON EQUATORIAL PIER (y = 0.24 to 1.62)
  // ============================================================================
  const pierPts = [
    new THREE.Vector2(0.001, 0.24),
    new THREE.Vector2(0.56, 0.24),
    new THREE.Vector2(0.54, 0.31),
    new THREE.Vector2(0.42, 0.38),
    new THREE.Vector2(0.34, 0.48),
    new THREE.Vector2(0.28, 0.62),
    new THREE.Vector2(0.24, 1.24),
    new THREE.Vector2(0.29, 1.34),
    new THREE.Vector2(0.32, 1.44),
    new THREE.Vector2(0.27, 1.56),
    new THREE.Vector2(0.29, 1.62),
    new THREE.Vector2(0.001, 1.62),
  ];
  const pierMesh = new THREE.Mesh(new THREE.LatheGeometry(pierPts, 28), ironMat);
  root.add(pierMesh);

  // 12 vertical fluted iron ribs around pier shaft
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.72, 8), ironMat);
    rib.position.set(Math.cos(a) * 0.26, 0.94, Math.sin(a) * 0.26);
    root.add(rib);
  }

  // Crisp polished-brass collar bands & miniature rivet rings along the fluted pier
  const pierCollars: Array<{ y: number; r: number; rivets: number }> = [
    { y: 0.31, r: 0.545, rivets: 16 },
    { y: 0.49, r: 0.348, rivets: 12 },
    { y: 1.32, r: 0.296, rivets: 12 },
    { y: 1.59, r: 0.295, rivets: 12 },
  ];
  for (const col of pierCollars) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(col.r, 0.016, 10, 36),
      col.y > 0.4 ? polishedBrassMat : agedBrassMat
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = col.y;
    root.add(band);

    for (let r = 0; r < col.rivets; r++) {
      const a = (r / col.rivets) * Math.PI * 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), polishedBrassMat);
      stud.position.set(Math.cos(a) * (col.r + 0.01), col.y, Math.sin(a) * (col.r + 0.01));
      root.add(stud);
    }
  }

  // Brass Maker's Nameplate facing South (+Z) toward viewer
  const nameplate = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.11, 0.014),
    new THREE.MeshStandardMaterial({
      map: createNameplateTexture(),
      roughness: 0.34,
      metalness: 0.72,
    })
  );
  nameplate.position.set(0, 1.02, 0.278);
  root.add(nameplate);

  // ============================================================================
  // 3. GERMAN EQUATORIAL HEAD, SETTING CIRCLES & INTERACTIVE RA / DEC WHEELS
  // ============================================================================
  const eqHead = new THREE.Group();
  eqHead.position.set(0, 1.62, 0);
  root.add(eqHead);

  // Polar axis block angled toward North celestial pole
  const polarHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 20), ironMat);
  polarHousing.rotation.x = -0.45;
  polarHousing.position.set(0, 0.14, -0.02);
  eqHead.add(polarHousing);

  // Engraved Brass RA Setting Circle visible on the South side of the head
  const raDialTex = createSettingCircleTexture(
    'RA',
    ['00h', '01h', '02h', '03h', '04h', '05h', '06h', '07h', '08h', '09h', '10h', '11h'],
    4
  );
  const raCircleMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.23, 0.026, 36),
    [
      agedBrassMat,
      new THREE.MeshStandardMaterial({
        map: raDialTex,
        roughness: 0.44,
        metalness: 0.58,
        envMapIntensity: 0.42,
      }),
      agedBrassMat,
    ]
  );
  raCircleMesh.rotation.x = Math.PI / 2 - 0.45;
  raCircleMesh.position.set(0, 0.08, 0.16);
  eqHead.add(raCircleMesh);

  // Interactive RA Vernier Handwheel (mounted clearly on West/South-West side of pier head)
  const raWheelGroup = new THREE.Group();
  raWheelGroup.position.set(-0.34, 0.08, 0.16);
  raWheelGroup.rotation.y = -Math.PI / 4;
  eqHead.add(raWheelGroup);

  const raWheelBrassMat = polishedBrassMat.clone();
  const raShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 12), raWheelBrassMat);
  raShaft.rotation.x = Math.PI / 2;
  raShaft.position.z = -0.12;
  raWheelGroup.add(raShaft);

  const raSpokeWheel = createSpokedHandwheel(0.145, raWheelBrassMat, ivoryMat);
  raWheelGroup.add(raSpokeWheel);

  // Rotating RA Assembly (smoothly pans azimuthally around Y with telescopeRA)
  const raPivot = new THREE.Group();
  raPivot.position.set(0, 0.26, 0);
  eqHead.add(raPivot);

  // Fork / Declination Cross-Head
  const decCrossBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.26), ironMat);
  raPivot.add(decCrossBox);

  // Brass saddle collar
  const crossAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.72, 20), agedBrassMat);
  crossAxle.rotation.z = Math.PI / 2;
  raPivot.add(crossAxle);

  // Engraved DEC Setting Circle on the West side of declination axle
  const decDialTex = createSettingCircleTexture('DEC', ['0°', '15°', '30°', '45°', '60°', '75°'], 3);
  const decCircleMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.024, 36),
    [
      agedBrassMat,
      new THREE.MeshStandardMaterial({
        map: decDialTex,
        roughness: 0.44,
        metalness: 0.58,
        envMapIntensity: 0.42,
      }),
      agedBrassMat,
    ]
  );
  decCircleMesh.rotation.z = Math.PI / 2;
  decCircleMesh.position.set(-0.26, 0, 0);
  raPivot.add(decCircleMesh);

  // Interactive DEC Vernier Handwheel (mounted prominently on West side of declination axle!)
  const decWheelGroup = new THREE.Group();
  decWheelGroup.position.set(-0.44, 0, 0);
  decWheelGroup.rotation.y = -Math.PI / 2;
  raPivot.add(decWheelGroup);

  const decWheelBrassMat = polishedBrassMat.clone();
  const decSpokeWheel = createSpokedHandwheel(0.14, decWheelBrassMat, ivoryMat);
  decWheelGroup.add(decSpokeWheel);

  // Heavy Sliding Cast-Iron Counterweights on East side (+X) balancing the optical tube
  const cwShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.78, 14), steelMat);
  cwShaft.rotation.z = Math.PI / 2;
  cwShaft.position.set(0.56, 0, 0);
  raPivot.add(cwShaft);

  for (const cx of [0.54, 0.74]) {
    const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.11, 24), ironMat);
    weight.rotation.z = Math.PI / 2;
    weight.position.set(cx, 0, 0);
    raPivot.add(weight);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.146, 0.01, 8, 24), agedBrassMat);
    collar.rotation.y = Math.PI / 2;
    collar.position.set(cx, 0, 0);
    raPivot.add(collar);
  }
  const cwEndCap = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), polishedBrassMat);
  cwEndCap.position.set(0.95, 0, 0);
  raPivot.add(cwEndCap);

  // ============================================================================
  // 4. MONUMENTAL TAPERED POLISHED-BRASS OPTICAL TUBE (pivots around X by DEC!)
  // ============================================================================
  const decPivot = new THREE.Group();
  decPivot.position.set(0, 0.16, 0);
  raPivot.add(decPivot);

  // Heavy cast-iron & brass tube cradle saddle + twin clamping rings
  const cradleBlock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.56), ironMat);
  cradleBlock.position.set(0, -0.06, 0);
  decPivot.add(cradleBlock);

  for (const cz of [-0.2, 0.2]) {
    const clampRing = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.022, 12, 32), agedBrassMat);
    clampRing.position.set(0, 0.12, cz);
    decPivot.add(clampRing);
  }

  // Optical Tube center axis is at local y = 0.12, extending from z = +1.05 (eyepiece) to z = -1.55 (front lens)
  const tubeY = 0.12;

  // Main tapered polished-brass optical barrel (oriented along Z: -Z is front objective, +Z is eyepiece)
  const mainBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.172, 0.128, 2.32, 36, 1, false),
    polishedBrassMat
  );
  mainBarrel.rotation.x = -Math.PI / 2; // top (+Y -> front -Z, radius 0.172), bottom (-Y -> rear +Z, radius 0.128)
  mainBarrel.position.set(0, tubeY, -0.18);
  decPivot.add(mainBarrel);

  // 5 Machined Raised Brass Reinforcing Rings along tube
  const ringSpecs: Array<{ z: number; r: number }> = [
    { z: -1.18, r: 0.176 },
    { z: -0.68, r: 0.166 },
    { z: -0.16, r: 0.156 },
    { z: 0.38, r: 0.145 },
    { z: 0.92, r: 0.135 },
  ];
  for (const spec of ringSpecs) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.r, 0.013, 10, 32), agedBrassMat);
    ring.position.set(0, tubeY, spec.z);
    decPivot.add(ring);
  }

  // --- INTERACTABLE: OBJECTIVE LENS HOUSING ('telescope_lens_slot') ---
  // Includes the entire front objective cell, dew shield hood, and a generous clickable lens collar
  // so players can easily spot & click to install the Sapphire Objective Lens from any angle!
  const lensSlotGroup = new THREE.Group();
  lensSlotGroup.position.set(0, tubeY, -1.36);
  decPivot.add(lensSlotGroup);

  const lensHousingMat = polishedBrassMat.clone();
  const lensRimMat = agedBrassMat.clone();

  // Extended Front Dew Shield (hollow brass hood mounted directly on lensSlotGroup)
  const dewShield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.186, 0.18, 0.36, 36, 1, true),
    lensHousingMat
  );
  dewShield.rotation.x = -Math.PI / 2;
  dewShield.position.z = -0.12;
  lensSlotGroup.add(dewShield);

  const dewRim = new THREE.Mesh(new THREE.TorusGeometry(0.186, 0.012, 10, 32), lensRimMat);
  dewRim.position.z = -0.3;
  lensSlotGroup.add(dewRim);

  // Dark optical baffle interior behind objective cell
  const darkBaffle = new THREE.Mesh(new THREE.CircleGeometry(0.166, 32), interiorDarkMat);
  darkBaffle.rotation.y = Math.PI;
  darkBaffle.position.z = 0.02;
  lensSlotGroup.add(darkBaffle);

  const lensCellCollar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.026, 14, 36), lensHousingMat);
  lensSlotGroup.add(lensCellCollar);

  // 6 brass thumbscrews around objective cell rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.038, 10), lensHousingMat);
    screw.position.set(Math.cos(a) * 0.198, Math.sin(a) * 0.198, 0);
    screw.rotation.z = a - Math.PI / 2;
    lensSlotGroup.add(screw);
  }

  // Generous clickable brass objective access sleeve on front optical cell
  const cellSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.186, 0.34, 28, 1, true),
    lensHousingMat
  );
  cellSleeve.rotation.x = -Math.PI / 2;
  cellSleeve.position.z = 0.08;
  lensSlotGroup.add(cellSleeve);

  // Subtle pulsing warm-gold rim indicator while objective cell is empty so players clearly spot the socket
  const emptyLensGlowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffd478'),
    emissive: new THREE.Color('#ffae34'),
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.72,
    roughness: 0.25,
  });
  const emptyLensHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.168, 0.009, 10, 36),
    emptyLensGlowMat
  );
  emptyLensHalo.position.z = -0.025;
  lensSlotGroup.add(emptyLensHalo);

  // Installed Sapphire Objective Lens mesh (visible only when telescopeLensInstalled === true!)
  const installedSapphireMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2a8eff'),
    emissive: new THREE.Color('#2478ff'),
    emissiveIntensity: 1.25,
    roughness: 0.04,
    metalness: 0.08,
    transmission: 0.65,
    ior: 1.77,
    thickness: 0.06,
    clearcoat: 1.0,
  });
  const installedSapphireLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 28, 18),
    installedSapphireMat
  );
  installedSapphireLens.scale.set(1, 1, 0.22);
  installedSapphireLens.position.z = -0.02;
  installedSapphireLens.visible = false;
  lensSlotGroup.add(installedSapphireLens);

  const lensBlueGlow = new THREE.PointLight('#4ca8ff', 0.0, 2.2, 2);
  lensBlueGlow.position.set(0, 0, -0.18);
  lensSlotGroup.add(lensBlueGlow);

  // --- SIDE BRASS FINDER SCOPE ---
  const finderGroup = new THREE.Group();
  finderGroup.position.set(-0.22, tubeY + 0.16, -0.12);
  decPivot.add(finderGroup);

  const finderTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.026, 0.96, 18),
    polishedBrassMat
  );
  finderTube.rotation.x = -Math.PI / 2;
  finderGroup.add(finderTube);

  for (const fz of [-0.26, 0.24]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.16, 0.024), agedBrassMat);
    bracket.position.set(0.068, -0.052, fz);
    bracket.rotation.z = 0.94; // Points dead-flush along vector (+0.22, -0.16) into main brass barrel
    finderGroup.add(bracket);
    const fRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 8, 20), agedBrassMat);
    fRing.position.z = fz;
    finderGroup.add(fRing);
  }

  // --- GEARED RACK-AND-PINION FOCUSER & BRASS EYEPIECE ('telescope_eyepiece') ---
  const eyepieceGroup = new THREE.Group();
  eyepieceGroup.position.set(0, tubeY, 0.98);
  decPivot.add(eyepieceGroup);

  const eyepieceBrassMat = polishedBrassMat.clone();
  const rearEndCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.128, 0.072, 0.16, 28),
    eyepieceBrassMat
  );
  rearEndCap.rotation.x = Math.PI / 2;
  rearEndCap.position.z = 0.08;
  eyepieceGroup.add(rearEndCap);

  // Sliding brass focuser drawtube
  const drawtube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.048, 0.28, 24),
    eyepieceBrassMat
  );
  drawtube.rotation.x = Math.PI / 2;
  drawtube.position.z = 0.24;
  eyepieceGroup.add(drawtube);

  // Twin knurled brass focuser knobs on left & right of drawtube
  const focusShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 10), agedBrassMat);
  focusShaft.rotation.z = Math.PI / 2;
  focusShaft.position.set(0, -0.048, 0.2);
  eyepieceGroup.add(focusShaft);

  for (const fx of [-0.11, 0.11]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.024, 20), eyepieceBrassMat);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(fx, -0.048, 0.2);
    eyepieceGroup.add(knob);
  }

  // Tapered brass ocular eyepiece cup & dark coated ocular glass
  const ocularCup = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.046, 0.1, 22),
    eyepieceBrassMat
  );
  ocularCup.rotation.x = Math.PI / 2;
  ocularCup.position.z = 0.41;
  eyepieceGroup.add(ocularCup);

  const ocularGlass = new THREE.Mesh(
    new THREE.CircleGeometry(0.028, 20),
    new THREE.MeshPhysicalMaterial({
      color: '#1b3d7a',
      emissive: '#0c234d',
      emissiveIntensity: 0.4,
      roughness: 0.05,
      metalness: 0.2,
      clearcoat: 1.0,
    })
  );
  ocularGlass.position.z = 0.462;
  eyepieceGroup.add(ocularGlass);

  // Unified invisible bounding hitboxes so standing hover across the entire telescope never flickers
  const hitboxMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const pierHitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.25, 16), hitboxMat);
  pierHitbox.position.set(0, 1.32, -0.05);
  pierHitbox.userData.interactableId = 'telescope_body';
  root.add(pierHitbox);

  const tubeHitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 2.9, 16), hitboxMat);
  tubeHitbox.rotation.x = -Math.PI / 2;
  tubeHitbox.position.set(0, tubeY, -0.2);
  tubeHitbox.userData.interactableId = 'telescope_body';
  decPivot.add(tubeHitbox);

  enableShadows(root, true, true);
  installedSapphireLens.castShadow = false;
  emptyLensHalo.castShadow = false;
  pierHitbox.castShadow = false;
  pierHitbox.receiveShadow = false;
  tubeHitbox.castShadow = false;
  tubeHitbox.receiveShadow = false;

  // ============================================================================
  // FOCUS TARGET, INTERACTABLES & COLLIDERS
  // ============================================================================
  // Wide 3/4 framing so objective lens housing, RA/DEC vernier wheels, AND eyepiece are all comfortably clickable!
  const telescopeFocus: FocusTarget = {
    id: 'telescope',
    label: 'Great Equatorial Telescope',
    position: new THREE.Vector3(-1.92, 1.98, -2.73),
    lookAt: new THREE.Vector3(-0.04, 1.92, -4.7),
  };

  // Allow clicking the main brass optical barrel & equatorial housing as part of 'telescope_body'
  mainBarrel.userData.interactableId = 'telescope_body';
  polarHousing.userData.interactableId = 'telescope_body';
  decCrossBox.userData.interactableId = 'telescope_body';
  cradleBlock.userData.interactableId = 'telescope_body';

  const formatCoords = (ra: number, dec: number): string => {
    const raStr = String(ra).padStart(2, '0');
    return `RA ${raStr}h / DEC +${dec}°`;
  };

  const interactables: Interactable[] = [
    {
      id: 'telescope_body',
      object: pierMesh,
      stationId: 'telescope',
      cursor: 'inspect',
      label: 'Great Equatorial Telescope',
      getLabel: () => 'Great Equatorial Telescope',
      getHint: () => 'Click to step in & inspect',
      focusTarget: telescopeFocus,
      onInteract: (ctx) => {
        ctx.audio.playClick();
        ctx.focusOn(telescopeFocus);
      },
    },
    {
      id: 'telescope_lens_slot',
      object: lensSlotGroup,
      stationId: 'telescope',
      focusOnly: true,
      cursor: 'pointer',
      label: 'Empty Objective Lens Housing',
      getLabel: (s) =>
        s.telescopeLensInstalled
          ? 'Sapphire Objective Lens (Seated)'
          : 'Empty Objective Lens Housing',
      getHint: (s) => {
        if (s.telescopeLensInstalled) return 'Precision sapphire glass seated';
        if (s.selectedItem === 'sapphire_lens') return 'Click to seat Sapphire Objective Lens';
        return 'Select the right artifact from your tray to fit';
      },
      focusTarget: telescopeFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (snap.telescopeLensInstalled) {
          ctx.audio.playClick();
          ctx.ui.showToast('The Sapphire Objective Lens is firmly seated.');
          return;
        }
        if (snap.selectedItem === 'sapphire_lens') {
          ctx.state.placeItem('sapphire_lens');
          ctx.state.update((d) => {
            d.telescopeLensInstalled = true;
          });
          ctx.audio.playHeavyLatch();
          const msg =
            snap.puzzleConfig.difficulty === 'apprentice'
              ? 'Sapphire Objective Lens seated! Adjust RA 04h & DEC +45° and peer through the eyepiece.'
              : 'Sapphire Objective Lens seated! Deduce the RA & DEC coordinates from Dr. Vance’s Logbook, then peer through the eyepiece.';
          ctx.ui.showToast(msg, 4600);
          if (ctx.getFocusedStation() !== telescopeFocus.id) {
            ctx.focusOn(telescopeFocus);
          }
        } else if (snap.selectedItem !== null) {
          ctx.audio.playError();
          ctx.ui.showToast("That artifact doesn't fit this mechanism.");
        } else {
          ctx.audio.playClick();
          ctx.ui.showToast(
            'An empty threaded brass lens cell — equip the right artifact from your tray below to seat it here.',
            3600
          );
        }
      },
    },
    {
      id: 'telescope_ra_dial',
      object: raWheelGroup,
      stationId: 'telescope',
      focusOnly: true,
      cursor: 'grab',
      label: 'RA Vernier Wheel',
      getLabel: (s) => `RA Vernier Wheel — ${String(s.telescopeRA).padStart(2, '0')}h`,
      getHint: () => 'Click to advance Right Ascension (+1h)',
      focusTarget: telescopeFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        const nextRA = (snap.telescopeRA + 1) % 12;
        ctx.state.update((d) => {
          d.telescopeRA = nextRA;
        });
        ctx.audio.playBrassGear();
        ctx.ui.showToast(`Telescope aligned: ${formatCoords(nextRA, snap.telescopeDEC)}`, 2200);
      },
    },
    {
      id: 'telescope_dec_dial',
      object: decWheelGroup,
      stationId: 'telescope',
      focusOnly: true,
      cursor: 'grab',
      label: 'DEC Vernier Wheel',
      getLabel: (s) => `DEC Vernier Wheel — +${s.telescopeDEC}°`,
      getHint: () => 'Click to adjust Declination (+15°)',
      focusTarget: telescopeFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        const idx = TELESCOPE_DEC_STEPS.indexOf(
          snap.telescopeDEC as (typeof TELESCOPE_DEC_STEPS)[number]
        );
        const nextDEC = TELESCOPE_DEC_STEPS[(idx + 1) % TELESCOPE_DEC_STEPS.length];
        ctx.state.update((d) => {
          d.telescopeDEC = nextDEC;
        });
        ctx.audio.playBrassGear();
        ctx.ui.showToast(`Telescope aligned: ${formatCoords(snap.telescopeRA, nextDEC)}`, 2200);
      },
    },
    {
      id: 'telescope_eyepiece',
      object: eyepieceGroup,
      stationId: 'telescope',
      focusOnly: true,
      cursor: 'pointer',
      label: 'Brass Eyepiece',
      getLabel: (s) => `Brass Eyepiece (${formatCoords(s.telescopeRA, s.telescopeDEC)})`,
      getHint: (s) =>
        s.telescopeLensInstalled
          ? 'Click to peer through the optics'
          : 'Objective lens housing at front of tube is empty',
      focusTarget: telescopeFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (!snap.telescopeLensInstalled) {
          ctx.audio.playError();
          ctx.ui.showToast(
            'The objective lens housing at the front of the tube is empty — seat a lens there first.'
          );
          return;
        }
        const cfg = snap.puzzleConfig;
        const aligned =
          snap.telescopeRA === cfg.telescopeTargetRA &&
          snap.telescopeDEC === cfg.telescopeTargetDEC;
        if (aligned && !snap.solved.telescope) {
          ctx.state.markSolved('telescope');
          ctx.audio.playPuzzleSolved();
          const alignedMsg = cfg.eyepieceShowNames
            ? 'Celestial Triad revealed! Polaris, Sirius & Vega blaze through the Sapphire Lens.'
            : cfg.starChartOrderMatters
              ? 'Constellation sequence locked! Observe the 5-star pulse order and Azimuth target.'
              : 'Constellation geometry locked! Match the 4-star pattern onto the Backlit Star Table.';
          ctx.ui.showToast(alignedMsg, 4800);
        } else {
          ctx.audio.playClick();
        }
        ctx.ui.openTelescopeEyepiece(aligned);
      },
    },
  ];

  const colliders: ColliderBox[] = [
    { minX: -1.36, maxX: 1.36, minZ: -6.01, maxZ: -3.29, label: 'Great Telescope Plinth' },
  ];

  // Smooth mechanical animation state
  let currentRAYaw = (0 - 4) * 0.13;
  let currentDECPitch = THREE.MathUtils.degToRad(15);
  let currentRAWheelSpin = 0;
  let currentDECWheelSpin = 0;

  const update = (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>): void => {
    const smooth = 1 - Math.exp(-5.5 * delta);

    // At target RA, telescope points dead-North (-Z) straight through the dome shutter slit!
    const targetRAYaw = (state.puzzleConfig.telescopeTargetRA - state.telescopeRA) * 0.125;
    currentRAYaw += (targetRAYaw - currentRAYaw) * smooth;
    raPivot.rotation.y = currentRAYaw;

    // Positive rotation.x lifts front objective (-Z) UP toward the dome slit
    const targetDECPitch = THREE.MathUtils.degToRad(state.telescopeDEC);
    currentDECPitch += (targetDECPitch - currentDECPitch) * smooth;
    decPivot.rotation.x = currentDECPitch;

    // Spin vernier handwheels smoothly as player turns them
    const targetRASpin = state.telescopeRA * (Math.PI / 3);
    currentRAWheelSpin += (targetRASpin - currentRAWheelSpin) * smooth;
    raSpokeWheel.rotation.z = currentRAWheelSpin;

    const targetDECSpin = (state.telescopeDEC / 15) * (Math.PI / 2);
    currentDECWheelSpin += (targetDECSpin - currentDECWheelSpin) * smooth;
    decSpokeWheel.rotation.z = currentDECWheelSpin;

    // Installed Sapphire Objective Lens visual & empty objective cell indicator halo
    installedSapphireLens.visible = state.telescopeLensInstalled;
    emptyLensHalo.visible = !state.telescopeLensInstalled;
    if (!state.telescopeLensInstalled) {
      emptyLensGlowMat.emissiveIntensity = 0.72 + Math.sin(elapsed * 3.2) * 0.35;
    }
    if (state.telescopeLensInstalled) {
      const aligned =
        state.telescopeRA === state.puzzleConfig.telescopeTargetRA &&
        state.telescopeDEC === state.puzzleConfig.telescopeTargetDEC;
      installedSapphireMat.emissiveIntensity = aligned
        ? 1.85 + Math.sin(elapsed * 3.5) * 0.25
        : 0.95 + Math.sin(elapsed * 2.0) * 0.12;
      lensBlueGlow.intensity = aligned ? 1.45 : 0.65;
    } else {
      lensBlueGlow.intensity = 0;
    }
  };

  return { group: root, interactables, colliders, update };
}
