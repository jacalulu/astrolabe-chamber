import './ui/styles.css';
import type { GameStateSnapshot } from './types';
import { createGameState } from './engine/GameState';
import { SceneManager } from './engine/SceneManager';
import { PostProcessing } from './engine/PostProcessing';
import { Controls } from './engine/Controls';
import { InteractionSystem } from './engine/InteractionSystem';
import { createProceduralTextures } from './assets/ProceduralTextures';
import { createObservatoryEnvMap } from './assets/EnvironmentMap';
import { buildObservatoryRoom } from './world/ObservatoryRoom';
import { buildAtmosphere } from './world/Atmosphere';
import { buildAllProps } from './world/props';
import { createSoundEngine } from './audio/SoundEngine';
import { createUIController } from './ui/HUD';

export interface GameDebugAPI {
  setCamera: (pos: [number, number, number], lookAt: [number, number, number]) => void;
  getState: () => Readonly<GameStateSnapshot>;
  setState: (mutator: (draft: GameStateSnapshot) => void) => void;
  interact: (id: string) => boolean;
  focus: (id: string | null) => boolean;
  listInteractables: () => Array<{
    id: string;
    label: string;
    hint: string | null;
    cursor: string | null;
    maxDistance: number;
    stationId: string | null;
    focusOnly: boolean;
    enabled: boolean;
    hasFocusTarget: boolean;
  }>;
  dismissTitle: () => void;
  openLogbook: () => void;
  openAlmanac: () => void;
  openStarChart: () => void;
  openTelescopeEyepiece: (aligned: boolean) => void;
  openHintJournal: () => void;
  showVictory: () => void;
  setExposure: (exposure: number) => void;
  setBloom: (strength: number, radius: number, threshold: number) => void;
  setInvertDrag: (inverted: boolean) => void;
  isInvertDrag: () => boolean;
  getPerfStats: () => {
    dpr: number;
    shadowAutoUpdate: boolean;
    powerSaverMode: boolean;
    paused: boolean;
  };
}

declare global {
  interface Window {
    __GAME_DEBUG__?: GameDebugAPI;
  }
}

const ACTIVE_FRAME_INTERVAL_MS = 15.5; // Caps cleanly at 60fps (prevents 120fps Retina battery drain)
const IDLE_FRAME_INTERVAL_MS = 1000 / 18; // ~18fps gentle ambient power-saver cadence
const IDLE_TIMEOUT_MS = 4000;
const ACTIVE_SHADOW_INTERVAL_MS = 142; // ~7 Hz shadow updates during active motion
const IDLE_SHADOW_INTERVAL_MS = 500; // ~2 Hz shadow updates during idle ambient orbit

