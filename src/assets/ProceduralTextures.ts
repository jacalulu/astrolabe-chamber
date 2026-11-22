import * as THREE from 'three';
import { LUNAR_PHASE_NAMES, ZODIAC_NAMES } from '../types';
import type { PBRTextureSet, TextureBundle } from '../types';

// Canonical normalized (u, v) canvas coordinates for the 8 stars on constellationMap
// (u: 0..1 left-to-right, v: 0..1 top-to-bottom; in Three.js UV space, uv.y = 1 - v)
export const CONSTELLATION_STAR_COORDS: Readonly<
  Record<string, { u: number; v: number; label: string; mag: number }>
> = {
  polaris: { u: 0.5, v: 0.2, label: 'Polaris', mag: 1.0 },
  vega: { u: 0.25, v: 0.36, label: 'Vega', mag: 1.0 },
  deneb: { u: 0.75, v: 0.29, label: 'Deneb', mag: 0.85 },
  aldebaran: { u: 0.19, v: 0.58, label: 'Aldebaran', mag: 0.82 },
  betelgeuse: { u: 0.44, v: 0.54, label: 'Betelgeuse', mag: 0.9 },
  sirius: { u: 0.73, v: 0.62, label: 'Sirius', mag: 1.05 },
  rigel: { u: 0.35, v: 0.79, label: 'Rigel', mag: 0.85 },
  antares: { u: 0.67, v: 0.81, label: 'Antares', mag: 0.88 },
};

const SERIF_DISPLAY = 'Cinzel, "Palatino Linotype", "Book Antiqua", Georgia, serif';
const SERIF_BODY = '"Cormorant Garamond", "Palatino Linotype", Georgia, serif';

// ============================================================================
// Deterministic PRNG & Seamless Periodic Noise Utilities
// ============================================================================

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

