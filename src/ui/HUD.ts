import {
  INVENTORY_CATALOG,
  type DifficultyMode,
  type GameStateAPI,
  type GameStateSnapshot,
  type ItemId,
  type PuzzleId,
  type SoundEngineAPI,
  type UIControllerAPI,
  type UIControllerOptions,
} from '../types';
import { createPuzzleOverlays, formatTime } from './PuzzleOverlays';

const DIFFICULTY_BLURBS: Record<DifficultyMode, string> = {
  apprentice: 'Guided leads, marked almanac & direct alignments.',
  scholar: 'Unmarked almanac, geometric aspects & cascading lock — no leads.',
  master: 'Seeded ciphers, pulsing star order, coupled gears & 3 hint tokens.',
};

function getCurrentLeadText(snap: Readonly<GameStateSnapshot>): string {
  if (snap.escaped || snap.solved.exit_door) {
    return 'The Astrolabe Door stands open — step out onto the moonlit balcony.';
  }
  if (snap.doorKeyInserted) {
    return 'Align all three Astrolabe rings on the South Exit Door to 12 o’clock.';
  }
  if (snap.inventory.includes('obsidian_key')) {
    return 'Equip the Obsidian Star Key below, inspect the South Exit Door, and insert it into the central Star Keyhole.';
  }
  if (snap.solved.orrery) {
    return 'Collect the Obsidian Star Key rising from the open Sun core of the Central Orrery.';
  }
  if (snap.orreryGearInstalled) {
    return 'Align the Central Orrery to the Great Conjunction (consult the Framed Star Chart on the SE wall).';
  }
  if (snap.inventory.includes('saturn_gear')) {
    return 'Equip Saturn’s Gear below, inspect the Central Orrery, and fit it onto the empty brass spindle.';
  }
  if (snap.solved.star_chart) {
    return 'Collect Saturn’s Brass Gear from the opened Curio Cabinet on the West wall.';
  }
  if (snap.solved.telescope) {
    return 'Trace the Triad (Polaris, Sirius, Vega) on the Backlit Star Table (West) to open the Curio Cabinet.';
  }
  if (snap.telescopeLensInstalled) {
    return 'Set the Great Telescope (North) to RA 04h / DEC +45° and inspect the Brass Eyepiece.';
  }
  if (snap.inventory.includes('sapphire_lens')) {
    return 'Equip the Sapphire Lens below, inspect the Great Telescope (North), and seat it in the empty objective ring.';
  }
  if (snap.solved.lunar_box) {
    return 'Collect the Sapphire Objective Lens inside the opened Cryptex Box on the Writing Desk.';
  }
  if (snap.hasReadLogbook) {
    return 'Check the Lunar Almanac (SW wall) to unlock the 4-dial Cryptex Box on the desk.';
  }
  return 'Click Dr. Vance’s open Logbook on the Writing Desk (right) to read it.';
}

const PUZZLE_PROGRESS_ORDER: Array<{ id: PuzzleId; label: string }> = [
  { id: 'lunar_box', label: 'Lunar Phase Cryptex' },
  { id: 'telescope', label: 'Great Equatorial Telescope' },
  { id: 'star_chart', label: 'Backlit Star Table' },
  { id: 'orrery', label: 'Central Brass Orrery' },
  { id: 'exit_door', label: 'Astrolabe Exit Door' },
];

const ARTIFACT_SLOTS: Array<{ id: ItemId; roman: string; placedLocation: string }> = [
  { id: 'sapphire_lens', roman: 'I', placedLocation: 'Placed in the Great Telescope' },
  { id: 'saturn_gear', roman: 'II', placedLocation: 'Placed in the Mechanical Orrery' },
  { id: 'obsidian_key', roman: 'III', placedLocation: 'Placed in the Astrolabe Seal' },
];

