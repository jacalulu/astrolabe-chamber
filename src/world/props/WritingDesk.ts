import * as THREE from 'three';
import {
  LUNAR_PHASE_NAMES,
  type ColliderBox,
  type FocusTarget,
  type GameStateSnapshot,
  type Interactable,
  type PropModuleResult,
  type TextureBundle,
} from '../../types';

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV'] as const;

function enableShadows(root: THREE.Object3D, cast = true, receive = true): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}

function createTurnedLegGeometry(height: number, maxRadius: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(maxRadius * 0.62, 0),
    new THREE.Vector2(maxRadius * 0.68, height * 0.04),
    new THREE.Vector2(maxRadius * 0.52, height * 0.09),
    new THREE.Vector2(maxRadius * 0.78, height * 0.16),
    new THREE.Vector2(maxRadius * 0.56, height * 0.24),
    new THREE.Vector2(maxRadius * 0.68, height * 0.55),
    new THREE.Vector2(maxRadius * 0.88, height * 0.76),
    new THREE.Vector2(maxRadius * 0.72, height * 0.84),
    new THREE.Vector2(maxRadius * 0.98, height * 0.92),
    new THREE.Vector2(maxRadius * 0.98, height),
    new THREE.Vector2(0.001, height),
  ];
  return new THREE.LatheGeometry(pts, 20);
}

/**
 * Generates a high-resolution 1024x192 enamel-and-gold lunar dial strip texture.
 * Mapped onto a cylinder rotated by `rotation.z = +Math.PI / 2`:
 * +canvasX -> screen UP (+theta), +canvasY -> screen RIGHT (-v).
 * Therefore rotating drawing context by +Math.PI / 2 renders every icon & numeral upright!
 */
