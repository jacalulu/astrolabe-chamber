import * as THREE from 'three';

export interface AtmosphereResult {
  group: THREE.Group;
  update: (elapsed: number, delta: number) => void;
}

interface FlickerLight {
  light: THREE.PointLight;
  baseIntensity: number;
  phase: number;
  amplitude: number;
}

const NIGHT_SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const NIGHT_SKY_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldDir;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p, p.yxz + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yxz + 19.19);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.52;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.04 + vec3(13.1, 7.7, 19.3);
      a *= 0.5;
    }
    return v;
  }

  // Crisp multi-cell spherical starfield layer
  vec3 starLayer(vec3 dir, float scale, float density, float time) {
    vec3 p = dir * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;

    vec3 rnd = hash33(id);
    if (rnd.x < density) return vec3(0.0);

    vec3 offset = (rnd - 0.5) * 0.68;
    float d = length(f - offset);
    float core = smoothstep(0.095, 0.010, d);
    float glow = exp(-d * 20.0) * 0.30;

    // Authentic blackbody spectral star colors (blue-white, white, pale gold, soft amber)
    vec3 starCol = mix(
      vec3(0.72, 0.87, 1.0),
      vec3(1.0, 0.88, 0.66),
      rnd.y
    );
    float twinkle = 0.76 + 0.24 * sin(time * (1.7 + rnd.z * 3.2) + rnd.x * 62.83);
    float brightness = pow(rnd.z, 2.1) * 1.6 + 0.35;
    return starCol * (core + glow) * twinkle * brightness;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float elev = clamp(dir.y, -0.2, 1.0);

    // 1. Deep midnight zenith-to-horizon indigo gradient
    vec3 zenithCol = vec3(0.014, 0.026, 0.072);
    vec3 midSkyCol = vec3(0.040, 0.076, 0.172);
    vec3 horizonCol = vec3(0.105, 0.168, 0.295);

    vec3 sky = mix(horizonCol, midSkyCol, smoothstep(-0.04, 0.28, elev));
    sky = mix(sky, zenithCol, smoothstep(0.24, 0.88, elev));

    // 2. Rich Sweeping Milky Way Galactic Band + Dark Cosmic Dust Rift over North shutter
    vec3 mwAxis = normalize(vec3(0.68, 0.22, -0.70));
    float bandDist = abs(dot(dir, mwAxis));
    float bandMask = exp(-bandDist * bandDist * 11.5) * smoothstep(0.0, 0.20, elev);
    float coreMask = exp(-bandDist * bandDist * 38.0) * smoothstep(0.05, 0.28, elev);

    float mwCloud = fbm(dir * 5.0 + vec3(1.2, 0.4, 2.7));
    float dustFilament = fbm(dir * 13.0 - vec3(2.3, 1.1, 0.8));
    // Dark central dust rift slicing organically through the Milky Way core
    float riftCut = coreMask * smoothstep(0.42, 0.68, dustFilament);

    vec3 mwTeal = vec3(0.09, 0.20, 0.34);
    vec3 mwViolet = vec3(0.18, 0.13, 0.32);
    vec3 mwAmber = vec3(0.28, 0.24, 0.30);
    vec3 mwCol = mix(mwTeal, mwViolet, mwCloud);
    mwCol = mix(mwCol, mwAmber, smoothstep(0.54, 0.84, mwCloud) * (0.4 + 0.6 * coreMask));

    sky += mwCol * bandMask * (0.55 + 1.05 * mwCloud) * (1.0 - 0.72 * riftCut);

    // 3. Multi-scale procedural stars (dense Milky Way stardust + crisp navigational stars)
    float skyVisible = smoothstep(0.02, 0.16, elev);
    vec3 stars = vec3(0.0);
    stars += starLayer(dir, 58.0, 0.80, uTime) * 1.25;
    stars += starLayer(dir, 120.0, 0.74, uTime * 1.15) * 0.84;
    stars += starLayer(dir, 225.0, 0.76, uTime * 0.85) * (0.42 + bandMask * 1.25) * (1.0 - 0.5 * riftCut);
    sky += stars * skyVisible;

    // 4. Luminous Crescent Moon with silky blended earthshine (ZERO hard gray disc cutout!)
    vec3 moonDir = normalize(vec3(-0.07, 0.68, -0.73));
    float moonCos = dot(dir, moonDir);
    float moonAngle = acos(clamp(moonCos, -1.0, 1.0));

    // Multi-layered soft silver-indigo atmospheric lunar corona & wide moonbeam halo
    float wideHalo = exp(-moonAngle * 4.8) * 0.22;
    float midCorona = exp(-moonAngle * 12.5) * 0.36;
    float tightGlow = exp(-moonAngle * 28.0) * 0.45;
    sky += vec3(0.56, 0.76, 1.0) * (wideHalo + midCorona) + vec3(0.84, 0.90, 1.0) * tightGlow;

    float moonRad = 0.043;
    if (moonAngle < moonRad * 1.35) {
      vec3 upRef = vec3(0.0, 1.0, 0.0);
      vec3 mRight = normalize(cross(upRef, moonDir));
      vec3 mUp = normalize(cross(moonDir, mRight));
      vec2 mUv = vec2(dot(dir - moonDir, mRight), dot(dir - moonDir, mUp)) / moonRad;

      float discDist = length(mUv);
      float discMask = smoothstep(1.01, 0.91, discDist);

      // Soft curved shadow terminator carving a razor-crisp silver astronomical crescent
      float shadowDist = length(mUv - vec2(0.44, 0.17));
      float crescentMask = discMask * smoothstep(0.80, 1.02, shadowDist);

      // Let the dark lunar limb melt invisibly into the midnight sky (only a whisper of earthshine, zero gray circle!)
      float softDisc = smoothstep(1.02, 0.72, discDist);
      sky *= mix(1.0, 0.88, softDisc * (1.0 - crescentMask));
      sky += vec3(0.012, 0.018, 0.032) * softDisc * (1.0 - crescentMask);

      // Lit lunar crescent with subtle maria mottling and crisp limb glow
      float maria = 0.84 + 0.16 * noise3(vec3(mUv * 4.8, 1.2));
      float limbHighlight = 0.90 + 0.22 * smoothstep(0.5, 0.95, discDist);
      vec3 litMoon = vec3(1.56, 1.52, 1.42) * maria * limbHighlight;
      sky = mix(sky, litMoon, crescentMask);
    }

    // 5. Distant Moonlit Alpine Mountain Silhouettes around horizon (visible through South balcony!)
    float az = atan(dir.x, dir.z);
    float ridgeFar = 0.055
      + 0.042 * sin(az * 3.0 + 0.6)
      + 0.028 * sin(az * 7.0 - 1.2)
      + 0.016 * sin(az * 15.0 + 2.4)
      + 0.008 * sin(az * 29.0);
    float ridgeNear = 0.025
      + 0.032 * sin(az * 4.0 - 2.1)
      + 0.022 * sin(az * 9.0 + 0.4)
      + 0.012 * sin(az * 19.0 - 0.8);

    float farMask = smoothstep(ridgeFar + 0.008, ridgeFar - 0.004, dir.y);
    float nearMask = smoothstep(ridgeNear + 0.006, ridgeNear - 0.003, dir.y);

    vec3 farMtnCol = vec3(0.055, 0.088, 0.165);
    vec3 nearMtnCol = vec3(0.026, 0.042, 0.085);
    sky = mix(sky, farMtnCol, farMask * 0.92);
    sky = mix(sky, nearMtnCol, nearMask);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

const VOLUMETRIC_SHAFT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const VOLUMETRIC_SHAFT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    // Ultra-silky Fresnel view-angle fade so beam boundaries dissolve invisibly
    float ndotv = abs(dot(normalize(vNormalWorld), normalize(vViewDir)));
    float edgeFade = pow(clamp(ndotv, 0.0, 1.0), 1.65);

    // Smooth top-and-bottom axial fade
    float topFade = smoothstep(1.0, 0.74, vUv.y);
    float bottomFade = smoothstep(0.0, 0.36, vUv.y);

    // Multi-harmonic silky diagonal atmospheric light streaks
    float s1 = 0.72 + 0.28 * sin(vUv.x * 18.84 + vUv.y * 2.1 - uTime * 0.28);
    float s2 = 0.78 + 0.22 * sin(vUv.x * 37.69 - vUv.y * 2.8 + uTime * 0.19);
    float s3 = 0.86 + 0.14 * sin(vUv.x * 6.283 + uTime * 0.14);
    float breathe = 0.92 + 0.08 * sin(uTime * 0.48 + vUv.y * 1.8);

    float alpha = edgeFade * topFade * bottomFade * s1 * s2 * s3 * breathe * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    // Gentle organic curl-like thermal currents
    float t = uTime * 0.20 + aPhase;
    pos.x += sin(t * 1.12 + pos.y * 0.7) * 0.18;
    pos.y += sin(t * 0.68 + pos.z * 0.5) * 0.14 + mod(uTime * 0.032 + aPhase, 5.5) * 0.03;
    pos.z += cos(t * 0.92 + pos.x * 0.6) * 0.18;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float dist = max(0.001, -mvPos.z);

    // Smoothly fade motes completely out within 1.8m of camera (ZERO close-up snowballs!)
    float nearFade = smoothstep(1.45, 2.55, dist);
    float farFade = smoothstep(16.5, 4.5, dist);
    float twinkle = 0.50 + 0.50 * sin(uTime * 1.75 + aPhase * 6.283);

    vAlpha = twinkle * nearFade * farFade;
    vColor = aColor;

    // Strictly capped fine atmospheric mote size (max 8.5px even at medium range)
    gl_PointSize = clamp(aSize * (56.0 / dist), 1.5, 8.5);
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float r = length(centered);
    if (r > 0.5) discard;
    float soft = pow(clamp(1.0 - r * 2.0, 0.0, 1.0), 2.6);
    gl_FragColor = vec4(vColor, soft * vAlpha * 0.38);
  }