function getItemSVG(itemId: ItemId): string {
  switch (itemId) {
    case 'sapphire_lens':
      return `
        <svg class="inv-slot-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <defs>
            <radialGradient id="sapphCore" cx="38%" cy="32%" r="65%">
              <stop offset="0%" stop-color="#d8f0ff"/>
              <stop offset="32%" stop-color="#5ca9ff"/>
              <stop offset="76%" stop-color="#19449c"/>
              <stop offset="100%" stop-color="#0b1f52"/>
            </radialGradient>
            <linearGradient id="brassRim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f5dc9b"/>
              <stop offset="50%" stop-color="#c49a4c"/>
              <stop offset="100%" stop-color="#7c5b22"/>
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="19" stroke="url(#brassRim)" stroke-width="3.2" stroke-dasharray="3.2 1.8"/>
          <circle cx="24" cy="24" r="16.5" stroke="url(#brassRim)" stroke-width="2.4" fill="#1b150c"/>
          <circle cx="24" cy="24" r="13.5" fill="url(#sapphCore)" stroke="#a8d5ff" stroke-width="0.9"/>
          <path d="M16 18C18.5 14.5 23.5 13 28 14.2" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round"/>
          <circle cx="19" cy="18" r="2.2" fill="#ffffff" opacity="0.88"/>
        </svg>
      `;

    case 'saturn_gear':
      return `
        <svg class="inv-slot-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="gearGold" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#fae4a6"/>
              <stop offset="48%" stop-color="#d4a957"/>
              <stop offset="100%" stop-color="#805e24"/>
            </linearGradient>
          </defs>
          <path d="M22 4h4l1 4.2a15 15 0 0 1 4 1.6l3.6-2.3 2.8 2.8-2.3 3.6a15 15 0 0 1 1.6 4L41 19v4l-4.2 1a15 15 0 0 1-1.6 4l2.3 3.6-2.8 2.8-3.6-2.3a15 15 0 0 1-4 1.6L26 38h-4l-1-4.2a15 15 0 0 1-4-1.6l-3.6 2.3-2.8-2.8 2.3-3.6a15 15 0 0 1-1.6-4L7 23v-4l4.2-1a15 15 0 0 1 1.6-4l-2.3-3.6 2.8-2.8 3.6 2.3a15 15 0 0 1 4-1.6L22 4z" fill="url(#gearGold)" stroke="#5b3f14" stroke-width="1"/>
          <circle cx="24" cy="21" r="10.2" fill="#18120a" stroke="#f2d594" stroke-width="1.2"/>
          <ellipse cx="24" cy="21" rx="9.5" ry="3.2" transform="rotate(-22 24 21)" stroke="#fae2a4" stroke-width="1.6" fill="none"/>
          <circle cx="24" cy="21" r="4.6" fill="url(#gearGold)"/>
          <path d="M16 24.4c2.8.8 11.4-2.4 16-6.2" stroke="#fff0c2" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      `;

    case 'obsidian_key':
      return `
        <svg class="inv-slot-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="obsBlade" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#4e5874"/>
              <stop offset="45%" stop-color="#191e2c"/>
              <stop offset="100%" stop-color="#090c14"/>
            </linearGradient>
            <linearGradient id="keyGold" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#fae4a6"/>
              <stop offset="55%" stop-color="#cf9f49"/>
              <stop offset="100%" stop-color="#876121"/>
            </linearGradient>
          </defs>
          <circle cx="16" cy="17" r="9.5" fill="url(#obsBlade)" stroke="url(#keyGold)" stroke-width="2.2"/>
          <polygon points="16,10.5 17.7,15.3 22.5,17 17.7,18.7 16,23.5 14.3,18.7 9.5,17 14.3,15.3" fill="#f4d993"/>
          <path d="M23 23.5L39 39.5" stroke="url(#keyGold)" stroke-width="3.6" stroke-linecap="round"/>
          <path d="M23 23.5L39 39.5" stroke="#181c29" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M31.5 32L36 27.5M35.5 36L40.5 31" stroke="url(#keyGold)" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="16" cy="17" r="1.8" fill="#181d2b"/>
        </svg>
      `;
  }
}

const SOUND_ON_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
`;

const SOUND_OFF_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/>
    <line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
`;