function createLunarDialTexture(dialIndex: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Deep enameled midnight-indigo background with high contrast for crisp lunar icons
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#070d1d');
  bg.addColorStop(0.5, '#0e1b38');
  bg.addColorStop(1, '#060c1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Brass edge borders along cylinder rims (canvasY near 0 and h)
  ctx.fillStyle = '#d4a64a';
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, h - 12, w, 12);
  ctx.fillStyle = '#4a3310';
  ctx.fillRect(0, 12, w, 4);
  ctx.fillRect(0, h - 16, w, 4);

  const cellW = w / 8;

  for (let phase = 0; phase < 8; phase++) {
    const cx = (phase + 0.5) * cellW;
    const cy = h * 0.5;

    // Bright gold engraved divider ribs between phases
    ctx.strokeStyle = 'rgba(235, 195, 108, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(phase * cellW, 14);
    ctx.lineTo(phase * cellW, h - 14);
    ctx.stroke();

    // Draw upright in screen space (+dx = right, +dy = down)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);

    // Crisp engraved brass halo ring around the moon glyph
    const r = 36;
    ctx.strokeStyle = 'rgba(240, 204, 120, 0.85)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, -8, r + 5, 0, Math.PI * 2);
    ctx.stroke();

    // Dark side of the moon disc
    ctx.fillStyle = '#070c18';
    ctx.beginPath();
    ctx.arc(0, -8, r, 0, Math.PI * 2);
    ctx.fill();

    // Illuminated moon phase geometry
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, -8, r - 1, 0, Math.PI * 2);
    ctx.clip();

    const moonGrad = ctx.createRadialGradient(-8, -16, 4, 0, -8, r);
    moonGrad.addColorStop(0, '#fffdf0');
    moonGrad.addColorStop(0.65, '#f8e2a6');
    moonGrad.addColorStop(1, '#d4af5e');
    ctx.fillStyle = moonGrad;

    if (phase === 0) {
      // New Moon: dark disc with crisp double silver-gold eclipse rim
      ctx.strokeStyle = 'rgba(245, 220, 152, 0.9)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, -8, r - 2.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (phase === 1) {
      // Waxing Crescent (right sliver)
      ctx.beginPath();
      ctx.arc(0, -8, r, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(0, -8, r * 0.48, r, 0, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      ctx.fill();
    } else if (phase === 2) {
      // First Quarter (right half)
      ctx.fillRect(0, -8 - r, r, r * 2);
    } else if (phase === 3) {
      // Waxing Gibbous (right 3/4)
      ctx.beginPath();
      ctx.arc(0, -8, r, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(0, -8, r * 0.48, r, 0, Math.PI / 2, -Math.PI / 2, false);
      ctx.closePath();
      ctx.fill();
    } else if (phase === 4) {
      // Full Moon
      ctx.beginPath();
      ctx.arc(0, -8, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(130, 102, 54, 0.24)';
      ctx.beginPath();
      ctx.arc(-9, -14, 11, 0, Math.PI * 2);
      ctx.arc(8, -4, 8, 0, Math.PI * 2);
      ctx.arc(-4, 4, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (phase === 5) {
      // Waning Gibbous (left 3/4)
      ctx.beginPath();
      ctx.arc(0, -8, r, Math.PI / 2, -Math.PI / 2, false);
      ctx.ellipse(0, -8, r * 0.48, r, 0, -Math.PI / 2, Math.PI / 2, false);
      ctx.closePath();
      ctx.fill();
    } else if (phase === 6) {
      // Last Quarter (left half)
      ctx.fillRect(-r, -8 - r, r, r * 2);
    } else if (phase === 7) {
      // Waning Crescent (left sliver)
      ctx.beginPath();
      ctx.arc(0, -8, r, Math.PI / 2, -Math.PI / 2, false);
      ctx.ellipse(0, -8, r * 0.48, r, 0, -Math.PI / 2, Math.PI / 2, true);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // High-contrast crisp phase short label underneath moon
    const shortLabels = ['NEW', 'WAX CRES', '1ST QTR', 'WAX GIB', 'FULL', 'WAN GIB', 'LAST QTR', 'WAN CRES'];
    ctx.fillStyle = '#fff0be';
    ctx.font = 'bold 16px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shortLabels[phase], 0, 44);

    // Crisp dial index top watermark
    ctx.fillStyle = 'rgba(242, 208, 128, 0.85)';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.fillText(ROMAN_NUMERALS[dialIndex], 0, -54);

    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function buildWritingDesk(textures: TextureBundle): PropModuleResult {
  const root = new THREE.Group();
  root.name = 'WritingDeskStation';

  // Desk assembly positioned at (4.75, 0, -0.45), facing West (-X) toward room center
  // With rotation.y = -Math.PI / 2:
  //   local +Z -> world -X (front of desk)
  //   local -X -> world -Z (player's LEFT when standing West looking East)
  //   local +X -> world +Z (player's RIGHT when standing West looking East)
  const deskGroup = new THREE.Group();
  deskGroup.position.set(4.75, 0, -0.45);
  deskGroup.rotation.y = -Math.PI / 2;
  root.add(deskGroup);

  // Shared PBR Materials
  const mahoganyMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.012,
    roughnessMap: textures.walnut.roughnessMap,
    color: new THREE.Color('#6a3b26'),
    roughness: 0.42,
    metalness: 0.06,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    map: textures.walnut.map,
    bumpMap: textures.walnut.bumpMap,
    bumpScale: 0.01,
    color: new THREE.Color('#3b1f14'),
    roughness: 0.36,
    metalness: 0.08,
  });

  const brassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    bumpMap: textures.brass.bumpMap,
    bumpScale: 0.008,
    roughnessMap: textures.brass.roughnessMap,
    color: new THREE.Color('#d9b05b'),
    roughness: 0.28,
    metalness: 0.88,
  });

  const darkBrassMat = new THREE.MeshStandardMaterial({
    map: textures.brass.map,
    color: new THREE.Color('#9e7834'),
    roughness: 0.38,
    metalness: 0.84,
  });

  const leatherMat = new THREE.MeshStandardMaterial({
    map: textures.leather.map,
    bumpMap: textures.leather.bumpMap,
    bumpScale: 0.01,
    roughnessMap: textures.leather.roughnessMap,
    color: new THREE.Color('#4f1c18'),
    roughness: 0.62,
    metalness: 0.04,
  });

  const velvetMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#131b38'),
    roughness: 0.92,
    metalness: 0.02,
  });

  const parchmentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d4bc8e'),
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity: 0.2,
  });

  // ============================================================================
  // 1. ORNATE VICTORIAN MAHOGANY WRITING DESK (2.0m W x 0.95m D x 0.78m H)
  // ============================================================================
  const deskW = 2.0;
  const deskD = 0.95;
  const deskH = 0.78;

  // Molded double-tier desktop slab
  const topSlab = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.045, deskD), mahoganyMat);
  topSlab.position.set(0, deskH - 0.0225, 0);
  deskGroup.add(topSlab);

  const topUnderMolding = new THREE.Mesh(
    new THREE.BoxGeometry(deskW - 0.05, 0.032, deskD - 0.05),
    darkTrimMat
  );
  topUnderMolding.position.set(0, deskH - 0.06, 0);
  deskGroup.add(topUnderMolding);

  // Brass edge fillet framing desktop
  const brassBorderFront = new THREE.Mesh(new THREE.BoxGeometry(deskW + 0.008, 0.012, 0.012), brassMat);
  brassBorderFront.position.set(0, deskH - 0.022, deskD / 2);
  deskGroup.add(brassBorderFront);

  // Inlaid oxblood leather writing blotter with thin brass surround
  const blotterRim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.006, 0.68), brassMat);
  blotterRim.position.set(0, deskH + 0.001, 0.04);
  deskGroup.add(blotterRim);

  const blotter = new THREE.Mesh(new THREE.BoxGeometry(1.53, 0.008, 0.65), leatherMat);
  blotter.position.set(0, deskH + 0.002, 0.04);
  deskGroup.add(blotter);

  // Left & Right Drawer Pedestals (3 graduated drawers each)
  const pedW = 0.48;
  const pedD = 0.84;
  const pedH = 0.62;
  for (const side of [-1, 1]) {
    const px = side * (deskW / 2 - pedW / 2 - 0.05);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(pedW, pedH, pedD), mahoganyMat);
    pedestal.position.set(px, 0.1 + pedH / 2, -0.02);
    deskGroup.add(pedestal);

    // Molded pedestal base skirt
    const pedBase = new THREE.Mesh(new THREE.BoxGeometry(pedW + 0.04, 0.055, pedD + 0.04), darkTrimMat);
    pedBase.position.set(px, 0.085, -0.02);
    deskGroup.add(pedBase);

    // 4 short turned bun feet with brass sabots under each pedestal
    for (const fx of [-1, 1]) {
      for (const fz of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.06, 14), darkTrimMat);
        foot.position.set(px + fx * (pedW / 2 - 0.05), 0.03, -0.02 + fz * (pedD / 2 - 0.06));
        deskGroup.add(foot);
        const sabot = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.021, 0.022, 14), brassMat);
        sabot.position.set(px + fx * (pedW / 2 - 0.05), 0.011, -0.02 + fz * (pedD / 2 - 0.06));
        deskGroup.add(sabot);
      }
    }

    // 3 Graduated Drawer Fronts + Brass Escutcheons & Bail Pulls
    const drawerHeights = [0.145, 0.175, 0.21];
    let curY = 0.695;
    for (const dh of drawerHeights) {
      const cy = curY - dh / 2;
      curY -= dh + 0.022;

      const dFront = new THREE.Mesh(new THREE.BoxGeometry(pedW - 0.06, dh, 0.022), darkTrimMat);
      dFront.position.set(px, cy, pedD / 2 - 0.01);
      deskGroup.add(dFront);

      const dInset = new THREE.Mesh(new THREE.BoxGeometry(pedW - 0.1, dh - 0.034, 0.012), mahoganyMat);
      dInset.position.set(px, cy, pedD / 2 + 0.002);
      deskGroup.add(dInset);

      // Ornate brass backplate + curved bail pull handle
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.034, 0.008), brassMat);
      plate.position.set(px, cy, pedD / 2 + 0.011);
      deskGroup.add(plate);

      const bail = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0055, 8, 16, Math.PI), brassMat);
      bail.position.set(px, cy - 0.004, pedD / 2 + 0.018);
      bail.rotation.x = Math.PI * 0.85;
      deskGroup.add(bail);
    }

    // Decorative fluted corner pilasters on the pedestal front corners
    const pilasterGeo = createTurnedLegGeometry(pedH, 0.024);
    for (const cx of [-1, 1]) {
      const pilaster = new THREE.Mesh(pilasterGeo, darkTrimMat);
      pilaster.position.set(px + cx * (pedW / 2 - 0.008), 0.1, pedD / 2 - 0.02);
      deskGroup.add(pilaster);
    }
  }

  // Center kneehole apron drawer & carved modesty back panel
  const centerDrawer = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.11, 0.78), mahoganyMat);
  centerDrawer.position.set(0, deskH - 0.125, -0.02);
  deskGroup.add(centerDrawer);

  const centerFront = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.088, 0.02), darkTrimMat);
  centerFront.position.set(0, deskH - 0.125, 0.378);
  deskGroup.add(centerFront);

  for (const hx of [-0.22, 0.22]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), brassMat);
    knob.position.set(hx, deskH - 0.125, 0.398);
    deskGroup.add(knob);
  }

  const backModesty = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.56, 0.035), darkTrimMat);
  backModesty.position.set(0, 0.38, -0.39);
  deskGroup.add(backModesty);

  // ============================================================================
  // 2. RAISED REAR PIGEONHOLE GALLERY HUTCH
  // ============================================================================
  const hutchZ = -0.35;
  const hutchW = 1.92;
  const hutchD = 0.22;
  const hutchH = 0.24;

  const hutchBack = new THREE.Mesh(new THREE.BoxGeometry(hutchW, hutchH, 0.022), darkTrimMat);
  hutchBack.position.set(0, deskH + hutchH / 2, hutchZ - hutchD / 2 + 0.011);
  deskGroup.add(hutchBack);

  const hutchTop = new THREE.Mesh(new THREE.BoxGeometry(hutchW + 0.03, 0.024, hutchD + 0.02), mahoganyMat);
  hutchTop.position.set(0, deskH + hutchH + 0.012, hutchZ);
  deskGroup.add(hutchTop);

  // Brass balustrade gallery rail along the hutch crown
  const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, hutchW - 0.06, 10), brassMat);
  railBar.rotation.z = Math.PI / 2;
  railBar.position.set(0, deskH + hutchH + 0.068, hutchZ - hutchD / 2 + 0.025);
  deskGroup.add(railBar);

  for (let i = 0; i < 15; i++) {
    const rx = -hutchW / 2 + 0.06 + (i / 14) * (hutchW - 0.12);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.048, 8), brassMat);
    post.position.set(rx, deskH + hutchH + 0.044, hutchZ - hutchD / 2 + 0.025);
    deskGroup.add(post);
  }

  // Vertical pigeonhole dividers & tiny brass-knobbed cubby drawers
  const dividerXs = [-0.94, -0.58, -0.22, 0.22, 0.58, 0.94];
  for (const dx of dividerXs) {
    const div = new THREE.Mesh(new THREE.BoxGeometry(0.02, hutchH, hutchD), mahoganyMat);
    div.position.set(dx, deskH + hutchH / 2, hutchZ);
    deskGroup.add(div);
  }

  // Small stacked parchment envelopes & letters tucked inside pigeonholes
  for (const cx of [-0.76, -0.4, 0.4, 0.76]) {
    // Mini drawer in lower half of outer cubbies
    if (Math.abs(cx) > 0.6) {
      const miniD = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.095, hutchD - 0.03), darkTrimMat);
      miniD.position.set(cx, deskH + 0.052, hutchZ + 0.005);
      deskGroup.add(miniD);
      const miniKnob = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), brassMat);
      miniKnob.position.set(cx, deskH + 0.052, hutchZ + hutchD / 2);
      deskGroup.add(miniKnob);
    } else {
      // Stacked correspondence sheets
      for (let s = 0; s < 4; s++) {
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.009, 0.15), parchmentMat);
        sheet.position.set(cx + (s - 1.5) * 0.006, deskH + 0.012 + s * 0.011, hutchZ + 0.01);
        sheet.rotation.y = (s - 1.5) * 0.05;
        deskGroup.add(sheet);
      }
    }
  }

  // ============================================================================
  // 3. CARVED VICTORIAN SWIVEL DESK CHAIR at world (3.75, 0, -0.35)
  // ============================================================================
  const chairGroup = new THREE.Group();
  chairGroup.position.set(3.75, 0, -0.35);
  chairGroup.rotation.y = Math.PI / 2 + 0.34; // Angled invitingly toward the desk
  root.add(chairGroup);

  // 4 splayed curved wood legs with brass casters
  const chairHub = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.14, 14), darkTrimMat);
  chairHub.position.y = 0.16;
  chairGroup.add(chairHub);

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const legGroup = new THREE.Group();
    legGroup.rotation.y = a;
    const legBeam = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.045, 0.32), darkTrimMat);
    legBeam.position.set(0, 0.1, 0.14);
    legBeam.rotation.x = 0.36;
    legGroup.add(legBeam);
    const casterWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.016, 12), brassMat);
    casterWheel.rotation.z = Math.PI / 2;
    casterWheel.position.set(0, 0.018, 0.275);
    legGroup.add(casterWheel);
    chairGroup.add(legGroup);
  }

  // Threaded cast-iron swivel spindle
  const ironMat = new THREE.MeshStandardMaterial({
    map: textures.darkIron.map,
    roughness: 0.48,
    metalness: 0.78,
    color: new THREE.Color('#2c2e33'),
  });
  const chairSpindle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 12), ironMat);
  chairSpindle.position.y = 0.32;
  chairGroup.add(chairSpindle);

  // Contoured mahogany seat frame + tufted oxblood leather cushion
  const seatBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.045, 22), mahoganyMat);
  seatBase.position.y = 0.46;
  chairGroup.add(seatBase);

  const seatCushion = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.235, 0.042, 22), leatherMat);
  seatCushion.scale.set(1, 0.75, 1);
  seatCushion.position.y = 0.495;
  chairGroup.add(seatCushion);

  // Curved steam-bent mahogany backrest rail & turned spindles aligned along -Z semicircle
  const backRail = new THREE.Mesh(
    new THREE.TorusGeometry(0.225, 0.022, 10, 24, Math.PI),
    mahoganyMat
  );
  backRail.rotation.set(-Math.PI / 2, 0, 0);
  backRail.position.set(0, 0.86, 0);
  chairGroup.add(backRail);

  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.5 + (i / 6) * Math.PI;
    const sx = Math.sin(a) * 0.225;
    const sz = -Math.cos(a) * 0.225;
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.38, 10), mahoganyMat);
    spindle.position.set(sx, 0.67, sz);
    chairGroup.add(spindle);
  }

  // ============================================================================
  // 4. STORYTELLING PROPS ON DESKTOP
  // ============================================================================

  // --- 4A. GLOWING EMERALD BANKER'S LAMP (local left-rear: -0.70, deskH, -0.14) ---
  const lampGroup = new THREE.Group();
  lampGroup.position.set(-0.72, deskH, -0.12);
  lampGroup.rotation.y = 0.45;
  deskGroup.add(lampGroup);

  const lampBasePts = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.085, 0),
    new THREE.Vector2(0.082, 0.018),
    new THREE.Vector2(0.062, 0.028),
    new THREE.Vector2(0.056, 0.044),
    new THREE.Vector2(0.026, 0.058),
    new THREE.Vector2(0.016, 0.08),
  ];
  const lampBase = new THREE.Mesh(new THREE.LatheGeometry(lampBasePts, 24), brassMat);
  lampGroup.add(lampBase);

  // Curved brass gooseneck arm
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.075, 0),
    new THREE.Vector3(0, 0.24, -0.025),
    new THREE.Vector3(0, 0.38, 0.015),
    new THREE.Vector3(0, 0.415, 0.075),
  ]);
  const lampNeck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 20, 0.009, 10, false), brassMat);
  lampGroup.add(lampNeck);

  // Brass shade yoke & deep Victorian emerald-jade curved glass trough shade
  const shadeGroup = new THREE.Group();
  shadeGroup.position.set(0, 0.405, 0.085);
  shadeGroup.rotation.x = 0.28;
  lampGroup.add(shadeGroup);

  const emeraldGlassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c633a'),
    emissive: new THREE.Color('#0a4d2c'),
    emissiveIntensity: 0.48,
    roughness: 0.16,
    metalness: 0.06,
    transmission: 0.22,
    thickness: 0.025,
    clearcoat: 0.9,
    envMapIntensity: 0.65,
    side: THREE.DoubleSide,
  });

  // Gently bowed curved emerald glass trough (open bottom, solid arched upper hood!)
  const shadeCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.072, 0.23, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
    emeraldGlassMat
  );
  shadeCyl.rotation.z = Math.PI / 2;
  shadeCyl.rotation.x = -Math.PI / 2;
  shadeGroup.add(shadeCyl);

  // Sculpted brass trim strips along the front & back lower lips of the shade
  for (const sz of [-0.066, 0.066]) {
    const lipTrim = new THREE.Mesh(new THREE.BoxGeometry(0.234, 0.009, 0.009), darkBrassMat);
    lipTrim.position.set(0, 0.015, sz);
    shadeGroup.add(lipTrim);
  }

  // Dark antique-brass sculpted endcaps + side pivot thumb-nuts
  for (const sx of [-0.116, 0.116]) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.071, 0.071, 0.008, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84),
      darkBrassMat
    );
    cap.rotation.z = Math.PI / 2;
    cap.rotation.x = -Math.PI / 2;
    cap.position.x = sx;
    shadeGroup.add(cap);

    const thumbNut = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 12), brassMat);
    thumbNut.rotation.z = Math.PI / 2;
    thumbNut.position.set(sx + (sx < 0 ? -0.008 : 0.008), 0.032, 0);
    shadeGroup.add(thumbNut);
  }

  // Warm recessed milk-glass interior reflector & softly glowing filament bulb
  const bulbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffecc0'),
    emissive: new THREE.Color('#ffbe62'),
    emissiveIntensity: 1.75,
    roughness: 0.2,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), bulbMat);
  bulb.position.set(0, 0.012, 0);
  shadeGroup.add(bulb);

  // Beaded brass pull-chain with acorn finial
  const pullChain = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.13, 6), brassMat);
  pullChain.position.set(0.04, -0.055, 0.01);
  shadeGroup.add(pullChain);
  const acorn = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), brassMat);
  acorn.scale.set(0.8, 1.35, 0.8);
  acorn.position.set(0.04, -0.125, 0.01);
  shadeGroup.add(acorn);

  // Softly balanced warm desk light so logbook text & brass stay crisp without blowing out
  const deskLampLight = new THREE.PointLight('#ffba6b', 0.88, 3.0, 2.0);
  deskLampLight.position.set(0.08, 0.42, 0.16);
  lampGroup.add(deskLampLight);

  // --- 4B. MINIATURE ROTATING BRASS ARMILLARY SPHERE (local right-rear: +0.76, deskH, -0.08) ---
  const armillaryBase = new THREE.Group();
  armillaryBase.position.set(0.76, deskH, -0.06);
  deskGroup.add(armillaryBase);

  const armPedestal = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(0.068, 0),
        new THREE.Vector2(0.062, 0.02),
        new THREE.Vector2(0.028, 0.035),
        new THREE.Vector2(0.016, 0.08),
        new THREE.Vector2(0.024, 0.095),
      ],
      18
    ),
    darkTrimMat
  );
  armillaryBase.add(armPedestal);

  const armCradle = new THREE.Mesh(
    new THREE.TorusGeometry(0.112, 0.006, 8, 28, Math.PI),
    brassMat
  );
  armCradle.position.y = 0.215;
  armCradle.rotation.z = Math.PI;
  armillaryBase.add(armCradle);

  const armSpinner = new THREE.Group();
  armSpinner.position.y = 0.215;
  armSpinner.rotation.z = 0.41; // 23.5 deg axial tilt
  armillaryBase.add(armSpinner);

  const ringRadii = [0.098, 0.094, 0.09, 0.072];
  const ringRots: Array<[number, number, number]> = [
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, Math.PI / 2, 0],
    [Math.PI / 2, 0.41, 0],
  ];
  ringRadii.forEach((r, idx) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, idx === 3 ? 0.009 : 0.0045, 8, 32),
      idx === 3 ? darkBrassMat : brassMat
    );
    ring.rotation.set(ringRots[idx][0], ringRots[idx][1], ringRots[idx][2]);
    armSpinner.add(ring);
  });
  const armAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.24, 8), brassMat);
  armSpinner.add(armAxis);
  const armCore = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), brassMat);
  armSpinner.add(armCore);

  // --- 4C. CUT-CRYSTAL INKWELL & FEATHERED QUILL (local -0.14, deskH, -0.11) ---
  const inkwellGroup = new THREE.Group();
  inkwellGroup.position.set(-0.14, deskH, -0.1);
  deskGroup.add(inkwellGroup);

  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dceeff'),
    roughness: 0.06,
    metalness: 0.02,
    transmission: 0.86,
    ior: 1.54,
    thickness: 0.04,
  });
  const inkBody = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.044, 8), crystalMat);
  inkBody.position.y = 0.022;
  inkwellGroup.add(inkBody);

  const inkPool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.027, 0.025, 8),
    new THREE.MeshStandardMaterial({ color: '#090b18', roughness: 0.1, metalness: 0.1 })
  );
  inkPool.position.y = 0.018;
  inkwellGroup.add(inkPool);

  const inkCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.014, 14), brassMat);
  inkCollar.position.y = 0.048;
  inkwellGroup.add(inkCollar);

  // Feathered quill resting at an artistic angle inside the inkwell
  const quillGroup = new THREE.Group();
  quillGroup.position.set(0.004, 0.042, 0);
  quillGroup.rotation.set(0.18, 0.4, -0.44);
  inkwellGroup.add(quillGroup);

  const quillShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0018, 0.0032, 0.24, 8),
    new THREE.MeshStandardMaterial({ color: '#efe5cc', roughness: 0.5 })
  );
  quillShaft.position.y = 0.11;
  quillGroup.add(quillShaft);

  const featherShape = new THREE.Shape();
  featherShape.moveTo(0, 0);
  featherShape.quadraticCurveTo(0.024, 0.055, 0.016, 0.13);
  featherShape.quadraticCurveTo(0.006, 0.165, 0, 0.18);
  featherShape.quadraticCurveTo(-0.014, 0.145, -0.018, 0.08);
  featherShape.quadraticCurveTo(-0.012, 0.03, 0, 0);
  const featherGeo = new THREE.ShapeGeometry(featherShape, 12);
  const featherMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f7f0df'),
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const feather = new THREE.Mesh(featherGeo, featherMat);
  feather.position.y = 0.07;
  quillGroup.add(feather);

  // --- 4D. BRASS CALIPERS, ROLLED STAR SCROLLS & CRIMSON WAX SEAL (far right +0.76, +0.20) ---
  const scrollGroup = new THREE.Group();
  scrollGroup.position.set(0.75, deskH, 0.22);
  scrollGroup.rotation.y = -0.35;
  deskGroup.add(scrollGroup);

  for (let i = 0; i < 2; i++) {
    const scroll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.28, 16, 1, true),
      parchmentMat
    );
    scroll.rotation.z = Math.PI / 2;
    scroll.position.set(0, 0.022 + i * 0.002, i * 0.055);
    scroll.rotation.y = i * 0.14;
    scrollGroup.add(scroll);
    const ribbon = new THREE.Mesh(
      new THREE.TorusGeometry(0.023, 0.0035, 8, 18),
      new THREE.MeshStandardMaterial({ color: '#7d151d', roughness: 0.65 })
    );
    ribbon.rotation.y = Math.PI / 2 + i * 0.14;
    ribbon.position.set(0, 0.022 + i * 0.002, i * 0.055);
    scrollGroup.add(ribbon);
  }

  // Wax seal stamp & crimson wax drop
  const waxStamp = new THREE.Group();
  waxStamp.position.set(0.62, deskH, 0.3);
  deskGroup.add(waxStamp);
  const stampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.016, 16), brassMat);
  stampBase.position.y = 0.008;
  waxStamp.add(stampBase);
  const stampHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.055, 12), darkTrimMat);
  stampHandle.position.y = 0.042;
  waxStamp.add(stampHandle);
  const waxBlob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.021, 0.005, 14),
    new THREE.MeshStandardMaterial({ color: '#8f131b', roughness: 0.34, metalness: 0.05 })
  );
  waxBlob.position.set(-0.045, 0.0025, 0.01);
  waxStamp.add(waxBlob);

  // Brass divider calipers resting flat
  const caliperGroup = new THREE.Group();
  caliperGroup.position.set(-0.08, deskH + 0.006, 0.29);
  caliperGroup.rotation.y = 0.55;
  deskGroup.add(caliperGroup);
  const calPin = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.009, 12), brassMat);
  caliperGroup.add(calPin);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.005, 0.14), brassMat);
    leg.position.set(s * 0.024, 0, 0.068);
    leg.rotation.y = s * 0.28;
    caliperGroup.add(leg);
  }

  // ============================================================================
  // 5. OPEN OBSERVATORY LOGBOOK (Interactable: 'desk_logbook')
  // ============================================================================
  const logbookGroup = new THREE.Group();
  logbookGroup.position.set(-0.46, deskH + 0.005, 0.12);
  logbookGroup.rotation.y = 0.16;
  deskGroup.add(logbookGroup);

  const bookCoverMat = new THREE.MeshStandardMaterial({
    map: textures.leather.map,
    color: new THREE.Color('#3b1814'),
    roughness: 0.58,
    metalness: 0.06,
  });

  const bookCover = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.33), bookCoverMat);
  bookCover.position.y = 0.006;
  logbookGroup.add(bookCover);

  // Gilded page stack blocks left & right
  const pageBlockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d8c398'),
    roughness: 0.78,
  });
  const leftBlock = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.305), pageBlockMat);
  leftBlock.position.set(-0.11, 0.02, 0);
  logbookGroup.add(leftBlock);
  const rightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.305), pageBlockMat);
  rightBlock.position.set(0.11, 0.02, 0);
  logbookGroup.add(rightBlock);

  // Gently arched open two-page spread using custom deformed PlaneGeometry
  const spreadGeo = new THREE.PlaneGeometry(0.43, 0.305, 24, 4);
  spreadGeo.rotateX(-Math.PI / 2);
  const posAttr = spreadGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const nx = Math.abs(x) / 0.215; // 0 at spine, 1 at outer edge
    // Classic arched open-book profile: dips at spine, arches cleanly, drops gently at edge
    const archY = Math.sin(nx * Math.PI) * 0.016 + nx * 0.004;
    posAttr.setY(i, archY);
  }
  spreadGeo.computeVertexNormals();

  const spreadMat = new THREE.MeshStandardMaterial({
    map: textures.logbookSpread,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.22,
  });
  const spreadMesh = new THREE.Mesh(spreadGeo, spreadMat);
  spreadMesh.position.y = 0.029;
  logbookGroup.add(spreadMesh);

  // Crimson silk bookmark ribbon draped over front edge
  const ribbonCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.032, -0.14),
    new THREE.Vector3(0.01, 0.032, 0.14),
    new THREE.Vector3(0.02, 0.012, 0.175),
    new THREE.Vector3(0.032, 0.004, 0.22),
  ]);
  const bookmark = new THREE.Mesh(
    new THREE.TubeGeometry(ribbonCurve, 14, 0.0045, 6, false),
    new THREE.MeshStandardMaterial({ color: '#8f1822', roughness: 0.6 })
  );
  logbookGroup.add(bookmark);

  // Generous invisible padded click hitbox around the open Logbook so clicking anywhere on or beside it opens cleanly
  const logbookHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.16, 0.44),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  logbookHitbox.position.set(0, 0.06, 0);
  logbookGroup.add(logbookHitbox);

  // ============================================================================
  // 6. PUZZLE A — 4-DIAL LUNAR PHASE CRYPTEX BOX (local +0.26, deskH, +0.10)
  // ============================================================================
  const boxGroup = new THREE.Group();
  boxGroup.position.set(0.26, deskH + 0.004, 0.1);
  boxGroup.rotation.y = -0.06;
  deskGroup.add(boxGroup);

  const boxW = 0.42;
  const boxD = 0.26;
  const boxH = 0.115;

  // Separate material for the box frame so hovering the box doesn't bleed onto the desk
  const boxWoodMat = mahoganyMat.clone();
  boxWoodMat.color.set('#542919');
  const boxBrassMat = brassMat.clone();

  // Hollow lower chest (4 walls + floor so interior velvet cavity is truly recessed!)
  const wallT = 0.02;
  const boxFloor = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.022, boxD), boxWoodMat);
  boxFloor.position.y = 0.011;
  boxGroup.add(boxFloor);

  const boxBackWall = new THREE.Mesh(new THREE.BoxGeometry(boxW, boxH, wallT), boxWoodMat);
  boxBackWall.position.set(0, boxH / 2, -boxD / 2 + wallT / 2);
  boxGroup.add(boxBackWall);

  for (const sx of [-1, 1]) {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, boxH, boxD - wallT), boxWoodMat);
    sideWall.position.set(sx * (boxW / 2 - wallT / 2), boxH / 2, wallT / 2);
    boxGroup.add(sideWall);
  }

  // Front lower apron beneath the 4 dials
  const boxFrontLower = new THREE.Mesh(new THREE.BoxGeometry(boxW, 0.032, wallT + 0.016), boxWoodMat);
  boxFrontLower.position.set(0, 0.016, boxD / 2 - 0.004);
  boxGroup.add(boxFrontLower);

  // Plush midnight-velvet interior liner & sculpted lens cradle
  const interiorVelvet = new THREE.Mesh(
    new THREE.BoxGeometry(boxW - wallT * 2 - 0.006, 0.036, boxD - wallT * 2 - 0.04),
    velvetMat
  );
  interiorVelvet.position.set(0, 0.038, -0.015);
  boxGroup.add(interiorVelvet);

  const cradleRing = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.01, 10, 28), boxBrassMat);
  cradleRing.rotation.x = Math.PI / 2;
  cradleRing.position.set(0, 0.058, -0.015);
  boxGroup.add(cradleRing);

  // Sculpted beveled brass corner L-brackets & miniature corner rivets
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (boxW / 2);
      const cz = sz * (boxD / 2);
      // L-strap wrapping vertical corner + top/bottom beveled brass caps
      const strapX = new THREE.Mesh(new THREE.BoxGeometry(0.048, boxH + 0.004, 0.01), boxBrassMat);
      strapX.position.set(cx - sx * 0.022, boxH / 2, cz + sz * 0.001);
      boxGroup.add(strapX);
      const strapZ = new THREE.Mesh(new THREE.BoxGeometry(0.01, boxH + 0.004, 0.048), boxBrassMat);
      strapZ.position.set(cx + sx * 0.001, boxH / 2, cz - sz * 0.022);
      boxGroup.add(strapZ);
      const cornerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, boxH + 0.008, 8), boxBrassMat);
      cornerCap.position.set(cx, boxH / 2, cz);
      boxGroup.add(cornerCap);
      // Tiny brass rivets on top & bottom of each corner strap
      for (const ry of [0.022, boxH - 0.022]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), boxBrassMat);
        rivet.position.set(cx - sx * 0.032, ry, cz + sz * 0.006);
        boxGroup.add(rivet);
      }
    }
  }

  // Stepped brass dial housing bezel across the front face
  const dialHousing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.088, 0.052), darkBrassMat);
  dialHousing.position.set(0, 0.066, boxD / 2 - 0.01);
  boxGroup.add(dialHousing);

  // 4 Individually Clickable Rotating 3D Lunar Cylinder Dials
  const dialPivots: THREE.Group[] = [];
  const dialCurrentAngles = [0, 0, 0, 0];
  const dialViewAngle = THREE.MathUtils.degToRad(26); // Facing forward & slightly up!
  const dialSpacing = 0.082;
  const dialInteractables: Interactable[] = [];

  // Compute world-space FocusTarget for the Lunar Box
  // Local box is at (0.26, 0.784, 0.10) inside deskGroup at (4.75, 0, -0.45) rotY = -PI/2:
  // worldX = 4.75 - 0.10 = 4.65, worldY = 0.85, worldZ = -0.45 + 0.26 = -0.19
  const lunarBoxFocus: FocusTarget = {
    id: 'lunar_box',
    label: 'Lunar Phase Cryptex Box',
    position: new THREE.Vector3(4.01, 1.18, -0.19),
    lookAt: new THREE.Vector3(4.67, 0.85, -0.19),
  };

  // Unified invisible bounding hitbox for steady standing hover (hidden once unlocked so lens is directly clickable)
  const boxHitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.18, 0.34),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  boxHitbox.position.set(0, 0.085, 0.02);
  boxHitbox.userData.interactableId = 'desk_lunar_box';
  boxGroup.add(boxHitbox);

  for (let i = 0; i < 4; i++) {
    const dx = -1.5 * dialSpacing + i * dialSpacing;
    const dialHolder = new THREE.Group();
    dialHolder.position.set(dx, 0.072, boxD / 2 + 0.012);
    boxGroup.add(dialHolder);

    // Brass index pointer arrow mounted directly above the dial window at 26 deg
    const pointerGeo = new THREE.ConeGeometry(0.0085, 0.018, 4);
    const pointer = new THREE.Mesh(pointerGeo, boxBrassMat);
    pointer.rotation.x = Math.PI + 0.35;
    pointer.position.set(0, 0.044, 0.024);
    dialHolder.add(pointer);

    // Rotating dial pivot (rotates around local X)
    const dialPivot = new THREE.Group();
    dialHolder.add(dialPivot);
    dialPivots.push(dialPivot);

    const dialTex = createLunarDialTexture(i);
    const dialMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      roughness: 0.44,
      metalness: 0.22,
      envMapIntensity: 0.35,
      emissive: new THREE.Color('#2a2110'),
      emissiveIntensity: 0.32,
    });
    const dialRimMat = brassMat.clone();

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.062, 32, 1, false), [
      dialMat,
      dialRimMat,
      dialRimMat,
    ]);
    drum.rotation.z = Math.PI / 2;
    dialPivot.add(drum);

    // Knurled brass flange rings on both ends of each cylinder
    for (const fx of [-0.032, 0.032]) {
      const flange = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.0042, 8, 24), dialRimMat);
      flange.rotation.y = Math.PI / 2;
      flange.position.x = fx;
      dialPivot.add(flange);
    }

    // Initialize visual rotation to phase 0
    const initAngle = 0.5 * (Math.PI / 4) - dialViewAngle;
    dialCurrentAngles[i] = initAngle;
    dialPivot.rotation.x = initAngle;

    const dialIndex = i;
    dialInteractables.push({
      id: `lunar_dial_${dialIndex}`,
      object: dialPivot,
      stationId: 'lunar_box',
      focusOnly: true,
      cursor: 'grab',
      label: (s) =>
        `Lunar Dial ${ROMAN_NUMERALS[dialIndex]} — ${LUNAR_PHASE_NAMES[s.lunarDials[dialIndex]]}`,
      hint: (s) => (s.solved.lunar_box ? 'Cryptex unlocked' : 'Click to rotate +45°'),
      focusTarget: lunarBoxFocus,
      onInteract: (ctx) => {
        const snap = ctx.state.get();
        if (snap.solved.lunar_box) {
          ctx.audio.playClick();
          ctx.ui.showToast('The Lunar Cryptex is already unlocked.');
          return;
        }
        const nextVal = (snap.lunarDials[dialIndex] + 1) % 8;
        ctx.state.update((draft) => {
          draft.lunarDials[dialIndex] = nextVal;
        });
        ctx.audio.playBrassGear();

        const updated = ctx.state.get();
        const isMatch = updated.puzzleConfig.lunarSolution.every(
          (target, idx) => updated.lunarDials[idx] === target
        );
        if (isMatch) {
          ctx.state.markSolved('lunar_box');
          ctx.audio.playPuzzleSolved();
          ctx.ui.showToast(
            'The Lunar Cryptex clicks open! A Sapphire Objective Lens rests inside.',
            4500
          );
        } else {
          ctx.ui.showToast(
            `Dial ${ROMAN_NUMERALS[dialIndex]}: ${LUNAR_PHASE_NAMES[nextVal]}`,
            1800
          );
        }
      },
    });
  }

  // Hinged Lid (pivots open -105° around rear top edge when solved!)
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, boxH, -boxD / 2 + 0.01);
  boxGroup.add(lidPivot);

  // Two brass barrel hinges along rear edge
  for (const hx of [-0.12, 0.12]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.042, 10), boxBrassMat);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(hx, 0, -0.008);
    lidPivot.add(hinge);
  }

  const lidSlab = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.008, 0.026, boxD + 0.006), boxWoodMat);
  lidSlab.position.set(0, 0.013, boxD / 2 - 0.01);
  lidPivot.add(lidSlab);

  const lidCrown = new THREE.Mesh(new THREE.BoxGeometry(boxW - 0.05, 0.014, boxD - 0.05), darkTrimMat);
  lidCrown.position.set(0, 0.032, boxD / 2 - 0.01);
  lidPivot.add(lidCrown);

  // Brass crescent-and-star medallion inlaid atop lid
  const lidMedallion = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, 8, 28), boxBrassMat);
  lidMedallion.rotation.x = Math.PI / 2;
  lidMedallion.position.set(0, 0.041, boxD / 2 - 0.01);
  lidPivot.add(lidMedallion);

  const lidCrescent = new THREE.Mesh(
    new THREE.TorusGeometry(0.026, 0.005, 8, 22, Math.PI * 1.35),
    boxBrassMat
  );
  lidCrescent.rotation.x = Math.PI / 2;
  lidCrescent.position.set(-0.006, 0.042, boxD / 2 - 0.01);
  lidPivot.add(lidCrescent);

  // --- SAPPHIRE OBJECTIVE LENS PICKUP INSIDE CRYPTEX BOX ---
  const sapphirePickupGroup = new THREE.Group();
  sapphirePickupGroup.position.set(0, 0.072, -0.015);
  boxGroup.add(sapphirePickupGroup);

  const sapphireBezelMat = brassMat.clone();
  const sapphireRing = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.009, 12, 32), sapphireBezelMat);
  sapphireRing.rotation.x = Math.PI / 2;
  sapphirePickupGroup.add(sapphireRing);

  // Knurled optical grip notches around bezel
  for (let n = 0; n < 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    const lug = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.008), sapphireBezelMat);
    lug.position.set(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06);
    lug.rotation.y = -a;
    sapphirePickupGroup.add(lug);
  }

  const sapphireGlassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2585ff'),
    emissive: new THREE.Color('#185ed6'),
    emissiveIntensity: 0.78,
    roughness: 0.05,
    metalness: 0.05,
    transmission: 0.72,
    ior: 1.77, // Authentic sapphire IOR!
    thickness: 0.03,
    clearcoat: 1.0,
  });
  const sapphireLensMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), sapphireGlassMat);
  sapphireLensMesh.scale.set(1, 0.28, 1);
  sapphirePickupGroup.add(sapphireLensMesh);

  const sapphireGlowLight = new THREE.PointLight('#4ea6ff', 0.42, 0.68, 2.2);
  sapphireGlowLight.position.set(0, 0.05, 0);
  sapphirePickupGroup.add(sapphireGlowLight);

  enableShadows(root, true, true);
  // Don't let translucent glass lens, bulb, or invisible hitboxes cast shadows
  bulb.castShadow = false;
  sapphireLensMesh.castShadow = false;
  boxHitbox.castShadow = false;
  boxHitbox.receiveShadow = false;
  logbookHitbox.castShadow = false;
  logbookHitbox.receiveShadow = false;

  // ============================================================================
  // INTERACTABLES & COLLIDERS
  // ============================================================================
  const interactables: Interactable[] = [
    {
      id: 'desk_logbook',
      object: logbookGroup,
      stationId: 'lunar_box',
      focusOnly: false,
      maxDistance: 4.8,
      cursor: 'pointer',
      label: "Dr. Vance's Observatory Logbook",
      hint: 'Click to open & read notes',
      onInteract: (ctx) => {
        ctx.audio.playClick();
        ctx.ui.openLogbook();
      },
    },
    {
      id: 'desk_lunar_box',
      object: boxGroup,
      stationId: 'lunar_box',
      cursor: 'inspect',
      label: (s) => (s.solved.lunar_box ? 'Lunar Cryptex Box (Unlocked)' : 'Lunar Phase Cryptex Box'),
      getHint: () => 'Click to step in & inspect',
      focusTarget: lunarBoxFocus,
      onInteract: (ctx) => {
        ctx.audio.playClick();
        ctx.focusOn(lunarBoxFocus);
      },
    },
    ...dialInteractables,
    {
      id: 'pickup_sapphire_lens',
      object: sapphirePickupGroup,
      stationId: 'lunar_box',
      focusOnly: false,
      cursor: 'pointer',
      label: 'Sapphire Objective Lens',
      hint: 'Click to collect',
      enabled: (s) =>
        s.solved.lunar_box &&
        !s.inventory.includes('sapphire_lens') &&
        !s.placedItems.includes('sapphire_lens') &&
        !s.telescopeLensInstalled,
      onInteract: (ctx) => {
        ctx.state.addItem('sapphire_lens');
        ctx.audio.playPickup();
        ctx.ui.showToast('Collected Sapphire Objective Lens — forged for the Great Telescope.');
      },
    },
  ];

  const colliders: ColliderBox[] = [
    { minX: 4.19, maxX: 5.39, minZ: -1.55, maxZ: 0.65, label: 'Writing Desk' },
    { minX: 3.48, maxX: 4.02, minZ: -0.62, maxZ: -0.08, label: 'Desk Chair' },
  ];

  // Animation state
  let currentLidAngle = 0;

  const update = (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>): void => {
    const smooth = 1 - Math.exp(-9 * delta);

    // Subtle warm incandescent flicker on the emerald banker's lamp (balanced so logbook never blows out)
    deskLampLight.intensity = 0.86 + Math.sin(elapsed * 5.3) * 0.03 + Math.sin(elapsed * 13.7) * 0.015;

    // Slow graceful precession of miniature brass armillary sphere
    armSpinner.rotation.y = elapsed * 0.32;

    // Smoothly rotate each of the 4 lunar cylinder dials to its target phase
    for (let i = 0; i < 4; i++) {
      const targetAngle = (state.lunarDials[i] + 0.5) * (Math.PI / 4) - dialViewAngle;
      // Always take shortest angular delta around circle (or smoothly wind forward)
      let diff = targetAngle - dialCurrentAngles[i];
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      dialCurrentAngles[i] += diff * smooth;
      dialPivots[i].rotation.x = dialCurrentAngles[i];
    }

    // Smoothly open/close cryptex lid (opens -105 deg backward toward desk rear)
    const targetLidAngle = state.solved.lunar_box ? -THREE.MathUtils.degToRad(105) : 0;
    currentLidAngle += (targetLidAngle - currentLidAngle) * (1 - Math.exp(-5.5 * delta));
    lidPivot.rotation.x = currentLidAngle;

    // Sapphire lens visibility & gentle shimmer (hide outer box hitbox once unlocked so lens is unobstructed)
    const showLens =
      state.solved.lunar_box &&
      !state.inventory.includes('sapphire_lens') &&
      !state.placedItems.includes('sapphire_lens') &&
      !state.telescopeLensInstalled;
    boxHitbox.visible = !showLens;
    sapphirePickupGroup.visible = showLens;
    if (showLens) {
      sapphirePickupGroup.rotation.y = elapsed * 0.8;
      sapphirePickupGroup.position.y = 0.072 + Math.sin(elapsed * 2.6) * 0.003;
      sapphireGlowLight.intensity = 0.38 + Math.sin(elapsed * 3.1) * 0.08;
    }
  };

  return { group: root, interactables, colliders, update };
}