function hash2Periodic(ix: number, iy: number, px: number, py: number, seed: number): number {
  const x = ((ix % px) + px) % px;
  const y = ((iy % py) + py) % py;
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function tileableValueNoise(
  u: number,
  v: number,
  freqX: number,
  freqY: number,
  seed: number
): number {
  const x = u * freqX;
  const y = v * freqY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);

  const a = hash2Periodic(ix, iy, freqX, freqY, seed);
  const b = hash2Periodic(ix + 1, iy, freqX, freqY, seed);
  const c = hash2Periodic(ix, iy + 1, freqX, freqY, seed);
  const d = hash2Periodic(ix + 1, iy + 1, freqX, freqY, seed);

  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

function tileableFbm(
  u: number,
  v: number,
  baseFreqX: number,
  baseFreqY: number,
  octaves: number,
  seed: number
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = baseFreqX;
  let fy = baseFreqY;
  for (let o = 0; o < octaves; o++) {
    sum += tileableValueNoise(u, v, fx, fy, seed + o * 97) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not initialize 2D canvas context');
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  repeat = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function makePBRSet(
  albedoCanvas: HTMLCanvasElement,
  bumpCanvas: HTMLCanvasElement,
  roughCanvas: HTMLCanvasElement,
  repeat = true
): PBRTextureSet {
  return {
    map: configureTexture(albedoCanvas, true, repeat),
    bumpMap: configureTexture(bumpCanvas, false, repeat),
    roughnessMap: configureTexture(roughCanvas, false, repeat),
  };
}

// ============================================================================
// 1. WALNUT — Deep Victorian Dark Walnut Planks & Fluted Wainscoting
// ============================================================================

function createWalnutTextures(): PBRTextureSet {
  const size = 1024;
  const work = 512;

  const [aWork, aWorkCtx] = makeCanvas(work, work);
  const [bWork, bWorkCtx] = makeCanvas(work, work);
  const [rWork, rWorkCtx] = makeCanvas(work, work);

  const aImg = aWorkCtx.createImageData(work, work);
  const bImg = bWorkCtx.createImageData(work, work);
  const rImg = rWorkCtx.createImageData(work, work);

  const planks = 4;
  for (let y = 0; y < work; y++) {
    const v = y / work;
    for (let x = 0; x < work; x++) {
      const u = x / work;
      const plankIdx = Math.floor(u * planks);
      const plankU = (u * planks) % 1;
      const plankOffset = plankIdx * 0.37;

      // Cathedral walnut wood-ring grain
      const warp = tileableFbm(u + plankOffset, v + plankOffset * 0.6, 4, 2, 4, 101);
      const fineStreak = tileableFbm(u + plankOffset, v, 32, 4, 3, 211);
      const ringInput = (u * 14 + plankOffset * 11 + warp * 3.8 + fineStreak * 0.55) * Math.PI * 2;
      const ring = 0.5 + 0.5 * Math.sin(ringInput);
      const cathedral = Math.pow(ring, 1.45);
      const toneVar = tileableFbm(u + plankOffset, v, 2, 2, 2, 307);

      // Rich dark walnut palette: espresso heartwood -> warm umber -> subtle satin burgundy highlight
      const plankShade = 0.88 + (plankIdx % 2 === 0 ? 0.08 : -0.05) + (plankIdx === 2 ? 0.04 : 0);
      let r = lerp(32, 92, cathedral) * (0.86 + toneVar * 0.28) * plankShade;
      let g = lerp(17, 50, cathedral) * (0.85 + toneVar * 0.26) * plankShade;
      let b = lerp(10, 27, cathedral) * (0.84 + toneVar * 0.24) * plankShade;

      // Subtle micro grain fiber contrast
      const fiber = (fineStreak - 0.5) * 18;
      r += fiber;
      g += fiber * 0.58;
      b += fiber * 0.32;

      // Beveled wainscoting tongue-and-groove plank seams
      const edgeDist = Math.min(plankU, 1 - plankU);
      let bumpVal = 138 + (cathedral - 0.5) * 34 + (fineStreak - 0.5) * 28;
      let roughVal = lerp(92, 132, 1 - cathedral) + (fineStreak - 0.5) * 24;

      if (edgeDist < 0.055) {
        const t = edgeDist / 0.055; // 0 at seam center, 1 at shoulder
        if (edgeDist < 0.016) {
          // Deep recessed shadow groove
          r *= 0.26;
          g *= 0.24;
          b *= 0.24;
          bumpVal = 24;
          roughVal = 215;
        } else {
          // Chamfered bevel shoulder with subtle catchlight on left vs shadow on right
          const bevelT = (t - 0.29) / 0.71;
          const lightBias = plankU < 0.5 ? 1.14 : 0.78;
          r *= lerp(0.55, lightBias, bevelT);
          g *= lerp(0.52, lightBias, bevelT);
          b *= lerp(0.5, lightBias, bevelT);
          bumpVal = lerp(48, 172, bevelT);
          roughVal = lerp(165, 96, bevelT);
        }
      }

      const idx = (y * work + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(bumpVal);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      const rv = clampByte(roughVal);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aWorkCtx.putImageData(aImg, 0, 0);
  bWorkCtx.putImageData(bImg, 0, 0);
  rWorkCtx.putImageData(rImg, 0, 0);

  // Upscale to crisp 1024x1024 and overlay fine wood pores & subtle wainscot flute rails
  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  aCtx.drawImage(aWork, 0, 0, size, size);
  bCtx.drawImage(bWork, 0, 0, size, size);
  rCtx.drawImage(rWork, 0, 0, size, size);

  // Fine elongated vertical wood pores
  const rng = mulberry32(4409);
  for (let i = 0; i < 3200; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const len = 4 + rng() * 16;
    const w = 0.8 + rng() * 1.1;
    aCtx.fillStyle = `rgba(14, 7, 3, ${(0.18 + rng() * 0.25).toFixed(2)})`;
    aCtx.fillRect(px, py, w, len);
    bCtx.fillStyle = 'rgba(40, 40, 40, 0.35)';
    bCtx.fillRect(px, py, w, len);
    rCtx.fillStyle = 'rgba(185, 185, 185, 0.35)';
    rCtx.fillRect(px, py, w, len);
  }

  // Subtle horizontal French-polish sheen bands (aged satin hand-rubbed varnish)
  for (let i = 0; i < 18; i++) {
    const y = rng() * size;
    const h = 24 + rng() * 64;
    const grad = rCtx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, 'rgba(75,75,75,0)');
    grad.addColorStop(0.5, 'rgba(75,75,75,0.12)');
    grad.addColorStop(1, 'rgba(75,75,75,0)');
    rCtx.fillStyle = grad;
    rCtx.fillRect(0, y, size, h);
  }

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// 2. MARBLE FLOOR — Dark Obsidian & Emerald Veined Tiles + Brass Compass Rose
// ============================================================================

function createMarbleFloorTextures(): PBRTextureSet {
  const size = 1024;
  const work = 512;
  const [aWork, aWorkCtx] = makeCanvas(work, work);
  const [bWork, bWorkCtx] = makeCanvas(work, work);
  const [rWork, rWorkCtx] = makeCanvas(work, work);

  const aImg = aWorkCtx.createImageData(work, work);
  const bImg = bWorkCtx.createImageData(work, work);
  const rImg = rWorkCtx.createImageData(work, work);

  // Radial alternating dark obsidian & deep emerald malachite marble keystone tiles
  for (let y = 0; y < work; y++) {
    const v = y / work;
    const dy = v - 0.5;
    for (let x = 0; x < work; x++) {
      const u = x / work;
      const dx = u - 0.5;
      const dist = Math.hypot(dx, dy) * 2; // 0 at center, 1 at inscribed circle edge
      const angle = Math.atan2(dy, dx) + Math.PI; // 0..2PI

      // Determine concentric tile ring & sector for realistic hand-laid slab variation
      const ringIdx = Math.floor(dist * 5.2);
      const sectors = ringIdx <= 1 ? 8 : ringIdx === 2 ? 16 : 24;
      const sectorIdx = Math.floor((angle / (Math.PI * 2)) * sectors);
      const isEmerald = (ringIdx + sectorIdx) % 2 === 1;

      const slabSeedX = ((ringIdx * 17 + sectorIdx * 31) % 97) / 97;
      const slabSeedY = ((ringIdx * 43 + sectorIdx * 13) % 89) / 89;

      // Multi-layer crystalline calcite & mineral veining (high-exponent, non-blurry)
      const n1 = tileableFbm(u + slabSeedX, v + slabSeedY, 4, 4, 4, 501);
      const n2 = tileableFbm(u * 1.5 + slabSeedY, v * 1.5 + slabSeedX, 10, 10, 3, 613);
      const veinField = Math.sin((u * 7 + v * 6 + n1 * 4.6) * Math.PI);
      const fineVein = Math.pow(1 - Math.abs(veinField), 22);
      const secondaryVein = Math.pow(
        1 - Math.abs(Math.sin((u * 13 - v * 11 + n2 * 3.8) * Math.PI)),
        26
      );
      const cloud = tileableFbm(u + slabSeedX, v + slabSeedY, 3, 3, 3, 709);

      const slabTint = 0.9 + ((ringIdx * 7 + sectorIdx * 11) % 7) * 0.032;

      let r: number;
      let g: number;
      let b: number;
      if (isEmerald) {
        // Deep crystalline obsidian-emerald marble (#0e1c24 -> #1d353b) with subtle mineral mist
        r = lerp(13, 27, cloud) * slabTint + fineVein * 46 + secondaryVein * 28;
        g = lerp(26, 51, cloud) * slabTint + fineVein * 64 + secondaryVein * 40;
        b = lerp(32, 57, cloud) * slabTint + fineVein * 60 + secondaryVein * 38;
      } else {
        // Deep Nero Marquina obsidian marble (#0c1016 -> #1c222d) with crisp silver-slate veins
        r = lerp(12, 26, cloud) * slabTint + fineVein * 66 + secondaryVein * 42;
        g = lerp(15, 31, cloud) * slabTint + fineVein * 70 + secondaryVein * 40;
        b = lerp(20, 39, cloud) * slabTint + fineVein * 74 + secondaryVein * 34;
      }

      // Whisper-thin gold pyrite vein glint in select obsidian fractures
      if (!isEmerald && secondaryVein > 0.42) {
        r += secondaryVein * 52;
        g += secondaryVein * 38;
        b += secondaryVein * 10;
      }

      const idx = (y * work + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(134 + (n2 - 0.5) * 16 - fineVein * 16);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      // Semi-glossy polished marble (0.20..0.34 roughness), slightly rougher along mineral seams
      const rv = clampByte(58 + (1 - cloud) * 26 + fineVein * 36);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aWorkCtx.putImageData(aImg, 0, 0);
  bWorkCtx.putImageData(bImg, 0, 0);
  rWorkCtx.putImageData(rImg, 0, 0);

  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  aCtx.drawImage(aWork, 0, 0, size, size);
  bCtx.drawImage(bWork, 0, 0, size, size);
  rCtx.drawImage(rWork, 0, 0, size, size);

  // Native 1024px crisp crystalline hairline fracture veins (eliminates soft airbrushed look!)
  const veinRng = mulberry32(5179);
  for (let i = 0; i < 95; i++) {
    let vx = veinRng() * size;
    let vy = veinRng() * size;
    let dir = veinRng() * Math.PI * 2;
    const steps = 16 + Math.floor(veinRng() * 28);
    const isGold = veinRng() > 0.78;
    const isSage = !isGold && veinRng() > 0.45;
    const alpha = 0.14 + veinRng() * 0.22;
    const lw = 0.55 + veinRng() * 1.15;

    const strokeVein = (ctx: CanvasRenderingContext2D, stroke: string, width: number) => {
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      let cxp = vx;
      let cyp = vy;
      let cdir = dir;
      const branchRng = mulberry32(5200 + i * 31);
      for (let s = 0; s < steps; s++) {
        cdir += (branchRng() - 0.5) * 0.52;
        const stepLen = 5 + branchRng() * 10;
        cxp += Math.cos(cdir) * stepLen;
        cyp += Math.sin(cdir) * stepLen;
        ctx.lineTo(cxp, cyp);
        // Occasional delicate crystalline fork
        if (s > 4 && branchRng() > 0.86) {
          const bdir = cdir + (branchRng() > 0.5 ? 0.55 : -0.55);
          const blen = 10 + branchRng() * 16;
          ctx.moveTo(cxp, cyp);
          ctx.lineTo(cxp + Math.cos(bdir) * blen, cyp + Math.sin(bdir) * blen);
          ctx.moveTo(cxp, cyp);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    const colorStr = isGold
      ? `rgba(186, 152, 82, ${(alpha * 0.85).toFixed(3)})`
      : isSage
        ? `rgba(128, 168, 162, ${(alpha * 0.75).toFixed(3)})`
        : `rgba(196, 208, 218, ${alpha.toFixed(3)})`;
    strokeVein(aCtx, colorStr, lw);
    strokeVein(bCtx, 'rgba(92, 92, 92, 0.35)', lw * 1.1);
    strokeVein(rCtx, 'rgba(130, 130, 130, 0.3)', lw * 1.1);
  }

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.49;

  // Radial marble tile grout joints (dark recessed channels)
  const ringRadii = [0.19, 0.38, 0.57, 0.77, 0.96];
  const ringSectors = [8, 8, 16, 24, 24];

  const drawGroutArc = (ctx: CanvasRenderingContext2D, color: string, lw: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    for (let i = 0; i < ringRadii.length; i++) {
      const r0 = i === 0 ? maxR * 0.08 : maxR * ringRadii[i - 1];
      const r1 = maxR * ringRadii[i];
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.stroke();

      const count = ringSectors[i];
      for (let s = 0; s < count; s++) {
        const ang = (s / count) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
    }
  };

  drawGroutArc(aCtx, 'rgba(6, 9, 12, 0.85)', 3.2);
  drawGroutArc(bCtx, 'rgb(28, 28, 28)', 4.5);
  drawGroutArc(rCtx, 'rgb(205, 205, 205)', 4.5);

  // Gleaming inlaid golden brass compass-rose & concentric astrolabe degree rings!
  const drawBrassInlayStroke = (
    drawPath: (ctx: CanvasRenderingContext2D) => void,
    width: number,
    bright = true
  ) => {
    // Dark recessed brass inlay channel outline
    aCtx.save();
    aCtx.strokeStyle = 'rgba(18, 13, 6, 0.9)';
    aCtx.lineWidth = width + 3.2;
    drawPath(aCtx);
    aCtx.stroke();
    aCtx.restore();

    bCtx.save();
    bCtx.strokeStyle = 'rgb(36, 36, 36)';
    bCtx.lineWidth = width + 3.6;
    drawPath(bCtx);
    bCtx.stroke();
    bCtx.restore();

    // Gleaming antique gold brass strip
    aCtx.save();
    aCtx.strokeStyle = bright ? '#d9b25a' : '#b78e3c';
    aCtx.lineWidth = width;
    drawPath(aCtx);
    aCtx.stroke();
    aCtx.restore();

    // Raised polished brass ridge in bumpMap & ultra-reflective low roughness in roughnessMap
    bCtx.save();
    bCtx.strokeStyle = 'rgb(188, 188, 188)';
    bCtx.lineWidth = Math.max(1, width - 0.8);
    drawPath(bCtx);
    bCtx.stroke();
    bCtx.restore();

    rCtx.save();
    rCtx.strokeStyle = 'rgb(34, 34, 34)';
    rCtx.lineWidth = width;
    drawPath(rCtx);
    rCtx.stroke();
    rCtx.restore();
  };

  // Concentric brass astrolabe rings
  const brassRings = [
    { r: maxR * 0.255, w: 6.0, bright: true },
    { r: maxR * 0.278, w: 2.2, bright: false },
    { r: maxR * 0.545, w: 7.5, bright: true },
    { r: maxR * 0.578, w: 2.6, bright: false },
    { r: maxR * 0.865, w: 8.0, bright: true },
    { r: maxR * 0.895, w: 2.8, bright: false },
  ];
  for (const ring of brassRings) {
    drawBrassInlayStroke((ctx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    }, ring.w, ring.bright);
  }

  // Fine 5-degree brass graduation ticks between outer astrolabe rings
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 45 === 0;
    const isMid = deg % 15 === 0;
    const rIn = maxR * (isMajor ? 0.532 : isMid ? 0.548 : 0.556);
    const rOut = maxR * 0.578;
    const lw = isMajor ? 3.2 : isMid ? 2.0 : 1.1;

    aCtx.strokeStyle = isMajor ? '#e7c673' : '#be9745';
    aCtx.lineWidth = lw;
    aCtx.beginPath();
    aCtx.moveTo(cx + Math.cos(rad) * rIn, cy + Math.sin(rad) * rIn);
    aCtx.lineTo(cx + Math.cos(rad) * rOut, cy + Math.sin(rad) * rOut);
    aCtx.stroke();

    rCtx.strokeStyle = 'rgb(38, 38, 38)';
    rCtx.lineWidth = lw;
    rCtx.beginPath();
    rCtx.moveTo(cx + Math.cos(rad) * rIn, cy + Math.sin(rad) * rIn);
    rCtx.lineTo(cx + Math.cos(rad) * rOut, cy + Math.sin(rad) * rOut);
    rCtx.stroke();
  }

  // 16-Point Inlaid Golden Brass Compass Rose radiating from center
  for (let i = 0; i < 16; i++) {
    const isCardinal = i % 4 === 0;
    const isOrdinal = i % 2 === 0 && !isCardinal;
    const ang = (i * Math.PI) / 8 - Math.PI / 2;
    const tipR = maxR * (isCardinal ? 0.855 : isOrdinal ? 0.69 : 0.52);
    const baseR = maxR * 0.255;
    const halfSpread = isCardinal ? 0.085 : isOrdinal ? 0.055 : 0.032;

    const tipX = cx + Math.cos(ang) * tipR;
    const tipY = cy + Math.sin(ang) * tipR;
    const leftX = cx + Math.cos(ang - halfSpread) * baseR;
    const leftY = cy + Math.sin(ang - halfSpread) * baseR;
    const rightX = cx + Math.cos(ang + halfSpread) * baseR;
    const rightY = cy + Math.sin(ang + halfSpread) * baseR;
    const midX = cx + Math.cos(ang) * baseR;
    const midY = cy + Math.sin(ang) * baseR;

    // Split faceted gold compass blade (bright gold half + burnished antique bronze half)
    aCtx.beginPath();
    aCtx.moveTo(midX, midY);
    aCtx.lineTo(leftX, leftY);
    aCtx.lineTo(tipX, tipY);
    aCtx.closePath();
    aCtx.fillStyle = isCardinal ? '#e8c772' : '#cfa64e';
    aCtx.fill();

    aCtx.beginPath();
    aCtx.moveTo(midX, midY);
    aCtx.lineTo(rightX, rightY);
    aCtx.lineTo(tipX, tipY);
    aCtx.closePath();
    aCtx.fillStyle = isCardinal ? '#9c752b' : '#856221';
    aCtx.fill();

    // Recessed border outline + bump + specular roughness for compass blades
    for (const [ctx, fill, stroke] of [
      [aCtx, null, 'rgba(14, 10, 5, 0.85)'],
      [bCtx, 'rgb(178, 178, 178)', 'rgb(35, 35, 35)'],
      [rCtx, 'rgb(30, 30, 30)', 'rgb(180, 180, 180)'],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  }

  // Ornate inlaid brass cardinal compass letters (N, E, S, W) near outer ring
  const cardinals = [
    { label: 'N', ang: -Math.PI / 2 },
    { label: 'E', ang: 0 },
    { label: 'S', ang: Math.PI / 2 },
    { label: 'W', ang: Math.PI },
  ];
  for (const c of cardinals) {
    const r = maxR * 0.928;
    const tx = cx + Math.cos(c.ang) * r;
    const ty = cy + Math.sin(c.ang) * r;
    for (const [ctx, color] of [
      [aCtx, '#e5c16a'],
      [bCtx, 'rgb(190,190,190)'],
      [rCtx, 'rgb(32,32,32)'],
    ] as const) {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(c.ang + Math.PI / 2);
      ctx.font = `700 32px ${SERIF_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(c.label, 0, 0);
      ctx.restore();
    }
  }

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// 3. BRASS — Antique Brushed & Lightly Patinated Astronomical Brass
// ============================================================================

function createBrassTextures(): PBRTextureSet {
  const size = 512;
  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Directional lathe-brushed fine horizontal streaks + gentle age patina mottling
      const brush = tileableFbm(u, v, 4, 64, 3, 811);
      const microBrush = tileableValueNoise(u, v, 8, 128, 823);
      const patina = tileableFbm(u, v, 5, 5, 4, 839);
      const tarnishMask = Math.max(0, (patina - 0.56) * 2.2);

      // Rich antique astronomical brass (#d7b35d polished -> #745520 tarnished -> subtle verdigris hint)
      const glint = (brush - 0.5) * 34 + (microBrush - 0.5) * 20;
      let r = lerp(212, 118, tarnishMask) + glint;
      let g = lerp(174, 96, tarnishMask) + glint * 0.84;
      let b = lerp(88, 52, tarnishMask) + glint * 0.45;

      // Very subtle oxidized greenish-bronze crevice pocket
      if (patina > 0.72) {
        const verd = (patina - 0.72) / 0.28;
        r = lerp(r, 76, verd * 0.45);
        g = lerp(g, 98, verd * 0.45);
        b = lerp(b, 72, verd * 0.45);
      }

      // Riveted plate seam near top/bottom edge (tileable)
      const seamDist = Math.min(v, 1 - v);
      let bumpVal = 128 + (brush - 0.5) * 30 + (microBrush - 0.5) * 22;
      let roughVal = lerp(48, 152, tarnishMask) + (microBrush - 0.5) * 24;

      if (seamDist < 0.014) {
        r *= 0.35;
        g *= 0.35;
        b *= 0.32;
        bumpVal = 30;
        roughVal = 200;
      } else if (seamDist < 0.045) {
        // Subtle crevice patina along seam
        r *= 0.84;
        g *= 0.84;
        b *= 0.8;
        roughVal += 32;
      }

      const idx = (y * size + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(bumpVal);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      const rv = clampByte(roughVal);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Fine crisp brushed hairlines & subtle micro-scratches
  const rng = mulberry32(9102);
  for (let i = 0; i < 650; i++) {
    const y = rng() * size;
    const x = rng() * size;
    const len = 30 + rng() * 140;
    const bright = rng() > 0.45;
    aCtx.strokeStyle = bright
      ? `rgba(255, 232, 165, ${(0.05 + rng() * 0.09).toFixed(3)})`
      : `rgba(75, 52, 18, ${(0.05 + rng() * 0.09).toFixed(3)})`;
    aCtx.lineWidth = 0.7 + rng() * 0.8;
    aCtx.beginPath();
    aCtx.moveTo(x, y);
    aCtx.lineTo(x + len, y + (rng() - 0.5) * 1.4);
    aCtx.stroke();
  }

  // Row of finely detailed dome-headed brass rivets flanking the seam
  const rivetCount = 12;
  const rivetRows = [22, size - 22];
  for (const ry of rivetRows) {
    for (let i = 0; i < rivetCount; i++) {
      const rx = ((i + 0.5) / rivetCount) * size;
      // Dark patina collar
      aCtx.beginPath();
      aCtx.arc(rx, ry, 7.2, 0, Math.PI * 2);
      aCtx.fillStyle = 'rgba(42, 34, 16, 0.78)';
      aCtx.fill();

      // Shaded dome rivet head
      const rg = aCtx.createRadialGradient(rx - 1.8, ry - 1.8, 0.8, rx, ry, 5.4);
      rg.addColorStop(0, '#f2d98c');
      rg.addColorStop(0.55, '#c49a44');
      rg.addColorStop(1, '#6d4e1a');
      aCtx.beginPath();
      aCtx.arc(rx, ry, 5.4, 0, Math.PI * 2);
      aCtx.fillStyle = rg;
      aCtx.fill();

      // Bump dome
      const bg = bCtx.createRadialGradient(rx, ry, 0.5, rx, ry, 6.2);
      bg.addColorStop(0, 'rgb(245,245,245)');
      bg.addColorStop(0.7, 'rgb(175,175,175)');
      bg.addColorStop(1, 'rgb(38,38,38)');
      bCtx.beginPath();
      bCtx.arc(rx, ry, 6.2, 0, Math.PI * 2);
      bCtx.fillStyle = bg;
      bCtx.fill();

      // Polished rivet crown vs tarnished ring in roughness
      rCtx.beginPath();
      rCtx.arc(rx, ry, 7.2, 0, Math.PI * 2);
      rCtx.fillStyle = 'rgb(175,175,175)';
      rCtx.fill();
      rCtx.beginPath();
      rCtx.arc(rx, ry, 4.8, 0, Math.PI * 2);
      rCtx.fillStyle = 'rgb(42,42,42)';
      rCtx.fill();
    }
  }

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// 4. COPPER DOME — Hammered Verdigris & Oxidized Bronze Plates with Rivets
// ============================================================================

function createCopperDomeTextures(): PBRTextureSet {
  const size = 1024;
  const work = 512;
  const [aWork, aWorkCtx] = makeCanvas(work, work);
  const [bWork, bWorkCtx] = makeCanvas(work, work);
  const [rWork, rWorkCtx] = makeCanvas(work, work);

  const aImg = aWorkCtx.createImageData(work, work);
  const bImg = bWorkCtx.createImageData(work, work);
  const rImg = rWorkCtx.createImageData(work, work);

  const rows = 4;
  const cols = 4;

  for (let y = 0; y < work; y++) {
    const v = y / work;
    const row = Math.floor(v * rows);
    const localV = (v * rows) % 1;
    const stagger = (row % 2) * 0.5;

    for (let x = 0; x < work; x++) {
      const u = x / work;
      const su = (u * cols + stagger) % cols;
      const col = Math.floor(su);
      const localU = su % 1;

      const ox = tileableFbm(u, v, 5, 5, 4, 1201);
      const fine = tileableFbm(u, v, 24, 24, 3, 1277);

      // Edge proximity encourages verdigris mineral oxidation around plate seams
      const seamU = Math.min(localU, 1 - localU);
      const seamV = Math.min(localV, 1 - localV);
      const seamNear = Math.min(seamU, seamV);
      const edgeOx = Math.max(0, 1 - seamNear / 0.24);
      const plateSeed = ((row * 13 + col * 29) % 11) / 11;

      const verdigris = Math.min(
        1,
        Math.max(0, (ox - 0.30) * 1.48 + edgeOx * 0.44 + (plateSeed - 0.5) * 0.24)
      );

      // Luminous hammered antique bronze (#7a583b -> #a87b53) blended with rich verdigris-teal (#2d524b -> #4f8c7f)
      const bronzeR = lerp(94, 162, fine) * (0.86 + plateSeed * 0.28);
      const bronzeG = lerp(66, 118, fine) * (0.86 + plateSeed * 0.28);
      const bronzeB = lerp(44, 78, fine) * (0.86 + plateSeed * 0.28);

      const verdR = lerp(45, 86, ox);
      const verdG = lerp(84, 152, ox);
      const verdB = lerp(75, 136, ox);

      let r = lerp(bronzeR, verdR, verdigris);
      let g = lerp(bronzeG, verdG, verdigris);
      let b = lerp(bronzeB, verdB, verdigris);

      let bumpVal = 128 + (fine - 0.5) * 40;
      // Satin metallic bronze (0.24..0.44) transitioning to soft oxidized verdigris patina (0.50..0.68)
      // so upward gaslamp & moonlight beams sculpt the curved copper plates cleanly
      let roughVal = lerp(64, 168, verdigris) + (fine - 0.5) * 24;

      // Overlapping riveted lap-joint ribs with crisp burnished bronze flange edge
      if (seamNear < 0.024) {
        r *= 0.46;
        g *= 0.5;
        b *= 0.5;
        bumpVal = 34;
        roughVal = 195;
      } else if (seamNear < 0.072) {
        // Raised lap flange lip catches warm metallic highlight
        r = lerp(r, 154, 0.28);
        g = lerp(g, 118, 0.24);
        b = lerp(b, 84, 0.2);
        bumpVal = 186;
        roughVal = Math.max(58, roughVal - 34);
      }

      const idx = (y * work + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(bumpVal);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      const rv = clampByte(roughVal);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aWorkCtx.putImageData(aImg, 0, 0);
  bWorkCtx.putImageData(bImg, 0, 0);
  rWorkCtx.putImageData(rImg, 0, 0);

  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  aCtx.drawImage(aWork, 0, 0, size, size);
  bCtx.drawImage(bWork, 0, 0, size, size);
  rCtx.drawImage(rWork, 0, 0, size, size);

  // Hammered dimple micro-facets across all copper plates (tileable wrap)
  const rng = mulberry32(1409);
  for (let i = 0; i < 900; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const rad = 8 + rng() * 14;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = cx + ox;
        const py = cy + oy;
        if (px < -rad || px > size + rad || py < -rad || py > size + rad) continue;

        const bg = bCtx.createRadialGradient(px, py, 1, px, py, rad);
        bg.addColorStop(0, 'rgba(92,92,92,0.22)');
        bg.addColorStop(0.75, 'rgba(138,138,138,0.14)');
        bg.addColorStop(1, 'rgba(128,128,128,0)');
        bCtx.fillStyle = bg;
        bCtx.beginPath();
        bCtx.arc(px, py, rad, 0, Math.PI * 2);
        bCtx.fill();

        const ag = aCtx.createRadialGradient(px - rad * 0.25, py - rad * 0.25, 1, px, py, rad);
        ag.addColorStop(0, 'rgba(218, 168, 118, 0.14)');
        ag.addColorStop(1, 'rgba(30, 56, 52, 0)');
        aCtx.fillStyle = ag;
        aCtx.beginPath();
        aCtx.arc(px, py, rad, 0, Math.PI * 2);
        aCtx.fill();
      }
    }
  }

  // Rivets along horizontal & vertical plate seams
  const plateH = size / rows;
  const plateW = size / cols;
  const drawRivet = (rx: number, ry: number) => {
    const x = ((rx % size) + size) % size;
    const y = ((ry % size) + size) % size;
    aCtx.beginPath();
    aCtx.arc(x, y, 6.2, 0, Math.PI * 2);
    aCtx.fillStyle = 'rgba(28, 56, 50, 0.85)';
    aCtx.fill();

    const rg = aCtx.createRadialGradient(x - 1.6, y - 1.6, 0.5, x, y, 4.8);
    rg.addColorStop(0, '#e5b37c');
    rg.addColorStop(0.58, '#996a44');
    rg.addColorStop(1, '#473121');
    aCtx.beginPath();
    aCtx.arc(x, y, 4.8, 0, Math.PI * 2);
    aCtx.fillStyle = rg;
    aCtx.fill();

    const bg = bCtx.createRadialGradient(x, y, 0.5, x, y, 5.4);
    bg.addColorStop(0, 'rgb(248,248,248)');
    bg.addColorStop(0.75, 'rgb(176,176,176)');
    bg.addColorStop(1, 'rgb(42,42,42)');
    bCtx.beginPath();
    bCtx.arc(x, y, 5.4, 0, Math.PI * 2);
    bCtx.fillStyle = bg;
    bCtx.fill();

    rCtx.beginPath();
    rCtx.arc(x, y, 4.6, 0, Math.PI * 2);
    rCtx.fillStyle = 'rgb(54,54,54)';
    rCtx.fill();
  };

  for (let r = 0; r < rows; r++) {
    const yTop = r * plateH + 14;
    const yBot = (r + 1) * plateH - 14;
    const staggerPx = (r % 2) * (plateW * 0.5);
    for (let x = 22; x < size; x += 36) {
      drawRivet(x, yTop);
      drawRivet(x, yBot);
    }
    for (let c = 0; c < cols; c++) {
      const seamX = c * plateW + staggerPx;
      for (let dy = 38; dy < plateH - 28; dy += 36) {
        drawRivet(seamX + 14, r * plateH + dy);
        drawRivet(seamX - 14, r * plateH + dy);
      }
    }
  }

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// 5. DARK IRON — Wrought Cast-Iron with Sand-Cast Pebble Grain
// ============================================================================

function createDarkIronTextures(): PBRTextureSet {
  const size = 512;
  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const forge = tileableFbm(u, v, 6, 6, 4, 1601);
      const pebble = tileableFbm(u, v, 42, 42, 3, 1657);
      const grit = tileableValueNoise(u, v, 112, 112, 1693);

      const ridge = pebble * 0.65 + grit * 0.35;
      // Sculptural antique gunmetal iron (#272d36 -> #535d6c) with cool forged steel highlights
      let r = lerp(38, 82, ridge) * (0.86 + forge * 0.3);
      let g = lerp(42, 88, ridge) * (0.86 + forge * 0.3);
      let b = lerp(49, 98, ridge) * (0.86 + forge * 0.3);

      // Whisper of oiled warm iron patina in recessed pits
      if (forge < 0.36) {
        const t = (0.36 - forge) / 0.36;
        r += t * 14;
        g += t * 7;
      }

      const idx = (y * size + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(70 + pebble * 115 + grit * 45 + (forge - 0.5) * 32);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      // Burnished cast peaks smoother (~0.30), recessed sand-cast pits satin-matte (~0.62)
      const rv = clampByte(lerp(160, 76, ridge) + (0.5 - forge) * 26);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// 6. PERSIAN RUG — Victorian Crimson, Midnight-Indigo & Gold Celestial Tapestry
// ============================================================================

function createPersianRugTextures(): PBRTextureSet {
  const size = 1024;
  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Base deep midnight-indigo perimeter
  aCtx.fillStyle = '#111b33';
  aCtx.fillRect(0, 0, size, size);

  // Outer gold & crimson guard borders
  const drawFrame = (inset: number, fill: string, stroke?: string, lw = 3) => {
    aCtx.fillStyle = fill;
    aCtx.fillRect(inset, inset, size - inset * 2, size - inset * 2);
    if (stroke) {
      aCtx.strokeStyle = stroke;
      aCtx.lineWidth = lw;
      aCtx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
    }
  };

  drawFrame(18, '#6e1922', '#c89e48', 4);
  drawFrame(42, '#14203b', '#dfc06e', 3);
  drawFrame(126, '#872228', '#c89e48', 4);
  drawFrame(152, '#5e141c', '#e0bd66', 3);

  // Repeating celestial 8-point gold stars & crescent motif inside the main indigo border
  const drawEightStar = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    outerR: number,
    innerR: number,
    fill: string
  ) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / 8;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const borderMid = 84;
  const steps = 11;
  const span = size - borderMid * 2;
  for (let i = 0; i <= steps; i++) {
    const pos = borderMid + (i / steps) * span;
    const drawMotif = (mx: number, my: number, alt: boolean) => {
      // Ornamental crimson cartouche diamond
      aCtx.save();
      aCtx.translate(mx, my);
      aCtx.rotate(Math.PI / 4);
      aCtx.fillStyle = alt ? '#6e1821' : '#253963';
      aCtx.strokeStyle = '#d3ac54';
      aCtx.lineWidth = 2;
      aCtx.fillRect(-19, -19, 38, 38);
      aCtx.strokeRect(-19, -19, 38, 38);
      aCtx.restore();

      drawEightStar(aCtx, mx, my, 14, 5.5, alt ? '#e4c26f' : '#c99c43');
      aCtx.beginPath();
      aCtx.arc(mx, my, 4, 0, Math.PI * 2);
      aCtx.fillStyle = '#5e141c';
      aCtx.fill();
    };

    const alt = i % 2 === 0;
    drawMotif(pos, borderMid, alt);
    drawMotif(pos, size - borderMid, alt);
    if (i > 0 && i < steps) {
      drawMotif(borderMid, pos, alt);
      drawMotif(size - borderMid, pos, alt);
    }
  }

  // Ornate midnight-indigo corner spandrels inside the crimson field
  const fieldStart = 156;
  const fieldEnd = size - 156;
  const corners = [
    [fieldStart, fieldStart, 1, 1],
    [fieldEnd, fieldStart, -1, 1],
    [fieldStart, fieldEnd, 1, -1],
    [fieldEnd, fieldEnd, -1, -1],
  ];
  for (const [x0, y0, sx, sy] of corners) {
    aCtx.beginPath();
    aCtx.moveTo(x0, y0);
    aCtx.lineTo(x0 + sx * 175, y0);
    aCtx.quadraticCurveTo(x0 + sx * 85, y0 + sy * 85, x0, y0 + sy * 175);
    aCtx.closePath();
    aCtx.fillStyle = '#152340';
    aCtx.fill();
    aCtx.strokeStyle = '#d8b45c';
    aCtx.lineWidth = 3.5;
    aCtx.stroke();

    drawEightStar(aCtx, x0 + sx * 44, y0 + sy * 44, 22, 9, '#d6af56');
  }

  // Delicate Victorian gold trellis vines across the crimson center field
  aCtx.save();
  aCtx.beginPath();
  aCtx.rect(fieldStart, fieldStart, fieldEnd - fieldStart, fieldEnd - fieldStart);
  aCtx.clip();
  aCtx.strokeStyle = 'rgba(216, 180, 92, 0.28)';
  aCtx.lineWidth = 2;
  for (let gx = fieldStart + 44; gx < fieldEnd; gx += 72) {
    for (let gy = fieldStart + 44; gy < fieldEnd; gy += 72) {
      aCtx.beginPath();
      aCtx.arc(gx, gy, 24, 0, Math.PI * 2);
      aCtx.stroke();
      drawEightStar(aCtx, gx, gy, 9, 3.5, 'rgba(216, 180, 92, 0.42)');
    }
  }
  aCtx.restore();

  // Grand central navy-and-gold 12-point astronomical sunburst medallion
  aCtx.save();
  aCtx.beginPath();
  for (let i = 0; i < 24; i++) {
    const r = i % 2 === 0 ? 228 : 178;
    const a = (i * Math.PI) / 12;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) aCtx.moveTo(px, py);
    else aCtx.lineTo(px, py);
  }
  aCtx.closePath();
  aCtx.fillStyle = '#14203b';
  aCtx.fill();
  aCtx.strokeStyle = '#e0be6a';
  aCtx.lineWidth = 5;
  aCtx.stroke();

  // Inner concentric gold astrolabe rings & sunburst
  aCtx.beginPath();
  aCtx.arc(cx, cy, 152, 0, Math.PI * 2);
  aCtx.fillStyle = '#6e1922';
  aCtx.fill();
  aCtx.strokeStyle = '#d9b259';
  aCtx.lineWidth = 4;
  aCtx.stroke();

  aCtx.beginPath();
  aCtx.arc(cx, cy, 118, 0, Math.PI * 2);
  aCtx.strokeStyle = '#e8c876';
  aCtx.lineWidth = 2.5;
  aCtx.stroke();

  // 12 zodiac-like gold rays inside medallion
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    aCtx.beginPath();
    aCtx.moveTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44);
    aCtx.lineTo(cx + Math.cos(a) * 148, cy + Math.sin(a) * 148);
    aCtx.strokeStyle = 'rgba(232, 200, 118, 0.7)';
    aCtx.lineWidth = 2.4;
    aCtx.stroke();
    drawEightStar(aCtx, cx + Math.cos(a) * 134, cy + Math.sin(a) * 134, 9, 3.8, '#e8c876');
  }

  drawEightStar(aCtx, cx, cy, 82, 34, '#14203b');
  drawEightStar(aCtx, cx, cy, 64, 24, '#dfbc68');
  drawEightStar(aCtx, cx, cy, 34, 14, '#721b24');
  aCtx.beginPath();
  aCtx.arc(cx, cy, 13, 0, Math.PI * 2);
  aCtx.fillStyle = '#f0d588';
  aCtx.fill();
  aCtx.restore();

  // Subtle woven wool warp & weft texture across albedo, bump, and matte fabric roughness
  bCtx.fillStyle = 'rgb(128, 128, 128)';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = 'rgb(228, 228, 228)';
  rCtx.fillRect(0, 0, size, size);

  const rng = mulberry32(2207);
  // Subtle aged wool dye mottling
  for (let i = 0; i < 180; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const rad = 28 + rng() * 65;
    const g = aCtx.createRadialGradient(px, py, 2, px, py, rad);
    g.addColorStop(0, rng() > 0.5 ? 'rgba(255,220,160,0.045)' : 'rgba(8,6,14,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    aCtx.fillStyle = g;
    aCtx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  // Crisp knotted warp & weft cross-hatch weave
  for (let y = 0; y < size; y += 3) {
    const bright = y % 6 === 0;
    aCtx.fillStyle = bright ? 'rgba(255,245,225,0.045)' : 'rgba(0,0,0,0.075)';
    aCtx.fillRect(0, y, size, 1.5);
    bCtx.fillStyle = bright ? 'rgb(156,156,156)' : 'rgb(96,96,96)';
    bCtx.fillRect(0, y, size, 1.5);
  }
  for (let x = 0; x < size; x += 3) {
    const bright = x % 6 === 0;
    aCtx.fillStyle = bright ? 'rgba(255,240,210,0.035)' : 'rgba(0,0,0,0.065)';
    aCtx.fillRect(x, 0, 1.5, size);
    bCtx.fillStyle = bright ? 'rgba(164,164,164,0.5)' : 'rgba(88,88,88,0.5)';
    bCtx.fillRect(x, 0, 1.5, size);
    rCtx.fillStyle = bright ? 'rgb(216,216,216)' : 'rgb(240,240,240)';
    rCtx.fillRect(x, 0, 1.5, size);
  }

  return makePBRSet(albedo, bump, rough, false);
}

// ============================================================================
// 7. LEATHER — Rich Oxblood/Espresso Pebbled Bookbinding Leather + Gold Tooling
// ============================================================================

function createLeatherTextures(): PBRTextureSet {
  const size = 512;
  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  // Cellular pebbled leather grain via dual-frequency Voronoi-like ridge approximation
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const macro = tileableFbm(u, v, 4, 4, 3, 2503);
      const nA = tileableValueNoise(u, v, 36, 36, 2549);
      const nB = tileableValueNoise(u + 0.015, v + 0.011, 52, 52, 2591);
      // Creased pebble domes
      const cell = 1 - Math.abs(nA * 2 - 1) * 0.55 - Math.abs(nB * 2 - 1) * 0.45;
      const pebble = Math.pow(Math.max(0, Math.min(1, cell)), 1.6);

      // Rich oxblood / espresso Victorian Morocco leather
      const edgeVig = 1 - 0.25 * Math.pow(Math.hypot(u - 0.5, v - 0.5) * 1.4, 2);
      const r = lerp(34, 88, pebble) * (0.85 + macro * 0.28) * edgeVig;
      const g = lerp(11, 29, pebble) * (0.85 + macro * 0.26) * edgeVig;
      const b = lerp(10, 24, pebble) * (0.85 + macro * 0.25) * edgeVig;

      const idx = (y * size + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(42 + pebble * 178);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      // Satin oiled pebble tops (~0.38), deeper matte leather creases (~0.70)
      const rv = clampByte(lerp(182, 96, pebble) + (0.5 - macro) * 20);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Subtle gold-leaf blind-tooled Victorian border & corner fleurons
  const drawTooling = (ctx: CanvasRenderingContext2D, color: string, lw: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.strokeRect(20, 20, size - 40, size - 40);
    ctx.lineWidth = lw * 0.55;
    ctx.strokeRect(29, 29, size - 58, size - 58);

    // Corner filigree diamonds & dots
    const pts = [
      [38, 38],
      [size - 38, 38],
      [38, size - 38],
      [size - 38, size - 38],
    ];
    ctx.fillStyle = color;
    for (const [px, py] of pts) {
      ctx.beginPath();
      ctx.moveTo(px, py - 10);
      ctx.lineTo(px + 10, py);
      ctx.lineTo(px, py + 10);
      ctx.lineTo(px - 10, py);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawTooling(aCtx, 'rgba(208, 168, 76, 0.78)', 2.6);
  drawTooling(bCtx, 'rgb(52, 52, 52)', 3.2);
  drawTooling(rCtx, 'rgb(56, 56, 56)', 2.8);

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// 8. STONE PLINTH — Chiseled Dark Slate / Basalt Ashlar Stonework
// ============================================================================

function createStonePlinthTextures(): PBRTextureSet {
  const size = 512;
  const [albedo, aCtx] = makeCanvas(size, size);
  const [bump, bCtx] = makeCanvas(size, size);
  const [rough, rCtx] = makeCanvas(size, size);

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  const courses = 4;
  const blocksPerRow = 2;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * courses);
    const localV = (v * courses) % 1;
    const stagger = (row % 2) * 0.5;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const su = (u * blocksPerRow + stagger) % blocksPerRow;
      const col = Math.floor(su);
      const localU = su % 1;

      const blockTint = 0.86 + (((row * 17 + col * 31) % 7) / 7) * 0.26;
      const base = tileableFbm(u, v, 6, 6, 4, 3001);
      const grain = tileableFbm(u, v, 28, 28, 3, 3067);
      const sparkle = tileableValueNoise(u, v, 96, 96, 3109);

      // Chiseled dark slate/basalt (#22272f -> #434b56)
      let r = lerp(31, 63, base * 0.65 + grain * 0.35) * blockTint;
      let g = lerp(35, 69, base * 0.65 + grain * 0.35) * blockTint;
      let b = lerp(42, 79, base * 0.65 + grain * 0.35) * blockTint;

      let bumpVal = 128 + (base - 0.5) * 42 + (grain - 0.5) * 58;
      let roughVal = lerp(176, 224, grain);

      // Tiny quartz/mica mineral speckles
      if (sparkle > 0.91) {
        r += 48;
        g += 52;
        b += 58;
        roughVal = 92;
      }

      // Recessed beveled mortar joints
      const edgeU = Math.min(localU, 1 - localU);
      const edgeV = Math.min(localV, 1 - localV);
      const joint = Math.min(edgeU * 1.4, edgeV);
      if (joint < 0.028) {
        r = 18;
        g = 20;
        b = 24;
        bumpVal = 24;
        roughVal = 242;
      } else if (joint < 0.07) {
        const bt = (joint - 0.028) / 0.042;
        const shade = localV < 0.5 ? 1.15 : 0.78;
        r *= lerp(0.55, shade, bt);
        g *= lerp(0.55, shade, bt);
        b *= lerp(0.55, shade, bt);
        bumpVal = lerp(54, 152, bt);
      }

      const idx = (y * size + x) * 4;
      aImg.data[idx] = clampByte(r);
      aImg.data[idx + 1] = clampByte(g);
      aImg.data[idx + 2] = clampByte(b);
      aImg.data[idx + 3] = 255;

      const bv = clampByte(bumpVal);
      bImg.data[idx] = bv;
      bImg.data[idx + 1] = bv;
      bImg.data[idx + 2] = bv;
      bImg.data[idx + 3] = 255;

      const rv = clampByte(roughVal);
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Fine diagonal stone-chisel tooling marks
  const rng = mulberry32(3319);
  for (let i = 0; i < 420; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 8 + rng() * 18;
    bCtx.strokeStyle = rng() > 0.5 ? 'rgba(200,200,200,0.22)' : 'rgba(55,55,55,0.25)';
    bCtx.lineWidth = 1.2;
    bCtx.beginPath();
    bCtx.moveTo(x, y);
    bCtx.lineTo(x + len * 0.7, y + len * 0.7);
    bCtx.stroke();
  }

  return makePBRSet(albedo, bump, rough, true);
}

// ============================================================================
// ARTWORK HELPERS — Shared Victorian Frame Flourishes & Lunar Phase Renderer
// ============================================================================

function drawVictorianGoldFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  inset = 28
): void {
  ctx.save();
  ctx.strokeStyle = '#d4af59';
  ctx.lineWidth = 4;
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);

  ctx.strokeStyle = 'rgba(212, 175, 89, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(inset + 10, inset + 10, size - (inset + 10) * 2, size - (inset + 10) * 2);

  // Corner brass rosettes
  const corners = [
    [inset + 10, inset + 10],
    [size - inset - 10, inset + 10],
    [inset + 10, size - inset - 10],
    [size - inset - 10, size - inset - 10],
  ];
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#0c1528';
    ctx.fill();
    ctx.strokeStyle = '#e5c470';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#e5c470';
    ctx.fill();
  }
  ctx.restore();
}

function drawStarGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color = '#fff4d6',
  glowColor = 'rgba(255, 224, 150, 0.55)'
): void {
  const g = ctx.createRadialGradient(x, y, 0.5, x, y, r * 3.4);
  g.addColorStop(0, glowColor);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
  ctx.fill();

  // 4-point crisp diffraction spikes
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.25);
  ctx.beginPath();
  ctx.moveTo(x - r * 2.2, y);
  ctx.lineTo(x + r * 2.2, y);
  ctx.moveTo(x, y - r * 2.2);
  ctx.lineTo(x, y + r * 2.2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawMoonPhaseDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phaseIdx: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Dark unlit moon hemisphere
  const darkGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
  darkGrad.addColorStop(0, '#222b3e');
  darkGrad.addColorStop(1, '#0d1320');
  ctx.fillStyle = darkGrad;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Lit lunar surface gradient
  const litGrad = ctx.createRadialGradient(cx - r * 0.18, cy - r * 0.2, r * 0.1, cx, cy, r * 1.15);
  litGrad.addColorStop(0, '#fff9e6');
  litGrad.addColorStop(0.55, '#ebd9a8');
  litGrad.addColorStop(1, '#bca26a');

  if (phaseIdx === 4) {
    // Full Moon
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  } else if (phaseIdx === 1) {
    // Waxing Crescent (right crescent lit)
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx, cy - r, r, r * 2);
    ctx.fillStyle = darkGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.54, r, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (phaseIdx === 2) {
    // First Quarter (right half lit)
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx, cy - r, r, r * 2);
  } else if (phaseIdx === 3) {
    // Waxing Gibbous (right 75% lit)
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx, cy - r, r, r * 2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.54, r, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (phaseIdx === 5) {
    // Waning Gibbous (left 75% lit)
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx - r, cy - r, r, r * 2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.54, r, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (phaseIdx === 6) {
    // Last Quarter (left half lit)
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx - r, cy - r, r, r * 2);
  } else if (phaseIdx === 7) {
    // Waning Crescent (left crescent lit)
    ctx.fillStyle = litGrad;
    ctx.fillRect(cx - r, cy - r, r, r * 2);
    ctx.fillStyle = darkGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.54, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle lunar maria & craters
  const craters = [
    [-0.3, -0.25, 0.22],
    [0.24, -0.18, 0.26],
    [0.12, 0.26, 0.2],
    [-0.22, 0.3, 0.15],
    [0.36, 0.14, 0.14],
  ];
  for (const [ox, oy, cr] of craters) {
    ctx.beginPath();
    ctx.arc(cx + ox * r, cy + oy * r, cr * r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72, 62, 46, 0.16)';
    ctx.fill();
  }

  if (phaseIdx === 0) {
    // Subtle silver-gold eclipse corona rim so New Moon reads clearly
    ctx.strokeStyle = 'rgba(218, 198, 148, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // Outer brass bezel ring
  ctx.strokeStyle = '#d4ae58';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draws a crisp engraved 4-point celestial star without relying on OS font glyphs.
 */
function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string
): void {
  const ir = r * 0.3;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : ir;
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

/**
 * Draws crisp bespoke 1898 engraved vector planetary glyphs (Earth, Mars, Saturn)
 * so macOS/Windows never substitute color emojis.
 */
function drawPlanetGlyph(
  ctx: CanvasRenderingContext2D,
  planet: 'earth' | 'mars' | 'saturn',
  x: number,
  y: number,
  size: number,
  color = '#f4d58d',
  lineWidth = 2.6
): void {
  const s = size * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (planet === 'earth') {
    const r = s * 0.78;
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
  } else if (planet === 'mars') {
    const r = s * 0.54;
    const cx = -s * 0.18;
    const cy = s * 0.18;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    const sx = cx + r * 0.71;
    const sy = cy - r * 0.71;
    const ex = s * 0.8;
    const ey = -s * 0.8;
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex - s * 0.44, ey);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex, ey + s * 0.44);
  } else {
    // Saturn (crossbar staff + sweeping sickle)
    ctx.moveTo(-s * 0.38, -s * 0.86);
    ctx.lineTo(-s * 0.38, s * 0.68);
    ctx.moveTo(-s * 0.74, -s * 0.52);
    ctx.lineTo(s * 0.04, -s * 0.52);
    ctx.moveTo(-s * 0.38, -s * 0.02);
    ctx.bezierCurveTo(s * 0.28, -s * 0.38, s * 0.68, -s * 0.04, s * 0.34, s * 0.44);
    ctx.bezierCurveTo(s * 0.16, s * 0.72, s * 0.42, s * 0.92, s * 0.72, s * 0.66);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Draws crisp bespoke 1898 engraved vector Zodiac glyphs (0: Aries .. 11: Pisces)
 * in pure gold-stroke 2D Canvas line art — zero Apple Color Emoji rendering!
 */
function drawZodiacGlyph(
  ctx: CanvasRenderingContext2D,
  index: number,
  x: number,
  y: number,
  size: number,
  color = '#f4d58d',
  lineWidth = 3.2
): void {
  const s = size * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  switch (index) {
    case 0: {
      // Aries — symmetrical ram horns descending to central stem
      ctx.moveTo(0, s * 0.88);
      ctx.lineTo(0, -s * 0.18);
      ctx.bezierCurveTo(-s * 0.06, -s * 0.95, -s * 0.95, -s * 0.95, -s * 0.88, -s * 0.28);
      ctx.moveTo(0, -s * 0.18);
      ctx.bezierCurveTo(s * 0.06, -s * 0.95, s * 0.95, -s * 0.95, s * 0.88, -s * 0.28);
      break;
    }
    case 1: {
      // Taurus — circle crowned by sweeping bull horns
      ctx.arc(0, s * 0.3, s * 0.52, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.78, -s * 0.82);
      ctx.bezierCurveTo(-s * 0.66, -s * 0.14, s * 0.66, -s * 0.14, s * 0.78, -s * 0.82);
      break;
    }
    case 2: {
      // Gemini — twin columns framed by bowed classical architraves
      ctx.moveTo(-s * 0.34, -s * 0.66);
      ctx.lineTo(-s * 0.34, s * 0.66);
      ctx.moveTo(s * 0.34, -s * 0.66);
      ctx.lineTo(s * 0.34, s * 0.66);
      ctx.moveTo(-s * 0.82, -s * 0.82);
      ctx.quadraticCurveTo(0, -s * 0.52, s * 0.82, -s * 0.82);
      ctx.moveTo(-s * 0.82, s * 0.82);
      ctx.quadraticCurveTo(0, s * 0.52, s * 0.82, s * 0.82);
      break;
    }
    case 3: {
      // Cancer — twin opposing curled celestial spirals
      ctx.arc(-s * 0.44, -s * 0.34, s * 0.28, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.44, -s * 0.62);
      ctx.bezierCurveTo(s * 0.2, -s * 0.76, s * 0.68, -s * 0.5, s * 0.84, -s * 0.12);
      ctx.moveTo(s * 0.72, s * 0.34);
      ctx.arc(s * 0.44, s * 0.34, s * 0.28, 0, Math.PI * 2);
      ctx.moveTo(s * 0.44, s * 0.62);
      ctx.bezierCurveTo(-s * 0.2, s * 0.76, -s * 0.68, s * 0.5, -s * 0.84, s * 0.12);
      break;
    }
    case 4: {
      // Leo — circular head rising into lion-mane arch with curled tail
      ctx.arc(-s * 0.48, s * 0.26, s * 0.28, 0, Math.PI * 2);
      ctx.moveTo(-s * 0.36, 0);
      ctx.bezierCurveTo(-s * 0.36, -s * 0.96, s * 0.62, -s * 0.96, s * 0.46, -s * 0.08);
      ctx.bezierCurveTo(s * 0.34, s * 0.54, s * 0.58, s * 0.84, s * 0.88, s * 0.56);
      break;
    }
    case 5: {
      // Virgo — triple-arch 'M' with crossed lower loop
      ctx.moveTo(-s * 0.82, -s * 0.48);
      ctx.quadraticCurveTo(-s * 0.72, -s * 0.66, -s * 0.62, -s * 0.42);
      ctx.lineTo(-s * 0.62, s * 0.54);
      ctx.moveTo(-s * 0.62, -s * 0.28);
      ctx.bezierCurveTo(-s * 0.52, -s * 0.72, -s * 0.18, -s * 0.72, -s * 0.18, -s * 0.22);
      ctx.lineTo(-s * 0.18, s * 0.54);
      ctx.moveTo(-s * 0.18, -s * 0.28);
      ctx.bezierCurveTo(-s * 0.08, -s * 0.72, s * 0.26, -s * 0.72, s * 0.26, -s * 0.2);
      ctx.lineTo(s * 0.26, s * 0.56);
      ctx.quadraticCurveTo(s * 0.28, s * 0.86, s * 0.56, s * 0.86);
      // Crossed Virgin ribbon loop
      ctx.moveTo(s * 0.26, -s * 0.12);
      ctx.bezierCurveTo(s * 0.82, -s * 0.42, s * 0.92, s * 0.32, s * 0.06, s * 0.72);
      break;
    }
    case 6: {
      // Libra — balanced scales arch resting above horizon bar
      ctx.moveTo(-s * 0.88, s * 0.68);
      ctx.lineTo(s * 0.88, s * 0.68);
      ctx.moveTo(-s * 0.88, s * 0.26);
      ctx.lineTo(-s * 0.42, s * 0.26);
      ctx.arc(0, s * 0.26, s * 0.42, Math.PI, 0, false);
      ctx.lineTo(s * 0.88, s * 0.26);
      break;
    }
    case 7: {
      // Scorpius — triple-arch 'M' with upward barbed scorpion stinger
      ctx.moveTo(-s * 0.84, -s * 0.48);
      ctx.quadraticCurveTo(-s * 0.74, -s * 0.66, -s * 0.64, -s * 0.42);
      ctx.lineTo(-s * 0.64, s * 0.54);
      ctx.moveTo(-s * 0.64, -s * 0.28);
      ctx.bezierCurveTo(-s * 0.54, -s * 0.72, -s * 0.18, -s * 0.72, -s * 0.18, -s * 0.22);
      ctx.lineTo(-s * 0.18, s * 0.54);
      ctx.moveTo(-s * 0.18, -s * 0.28);
      ctx.bezierCurveTo(-s * 0.08, -s * 0.72, s * 0.28, -s * 0.72, s * 0.28, -s * 0.22);
      ctx.lineTo(s * 0.28, s * 0.48);
      ctx.quadraticCurveTo(s * 0.3, s * 0.82, s * 0.58, s * 0.64);
      ctx.lineTo(s * 0.84, s * 0.34);
      // Stinger arrow barbs
      ctx.moveTo(s * 0.58, s * 0.34);
      ctx.lineTo(s * 0.84, s * 0.34);
      ctx.lineTo(s * 0.82, s * 0.6);
      break;
    }
    case 8: {
      // Sagittarius — diagonal archer's arrow with bow crossbar
      ctx.moveTo(-s * 0.74, s * 0.74);
      ctx.lineTo(s * 0.74, -s * 0.74);
      ctx.moveTo(s * 0.18, -s * 0.74);
      ctx.lineTo(s * 0.74, -s * 0.74);
      ctx.lineTo(s * 0.74, -s * 0.18);
      ctx.moveTo(-s * 0.54, -s * 0.06);
      ctx.lineTo(s * 0.06, s * 0.54);
      break;
    }
    case 9: {
      // Capricornus — sharp horned V descending into looped sea-goat tail
      ctx.moveTo(-s * 0.84, -s * 0.52);
      ctx.lineTo(-s * 0.44, s * 0.46);
      ctx.lineTo(-s * 0.02, -s * 0.48);
      ctx.bezierCurveTo(s * 0.2, -s * 0.48, s * 0.26, s * 0.32, s * 0.14, s * 0.76);
      ctx.moveTo(s * 0.16, s * 0.3);
      ctx.bezierCurveTo(s * 0.26, -s * 0.14, s * 0.86, -s * 0.08, s * 0.76, s * 0.34);
      ctx.bezierCurveTo(s * 0.68, s * 0.72, s * 0.18, s * 0.76, -s * 0.04, s * 0.84);
      break;
    }
    case 10: {
      // Aquarius — twin crisp celestial water waves
      for (const wy of [-s * 0.3, s * 0.34]) {
        ctx.moveTo(-s * 0.86, wy + s * 0.12);
        ctx.lineTo(-s * 0.52, wy - s * 0.18);
        ctx.lineTo(-s * 0.18, wy + s * 0.14);
        ctx.lineTo(s * 0.18, wy - s * 0.18);
        ctx.lineTo(s * 0.52, wy + s * 0.14);
        ctx.lineTo(s * 0.86, wy - s * 0.16);
      }
      break;
    }
    case 11: {
      // Pisces — opposing crescents bound by central horizontal cord
      ctx.moveTo(-s * 0.68, -s * 0.82);
      ctx.quadraticCurveTo(-s * 0.16, 0, -s * 0.68, s * 0.82);
      ctx.moveTo(s * 0.68, -s * 0.82);
      ctx.quadraticCurveTo(s * 0.16, 0, s * 0.68, s * 0.82);
      ctx.moveTo(-s * 0.78, 0);
      ctx.lineTo(s * 0.78, 0);
      break;
    }
  }

  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// 9. STAR CHART WALL (1024px) — Framed Celestial Hemisphere + Great Conjunction
// ============================================================================

function createStarChartWallTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = 470;
  const mapR = 300;

  // Deep midnight Prussian-indigo celestial plate
  const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, 640);
  bg.addColorStop(0, '#102042');
  bg.addColorStop(0.65, '#091226');
  bg.addColorStop(1, '#050812');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  drawVictorianGoldFrame(ctx, size, 26);

  // Header typography
  ctx.fillStyle = '#efd287';
  ctx.font = `700 34px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('PLANISPHAERIUM COELESTE', cx, 84);

  ctx.fillStyle = '#b99c62';
  ctx.font = `italic 22px ${SERIF_BODY}`;
  ctx.fillText('Royal Astronomical Observatory  ·  Epoch MDCCCXCVIII', cx, 114);

  // Subtle Milky Way glow band inside hemisphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, mapR - 36, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-0.45);
  const mw = ctx.createLinearGradient(0, -110, 0, 110);
  mw.addColorStop(0, 'rgba(90,140,220,0)');
  mw.addColorStop(0.5, 'rgba(110,165,245,0.16)');
  mw.addColorStop(1, 'rgba(90,140,220,0)');
  ctx.fillStyle = mw;
  ctx.fillRect(-350, -110, 700, 220);
  ctx.restore();

  // Concentric declination rings & RA hour spokes
  for (const frac of [0.25, 0.5, 0.72, 0.88, 1.0]) {
    ctx.beginPath();
    ctx.arc(cx, cy, mapR * frac, 0, Math.PI * 2);
    ctx.strokeStyle =
      frac >= 0.88 ? '#d6b05a' : 'rgba(214, 176, 90, 0.3)';
    ctx.lineWidth = frac === 1.0 ? 3.2 : frac === 0.88 ? 2.2 : 1.1;
    ctx.stroke();
  }

  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 35, cy + Math.sin(a) * 35);
    ctx.lineTo(cx + Math.cos(a) * mapR, cy + Math.sin(a) * mapR);
    ctx.strokeStyle = 'rgba(214, 176, 90, 0.28)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  // Highlighted zodiac ring band (0..11) with gold emphasis on ARIES (0), LEO (4), AQUARIUS (10)
  const highlightedHouses = new Map<
    number,
    { planet: string; key: 'earth' | 'mars' | 'saturn' }
  >([
    [0, { planet: 'EARTH', key: 'earth' }],
    [4, { planet: 'MARS', key: 'mars' }],
    [10, { planet: 'SATURN', key: 'saturn' }],
  ]);

  for (let i = 0; i < 12; i++) {
    const startA = (i - 0.5) * (Math.PI / 6) - Math.PI / 2;
    const endA = (i + 0.5) * (Math.PI / 6) - Math.PI / 2;
    const midA = i * (Math.PI / 6) - Math.PI / 2;
    const isHit = highlightedHouses.has(i);

    if (isHit) {
      ctx.beginPath();
      ctx.arc(cx, cy, mapR, startA, endA);
      ctx.arc(cx, cy, mapR * 0.88, endA, startA, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(225, 172, 62, 0.34)';
      ctx.fill();
      ctx.strokeStyle = '#ffdc7c';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // Zodiac vector glyph + name along outer ring (zero OS emojis)
    ctx.save();
    ctx.translate(cx + Math.cos(midA) * (mapR * 0.94), cy + Math.sin(midA) * (mapR * 0.94));
    ctx.rotate(midA + Math.PI / 2);
    const labelStr = ZODIAC_NAMES[i].toUpperCase();
    ctx.font = `${isHit ? '700 14px' : '600 11.5px'} ${SERIF_DISPLAY}`;
    const textW = ctx.measureText(labelStr).width;
    const glyphSize = isHit ? 16 : 13;
    drawZodiacGlyph(
      ctx,
      i,
      -textW * 0.5 - glyphSize * 0.65,
      0,
      glyphSize,
      isHit ? '#fff0b8' : '#d6b364',
      isHit ? 2.0 : 1.5
    );
    ctx.fillStyle = isHit ? '#fff0b8' : '#c7a45a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelStr, glyphSize * 0.45, 1);
    ctx.restore();

    // Inner planetary marker medallion for the 3 Great Conjunction houses
    const hit = highlightedHouses.get(i);
    if (hit) {
      const pr = mapR * 0.72;
      const px = cx + Math.cos(midA) * pr;
      const py = cy + Math.sin(midA) * pr;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(midA) * (mapR * 0.88), cy + Math.sin(midA) * (mapR * 0.88));
      ctx.lineTo(px, py);
      ctx.strokeStyle = '#ffd977';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(px, py, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#18294a';
      ctx.fill();
      ctx.strokeStyle = '#ffd872';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      drawPlanetGlyph(ctx, hit.key, px, py, 22, '#fff2c2', 2.4);
    }
  }

  // Ecliptic golden dashed orbital ring
  ctx.beginPath();
  ctx.ellipse(cx + 12, cy - 8, mapR * 0.64, mapR * 0.56, 0.32, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(245, 208, 114, 0.65)';
  ctx.lineWidth = 1.8;
  ctx.setLineDash([7, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Background starfield & decorative constellations inside hemisphere
  const rng = mulberry32(7711);
  for (let i = 0; i < 240; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * (mapR * 0.85);
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const sr = 0.8 + rng() * 1.9;
    ctx.fillStyle = rng() > 0.35 ? 'rgba(232, 240, 255, 0.78)' : 'rgba(255, 224, 155, 0.82)';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stylized constellation stick figures inside chart
  const miniConsts = [
    [
      [-120, -100],
      [-85, -130],
      [-45, -110],
      [-15, -140],
      [25, -125],
    ],
    [
      [75, -60],
      [120, -35],
      [145, 10],
      [95, 45],
      [75, -60],
    ],
    [
      [-135, 35],
      [-95, 70],
      [-55, 55],
      [-20, 95],
    ],
  ];
  ctx.strokeStyle = 'rgba(235, 202, 122, 0.55)';
  ctx.lineWidth = 1.4;
  for (const chain of miniConsts) {
    ctx.beginPath();
    chain.forEach(([ox, oy], idx) => {
      if (idx === 0) ctx.moveTo(cx + ox, cy + oy);
      else ctx.lineTo(cx + ox, cy + oy);
    });
    ctx.stroke();
    for (const [ox, oy] of chain) {
      drawStarGlint(ctx, cx + ox, cy + oy, 3.2);
    }
  }

  // Central gilded compass emblem
  drawStarGlint(ctx, cx, cy, 8, '#fff2c2', 'rgba(255, 212, 105, 0.45)');

  // Bottom Great Conjunction Clue Plaque — crystal clear & museum-grade!
  const px = 88;
  const py = 804;
  const pw = size - 176;
  const ph = 158;

  const plaqueBg = ctx.createLinearGradient(px, py, px, py + ph);
  plaqueBg.addColorStop(0, '#13203b');
  plaqueBg.addColorStop(1, '#0b1326');
  ctx.fillStyle = plaqueBg;
  ctx.fillRect(px, py, pw, ph);

  ctx.strokeStyle = '#e2be68';
  ctx.lineWidth = 3;
  ctx.strokeRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(226, 190, 104, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(px + 8, py + 8, pw - 16, ph - 16);

  ctx.fillStyle = '#e7c673';
  ctx.font = `700 22px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('THE GREAT CONJUNCTION  ·  ORRERY ALIGNMENT', cx, py + 38);

  // Subtle divider line
  ctx.strokeStyle = 'rgba(226, 190, 104, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(px + 60, py + 52);
  ctx.lineTo(px + pw - 60, py + 52);
  ctx.stroke();

  const clueRows: Array<{
    planet: 'earth' | 'mars' | 'saturn';
    text: string;
    zodiacIdx: number;
    x: number;
    y: number;
  }> = [
    { planet: 'earth', text: 'EARTH  —  ARIES', zodiacIdx: 0, x: cx - 210, y: py + 93 },
    { planet: 'mars', text: 'MARS  —  LEO', zodiacIdx: 4, x: cx + 210, y: py + 93 },
    { planet: 'saturn', text: 'SATURN  —  AQUARIUS', zodiacIdx: 10, x: cx, y: py + 135 },
  ];

  ctx.fillStyle = '#fff2c8';
  ctx.font = `700 24px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const row of clueRows) {
    const tw = ctx.measureText(row.text).width;
    ctx.fillText(row.text, row.x, row.y);
    drawPlanetGlyph(ctx, row.planet, row.x - tw * 0.5 - 24, row.y - 1, 22, '#f4d58d', 2.4);
    drawZodiacGlyph(ctx, row.zodiacIdx, row.x + tw * 0.5 + 24, row.y - 1, 22, '#f4d58d', 2.4);
  }

  return configureTexture(canvas, true, false);
}

// ============================================================================
// 10. LUNAR ALMANAC (1024px) — Framed Gilded 8-Phase Circle + 4 Marked Clues
// ============================================================================

function createLunarAlmanacTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = 486;
  const orbitR = 266;

  // Deep midnight-slate celestial parchment plate
  const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, 620);
  bg.addColorStop(0, '#131d34');
  bg.addColorStop(0.65, '#0b1122');
  bg.addColorStop(1, '#060912');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  drawVictorianGoldFrame(ctx, size, 26);

  // Title banner
  ctx.fillStyle = '#efd287';
  ctx.font = `700 34px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('ALMANAC OF THE LUNAR PHASES', cx, 84);

  ctx.fillStyle = '#bba068';
  ctx.font = `italic 22px ${SERIF_BODY}`;
  ctx.fillText('Dr. Alistair Vance  ·  Cryptex Order Marked in Crimson & Gold', cx, 116);

  // Subtle decorative starry background
  const rng = mulberry32(5521);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(240, 232, 200, ${(0.18 + rng() * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(50 + rng() * (size - 100), 135 + rng() * 680, 0.8 + rng() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ornate central astrolabe orbit rings
  ctx.strokeStyle = 'rgba(216, 178, 92, 0.55)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(216, 178, 92, 0.25)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR - 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, orbitR + 82, 0, Math.PI * 2);
  ctx.stroke();

  // Central gilded Earth emblem
  const earthG = ctx.createRadialGradient(cx - 14, cy - 14, 4, cx, cy, 52);
  earthG.addColorStop(0, '#4f8dc4');
  earthG.addColorStop(0.65, '#1d446e');
  earthG.addColorStop(1, '#0b1d36');
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fillStyle = earthG;
  ctx.fill();
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 2.8;
  ctx.stroke();

  ctx.fillStyle = '#d8b25a';
  ctx.font = `700 15px ${SERIF_DISPLAY}`;
  ctx.fillText('TERRA', cx, cy + 72);

  // Marked puzzle clue phases: [1, 4, 5, 0] -> I, II, III, IV
  const markedOrder = new Map<number, string>([
    [1, 'I'],
    [4, 'II'],
    [5, 'III'],
    [0, 'IV'],
  ]);

  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 - Math.PI / 2;
    const mx = cx + Math.cos(ang) * orbitR;
    const my = cy + Math.sin(ang) * orbitR;
    const roman = markedOrder.get(i);

    // Subtle radial spoke
    ctx.strokeStyle = roman ? 'rgba(230, 120, 96, 0.55)' : 'rgba(216, 178, 92, 0.24)';
    ctx.lineWidth = roman ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 56, cy + Math.sin(ang) * 56);
    ctx.lineTo(cx + Math.cos(ang) * (orbitR - 58), cy + Math.sin(ang) * (orbitR - 58));
    ctx.stroke();

    // Draw crimson-and-gold encirclement around the 4 cipher phases!
    if (roman) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, 58, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(155, 32, 38, 0.24)';
      ctx.fill();
      ctx.strokeStyle = '#e05248';
      ctx.lineWidth = 4.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(mx, my, 64, 0, Math.PI * 2);
      ctx.strokeStyle = '#f2cf74';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Moon phase disc
    drawMoonPhaseDisc(ctx, mx, my, 43, i);

    // Roman numeral seal badge on the 4 cipher phases
    if (roman) {
      const bx = mx + 44;
      const by = my - 42;
      ctx.beginPath();
      ctx.arc(bx, by, 21, 0, Math.PI * 2);
      ctx.fillStyle = '#8c1d24';
      ctx.fill();
      ctx.strokeStyle = '#f5d47a';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.fillStyle = '#fff4cf';
      ctx.font = `700 20px ${SERIF_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roman, bx, by + 1);
    }

    // Phase name label neatly outside or below
    const labelOffset = i === 0 ? -74 : i === 4 ? 78 : 74;
    const lx = mx + (i === 2 ? 32 : i === 6 ? -32 : 0);
    const ly = i === 0 || i === 4 ? my + labelOffset : my + 78;
    ctx.fillStyle = roman ? '#ffebb2' : '#c6ae7a';
    ctx.font = `${roman ? '700 18px' : '600 15px'} ${SERIF_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LUNAR_PHASE_NAMES[i].toUpperCase(), lx, ly);
  }

  // Bottom cipher summary ribbon
  const bx = 68;
  const by = 868;
  const bw = size - 136;
  const bh = 96;
  ctx.fillStyle = '#121c33';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#dfba64';
  ctx.lineWidth = 2.6;
  ctx.strokeRect(bx, by, bw, bh);

  ctx.fillStyle = '#e46256';
  ctx.font = `700 18px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('CIPHER SEQUENCE (I → IV)', cx, by + 29);

  ctx.fillStyle = '#fff2c6';
  ctx.font = `700 21px ${SERIF_DISPLAY}`;
  ctx.fillText(
    'I. Waxing Crescent  ·  II. Full Moon  ·  III. Waning Gibbous  ·  IV. New Moon',
    cx,
    by + 65
  );

  return configureTexture(canvas, true, false);
}

// ============================================================================
// 11. CONSTELLATION MAP (1024px) — Backlit Midnight-Blue & Gold Lectern Plate
// ============================================================================

function createConstellationMapTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);

  // Luminous backlit cobalt-sapphire glass gradient
  const bg = ctx.createRadialGradient(size * 0.5, size * 0.48, 60, size * 0.5, size * 0.5, 680);
  bg.addColorStop(0, '#123166');
  bg.addColorStop(0.55, '#0b1e42');
  bg.addColorStop(1, '#050d20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Soft luminous cyan Milky Way diagonal drift
  ctx.save();
  ctx.translate(size * 0.5, size * 0.5);
  ctx.rotate(-0.52);
  const nebula = ctx.createLinearGradient(0, -180, 0, 180);
  nebula.addColorStop(0, 'rgba(55, 145, 225, 0)');
  nebula.addColorStop(0.5, 'rgba(72, 178, 248, 0.19)');
  nebula.addColorStop(1, 'rgba(55, 145, 225, 0)');
  ctx.fillStyle = nebula;
  ctx.fillRect(-700, -180, 1400, 360);
  ctx.restore();

  // Delicate brass celestial coordinate grid
  ctx.strokeStyle = 'rgba(218, 184, 102, 0.24)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 8; i++) {
    const p = (i / 8) * size;
    ctx.beginPath();
    ctx.moveTo(p, 40);
    ctx.lineTo(p, size - 40);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(40, p);
    ctx.lineTo(size - 40, p);
    ctx.stroke();
  }

  // Concentric brass astrolabe sighting arcs centered on Polaris
  const polX = CONSTELLATION_STAR_COORDS.polaris.u * size;
  const polY = CONSTELLATION_STAR_COORDS.polaris.v * size;
  for (const r of [140, 290, 460, 640]) {
    ctx.beginPath();
    ctx.arc(polX, polY, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(130, 195, 255, 0.16)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  // Ornate brass degree frame bezel
  drawVictorianGoldFrame(ctx, size, 24);
  for (let i = 0; i <= 40; i++) {
    const t = 44 + (i / 40) * (size - 88);
    const tick = i % 5 === 0 ? 14 : 7;
    ctx.strokeStyle = 'rgba(228, 195, 112, 0.6)';
    ctx.lineWidth = i % 5 === 0 ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(t, 24);
    ctx.lineTo(t, 24 + tick);
    ctx.moveTo(t, size - 24);
    ctx.lineTo(t, size - 24 - tick);
    ctx.moveTo(24, t);
    ctx.lineTo(24 + tick, t);
    ctx.moveTo(size - 24, t);
    ctx.lineTo(size - 24 - tick, t);
    ctx.stroke();
  }

  // Header engraved brass title
  ctx.fillStyle = '#f0d48a';
  ctx.font = `700 28px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('STELLAR CIRCUIT CHART  ·  NORTHERN HEMISPHERE', size / 2, 76);

  // Subtle background field stars
  const rng = mulberry32(8831);
  for (let i = 0; i < 320; i++) {
    const x = 44 + rng() * (size - 88);
    const y = 96 + rng() * (size - 140);
    const sr = 0.7 + rng() * 1.8;
    ctx.fillStyle = rng() > 0.3 ? 'rgba(205, 232, 255, 0.65)' : 'rgba(255, 224, 158, 0.72)';
    ctx.beginPath();
    ctx.arc(x, y, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint decorative constellation guide lines around non-puzzle star neighborhoods (no giveaway!)
  const decorativeLines: Array<[[number, number], [number, number]]> = [
    [[0.44, 0.54], [0.35, 0.79]], // Orion Betelgeuse -> Rigel
    [[0.44, 0.54], [0.51, 0.63]],
    [[0.35, 0.79], [0.47, 0.67]],
    [[0.75, 0.29], [0.82, 0.42]], // Cygnus wing
    [[0.75, 0.29], [0.64, 0.38]],
    [[0.19, 0.58], [0.12, 0.48]], // Taurus V
    [[0.19, 0.58], [0.27, 0.66]],
    [[0.67, 0.81], [0.76, 0.87]], // Scorpius tail
    [[0.67, 0.81], [0.58, 0.74]],
  ];
  ctx.strokeStyle = 'rgba(136, 198, 255, 0.24)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 5]);
  for (const [[u1, v1], [u2, v2]] of decorativeLines) {
    ctx.beginPath();
    ctx.moveTo(u1 * size, v1 * size);
    ctx.lineTo(u2 * size, v2 * size);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Render all 8 interactive named stars with crisp brass target bezels & legible serif labels
  for (const star of Object.values(CONSTELLATION_STAR_COORDS)) {
    const sx = star.u * size;
    const sy = star.v * size;

    // Luminous brass mounting socket ring (where 3D crystal pin seats)
    ctx.beginPath();
    ctx.arc(sx, sy, 28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(235, 198, 108, 0.78)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(sx, sy, 36, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(116, 198, 255, 0.36)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Radiant star core
    drawStarGlint(
      ctx,
      sx,
      sy,
      8.5 * star.mag,
      '#fff8e0',
      'rgba(140, 212, 255, 0.65)'
    );

    // Crisp gilded nameplate pill offset below star so 3D pin never covers the text
    const ly = sy + 56;
    ctx.font = `700 24px ${SERIF_DISPLAY}`;
    const textW = ctx.measureText(star.label.toUpperCase()).width;
    ctx.fillStyle = 'rgba(6, 14, 32, 0.84)';
    ctx.fillRect(sx - textW / 2 - 12, ly - 17, textW + 24, 34);
    ctx.strokeStyle = 'rgba(226, 190, 104, 0.68)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx - textW / 2 - 12, ly - 17, textW + 24, 34);

    ctx.fillStyle = '#ffeeb8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(star.label.toUpperCase(), sx, ly + 1);
  }

  // Ornamental compass rose in bottom-left corner
  const crx = 120;
  const cry = size - 110;
  ctx.strokeStyle = 'rgba(226, 190, 104, 0.65)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(crx, cry, 42, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const len = i % 2 === 0 ? 38 : 22;
    ctx.beginPath();
    ctx.moveTo(crx, cry);
    ctx.lineTo(crx + Math.cos(a) * len, cry + Math.sin(a) * len);
    ctx.stroke();
  }

  return configureTexture(canvas, true, false);
}

// ============================================================================
// 12. ZODIAC RING (1024px) — High-Contrast Etched Brass Bezel for Central Orrery
// ============================================================================

function createZodiacRingTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;

  // Base deep antique bronze-brass background
  const bg = ctx.createRadialGradient(cx, cy, 180, cx, cy, 512);
  bg.addColorStop(0, '#3a2a12');
  bg.addColorStop(0.54, '#241a0d');
  bg.addColorStop(0.84, '#18141c');
  bg.addColorStop(1, '#3d2c14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Brushed circular lathe sheen rings
  for (let r = 240; r < 508; r += 2) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle =
      r % 6 === 0 ? 'rgba(245, 210, 120, 0.06)' : 'rgba(15, 10, 4, 0.08)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Deep midnight-enamel recessed zodiac channel between r=310 and r=454
  ctx.beginPath();
  ctx.arc(cx, cy, 456, 0, Math.PI * 2);
  ctx.arc(cx, cy, 306, 0, Math.PI * 2, true);
  ctx.fillStyle = '#0d1424';
  ctx.fill();

  // Polished golden brass rim bands
  const rimBands: Array<[number, number, string]> = [
    [500, 14, '#d9b25a'],
    [460, 7, '#e7c673'],
    [304, 8, '#e2be68'],
    [258, 12, '#c89e48'],
  ];
  for (const [r, lw, col] of rimBands) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // Fine 1-degree, 5-degree, and 30-degree graduation ticks around outer bezel
  for (let deg = 0; deg < 360; deg++) {
    const a = (deg * Math.PI) / 180 - Math.PI / 2;
    const isHouse = deg % 30 === 0;
    const isTen = deg % 10 === 0;
    const isFive = deg % 5 === 0;

    const rOuter = 493;
    const rInner = isHouse ? 462 : isTen ? 469 : isFive ? 475 : 482;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
    ctx.lineTo(cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter);
    ctx.strokeStyle = isHouse ? '#fff0ba' : isTen ? '#e8c672' : 'rgba(218, 180, 92, 0.72)';
    ctx.lineWidth = isHouse ? 3.2 : isTen ? 2.0 : 1.0;
    ctx.stroke();
  }

  // 12 Zodiac Houses (ARIES at 0° / 12 o'clock progressing clockwise through PISCES)
  // Custom gold-stroke 2D Canvas vector glyphs — authentic 1898 engraved brass, zero OS emojis!
  for (let i = 0; i < 12; i++) {
    const borderAngle = (i - 0.5) * (Math.PI / 6) - Math.PI / 2;
    const centerAngle = i * (Math.PI / 6) - Math.PI / 2;

    // House divider bar
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(borderAngle) * 304, cy + Math.sin(borderAngle) * 304);
    ctx.lineTo(cx + Math.cos(borderAngle) * 460, cy + Math.sin(borderAngle) * 460);
    ctx.strokeStyle = '#d9b25a';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // Pointer index tick at exact house center (0°, 30°, 60°...)
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(centerAngle) * 265, cy + Math.sin(centerAngle) * 265);
    ctx.lineTo(cx + Math.cos(centerAngle) * 304, cy + Math.sin(centerAngle) * 304);
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3.6;
    ctx.stroke();

    // Radial Zodiac engraved vector glyph, name, and degree numeral
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(centerAngle + Math.PI / 2);

    // Subtle recessed bronze engraving shadow + gleaming gold stroke + bright specular core
    drawZodiacGlyph(ctx, i, 1.5, -408.5, 42, 'rgba(20, 13, 4, 0.85)', 5.8);
    drawZodiacGlyph(ctx, i, 0, -410, 42, '#f4d58d', 3.8);
    drawZodiacGlyph(ctx, i, -0.6, -410.6, 42, '#fff5cc', 1.4);

    // Crisp all-caps Zodiac name
    ctx.fillStyle = '#efd080';
    ctx.font = `700 22px ${SERIF_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZODIAC_NAMES[i].toUpperCase(), 0, -354);

    // Degree numeral
    ctx.fillStyle = '#c29f54';
    ctx.font = `600 16px ${SERIF_DISPLAY}`;
    ctx.fillText(`${i * 30}°`, 0, -323);

    ctx.restore();
  }

  return configureTexture(canvas, true, false);
}

// ============================================================================
// 13. ASTROLABE DIAL (1024px) — Engraved Brass Lock Ring + 12 O'Clock Gold Bar
// ============================================================================

function createAstrolabeDialTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;

  // Deep patinated engraved bronze-brass disc
  const discBg = ctx.createRadialGradient(cx, cy, 40, cx, cy, 512);
  discBg.addColorStop(0, '#5a421c');
  discBg.addColorStop(0.45, '#3b2b13');
  discBg.addColorStop(0.82, '#2a1f10');
  discBg.addColorStop(1, '#1c140a');
  ctx.fillStyle = discBg;
  ctx.fillRect(0, 0, size, size);

  // Subtle lathe-turned circular brushed sheen
  for (let r = 40; r < 508; r += 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle =
      r % 9 === 0 ? 'rgba(240, 205, 118, 0.08)' : 'rgba(12, 8, 3, 0.1)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Concentric engraved brass astrolabe rings
  const ringRadii = [500, 468, 412, 344, 276, 206, 138];
  ringRadii.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = idx % 2 === 0 ? '#dfba63' : '#9c7832';
    ctx.lineWidth = idx === 0 ? 7 : idx % 2 === 0 ? 3.5 : 2.0;
    ctx.stroke();
  });

  // Stereographic astrolabe almucantar & azimuth rete arcs (authentic medieval/Victorian look)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 410, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(220, 182, 92, 0.34)';
  ctx.lineWidth = 1.8;
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath();
    ctx.arc(cx, cy + k * 65, 290 - Math.abs(k) * 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + k * 75, cy, 295 - Math.abs(k) * 26, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Fine 1-degree, 5-degree, 15-degree & bold 45-degree notch markings
  for (let deg = 0; deg < 360; deg += 2) {
    const a = (deg * Math.PI) / 180 - Math.PI / 2;
    const isEighth = deg % 45 === 0;
    const isFifteen = deg % 15 === 0;
    const rOut = 496;
    const rIn = isEighth ? 446 : isFifteen ? 464 : 478;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
    ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
    ctx.strokeStyle = isEighth ? '#fff0ba' : isFifteen ? '#e2be68' : 'rgba(212, 174, 86, 0.6)';
    ctx.lineWidth = isEighth ? 4 : isFifteen ? 2.2 : 1.1;
    ctx.stroke();
  }

  // 8 cardinal & ordinal engraved Latin inscriptions & stars (at 45° intervals)
  const latinLabels = [
    'MERIDIANUS',
    'AQUILO',
    'ORIENS',
    'EURUS',
    'MERIDIES',
    'AFRICUS',
    'OCCIDENS',
    'CORUS',
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + Math.PI / 2);

    ctx.fillStyle = i === 0 ? '#fff4ca' : '#d8b45e';
    ctx.font = `700 20px ${SERIF_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(latinLabels[i], 0, -438);

    // Ornate etched 4-point vector star on intermediate ring
    if (i !== 0) {
      drawFourPointStar(ctx, 0, -378, 13, '#d6b05a');
    }

    // Inner Roman numeral degree marks
    const romans = ['XII', 'I', 'III', 'IV', 'VI', 'VII', 'IX', 'XI'];
    ctx.fillStyle = '#caa24d';
    ctx.font = `700 18px ${SERIF_DISPLAY}`;
    ctx.fillText(romans[i], 0, -242);

    ctx.restore();
  }

  // PROMINENT BRIGHT INLAID GOLD MERIDIAN POINTER BAR AT 12 O'CLOCK (0°)
  // Unmistakable across all 3 concentric rings of the Exit Door seal!
  ctx.save();
  // Dark recessed border channel behind gold bar for crisp pop
  ctx.fillStyle = '#120b04';
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy - 115);
  ctx.lineTo(cx - 28, cy - 454);
  ctx.lineTo(cx, cy - 504);
  ctx.lineTo(cx + 28, cy - 454);
  ctx.lineTo(cx + 22, cy - 115);
  ctx.closePath();
  ctx.fill();

  // Radiant burnished gold-ivory meridian pointer bar
  const barGrad = ctx.createLinearGradient(cx - 20, cy - 300, cx + 20, cy - 300);
  barGrad.addColorStop(0, '#c89632');
  barGrad.addColorStop(0.35, '#fff4be');
  barGrad.addColorStop(0.5, '#ffffff');
  barGrad.addColorStop(0.65, '#ffe896');
  barGrad.addColorStop(1, '#b88524');
  ctx.fillStyle = barGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy - 122);
  ctx.lineTo(cx - 19, cy - 450);
  ctx.lineTo(cx, cy - 496);
  ctx.lineTo(cx + 19, cy - 450);
  ctx.lineTo(cx + 14, cy - 122);
  ctx.closePath();
  ctx.fill();

  // Glowing crimson-ruby alignment jewel inlay near the 12 o'clock finial
  ctx.beginPath();
  ctx.moveTo(cx, cy - 472);
  ctx.lineTo(cx + 11, cy - 448);
  ctx.lineTo(cx, cy - 424);
  ctx.lineTo(cx - 11, cy - 448);
  ctx.closePath();
  ctx.fillStyle = '#d92836';
  ctx.fill();
  ctx.strokeStyle = '#fff5cc';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Central bright meridian sightline stripe
  ctx.strokeStyle = '#fffbe6';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 134);
  ctx.lineTo(cx, cy - 420);
  ctx.stroke();
  ctx.restore();

  return configureTexture(canvas, true, false);
}

// ============================================================================
// 14. LOGBOOK SPREAD (1024px) — Open Aged Parchment Two-Page Observatory Journal
// ============================================================================

function createLogbookSpreadTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);

  // Dark oxblood leather binding edges visible around the open book
  ctx.fillStyle = '#2d120e';
  ctx.fillRect(0, 0, size, size);

  // Warm aged Victorian parchment pages
  const pad = 26;
  const pageGrad = ctx.createLinearGradient(pad, 0, size - pad, 0);
  pageGrad.addColorStop(0, '#c8ad7c');
  pageGrad.addColorStop(0.05, '#e6d4ad');
  pageGrad.addColorStop(0.45, '#ecdcba');
  pageGrad.addColorStop(0.495, '#9d7f53');
  pageGrad.addColorStop(0.5, '#594025'); // center spine gutter shadow
  pageGrad.addColorStop(0.505, '#9d7f53');
  pageGrad.addColorStop(0.55, '#ebdab7');
  pageGrad.addColorStop(0.95, '#e2ce9f');
  pageGrad.addColorStop(1, '#c4a674');
  ctx.fillStyle = pageGrad;
  ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2);

  // Organic aged parchment foxing & tea-stain mottling
  const rng = mulberry32(1898);
  for (let i = 0; i < 240; i++) {
    const px = pad + rng() * (size - pad * 2);
    const py = pad + rng() * (size - pad * 2);
    const rad = 10 + rng() * 55;
    const g = ctx.createRadialGradient(px, py, 1, px, py, rad);
    g.addColorStop(0, `rgba(138, 98, 48, ${(0.03 + rng() * 0.06).toFixed(3)})`);
    g.addColorStop(1, 'rgba(138, 98, 48, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  // Subtle horizontal ruled ledger lines on both pages
  ctx.strokeStyle = 'rgba(115, 86, 52, 0.16)';
  ctx.lineWidth = 1;
  for (let y = 135; y < size - 65; y += 34) {
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(482, y);
    ctx.moveTo(542, y);
    ctx.lineTo(size - 56, y);
    ctx.stroke();
  }

  // Double-ink decorative page borders
  ctx.strokeStyle = 'rgba(72, 46, 26, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(46, 46, 444, size - 92);
  ctx.strokeRect(534, 46, 444, size - 92);

  // ---------------- LEFT PAGE: Observatory Entry & Telescope Coordinates ----------------
  const lx = 268;
  ctx.fillStyle = '#2d1c10';
  ctx.font = `700 24px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('OBSERVATORY LOG', lx, 90);

  ctx.fillStyle = '#5a3b22';
  ctx.font = `italic 20px ${SERIF_BODY}`;
  ctx.fillText('Dr. Alistair Vance, F.R.A.S.  ·  Nov. 1898', lx, 120);

  // Inked astronomical sketch: Equatorial Telescope & Celestial Meridian Arc
  ctx.save();
  ctx.strokeStyle = '#332013';
  ctx.lineWidth = 2;
  // Meridian circle
  ctx.beginPath();
  ctx.arc(lx, 265, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(lx, 265, 68, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(lx - 110, 265);
  ctx.lineTo(lx + 110, 265);
  ctx.moveTo(lx, 155);
  ctx.lineTo(lx, 375);
  ctx.stroke();
  // Diagonal telescope tube sketch aimed at +45°
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(lx - 58, 323);
  ctx.lineTo(lx + 64, 201);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lx + 68, 197, 8, 0, Math.PI * 2);
  ctx.stroke();
  // Arc label
  ctx.fillStyle = '#7a1f1b';
  ctx.font = `700 17px ${SERIF_DISPLAY}`;
  ctx.fillText('+45° DEC', lx + 68, 250);
  ctx.fillText('04h RA', lx - 66, 206);
  ctx.restore();

  // Left page handwritten-style notes
  const drawParagraph = (
    lines: string[],
    x: number,
    startY: number,
    lineH: number,
    font: string,
    color = '#2b1b11'
  ) => {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = 'left';
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineH));
  };

  drawParagraph(
    [
      'Entry XIV — Midnight Vigil',
      '',
      'I have sealed the Astrolabe Door.',
      'First, study my Framed Lunar',
      'Almanac on the SW wall — its',
      'four encircled phases open my',
      'desk cryptex and reveal the',
      'Sapphire Objective Lens.',
    ],
    70,
    420,
    34,
    `italic 25px ${SERIF_BODY}`
  );

  // Highlighted crimson-ink telescope coordinates box
  ctx.fillStyle = 'rgba(138, 28, 28, 0.1)';
  ctx.fillRect(68, 725, 400, 128);
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2.6;
  ctx.strokeRect(68, 725, 400, 128);

  ctx.fillStyle = '#7f1d1d';
  ctx.font = `700 19px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('GREAT EQUATORIAL SETTING', lx, 760);

  ctx.fillStyle = '#2d140c';
  ctx.font = `700 32px ${SERIF_DISPLAY}`;
  ctx.fillText('RA 04h  /  DEC +45°', lx, 808);

  ctx.fillStyle = '#5e3c22';
  ctx.font = `italic 20px ${SERIF_BODY}`;
  ctx.fillText('Behold the Triad of the North', lx, 838);

  // ---------------- RIGHT PAGE: Triad Diagram, Orrery Notes & Wax Seal ----------------
  const rx = 756;
  ctx.fillStyle = '#2d1c10';
  ctx.font = `700 23px ${SERIF_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.fillText('THE CELESTIAL CIRCUIT', rx, 90);

  // Inked Triad constellation sketch (3 stars connected in a golden-sepia triangle)
  const triPts = [
    { x: rx, y: 162, name: 'Polaris' },
    { x: rx - 102, y: 266, name: 'Vega' },
    { x: rx + 106, y: 282, name: 'Sirius' },
  ];
  ctx.strokeStyle = '#7f241f';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(triPts[0].x, triPts[0].y);
  ctx.lineTo(triPts[1].x, triPts[1].y);
  ctx.lineTo(triPts[2].x, triPts[2].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  for (const p of triPts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#2b1b11';
    ctx.fill();
    ctx.strokeStyle = '#8b5e24';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#2b1b11';
    ctx.font = `700 18px ${SERIF_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - 16);
  }

  // Right page readable clues
  drawParagraph(
    [
      'With the Sapphire Lens seated,',
      'sight through the eyepiece to',
      'reveal the Northern Triad.',
      '',
      'Illuminate those three stars on',
      'the West Star Chart Table to',
      'unlatch the Curio Cabinet and',
      'claim Saturn’s Brass Gear.',
      '',
      'Mount the gear in the Orrery,',
      'then set the Great Conjunction',
      'from the SE Framed Star Chart.',
    ],
    556,
    350,
    34,
    `italic 24px ${SERIF_BODY}`
  );

  // Small inked Orrery planetary gear doodle + signature + red wax stamp
  ctx.strokeStyle = '#472f1c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(624, 838, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(624, 838, 16, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(624 + Math.cos(a) * 36, 838 + Math.sin(a) * 36);
    ctx.lineTo(624 + Math.cos(a) * 44, 838 + Math.sin(a) * 44);
    ctx.stroke();
  }

  // Signature
  ctx.fillStyle = '#2d1c10';
  ctx.font = `italic 30px ${SERIF_BODY}`;
  ctx.textAlign = 'left';
  ctx.fillText('— A. Vance', 710, 845);

  // Crimson wax seal stamp in bottom right corner
  ctx.beginPath();
  ctx.arc(902, 855, 34, 0, Math.PI * 2);
  ctx.fillStyle = '#7e1a1e';
  ctx.fill();
  ctx.strokeStyle = '#530e12';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(902, 855, 24, 0, Math.PI * 2);
  ctx.strokeStyle = '#b44042';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  drawFourPointStar(ctx, 902, 855, 13, '#e7b57c');

  return configureTexture(canvas, true, false);
}

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export function createProceduralTextures(): TextureBundle {
  return {
    walnut: createWalnutTextures(),
    marbleFloor: createMarbleFloorTextures(),
    brass: createBrassTextures(),
    copperDome: createCopperDomeTextures(),
    darkIron: createDarkIronTextures(),
    persianRug: createPersianRugTextures(),
    leather: createLeatherTextures(),
    stonePlinth: createStonePlinthTextures(),
    starChartWall: createStarChartWallTexture(),
    lunarAlmanac: createLunarAlmanacTexture(),
    constellationMap: createConstellationMapTexture(),
    zodiacRing: createZodiacRingTexture(),
    astrolabeDial: createAstrolabeDialTexture(),
    logbookSpread: createLogbookSpreadTexture(),
  };
}