export function createUIController(
  state: GameStateAPI,
  audio: SoundEngineAPI,
  onExitFocus: () => void,
  onResetGame: () => void,
  options?: UIControllerOptions
): UIControllerAPI {
  const mount = document.getElementById('ui-root') ?? document.body;
  mount.innerHTML = '';

  const hudRoot = document.createElement('div');
  hudRoot.className = 'hud-root hud-hidden';
  mount.appendChild(hudRoot);

  const overlays = createPuzzleOverlays(
    mount,
    state,
    audio,
    () => {
      onboardingDismissed = false;
      timeoutDialogShown = false;
      if (onboardingFadeTimer !== null) {
        window.clearTimeout(onboardingFadeTimer);
        onboardingFadeTimer = null;
      }
      onResetGame();
    },
    (mode, timed) => {
      onboardingDismissed = false;
      timeoutDialogShown = false;
      if (onboardingFadeTimer !== null) {
        window.clearTimeout(onboardingFadeTimer);
        onboardingFadeTimer = null;
      }
      onResetGame();
      state.configureRun(mode, timed);
      state.startTimer();
      const label =
        mode === 'master'
          ? timed
            ? 'Master Astronomer (15-Min Midnight Countdown)'
            : 'Master Astronomer'
          : mode === 'scholar'
            ? 'Scholar'
            : 'Apprentice';
      showToast(`New run started: ${label}`);
    }
  );

  let titleVeilDismissed = false;
  let selectedMode: DifficultyMode = state.get().difficulty;
  let selectedTimed = state.get().timedMode;
  let timeoutDialogShown = false;
  let controlsOpen = false;
  let leadCollapsed = false;
  let onboardingDismissed = false;
  let onboardingFadeTimer: number | null = null;
  let hoveredInventoryItem: ItemId | null = null;
  let hoverPromptVisible = false;
  let toastTimeout: number | null = null;

  // =========================================================================
  // MINIMALIST CINEMA OPENING TITLE VEIL + 3-TIER DIFFICULTY SELECTOR
  // =========================================================================
  const titleVeil = document.createElement('div');
  titleVeil.className = 'title-veil';
  titleVeil.innerHTML = `
    <div class="title-card" role="region" aria-labelledby="title-veil-heading">
      <svg class="title-emblem" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="27" stroke="currentColor" stroke-width="1.4"/>
        <circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="0.9" stroke-dasharray="3 3"/>
        <ellipse cx="32" cy="32" rx="26" ry="11" transform="rotate(-24 32 32)" stroke="currentColor" stroke-width="1"/>
        <ellipse cx="32" cy="32" rx="26" ry="11" transform="rotate(24 32 32)" stroke="currentColor" stroke-width="1" opacity="0.65"/>
        <polygon points="32,14 34.8,29.2 50,32 34.8,34.8 32,50 29.2,34.8 14,32 29.2,29.2" fill="currentColor"/>
      </svg>
      <p class="title-kicker">Royal Observatory · 1898</p>
      <h1 id="title-veil-heading" class="title-heading">The Astrolabe Chamber</h1>
      <div class="title-divider" aria-hidden="true">
        <span class="title-divider-line"></span>
        <svg class="title-divider-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="12,1 14.8,9.2 23,12 14.8,14.8 12,23 9.2,14.8 1,12 9.2,9.2"/>
        </svg>
        <span class="title-divider-line"></span>
      </div>
      <div class="title-difficulty-wrap">
        <div class="difficulty-segmented" role="radiogroup" aria-label="Select difficulty mode">
          <button type="button" class="difficulty-tab is-selected" role="radio" aria-checked="true" data-diff-btn="apprentice">Apprentice</button>
          <button type="button" class="difficulty-tab" role="radio" aria-checked="false" data-diff-btn="scholar">Scholar</button>
          <button type="button" class="difficulty-tab" role="radio" aria-checked="false" data-diff-btn="master">Master</button>
        </div>
        <p class="difficulty-blurb" data-diff-blurb>${DIFFICULTY_BLURBS.apprentice}</p>
        <label class="master-countdown-row" data-master-countdown-row hidden>
          <input type="checkbox" class="master-countdown-checkbox" data-master-countdown-input />
          <span>15-Minute Midnight Countdown</span>
        </label>
      </div>
      <div class="title-cta-stack">
        <button type="button" class="btn-brass-primary title-begin-btn" data-begin-btn>
          Begin
        </button>
        <button type="button" class="title-skip-link" data-skip-direct-btn>
          Skip directly to chamber
        </button>
        <p class="title-touch-note">Desktop recommended · Touch controls supported</p>
      </div>
    </div>
  `;
  mount.appendChild(titleVeil);

  // =========================================================================
  // MINIMALIST TOP BAR + LIVE CURRENT LEAD WHISPER
  // =========================================================================
  const topbar = document.createElement('header');
  topbar.className = 'hud-topbar';
  topbar.innerHTML = `
    <div class="hud-topleft-stack">
      <div class="hud-glass-pill" aria-label="Observatory status">
        <span class="hud-chamber-title">Astrolabe Chamber</span>
        <span class="hud-vdiv" aria-hidden="true"></span>
        <span class="hud-tier-badge" data-hud-tier-badge hidden></span>
        <span class="hud-timer" data-hud-timer aria-label="Elapsed time">00:00</span>
        <span class="hud-vdiv" aria-hidden="true"></span>
        <div class="hud-constellation-progress" data-hud-stars aria-label="Puzzle progress">
          ${PUZZLE_PROGRESS_ORDER.map(
            (p) => `
              <span class="progress-star" data-puzzle-star="${p.id}" title="${p.label}">
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <polygon points="8,1 10.1,5.9 15,8 10.1,10.1 8,15 5.9,10.1 1,8 5.9,5.9"/>
                </svg>
              </span>
            `
          ).join('')}
        </div>
      </div>

      <div class="hud-lead-ribbon" data-lead-ribbon role="status" aria-live="polite">
        <span class="hud-lead-kicker" data-lead-kicker>Lead</span>
        <span class="hud-lead-text" data-lead-text></span>
        <button type="button" class="hud-lead-toggle" data-lead-dismiss aria-label="Hide current lead" title="Hide Current Lead">&times;</button>
        <button type="button" class="hud-lead-restore-btn" data-lead-restore hidden aria-label="Show current lead">✦ Show Lead</button>
      </div>
    </div>

    <div class="hud-actions">
      <button type="button" class="hud-pill-btn" data-journal-btn aria-label="Open Observatory Journal and Hints">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          <line x1="9" y1="7" x2="16" y2="7"/>
          <line x1="9" y1="11" x2="14" y2="11"/>
        </svg>
        <span>Journal</span>
      </button>

      <button type="button" class="hud-pill-btn" data-controls-btn aria-expanded="false" aria-label="Toggle controls reference">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>Controls</span>
      </button>

      <button type="button" class="hud-pill-btn hud-icon-only" data-mute-btn aria-label="Mute or unmute audio" title="Toggle Audio">
        ${SOUND_ON_ICON}
      </button>

      <div class="controls-popover" data-controls-popover role="region" aria-label="Controls guide">
        <h3 class="controls-popover-title">Observatory Controls</h3>
        <ul class="controls-list">
          <li><span>Walk</span><kbd class="hud-kbd">W A S D / Arrows</kbd></li>
          <li><span>Turn Left / Right</span><kbd class="hud-kbd">Q / E</kbd></li>
          <li><span>Look 360°</span><kbd class="hud-kbd">Click &amp; Drag</kbd></li>
          <li><span>Inspect / Use</span><kbd class="hud-kbd">Left Click</kbd></li>
          <li><span>Step Back</span><kbd class="hud-kbd">Esc</kbd></li>
          <li><span>Select Artifact</span><kbd class="hud-kbd">Click Slot / 1-3</kbd></li>
        </ul>
        <div class="controls-divider" aria-hidden="true"></div>
        <div class="controls-look-group">
          <span class="controls-look-label">Look Style</span>
          <div class="controls-look-segmented" role="radiogroup" aria-label="Drag look style">
            <button type="button" class="controls-look-btn is-active" role="radio" aria-checked="true" data-look-mode="grab">
              <span>Grab World</span>
              <small>Trackpad</small>
            </button>
            <button type="button" class="controls-look-btn" role="radio" aria-checked="false" data-look-mode="fps">
              <span>Mouse Look</span>
              <small>FPS</small>
            </button>
          </div>
        </div>
        <div class="controls-divider" aria-hidden="true"></div>
        <div class="controls-action-stack">
          <button type="button" class="controls-action-btn" data-replay-intro-btn>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polygon points="6 4 20 12 6 20 6 4"/>
            </svg>
            <span>Replay Opening Cinematic</span>
          </button>
          <button type="button" class="controls-action-btn" data-change-difficulty-btn>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span>Change Difficulty / New Run</span>
          </button>
        </div>
      </div>
    </div>
  `;
  hudRoot.appendChild(topbar);

  // =========================================================================
  // GENTLE NAVIGATION ONBOARDING CHIPS (Fade out once player drags & walks)
  // =========================================================================
  const onboardingEl = document.createElement('div');
  onboardingEl.className = 'hud-onboarding';
  onboardingEl.setAttribute('aria-label', 'Navigation tips');
  onboardingEl.innerHTML = `
    <div class="onboard-chip" data-onboard-drag>
      <span class="onboard-check" aria-hidden="true">✓</span>
      <span><kbd class="hud-kbd">Drag</kbd> to look around</span>
      <button type="button" class="onboard-flip-btn" data-onboard-flip-drag aria-label="Flip drag look direction" title="Switch between Grab World and Mouse Look">⇄ Flip</button>
    </div>
    <div class="onboard-chip" data-onboard-walk>
      <span class="onboard-check" aria-hidden="true">✓</span>
      <span><kbd class="hud-kbd">WASD / Arrows</kbd> to walk</span>
    </div>
  `;
  hudRoot.appendChild(onboardingEl);

  // =========================================================================
  // FOCUS MODE BAR
  // =========================================================================
  const focusBar = document.createElement('div');
  focusBar.className = 'hud-focus-bar';
  focusBar.innerHTML = `
    <div class="focus-bar-top">
      <button type="button" class="focus-back-btn" data-focus-back>
        ← Step Back <span style="opacity:0.75;font-weight:500;">(Esc)</span>
      </button>
      <span class="focus-station-label" data-focus-label>Inspecting</span>
    </div>
    <span class="focus-guide-line">
      Click dials or rings to rotate · Equip items below for sockets · WASD / Esc to step back
    </span>
  `;
  hudRoot.appendChild(focusBar);

  // =========================================================================
  // CONTEXTUAL HOVER PROMPT (Anchored bottom-center above Artifact Tray)
  // =========================================================================
  const hoverPromptEl = document.createElement('div');
  hoverPromptEl.className = 'hover-prompt';
  hoverPromptEl.setAttribute('data-hover-prompt', '');
  hoverPromptEl.setAttribute('role', 'status');
  hoverPromptEl.setAttribute('aria-live', 'polite');
  hoverPromptEl.innerHTML = `
    <span class="hover-prompt-diamond" aria-hidden="true"></span>
    <span class="hover-prompt-text" data-hover-label></span>
    <span class="hover-prompt-sep" data-hover-sep hidden aria-hidden="true"></span>
    <span class="hover-prompt-subhint" data-hover-subhint hidden></span>
  `;
  hudRoot.appendChild(hoverPromptEl);

  // =========================================================================
  // NON-INTRUSIVE TOAST BANNER
  // =========================================================================
  const toastEl = document.createElement('div');
  toastEl.className = 'hud-toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  toastEl.innerHTML = `
    <span class="hud-toast-star" aria-hidden="true">✦</span>
    <span data-toast-text></span>
  `;
  hudRoot.appendChild(toastEl);

  // =========================================================================
  // TOUCH MOVEMENT PAD (Visible only on touch / coarse-pointer devices)
  // =========================================================================
  const touchPadEl = document.createElement('div');
  touchPadEl.className = 'touch-walk-pad';
  touchPadEl.setAttribute('role', 'group');
  touchPadEl.setAttribute('aria-label', 'Touch movement controls');
  touchPadEl.innerHTML = `
    <button type="button" class="touch-pad-btn touch-pad-up" data-touch-dir="up" aria-label="Walk forward">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    </button>
    <button type="button" class="touch-pad-btn touch-pad-left" data-touch-dir="left" aria-label="Strafe left">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <span class="touch-pad-center" aria-hidden="true">✦</span>
    <button type="button" class="touch-pad-btn touch-pad-right" data-touch-dir="right" aria-label="Strafe right">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>
    <button type="button" class="touch-pad-btn touch-pad-down" data-touch-dir="down" aria-label="Walk backward">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
  `;
  hudRoot.appendChild(touchPadEl);

  // =========================================================================
  // BOTTOM INVENTORY DOCK (3 ARTIFACT SLOTS)
  // =========================================================================
  const dockWrap = document.createElement('div');
  dockWrap.className = 'hud-dock-wrap';
  dockWrap.innerHTML = `
    <div class="inv-tooltip" data-inv-tooltip>
      <span class="inv-tooltip-name" data-inv-tooltip-name></span>
      <span class="inv-tooltip-desc" data-inv-tooltip-desc></span>
    </div>
    <nav class="inv-dock" aria-label="Collected Artifacts">
      ${[0, 1, 2]
        .map(
          (slotIdx) => `
            <button type="button" class="inv-slot" data-inv-slot="${slotIdx}" aria-label="Empty artifact slot ${slotIdx + 1}">
              <svg class="inv-slot-empty-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
                <circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
              </svg>
              <span class="inv-slot-badge">${['I', 'II', 'III'][slotIdx]}</span>
            </button>
          `
        )
        .join('')}
    </nav>
  `;
  hudRoot.appendChild(dockWrap);

  // Element references
  const beginBtn = titleVeil.querySelector<HTMLButtonElement>('[data-begin-btn]')!;
  const skipDirectBtn = titleVeil.querySelector<HTMLButtonElement>('[data-skip-direct-btn]')!;
  const diffTabBtns = Array.from(titleVeil.querySelectorAll<HTMLButtonElement>('[data-diff-btn]'));
  const diffBlurbEl = titleVeil.querySelector<HTMLElement>('[data-diff-blurb]')!;
  const masterCountdownRow = titleVeil.querySelector<HTMLElement>('[data-master-countdown-row]')!;
  const masterCountdownInput = titleVeil.querySelector<HTMLInputElement>('[data-master-countdown-input]')!;
  const tierBadgeEl = topbar.querySelector<HTMLElement>('[data-hud-tier-badge]')!;
  const timerEl = topbar.querySelector<HTMLElement>('[data-hud-timer]')!;
  const leadRibbonEl = topbar.querySelector<HTMLElement>('[data-lead-ribbon]')!;
  const leadKickerEl = topbar.querySelector<HTMLElement>('[data-lead-kicker]')!;
  const leadTextEl = topbar.querySelector<HTMLElement>('[data-lead-text]')!;
  const leadDismissBtn = topbar.querySelector<HTMLButtonElement>('[data-lead-dismiss]')!;
  const leadRestoreBtn = topbar.querySelector<HTMLButtonElement>('[data-lead-restore]')!;
  const journalBtn = topbar.querySelector<HTMLButtonElement>('[data-journal-btn]')!;
  const controlsBtn = topbar.querySelector<HTMLButtonElement>('[data-controls-btn]')!;
  const controlsPopover = topbar.querySelector<HTMLElement>('[data-controls-popover]')!;
  const lookModeBtns = Array.from(topbar.querySelectorAll<HTMLButtonElement>('[data-look-mode]'));
  const replayIntroBtn = topbar.querySelector<HTMLButtonElement>('[data-replay-intro-btn]')!;
  const changeDifficultyBtn = topbar.querySelector<HTMLButtonElement>('[data-change-difficulty-btn]')!;
  const muteBtn = topbar.querySelector<HTMLButtonElement>('[data-mute-btn]')!;
  const onboardDragChip = onboardingEl.querySelector<HTMLElement>('[data-onboard-drag]')!;
  const onboardFlipBtn = onboardingEl.querySelector<HTMLButtonElement>('[data-onboard-flip-drag]')!;
  const onboardWalkChip = onboardingEl.querySelector<HTMLElement>('[data-onboard-walk]')!;
  const focusBackBtn = focusBar.querySelector<HTMLButtonElement>('[data-focus-back]')!;
  const focusLabelEl = focusBar.querySelector<HTMLElement>('[data-focus-label]')!;
  const hoverLabelEl = hoverPromptEl.querySelector<HTMLElement>('[data-hover-label]')!;
  const hoverSepEl = hoverPromptEl.querySelector<HTMLElement>('[data-hover-sep]')!;
  const hoverSubhintEl = hoverPromptEl.querySelector<HTMLElement>('[data-hover-subhint]')!;
  const toastTextEl = toastEl.querySelector<HTMLElement>('[data-toast-text]')!;
  const invTooltipEl = dockWrap.querySelector<HTMLElement>('[data-inv-tooltip]')!;
  const invTooltipNameEl = dockWrap.querySelector<HTMLElement>('[data-inv-tooltip-name]')!;
  const invTooltipDescEl = dockWrap.querySelector<HTMLElement>('[data-inv-tooltip-desc]')!;
  const invSlotBtns = Array.from(dockWrap.querySelectorAll<HTMLButtonElement>('[data-inv-slot]'));
  const touchPadBtns = Array.from(touchPadEl.querySelectorAll<HTMLButtonElement>('[data-touch-dir]'));
  const activeTouchDirs = new Set<string>();

  function emitVirtualMove(): void {
    const forward = (activeTouchDirs.has('up') ? 1 : 0) - (activeTouchDirs.has('down') ? 1 : 0);
    const strafe = (activeTouchDirs.has('right') ? 1 : 0) - (activeTouchDirs.has('left') ? 1 : 0);
    options?.onVirtualMove?.(forward, strafe);
  }

  function resetTouchMove(): void {
    if (activeTouchDirs.size === 0) return;
    activeTouchDirs.clear();
    touchPadBtns.forEach((btn) => btn.classList.remove('is-pressed'));
    options?.onVirtualMove?.(0, 0);
  }

  const starEls = new Map<PuzzleId, HTMLElement>();
  for (const p of PUZZLE_PROGRESS_ORDER) {
    const el = topbar.querySelector<HTMLElement>(`[data-puzzle-star="${p.id}"]`);
    if (el) starEls.set(p.id, el);
  }

  // =========================================================================
  // HELPERS & STATE RENDERING
  // =========================================================================
  function getInvertDragState(): boolean {
    try {
      return Boolean(options?.isInvertDrag?.());
    } catch {
      return false;
    }
  }

  function syncInvertDragSwitch(): void {
    const inverted = getInvertDragState();
    lookModeBtns.forEach((btn) => {
      const isFps = btn.dataset.lookMode === 'fps';
      const active = isFps === inverted;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  function applyLookStyle(inverted: boolean): void {
    options?.onToggleInvertDrag?.(inverted);
    syncInvertDragSwitch();
    audio.playClick();
    showToast(
      inverted ? 'Look Style: Mouse Look (FPS)' : 'Look Style: Grab World (Trackpad)',
      2400
    );
  }

  function renderLeadCollapsedState(): void {
    leadRibbonEl.classList.toggle('is-collapsed', leadCollapsed);
    leadKickerEl.hidden = leadCollapsed;
    leadTextEl.hidden = leadCollapsed;
    leadDismissBtn.hidden = leadCollapsed;
    leadRestoreBtn.hidden = !leadCollapsed;
  }

  function setHudVisible(visible: boolean): void {
    hudRoot.classList.toggle('hud-hidden', !visible);
    if (visible) {
      updateMuteButton();
    } else {
      resetTouchMove();
      setControlsOpen(false);
      setHoverPrompt(null);
    }
  }

  function syncDifficultySelectorUI(): void {
    diffTabBtns.forEach((btn) => {
      const mode = btn.dataset.diffBtn as DifficultyMode;
      const isSelected = mode === selectedMode;
      btn.classList.toggle('is-selected', isSelected);
      btn.setAttribute('aria-checked', String(isSelected));
    });
    diffBlurbEl.textContent = DIFFICULTY_BLURBS[selectedMode];
    masterCountdownRow.hidden = selectedMode !== 'master';
    masterCountdownInput.checked = selectedMode === 'master' && selectedTimed;
  }

  function dismissTitleVeil(): void {
    if (titleVeilDismissed) return;
    titleVeilDismissed = true;
    titleVeil.classList.add('is-dismissed');
  }

  function showTitleVeil(): void {
    const snap = state.get();
    selectedMode = snap.difficulty;
    selectedTimed = snap.timedMode;
    syncDifficultySelectorUI();
    overlays.resetHintsProgress();
    timeoutDialogShown = false;
    onboardingDismissed = false;
    if (onboardingFadeTimer !== null) {
      window.clearTimeout(onboardingFadeTimer);
      onboardingFadeTimer = null;
    }
    titleVeilDismissed = false;
    titleVeil.classList.remove('is-dismissed');
    setHudVisible(false);
    setFocusBanner(null);
  }

  function setControlsOpen(open: boolean): void {
    controlsOpen = open;
    if (open) syncInvertDragSwitch();
    controlsPopover.classList.toggle('is-open', open);
    controlsBtn.classList.toggle('is-active', open);
    controlsBtn.setAttribute('aria-expanded', String(open));
  }

  function updateMuteButton(): void {
    const isMuted = audio.isMuted();
    muteBtn.classList.toggle('is-muted', isMuted);
    muteBtn.innerHTML = isMuted ? SOUND_OFF_ICON : SOUND_ON_ICON;
    muteBtn.setAttribute('aria-label', isMuted ? 'Unmute audio' : 'Mute audio');
  }

  function renderInventoryTooltip(snap: Readonly<GameStateSnapshot>): void {
    const hoveredCarried =
      hoveredInventoryItem && snap.inventory.includes(hoveredInventoryItem)
        ? hoveredInventoryItem
        : null;
    const hoveredPlaced =
      hoveredInventoryItem && snap.placedItems.includes(hoveredInventoryItem)
        ? hoveredInventoryItem
        : null;
    const selectedCarried =
      !hoverPromptVisible && snap.selectedItem && snap.inventory.includes(snap.selectedItem)
        ? snap.selectedItem
        : null;

    const itemToDescribe = hoveredCarried ?? hoveredPlaced ?? selectedCarried;

    if (!itemToDescribe) {
      invTooltipEl.classList.remove('is-visible');
      return;
    }

    const meta = INVENTORY_CATALOG[itemToDescribe];
    const isPlaced = snap.placedItems.includes(itemToDescribe);
    const slotMeta = ARTIFACT_SLOTS.find((s) => s.id === itemToDescribe);

    if (isPlaced && slotMeta) {
      invTooltipNameEl.textContent = `${meta.name} · Placed`;
      invTooltipDescEl.textContent = slotMeta.placedLocation;
    } else {
      invTooltipNameEl.textContent =
        snap.selectedItem === itemToDescribe ? `${meta.name} · Equipped` : meta.name;
      invTooltipDescEl.textContent = meta.description;
    }
    invTooltipEl.classList.add('is-visible');
  }

  function renderState(snap: Readonly<GameStateSnapshot>): void {
    // Tier badge inside top-left pill (Scholar / Master only)
    if (snap.difficulty === 'apprentice') {
      tierBadgeEl.hidden = true;
      tierBadgeEl.textContent = '';
      tierBadgeEl.classList.remove('is-scholar', 'is-master');
    } else {
      tierBadgeEl.hidden = false;
      tierBadgeEl.textContent = snap.difficulty === 'scholar' ? 'Scholar' : 'Master';
      tierBadgeEl.classList.toggle('is-scholar', snap.difficulty === 'scholar');
      tierBadgeEl.classList.toggle('is-master', snap.difficulty === 'master');
    }

    // Countdown vs stopwatch timer
    if (snap.timedMode) {
      const remaining = Math.max(0, snap.countdownDurationSeconds - snap.elapsedSeconds);
      timerEl.textContent = formatTime(remaining);
      timerEl.setAttribute('aria-label', 'Countdown remaining until midnight');
      timerEl.classList.toggle('is-warning', remaining < 180 && remaining >= 60);
      timerEl.classList.toggle('is-critical', remaining < 60);
    } else {
      timerEl.textContent = formatTime(snap.elapsedSeconds);
      timerEl.setAttribute('aria-label', 'Elapsed time');
      timerEl.classList.remove('is-warning', 'is-critical');
    }

    // Trigger Midnight Has Struck dialog once when timed run expires
    if (snap.timeExpired && !snap.escaped && !timeoutDialogShown) {
      timeoutDialogShown = true;
      audio.playHeavyLatch();
      overlays.openTimeoutDialog();
    } else if (!snap.timeExpired) {
      timeoutDialogShown = false;
    }

    // Lead ribbon shown ONLY when puzzleConfig.showLeadRibbon is true (Apprentice)
    leadRibbonEl.hidden = !snap.puzzleConfig.showLeadRibbon;
    if (snap.puzzleConfig.showLeadRibbon) {
      leadTextEl.textContent = getCurrentLeadText(snap);
    }

    onboardDragChip.classList.toggle('is-done', Boolean(snap.hasDraggedLook));
    onboardWalkChip.classList.toggle('is-done', Boolean(snap.hasWalked));

    if (snap.hasDraggedLook && snap.hasWalked) {
      if (!onboardingDismissed && onboardingFadeTimer === null) {
        onboardingFadeTimer = window.setTimeout(() => {
          onboardingDismissed = true;
          onboardingEl.classList.add('is-complete');
          onboardingFadeTimer = null;
        }, 900);
      }
    } else if (!onboardingDismissed) {
      onboardingEl.classList.remove('is-complete');
    }

    for (const { id } of PUZZLE_PROGRESS_ORDER) {
      const star = starEls.get(id);
      if (star) {
        star.classList.toggle('is-solved', Boolean(snap.solved[id]));
      }
    }

    invSlotBtns.forEach((btn, idx) => {
      const slot = ARTIFACT_SLOTS[idx];
      const isCarried = snap.inventory.includes(slot.id);
      const isPlaced = !isCarried && snap.placedItems.includes(slot.id);
      const isSelected = isCarried && snap.selectedItem === slot.id;
      const meta = INVENTORY_CATALOG[slot.id];

      btn.classList.toggle('is-filled', isCarried);
      btn.classList.toggle('is-selected', isSelected);
      btn.classList.toggle('is-placed', isPlaced);
      btn.dataset.itemId = isCarried || isPlaced ? slot.id : '';

      if (isCarried) {
        btn.tabIndex = 0;
        btn.removeAttribute('aria-disabled');
        btn.setAttribute(
          'aria-label',
          `${meta.name}${isSelected ? ' (equipped)' : ''} — click to ${isSelected ? 'unequip' : 'equip'}`
        );
        btn.innerHTML = `
          ${getItemSVG(slot.id)}
          <span class="inv-slot-badge">${slot.roman}</span>
        `;
      } else if (isPlaced) {
        if (document.activeElement === btn) {
          btn.blur();
        }
        btn.tabIndex = -1;
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('aria-label', `${meta.name} — ${slot.placedLocation}`);
        btn.innerHTML = `
          ${getItemSVG(slot.id)}
          <span class="inv-placed-tag">✓ Placed</span>
        `;
      } else {
        btn.tabIndex = -1;
        btn.removeAttribute('aria-disabled');
        btn.setAttribute('aria-label', `Undiscovered artifact slot ${slot.roman}`);
        btn.innerHTML = `
          <svg class="inv-slot-empty-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
            <circle cx="12" cy="12" r="7" stroke-dasharray="2 2"/>
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
          </svg>
          <span class="inv-slot-badge">${slot.roman}</span>
        `;
      }
    });

    renderInventoryTooltip(snap);
  }

  // =========================================================================
  // EVENT LISTENERS
  // =========================================================================
  diffTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.diffBtn as DifficultyMode | undefined;
      if (!mode) return;
      selectedMode = mode;
      if (mode !== 'master') {
        selectedTimed = false;
      }
      audio.playClick();
      syncDifficultySelectorUI();
    });
  });

  masterCountdownInput.addEventListener('change', () => {
    selectedTimed = masterCountdownInput.checked;
    audio.playClick();
  });

  syncDifficultySelectorUI();

  beginBtn.addEventListener('click', () => {
    overlays.resetHintsProgress();
    timeoutDialogShown = false;
    state.configureRun(selectedMode, selectedMode === 'master' && selectedTimed);
    if (options?.onBeginIntro) {
      options.onBeginIntro();
    } else {
      dismissTitleVeil();
      setHudVisible(true);
      audio.init();
      audio.playClick();
      state.startTimer();
    }
  });

  skipDirectBtn.addEventListener('click', () => {
    overlays.resetHintsProgress();
    timeoutDialogShown = false;
    state.configureRun(selectedMode, selectedMode === 'master' && selectedTimed);
    if (options?.onSkipDirectly) {
      options.onSkipDirectly();
      audio.playClick();
    } else {
      dismissTitleVeil();
      setHudVisible(true);
      audio.init();
      audio.playClick();
      state.startTimer();
    }
  });

  replayIntroBtn.addEventListener('click', () => {
    setControlsOpen(false);
    audio.playClick();
    options?.onReplayIntro?.();
  });

  changeDifficultyBtn.addEventListener('click', () => {
    setControlsOpen(false);
    audio.playClick();
    if (options?.onReturnToTitle) {
      options.onReturnToTitle();
    } else {
      showTitleVeil();
    }
  });

  journalBtn.addEventListener('click', () => {
    setControlsOpen(false);
    overlays.openHintJournal();
  });

  controlsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.playClick();
    setControlsOpen(!controlsOpen);
  });

  lookModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const wantInverted = btn.dataset.lookMode === 'fps';
      applyLookStyle(wantInverted);
    });
  });

  onboardFlipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    applyLookStyle(!getInvertDragState());
  });

  leadDismissBtn.addEventListener('click', () => {
    audio.playClick();
    leadCollapsed = true;
    renderLeadCollapsedState();
  });

  leadRestoreBtn.addEventListener('click', () => {
    audio.playClick();
    leadCollapsed = false;
    renderLeadCollapsedState();
  });

  muteBtn.addEventListener('click', () => {
    audio.toggleMute();
    updateMuteButton();
    if (!audio.isMuted()) audio.playClick();
  });

  focusBackBtn.addEventListener('click', () => {
    audio.playClick();
    onExitFocus();
  });

  touchPadBtns.forEach((btn) => {
    const dir = btn.dataset.touchDir;
    if (!dir) return;

    const releaseDir = (): void => {
      if (!activeTouchDirs.has(dir)) return;
      activeTouchDirs.delete(dir);
      btn.classList.remove('is-pressed');
      emitVirtualMove();
    };

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore if synthetic event has no active pointer */
      }
      activeTouchDirs.add(dir);
      btn.classList.add('is-pressed');
      emitVirtualMove();
    });

    btn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      releaseDir();
    });
    btn.addEventListener('pointercancel', releaseDir);
    btn.addEventListener('lostpointercapture', releaseDir);
  });

  window.addEventListener('blur', resetTouchMove);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetTouchMove();
  });

  invSlotBtns.forEach((btn, idx) => {
    const slot = ARTIFACT_SLOTS[idx];
    btn.addEventListener('click', () => {
      const snap = state.get();
      if (!snap.inventory.includes(slot.id)) return;
      audio.playClick();
      state.selectItem(snap.selectedItem === slot.id ? null : slot.id);
    });

    btn.addEventListener('mouseenter', () => {
      const snap = state.get();
      if (snap.inventory.includes(slot.id) || snap.placedItems.includes(slot.id)) {
        hoveredInventoryItem = slot.id;
        renderInventoryTooltip(snap);
      }
    });

    btn.addEventListener('mouseleave', () => {
      hoveredInventoryItem = null;
      renderInventoryTooltip(state.get());
    });
  });

  // Close controls popover when clicking outside
  window.addEventListener('pointerdown', (e) => {
    if (!controlsOpen) return;
    const target = e.target as Node | null;
    if (
      target &&
      !controlsPopover.contains(target) &&
      !controlsBtn.contains(target)
    ) {
      setControlsOpen(false);
    }
  });

  // Quick 1-3 number key artifact selection when exploring
  window.addEventListener('keydown', (e) => {
    if (!titleVeilDismissed || overlays.isAnyOpen()) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const idx = Number(e.key) - 1;
      const slot = ARTIFACT_SLOTS[idx];
      const snap = state.get();
      if (!slot || !snap.inventory.includes(slot.id)) return;
      audio.playClick();
      state.selectItem(snap.selectedItem === slot.id ? null : slot.id);
    }
  });

  // Subscribe to reactive game state
  state.subscribe(renderState);
  renderState(state.get());

  // =========================================================================
  // UIControllerAPI IMPLEMENTATION
  // =========================================================================
  function setHoverPrompt(label: string | null, subhint?: string | null): void {
    if (!label || !titleVeilDismissed || overlays.isAnyOpen()) {
      if (hoverPromptVisible) {
        hoverPromptVisible = false;
        hoverPromptEl.classList.remove('is-visible');
        renderInventoryTooltip(state.get());
      }
      return;
    }

    hoverLabelEl.textContent = label;

    if (subhint) {
      hoverSepEl.hidden = false;
      hoverSubhintEl.hidden = false;
      hoverSubhintEl.textContent = subhint;
    } else {
      hoverSepEl.hidden = true;
      hoverSubhintEl.hidden = true;
      hoverSubhintEl.textContent = '';
    }

    if (!hoverPromptVisible) {
      hoverPromptVisible = true;
      hoverPromptEl.classList.add('is-visible');
      renderInventoryTooltip(state.get());
    }
  }

  function showToast(message: string, durationMs = 3400): void {
    toastTextEl.textContent = message;
    toastEl.classList.add('is-visible');
    if (toastTimeout !== null) {
      window.clearTimeout(toastTimeout);
    }
    toastTimeout = window.setTimeout(() => {
      toastEl.classList.remove('is-visible');
      toastTimeout = null;
    }, durationMs);
  }

  function setFocusBanner(label: string | null): void {
    if (label) {
      resetTouchMove();
      hudRoot.classList.add('is-focused');
      focusLabelEl.textContent = label;
      focusBar.classList.add('is-visible');
    } else {
      hudRoot.classList.remove('is-focused');
      focusBar.classList.remove('is-visible');
    }
  }

  return {
    setHoverPrompt,
    showToast,
    setFocusBanner,
    openLogbook: () => {
      resetTouchMove();
      setControlsOpen(false);
      overlays.openLogbook();
    },
    openAlmanac: () => {
      resetTouchMove();
      setControlsOpen(false);
      overlays.openAlmanac();
    },
    openStarChart: () => {
      resetTouchMove();
      setControlsOpen(false);
      overlays.openStarChart();
    },
    openTelescopeEyepiece: (aligned: boolean) => {
      resetTouchMove();
      setControlsOpen(false);
      overlays.openTelescopeEyepiece(aligned);
    },
    openHintJournal: () => {
      resetTouchMove();
      setControlsOpen(false);
      overlays.openHintJournal();
    },
    showVictory: (elapsedSeconds: number, hintsUsed: number) => {
      resetTouchMove();
      setControlsOpen(false);
      overlays.showVictory(elapsedSeconds, hintsUsed);
    },
    isModalOpen: () => !titleVeilDismissed || overlays.isAnyOpen(),
    dismissTitleVeil,
    showTitleVeil,
    setHudVisible,
    isTitleVeilVisible: () => !titleVeilDismissed,
  };
}
