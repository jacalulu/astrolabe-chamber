import type { GameStateAPI, GameStateSnapshot, ItemId, PuzzleId } from '../types';

export function createInitialGameState(): GameStateSnapshot {
  return {
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
    orreryAngles: {
      earth: 3,
      mars: 8,
      saturn: 1,
    },
    doorKeyInserted: false,
    doorRings: [3, 5, 2],
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
  let state: GameStateSnapshot = createInitialGameState();
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
    if (timerId !== null || state.escaped) return;
    timerId = window.setInterval(() => {
      if (state.escaped) {
        stopTimer();
        return;
      }
      state.elapsedSeconds += 1;
      notify();
    }, 1000);
  };

  const api: GameStateAPI = {
    get: () => state,

    update: (mutator) => {
      mutator(state);
      if (state.escaped) {
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
      state.hintsUsed += 1;
      notify();
    },

    startTimer,
    stopTimer,

    reset: () => {
      stopTimer();
      state = createInitialGameState();
      notify();
    },
  };

  return api;
}
