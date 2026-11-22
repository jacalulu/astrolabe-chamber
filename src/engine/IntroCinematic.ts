import * as THREE from 'three';
import type { IntroAct, IntroOverlayAPI, IntroTimelineManifest } from '../types';

const DEFAULT_MANIFEST: IntroTimelineManifest = {
  act1Duration: 17.7,
  totalDuration: 39.6,
  cues: [],
};

const SPAWN_POS = new THREE.Vector3(0, 1.68, 4.55);
const SPAWN_LOOK_AT = new THREE.Vector3(0, 1.5, -0.5);

function smootherstep(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Choreographs the Act II real-time Three.js observatory camera glide
 * and the subtle Start Screen idle drift.
 */
export class IntroCameraChoreography {
  private readonly posCurve: THREE.CatmullRomCurve3;
  private readonly lookCurve: THREE.CatmullRomCurve3;
  private readonly tempPos = new THREE.Vector3();
  private readonly tempLook = new THREE.Vector3();

  constructor() {
    // 7 collision-free Catmull-Rom control points synced directly to Dr. Vance's Act II narration:
    // 1) 0%–22% (17.7s–22.5s): Dissolve out of Act I into the grand moonlit observatory chamber
    // 2) 22%–38% (22.5s–26.0s): "Begin at my writing desk, beneath the emerald lamp" -> East Writing Desk & Cryptex
    // 3) 40%–58% (26.5s–30.4s): "...through the Lunar Cryptex, the Great Telescope..." -> North Telescope & dome slit
    // 4) 60%–78% (30.8s–34.8s): "...and the Celestial Orrery. Recover the Obsidian Star Key..." -> Central Brass Orrery
    // 5) 80%–100% (35.2s–39.6s): "...and unseal the chamber before midnight" -> exact player spawn (0, 1.68, 4.55)
    this.posCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(2.45, 2.35, 2.15),
        new THREE.Vector3(2.88, 1.52, 0.25),
        new THREE.Vector3(3.12, 1.38, -0.62),
        new THREE.Vector3(1.55, 2.55, -2.15),
        new THREE.Vector3(-1.85, 2.05, -0.95),
        new THREE.Vector3(-1.45, 1.78, 2.75),
        SPAWN_POS.clone(),
      ],
      false,
      'centripetal',
      0.5
    );

    this.lookCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(1.25, 1.45, 0.35),
        new THREE.Vector3(4.65, 0.96, -0.42),
        new THREE.Vector3(4.68, 0.94, -0.45),
        new THREE.Vector3(0.0, 2.15, -4.65),
        new THREE.Vector3(0.0, 1.38, 0.0),
        new THREE.Vector3(0.0, 1.48, -0.35),
        SPAWN_LOOK_AT.clone(),
      ],
      false,
      'centripetal',
      0.5
    );
  }

  public applyAct2(act2Progress: number, camera: THREE.PerspectiveCamera): void {
    const t = THREE.MathUtils.clamp(act2Progress, 0, 1);
    // Gentle ease-in at dissolve start & silky zero-velocity ease-out into player spawn
    const eased = THREE.MathUtils.lerp(t, smootherstep(t), 0.42);
    this.posCurve.getPointAt(eased, this.tempPos);
    this.lookCurve.getPointAt(eased, this.tempLook);
    camera.position.copy(this.tempPos);
    camera.lookAt(this.tempLook);
    camera.updateMatrixWorld();
  }

  public applyStartScreenIdle(elapsed: number, camera: THREE.PerspectiveCamera): void {
    const swayX = Math.sin(elapsed * 0.14) * 0.34;
    const breathY = Math.sin(elapsed * 0.22) * 0.045;
    const driftZ = Math.cos(elapsed * 0.14) * 0.16;

    this.tempPos.set(SPAWN_POS.x + swayX, SPAWN_POS.y + breathY, SPAWN_POS.z + driftZ);
    this.tempLook.set(
      SPAWN_LOOK_AT.x + Math.sin(elapsed * 0.11) * 0.14,
      SPAWN_LOOK_AT.y + 0.06 + Math.cos(elapsed * 0.18) * 0.04,
      SPAWN_LOOK_AT.z
    );
    camera.position.copy(this.tempPos);
    camera.lookAt(this.tempLook);
    camera.updateMatrixWorld();
  }
}

export class IntroDirector {
  private readonly choreography = new IntroCameraChoreography();
  private manifest: IntroTimelineManifest = DEFAULT_MANIFEST;
  private manifestLoaded = false;
  private playing = false;
  private act: IntroAct = 'idle';
  private elapsedTime = 0;
  private lastAudioTime = 0;
  private audioAdvanced = false;
  private activeSubtitle: string | null = null;

  constructor(
    private readonly overlay: IntroOverlayAPI,
    private readonly onComplete: () => void
  ) {}

