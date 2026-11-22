import * as THREE from 'three';

/**
 * Bakes a high-dynamic-range procedural night-observatory light-probe environment map
 * using THREE.PMREMGenerator. Balanced warm-walnut/amber lower bounce + sapphire-gold
 * upper dome fill + crisp North moonlight slit + 8 gaslamp sconces so brass, copper,
 * dark cast iron, marble, and optical glass catch rich specular rim highlights without
 * crushing shadows to pure black.
 */
export function createObservatoryEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileCubemapShader();

  const envScene = new THREE.Scene();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // 1. Procedural enclosing sphere with lifted warm-walnut bounce & sapphire-gold dome fill
  const domeGeo = trackGeo(new THREE.SphereGeometry(28, 48, 32));
  const domeMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      toneMapped: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;

          // Rich midnight sapphire dome overhead + warm golden gallery uplight + lifted walnut/marble lower bounce
          vec3 zenith = vec3(0.11, 0.20, 0.44);
          vec3 upperSky = vec3(0.19, 0.32, 0.60);
          vec3 warmGallery = vec3(0.42, 0.27, 0.14);
          vec3 warmWall = vec3(0.34, 0.21, 0.12);
          vec3 walnutBounce = vec3(0.20, 0.13, 0.08);
          vec3 floorEdge = vec3(0.10, 0.15, 0.15);
          vec3 floorCenter = vec3(0.26, 0.18, 0.10);

          vec3 col;
          if (y >= 0.0) {
            float wallBand = smoothstep(0.0, 0.28, y);
            float skyFade = smoothstep(0.26, 0.88, y);
            col = mix(warmWall, upperSky, wallBand);
            col = mix(col, zenith, skyFade);

            // Warm golden gaslamp bounce band along upper mezzanine / dome skirt (gives copper ribs warm sheen!)
            float galleryBelt = exp(-pow((y - 0.34) / 0.22, 2.0));
            col += warmGallery * galleryBelt * 0.62;

            // Subtle octagonal wall rib modulation for high-contrast metallic specular depth
            float angle = atan(d.x, d.z);
            float octagonRib = pow(abs(cos(angle * 4.0)), 5.0);
            col *= mix(1.0, 0.64, octagonRib * (1.0 - smoothstep(0.18, 0.58, y)));

            // Cool silver-sapphire moonlight sky wash along the North (-Z) meridian
            float northMask = smoothstep(0.12, 0.90, -d.z) * smoothstep(0.05, 0.65, y);
            col += vec3(0.32, 0.48, 0.82) * northMask * 1.15;
          } else {
            // Lifted warm walnut & polished marble floor bounce so undersides of iron & brass stay sculptural
            float floorT = smoothstep(0.0, -0.85, y);
            col = mix(walnutBounce, floorEdge, smoothstep(0.0, -0.40, y));
            col = mix(col, floorCenter, floorT * 0.62);

            // Subtle cool moonlight pool bounce on the North floor near telescope pier
            float northFloor = smoothstep(0.1, 0.85, -d.z) * smoothstep(-0.05, -0.55, y);
            col += vec3(0.14, 0.22, 0.36) * northFloor;
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  // Helper for HDR emissive accent lights in the probe scene
  const makeHDRMaterial = (hex: number, intensity: number): THREE.MeshBasicMaterial => {
    const color = new THREE.Color(hex).multiplyScalar(intensity);
    return trackMat(
      new THREE.MeshBasicMaterial({
        color,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
  };

  // 2. Sculptural dark-bronze structural pilasters & dome ribs (dark enough for contrast, lifted off pure black)
  const darkRibMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x140f0c),
      toneMapped: false,
    })
  );
  const pilasterGeo = trackGeo(new THREE.BoxGeometry(0.62, 10.5, 0.62));
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    const pilaster = new THREE.Mesh(pilasterGeo, darkRibMat);
    pilaster.position.set(Math.sin(angle) * 11.4, 1.5, Math.cos(angle) * 11.4);
    pilaster.lookAt(0, 1.5, 0);
    envScene.add(pilaster);
  }

  const domeRibGeo = trackGeo(new THREE.TorusGeometry(13.5, 0.22, 6, 36, Math.PI));
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(domeRibGeo, darkRibMat);
    rib.position.y = 4.2;
    rib.rotation.y = (i * Math.PI) / 6;
    envScene.add(rib);
  }

  // 3. North (-Z) Moonlit Observatory Dome Shutter Slit (cool silver-blue HDR key strip)
  const slitGlowMat = makeHDRMaterial(0x88baff, 2.5);
  const slitCoreMat = makeHDRMaterial(0xddefff, 5.4);
  const moonMat = makeHDRMaterial(0xf4f9ff, 9.5);

  const slitOuterGeo = trackGeo(new THREE.PlaneGeometry(4.6, 11.4));
  const slitOuter = new THREE.Mesh(slitOuterGeo, slitGlowMat);
  slitOuter.position.set(0, 10.2, -10.6);
  slitOuter.lookAt(0, 1.2, 0);
  envScene.add(slitOuter);

  const slitCoreGeo = trackGeo(new THREE.PlaneGeometry(1.8, 9.2));
  const slitCore = new THREE.Mesh(slitCoreGeo, slitCoreMat);
  slitCore.position.set(0, 10.0, -10.2);
  slitCore.lookAt(0, 1.2, 0);
  envScene.add(slitCore);

  // Soft cool silver rim-reflection strip at mid-North height for Telescope pier flutes
  const northRimStrip = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(6.5, 3.2)),
    makeHDRMaterial(0x82b4f2, 1.45)
  );
  northRimStrip.position.set(0, 2.2, -12.0);
  northRimStrip.lookAt(0, 1.4, 0);
  envScene.add(northRimStrip);

  // Radiant silver crescent moon inside the north dome slit
  const moonGroup = new THREE.Group();
  moonGroup.position.set(0.35, 11.4, -9.8);
  moonGroup.lookAt(0, 1.2, 0);
  const moonDisc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(1.1, 32)), moonMat);
  const moonShadow = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(0.92, 32)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0x0e1d3b, toneMapped: false }))
  );
  moonShadow.position.set(0.4, 0.2, 0.02);
  moonGroup.add(moonDisc, moonShadow);
  envScene.add(moonGroup);

  // Overhead skylight tinted glass glow segments + warm golden gallery uplight ring
  const skylightMat = makeHDRMaterial(0x5d8ede, 1.65);
  const skylightGeo = trackGeo(new THREE.PlaneGeometry(3.0, 4.6));
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const panel = new THREE.Mesh(skylightGeo, skylightMat);
    panel.position.set(Math.sin(angle) * 9.5, 11.5, Math.cos(angle) * 9.5);
    panel.lookAt(0, 1.0, 0);
    envScene.add(panel);
  }

  // Warm golden mezzanine ring reflection (gives copper dome & brass tubes continuous warm edge catchlights)
  const warmGalleryRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(10.8, 0.38, 8, 48)),
    makeHDRMaterial(0xffb562, 1.35)
  );
  warmGalleryRing.rotation.x = Math.PI / 2;
  warmGalleryRing.position.y = 4.3;
  envScene.add(warmGalleryRing);

  // Crisp HDR stars across upper hemisphere
  const starGeo = trackGeo(new THREE.SphereGeometry(0.11, 6, 6));
  const starWarmMat = makeHDRMaterial(0xffe6c2, 4.0);
  const starCoolMat = makeHDRMaterial(0xc8e0ff, 5.0);
  let seed = 189801;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 64; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = 0.15 + rand() * 0.95;
    const r = 18.5;
    const star = new THREE.Mesh(starGeo, i % 3 === 0 ? starWarmMat : starCoolMat);
    star.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi) + 1.5,
      r * Math.sin(phi) * Math.sin(theta)
    );
    star.scale.setScalar(0.55 + rand() * 1.1);
    envScene.add(star);
  }

  // 4. Eight Octagonal Warm Amber-Gold Gaslamp Orbs (balanced so specular highlights gleam without clipping)
  const flameCoreGeo = trackGeo(new THREE.SphereGeometry(0.28, 12, 12));
  const tulipHaloGeo = trackGeo(new THREE.SphereGeometry(0.78, 14, 14));
  const wallBounceGeo = trackGeo(new THREE.PlaneGeometry(3.2, 4.0));

  const flameCoreMat = makeHDRMaterial(0xffdf9c, 7.6);
  const tulipHaloMat = makeHDRMaterial(0xff9f45, 3.1);
  const wallBounceMat = makeHDRMaterial(0x9a5222, 1.45);

  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    const r = 8.4;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;

    const halo = new THREE.Mesh(tulipHaloGeo, tulipHaloMat);
    halo.position.set(x, 2.55, z);
    envScene.add(halo);

    const flame = new THREE.Mesh(flameCoreGeo, flameCoreMat);
    flame.position.set(x * 0.94, 2.6, z * 0.94);
    envScene.add(flame);

    const bounce = new THREE.Mesh(wallBounceGeo, wallBounceMat);
    bounce.position.set(Math.sin(angle) * 10.6, 2.4, Math.cos(angle) * 10.6);
    bounce.lookAt(0, 2.4, 0);
    envScene.add(bounce);
  }

  // 5. Thematic Station Color Accents (East emerald desk lamp, West cyan star-table, South warm door fill, Orrery glow)
  const emeraldLamp = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.62, 12, 12)),
    makeHDRMaterial(0x1f9e5e, 2.4)
  );
  emeraldLamp.position.set(7.6, 1.35, -0.7);
  envScene.add(emeraldLamp);

  const deskWarmGlow = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.4, 10, 10)),
    makeHDRMaterial(0xffbd66, 4.2)
  );
  deskWarmGlow.position.set(7.3, 1.05, -0.7);
  envScene.add(deskWarmGlow);

  const starChartGlow = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(2.2, 1.8)),
    makeHDRMaterial(0x3a8ee6, 2.1)
  );
  starChartGlow.position.set(-7.6, 1.2, 0.5);
  starChartGlow.lookAt(0, 2.2, 0);
  envScene.add(starChartGlow);

  // Warm walnut & Orrery golden bounce from floor center (illuminates undersides of brass & cast iron)
  const orreryBounce = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(5.5, 32)),
    makeHDRMaterial(0xc8843a, 1.15)
  );
  orreryBounce.rotation.x = -Math.PI / 2;
  orreryBounce.position.set(0, -3.5, 0);
  envScene.add(orreryBounce);

  // Bake into a PMREM cubemap texture
  const envRT = pmremGenerator.fromScene(envScene, 0.018);
  const envTexture = envRT.texture;

  pmremGenerator.dispose();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();

  return envTexture;
}
