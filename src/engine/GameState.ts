import type {
  DifficultyMode,
  GameStateAPI,
  GameStateSnapshot,
  ItemId,
  PuzzleConfig,
  PuzzleId,
} from '../types';
import { generatePuzzleConfig } from './DifficultyConfig';

const DEFAULT_COUNTDOWN_SECONDS = 900; // 15-Minute Midnight Countdown

function clonePuzzleConfig(cfg: PuzzleConfig): PuzzleConfig {
  return {
    ...cfg,
    lunarSolution: [...cfg.lunarSolution] as [number, number, number, number],
    lunarClues: {
      ...cfg.lunarClues,
      lines: [...cfg.lunarClues.lines],
    },
    starChartSolution: [...cfg.starChartSolution],
    orrerySolution: { ...cfg.orrerySolution },
    orreryStart: { ...cfg.orreryStart },
    orreryClueLines: [...cfg.orreryClueLines],
    doorTarget: [...cfg.doorTarget] as [number, number, number],
    doorStart: [...cfg.doorStart] as [number, number, number],
  };
}

export function createInitialGameState(
  difficulty: DifficultyMode = 'apprentice',
  timedMode = false,
  seed?: number
): GameStateSnapshot {
  const puzzleConfig = generatePuzzleConfig(difficulty, seed);
  return {
    difficulty,
    timedMode: difficulty === 'master' ? Boolean(timedMode) : false,
    countdownDurationSeconds: DEFAULT_COUNTDOWN_SECONDS,
    timeExpired: false,
    puzzleConfig,
    inventory: [],
    placedItems: [],
    selectedItem: null,
    solved: {
      lunar_box: false,
      telescope: false,
      star_chart: false,
      orrery: false,
      exit_door: false,
    },
    lunarDials: [0, 0, 0, 0],
    telescopeLensInstalled: false,
    telescopeRA: 0,
    telescopeDEC: 15,
    starChartSelected: [],
    orreryGearInstalled: false,
    orreryAngles: { ...puzzleConfig.orreryStart },
    doorKeyInserted: false,
    doorRings: [...puzzleConfig.doorStart] as [number, number, number],
    escaped: false,
    elapsedSeconds: 0,
    hintsUsed: 0,
    focusedStation: null,
    hasReadLogbook: false,
    hasViewedAlmanac: false,
    hasViewedStarChart: false,
    hasLookedThroughTelescope: false,
    hasDraggedLook: false,
    hasWalked: false,
  };
}

function cloneSnapshot(s: GameStateSnapshot): GameStateSnapshot {
  return {
    ...s,
    puzzleConfig: clonePuzzleConfig(s.puzzleConfig),
    inventory: [...s.inventory],
    placedItems: [...s.placedItems],
    solved: { ...s.solved },
    lunarDials: [...s.lunarDials] as [number, number, number, number],
    starChartSelected: [...s.starChartSelected],
    orreryAngles: { ...s.orreryAngles },
    doorRings: [...s.doorRings] as [number, number, number],
  };
}

export function createGameState(): GameStateAPI {
  let state: GameStateSnapshot = createInitialGameState('apprentice', false);
  const listeners = new Set<(snapshot: Readonly<GameStateSnapshot>) => void>();
  let timerId: number | null = null;

  const notify = (): void => {
    const snap = cloneSnapshot(state);
    for (const listener of listeners) {
      listener(snap);
    }
  };

  const stopTimer = (): void => {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  };

  const startTimer = (): void => {
    if (timerId !== null || state.escaped || state.timeExpired) return;
    timerId = window.setInterval(() => {
      if (state.escaped || state.timeExpired) {
        stopTimer();
        return;
      }
      state.elapsedSeconds += 1;
      if (state.timedMode && state.elapsedSeconds >= state.countdownDurationSeconds) {
        state.elapsedSeconds = state.countdownDurationSeconds;
        state.timeExpired = true;
        stopTimer();
      }
      notify();
    }, 1000);
  };

  const api: GameStateAPI = {
    get: () => state,

    update: (mutator) => {
      mutator(state);
      if (state.escaped || state.timeExpired) {
        stopTimer();
      }
      notify();
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    addItem: (item: ItemId) => {
      if (state.inventory.includes(item)) return;
      state.inventory.push(item);
      state.selectedItem = item;
      notify();
    },

    removeItem: (item: ItemId) => {
      const idx = state.inventory.indexOf(item);
      if (idx === -1) return;
      state.inventory.splice(idx, 1);
      if (state.selectedItem === item) {
        state.selectedItem = state.inventory[0] ?? null;
      }
      notify();
    },

    placeItem: (item: ItemId) => {
      const idx = state.inventory.indexOf(item);
      if (idx !== -1) {
        state.inventory.splice(idx, 1);
      }
      if (state.selectedItem === item) {
        state.selectedItem = null;
      }
      if (!state.placedItems.includes(item)) {
        state.placedItems.push(item);
      }
      notify();
    },

    hasItem: (item: ItemId) => state.inventory.includes(item),

    selectItem: (item: ItemId | null) => {
      if (item !== null && !state.inventory.includes(item)) return;
      state.selectedItem = item;
      notify();
    },

    markSolved: (puzzle: PuzzleId) => {
      if (state.solved[puzzle]) return;
      state.solved[puzzle] = true;
      notify();
    },

    isSolved: (puzzle: PuzzleId) => state.solved[puzzle],

    setFocusedStation: (stationId: string | null) => {
      if (state.focusedStation === stationId) return;
      state.focusedStation = stationId;
      notify();
    },

    incrementHints: () => {
      const max = state.puzzleConfig.maxHints;
      if (max !== null && state.hintsUsed >= max) return;
      state.hintsUsed += 1;
      notify();
    },

    startTimer,
    stopTimer,

    configureRun: (difficulty: DifficultyMode, timedMode = false, seed?: number) => {
      stopTimer();
      state = createInitialGameState(difficulty, timedMode, seed);
      notify();
    },

    continueUntimed: () => {
      state.timedMode = false;
      state.timeExpired = false;
      notify();
      startTimer();
    },

    reset: () => {
      stopTimer();
      state = createInitialGameState(state.difficulty, state.timedMode);
      notify();
    },
  };

  return api;
}