  public async loadManifest(url = './intro/subtitles.json'): Promise<IntroTimelineManifest> {
    if (this.manifestLoaded) return this.manifest;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const data = (await res.json()) as Partial<IntroTimelineManifest>;
        const act1 =
          typeof data.act1Duration === 'number' && data.act1Duration > 0
            ? data.act1Duration
            : DEFAULT_MANIFEST.act1Duration;
        const total =
          typeof data.totalDuration === 'number' && data.totalDuration > act1 + 2
            ? data.totalDuration
            : Math.max(act1 + 16, DEFAULT_MANIFEST.totalDuration);
        const cues = Array.isArray(data.cues)
          ? data.cues.filter(
              (c) =>
                c &&
                typeof c.start === 'number' &&
                typeof c.end === 'number' &&
                typeof c.text === 'string'
            )
          : [];
        this.manifest = { act1Duration: act1, totalDuration: total, cues };
      }
    } catch {
      this.manifest = DEFAULT_MANIFEST;
    }
    this.manifestLoaded = true;
    return this.manifest;
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getAct(): IntroAct {
    return this.act;
  }

  public getTime(): number {
    return this.elapsedTime;
  }

  public getStatus(): {
    playing: boolean;
    act: IntroAct;
    time: number;
    act1Duration: number;
    totalDuration: number;
    currentSubtitle: string | null;
  } {
    return {
      playing: this.playing,
      act: this.act,
      time: Number(this.elapsedTime.toFixed(2)),
      act1Duration: this.manifest.act1Duration,
      totalDuration: this.manifest.totalDuration,
      currentSubtitle: this.activeSubtitle,
    };
  }

  /**
   * During opaque Act I video playback, skip 3D WebGL rendering to save battery,
   * waking smoothly 1.2s before Act I ends so the dissolve into live 3D is seamless.
   */
  public shouldRender3D(): boolean {
    if (!this.playing) return true;
    return this.elapsedTime >= Math.max(0, this.manifest.act1Duration - 1.2);
  }

  public start(camera: THREE.PerspectiveCamera, muted: boolean): void {
    this.playing = true;
    this.act = 'act1';
    this.elapsedTime = 0;
    this.lastAudioTime = 0;
    this.audioAdvanced = false;
    this.activeSubtitle = null;

    // Pre-position camera at Act II start pose so the dissolve frame is ready
    this.choreography.applyAct2(0, camera);

    this.overlay.setMuted(muted);
    this.overlay.start(this.manifest);
    this.overlay.setAct('act1');
    this.overlay.setSubtitle(null);
  }

  public skip(): void {
    if (!this.playing) return;
    this.stopInternal();
    this.onComplete();
  }

  public seekForDebug(seconds: number, camera: THREE.PerspectiveCamera): void {
    if (!this.playing) return;
    this.elapsedTime = THREE.MathUtils.clamp(seconds, 0, this.manifest.totalDuration);
    this.audioAdvanced = false;
    this.syncVisualState(camera);
  }

  public updateStartScreenIdle(elapsed: number, camera: THREE.PerspectiveCamera): void {
    this.choreography.applyStartScreenIdle(elapsed, camera);
  }

  public update(delta: number, camera: THREE.PerspectiveCamera): void {
    if (!this.playing) return;

    const audioTime = this.overlay.getCurrentTime();
    if (audioTime > 0.05 && Math.abs(audioTime - this.lastAudioTime) > 0.001) {
      this.audioAdvanced = true;
      this.lastAudioTime = audioTime;
    }

    if (this.audioAdvanced && !this.overlay.isAudioEnded() && audioTime > 0) {
      // Slave smoothly to master audio clock for lip/cue accuracy
      this.elapsedTime = Math.max(this.elapsedTime, audioTime);
    } else {
      // Wall-clock fallback (keeps intro advancing smoothly in headless/muted autoplay environments)
      this.elapsedTime += Math.min(delta, 0.1);
    }

    if (this.elapsedTime >= this.manifest.totalDuration) {
      this.choreography.applyAct2(1, camera);
      this.stopInternal();
      this.onComplete();
      return;
    }

    this.syncVisualState(camera);
  }

  private syncVisualState(camera: THREE.PerspectiveCamera): void {
    const { act1Duration, totalDuration, cues } = this.manifest;

    const nextAct: IntroAct = this.elapsedTime < act1Duration ? 'act1' : 'act2';
    if (nextAct !== this.act) {
      this.act = nextAct;
      this.overlay.setAct(nextAct);
    }

    // Update live 3D camera whenever within the wake-up window or Act II
    if (this.elapsedTime >= Math.max(0, act1Duration - 1.2)) {
      const act2Span = Math.max(1, totalDuration - act1Duration);
      const act2Progress = THREE.MathUtils.clamp((this.elapsedTime - act1Duration) / act2Span, 0, 1);
      this.choreography.applyAct2(act2Progress, camera);
    }

    // Sync subtitle cue
    let nextSub: string | null = null;
    for (const cue of cues) {
      if (this.elapsedTime >= cue.start && this.elapsedTime <= cue.end) {
        nextSub = cue.text;
        break;
      }
    }
    if (nextSub !== this.activeSubtitle) {
      this.activeSubtitle = nextSub;
      this.overlay.setSubtitle(nextSub);
    }
  }

  private stopInternal(): void {
    this.playing = false;
    this.act = 'idle';
    this.activeSubtitle = null;
    this.overlay.setSubtitle(null);
    this.overlay.setAct('idle');
    this.overlay.stop();
  }
}
