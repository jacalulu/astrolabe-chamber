import * as THREE from 'three';

const DESKTOP_MAX_DPR = 1.5;
const MOBILE_MAX_DPR = 1.25;

export function detectConstrainedDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 700;
  const lowCores =
    typeof navigator !== 'undefined' &&
    typeof navigator.hardwareConcurrency === 'number' &&
    navigator.hardwareConcurrency <= 4;
  return coarsePointer || smallViewport || lowCores;
}

export interface SceneManagerOptions {
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly container: HTMLElement;
  public readonly isConstrainedDevice: boolean;
  public readonly maxPixelRatio: number;

  private readonly resizeCallbacks = new Set<(width: number, height: number) => void>();
  private readonly handleResizeBound: () => void;
  private readonly handleContextLostBound: (e: Event) => void;
  private readonly handleContextRestoredBound: () => void;

  constructor(container: HTMLElement, options?: SceneManagerOptions) {
    this.container = container;
    this.isConstrainedDevice = detectConstrainedDevice();
    this.maxPixelRatio = this.isConstrainedDevice ? MOBILE_MAX_DPR : DESKTOP_MAX_DPR;

    const width = Math.max(container.clientWidth || window.innerWidth, 1);
    const height = Math.max(container.clientHeight || window.innerHeight, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060913');

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.08, 130);
    this.camera.position.set(0, 1.68, 4.55);
    this.camera.lookAt(0, 1.5, -0.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isConstrainedDevice,
      powerPreference: 'default',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.outline = 'none';
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;

    container.innerHTML = '';
    container.appendChild(canvas);

    this.handleResizeBound = this.onResize.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      options?.onContextLost?.();
    };
    this.handleContextRestoredBound = () => {
      this.requestShadowUpdate();
      options?.onContextRestored?.();
    };

    window.addEventListener('resize', this.handleResizeBound);
    canvas.addEventListener('webglcontextlost', this.handleContextLostBound, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestoredBound, false);
  }

  /**
   * Scales down high-resolution shadow maps to 1024x1024 on constrained / mobile devices
   * to prevent GPU memory pressure while keeping shadows soft and legible.
   */
  public applyQualityTierToShadows(): void {
    if (!this.isConstrainedDevice) return;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Light && obj.castShadow && obj.shadow) {
        const currentW = obj.shadow.mapSize.width;
        const currentH = obj.shadow.mapSize.height;
        if (currentW > 1024 || currentH > 1024) {
          obj.shadow.mapSize.set(Math.min(currentW, 1024), Math.min(currentH, 1024));
          if (obj.shadow.map) {
            obj.shadow.map.dispose();
            obj.shadow.map = null;
          }
        }
      }
    });
    this.requestShadowUpdate();
  }

  public requestShadowUpdate(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  public setEnvironment(envMap: THREE.Texture, intensity = 0.88): void {
    this.scene.environment = envMap;
    this.scene.environmentIntensity = intensity;
  }

  public onResizeSubscribe(cb: (width: number, height: number) => void): () => void {
    this.resizeCallbacks.add(cb);
    return () => {
      this.resizeCallbacks.delete(cb);
    };
  }

  public getSize(): { width: number; height: number } {
    const width = Math.max(this.container.clientWidth || window.innerWidth, 1);
    const height = Math.max(this.container.clientHeight || window.innerHeight, 1);
    return { width, height };
  }

  private onResize(): void {
    const { width, height } = this.getSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(width, height);
    this.requestShadowUpdate();
    for (const cb of this.resizeCallbacks) {
      cb(width, height);
    }
  }

  public dispose(): void {
    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.handleResizeBound);
    canvas.removeEventListener('webglcontextlost', this.handleContextLostBound);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestoredBound);
    this.renderer.dispose();
  }
}
