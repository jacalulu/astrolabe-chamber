import type * as THREE from 'three';

export type ItemId = 'sapphire_lens' | 'saturn_gear' | 'obsidian_key';

export interface InventoryItem {
  id: ItemId;
  name: string;
  description: string;
}

export const INVENTORY_CATALOG: Record<ItemId, InventoryItem> = {
  sapphire_lens: {
    id: 'sapphire_lens',
    name: 'Sapphire Objective Lens',
    description:
      'A precision-ground sapphire glass objective lens seated in a knurled brass bezel, crafted for the Great Equatorial Telescope.',
  },
  saturn_gear: {
    id: 'saturn_gear',
    name: 'Saturn Brass Gear',
    description:
      'An intricately machined 18-tooth celestial brass drive gear engraved with the ringed glyph of Saturn.',
  },
  obsidian_key: {
    id: 'obsidian_key',
    name: 'Obsidian Star Key',
    description:
      'A heavy jet-black obsidian and gilded-brass star key forged to unlock the central hub of the Astrolabe Exit Seal.',
  },
};

export type PuzzleId =
  | 'lunar_box'
  | 'telescope'
  | 'star_chart'
  | 'orrery'
  | 'exit_door';

export const LUNAR_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent',
] as const;

export const ZODIAC_NAMES = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpius',
  'Sagittarius',
  'Capricornus',
  'Aquarius',
  'Pisces',
] as const;

export const TELESCOPE_DEC_STEPS = [0, 15, 30, 45, 60, 75] as const;

export interface GameStateSnapshot {
  inventory: ItemId[];
  placedItems: ItemId[];
  selectedItem: ItemId | null;
  solved: Record<PuzzleId, boolean>;
  lunarDials: [number, number, number, number];
  telescopeLensInstalled: boolean;
  telescopeRA: number;
  telescopeDEC: number;
  starChartSelected: string[];
  orreryGearInstalled: boolean;
  orreryAngles: {
    earth: number;
    mars: number;
    saturn: number;
  };
  doorKeyInserted: boolean;
  doorRings: [number, number, number];
  escaped: boolean;
  elapsedSeconds: number;
  hintsUsed: number;
  focusedStation: string | null;
  hasReadLogbook: boolean;
  hasViewedAlmanac: boolean;
  hasViewedStarChart: boolean;
  hasLookedThroughTelescope: boolean;
  hasDraggedLook: boolean;
  hasWalked: boolean;
}

export interface UIControllerOptions {
  isInvertDrag?: () => boolean;
  onToggleInvertDrag?: (inverted: boolean) => void;
  onBeginIntro?: () => void;
  onSkipDirectly?: () => void;
  onReplayIntro?: () => void;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface IntroTimelineManifest {
  act1Duration: number;
  totalDuration: number;
  cues: SubtitleCue[];
}

export type IntroAct = 'idle' | 'act1' | 'act2';

export interface IntroOverlayAPI {
  start: (manifest: IntroTimelineManifest) => void;
  setAct: (act: IntroAct) => void;
  setSubtitle: (text: string | null) => void;
  getCurrentTime: () => number;
  isAudioEnded: () => boolean;
  setMuted: (muted: boolean) => void;
  stop: () => void;
  isActive: () => boolean;
  dispose: () => void;
}

export interface FocusTarget {
  id: string;
  label: string;
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export type InteractableCursor = 'inspect' | 'grab' | 'pointer';

export interface Interactable {
  id: string;
  object: THREE.Object3D;
  label: string | ((state: Readonly<GameStateSnapshot>) => string);
  hint?: string | ((state: Readonly<GameStateSnapshot>) => string);
  getLabel?: (state: Readonly<GameStateSnapshot>) => string;
  getHint?: (state: Readonly<GameStateSnapshot>) => string | null | undefined;
  cursor?: InteractableCursor;
  maxDistance?: number;
  stationId?: string;
  focusOnly?: boolean;
  focusTarget?: FocusTarget;
  enabled?: (state: Readonly<GameStateSnapshot>) => boolean;
  onInteract: (ctx: InteractionContext) => void;
}

export interface InteractionContext {
  state: GameStateAPI;
  audio: SoundEngineAPI;
  ui: UIControllerAPI;
  focusOn: (target: FocusTarget | null) => void;
  getFocusedStation: () => string | null;
}

export interface GameStateAPI {
  get: () => Readonly<GameStateSnapshot>;
  update: (mutator: (draft: GameStateSnapshot) => void) => void;
  subscribe: (listener: (snapshot: Readonly<GameStateSnapshot>) => void) => () => void;
  addItem: (item: ItemId) => void;
  removeItem: (item: ItemId) => void;
  placeItem: (item: ItemId) => void;
  hasItem: (item: ItemId) => boolean;
  selectItem: (item: ItemId | null) => void;
  markSolved: (puzzle: PuzzleId) => void;
  isSolved: (puzzle: PuzzleId) => boolean;
  setFocusedStation: (stationId: string | null) => void;
  incrementHints: () => void;
  startTimer: () => void;
  stopTimer: () => void;
  reset: () => void;
}

export interface SoundEngineAPI {
  init: () => void;
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  toggleMute: () => boolean;
  playBrassGear: () => void;
  playHeavyLatch: () => void;
  playPickup: () => void;
  playPuzzleSolved: () => void;
  playDoorOpen: () => void;
  playFootstep: () => void;
  playError: () => void;
  playClick: () => void;
}

export interface UIControllerAPI {
  setHoverPrompt: (label: string | null, subhint?: string | null) => void;
  showToast: (message: string, durationMs?: number) => void;
  setFocusBanner: (label: string | null) => void;
  openLogbook: () => void;
  openAlmanac: () => void;
  openStarChart: () => void;
  openTelescopeEyepiece: (aligned: boolean) => void;
  openHintJournal: () => void;
  showVictory: (elapsedSeconds: number, hintsUsed: number) => void;
  isModalOpen: () => boolean;
  dismissTitleVeil: () => void;
  setHudVisible: (visible: boolean) => void;
  isTitleVeilVisible: () => boolean;
}

export interface ColliderBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  label?: string;
}

export interface PBRTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface TextureBundle {
  walnut: PBRTextureSet;
  marbleFloor: PBRTextureSet;
  brass: PBRTextureSet;
  copperDome: PBRTextureSet;
  darkIron: PBRTextureSet;
  persianRug: PBRTextureSet;
  leather: PBRTextureSet;
  stonePlinth: PBRTextureSet;
  starChartWall: THREE.CanvasTexture;
  lunarAlmanac: THREE.CanvasTexture;
  constellationMap: THREE.CanvasTexture;
  zodiacRing: THREE.CanvasTexture;
  astrolabeDial: THREE.CanvasTexture;
  logbookSpread: THREE.CanvasTexture;
}

export interface PropModuleResult {
  group: THREE.Group;
  interactables: Interactable[];
  colliders: ColliderBox[];
  update: (elapsed: number, delta: number, state: Readonly<GameStateSnapshot>) => void;
}
