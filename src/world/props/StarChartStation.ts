import * as THREE from 'three';
import { CONSTELLATION_STAR_COORDS } from '../../assets/ProceduralTextures';
import type {
  ColliderBox,
  FocusTarget,
  GameStateSnapshot,
  Interactable,
  PropModuleResult,
  TextureBundle,
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
  depth: number
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

  // Central bore hole
  const bore = new THREE.Path();
  bore.absarc(0, 0, holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  // 4 ornamental sector cutout windows between hub and rim
  const midR0 = holeRadius + (innerRadius - holeRadius) * 0.26;
  const midR1 = innerRadius - (innerRadius - holeRadius) * 0.2;
  if (midR1 > midR0 + 0.008) {
    for (let s = 0; s < 4; s++) {
      const sa0 = (s * Math.PI) / 2 + 0.22;
      const sa1 = ((s + 1) * Math.PI) / 2 - 0.22;
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
    bevelSize: 0.0025,
    bevelThickness: 0.0025,
  });
  geo.center();
  return geo;
}

export function buildStarChartStation(textures: TextureBundle): PropModuleResult {
  const root = new THREE.Group();
  root.name = 'StarChartAndCurioStation';

  // Shared PBR Materials
  const mahoganyMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.012,
    roughnessMap: textures.walnut.roughnessMap,
    color: new THREE.Color('#613422'),
    roughness: 0.42,
    metalness: 0.06,
  });

  const darkMahoganyMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.01,
    color: new THREE.Color('#381d13'),
    roughness: 0.36,
    metalness: 0.08,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.007,
    roughnessMap: textures.brass.roughnessMap,
    color: new THREE.Color('#deb760'),
    roughness: 0.26,
    metalness: 0.9,
  });

  const agedBrassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    color: new THREE.Color('#a67e36'),
    roughness: 0.38,
    metalness: 0.85,
  });

  const burgundyVelvetMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3c0d16'),
    roughness: 0.92,
    metalness: 0.02,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dceeff'),
    roughness: 0.14,
    metalness: 0.02,
    transparent: true,
    opacity: 0.18,
    clearcoat: 0.35,
    envMapIntensity: 0.22,
    reflectivity: 0.45,
  });

  // ============================================================================
  // 1. BACKLIT CONSTELLATION LECTERN at (-4.45, 0, 0.55) facing East-Southeast
  // ============================================================================
  const lecternGroup = new THREE.Group();
  lecternGroup.position.set(-4.45, 0, 0.55);
  lecternGroup.rotation.y = Math.PI / 2 - 0.14; // Local +Z points East-Southeast toward center
  root.add(lecternGroup);

  // Turned twin mahogany pedestal legs + sculpted H-stretcher + brass claw feet
  const legPts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.055, 0),
    new THREE.Vector2(0.048, 0.04),
    new THREE.Vector2(0.032, 0.1),
    new THREE.Vector2(0.046, 0.22),
    new THREE.Vector2(0.034, 0.34),
    new THREE.Vector2(0.04, 0.68),
    new THREE.Vector2(0.054, 0.82),
    new THREE.Vector2(0.048, 0.96),
    new THREE.Vector2(0.001, 0.96),
  ];
  const legGeo = new THREE.LatheGeometry(legPts, 18);

  for (const sx of [-0.46, 0.46]) {
    // Splayed base trestle foot
    const trestleFoot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.065, 0.68), darkMahoganyMat);
    trestleFoot.position.set(sx, 0.0325, 0);
    lecternGroup.add(trestleFoot);

    // Brass foot caps front & rear
    for (const fz of [-0.33, 0.33]) {
      const brassToe = new THREE.Mesh(new THREE.BoxGeometry(0.128, 0.045, 0.055), agedBrassMat);
      brassToe.position.set(sx, 0.025, fz);
      lecternGroup.add(brassToe);
    }

    // Main turned column
    const col = new THREE.Mesh(legGeo, mahoganyMat);
    col.position.set(sx, 0.06, 0);
    lecternGroup.add(col);

    // Brass quadrant tilt-brace arcs supporting the slanted table
    const quadArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.011, 8, 24, Math.PI * 0.62),
      brassMat
    );
    quadArc.rotation.y = Math.PI / 2;
    quadArc.rotation.z = -0.35;
    quadArc.position.set(sx, 0.95, 0.02);
    lecternGroup.add(quadArc);
  }

  // Sculpted horizontal H-stretcher & turned center finial
  const stretcher = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.065, 0.09), darkMahoganyMat);
  stretcher.position.set(0, 0.22, 0);
  lecternGroup.add(stretcher);

  const stretcherRail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.88, 12), brassMat);
  stretcherRail.rotation.z = Math.PI / 2;
  stretcherRail.position.set(0, 0.3, 0);
  lecternGroup.add(stretcherRail);

  const centerFinial = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), brassMat);
  centerFinial.scale.set(1, 1.35, 1);
  centerFinial.position.set(0, 0.28, 0);
  lecternGroup.add(centerFinial);

  // Sloped Mahogany Drafting Table & Backlit Constellation Plate
  // Tilted 26° toward the viewer (+Z) so standing & focused views read every star cleanly
  const tablePivot = new THREE.Group();
  tablePivot.position.set(0, 1.07, 0);
  tablePivot.rotation.x = THREE.MathUtils.degToRad(26);
  lecternGroup.add(tablePivot);

  const frameW = 1.06;
  const frameH = 0.94;
  const frameDepth = 0.085;
  const plateW = 0.86;
  const plateH = 0.78;

  // Solid lightbox housing body (table lies in local XZ with top face at +Y)
  const lightBoxBody = new THREE.Mesh(
    new THREE.BoxGeometry(frameW, frameDepth, frameH),
    mahoganyMat
  );
  lightBoxBody.position.y = -frameDepth / 2;
  tablePivot.add(lightBoxBody);

  // Molded raised rim bezel framing the backlit star glass
  const rimThick = 0.08;
  const rimRise = 0.024;
  const topRim = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.02, rimRise, rimThick), darkMahoganyMat);
  topRim.position.set(0, rimRise / 2, -(plateH / 2 + rimThick / 2 - 0.005));
  tablePivot.add(topRim);

  const botRim = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.02, rimRise + 0.01, rimThick), darkMahoganyMat);
  botRim.position.set(0, (rimRise + 0.01) / 2, plateH / 2 + rimThick / 2 - 0.005);
  tablePivot.add(botRim);

  for (const sx of [-1, 1]) {
    const sideRim = new THREE.Mesh(
      new THREE.BoxGeometry((frameW - plateW) / 2 + 0.01, rimRise, plateH + 0.01),
      darkMahoganyMat
    );
    sideRim.position.set(sx * (plateW / 2 + (frameW - plateW) / 4), rimRise / 2, 0);
    tablePivot.add(sideRim);
  }

  // Ornate brass corner brackets around table frame
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.032, 0.085), brassMat);
      corner.position.set(sx * (frameW / 2 - 0.03), 0.012, sz * (frameH / 2 - 0.03));
      tablePivot.add(corner);
    }
  }

  // Brass drafting pencil ledge & resting brass compass along bottom lip
  const pencilLedge = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.14, 0.016, 0.018), brassMat);
  pencilLedge.position.set(0, 0.038, plateH / 2 + 0.022);
  tablePivot.add(pencilLedge);

  // Glowing Backlit Glass Star-Map Plate!
  // PlaneGeometry rotated -PI/2 around X:
  //   local X = (u - 0.5) * plateW  (left-to-right)
  //   local Z = (v - 0.5) * plateH  (top-to-bottom, since v=0 is top = -Z, v=1 is bottom = +Z!)
  const starPlateMat = new THREE.MeshStandardMaterial({
    map: textures.constellationMap,
    emissiveMap: textures.constellationMap,
    emissive: new THREE.Color('#c8e4ff'),
    emissiveIntensity: 0.78,
    roughness: 0.52,
    metalness: 0.04,
    envMapIntensity: 0.14,
  });
  const starPlate = new THREE.Mesh(new THREE.PlaneGeometry(plateW, plateH), starPlateMat);
  starPlate.rotation.x = -Math.PI / 2;
  starPlate.position.y = 0.004;
  tablePivot.add(starPlate);

  // Subtle cool-cyan backlit glow light emanating upward from the star map
  const starTableGlow = new THREE.PointLight('#6bb6ff', 0.95, 2.5, 2);
  starTableGlow.position.set(0, 0.22, 0);
  tablePivot.add(starTableGlow);

  // Compute world-space FocusTarget looking straight perpendicular onto the sloped star plate!
  // Table center in world coords: (-4.45, 1.07, 0.55), local +Z points to world (+0.99, 0, +0.14)
  const lecternFocus: FocusTarget = {
    id: 'star_chart',
    label: 'Backlit Constellation Lectern',
    position: new THREE.Vector3(-3.72, 1.94, 0.65),
    lookAt: new THREE.Vector3(-4.46, 1.07, 0.55),
  };

  // Unified invisible bounding hitbox over the sloped drafting table top for steady standing hover
  const lecternHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.16, 1.0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  lecternHitbox.position.set(0, 0.03, 0);
  lecternHitbox.userData.interactableId = 'star_chart_lectern';
  tablePivot.add(lecternHitbox);

  // --- 8 RAISED TACTILE 3D BRASS & CRYSTAL STAR-NODES ---
  interface StarNodeVisual {
    id: string;
    label: string;
    localPos: THREE.Vector3;
    crystalMat: THREE.MeshPhysicalMaterial;
    auraRing: THREE.Mesh;
    auraMat: THREE.MeshStandardMaterial;
    crystalMesh: THREE.Mesh;
  }

  const starNodes: Record<string, StarNodeVisual> = {};
  const starNodeInteractables: Interactable[] = [];
  let flashErrorNode: string | null = null;
  let flashErrorTimer = 0;

  for (const [starKey, info] of Object.entries(CONSTELLATION_STAR_COORDS)) {
    const lx = (info.u - 0.5) * plateW;
    const lz = (info.v - 0.5) * plateH;
    const nodePos = new THREE.Vector3(lx, 0.006, lz);

    const nodeGroup = new THREE.Group();
    nodeGroup.position.copy(nodePos);
    tablePivot.add(nodeGroup);

    // Machined brass mounting grommet collar (unique material per node so hover highlights ONLY this star!)
    const grommetMat = brassMat.clone();
    const grommet = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.014, 16), grommetMat);
    grommet.position.y = 0.007;
    nodeGroup.add(grommet);

    const innerSocket = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 20), grommetMat);
    innerSocket.rotation.x = Math.PI / 2;
    innerSocket.position.y = 0.014;
    nodeGroup.add(innerSocket);

    // Faceted octahedral crystal star pin
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#cce6ff'),
      emissive: new THREE.Color('#6ea8ff'),
      emissiveIntensity: 0.25,
      roughness: 0.08,
      metalness: 0.1,
      transmission: 0.55,
      ior: 1.62,
      thickness: 0.02,
      clearcoat: 1.0,
    });
    const crystalMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), crystalMat);
    crystalMesh.scale.set(1, 1.35, 1);
    crystalMesh.position.y = 0.032;
    nodeGroup.add(crystalMesh);

    // Floating golden energy ring that glows when this star node is toggled ON
    const auraMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffe082'),
      emissive: new THREE.Color('#ffbe3b'),
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
      roughness: 0.2,
      metalness: 0.8,
    });
    const auraRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0032, 8, 24), auraMat);
    auraRing.rotation.x = Math.PI / 2;
    auraRing.position.y = 0.018;
    nodeGroup.add(auraRing);

    starNodes[starKey] = {
      id: starKey,
      label: info.label,
      localPos: new THREE.Vector3(lx, 0.026, lz),
      crystalMat,
      auraRing,
      auraMat,
      crystalMesh,
    };

    starNodeInteractables.push({
      id: `star_node_${starKey}`,
      object: nodeGroup,
      stationId: 'star_chart',
      focusOnly: true,
      cursor: 'pointer',
      label: (s) => {
        const active = s.starChartSelected.includes(starKey);
        if (active && s.puzzleConfig.starChartOrderMatters) {
          const orderNum = s.starChartSelected.indexOf(starKey) + 1;
          return `Star Node: ${info.label} (#${orderNum})`;
        }
        return `Star Node: ${info.label}${active ? ' (Lit)' : ''}`;
      },
      hint: (s) => {
        if (s.solved.star_chart) return 'Constellation circuit locked';
        if (s.puzzleConfig.starChartOrderMatters) {
          return s.starChartSelected.includes(starKey)
            ? 'Locked in sequence'
            : `Click in brightness pulse order (${s.starChartSelected.length + 1}/${s.puzzleConfig.starChartSolution.length})`;
        }
        return s.starChartSelected.includes(starKey)
          ? 'Click to extinguish'
          : 'Click to illuminate star node';
      },
      focusTarget: lecternFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (snap.solved.star_chart) {
          ctx.audio.playClick();
          ctx.ui.showToast('The constellation circuit is locked into the Star Table.');
          return;
        }
        const cfg = snap.puzzleConfig;
        const targetStars = cfg.starChartSolution;

        if (cfg.starChartOrderMatters) {
          const expectedKey = targetStars[snap.starChartSelected.length];
          if (starKey === expectedKey) {
            ctx.state.update((d) => {
              d.starChartSelected = [...d.starChartSelected, starKey];
            });
            const nextSelected = ctx.state.get().starChartSelected;
            if (nextSelected.length === targetStars.length) {
              ctx.state.markSolved('star_chart');
              ctx.audio.playPuzzleSolved();
              ctx.audio.playHeavyLatch();
              ctx.ui.showToast(
                'Constellation sequence complete! The Curio Cabinet door unlocks beside you!',
                4800
              );
            } else {
              ctx.audio.playClick();
              ctx.ui.showToast(
                `${info.label} locked (${nextSelected.length}/${targetStars.length}).`,
                1600
              );
            }
          } else {
            ctx.audio.playError();
            flashErrorNode = starKey;
            flashErrorTimer = 0.78;
            ctx.state.update((d) => {
              d.starChartSelected = [];
            });
            ctx.ui.showToast(
              'Wrong brightness sequence — watch the pulse order through the Telescope Eyepiece.',
              3200
            );
          }
          return;
        }

        // Unordered mode (Apprentice 3-star / Scholar 4-star exact set match)
        const already = snap.starChartSelected.includes(starKey);
        ctx.state.update((d) => {
          if (already) {
            d.starChartSelected = d.starChartSelected.filter((k) => k !== starKey);
          } else {
            d.starChartSelected = [...d.starChartSelected, starKey];
          }
        });
        ctx.audio.playClick();

        const nextSelected = ctx.state.get().starChartSelected;
        const solvedNow =
          nextSelected.length === targetStars.length &&
          targetStars.every((req) => nextSelected.includes(req));

        if (solvedNow) {
          ctx.state.markSolved('star_chart');
          ctx.audio.playPuzzleSolved();
          ctx.audio.playHeavyLatch();
          ctx.ui.showToast(
            'Constellation Circuit complete! The Curio Cabinet door unlocks beside you!',
            4800
          );
        } else {
          ctx.ui.showToast(
            already ? `${info.label} extinguished.` : `${info.label} illuminated.`,
            1500
          );
        }
      },
    });
  }

  // --- DYNAMIC GLOWING 3D GOLDEN BRASS-ENERGY FILAMENT LINES ---
  // Pool of cylindrical glowing energy beams connecting currently lit star nodes!
  const beamGroup = new THREE.Group();
  tablePivot.add(beamGroup);

  const MAX_BEAMS = 12;
  const beamMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffea96'),
    emissive: new THREE.Color('#ffbe38'),
    emissiveIntensity: 2.2,
    roughness: 0.15,
    metalness: 0.6,
  });
  const unitBeamGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 1, 8);
  const beamMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < MAX_BEAMS; i++) {
    const m = new THREE.Mesh(unitBeamGeo, beamMat);
    m.visible = false;
    m.userData.noRaycast = true;
    beamGroup.add(m);
    beamMeshes.push(m);
  }
  const beamUp = new THREE.Vector3(0, 1, 0);
  const beamDir = new THREE.Vector3();
  const beamMid = new THREE.Vector3();

  // ============================================================================
  // 2. MAHOGANY & BEVELED-GLASS CURIO CABINET at (-5.05, 0, -2.05) facing East
  // ============================================================================
  const cabinetGroup = new THREE.Group();
  cabinetGroup.position.set(-5.05, 0, -2.05);
  cabinetGroup.rotation.y = Math.PI / 2; // Local +Z faces East (+X) into the room!
  root.add(cabinetGroup);

  const cabW = 1.12;
  const cabD = 0.56;
  const cabH = 2.16;

  // Molded cabinet plinth base & bracket feet
  const cabBase = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.06, 0.18, cabD + 0.05), darkMahoganyMat);
  cabBase.position.y = 0.09;
  cabinetGroup.add(cabBase);

  const cabBaseMold = new THREE.Mesh(
    new THREE.BoxGeometry(cabW + 0.09, 0.04, cabD + 0.08),
    mahoganyMat
  );
  cabBaseMold.position.y = 0.19;
  cabinetGroup.add(cabBaseMold);

  // Back wall lined inside with plush burgundy velvet
  const cabBackWood = new THREE.Mesh(new THREE.BoxGeometry(cabW, cabH - 0.2, 0.04), darkMahoganyMat);
  cabBackWood.position.set(0, 0.2 + (cabH - 0.2) / 2, -cabD / 2 + 0.02);
  cabinetGroup.add(cabBackWood);

  const cabBackVelvet = new THREE.Mesh(
    new THREE.BoxGeometry(cabW - 0.12, cabH - 0.34, 0.015),
    burgundyVelvetMat
  );
  cabBackVelvet.position.set(0, 0.22 + (cabH - 0.34) / 2, -cabD / 2 + 0.045);
  cabinetGroup.add(cabBackVelvet);

  // 4 Fluted corner pilasters + side viewing glass panes
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.085, cabH - 0.22, 0.085), mahoganyMat);
      post.position.set(sx * (cabW / 2 - 0.042), 0.2 + (cabH - 0.22) / 2, sz * (cabD / 2 - 0.042));
      cabinetGroup.add(post);
    }

    // Side beveled glass panel
    const sideGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(cabD - 0.16, cabH - 0.44),
      glassMat
    );
    sideGlass.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    sideGlass.position.set(sx * (cabW / 2 - 0.025), 0.24 + (cabH - 0.44) / 2, 0);
    sideGlass.userData.noRaycast = true;
    cabinetGroup.add(sideGlass);

    // Side lower wood wainscot rail
    const sideRailBot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, cabD - 0.12), darkMahoganyMat);
    sideRailBot.position.set(sx * (cabW / 2 - 0.03), 0.28, 0);
    cabinetGroup.add(sideRailBot);
  }

  // Ornate stepped Victorian cornice crown molding + turned brass roof finial
  const crown1 = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.08, 0.07, cabD + 0.07), mahoganyMat);
  crown1.position.y = cabH - 0.05;
  cabinetGroup.add(crown1);

  const crown2 = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.16, 0.065, cabD + 0.14), darkMahoganyMat);
  crown2.position.y = cabH + 0.015;
  cabinetGroup.add(crown2);

  const crownPediment = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.12), mahoganyMat);
  crownPediment.position.set(0, cabH + 0.09, cabD / 2 - 0.06);
  cabinetGroup.add(crownPediment);

  const crownFinial = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), brassMat);
  crownFinial.scale.set(0.85, 1.45, 0.85);
  crownFinial.position.set(0, cabH + 0.18, cabD / 2 - 0.06);
  cabinetGroup.add(crownFinial);

  // 3 Interior Mahogany Shelves with brass front gallery trim
  const shelfYs = [0.64, 1.14, 1.62];
  for (const sy of shelfYs) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.14, 0.026, cabD - 0.12), mahoganyMat);
    shelf.position.set(0, sy, -0.01);
    cabinetGroup.add(shelf);
    const shelfTrim = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.14, 0.012, 0.012), agedBrassMat);
    shelfTrim.position.set(0, sy + 0.014, cabD / 2 - 0.07);
    cabinetGroup.add(shelfTrim);
  }

  // Recessed dark-mahogany & gilded-brass interior crown valance hiding top cabinet light
  const crownValance = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.1, 0.11, 0.036), darkMahoganyMat);
  crownValance.position.set(0, cabH - 0.14, cabD / 2 - 0.09);
  cabinetGroup.add(crownValance);
  const valanceTrim = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.12, 0.012, 0.014), agedBrassMat);
  valanceTrim.position.set(0, cabH - 0.195, cabD / 2 - 0.075);
  cabinetGroup.add(valanceTrim);

  // Soft warm museum display interior cabinet light tucked behind the crown valance
  const cabLight = new THREE.PointLight('#ffc878', 0.85, 2.2, 2);
  cabLight.position.set(0, 1.98, -0.06);
  cabinetGroup.add(cabLight);

  // --- INTERIOR STORYTELLING CURIOS (top & bottom shelves) ---
  // Top shelf left: Crystal optical prism on brass cradle
  const prismMat = new THREE.MeshPhysicalMaterial({
    color: '#d8efff',
    roughness: 0.08,
    transmission: 0.75,
    ior: 1.56,
    thickness: 0.06,
    envMapIntensity: 0.6,
  });
  const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.16, 3), prismMat);
  prism.rotation.z = Math.PI / 2;
  prism.position.set(-0.26, 1.69, 0.02);
  cabinetGroup.add(prism);

  // Top shelf right: Ornate Brass & Cut-Glass Victorian Hourglass with golden sand cones!
  const hourglassGroup = new THREE.Group();
  hourglassGroup.position.set(0.24, 1.635, 0.01);
  cabinetGroup.add(hourglassGroup);

  const hgBase = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.088, 0.02, 20), agedBrassMat);
  hgBase.position.y = 0.01;
  hourglassGroup.add(hgBase);
  const hgCap = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.02, 20), agedBrassMat);
  hgCap.position.y = 0.27;
  hourglassGroup.add(hgCap);
  const hgFinial = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), brassMat);
  hgFinial.position.y = 0.292;
  hourglassGroup.add(hgFinial);

  // 4 slim turned brass hourglass pillars
  for (let p = 0; p < 4; p++) {
    const a = (p / 4) * Math.PI * 2 + Math.PI / 4;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.25, 8), brassMat);
    rod.position.set(Math.cos(a) * 0.064, 0.14, Math.sin(a) * 0.064);
    hourglassGroup.add(rod);
  }

  // Hourglass glass bulbs (clear tinted glass cones meeting at brass waist)
  const hgGlassMat = new THREE.MeshPhysicalMaterial({
    color: '#d4e8f7',
    roughness: 0.06,
    transparent: true,
    opacity: 0.34,
    clearcoat: 1.0,
    envMapIntensity: 0.65,
  });
  const hgUpperGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.009, 0.115, 18), hgGlassMat);
  hgUpperGlass.position.y = 0.2;
  hourglassGroup.add(hgUpperGlass);
  const hgLowerGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.056, 0.115, 18), hgGlassMat);
  hgLowerGlass.position.y = 0.08;
  hourglassGroup.add(hgLowerGlass);

  // Shimmering golden sand piles inside upper & lower bulbs
  const sandMat = new THREE.MeshStandardMaterial({
    color: '#d8b062',
    roughness: 0.78,
    metalness: 0.12,
  });
  const sandBottom = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.068, 16), sandMat);
  sandBottom.position.y = 0.056;
  hourglassGroup.add(sandBottom);
  const sandTop = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.042, 16), sandMat);
  sandTop.rotation.x = Math.PI;
  sandTop.position.y = 0.165;
  hourglassGroup.add(sandTop);

  // Bottom shelf: Leather-bound gold-foiled astronomy books with ribbed spines & cream pages
  const leatherBookColors = ['#4d171a', '#183327', '#18243d', '#3e2314', '#522026', '#21352b'];
  const pageCreamMat = new THREE.MeshStandardMaterial({ color: '#d8c59e', roughness: 0.85 });
  for (let b = 0; b < 6; b++) {
    const bh = 0.24 + (b % 3) * 0.036;
    const bw = 0.044 + (b % 2) * 0.008;
    const bookGroup = new THREE.Group();
    bookGroup.position.set(-0.34 + b * 0.056, 0.653 + bh / 2, -0.02);
    if (b === 5) {
      bookGroup.position.x += 0.035;
      bookGroup.rotation.z = -0.18;
    }
    cabinetGroup.add(bookGroup);

    const coverMat = new THREE.MeshStandardMaterial({
      map: textures.leather.map,
      color: leatherBookColors[b % leatherBookColors.length],
      roughness: 0.58,
      metalness: 0.05,
    });
    const bookBody = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.22), coverMat);
    bookGroup.add(bookBody);

    // Cream page block recessed slightly inside top/bottom covers
    const pages = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.01, bh - 0.016, 0.2), pageCreamMat);
    pages.position.z = -0.006;
    bookGroup.add(pages);

    // 4 raised gold-foil spine bands facing +Z
    for (const fy of [-bh * 0.34, -bh * 0.16, bh * 0.16, bh * 0.34]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.003, 0.007, 0.008), brassMat);
      band.position.set(0, fy, 0.111);
      bookGroup.add(band);
    }
  }

  // Bottom shelf right: Brass celestial globe / armillary orb on turned mahogany base
  const brassOrbCurio = new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 14), agedBrassMat);
  brassOrbCurio.position.set(0.24, 0.76, 0.02);
  cabinetGroup.add(brassOrbCurio);
  const orbMeridian = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.006, 8, 28), brassMat);
  orbMeridian.position.set(0.24, 0.76, 0.02);
  orbMeridian.rotation.y = 0.4;
  cabinetGroup.add(orbMeridian);
  const curioStand = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.072, 0.065, 16), darkMahoganyMat);
  curioStand.position.set(0.24, 0.685, 0.02);
  cabinetGroup.add(curioStand);

  // --- CENTER SHELF: PLUSH VELVET CUSHION PEDESTAL & SATURN BRASS GEAR PICKUP ---
  const gearStandBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.038, 0.28), darkMahoganyMat);
  gearStandBase.position.set(0, 1.172, 0.02);
  cabinetGroup.add(gearStandBase);
  const gearStandTrim = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.009, 0.29), agedBrassMat);
  gearStandTrim.position.set(0, 1.192, 0.02);
  cabinetGroup.add(gearStandTrim);

  // Plush tufted crimson velvet display cushion with 4 corner gold tassels
  const velvetPillowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5a101d'),
    roughness: 0.92,
    metalness: 0.02,
  });
  const velvetPillow = new THREE.Mesh(new THREE.SphereGeometry(0.145, 22, 14), velvetPillowMat);
  velvetPillow.scale.set(1.06, 0.24, 0.84);
  velvetPillow.position.set(0, 1.218, 0.02);
  cabinetGroup.add(velvetPillow);

  for (const tx of [-1, 1]) {
    for (const tz of [-1, 1]) {
      const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), brassMat);
      tassel.position.set(tx * 0.135, 1.202, 0.02 + tz * 0.105);
      cabinetGroup.add(tassel);
    }
  }

  const saturnGearPickup = new THREE.Group();
  saturnGearPickup.position.set(0, 1.33, 0.03);
  cabinetGroup.add(saturnGearPickup);

  const gearBrassMat = brassMat.clone();
  gearBrassMat.emissive.set('#402b08');
  gearBrassMat.emissiveIntensity = 0.25;

  const gearMesh = new THREE.Mesh(createExtrudedGearGeometry(18, 0.088, 0.112, 0.028, 0.02), gearBrassMat);
  saturnGearPickup.add(gearMesh);

  // Raised ringed Saturn emblem sculpted at the center of the brass gear!
  const saturnCore = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), gearBrassMat);
  saturnGearPickup.add(saturnCore);
  const saturnEmblemRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.0055, 8, 28), gearBrassMat);
  saturnEmblemRing.rotation.x = Math.PI * 0.36;
  saturnEmblemRing.rotation.y = 0.35;
  saturnGearPickup.add(saturnEmblemRing);

  const gearSparkleLight = new THREE.PointLight('#ffd166', 0.55, 1.0, 2);
  gearSparkleLight.position.set(0, 0.04, 0.12);
  saturnGearPickup.add(gearSparkleLight);

  // --- HINGED BEVELED-GLASS FRONT DOOR (swings open -102° when star_chart solved!) ---
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-cabW / 2 + 0.08, 0.22, cabD / 2 - 0.025);
  cabinetGroup.add(doorPivot);

  const doorW = cabW - 0.16;
  const doorH = cabH - 0.34;
  const doorFrameMat = mahoganyMat.clone();
  const stileW = 0.068;

  // 4 door frame stiles & rails
  const leftStile = new THREE.Mesh(new THREE.BoxGeometry(stileW, doorH, 0.034), doorFrameMat);
  leftStile.position.set(stileW / 2, doorH / 2, 0);
  doorPivot.add(leftStile);

  const rightStile = new THREE.Mesh(new THREE.BoxGeometry(stileW, doorH, 0.034), doorFrameMat);
  rightStile.position.set(doorW - stileW / 2, doorH / 2, 0);
  doorPivot.add(rightStile);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.075, 0.034), doorFrameMat);
  topRail.position.set(doorW / 2, doorH - 0.0375, 0);
  doorPivot.add(topRail);

  const botRail = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.12, 0.034), doorFrameMat);
  botRail.position.set(doorW / 2, 0.06, 0);
  doorPivot.add(botRail);

  // Decorative brass mullion bars framing the beveled glass pane
  const doorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW - stileW * 2, doorH - 0.195),
    glassMat
  );
  doorGlass.position.set(doorW / 2, doorH / 2 + 0.02, 0);
  doorGlass.userData.noRaycast = true;
  doorPivot.add(doorGlass);

  // Brass electromagnetic lock clasp & handle on right edge of door
  const lockEscutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.11, 0.016), brassMat);
  lockEscutcheon.position.set(doorW - 0.035, doorH * 0.52, 0.022);
  doorPivot.add(lockEscutcheon);

  const doorKnob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), brassMat);
  doorKnob.position.set(doorW - 0.035, doorH * 0.52 + 0.025, 0.044);
  doorPivot.add(doorKnob);

  // ============================================================================
  // INTERACTABLES & COLLIDERS
  // ============================================================================
  enableShadows(root, true, true);
  starPlate.castShadow = false;
  doorGlass.castShadow = false;
  prism.castShadow = false;
  hgUpperGlass.castShadow = false;
  hgLowerGlass.castShadow = false;
  lecternHitbox.castShadow = false;
  lecternHitbox.receiveShadow = false;

  const interactables: Interactable[] = [
    {
      id: 'star_chart_lectern',
      object: lightBoxBody,
      stationId: 'star_chart',
      cursor: 'inspect',
      label: (s) =>
        s.solved.star_chart
          ? 'Backlit Star Chart (Circuit Complete)'
          : 'Backlit Constellation Lectern',
      getHint: () => 'Click to step in & inspect',
      focusTarget: lecternFocus,
      onInteract: (ctx) => {
        ctx.audio.playClick();
        ctx.focusOn(lecternFocus);
      },
    },
    ...starNodeInteractables,
    {
      id: 'curio_cabinet_door',
      object: doorPivot,
      cursor: 'pointer',
      label: (s) =>
        s.solved.star_chart ? 'Curio Cabinet (Unlocked)' : 'Locked Glass Curio Cabinet',
      hint: (s) =>
        s.solved.star_chart
          ? 'Door unlocked'
          : 'Linked to the Constellation Star Table',
      enabled: (s) => !s.solved.star_chart,
      onInteract: (ctx) => {
        ctx.audio.playError();
        ctx.ui.showToast(
          'The Curio Cabinet is sealed by a brass latch wired to the Constellation Lectern.'
        );
      },
    },
    {
      id: 'pickup_saturn_gear',
      object: saturnGearPickup,
      cursor: 'pointer',
      label: 'Saturn Brass Gear',
      hint: 'Click to collect',
      enabled: (s) =>
        s.solved.star_chart &&
        !s.inventory.includes('saturn_gear') &&
        !s.placedItems.includes('saturn_gear') &&
        !s.orreryGearInstalled,
      onInteract: (ctx) => {
        ctx.state.addItem('saturn_gear');
        ctx.audio.playPickup();
        ctx.ui.showToast('Collected Saturn Brass Gear — machined for the Central Orrery!');
      },
    },
  ];

  const colliders: ColliderBox[] = [
    { minX: -5.06, maxX: -3.84, minZ: -0.12, maxZ: 1.22, label: 'Star Chart Lectern' },
    { minX: -5.48, maxX: -4.64, minZ: -2.68, maxZ: -1.42, label: 'Curio Cabinet' },
  ];

  // Animation state
  let currentDoorAngle = 0;

  const update = (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>): void => {
    const smooth = 1 - Math.exp(-5.0 * delta);

    // Subtle living pulse on backlit star-map glass (glare-free balanced emission)
    starPlateMat.emissiveIntensity = state.solved.star_chart
      ? 0.92 + Math.sin(elapsed * 2.4) * 0.06
      : 0.76 + Math.sin(elapsed * 1.5) * 0.03;

    if (flashErrorTimer > 0) {
      flashErrorTimer = Math.max(0, flashErrorTimer - delta);
      if (flashErrorTimer === 0) {
        flashErrorNode = null;
      }
    }

    const targetStars = state.puzzleConfig.starChartSolution;

    // Update each of the 8 crystal star nodes
    for (const [key, node] of Object.entries(starNodes)) {
      const isFlashingError = flashErrorTimer > 0 && flashErrorNode === key;
      const lit =
        state.starChartSelected.includes(key) ||
        (state.solved.star_chart && targetStars.includes(key));

      if (isFlashingError) {
        node.crystalMat.color.set('#ff6b7a');
        node.crystalMat.emissive.set('#ff1838');
        node.crystalMat.emissiveIntensity = 2.8 + Math.sin(elapsed * 28) * 0.6;
        node.auraMat.color.set('#ff4558');
        node.auraMat.emissive.set('#ff1838');
        node.auraMat.emissiveIntensity = 2.2;
        node.auraMat.opacity = 0.95;
        node.auraRing.rotation.z = -elapsed * 5.0;
      } else if (lit) {
        node.crystalMat.color.set('#fff3c4');
        node.crystalMat.emissive.set('#ffc642');
        node.crystalMat.emissiveIntensity = state.solved.star_chart
          ? 2.45 + Math.sin(elapsed * 3.8) * 0.25
          : 1.95 + Math.sin(elapsed * 3.0) * 0.2;
        node.auraMat.color.set('#ffe082');
        node.auraMat.emissive.set('#ffbe3b');
        node.auraMat.emissiveIntensity = 1.9;
        node.auraMat.opacity = 0.92;
        node.auraRing.rotation.z = elapsed * 1.6;
        node.crystalMesh.rotation.y = elapsed * 1.4;
      } else {
        node.crystalMat.color.set('#b8d6f5');
        node.crystalMat.emissive.set('#5e96e8');
        node.crystalMat.emissiveIntensity = 0.22;
        node.auraMat.emissiveIntensity = 0;
        node.auraMat.opacity = 0;
        node.crystalMesh.rotation.y = elapsed * 0.25;
      }
    }

    // Update dynamic glowing golden brass-energy filament lines connecting lit stars!
    const activeKeys = state.solved.star_chart
      ? [...targetStars]
      : state.starChartSelected.filter((k) => Boolean(starNodes[k]));

    const pairs: Array<[THREE.Vector3, THREE.Vector3]> = [];
    if (state.puzzleConfig.starChartOrderMatters) {
      // Master ordered path: trace sequentially 1 → 2 → 3 → 4 → 5!
      for (let i = 0; i < Math.min(activeKeys.length - 1, MAX_BEAMS); i++) {
        pairs.push([starNodes[activeKeys[i]].localPos, starNodes[activeKeys[i + 1]].localPos]);
      }
    } else if (activeKeys.length === 2) {
      pairs.push([starNodes[activeKeys[0]].localPos, starNodes[activeKeys[1]].localPos]);
    } else if (activeKeys.length >= 3) {
      // Closed luminous polygon circuit (3-star triangle on Apprentice, 4-star quad on Scholar)
      for (let i = 0; i < Math.min(activeKeys.length, MAX_BEAMS); i++) {
        const a = starNodes[activeKeys[i]].localPos;
        const b = starNodes[activeKeys[(i + 1) % activeKeys.length]].localPos;
        pairs.push([a, b]);
      }
    }

    beamMat.emissiveIntensity = state.solved.star_chart
      ? 2.6 + Math.sin(elapsed * 4.0) * 0.35
      : 1.9 + Math.sin(elapsed * 2.8) * 0.2;

    for (let i = 0; i < MAX_BEAMS; i++) {
      const beam = beamMeshes[i];
      if (i < pairs.length) {
        const [pA, pB] = pairs[i];
        beamDir.subVectors(pB, pA);
        const dist = beamDir.length();
        beamMid.addVectors(pA, pB).multiplyScalar(0.5);
        beam.position.copy(beamMid);
        beam.scale.set(1, dist, 1);
        beam.quaternion.setFromUnitVectors(beamUp, beamDir.normalize());
        beam.visible = true;
      } else {
        beam.visible = false;
      }
    }

    // Smoothly swing Curio Cabinet glass door open -102° once star_chart is solved!
    const targetDoor = state.solved.star_chart ? -THREE.MathUtils.degToRad(102) : 0;
    currentDoorAngle += (targetDoor - currentDoorAngle) * smooth;
    doorPivot.rotation.y = currentDoorAngle;

    // Saturn Brass Gear pickup visibility & stately museum display rotation
    const showGear = !state.inventory.includes('saturn_gear') && !state.orreryGearInstalled;
    saturnGearPickup.visible = showGear;
    if (showGear) {
      saturnGearPickup.rotation.y = elapsed * 0.55;
      saturnGearPickup.position.y = 1.33 + Math.sin(elapsed * 2.2) * 0.006;
      gearSparkleLight.intensity = state.solved.star_chart
        ? 0.95 + Math.sin(elapsed * 3.2) * 0.2
        : 0.45;
    } else {
      gearSparkleLight.intensity = 0;
    }
  };

  return { group: root, interactables, colliders, update };
}
