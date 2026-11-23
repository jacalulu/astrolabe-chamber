import * as THREE from 'three';
import { applyDoorRingClick } from '../../engine/DifficultyConfig';
import {
  COMPASS_BEARINGS,
  type ColliderBox,
  type FocusTarget,
  type GameStateSnapshot,
  type Interactable,
  type PropModuleResult,
  type TextureBundle,
  type UIControllerAPI,
} from '../../types';

function createCompassBezelTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Dark enameled outer compass track between r=212 and r=254
  ctx.beginPath();
  ctx.arc(cx, cy, 254, 0, Math.PI * 2);
  ctx.arc(cx, cy, 212, 0, Math.PI * 2, true);
  ctx.fillStyle = '#18120a';
  ctx.fill();

  // Crisp gold border rings
  for (const r of [252, 214]) {
    ctx.strokeStyle = '#dfb860';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Fine 15-degree tick marks around the compass bezel
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 3 === 0;
    const r0 = isMajor ? 214 : 220;
    const r1 = isMajor ? 228 : 228;
    ctx.strokeStyle = isMajor ? '#ffe79e' : 'rgba(220, 185, 108, 0.55)';
    ctx.lineWidth = isMajor ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }

  // 8 crisp clockwise compass bearings (N at 12 o'clock -> NE -> E -> SE -> S -> SW -> W -> NW)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  COMPASS_BEARINGS.forEach((label, idx) => {
    const a = idx * (Math.PI / 4) - Math.PI / 2;
    const rx = cx + Math.cos(a) * 238;
    const ry = cy + Math.sin(a) * 238;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = idx === 0 ? '#ffe9a8' : '#e6c678';
    ctx.font = idx % 2 === 0 ? 'bold 20px Georgia, serif' : 'bold 16px Georgia, serif';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function enableShadows(root: THREE.Object3D, cast = true, receive = true): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}

/**
 * Extrudes one half of an arched monumental double door leaf.
 * Hinge edge is at x = 0, meeting stile is at x = side * width (side = +1 for left leaf, -1 for right leaf).
 */
function createArchedDoorLeafGeometry(
  side: 1 | -1,
  width: number,
  straightHeight: number,
  archRadius: number,
  thickness: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const segments = 24;

  if (side === 1) {
    // Left leaf: x from 0 (hinge) to +width (center seam)
    shape.moveTo(0, 0);
    shape.lineTo(width, 0);
    shape.lineTo(width, straightHeight + archRadius);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const a = Math.PI / 2 + t * (Math.PI / 2); // PI/2 -> PI
      const x = width + Math.cos(a) * width;
      const y = straightHeight + Math.sin(a) * archRadius;
      shape.lineTo(x, y);
    }
    shape.lineTo(0, 0);
  } else {
    // Right leaf: x from 0 (hinge) to -width (center seam)
    shape.moveTo(0, 0);
    shape.lineTo(0, straightHeight);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const a = t * (Math.PI / 2); // 0 -> PI/2
      const x = -width + Math.cos(a) * width;
      const y = straightHeight + Math.sin(a) * archRadius;
      shape.lineTo(x, y);
    }
    shape.lineTo(-width, 0);
    shape.lineTo(0, 0);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  geo.translate(0, 0, -thickness / 2);
  return geo;
}

function createInsertedObsidianKey(
  obsidianMat: THREE.Material,
  goldMat: THREE.Material
): THREE.Group {
  const key = new THREE.Group();

  // Barrel shaft seated horizontally along +Z (facing North when mounted on rotated seal!)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.11, 12), obsidianMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.05;
  key.add(shaft);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 8, 16), goldMat);
  collar.position.z = 0.095;
  key.add(collar);

  // 8-pointed obsidian & gold star bow protruding outward from the lock hub
  const starShape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.062 : 0.028;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();

  const bowGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.003,
    bevelThickness: 0.003,
  });
  bowGeo.center();
  const bow = new THREE.Mesh(bowGeo, obsidianMat);
  bow.position.z = 0.145;
  bow.rotation.y = Math.PI / 2; // Flat profile facing sideways like a real turned key!
  key.add(bow);

  const bowRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 8, 24), goldMat);
  bowRing.position.z = 0.145;
  bowRing.rotation.y = Math.PI / 2;
  key.add(bowRing);

  return key;
}