function bootstrap(): void {
  const container = document.getElementById('canvas-container');
  if (!container) {
    throw new Error('Missing #canvas-container element');
  }

  const state = createGameState();
  const audio = createSoundEngine();
  const sceneManager = new SceneManager(container);
  const postProcessing = new PostProcessing(sceneManager);

  // Environment reflection probe & procedural PBR texture bundle
  const envMap = createObservatoryEnvMap(sceneManager.renderer);
  sceneManager.setEnvironment(envMap, 0.88);
  const textures = createProceduralTextures();

  // Build world geometry, atmosphere & hero interactive puzzles
  const room = buildObservatoryRoom(textures);
  sceneManager.scene.add(room.group);

  const atmosphere = buildAtmosphere(sceneManager.scene);
  if (atmosphere.group && !atmosphere.group.parent) {
    sceneManager.scene.add(atmosphere.group);
  }

  const props = buildAllProps(textures);
  sceneManager.scene.add(props.group);

  // Forward-declared controls handle & invert-drag preference for UI callbacks
  let invertDragSetting = false;
  let controls: Controls | null = null;

  // Power-saver activity tracking
  let lastInputTime = performance.now();
  let lastRenderTime = performance.now();
  let lastShadowTime = 0;
  let elapsedSimSeconds = 0;
  let powerSaverMode = false;
  let isPaused = document.hidden;
  let rafId = 0;

  const wakeActivity = (): void => {
    lastInputTime = performance.now();
  };

  const ui = createUIController(
    state,
    audio,
    () => {
      wakeActivity();
      controls?.focusOn(null);
    },
    () => {
      wakeActivity();
      state.reset();
      controls?.resetToSpawn();
      ui.setFocusBanner(null);
      ui.showToast('The Astrolabe Chamber has been reset.');
      sceneManager.requestShadowUpdate();
      state.startTimer();
    },
    {
      isInvertDrag: () => (controls ? controls.isInvertDrag() : invertDragSetting),
      onToggleInvertDrag: (inverted) => {
        wakeActivity();
        invertDragSetting = inverted;
        controls?.setInvertDrag(inverted);
      },
    }
  );

  const activeControls = new Controls({
    camera: sceneManager.camera,
    domElement: sceneManager.renderer.domElement,
    isModalOpen: () => ui.isModalOpen(),
    isEscaped: () => state.get().escaped,
    onFootstep: () => audio.playFootstep(),
    onFocusChange: (target) => {
      wakeActivity();
      state.setFocusedStation(target?.id ?? null);
      ui.setFocusBanner(target?.label ?? null);
    },
    onDragLook: () => {
      wakeActivity();
      if (!state.get().hasDraggedLook) {
        state.update((s) => {
          s.hasDraggedLook = true;
        });
      }
    },
    onWalk: () => {
      wakeActivity();
      if (!state.get().hasWalked) {
        state.update((s) => {
          s.hasWalked = true;
        });
      }
    },
  });
  activeControls.setInvertDrag(invertDragSetting);
  controls = activeControls;

  activeControls.setColliders([...room.colliders, ...props.colliders]);

  const interaction = new InteractionSystem(
    sceneManager.scene,
    sceneManager.camera,
    sceneManager.renderer.domElement,
    activeControls,
    state,
    audio,
    ui
  );

  interaction.register([...room.interactables, ...props.interactables]);

  // Any puzzle/inventory/door state mutation wakes rendering & updates shadows
  const unsubscribeStateShadows = state.subscribe(() => {
    sceneManager.requestShadowUpdate();
    lastShadowTime = performance.now();
  });

  // Wake immediately on user interaction
  const inputEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
  for (const evt of inputEvents) {
    window.addEventListener(evt, wakeActivity, { passive: true });
  }

  // Render helper for immediate deterministic renders (e.g. setCamera)
  const renderNow = (): void => {
    sceneManager.requestShadowUpdate();
    postProcessing.render(elapsedSimSeconds);
    lastRenderTime = performance.now();
    lastShadowTime = lastRenderTime;
  };

  // Expose debug / QA automation API
  window.__GAME_DEBUG__ = {
    setCamera: (pos, lookAt) => {
      wakeActivity();
      activeControls.setCameraDirect(pos, lookAt);
      renderNow();
    },
    getState: () => state.get(),
    setState: (mutator) => {
      wakeActivity();
      state.update(mutator);
    },
    interact: (id) => {
      wakeActivity();
      return interaction.triggerById(id);
    },
    focus: (id) => {
      wakeActivity();
      return interaction.focusById(id);
    },
    listInteractables: () => interaction.listInteractables(),
    dismissTitle: () => {
      wakeActivity();
      ui.dismissTitleVeil();
      state.startTimer();
    },
    openLogbook: () => {
      wakeActivity();
      if (!state.get().hasReadLogbook) {
        state.update((s) => {
          s.hasReadLogbook = true;
        });
      }
      ui.openLogbook();
    },
    openAlmanac: () => {
      wakeActivity();
      if (!state.get().hasViewedAlmanac) {
        state.update((s) => {
          s.hasViewedAlmanac = true;
        });
      }
      ui.openAlmanac();
    },
    openStarChart: () => {
      wakeActivity();
      if (!state.get().hasViewedStarChart) {
        state.update((s) => {
          s.hasViewedStarChart = true;
        });
      }
      ui.openStarChart();
    },
    openTelescopeEyepiece: (aligned) => {
      wakeActivity();
      if (!state.get().hasLookedThroughTelescope) {
        state.update((s) => {
          s.hasLookedThroughTelescope = true;
        });
      }
      ui.openTelescopeEyepiece(aligned);
    },
    openHintJournal: () => {
      wakeActivity();
      ui.openHintJournal();
    },
    showVictory: () => {
      wakeActivity();
      const s = state.get();
      ui.showVictory(s.elapsedSeconds, s.hintsUsed);
    },
    setExposure: (exposure) => {
      sceneManager.renderer.toneMappingExposure = exposure;
      renderNow();
    },
    setBloom: (strength, radius, threshold) => {
      postProcessing.setBloom(strength, radius, threshold);
      renderNow();
    },
    setInvertDrag: (inverted) => {
      invertDragSetting = inverted;
      activeControls.setInvertDrag(inverted);
    },
    isInvertDrag: () => activeControls.isInvertDrag(),
    getPerfStats: () => ({
      dpr: sceneManager.renderer.getPixelRatio(),
      shadowAutoUpdate: sceneManager.renderer.shadowMap.autoUpdate,
      powerSaverMode,
      paused: isPaused,
    }),
  };

  // Smart battery-conscious render loop (pauses on hidden tab, 60fps active, ~18fps modal/idle)
  const animate = (now: number): void => {
    if (isPaused) {
      rafId = 0;
      return;
    }
    rafId = window.requestAnimationFrame(animate);

    const modalOpen = ui.isModalOpen();
    const recentlyActive =
      !modalOpen && (now - lastInputTime < IDLE_TIMEOUT_MS || activeControls.isMovingOrTransitioning());
    powerSaverMode = !recentlyActive;

    const minInterval = recentlyActive ? ACTIVE_FRAME_INTERVAL_MS : IDLE_FRAME_INTERVAL_MS;
    const elapsedMs = now - lastRenderTime;
    if (elapsedMs < minInterval) {
      return;
    }

    const delta = Math.min(Math.max(elapsedMs / 1000, 0.001), 0.08);
    lastRenderTime = now;
    elapsedSimSeconds += delta;

    const snap = state.get();

    activeControls.update(delta);
    interaction.update(delta);
    atmosphere.update(elapsedSimSeconds, delta);
    room.update(elapsedSimSeconds, delta, snap);
    props.update(elapsedSimSeconds, delta, snap);

    // Throttled shadow map refreshes (~7 Hz active, ~2 Hz idle) instead of every frame
    const shadowInterval = recentlyActive ? ACTIVE_SHADOW_INTERVAL_MS : IDLE_SHADOW_INTERVAL_MS;
    if (now - lastShadowTime >= shadowInterval) {
      sceneManager.requestShadowUpdate();
      lastShadowTime = now;
    }

    postProcessing.render(elapsedSimSeconds);
  };

  const startLoop = (): void => {
    if (rafId !== 0 || isPaused) return;
    lastRenderTime = performance.now();
    sceneManager.requestShadowUpdate();
    rafId = window.requestAnimationFrame(animate);
  };

  const stopLoop = (): void => {
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      isPaused = true;
      stopLoop();
    } else {
      isPaused = false;
      wakeActivity();
      startLoop();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Render initial frame immediately & kick off loop if visible
  renderNow();
  if (!isPaused) {
    startLoop();
  }

  // Clean disposal on Vite HMR
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      for (const evt of inputEvents) {
        window.removeEventListener(evt, wakeActivity);
      }
      unsubscribeStateShadows();
      state.stopTimer();
      interaction.dispose();
      activeControls.dispose();
      postProcessing.dispose();
      sceneManager.dispose();
    });
  }
}

bootstrap();