`;

export function buildAtmosphere(scene: THREE.Scene): AtmosphereResult {
  const group = new THREE.Group();
  group.name = 'ObservatoryAtmosphere';

  // Subtle atmospheric perspective fog tuned for the grand 6.8m chamber
  scene.fog = new THREE.FogExp2('#080d1a', 0.0108);

  // =========================================================================
  // 1. EXTERIOR MIDNIGHT SKY DOME (r = 52m)
  // =========================================================================
  const skyUniforms = {
    uTime: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: NIGHT_SKY_VERTEX,
    fragmentShader: NIGHT_SKY_FRAGMENT,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(52, 48, 32), skyMat);
  skyDome.name = 'MidnightSkyDome';
  skyDome.userData.noRaycast = true;
  group.add(skyDome);

  // =========================================================================
  // 2. CINEMATIC WARM-VS-COOL LIGHTING RIG (GRAND 6.8m OBSERVATORY)
  // =========================================================================
  // Lifted sky-vs-mahogany bounce so dark iron, walnut & copper dome plates read sculpturally
  const hemiLight = new THREE.HemisphereLight('#557ac2', '#4c321f', 0.84);
  group.add(hemiLight);

  // Primary Cool Silver-Blue Moonlight Key streaming through the open North dome shutter
  const moonKey = new THREE.DirectionalLight('#accfff', 2.1);
  moonKey.position.set(0.35, 13.8, -8.8);
  moonKey.target.position.set(0, 0.5, 0.5);
  moonKey.castShadow = true;
  moonKey.shadow.mapSize.set(2048, 2048);
  moonKey.shadow.camera.left = -8.4;
  moonKey.shadow.camera.right = 8.4;
  moonKey.shadow.camera.top = 8.4;
  moonKey.shadow.camera.bottom = -8.4;
  moonKey.shadow.camera.near = 2.5;
  moonKey.shadow.camera.far = 28.0;
  moonKey.shadow.bias = -0.00045;
  moonKey.shadow.normalBias = 0.025;
  moonKey.shadow.radius = 2.6;
  group.add(moonKey);
  group.add(moonKey.target);

  // Strategic Warm Amber Gaslamp & Sculptural Fill PointLights
  const flickerLights: FlickerLight[] = [];

  const addWarmLight = (
    pos: [number, number, number],
    color: string,
    intensity: number,
    distance: number,
    decay: number,
    castShadow: boolean,
    phase: number,
    amplitude = 0.055
  ) => {
    const pt = new THREE.PointLight(color, intensity, distance, decay);
    pt.position.set(pos[0], pos[1], pos[2]);
    if (castShadow) {
      pt.castShadow = true;
      pt.shadow.mapSize.set(1024, 1024);
      pt.shadow.bias = -0.0008;
      pt.shadow.normalBias = 0.02;
    }
    group.add(pt);
    flickerLights.push({ light: pt, baseIntensity: intensity, phase, amplitude });
  };

  // 1) Central Orrery warm molten-gold core spill (casts delicate clockwork floor shadows)
  addWarmLight([0, 1.74, 0], '#ffb45c', 2.65, 12.2, 1.55, true, 0.0, 0.05);
  // 2) East Writing Desk & NE Bookcase warm gaslamp pool
  addWarmLight([4.9, 2.65, -1.0], '#ffa246', 2.85, 11.8, 1.55, false, 1.7, 0.06);
  // 3) West Star Chart Lectern, Curio Cabinet & NW Bookcase warm gaslamp pool
  addWarmLight([-4.9, 2.65, -0.65], '#ffa24a', 2.75, 11.8, 1.55, false, 3.1, 0.06);
  // 4) South Exit Archway & Carved Oak Door Warm Architectural Fill (z = 5.05 facing South door at z = 6.78)
  addWarmLight([0.0, 2.55, 5.05], '#ffad5c', 3.25, 11.8, 1.48, false, 4.6, 0.05);
  // 5) Upper Copper Dome & Mezzanine Gallery Warm Uplight (brings out hammered copper plates, brass teeth & iron ribs!)
  addWarmLight([0.0, 6.05, 1.65], '#ffb566', 3.95, 16.8, 1.22, false, 2.3, 0.035);

  // Soft Cool Silver Moonlight Rim Fills flanking the North Telescope Pier at (0, 0, -4.65)
  const telescopeRimL = new THREE.PointLight('#92c0ff', 2.45, 9.6, 1.42);
  telescopeRimL.position.set(-1.75, 2.15, -3.95);
  group.add(telescopeRimL);

  const telescopeRimR = new THREE.PointLight('#a6c9ff', 1.95, 9.2, 1.48);
  telescopeRimR.position.set(1.75, 1.95, -4.25);
  group.add(telescopeRimR);

  // Subtle North-Upper Cool Dome Skylight Rim (catches the North shutter iron girders & copper edges)
  const domeMoonFill = new THREE.PointLight('#9ec4ff', 2.65, 15.5, 1.28);
  domeMoonFill.position.set(0.0, 6.2, -2.6);
  group.add(domeMoonFill);

  // Cool silver moonlight wash over the South exterior moonlit balcony balustrade (z = 6.85..11.2)
  const balconyMoon = new THREE.PointLight('#9cc6ff', 2.85, 14.5, 1.32);
  balconyMoon.position.set(0, 4.0, 9.2);
  group.add(balconyMoon);

  // =========================================================================
  // 3. SILKY LAYERED VOLUMETRIC MOONLIGHT GOD-RAYS THROUGH NORTH DOME SHUTTER
  // =========================================================================
  const shaftUniformsList: Array<{ uTime: { value: number } }> = [];

  const createLightShaft = (
    topRadius: number,
    bottomRadius: number,
    length: number,
    pos: [number, number, number],
    targetPos: [number, number, number],
    colorHex: string,
    opacity: number
  ) => {
    const uniforms = {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(colorHex) },
    };
    shaftUniformsList.push(uniforms);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VOLUMETRIC_SHAFT_VERTEX,
      fragmentShader: VOLUMETRIC_SHAFT_FRAGMENT,
      uniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 32, 1, true);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.noRaycast = true;

    const start = new THREE.Vector3(...pos);
    const end = new THREE.Vector3(...targetPos);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start).normalize();

    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    group.add(mesh);
  };

  // Primary sweeping volumetric moonlight cone grazing Telescope (-4.65) & illuminating Central Orrery (0, 0)
  createLightShaft(1.05, 2.75, 10.8, [0.05, 9.25, -4.55], [0.0, 0.3, 0.65], '#8fc4ff', 0.155);
  // Crisp silky inner moonlight core highlighting the Great Equatorial Telescope
  createLightShaft(0.58, 1.65, 10.0, [-0.12, 9.05, -4.85], [-0.06, 0.4, -2.05], '#c2e0ff', 0.115);
  // Soft atmospheric silver-blue outer scatter veil
  createLightShaft(1.36, 3.45, 11.0, [0.16, 9.3, -4.15], [0.06, 0.2, 1.25], '#74a8f0', 0.075);

  // =========================================================================
  // 4. FINE DRIFTING GOLDEN & MOONLIT DUST MOTES (440 particles, max 8.5px)
  // =========================================================================
  const particleCount = 440;
  const positions = new Float32Array(particleCount * 3);
  const phases = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const colors = new Float32Array(particleCount * 3);

  const warmMote = new THREE.Color('#ffbe66');
  const coolMote = new THREE.Color('#9ecbff');
  const tmpCol = new THREE.Color();

  let seed = 918273;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < particleCount; i++) {
    let x: number;
    let y: number;
    let z: number;
    let coolFactor: number;

    if (i < 210) {
      // Cool silver-blue dust motes catching the North moonlight god-ray shaft
      const t = nextRand();
      const spread = 0.75 + t * 1.85;
      const a = nextRand() * Math.PI * 2;
      const r = Math.sqrt(nextRand()) * spread;
      x = Math.cos(a) * r;
      y = 8.6 - t * 7.8;
      z = -4.4 + t * 4.8 + Math.sin(a) * r * 0.7;
      coolFactor = 0.70 + nextRand() * 0.30;
    } else {
      // Warm amber-gold dust motes drifting softly near gaslamp sconces & Orrery across 6.8m rotunda
      const a = nextRand() * Math.PI * 2;
      const r = 1.2 + Math.sqrt(nextRand()) * 4.75;
      x = Math.cos(a) * r;
      y = 0.65 + nextRand() * 6.4;
      z = Math.sin(a) * r;
      coolFactor = z < -1.5 && y > 3.8 ? 0.55 : 0.08 * nextRand();
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    phases[i] = nextRand() * Math.PI * 2;
    sizes[i] = 0.26 + nextRand() * 0.34;

    tmpCol.copy(warmMote).lerp(coolMote, coolFactor);
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  dustGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const dustUniforms = {
    uTime: { value: 0 },
  };
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: dustUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.name = 'GoldenDustMotes';
  dustPoints.userData.noRaycast = true;
  group.add(dustPoints);

  // =========================================================================
  // 5. ANIMATION UPDATE (Sky Stars, Volumetric Undulation, Dust, Gaslamp Flicker)
  // =========================================================================
  const update = (elapsed: number, _delta: number): void => {
    skyUniforms.uTime.value = elapsed;
    dustUniforms.uTime.value = elapsed;
    for (const u of shaftUniformsList) {
      u.uTime.value = elapsed;
    }

    for (const fl of flickerLights) {
      const n =
        Math.sin(elapsed * 3.7 + fl.phase) * 0.5 +
        Math.sin(elapsed * 8.3 + fl.phase * 1.9) * 0.32 +
        Math.sin(elapsed * 14.9 + fl.phase * 3.1) * 0.18;
      fl.light.intensity = fl.baseIntensity * (1.0 + n * fl.amplitude);
    }
  };

  return {
    group,
    update,
  };
}