export function buildExitDoor(textures: TextureBundle): PropModuleResult {
  const root = new THREE.Group();
  root.name = 'ExitDoorAndBalconyStation';

  // Shared PBR Materials
  const oakMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.016,
    roughnessMap: textures.walnut.roughnessMap,
    color: new THREE.Color('#6a3d26'),
    roughness: 0.44,
    metalness: 0.06,
  });

  const darkOakPanelMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.014,
    color: new THREE.Color('#472718'),
    roughness: 0.42,
    metalness: 0.08,
  });

  const darkMarbleCapitalMat = new THREE.MeshStandardMaterial({
    map: textures.marbleFloor.map,
    bumpMap: textures.marbleFloor.bumpMap,
    bumpScale: 0.012,
    color: new THREE.Color('#27303c'),
    roughness: 0.34,
    metalness: 0.16,
  });

  const wroughtIronMat = new THREE.MeshStandardMaterial({
    map: textures.darkIron.map,
    bumpMap: textures.darkIron.bumpMap,
    bumpScale: 0.018,
    roughnessMap: textures.darkIron.roughnessMap,
    color: new THREE.Color('#343a46'),
    roughness: 0.4,
    metalness: 0.78,
  });

  const bronzeMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.01,
    roughnessMap: textures.brass.roughnessMap,
    color: new THREE.Color('#9c7333'),
    roughness: 0.36,
    metalness: 0.86,
  });

  const polishedBrassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.006,
    roughnessMap: textures.brass.roughnessMap,
    color: new THREE.Color('#e8c36c'),
    roughness: 0.22,
    metalness: 0.92,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stonePlinth.map,
    bumpMap: textures.stonePlinth.bumpMap,
    bumpScale: 0.02,
    roughnessMap: textures.stonePlinth.roughnessMap,
    color: new THREE.Color('#3b4150'),
    roughness: 0.74,
    metalness: 0.06,
  });

  // ============================================================================
  // 1. ARCHITECTURAL PORTAL FRAME (Flanking Bronze Columns & Stone Arch Surround)
  // Positioned at z = 6.78 framing the South doorway opening x ∈ [-1.25, 1.25], y ∈ [0, 3.45]
  // ============================================================================
  const portalZ = 6.78;

  for (const sx of [-1, 1]) {
    const colX = sx * 1.42;
    const colZ = portalZ - 0.06;
    // Molded dark bronze-marble pedestal plinth cleanly encasing wall jamb base (y=0..0.44)
    const colBaseLower = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.44, 0.36),
      darkMarbleCapitalMat
    );
    colBaseLower.position.set(colX, 0.22, colZ);
    root.add(colBaseLower);

    const colBaseMold = new THREE.Mesh(
      new THREE.CylinderGeometry(0.138, 0.175, 0.08, 20),
      bronzeMat
    );
    colBaseMold.position.set(colX, 0.48, colZ);
    root.add(colBaseMold);

    // Fluted bronze column shaft rising directly into the classical capital at arch spring line
    const colShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.132, 1.58, 20), bronzeMat);
    colShaft.position.set(colX, 1.29, colZ);
    root.add(colShaft);

    // Molded dark antique-bronze & marble classical capital seated flush at arch spring line (y=2.08..2.36)
    const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.018, 10, 24), polishedBrassMat);
    capRing.rotation.x = Math.PI / 2;
    capRing.position.set(colX, 2.08, colZ);
    root.add(capRing);

    const capEchinus = new THREE.Mesh(
      new THREE.CylinderGeometry(0.178, 0.122, 0.11, 20),
      bronzeMat
    );
    capEchinus.position.set(colX, 2.135, colZ);
    root.add(capEchinus);

    const capAbacus = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.15, 0.38),
      darkMarbleCapitalMat
    );
    capAbacus.position.set(colX, 2.26, colZ);
    root.add(capAbacus);

    const capTrim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.026, 0.4), bronzeMat);
    capTrim.position.set(colX, 2.345, colZ);
    root.add(capTrim);
  }

  // Carved stone semicircular archivolt aligned with wall archSpringY = 2.24
  const archFrame = new THREE.Mesh(
    new THREE.TorusGeometry(1.36, 0.14, 12, 36, Math.PI),
    stoneMat
  );
  archFrame.position.set(0, 2.24, portalZ - 0.06);
  root.add(archFrame);

  // Brass celestial keystone medallion at crown of archway
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.32), stoneMat);
  keystone.position.set(0, 3.58, portalZ - 0.06);
  root.add(keystone);
  const keystoneStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), polishedBrassMat);
  keystoneStar.scale.set(1, 1, 0.35);
  keystoneStar.position.set(0, 3.58, portalZ - 0.23);
  root.add(keystoneStar);

  // Stone threshold step across the doorway floor
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.04, 0.42), stoneMat);
  threshold.position.set(0, 0.02, portalZ + 0.04);
  root.add(threshold);

  // ============================================================================
  // 2. MONUMENTAL ARCHED DOUBLE OAK DOORS (2.42m W x 3.40m H)
  // Swing outward (+Z) onto the moonlit terrace when unlocked!
  // ============================================================================
  const leafW = 1.21;
  const straightH = 2.2;
  const archR = 1.2;
  const doorThick = 0.11;

  const leftDoorPivot = new THREE.Group();
  leftDoorPivot.position.set(-leafW, 0.02, portalZ + 0.02);
  root.add(leftDoorPivot);

  const rightDoorPivot = new THREE.Group();
  rightDoorPivot.position.set(leafW, 0.02, portalZ + 0.02);
  root.add(rightDoorPivot);

  const buildDoorLeafDetails = (pivot: THREE.Group, side: 1 | -1): void => {
    const leafMesh = new THREE.Mesh(
      createArchedDoorLeafGeometry(side, leafW - 0.008, straightH, archR, doorThick),
      oakMat
    );
    pivot.add(leafMesh);

    const midX = side * (leafW * 0.5);

    // Recessed dark-oak molded panels (lower & upper) on indoor (-Z) & outdoor (+Z) faces
    for (const faceZ of [-doorThick / 2 - 0.006, doorThick / 2 + 0.006]) {
      const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.84, 0.022), darkOakPanelMat);
      lowerPanel.position.set(midX, 0.62, faceZ);
      pivot.add(lowerPanel);

      const upperPanel = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.96, 0.022), darkOakPanelMat);
      upperPanel.position.set(midX, 1.72, faceZ);
      pivot.add(upperPanel);

      // Brass panel trim frame beading
      const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.88, 0.01), bronzeMat);
      lowerTrim.position.set(midX, 0.62, faceZ * 0.95);
      pivot.add(lowerTrim);

      const upperTrim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.01), bronzeMat);
      upperTrim.position.set(midX, 1.72, faceZ * 0.95);
      pivot.add(upperTrim);

      // Beveled brass corner rosettes anchoring each recessed panel on indoor face
      if (faceZ < 0) {
        const panelSpecs: Array<[number, number]> = [
          [0.62, 0.35],
          [1.72, 0.41],
        ];
        for (const [py, halfH] of panelSpecs) {
          for (const rx of [-0.31, 0.31]) {
            for (const ry of [-halfH, halfH]) {
              const rosette = new THREE.Mesh(
                new THREE.CylinderGeometry(0.026, 0.032, 0.012, 8),
                polishedBrassMat
              );
              rosette.rotation.x = Math.PI / 2;
              rosette.position.set(midX + rx, py + ry, faceZ - 0.014);
              pivot.add(rosette);
            }
          }
        }
      }
    }

    // Heavy riveted wrought-iron strap hinges (3 per door) on indoor face (-Z)
    for (const hy of [0.36, 1.56, 2.24]) {
      const strapLen = hy > 2.0 ? 0.68 : 0.96;
      const strap = new THREE.Mesh(new THREE.BoxGeometry(strapLen, 0.078, 0.018), wroughtIronMat);
      strap.position.set(side * (strapLen / 2 + 0.02), hy, -doorThick / 2 - 0.012);
      pivot.add(strap);

      // Spear tip finial
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 4), wroughtIronMat);
      tip.rotation.z = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      tip.position.set(side * (strapLen + 0.06), hy, -doorThick / 2 - 0.012);
      pivot.add(tip);

      // Iron rivets along strap
      for (let r = 0; r < 5; r++) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), wroughtIronMat);
        rivet.position.set(side * (0.12 + r * 0.16), hy, -doorThick / 2 - 0.022);
        pivot.add(rivet);
      }
    }

    // Ornate forged brass drop-ring door pull
    const handleX = side * (leafW - 0.24);
    const handlePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.06, 0.018, 16), bronzeMat);
    handlePlate.rotation.x = Math.PI / 2;
    handlePlate.position.set(handleX, 1.12, -doorThick / 2 - 0.014);
    pivot.add(handlePlate);

    const handleRing = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.011, 10, 24), polishedBrassMat);
    handleRing.position.set(handleX, 1.05, -doorThick / 2 - 0.032);
    pivot.add(handleRing);
  };

  buildDoorLeafDetails(leftDoorPivot, 1);
  buildDoorLeafDetails(rightDoorPivot, -1);

  // Slim dark-oak center astragal weatherstrip behind meeting seam so zero light leaks when closed
  const centerAstragal = new THREE.Mesh(
    new THREE.BoxGeometry(0.082, straightH + archR - 0.06, 0.036),
    darkOakPanelMat
  );
  centerAstragal.position.set(-leafW, (straightH + archR - 0.06) / 2, doorThick / 2 + 0.016);
  rightDoorPivot.add(centerAstragal);

  // Heavy Sliding Wrought-Iron Deadbolt Bars + Cast-Iron Guide Housings (retract smoothly on solve!)
  const addBoltHousing = (pivot: THREE.Group, x: number, y: number): void => {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.125, 0.014), bronzeMat);
    plate.position.set(x, y, -doorThick / 2 - 0.01);
    pivot.add(plate);
    for (const gx of [-0.18, 0.14]) {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.095, 0.056), wroughtIronMat);
      collar.position.set(x + gx, y, -doorThick / 2 - 0.028);
      pivot.add(collar);
    }
  };
  addBoltHousing(leftDoorPivot, leafW - 0.32, 2.38);
  addBoltHousing(leftDoorPivot, leafW - 0.32, 0.78);
  addBoltHousing(rightDoorPivot, -(leafW - 0.32), 2.38);
  addBoltHousing(rightDoorPivot, -(leafW - 0.32), 0.78);

  const topBoltLeft = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.055, 0.036), wroughtIronMat);
  topBoltLeft.position.set(leafW - 0.24, 2.38, -doorThick / 2 - 0.028);
  leftDoorPivot.add(topBoltLeft);

  const botBoltLeft = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.055, 0.036), wroughtIronMat);
  botBoltLeft.position.set(leafW - 0.24, 0.78, -doorThick / 2 - 0.028);
  leftDoorPivot.add(botBoltLeft);

  const topBoltRight = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.055, 0.036), wroughtIronMat);
  topBoltRight.position.set(-(leafW - 0.24), 2.38, -doorThick / 2 - 0.028);
  rightDoorPivot.add(topBoltRight);

  const botBoltRight = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.055, 0.036), wroughtIronMat);
  botBoltRight.position.set(-(leafW - 0.24), 0.78, -doorThick / 2 - 0.028);
  rightDoorPivot.add(botBoltRight);

  // ============================================================================
  // 3. PUZZLE E — 3-RING CELESTIAL ASTROLABE SEAL (mounted at world 0, 1.58, 5.26)
  // Attached to rightDoorPivot so it swings naturally with the door when unlocked!
  // ============================================================================
  const sealGroup = new THREE.Group();
  // rightDoorPivot is at (+1.21, 0.02, 5.40) -> local (-1.21, 1.56, -0.14) = world (0, 1.58, 5.26)!
  sealGroup.position.set(-leafW, 1.56, -0.14);
  // Rotate Y by Math.PI so local +Z faces North (-Z, inward into the room toward the player!)
  sealGroup.rotation.y = Math.PI;
  rightDoorPivot.add(sealGroup);

  // Fixed heavy cast-bronze backing plate & outer riveted bezel (r = 0.56m)
  const sealBackplate = new THREE.Mesh(new THREE.CylinderGeometry(0.565, 0.58, 0.045, 48), bronzeMat);
  sealBackplate.rotation.x = Math.PI / 2;
  sealBackplate.position.z = -0.02;
  sealGroup.add(sealBackplate);

  const outerBezel = new THREE.Mesh(new THREE.TorusGeometry(0.545, 0.042, 14, 56), bronzeMat);
  outerBezel.position.z = 0.015;
  sealGroup.add(outerBezel);

  // Engraved 8-bearing azimuth compass ring (N, NE, E, SE, S, SW, W, NW) flush on outer bezel
  const compassRingMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.502, 0.59, 64),
    new THREE.MeshStandardMaterial({
      map: createCompassBezelTexture(),
      transparent: true,
      roughness: 0.42,
      metalness: 0.62,
      envMapIntensity: 0.4,
    })
  );
  compassRingMesh.position.z = 0.056;
  compassRingMesh.castShadow = false;
  compassRingMesh.userData.interactableId = 'exit_door_seal';
  sealGroup.add(compassRingMesh);

  // 8 heavy brass mounting rivets around outer perimeter between bearings
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), polishedBrassMat);
    rivet.position.set(Math.cos(a) * 0.565, Math.sin(a) * 0.565, 0.058);
    sealGroup.add(rivet);
  }

  // Sculpted 12 o'clock Finial housing the gleaming CRIMSON RUBY POINTER!
  const rubyMount = new THREE.Group();
  rubyMount.position.set(0, 0.57, 0.045);
  sealGroup.add(rubyMount);

  const rubyCrown = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.14, 6), polishedBrassMat);
  rubyCrown.rotation.z = Math.PI;
  rubyCrown.position.y = -0.02;
  rubyMount.add(rubyCrown);

  const rubyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ff143c'),
    emissive: new THREE.Color('#d90b2e'),
    emissiveIntensity: 1.65,
    roughness: 0.06,
    metalness: 0.05,
    transmission: 0.55,
    ior: 1.77,
    clearcoat: 1.0,
  });
  const rubyGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), rubyMat);
  rubyGem.scale.set(0.85, 1.35, 0.7);
  rubyGem.position.set(0, 0.02, 0.032);
  rubyMount.add(rubyGem);

  // Sharp downward gold pointer dart right beneath the Crimson Ruby
  const rubyDart = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.075, 4), polishedBrassMat);
  rubyDart.rotation.z = Math.PI;
  rubyDart.position.set(0, -0.078, 0.034);
  rubyMount.add(rubyDart);

  const rubyGlow = new THREE.PointLight('#ff3b5c', 0.55, 1.2, 2);
  rubyGlow.position.set(0, 0.02, 0.09);
  rubyMount.add(rubyGlow);

  // --- 3 CONCENTRIC INDEPENDENTLY ROTATING ENGRAVED BRASS RINGS ---
  const ringSpecs: Array<{
    innerR: number;
    outerR: number;
    zOffset: number;
    gemColor: string;
    name: string;
  }> = [
    { innerR: 0.375, outerR: 0.495, zOffset: 0.02, gemColor: '#2c8eff', name: 'Outer Astrolabe Ring' },
    { innerR: 0.25, outerR: 0.365, zOffset: 0.034, gemColor: '#19c472', name: 'Middle Astrolabe Ring' },
    { innerR: 0.135, outerR: 0.24, zOffset: 0.048, gemColor: '#ffd24d', name: 'Inner Astrolabe Ring' },
  ];

  const ringPivots: THREE.Group[] = [];
  const ringCurrentAngles = [3 * (Math.PI / 4), 5 * (Math.PI / 4), 2 * (Math.PI / 4)];
  const ringInteractables: Interactable[] = [];

  const doorFocus: FocusTarget = {
    id: 'exit_door',
    label: 'Celestial Astrolabe Exit Seal',
    position: new THREE.Vector3(0, 1.58, 5.22),
    lookAt: new THREE.Vector3(0, 1.58, 6.66),
  };

  // Unified invisible bounding disc covering the entire 3-ring Astrolabe Seal while standing
  const sealHitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.14, 24),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  sealHitbox.rotation.x = Math.PI / 2;
  sealHitbox.position.z = 0.04;
  sealHitbox.userData.interactableId = 'exit_door_seal';
  sealGroup.add(sealHitbox);

  // Victory delay state (1.8s cinematic beat while doors swing dramatically open!)
  let victoryPendingUI: UIControllerAPI | null = null;
  let victoryTimer = 0;
  let victoryShown = false;

  ringSpecs.forEach((spec, idx) => {
    const pivot = new THREE.Group();
    pivot.position.z = spec.zOffset;
    sealGroup.add(pivot);
    ringPivots.push(pivot);

    // Unique engraved material per ring so hover highlights ONLY the hovered concentric ring!
    const dialMat = new THREE.MeshStandardMaterial({
      map: textures.astrolabeDial,
      roughness: 0.28,
      metalness: 0.82,
      color: new THREE.Color('#f5dca0'),
    });
    const rimBrassMat = polishedBrassMat.clone();

    // Engraved flat ring face (RingGeometry maps radial UVs matching textures.astrolabeDial 12 o'clock bar!)
    const ringFace = new THREE.Mesh(
      new THREE.RingGeometry(spec.innerR, spec.outerR, 64),
      dialMat
    );
    ringFace.position.z = 0.008;
    pivot.add(ringFace);

    // Solid stepped outer & inner machined brass bevel rims
    const outerRim = new THREE.Mesh(
      new THREE.TorusGeometry(spec.outerR, 0.011, 10, 56),
      rimBrassMat
    );
    outerRim.position.z = 0.004;
    pivot.add(outerRim);

    const innerRim = new THREE.Mesh(
      new THREE.TorusGeometry(spec.innerR, 0.009, 10, 48),
      rimBrassMat
    );
    innerRim.position.z = 0.004;
    pivot.add(innerRim);

    // UNMISTAKABLE RAISED GLEAMING GOLD MERIDIAN BAR + JEWEL MARKER AT 12 O'CLOCK (+Y)!
    const barMidR = (spec.innerR + spec.outerR) / 2;
    const barLen = spec.outerR - spec.innerR + 0.014;
    const goldBarMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffe89c'),
      emissive: new THREE.Color('#d99b26'),
      emissiveIntensity: 0.72,
      roughness: 0.16,
      metalness: 0.96,
    });
    const meridianBar = new THREE.Mesh(new THREE.BoxGeometry(0.032, barLen, 0.022), goldBarMat);
    meridianBar.position.set(0, barMidR, 0.016);
    pivot.add(meridianBar);

    const gemMarkerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.gemColor),
      emissive: new THREE.Color(spec.gemColor),
      emissiveIntensity: 1.2,
      roughness: 0.12,
      metalness: 0.25,
    });
    const gemMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 0), gemMarkerMat);
    gemMarker.scale.set(0.85, 1.25, 0.65);
    gemMarker.position.set(0, barMidR, 0.029);
    pivot.add(gemMarker);

    // 7 smaller brass knurled grip studs around the rest of the ring at 45° intervals
    for (let s = 1; s < 8; s++) {
      const a = Math.PI / 2 + s * (Math.PI / 4);
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.012, 8), rimBrassMat);
      stud.rotation.x = Math.PI / 2;
      stud.position.set(Math.cos(a) * barMidR, Math.sin(a) * barMidR, 0.013);
      pivot.add(stud);
    }

    pivot.rotation.z = ringCurrentAngles[idx];

    ringInteractables.push({
      id: `door_ring_${idx}`,
      object: pivot,
      stationId: 'exit_door',
      focusOnly: true,
      cursor: 'grab',
      label: spec.name,
      getLabel: (s) => {
        if (!s.doorKeyInserted) return `${spec.name} (Locked)`;
        const step = s.doorRings[idx];
        const dir = COMPASS_BEARINGS[step];
        return `${spec.name} — ${dir} (${step * 45}°)`;
      },
      getHint: (s) => {
        if (s.solved.exit_door) return 'Seal unlocked';
        if (!s.doorKeyInserted) return 'Locked — seat the star key in the center keyhole hub first';
        const coupling = s.puzzleConfig.doorCoupling;
        if (coupling === 'cascade') {
          if (idx === 0) return 'Linked ring: rotates Outer + Middle (+45°)';
          if (idx === 1) return 'Linked ring: rotates Middle + Inner (+45°)';
          return 'Free ring: rotates Inner (+45°)';
        }
        if (coupling === 'bidirectional') {
          if (idx === 0) return 'Coupled ring: rotates Outer + Middle (+45°)';
          if (idx === 1) return 'Coupled ring: rotates All 3 Rings (+45°)';
          return 'Coupled ring: rotates Middle + Inner (+45°)';
        }
        return 'Click to rotate +45° toward the Crimson Ruby (N)';
      },
      focusTarget: doorFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (snap.solved.exit_door) return;
        if (!snap.doorKeyInserted) {
          ctx.audio.playError();
          ctx.ui.showToast(
            'The Astrolabe rings are locked solid — equip the star key and seat it in the center keyhole hub.',
            3600
          );
          return;
        }
        const coupling = snap.puzzleConfig.doorCoupling;
        const nextRings = applyDoorRingClick(snap.doorRings, idx as 0 | 1 | 2, coupling);
        ctx.state.update((d) => {
          d.doorRings = nextRings;
        });
        ctx.audio.playBrassGear();

        const updated = ctx.state.get();
        const target = updated.puzzleConfig.doorTarget;
        const alignedAll =
          updated.doorRings[0] === target[0] &&
          updated.doorRings[1] === target[1] &&
          updated.doorRings[2] === target[2];

        if (alignedAll) {
          ctx.state.markSolved('exit_door');
          ctx.state.update((d) => {
            d.escaped = true;
          });
          ctx.audio.playPuzzleSolved();
          ctx.audio.playDoorOpen();
          ctx.focusOn(null);
          ctx.ui.showToast(
            'The Astrolabe Seal unlocks! The heavy oak doors swing wide to the moonlit sky!',
            4800
          );
          victoryPendingUI = ctx.ui;
          victoryTimer = 1.8;
          victoryShown = false;
        } else {
          const b0 = COMPASS_BEARINGS[updated.doorRings[0]];
          const b1 = COMPASS_BEARINGS[updated.doorRings[1]];
          const b2 = COMPASS_BEARINGS[updated.doorRings[2]];
          if (coupling === 'none') {
            const step = updated.doorRings[idx];
            const dir = COMPASS_BEARINGS[step];
            ctx.ui.showToast(`${spec.name}: ${dir} (${step * 45}°)`, 1600);
          } else {
            ctx.ui.showToast(
              `Bearings — Outer: ${b0} (${updated.doorRings[0] * 45}°) · Mid: ${b1} (${updated.doorRings[1] * 45}°) · Inner: ${b2} (${updated.doorRings[2] * 45}°)`,
              2200
            );
          }
        }
      },
    });
  });

  // --- CENTRAL STAR KEYHOLE HUB ('door_keyhole') ---
  const keyholeGroup = new THREE.Group();
  keyholeGroup.position.z = 0.062;
  sealGroup.add(keyholeGroup);

  const hubBrassMat = polishedBrassMat.clone();
  const hubOct = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.135, 0.036, 8), hubBrassMat);
  hubOct.rotation.x = Math.PI / 2;
  keyholeGroup.add(hubOct);

  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 10, 24), bronzeMat);
  hubRing.position.z = 0.018;
  keyholeGroup.add(hubRing);

  // Dark recessed 8-pointed star keyhole cutout
  const starRecessMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#05060a'),
    roughness: 0.9,
    metalness: 0.1,
  });
  const starCutShape = new THREE.Shape();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.062 : 0.025;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) starCutShape.moveTo(x, y);
    else starCutShape.lineTo(x, y);
  }
  starCutShape.closePath();
  const starCut = new THREE.Mesh(new THREE.ShapeGeometry(starCutShape), starRecessMat);
  starCut.position.z = 0.021;
  keyholeGroup.add(starCut);

  // Visible Inserted Obsidian Star Key (appears once doorKeyInserted === true!)
  const insertedObsidianMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0e14'),
    emissive: new THREE.Color('#2d1e42'),
    emissiveIntensity: 0.55,
    roughness: 0.08,
    metalness: 0.3,
    clearcoat: 1.0,
  });
  const insertedGoldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe07a'),
    emissive: new THREE.Color('#e09b24'),
    emissiveIntensity: 0.55,
    roughness: 0.2,
    metalness: 0.95,
  });
  const insertedKeyMesh = createInsertedObsidianKey(insertedObsidianMat, insertedGoldMat);
  insertedKeyMesh.visible = false;
  keyholeGroup.add(insertedKeyMesh);

  // ============================================================================
  // 4. EXTERIOR MOONLIT ALPINE BALCONY VISTA (z = 6.85 to 11.2)
  // Bathed in cool silver moonlight overlooking the starry night sky!
  // ============================================================================
  const balconyGroup = new THREE.Group();
  root.add(balconyGroup);

  const terraceW = 6.4;
  const terraceD = 4.35;
  const terraceCenterZ = 9.02;
  const railSouthZ = 10.96;

  // Carved dark stone balcony floor slab
  const terraceFloor = new THREE.Mesh(new THREE.BoxGeometry(terraceW, 0.24, terraceD), stoneMat);
  terraceFloor.position.set(0, -0.12, terraceCenterZ);
  balconyGroup.add(terraceFloor);

  // Inlaid moonlit compass medallion on balcony terrace flags
  const terraceRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 0.95, 36),
    new THREE.MeshStandardMaterial({ color: '#99a8c4', roughness: 0.45, metalness: 0.5 })
  );
  terraceRing.rotation.x = -Math.PI / 2;
  terraceRing.position.set(0, 0.005, 8.8);
  balconyGroup.add(terraceRing);

  // Classical carved stone balustrade rail along South, East & West balcony edges
  const balH = 1.02;
  const balusterGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.062, 0),
      new THREE.Vector2(0.056, 0.1),
      new THREE.Vector2(0.036, 0.2),
      new THREE.Vector2(0.068, 0.42),
      new THREE.Vector2(0.042, 0.68),
      new THREE.Vector2(0.062, 0.8),
      new THREE.Vector2(0.001, 0.8),
    ],
    14
  );

  // South balustrade wall at z = 10.96
  const southPlinth = new THREE.Mesh(new THREE.BoxGeometry(terraceW, 0.16, 0.26), stoneMat);
  southPlinth.position.set(0, 0.08, railSouthZ);
  balconyGroup.add(southPlinth);
  const southRail = new THREE.Mesh(new THREE.BoxGeometry(terraceW + 0.06, 0.1, 0.3), stoneMat);
  southRail.position.set(0, balH, railSouthZ);
  balconyGroup.add(southRail);

  for (let i = 0; i < 13; i++) {
    const bx = -2.7 + (i / 12) * 5.4;
    const bal = new THREE.Mesh(balusterGeo, stoneMat);
    bal.position.set(bx, 0.16, railSouthZ);
    balconyGroup.add(bal);
  }

  // East & West side balustrade walls + flickering exterior wrought-iron balcony lanterns
  const balconyLanternLights: THREE.PointLight[] = [];

  for (const sx of [-1, 1]) {
    const sidePlinth = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, terraceD - 0.2), stoneMat);
    sidePlinth.position.set(sx * 3.08, 0.08, terraceCenterZ);
    balconyGroup.add(sidePlinth);
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, terraceD - 0.16), stoneMat);
    sideRail.position.set(sx * 3.08, balH, terraceCenterZ);
    balconyGroup.add(sideRail);

    for (let i = 0; i < 7; i++) {
      const bz = 7.45 + (i / 6) * 3.1;
      const bal = new THREE.Mesh(balusterGeo, stoneMat);
      bal.position.set(sx * 3.08, 0.16, bz);
      balconyGroup.add(bal);
    }

    // Balustrade carved stone pier topped by a flickering wrought-iron exterior lantern
    // Placed at x = ±1.06 so both glowing lanterns frame the moonlit alpine vista when doors swing open!
    const pierX = sx * 1.06;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.24, 0.38), stoneMat);
    pier.position.set(pierX, 0.62, railSouthZ);
    balconyGroup.add(pier);

    const lanternBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.12, 0.12, 8),
      wroughtIronMat
    );
    lanternBase.position.set(pierX, 1.3, railSouthZ);
    balconyGroup.add(lanternBase);

    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.088, 0.28, 6),
      new THREE.MeshStandardMaterial({
        color: '#ffe9be',
        emissive: '#ffbf66',
        emissiveIntensity: 2.1,
        roughness: 0.18,
      })
    );
    lanternGlass.position.set(pierX, 1.49, railSouthZ);
    balconyGroup.add(lanternGlass);

    // 6 forged wrought-iron cage ribs framing the lantern glass
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), wroughtIronMat);
      rib.position.set(pierX + Math.cos(a) * 0.108, 1.49, railSouthZ + Math.sin(a) * 0.108);
      balconyGroup.add(rib);
    }

    const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.15, 6), wroughtIronMat);
    lanternCap.position.set(pierX, 1.7, railSouthZ);
    balconyGroup.add(lanternCap);

    const lanternFinial = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), polishedBrassMat);
    lanternFinial.position.set(pierX, 1.79, railSouthZ);
    balconyGroup.add(lanternFinial);

    // Real warm-amber flickering lantern light kissing the stone balustrade & terrace
    const lanternLight = new THREE.PointLight('#ffc470', 1.45, 5.5, 1.8);
    lanternLight.position.set(pierX, 1.54, railSouthZ - 0.17);
    balconyGroup.add(lanternLight);
    balconyLanternLights.push(lanternLight);
  }

  // Dramatic Silver-Blue Moonlight flooding the exterior balcony balustrade & spilling indoors!
  const balconyMoonLight = new THREE.PointLight('#a8d2ff', 3.4, 13.0, 1.35);
  balconyMoonLight.position.set(0, 3.4, 9.25);
  balconyGroup.add(balconyMoonLight);

  const balustradeSilverFill = new THREE.PointLight('#90beff', 2.0, 9.0, 1.6);
  balustradeSilverFill.position.set(0, 1.85, 10.42);
  balconyGroup.add(balustradeSilverFill);

  enableShadows(root, true, true);
  rubyGem.castShadow = false;
  sealHitbox.castShadow = false;
  sealHitbox.receiveShadow = false;

  // ============================================================================
  // INTERACTABLES & COLLIDERS
  // ============================================================================
  // Allow clicking the heavy outer bronze bezel ring as part of 'exit_door_seal'
  outerBezel.userData.interactableId = 'exit_door_seal';

  const interactables: Interactable[] = [
    {
      id: 'exit_door_seal',
      object: sealBackplate,
      stationId: 'exit_door',
      cursor: 'inspect',
      label: '3-Ring Celestial Astrolabe Seal',
      getLabel: (s) =>
        s.solved.exit_door
          ? 'Celestial Astrolabe Seal (Unsealed)'
          : '3-Ring Celestial Astrolabe Seal',
      getHint: (s) =>
        s.solved.exit_door
          ? 'The Observatory doors are open'
          : 'Click to step in & inspect',
      focusTarget: doorFocus,
      onInteract: (ctx) => {
        ctx.audio.playClick();
        ctx.focusOn(doorFocus);
      },
    },
    {
      id: 'door_keyhole',
      object: keyholeGroup,
      stationId: 'exit_door',
      focusOnly: true,
      cursor: 'pointer',
      label: 'Empty Star Keyhole Hub',
      getLabel: (s) =>
        s.doorKeyInserted ? 'Obsidian Star Key (Seated)' : 'Empty Star Keyhole Hub',
      getHint: (s) => {
        if (s.doorKeyInserted) {
          return s.puzzleConfig.doorTarget[0] === 0
            ? 'Rotate the 3 Astrolabe rings to the Crimson Ruby (N)'
            : 'Align all 3 rings to the Telescope’s Azimuth bearing';
        }
        if (s.selectedItem === 'obsidian_key') return 'Click to seat Obsidian Star Key';
        return 'Select the right artifact from your tray to fit';
      },
      focusTarget: doorFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (snap.doorKeyInserted) {
          ctx.audio.playClick();
          const msg =
            snap.puzzleConfig.doorTarget[0] === 0
              ? 'The Obsidian Star Key is seated. Align all 3 gold meridian bars to the Crimson Ruby (N · 0°).'
              : 'The Obsidian Star Key is seated. Align all 3 coupled rings to the Azimuth bearing etched in the Telescope Eyepiece.';
          ctx.ui.showToast(msg, 3600);
          return;
        }
        if (snap.selectedItem === 'obsidian_key') {
          ctx.state.placeItem('obsidian_key');
          ctx.state.update((d) => {
            d.doorKeyInserted = true;
          });
          ctx.audio.playHeavyLatch();
          const msg =
            snap.puzzleConfig.doorTarget[0] === 0
              ? 'The Obsidian Star Key clicks home! Now align all 3 Astrolabe rings to the Crimson Ruby (N · 0°).'
              : 'The Obsidian Star Key clicks home! Align all 3 coupled rings to the Azimuth bearing from the Telescope Eyepiece.';
          ctx.ui.showToast(msg, 4500);
          if (ctx.getFocusedStation() !== doorFocus.id) {
            ctx.focusOn(doorFocus);
          }
        } else if (snap.selectedItem !== null) {
          ctx.audio.playError();
          ctx.ui.showToast("That artifact doesn't fit this mechanism.");
        } else {
          ctx.audio.playClick();
          ctx.ui.showToast(
            'An octagonal star keyhole hub — equip the right artifact from your tray below to seat it here.',
            3600
          );
        }
      },
    },
    ...ringInteractables,
  ];

  // Colliders for flanking jambs & exterior balcony balustrade (leaving doorway center open after escape!)
  const colliders: ColliderBox[] = [
    { minX: -1.65, maxX: -1.18, minZ: 6.48, maxZ: 7.05, label: 'Door Left Column' },
    { minX: 1.18, maxX: 1.65, minZ: 6.48, maxZ: 7.05, label: 'Door Right Column' },
    { minX: -3.4, maxX: 3.4, minZ: 10.68, maxZ: 11.28, label: 'Balcony South Rail' },
    { minX: -3.4, maxX: -2.85, minZ: 6.8, maxZ: 11.0, label: 'Balcony West Rail' },
    { minX: 2.85, maxX: 3.4, minZ: 6.8, maxZ: 11.0, label: 'Balcony East Rail' },
  ];

  // Animation state
  let currentBoltRetract = 0;
  let currentDoorSwing = 0;
  let currentKeyTurn = 0;

  const update = (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>): void => {
    const ringSmooth = 1 - Math.exp(-7.5 * delta);
    const doorSmooth = 1 - Math.exp(-2.1 * delta);

    // Smoothly rotate each of the 3 concentric Astrolabe rings (step 0 = straight up at 12 o'clock!)
    for (let i = 0; i < 3; i++) {
      // Negative rotation.z moves the 12 o'clock bar clockwise when viewed from indoor North (-Z)
      const targetAngle = -state.doorRings[i] * (Math.PI / 4);
      let diff = targetAngle - ringCurrentAngles[i];
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      ringCurrentAngles[i] += diff * ringSmooth;
      ringPivots[i].rotation.z = ringCurrentAngles[i];
    }

    // Inserted Obsidian Star Key visibility & crisp locking turn animation
    insertedKeyMesh.visible = state.doorKeyInserted;
    const targetKeyTurn = state.doorKeyInserted ? Math.PI / 4 : 0;
    currentKeyTurn += (targetKeyTurn - currentKeyTurn) * (1 - Math.exp(-8 * delta));
    insertedKeyMesh.rotation.z = currentKeyTurn;

    // Crimson Ruby pointer subtle pulse (blazes bright when solved!)
    rubyMat.emissiveIntensity = state.solved.exit_door
      ? 2.8 + Math.sin(elapsed * 4.5) * 0.35
      : 1.55 + Math.sin(elapsed * 2.2) * 0.18;
    rubyGlow.intensity = state.solved.exit_door ? 1.2 : 0.55;

    // Heavy iron deadbolts slide retracted before/as doors swing wide open 95° outward!
    const targetBolt = state.solved.exit_door || state.escaped ? 0.28 : 0;
    currentBoltRetract += (targetBolt - currentBoltRetract) * (1 - Math.exp(-5.5 * delta));
    topBoltLeft.position.x = leafW - 0.24 - currentBoltRetract;
    botBoltLeft.position.x = leafW - 0.24 - currentBoltRetract;
    topBoltRight.position.x = -(leafW - 0.24) + currentBoltRetract;
    botBoltRight.position.x = -(leafW - 0.24) + currentBoltRetract;

    const targetSwing = state.solved.exit_door || state.escaped ? THREE.MathUtils.degToRad(95) : 0;
    currentDoorSwing += (targetSwing - currentDoorSwing) * doorSmooth;
    leftDoorPivot.rotation.y = -currentDoorSwing;
    rightDoorPivot.rotation.y = currentDoorSwing;

    // Subtle organic flame flicker on the two exterior wrought-iron balcony lanterns
    balconyLanternLights.forEach((light, i) => {
      const phase = i * 2.1;
      light.intensity =
        1.42 + Math.sin(elapsed * 6.4 + phase) * 0.12 + Math.sin(elapsed * 14.3 + phase) * 0.06;
    });

    // Reset victory cinematic state cleanly if player resets the game
    if (!state.escaped) {
      victoryPendingUI = null;
      victoryTimer = 0;
      victoryShown = false;
    } else if (victoryPendingUI && !victoryShown) {
      victoryTimer -= delta;
      if (victoryTimer <= 0) {
        victoryShown = true;
        victoryPendingUI.showVictory(state.elapsedSeconds, state.hintsUsed);
      }
    }
  };

  return { group: root, interactables, colliders, update };
}
