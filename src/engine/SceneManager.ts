import * as THREE from 'three';

const MAX_PIXEL_RATIO = 1.5;

export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly container: HTMLElement;

  private readonly resizeCallbacks = new Set<(width: number, height: number) => void>();
  private readonly handleResizeBound: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = Math.max(container.clientWidth || window.innerWidth, 1);
    const height = Math.max(container.clientHeight || window.innerHeight, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#060913');

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.08, 130);
    this.camera.position.set(0, 1.68, 4.55);
    this.camera.lookAt(0, 1.5, -0.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'default',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
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
    canvas.tabIndex = 0;

    container.innerHTML = '';
    container.appendChild(canvas);

    this.handleResizeBound = this.onResize.bind(this);
    window.addEventListener('resize', this.handleResizeBound);
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height);
    this.requestShadowUpdate();
    for (const cb of this.resizeCallbacks) {
      cb(width, height);
    }
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResizeBound);
    this.renderer.dispose();
  }
}
