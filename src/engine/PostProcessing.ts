import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SceneManager } from './SceneManager';

const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignetteStrength: { value: 0.30 },
    uVignetteSoftness: { value: 0.68 },
    uGrainAmount: { value: 0.010 },
    uWarmth: { value: 0.032 },
    uContrast: { value: 1.03 },
    uShadowLift: { value: 0.016 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignetteStrength;
    uniform float uVignetteSoftness;
    uniform float uGrainAmount;
    uniform float uWarmth;
    uniform float uContrast;
    uniform float uShadowLift;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Smooth deep-shadow toe lift so dark walnut, cast iron & copper stay sculptural instead of pure #000
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float shadowToe = exp(-max(luma, 0.0) * 6.5);
      col += shadowToe * vec3(uShadowLift * 0.92, uShadowLift * 0.96, uShadowLift * 1.15);

      // Subtle split-tone filmic color grading (cool indigo shadows, warm antique-gold highlights)
      float shadowMask = clamp(1.0 - smoothstep(0.0, 0.40, luma), 0.0, 1.0);
      float highMask = smoothstep(0.38, 1.12, luma);

      col += shadowMask * vec3(-0.002, 0.002, 0.010);
      col += highMask * vec3(uWarmth, uWarmth * 0.48, -uWarmth * 0.24);

      // Gentle midtone contrast polish
      col = max(vec3(0.0), (col - 0.5) * uContrast + 0.5);

      // Soft cinematic optical vignette
      vec2 centered = vUv - 0.5;
      float dist = length(centered * vec2(1.18, 1.0));
      float vignette = smoothstep(0.48, 0.48 + uVignetteSoftness, dist);
      col *= mix(1.0, 1.0 - uVignetteStrength, vignette);

      // Ultra-fine animated photographic film grain (eliminates dark-sky banding)
      float noise = hash12(gl_FragCoord.xy + fract(uTime * 17.37) * 512.0) - 0.5;
      col += noise * uGrainAmount;

      gl_FragColor = vec4(max(col, vec3(0.0)), texel.a);
    }
  `,
};

export class PostProcessing {
  public readonly composer: EffectComposer;
  public readonly bloomPass: UnrealBloomPass;
  public readonly gradePass: ShaderPass;
  private readonly unsubscribeResize: () => void;

  constructor(private readonly sceneManager: SceneManager) {
    const { width, height } = sceneManager.getSize();
    const pixelRatio = sceneManager.renderer.getPixelRatio();

    const renderTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(width * pixelRatio)),
      Math.max(1, Math.floor(height * pixelRatio)),
      {
        type: THREE.HalfFloatType,
        samples: 2,
      }
    );

    this.composer = new EffectComposer(sceneManager.renderer, renderTarget);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);

    const renderPass = new RenderPass(sceneManager.scene, sceneManager.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.28, // tighter cinematic bloom strength to prevent white specular hotspots
      0.45, // crisp velvety halation radius
      0.88  // high luminance threshold so only gaslamps, sun core & stars bloom
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(CinematicGradeShader);
    this.composer.addPass(this.gradePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    this.unsubscribeResize = sceneManager.onResizeSubscribe((w, h) => {
      const pr = sceneManager.renderer.getPixelRatio();
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.bloomPass.resolution.set(w, h);
    });
  }

  public setBloom(strength: number, radius: number, threshold: number): void {
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.bloomPass.threshold = threshold;
  }

  public render(elapsed: number): void {
    this.gradePass.uniforms.uTime.value = elapsed;
    this.composer.render();
  }

  public dispose(): void {
    this.unsubscribeResize();
    this.composer.dispose();
  }
}
