import {
  LUNAR_PHASE_NAMES,
  ZODIAC_NAMES,
  type DifficultyMode,
  type GameStateAPI,
  type GameStateSnapshot,
  type PuzzleId,
  type SoundEngineAPI,
} from '../types';
import { CONSTELLATION_STAR_COORDS } from '../assets/ProceduralTextures';

export interface PuzzleOverlaysAPI {
  openLogbook: () => void;
  openAlmanac: () => void;
  openStarChart: () => void;
  openTelescopeEyepiece: (aligned: boolean) => void;
  openHintJournal: () => void;
  openTimeoutDialog: () => void;
  showVictory: (elapsedSeconds: number, hintsUsed: number) => void;
  isAnyOpen: () => boolean;
  resetHintsProgress: () => void;
  dispose: () => void;
}

interface HintTierData {
  puzzleId: PuzzleId;
  title: string;
  gentle: string;
  clues: [string, string];
}

const PUZZLE_META: Array<{ id: PuzzleId; short: string }> = [
  { id: 'lunar_box', short: 'Lunar Box' },
  { id: 'telescope', short: 'Telescope' },
  { id: 'star_chart', short: 'Star Table' },
  { id: 'orrery', short: 'Orrery' },
  { id: 'exit_door', short: 'Astrolabe' },
];

const DIFFICULTY_LABELS: Record<DifficultyMode, string> = {
  apprentice: 'Apprentice',
  scholar: 'Scholar',
  master: 'Master Astronomer',
};

const SYNODIC_DAYS = ['Day 0', 'Day 4', 'Day 7', 'Day 11', 'Day 15', 'Day 18', 'Day 22', 'Day 25'] as const;

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function attachSafariLightDismissFallback(dialog: HTMLDialogElement): void {
  if ('closedBy' in HTMLDialogElement.prototype) return;

  let downOutside = false;
  dialog.addEventListener('pointerdown', (e) => {
    if (e.target !== dialog) {
      downOutside = false;
      return;
    }
    const rect = dialog.getBoundingClientRect();
    downOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
  });

  dialog.addEventListener('pointerup', (e) => {
    if (!downOutside) return;
    downOutside = false;
    const rect = dialog.getBoundingClientRect();
    const upOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (upOutside && dialog.open) {
      dialog.close('light-dismiss');
    }
  });
}

function starLabel(id: string): string {
  return CONSTELLATION_STAR_COORDS[id]?.label ?? id.toUpperCase();
}

function getActiveHintData(snap: Readonly<GameStateSnapshot>): HintTierData | null {
  const cfg = snap.puzzleConfig;

  if (!snap.solved.lunar_box) {
    const phaseAnswer = cfg.lunarSolution.map((p) => LUNAR_PHASE_NAMES[p]).join(', ');
    if (cfg.lunarClues.showAlmanacMarks) {
      return {
        puzzleId: 'lunar_box',
        title: 'I. The Lunar Phase Cryptex',
        gentle:
          'Dr. Vance kept a mechanical four-dial cryptex on the East writing desk. Look around the chamber walls for a gilded chart of lunar phases.',
        clues: [
          'Inspect the Framed Lunar Almanac on the South-West wall. Four phases are encircled in crimson ink and numbered I through IV.',
          `Set the four dials on the desk cryptex from left to right to: ${phaseAnswer}.`,
        ],
      };
    }

    return {
      puzzleId: 'lunar_box',
      title: 'I. The Lunar Phase Cryptex',
      gentle:
        'Cross-reference Dr. Vance’s open Observatory Logbook on the East desk with the unmarked 8-phase Lunar Almanac on the South-West wall.',
      clues: [
        cfg.difficulty === 'scholar'
          ? 'Each of the four diary lines in the Logbook describes a distinct phase around the Lunar Almanac wheel.'
          : 'Decode Dial I from the Logbook’s opening lunar description, then count clockwise/counter-clockwise steps around the 8-phase Almanac wheel for Dials II, III, and IV.',
        `Set the four cryptex dials from left to right to: ${phaseAnswer}.`,
      ],
    };
  }

  if (!snap.solved.telescope) {
    if (!snap.telescopeLensInstalled && !snap.inventory.includes('sapphire_lens')) {
      return {
        puzzleId: 'telescope',
        title: 'II. The Sapphire Objective Lens',
        gentle:
          'The Lunar Cryptex on the East writing desk is unlocked. Look closely inside its velvet-lined interior.',
        clues: [
          'Retrieve the glowing Sapphire Objective Lens resting inside the opened cryptex box on the writing desk.',
          'Click the Sapphire Objective Lens inside the open desk box to collect it, then carry it to the Great Equatorial Telescope.',
        ],
      };
    }

    if (!snap.telescopeLensInstalled) {
      return {
        puzzleId: 'telescope',
        title: 'II. Fitting the Great Equatorial',
        gentle:
          'You hold a precision sapphire objective lens. Inspect the Great Equatorial Telescope on the North plinth.',
        clues: [
          'Select the Sapphire Objective Lens in your artifact tray below and click the empty threaded Objective Lens Housing at the front of the telescope tube.',
          'Once the lens is seated, consult Dr. Vance’s Observatory Logbook on the writing desk to calculate the Right Ascension and Declination coordinates.',
        ],
      };
    }

    const raStr = String(cfg.telescopeTargetRA).padStart(2, '0');
    return {
      puzzleId: 'telescope',
      title: 'II. Aligning the Great Equatorial',
      gentle:
        'With the Sapphire Lens seated, deduce the Right Ascension and Declination from Dr. Vance’s Logbook (and the chamber’s wall instruments if referenced).',
      clues: [
        cfg.difficulty === 'apprentice'
          ? 'Turn the RA and DEC brass vernier wheels on the telescope mount until the coordinates match the Logbook entry, then peer through the Brass Eyepiece.'
          : 'Check the East Wall Regulator Clock (showing 11:00) and the North Meridian Transit Ring (90° Zenith) to compute the exact RA and DEC from the Logbook.',
        `Set the telescope to RA ${raStr}h and DEC +${cfg.telescopeTargetDEC}°, then click the Brass Eyepiece.`,
      ],
    };
  }

  if (!snap.solved.star_chart) {
    const starList = cfg.starChartSolution.map(starLabel).join(cfg.starChartOrderMatters ? ' → ' : ', ');
    return {
      puzzleId: 'star_chart',
      title: 'III. The Backlit Star Table',
      gentle: cfg.starChartOrderMatters
        ? 'The aligned Telescope revealed 5 pulsing stars in sequence. Watch their order carefully and trace the exact pattern on the West Backlit Star Table.'
        : cfg.eyepieceShowNames
          ? 'The telescope revealed a luminous triangular constellation. Look toward the West side of the chamber for a glowing backlit star-map lectern.'
          : 'The telescope revealed an unlabeled 4-star constellation geometry. Match the exact positions of those 4 bright stars onto the West Backlit Star Table.',
      clues: [
        cfg.starChartOrderMatters
          ? 'Compare the relative positions of the 5 sequentially pulsing stars in the Telescope Eyepiece against the 8 stars on the Star Table, and click them in exact pulse order (1 → 5).'
          : `Illuminate only the ${cfg.starChartSolution.length} stars shown in the aligned Telescope Eyepiece on the Backlit Star Table (West).`,
        cfg.starChartOrderMatters
          ? `Click the 5 crystal pins in exact order: ${starList}.`
          : `Illuminate these exact stars (and no extras): ${starList}.`,
      ],
    };
  }

  if (!snap.solved.orrery) {
    if (!snap.orreryGearInstalled && !snap.inventory.includes('saturn_gear')) {
      return {
        puzzleId: 'orrery',
        title: 'IV. Saturn’s Missing Gear',
        gentle:
          'Completing the Star Table unlatched a nearby display case along the West wall.',
        clues: [
          'Look inside the opened mahogany Curio Cabinet on the West wall (just north of the Star Table) to collect the Saturn Brass Gear.',
          'Click the Saturn Brass Gear inside the open Curio Cabinet, then bring it to the Central Brass Orrery.',
        ],
      };
    }

    if (!snap.orreryGearInstalled) {
      return {
        puzzleId: 'orrery',
        title: 'IV. Restoring the Central Orrery',
        gentle:
          'The Saturn Brass Gear belongs in the exposed clockwork spindle of the Central Orrery.',
        clues: [
          'Equip the Saturn Brass Gear in your artifact tray below and click the empty Brass Spindle Socket in the foreground of the Central Orrery.',
          'After installing the gear, consult the Framed Celestial Star Chart on the South-East wall for the Great Conjunction.',
        ],
      };
    }

    const eHouse = ZODIAC_NAMES[cfg.orrerySolution.earth];
    const mHouse = ZODIAC_NAMES[cfg.orrerySolution.mars];
    const sHouse = ZODIAC_NAMES[cfg.orrerySolution.saturn];
    return {
      puzzleId: 'orrery',
      title: 'IV. The Great Conjunction',
      gentle: cfg.orreryCoupled
        ? 'Consult the South-East Star Chart for Earth’s anchor and geometric aspects. Because the gears are coupled, align Saturn first, then Mars, then Earth!'
        : 'With Saturn’s drive restored, inspect the Framed Star Chart on the South-East wall to determine the zodiac houses for Earth, Mars, and Saturn.',
      clues: [
        cfg.orreryCoupled
          ? 'Saturn advances Saturn +1 and Mars +2; Mars advances Mars +1 and Earth +1; Earth turns freely. Lock Saturn first, then Mars, then finish with Earth.'
          : 'Count zodiac houses clockwise (+30° each) or counter-clockwise (−30° each) from Earth’s anchor on the South-East Star Chart.',
        `Align Earth to ${eHouse}, Mars to ${mHouse}, and Saturn to ${sHouse} to bloom the golden Sun core.`,
      ],
    };
  }

  if (!snap.solved.exit_door) {
    if (!snap.doorKeyInserted && !snap.inventory.includes('obsidian_key')) {
      return {
        puzzleId: 'exit_door',
        title: 'V. The Obsidian Star Key',
        gentle:
          'The Central Orrery’s golden Sun has bloomed open. Inspect the center of the Orrery to claim its treasure.',
        clues: [
          'Click the Obsidian Star Key rising from the open Sun core at the center of the Orrery.',
          'Take the Obsidian Star Key to the Grand Arched Exit Door on the South wall.',
        ],
      };
    }

    if (!snap.doorKeyInserted) {
      return {
        puzzleId: 'exit_door',
        title: 'V. The Celestial Astrolabe Seal',
        gentle:
          'Bring your Obsidian Star Key to the Grand Arched Exit Door on the South wall.',
        clues: [
          'Equip the Obsidian Star Key in your artifact tray and insert it into the central Star Keyhole Hub of the South Door’s Astrolabe Seal.',
          'Once seated, rotate the three concentric brass rings to align their gilded meridian bars.',
        ],
      };
    }

    const bearingStr = `${cfg.doorAzimuthDegrees}° (${cfg.doorAzimuthLabel})`;
    if (cfg.doorCoupling === 'bidirectional') {
      return {
        puzzleId: 'exit_door',
        title: 'V. Unsealing the Coupled Astrolabe',
        gentle:
          'All three Astrolabe rings are bidirectionally coupled, and Master mode uses the Azimuth Target engraved inside the aligned Telescope Eyepiece.',
        clues: [
          `Outer moves Outer+Middle; Middle moves All Three; Inner moves Middle+Inner. Notice that clicking Outer + Inner together advances Middle by +2 while advancing Outer & Inner by +1! Target bearing: ${bearingStr}.`,
          `Align all three gilded meridian bars to ${bearingStr} to unbolt the oak doors.`,
        ],
      };
    }

    if (cfg.doorCoupling === 'cascade') {
      return {
        puzzleId: 'exit_door',
        title: 'V. Unsealing the Cascading Astrolabe',
        gentle:
          'The three Astrolabe rings cascade inward as they turn: Outer carries Middle, Middle carries Inner, and Inner turns alone.',
        clues: [
          'Solve from outside in: lock the Outer ring to 12 o’clock (N · 0°) first, then adjust the Middle ring, and finally finish with the free Inner ring.',
          'Align Outer, Middle, and Inner golden meridian bars straight up to 12 o’clock (N · 0°).',
        ],
      };
    }

    return {
      puzzleId: 'exit_door',
      title: 'V. Unsealing the Astrolabe Door',
      gentle:
        'The Obsidian Star Key has unlocked the three concentric brass rings on the South Exit Door.',
      clues: [
        'Click each of the three brass astrolabe rings to rotate its inlaid golden meridian bar straight upward toward the crimson ruby pointer at 12 o’clock.',
        'Align the outer, middle, and inner rings so all three gold meridian bars point directly to 12 o’clock (N · 0°) to open the doors.',
      ],
    };
  }

  return null;
}

export function createPuzzleOverlays(
  root: HTMLElement,
  state: GameStateAPI,
  audio: SoundEngineAPI,
  onResetGame: () => void,
  onStartDifficulty?: (mode: DifficultyMode, timed: boolean) => void
): PuzzleOverlaysAPI {
  const revealedHintDepth: Partial<Record<PuzzleId, number>> = {};

  function createDialog(className: string, labelledById: string): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.className = `obs-dialog ${className}`;
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', labelledById);
    attachSafariLightDismissFallback(dialog);
    root.appendChild(dialog);
    return dialog;
  }

  // =========================================================================
  // 1. OBSERVATORY LOGBOOK DIALOG (Dynamic per DifficultyMode / PuzzleConfig)
  // =========================================================================
  const logbookDialog = createDialog('modal-logbook', 'logbook-dialog-title');
  logbookDialog.innerHTML = `
    <div class="logbook-shell">
      <button type="button" class="modal-close-btn" data-close aria-label="Close Observatory Logbook">&times;</button>
      <div class="logbook-spread" data-logbook-spread></div>
    </div>
  `;
  const logbookSpreadEl = logbookDialog.querySelector<HTMLElement>('[data-logbook-spread]')!;

  function renderLogbookContent(): void {
    const cfg = state.get().puzzleConfig;
    const lunarLinesHtml = cfg.lunarClues.lines
      .map((line) => `<div style="margin-top:4px;">${line}</div>`)
      .join('');

    const diagramRa =
      cfg.difficulty === 'apprentice' ? `RA ${String(cfg.telescopeTargetRA).padStart(2, '0')}h` : 'RA ??h';
    const diagramDec =
      cfg.difficulty === 'apprentice' ? `DEC +${cfg.telescopeTargetDEC}°` : 'DEC +??°';
    const diagramSub =
      cfg.difficulty === 'apprentice' ? 'Meridian Sighting' : 'Clock · Zenith';

    let starOrreryNote =
      'Trace the Telescope’s Triad upon the <strong>Backlit Star Table</strong> to free Saturn’s Gear; then align the <strong>Orrery</strong> to the Great Conjunction recorded on the <strong>South-East Star Chart</strong>.';
    if (cfg.difficulty === 'scholar') {
      starOrreryNote =
        'Match the Telescope’s unlabeled <strong>4-star constellation pattern</strong> onto the <strong>Backlit Star Table</strong> to free Saturn’s Gear; then deduce the Great Conjunction from Earth’s anchor and geometric aspects on the <strong>South-East Star Chart</strong>.';
    } else if (cfg.difficulty === 'master') {
      starOrreryNote =
        'Observe the Telescope’s <strong>5 pulsing stars</strong> and illuminate the <strong>Backlit Star Table</strong> in their exact sequence (1 → 5) to free Saturn’s Gear. Beware: the Orrery’s planetary drive gears are <strong>mechanically coupled</strong>.';
    }

    let sealNote =
      'Seat the Star Key within the South Door’s Astrolabe Seal and turn all three engraved meridian rings until their gilded bars point straight up to the <strong>crimson zenith (N · 0°)</strong>.';
    if (cfg.difficulty === 'scholar') {
      sealNote =
        'Seat the Star Key within the South Door’s Astrolabe Seal and bring all three <strong>cascading meridian rings</strong> to the <strong>crimson zenith (N · 0°)</strong> — each outer ring carries the next ring inward as it turns.';
    } else if (cfg.difficulty === 'master') {
      sealNote =
        'Note the <strong>Azimuth Target</strong> etched inside the aligned Telescope Eyepiece. Seat the Star Key in the South Door and align all three <strong>bidirectionally coupled rings</strong> to that exact compass bearing.';
    }

    logbookSpreadEl.innerHTML = `
      <div class="logbook-ribbon" aria-hidden="true"></div>
      <section class="logbook-page logbook-page-left">
        <p class="logbook-header-meta">Royal Observatory · Greenwich Meridian · 1898</p>
        <h2 id="logbook-dialog-title" class="logbook-title">Observatory Logbook</h2>
        <p class="logbook-subtitle">Private Celestial Ledger of Dr. Alistair Vance, F.R.A.S.</p>

        <p class="logbook-entry">
          <em>21 November, Midnight —</em> Should the chamber seals engage while I am away,
          only an observer of steady hand and faithful reckoning may unbolt the Astrolabe Door.
        </p>

        <div class="logbook-callout">
          <strong>I. ${cfg.lunarClues.heading}:</strong>
          ${lunarLinesHtml}
        </div>

        <div class="logbook-callout">
          <strong>II. The Great Equatorial:</strong><br/>
          ${cfg.telescopeClueText}
        </div>

        <svg class="logbook-diagram" viewBox="0 0 260 92" fill="none" aria-hidden="true">
          <line x1="12" y1="46" x2="248" y2="46" stroke="currentColor" stroke-width="0.9" stroke-dasharray="3 3" opacity="0.65"/>
          <circle cx="72" cy="46" r="30" stroke="currentColor" stroke-width="1.2"/>
          <circle cx="72" cy="46" r="22" stroke="currentColor" stroke-width="0.7" stroke-dasharray="2 2"/>
          <line x1="72" y1="10" x2="72" y2="82" stroke="currentColor" stroke-width="0.9"/>
          <line x1="72" y1="46" x2="96" y2="22" stroke="#8f2620" stroke-width="1.6"/>
          <circle cx="96" cy="22" r="2.6" fill="#8f2620"/>
          <text x="114" y="34" font-family="Cinzel, serif" font-size="10" fill="#8f2620" font-weight="600">${diagramRa}</text>
          <text x="114" y="54" font-family="Cinzel, serif" font-size="10" fill="#8f2620" font-weight="600">${diagramDec}</text>
          <text x="114" y="72" font-family="Cormorant Garamond, serif" font-style="italic" font-size="11.5" fill="currentColor">${diagramSub}</text>
          <polygon points="214,22 194,64 234,58" stroke="#8f2620" stroke-width="1.1" fill="rgba(143,38,32,0.08)"/>
          <circle cx="214" cy="22" r="2.3" fill="currentColor"/>
          <circle cx="194" cy="64" r="2.3" fill="currentColor"/>
          <circle cx="234" cy="58" r="2.3" fill="currentColor"/>
        </svg>
      </section>

      <section class="logbook-page logbook-page-right">
        <p class="logbook-header-meta">Folio XLVII · ${DIFFICULTY_LABELS[cfg.difficulty]} Reckoning</p>
        <h3 class="logbook-title">The Great Conjunction</h3>
        <p class="logbook-subtitle">Notes on the Star Table, Orrery &amp; South Seal</p>

        <div class="logbook-callout">
          <strong>III. Star Table &amp; Orrery:</strong><br/>
          ${starOrreryNote}
        </div>

        <p class="logbook-entry">
          When Saturn’s brass gear is restored to its spindle and Earth, Mars, and Saturn stand
          in their appointed zodiac houses, the central Sun shall unfurl its petals and present
          my <strong>Obsidian Star Key</strong>.
        </p>

        <p class="logbook-entry">
          <strong>IV. The Astrolabe Seal:</strong> ${sealNote}
        </p>

        <div class="logbook-signature">
          Per aspera ad astra — <em>Dr. Alistair Vance</em>
          <span class="logbook-seal" aria-hidden="true">AV</span>
        </div>
      </section>
    `;
  }

  logbookDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    logbookDialog.close('close-button');
  });
  logbookDialog.addEventListener('close', () => {
    logbookDialog.returnValue = '';
  });

  // =========================================================================
  // 2. FRAMED LUNAR ALMANAC DIALOG (Marked on Apprentice, Unmarked on Scholar/Master)
  // =========================================================================
  const almanacDialog = createDialog('modal-almanac', 'almanac-dialog-title');
  almanacDialog.innerHTML = `
    <div class="almanac-shell">
      <button type="button" class="modal-close-btn" data-close aria-label="Close Lunar Almanac">&times;</button>
      <p class="almanac-kicker">South-West Wall Plate · Lunar Ephemeris</p>
      <h2 id="almanac-dialog-title" class="almanac-title">Framed Lunar Almanac</h2>
      <div data-almanac-body></div>
    </div>
  `;
  const almanacBodyEl = almanacDialog.querySelector<HTMLElement>('[data-almanac-body]')!;

  function renderAlmanacContent(): void {
    const showMarks = state.get().puzzleConfig.lunarClues.showAlmanacMarks;
    if (showMarks) {
      almanacBodyEl.innerHTML = `
        ${buildLunarAlmanacSVG(true)}
        <div class="almanac-legend">
          <div class="almanac-legend-card">
            <span class="almanac-legend-num">I</span>
            <span class="almanac-legend-name">Waxing Crescent</span>
          </div>
          <div class="almanac-legend-card">
            <span class="almanac-legend-num">II</span>
            <span class="almanac-legend-name">Full Moon</span>
          </div>
          <div class="almanac-legend-card">
            <span class="almanac-legend-num">III</span>
            <span class="almanac-legend-name">Waning Gibbous</span>
          </div>
          <div class="almanac-legend-card">
            <span class="almanac-legend-num">IV</span>
            <span class="almanac-legend-name">New Moon</span>
          </div>
        </div>
        <p class="almanac-footnote">
          Four phases encircled in Dr. Vance's crimson ink — ordered I to IV for the desk cryptex.
        </p>
      `;
    } else {
      almanacBodyEl.innerHTML = `
        ${buildLunarAlmanacSVG(false)}
        <p class="almanac-unmarked-note">
          Unmarked Synodic Ephemeris (Day 0–25) — cross-reference Dr. Vance’s Logbook cipher with the 8 phases arranged clockwise around this wheel.
        </p>
      `;
    }
  }

  almanacDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    almanacDialog.close('close-button');
  });
  almanacDialog.addEventListener('close', () => {
    almanacDialog.returnValue = '';
  });

  // =========================================================================
  // 2B. FRAMED CELESTIAL STAR CHART DIALOG (Direct on Apprentice, Aspects on Scholar/Master)
  // =========================================================================
  const starChartDialog = createDialog('modal-starchart', 'starchart-dialog-title');
  starChartDialog.innerHTML = `
    <div class="starchart-shell">
      <button type="button" class="modal-close-btn" data-close aria-label="Close Celestial Star Chart">&times;</button>
      <p class="almanac-kicker">South-East Wall Plate · Planisphere of 1898</p>
      <h2 id="starchart-dialog-title" class="almanac-title">Framed Celestial Star Chart</h2>
      <div data-starchart-body></div>
    </div>
  `;
  const starChartBodyEl = starChartDialog.querySelector<HTMLElement>('[data-starchart-body]')!;

  function renderStarChartContent(): void {
    const cfg = state.get().puzzleConfig;
    if (cfg.starChartShowDirectAnswer) {
      const eName = ZODIAC_NAMES[cfg.orrerySolution.earth];
      const mName = ZODIAC_NAMES[cfg.orrerySolution.mars];
      const sName = ZODIAC_NAMES[cfg.orrerySolution.saturn];
      starChartBodyEl.innerHTML = `
        ${buildCelestialStarChartSVG(cfg.orrerySolution, cfg.orreryEarthAnchor, true)}
        <div class="starchart-conjunction-grid">
          <div class="conjunction-card">
            <span class="conjunction-planet">Earth</span>
            <span class="conjunction-house">${eName} (${cfg.orrerySolution.earth * 30}°)</span>
          </div>
          <div class="conjunction-card">
            <span class="conjunction-planet">Mars</span>
            <span class="conjunction-house">${mName} (${cfg.orrerySolution.mars * 30}°)</span>
          </div>
          <div class="conjunction-card">
            <span class="conjunction-planet">Saturn</span>
            <span class="conjunction-house">${sName} (${cfg.orrerySolution.saturn * 30}°)</span>
          </div>
        </div>
        <p class="almanac-footnote">
          The Great Conjunction marked in crimson-gold ink — align the Central Brass Orrery to these three zodiac houses.
        </p>
      `;
    } else {
      const clueItems = cfg.orreryClueLines.map((line) => `<li>${line}</li>`).join('');
      starChartBodyEl.innerHTML = `
        ${buildCelestialStarChartSVG(cfg.orrerySolution, cfg.orreryEarthAnchor, false)}
        <div class="starchart-aspects-panel">
          <p class="starchart-aspects-title">Great Conjunction · Geometric Aspects (30° per house)</p>
          <ul class="starchart-aspects-list">${clueItems}</ul>
        </div>
        <p class="almanac-footnote">
          Use the 12 zodiac houses above to calculate Mars and Saturn clockwise (+) or counter-clockwise (−) from Earth’s anchor.
        </p>
      `;
    }
  }

  starChartDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    starChartDialog.close('close-button');
  });
  starChartDialog.addEventListener('close', () => {
    starChartDialog.returnValue = '';
  });

  // =========================================================================
  // 3. TELESCOPE OPTICAL EYEPIECE DIALOG (True-coord 8-star sky, mode-aware!)
  // =========================================================================
  const eyepieceDialog = createDialog('modal-eyepiece', 'eyepiece-dialog-title');
  eyepieceDialog.innerHTML = `
    <div class="eyepiece-shell">
      <div class="eyepiece-close-wrap">
        <button type="button" class="modal-close-btn" data-close aria-label="Close Telescope Eyepiece">&times;</button>
      </div>
      <div class="eyepiece-housing">
        <div class="eyepiece-lens">
          <canvas class="eyepiece-canvas" width="540" height="540"></canvas>
          ${buildEyepieceReticleSVG()}
        </div>
      </div>
      <div class="eyepiece-status-plaque">
        <h2 id="eyepiece-dialog-title" class="eyepiece-status-title">Optical Eyepiece</h2>
        <p class="eyepiece-status-text" data-eyepiece-msg></p>
        <div class="eyepiece-triad-pills" data-eyepiece-triad hidden></div>
      </div>
    </div>
  `;

  const eyepieceCanvas = eyepieceDialog.querySelector<HTMLCanvasElement>('.eyepiece-canvas')!;
  const eyepieceTitleEl = eyepieceDialog.querySelector<HTMLElement>('#eyepiece-dialog-title')!;
  const eyepieceMsgEl = eyepieceDialog.querySelector<HTMLElement>('[data-eyepiece-msg]')!;
  const eyepieceTriadEl = eyepieceDialog.querySelector<HTMLElement>('[data-eyepiece-triad]')!;

  let eyepieceRafId = 0;
  let eyepieceAligned = false;

  interface StarDot {
    x: number;
    y: number;
    r: number;
    hue: string;
    phase: number;
    speed: number;
    alpha: number;
  }

  const bgStars: StarDot[] = Array.from({ length: 190 }, (_, idx) => {
    const angle = (idx * 2.399963) % (Math.PI * 2);
    const dist = Math.sqrt((idx + 0.5) / 190) * 0.48;
    const palette = ['#ffffff', '#cce2ff', '#ffe8be', '#b2d4ff', '#ffd9a8'];
    return {
      x: 0.5 + Math.cos(angle) * dist,
      y: 0.5 + Math.sin(angle) * dist,
      r: 0.6 + ((idx * 17) % 10) * 0.14,
      hue: palette[idx % palette.length],
      phase: idx * 0.73,
      speed: 1.1 + (idx % 5) * 0.45,
      alpha: 0.32 + ((idx * 13) % 10) * 0.055,
    };
  });

  function stopEyepieceAnimation(): void {
    if (eyepieceRafId) {
      window.cancelAnimationFrame(eyepieceRafId);
      eyepieceRafId = 0;
    }
  }

  function mapStarToCanvas(starId: string, w: number, h: number): { x: number; y: number } {
    const coord = CONSTELLATION_STAR_COORDS[starId] ?? { u: 0.5, v: 0.5 };
    return {
      x: w * (0.14 + coord.u * 0.72),
      y: h * (0.14 + coord.v * 0.72),
    };
  }

  function renderEyepieceFrame(nowMs: number): void {
    if (!eyepieceDialog.open) {
      stopEyepieceAnimation();
      return;
    }
    const ctx = eyepieceCanvas.getContext('2d');
    if (!ctx) return;

    const cfg = state.get().puzzleConfig;
    const w = eyepieceCanvas.width;
    const h = eyepieceCanvas.height;
    const t = nowMs * 0.001;

    // Deep space background radial gradient
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.04, w * 0.5, h * 0.5, w * 0.52);
    if (eyepieceAligned) {
      bg.addColorStop(0, '#0d1d3d');
      bg.addColorStop(0.55, '#061026');
      bg.addColorStop(1, '#02040b');
    } else {
      bg.addColorStop(0, '#091224');
      bg.addColorStop(0.6, '#050a16');
      bg.addColorStop(1, '#02040a');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle Milky Way nebula wisp
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(-0.55);
    const neb = ctx.createRadialGradient(0, 0, 12, 0, 0, w * 0.44);
    neb.addColorStop(0, eyepieceAligned ? 'rgba(98, 165, 255, 0.16)' : 'rgba(72, 118, 196, 0.09)');
    neb.addColorStop(0.5, 'rgba(130, 110, 210, 0.05)');
    neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.scale(1.35, 0.55);
    ctx.fillStyle = neb;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Background stars
    const driftX = eyepieceAligned ? 0 : Math.sin(t * 0.25) * 8;
    const driftY = eyepieceAligned ? 0 : Math.cos(t * 0.19) * 6;

    for (const s of bgStars) {
      const sx = s.x * w + driftX;
      const sy = s.y * h + driftY;
      const twinkle = 0.65 + 0.35 * Math.sin(t * s.speed + s.phase);
      const alpha = s.alpha * twinkle;

      if (eyepieceAligned) {
        ctx.fillStyle = s.hue;
        ctx.globalAlpha = alpha * 0.72;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const bokehR = s.r * 2.5 + 1.2;
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, bokehR);
        grad.addColorStop(0, s.hue);
        grad.addColorStop(0.45, 'rgba(170, 206, 255, 0.35)');
        grad.addColorStop(1, 'rgba(170, 206, 255, 0)');
        ctx.globalAlpha = alpha * 0.72;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, bokehR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Aligned: render all 8 Star Chart stars at true relative coordinates
    if (eyepieceAligned) {
      const targetIds = cfg.starChartSolution;
      const targetSet = new Set(targetIds);
      const targetPts = targetIds.map((id) => ({
        id,
        label: starLabel(id).toUpperCase(),
        ...mapStarToCanvas(id, w, h),
      }));

      // 1. Draw the non-target stars from the 8 as dim sapphire landmarks (so relative geometry is unmistakable!)
      for (const id of Object.keys(CONSTELLATION_STAR_COORDS)) {
        if (targetSet.has(id)) continue;
        const pt = mapStarToCanvas(id, w, h);
        const dimHalo = ctx.createRadialGradient(pt.x, pt.y, 0.5, pt.x, pt.y, 11);
        dimHalo.addColorStop(0, 'rgba(195, 220, 255, 0.75)');
        dimHalo.addColorStop(0.45, 'rgba(108, 152, 224, 0.25)');
        dimHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = dimHalo;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(215, 232, 255, 0.72)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Mode-specific constellation lines & sequential animation
      if (cfg.starChartOrderMatters) {
        // MASTER MODE: 5-star sequential pulse animation (1 -> 5) + moving golden beam!
        const stepDuration = 1.0;
        const holdDuration = 0.85;
        const cycleDuration = targetPts.length * stepDuration + holdDuration;
        const cycleT = t % cycleDuration;
        const activeFloat = Math.min(targetPts.length - 0.001, cycleT / stepDuration);
        const activeIdx = Math.min(targetPts.length - 1, Math.floor(cycleT / stepDuration));
        const withinStep = Math.min(1, (cycleT - activeIdx * stepDuration) / stepDuration);

        // Draw subtle faint full guide path
        ctx.save();
        ctx.strokeStyle = 'rgba(242, 213, 148, 0.16)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        targetPts.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.restore();

        // Draw luminous golden beam tracing 0 -> activeIdx smoothly
        if (cycleT < targetPts.length * stepDuration + holdDuration) {
          ctx.save();
          ctx.strokeStyle = 'rgba(245, 214, 134, 0.78)';
          ctx.lineWidth = 2.4;
          ctx.shadowColor = 'rgba(242, 198, 96, 0.85)';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(targetPts[0].x, targetPts[0].y);
          for (let i = 1; i <= activeIdx; i++) {
            const prev = targetPts[i - 1];
            const curr = targetPts[i];
            if (i < activeIdx || cycleT >= targetPts.length * stepDuration) {
              ctx.lineTo(curr.x, curr.y);
            } else {
              const prog = Math.min(1, withinStep * 1.45);
              ctx.lineTo(prev.x + (curr.x - prev.x) * prog, prev.y + (curr.y - prev.y) * prog);
            }
          }
          ctx.stroke();
          ctx.restore();
        }

        // Draw each target star with sequential flare + expanding golden pulse ring
        targetPts.forEach((star, idx) => {
          const isReached = idx <= activeIdx;
          const isCurrent = idx === activeIdx && cycleT < targetPts.length * stepDuration;
          const flare = isCurrent
            ? 1.0 + 0.55 * Math.sin(withinStep * Math.PI)
            : isReached
              ? 0.92
              : 0.55;

          const haloR = (isCurrent ? 38 : isReached ? 26 : 18) * flare;
          const halo = ctx.createRadialGradient(star.x, star.y, 1, star.x, star.y, haloR);
          halo.addColorStop(0, '#ffffff');
          halo.addColorStop(0.24, isCurrent ? '#ffe299' : '#7cc2ff');
          halo.addColorStop(0.58, isCurrent ? 'rgba(242, 200, 100, 0.24)' : 'rgba(104, 174, 255, 0.14)');
          halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(star.x, star.y, haloR, 0, Math.PI * 2);
          ctx.fill();

          if (isCurrent) {
            const ringR = 10 + withinStep * 28;
            ctx.save();
            ctx.strokeStyle = `rgba(250, 224, 150, ${(1 - withinStep) * 0.88})`;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(star.x, star.y, ringR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // 4-point optical diffraction spikes
          ctx.save();
          ctx.strokeStyle = isCurrent ? 'rgba(255, 250, 230, 0.95)' : 'rgba(220, 238, 255, 0.65)';
          ctx.lineWidth = isCurrent ? 1.5 : 1.0;
          const spikeLen = (isCurrent ? 22 : 14) * flare;
          ctx.beginPath();
          ctx.moveTo(star.x - spikeLen, star.y);
          ctx.lineTo(star.x + spikeLen, star.y);
          ctx.moveTo(star.x, star.y - spikeLen);
          ctx.lineTo(star.x, star.y + spikeLen);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = isCurrent ? '#fff8df' : '#e6f2ff';
          ctx.beginPath();
          ctx.arc(star.x, star.y, isCurrent ? 5.2 : 3.8, 0, Math.PI * 2);
          ctx.fill();
        });

        // Subtle pulse counter indicator (e.g. ● ● ● ○ ○) near top of lens without spoiling names
        const activeDots = Math.min(targetPts.length, Math.floor(activeFloat) + 1);
        ctx.save();
        const dotGap = 14;
        const startX = w * 0.5 - ((targetPts.length - 1) * dotGap) / 2;
        for (let i = 0; i < targetPts.length; i++) {
          ctx.fillStyle = i < activeDots ? '#f6df9e' : 'rgba(242, 213, 148, 0.25)';
          ctx.beginPath();
          ctx.arc(startX + i * dotGap, 60, i === activeIdx ? 3.5 : 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else {
        // APPRENTICE (3-star named) & SCHOLAR (4-star unlabeled shape)
        const pulse = 0.82 + 0.18 * Math.sin(t * 2.1);
        ctx.save();
        ctx.strokeStyle = `rgba(242, 213, 148, ${0.55 * pulse})`;
        ctx.lineWidth = 2.1;
        ctx.shadowColor = 'rgba(116, 184, 255, 0.78)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        targetPts.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = `rgba(110, 178, 255, ${0.07 * pulse})`;
        ctx.fill();
        ctx.restore();

        targetPts.forEach((star, i) => {
          const starPulse = 0.88 + 0.12 * Math.sin(t * 2.8 + i * 1.9);
          const halo = ctx.createRadialGradient(star.x, star.y, 1, star.x, star.y, 32 * starPulse);
          halo.addColorStop(0, '#ffffff');
          halo.addColorStop(0.24, i % 2 === 0 ? '#7cc2ff' : '#f2d085');
          halo.addColorStop(0.56, 'rgba(104, 174, 255, 0.16)');
          halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(star.x, star.y, 32 * starPulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.strokeStyle = 'rgba(255, 250, 236, 0.84)';
          ctx.lineWidth = 1.25;
          const spikeLen = 20 * starPulse;
          ctx.beginPath();
          ctx.moveTo(star.x - spikeLen, star.y);
          ctx.lineTo(star.x + spikeLen, star.y);
          ctx.moveTo(star.x, star.y - spikeLen);
          ctx.lineTo(star.x, star.y + spikeLen);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#f2f7ff';
          ctx.beginPath();
          ctx.arc(star.x, star.y, 4.3, 0, Math.PI * 2);
          ctx.fill();

          if (cfg.eyepieceShowNames) {
            ctx.save();
            ctx.font = '600 13px "Cinzel", Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f6df9e';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.94)';
            ctx.shadowBlur = 6;
            const offsetY = star.y < h * 0.35 ? -20 : 28;
            ctx.fillText(star.label, star.x, star.y + offsetY);
            ctx.restore();
          }
        });
      }

      // 3. On Master mode, engrave AZIMUTH TARGET along the lower brass optical reticle rim!
      if (cfg.difficulty === 'master') {
        ctx.save();
        const badgeText = `AZIMUTH TARGET: ${cfg.doorAzimuthDegrees}° (${cfg.doorAzimuthLabel})`;
        ctx.font = '700 12px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        const textW = ctx.measureText(badgeText).width;
        const bx = w * 0.5 - textW * 0.5 - 14;
        const by = h - 78;
        ctx.fillStyle = 'rgba(10, 14, 24, 0.84)';
        ctx.strokeStyle = 'rgba(242, 213, 148, 0.72)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(bx, by, textW + 28, 26, 13);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8e09e';
        ctx.fillText(badgeText, w * 0.5, by + 17);
        ctx.restore();
      }
    }

    // Subtle chromatic aberration rim + circular vignette
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.34, w * 0.5, h * 0.5, w * 0.5);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.84, 'rgba(2, 6, 16, 0.42)');
    vignette.addColorStop(0.95, 'rgba(42, 92, 185, 0.22)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.92)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    eyepieceRafId = window.requestAnimationFrame(renderEyepieceFrame);
  }

  eyepieceDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    eyepieceDialog.close('close-button');
  });
  eyepieceDialog.addEventListener('close', () => {
    stopEyepieceAnimation();
    eyepieceDialog.returnValue = '';
  });

  // =========================================================================
  // 4. PROGRESSIVE HINT JOURNAL & DETECTIVE'S CLUE NOTEBOOK DIALOG
  // =========================================================================
  const hintDialog = createDialog('modal-hints', 'hints-dialog-title');
  hintDialog.innerHTML = `
    <div class="dossier-shell">
      <button type="button" class="modal-close-btn" data-close aria-label="Close Observatory Journal">&times;</button>
      <p class="dossier-kicker">Detective's Field Dossier &amp; Hints</p>
      <h2 id="hints-dialog-title" class="dossier-title">Observatory Journal</h2>
      <div class="hint-progress-grid" data-hint-progress></div>
      <div class="clue-notebook-section">
        <p class="hint-section-label">Discovered Clues</p>
        <div class="clue-notebook-list" data-clue-notebook></div>
      </div>
      <div data-hint-body></div>
      <div class="hint-footer">
        <span class="hint-count-meta" data-hint-count></span>
        <button type="button" class="btn-brass-secondary" data-reveal-hint>
          Reveal Next Specific Clue
        </button>
      </div>
    </div>
  `;

  const hintProgressEl = hintDialog.querySelector<HTMLElement>('[data-hint-progress]')!;
  const clueNotebookEl = hintDialog.querySelector<HTMLElement>('[data-clue-notebook]')!;
  const hintBodyEl = hintDialog.querySelector<HTMLElement>('[data-hint-body]')!;
  const hintCountEl = hintDialog.querySelector<HTMLElement>('[data-hint-count]')!;
  const revealHintBtn = hintDialog.querySelector<HTMLButtonElement>('[data-reveal-hint]')!;

  function renderDiscoveredClues(snap: Readonly<GameStateSnapshot>): void {
    const cfg = snap.puzzleConfig;
    const clues: Array<{ source: string; detail: string }> = [];

    if (snap.hasReadLogbook) {
      clues.push({
        source: 'Observatory Logbook · East Desk',
        detail: `${cfg.lunarClues.heading}: ${cfg.lunarClues.lines.join(' ')} — Telescope: ${cfg.telescopeClueText}`,
      });
    }

    if (snap.hasViewedAlmanac || snap.solved.lunar_box) {
      clues.push({
        source: 'Framed Lunar Almanac · SW Wall',
        detail: cfg.lunarClues.showAlmanacMarks
          ? 'Four crimson-encircled lunar phases: I. Waxing Crescent → II. Full Moon → III. Waning Gibbous → IV. New Moon.'
          : 'Unmarked Synodic Ephemeris (Day 0–25) arranging all 8 lunar phases clockwise from New Moon.',
      });
    }

    if (snap.solved.telescope) {
      const raStr = String(cfg.telescopeTargetRA).padStart(2, '0');
      if (cfg.eyepieceShowNames) {
        const names = cfg.starChartSolution.map((s) => starLabel(s).toUpperCase()).join(', ');
        clues.push({
          source: 'Telescope Eyepiece · Triad of the North',
          detail: `Aligned at RA ${raStr}h / DEC +${cfg.telescopeTargetDEC}° — luminous constellation connecting ${names}.`,
        });
      } else if (cfg.starChartOrderMatters) {
        clues.push({
          source: 'Telescope Eyepiece · Master Sighting',
          detail: `Aligned at RA ${raStr}h / DEC +${cfg.telescopeTargetDEC}° — 5 unlabeled stars pulse sequentially (1 → 5). Engraved Azimuth Target: ${cfg.doorAzimuthDegrees}° (${cfg.doorAzimuthLabel}).`,
        });
      } else {
        clues.push({
          source: 'Telescope Eyepiece · 4-Star Pattern',
          detail: `Aligned at RA ${raStr}h / DEC +${cfg.telescopeTargetDEC}° — unlabeled 4-star constellation geometry observed. Match its shape onto the West Star Table.`,
        });
      }
    } else if (snap.hasLookedThroughTelescope) {
      clues.push({
        source: 'Telescope Eyepiece · Field Sighting',
        detail:
          'Starfield still out of alignment — adjust the RA & DEC vernier wheels to match Dr. Vance’s Logbook coordinates.',
      });
    }

    if (snap.hasViewedStarChart || snap.solved.orrery) {
      clues.push({
        source: 'Framed Celestial Star Chart · SE Wall',
        detail: cfg.starChartShowDirectAnswer
          ? `The Great Conjunction: EARTH → ${ZODIAC_NAMES[cfg.orrerySolution.earth]} · MARS → ${ZODIAC_NAMES[cfg.orrerySolution.mars]} · SATURN → ${ZODIAC_NAMES[cfg.orrerySolution.saturn]}.`
          : cfg.orreryClueLines.join(' · '),
      });
    }

    if (clues.length === 0) {
      clueNotebookEl.innerHTML = `
        <div class="clue-notebook-empty">
          No field notes recorded yet — begin at Dr. Vance's open Logbook on the East writing desk to your right.
        </div>
      `;
      return;
    }

    clueNotebookEl.innerHTML = clues
      .map(
        (c) => `
          <div class="clue-entry-card">
            <span class="clue-entry-source">${c.source}</span>
            <span class="clue-entry-detail">${c.detail}</span>
          </div>
        `
      )
      .join('');
  }

  function renderHintJournal(): void {
    const snap = state.get();
    const cfg = snap.puzzleConfig;
    const active = getActiveHintData(snap);

    renderDiscoveredClues(snap);

    hintProgressEl.innerHTML = PUZZLE_META.map((item) => {
      const solved = snap.solved[item.id];
      const isCurrent = active?.puzzleId === item.id;
      const cls = solved ? 'is-solved' : isCurrent ? 'is-current' : '';
      const mark = solved ? '★' : isCurrent ? '◈' : '○';
      return `<div class="hint-step-chip ${cls}">${mark} ${item.short}</div>`;
    }).join('');

    const maxHints = cfg.maxHints;
    const remaining = maxHints !== null ? Math.max(0, maxHints - snap.hintsUsed) : null;
    hintCountEl.textContent =
      remaining !== null
        ? `Hints remaining: ${remaining} / ${maxHints}`
        : `Specific clues revealed: ${snap.hintsUsed}`;

    if (!active) {
      hintBodyEl.innerHTML = `
        <p class="hint-section-label">All Seals Unbound</p>
        <div class="hint-card">
          Every celestial mechanism in Dr. Vance's observatory is aligned and the Astrolabe Door stands open onto the moonlit balcony!
        </div>
      `;
      revealHintBtn.disabled = true;
      revealHintBtn.textContent = 'All Mysteries Solved';
      return;
    }

    const depth = revealedHintDepth[active.puzzleId] ?? 0;
    const revealedCards = active.clues
      .slice(0, depth)
      .map(
        (clue, idx) => `
          <p class="hint-section-label">Specific Clue ${idx + 1}</p>
          <div class="hint-card is-specific">${clue}</div>
        `
      )
      .join('');

    hintBodyEl.innerHTML = `
      <p class="hint-section-label">${active.title} — Gentle Nudge</p>
      <div class="hint-card">${active.gentle}</div>
      ${revealedCards}
    `;

    const hasMore = depth < active.clues.length;
    const exhausted = remaining !== null && remaining <= 0;
    revealHintBtn.disabled = !hasMore || exhausted;
    revealHintBtn.textContent = exhausted
      ? 'No Hint Tokens Remaining'
      : hasMore
        ? depth === 0
          ? 'Reveal Next Specific Clue'
          : 'Reveal Exact Solution'
        : 'Full Solution Revealed';
  }

  revealHintBtn.addEventListener('click', () => {
    const snap = state.get();
    const maxHints = snap.puzzleConfig.maxHints;
    if (maxHints !== null && snap.hintsUsed >= maxHints) return;
    const active = getActiveHintData(snap);
    if (!active) return;
    const currentDepth = revealedHintDepth[active.puzzleId] ?? 0;
    if (currentDepth >= active.clues.length) return;
    revealedHintDepth[active.puzzleId] = currentDepth + 1;
    state.incrementHints();
    audio.playClick();
    renderHintJournal();
  });

  hintDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    hintDialog.close('close-button');
  });
  hintDialog.addEventListener('close', () => {
    hintDialog.returnValue = '';
  });

  // =========================================================================
  // 5. VICTORY ESCAPE CERTIFICATE DIALOG (Tier Badge + Midnight Ribbon + Next Tier)
  // =========================================================================
  const victoryDialog = createDialog('modal-victory', 'victory-dialog-title');
  victoryDialog.innerHTML = `
    <div class="victory-shell">
      <button type="button" class="modal-close-btn" data-close aria-label="Close Victory Certificate">&times;</button>
      <svg class="victory-crest" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="27" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="32" cy="32" r="21" stroke="currentColor" stroke-width="0.9" stroke-dasharray="3 3"/>
        <circle cx="32" cy="32" r="10" stroke="currentColor" stroke-width="1.4"/>
        <path d="M32 3V61M3 32H61M12 12L52 52M52 12L12 52" stroke="currentColor" stroke-width="0.9" opacity="0.65"/>
        <polygon points="32,14 35.5,28.5 50,32 35.5,35.5 32,50 28.5,35.5 14,32 28.5,28.5" fill="currentColor" opacity="0.9"/>
      </svg>
      <p class="victory-kicker">Royal Observatory · Certificate of Celestial Mastery</p>
      <h2 id="victory-dialog-title" class="victory-title">The Chamber Is Unsealed</h2>
      <div class="victory-badges-row">
        <span class="victory-tier-badge" data-victory-tier>Apprentice</span>
        <span class="victory-midnight-ribbon" data-victory-midnight hidden>★ Midnight Conjunction Beaten ★</span>
      </div>
      <p class="victory-prose">
        With the Great Conjunction aligned and the Astrolabe Seal unbound, the oak doors swing wide
        onto the silver-lit midnight terrace. You have mastered Dr. Alistair Vance's 1898 Observatory.
      </p>
      <div class="victory-stats">
        <div class="victory-stat-box">
          <span class="victory-stat-value" data-victory-time>00:00</span>
          <span class="victory-stat-label">Escape Time</span>
        </div>
        <div class="victory-stat-box">
          <span class="victory-stat-value">5 / 5</span>
          <span class="victory-stat-label">Puzzles Solved</span>
        </div>
        <div class="victory-stat-box">
          <span class="victory-stat-value" data-victory-hints>0</span>
          <span class="victory-stat-label">Hints Used</span>
        </div>
      </div>
      <div class="victory-actions">
        <button type="button" class="btn-brass-secondary" data-explore-btn>Admire the Balcony</button>
        <button type="button" class="btn-brass-secondary" data-play-again-btn>Play Again</button>
        <button type="button" class="btn-brass-primary" data-next-tier-btn>Try Scholar</button>
      </div>
    </div>
  `;

  const victoryTimeEl = victoryDialog.querySelector<HTMLElement>('[data-victory-time]')!;
  const victoryHintsEl = victoryDialog.querySelector<HTMLElement>('[data-victory-hints]')!;
  const victoryTierEl = victoryDialog.querySelector<HTMLElement>('[data-victory-tier]')!;
  const victoryMidnightEl = victoryDialog.querySelector<HTMLElement>('[data-victory-midnight]')!;
  const nextTierBtn = victoryDialog.querySelector<HTMLButtonElement>('[data-next-tier-btn]')!;

  let nextTierTarget: { mode: DifficultyMode; timed: boolean } | null = null;

  victoryDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    victoryDialog.close('close-button');
  });
  victoryDialog.querySelector('[data-explore-btn]')?.addEventListener('click', () => {
    audio.playClick();
    victoryDialog.close('explore');
  });
  victoryDialog.querySelector('[data-play-again-btn]')?.addEventListener('click', () => {
    audio.playClick();
    victoryDialog.close('play-again');
  });
  nextTierBtn.addEventListener('click', () => {
    audio.playClick();
    victoryDialog.close('next-tier');
  });
  victoryDialog.addEventListener('close', () => {
    const val = victoryDialog.returnValue;
    victoryDialog.returnValue = '';
    if (val === 'play-again') {
      resetHintsProgress();
      onResetGame();
    } else if (val === 'next-tier' && nextTierTarget) {
      resetHintsProgress();
      if (onStartDifficulty) {
        onStartDifficulty(nextTierTarget.mode, nextTierTarget.timed);
      } else {
        state.configureRun(nextTierTarget.mode, nextTierTarget.timed);
        onResetGame();
      }
    }
  });

  // =========================================================================
  // 6. MIDNIGHT HAS STRUCK — COUNTDOWN EXPIRATION DIALOG
  // =========================================================================
  const timeoutDialog = createDialog('modal-timeout', 'timeout-dialog-title');
  timeoutDialog.innerHTML = `
    <div class="timeout-shell">
      <button type="button" class="modal-close-btn" data-close aria-label="Close Midnight Notice">&times;</button>
      <p class="timeout-kicker">Royal Observatory · 12:00 AM</p>
      <h2 id="timeout-dialog-title" class="timeout-title">Midnight Has Struck</h2>
      <p class="timeout-prose">
        Twelve chimes echo across the alpine summit as the Great Conjunction passes overhead.
        Will you attempt a fresh Master reckoning, or continue exploring untimed?
      </p>
      <div class="victory-actions">
        <button type="button" class="btn-brass-secondary" data-continue-untimed-btn>Continue Untimed</button>
        <button type="button" class="btn-brass-primary" data-retry-master-btn>Retry Master Chamber</button>
      </div>
    </div>
  `;

  timeoutDialog.querySelector('[data-close]')?.addEventListener('click', () => {
    audio.playClick();
    timeoutDialog.close('continue-untimed');
  });
  timeoutDialog.querySelector('[data-continue-untimed-btn]')?.addEventListener('click', () => {
    audio.playClick();
    timeoutDialog.close('continue-untimed');
  });
  timeoutDialog.querySelector('[data-retry-master-btn]')?.addEventListener('click', () => {
    audio.playClick();
    timeoutDialog.close('retry-master');
  });
  timeoutDialog.addEventListener('close', () => {
    const val = timeoutDialog.returnValue;
    timeoutDialog.returnValue = '';
    if (val === 'retry-master') {
      resetHintsProgress();
      if (onStartDifficulty) {
        onStartDifficulty('master', true);
      } else {
        state.configureRun('master', true);
        onResetGame();
      }
    } else if (val !== 'replaced' && val !== 'dispose') {
      state.continueUntimed();
    }
  });

  const allDialogs: HTMLDialogElement[] = [
    logbookDialog,
    almanacDialog,
    starChartDialog,
    eyepieceDialog,
    hintDialog,
    victoryDialog,
    timeoutDialog,
  ];

  function closeOtherDialogs(except?: HTMLDialogElement): void {
    for (const dlg of allDialogs) {
      if (dlg !== except && dlg.open) {
        dlg.close('replaced');
      }
    }
  }

  function openLogbook(): void {
    closeOtherDialogs(logbookDialog);
    if (!state.get().hasReadLogbook) {
      state.update((draft) => {
        draft.hasReadLogbook = true;
      });
    }
    renderLogbookContent();
    audio.playClick();
    if (!logbookDialog.open) logbookDialog.showModal();
  }

  function openAlmanac(): void {
    closeOtherDialogs(almanacDialog);
    if (!state.get().hasViewedAlmanac) {
      state.update((draft) => {
        draft.hasViewedAlmanac = true;
      });
    }
    renderAlmanacContent();
    audio.playClick();
    if (!almanacDialog.open) almanacDialog.showModal();
  }

  function openStarChart(): void {
    closeOtherDialogs(starChartDialog);
    if (!state.get().hasViewedStarChart) {
      state.update((draft) => {
        draft.hasViewedStarChart = true;
      });
    }
    renderStarChartContent();
    audio.playClick();
    if (!starChartDialog.open) starChartDialog.showModal();
  }

  function openTelescopeEyepiece(aligned: boolean): void {
    closeOtherDialogs(eyepieceDialog);
    if (!state.get().hasLookedThroughTelescope) {
      state.update((draft) => {
        draft.hasLookedThroughTelescope = true;
      });
    }
    eyepieceAligned = aligned;
    const snap = state.get();
    const cfg = snap.puzzleConfig;
    const raStr = String(snap.telescopeRA).padStart(2, '0');

    if (aligned) {
      if (cfg.eyepieceShowNames) {
        eyepieceTitleEl.textContent = 'Celestial Lock — The Triad of the North';
        eyepieceMsgEl.textContent = `RA ${raStr}h / DEC +${snap.telescopeDEC}° — Three brilliant stars lock into a luminous triangle. Trace them upon the Backlit Star Table.`;
        eyepieceTriadEl.innerHTML = cfg.starChartSolution
          .map((id) => `<span class="triad-pill">${starLabel(id).toUpperCase()}</span>`)
          .join('');
        eyepieceTriadEl.hidden = false;
      } else if (cfg.starChartOrderMatters) {
        eyepieceTitleEl.textContent = `Master Sighting — RA ${raStr}h / DEC +${snap.telescopeDEC}°`;
        eyepieceMsgEl.textContent = `Watch the 5 bright stars pulse in exact sequence (1 → 5) and trace them in order on the Backlit Star Table. Note the engraved Azimuth Target (${cfg.doorAzimuthDegrees}° ${cfg.doorAzimuthLabel}) for the Exit Seal.`;
        eyepieceTriadEl.innerHTML = '';
        eyepieceTriadEl.hidden = true;
      } else {
        eyepieceTitleEl.textContent = `Celestial Lock — RA ${raStr}h / DEC +${snap.telescopeDEC}°`;
        eyepieceMsgEl.textContent =
          'Four luminous stars form a distinct geometric pattern. Visually match their positions onto the Backlit Star Table (West).';
        eyepieceTriadEl.innerHTML = '';
        eyepieceTriadEl.hidden = true;
      }
    } else {
      eyepieceTitleEl.textContent = `Optical Field — RA ${raStr}h / DEC +${snap.telescopeDEC}°`;
      eyepieceMsgEl.textContent =
        'Out of target alignment — adjust the Telescope RA & DEC dials (hint: consult Dr. Vance’s Logbook).';
      eyepieceTriadEl.innerHTML = '';
      eyepieceTriadEl.hidden = true;
    }

    audio.playClick();
    if (!eyepieceDialog.open) eyepieceDialog.showModal();
    stopEyepieceAnimation();
    eyepieceRafId = window.requestAnimationFrame(renderEyepieceFrame);
  }

  function openHintJournal(): void {
    closeOtherDialogs(hintDialog);
    renderHintJournal();
    audio.playClick();
    if (!hintDialog.open) hintDialog.showModal();
  }

  function openTimeoutDialog(): void {
    closeOtherDialogs(timeoutDialog);
    if (!timeoutDialog.open) timeoutDialog.showModal();
  }

  function showVictory(elapsedSeconds: number, hintsUsed: number): void {
    closeOtherDialogs(victoryDialog);
    const snap = state.get();
    const diff = snap.difficulty;
    const maxHints = snap.puzzleConfig.maxHints;

    victoryTimeEl.textContent = formatTime(elapsedSeconds);
    victoryHintsEl.textContent = maxHints !== null ? `${hintsUsed} / ${maxHints}` : String(hintsUsed);

    victoryTierEl.textContent = DIFFICULTY_LABELS[diff];
    victoryTierEl.classList.toggle('is-scholar', diff === 'scholar');
    victoryTierEl.classList.toggle('is-master', diff === 'master');

    victoryMidnightEl.hidden = !(snap.timedMode && !snap.timeExpired);

    if (diff === 'apprentice') {
      nextTierTarget = { mode: 'scholar', timed: false };
      nextTierBtn.textContent = 'Try Scholar';
      nextTierBtn.hidden = false;
    } else if (diff === 'scholar') {
      nextTierTarget = { mode: 'master', timed: false };
      nextTierBtn.textContent = 'Try Master Astronomer';
      nextTierBtn.hidden = false;
    } else if (!snap.timedMode) {
      nextTierTarget = { mode: 'master', timed: true };
      nextTierBtn.textContent = 'Try Timed Master';
      nextTierBtn.hidden = false;
    } else {
      nextTierTarget = { mode: 'master', timed: true };
      nextTierBtn.textContent = 'New Seeded Master';
      nextTierBtn.hidden = false;
    }

    if (!victoryDialog.open) victoryDialog.showModal();
  }

  function isAnyOpen(): boolean {
    return allDialogs.some((d) => d.open);
  }

  function resetHintsProgress(): void {
    for (const key of Object.keys(revealedHintDepth) as PuzzleId[]) {
      delete revealedHintDepth[key];
    }
  }

  function dispose(): void {
    stopEyepieceAnimation();
    for (const dlg of allDialogs) {
      if (dlg.open) dlg.close('dispose');
      dlg.remove();
    }
  }

  return {
    openLogbook,
    openAlmanac,
    openStarChart,
    openTelescopeEyepiece,
    openHintJournal,
    openTimeoutDialog,
    showVictory,
    isAnyOpen,
    resetHintsProgress,
    dispose,
  };
}

function buildCelestialStarChartSVG(
  solution: { earth: number; mars: number; saturn: number },
  earthAnchor: number,
  showDirectAnswer: boolean
): string {
  const cx = 280;
  const cy = 230;
  const outerR = 164;
  const innerR = 128;

  const houses = ZODIAC_NAMES.map((name, idx) => {
    let planet: string | undefined;
    let planetOrbit: number | undefined;
    let planetColor: string | undefined;

    if (showDirectAnswer) {
      if (idx === solution.earth) {
        planet = 'EARTH';
        planetOrbit = 74;
        planetColor = '#5daeff';
      } else if (idx === solution.mars) {
        planet = 'MARS';
        planetOrbit = 100;
        planetColor = '#e07a5f';
      } else if (idx === solution.saturn) {
        planet = 'SATURN';
        planetOrbit = 124;
        planetColor = '#f2d085';
      }
    } else if (idx === earthAnchor) {
      planet = 'EARTH';
      planetOrbit = 82;
      planetColor = '#5daeff';
    }

    return { name: name.toUpperCase(), planet, planetOrbit, planetColor };
  });

  const ticks: string[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const isMajor = deg % 30 === 0;
    const rad = ((deg - 90) * Math.PI) / 180;
    const r1 = isMajor ? outerR - 11 : outerR - 5;
    const x1 = cx + Math.cos(rad) * r1;
    const y1 = cy + Math.sin(rad) * r1;
    const x2 = cx + Math.cos(rad) * outerR;
    const y2 = cy + Math.sin(rad) * outerR;
    ticks.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(212,175,106,${isMajor ? '0.68' : '0.26'})" stroke-width="${isMajor ? '1.3' : '0.8'}"/>`
    );
  }

  const starDots: string[] = [];
  for (let i = 0; i < 64; i++) {
    const ang = (i * 2.399963) % (Math.PI * 2);
    const dist = 26 + Math.sqrt((i + 1) / 64) * (innerR - 30);
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang) * dist;
    const sr = 0.8 + (i % 3) * 0.45;
    starDots.push(
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(1)}" fill="#e6f0ff" opacity="${(0.32 + (i % 5) * 0.12).toFixed(2)}"/>`
    );
  }

  const houseNodes = houses
    .map((h, idx) => {
      const angleDeg = idx * 30 - 90;
      const rad = (angleDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const isHighlighted = Boolean(h.planet);

      const spokeX = cx + cos * outerR;
      const spokeY = cy + sin * outerR;

      let anchor: 'start' | 'middle' | 'end' = 'middle';
      let labelR = outerR + 22;
      let dy = 4;
      if (cos > 0.25) {
        anchor = 'start';
        labelR = outerR + 18;
      } else if (cos < -0.25) {
        anchor = 'end';
        labelR = outerR + 18;
      } else if (sin < 0) {
        labelR = outerR + 20;
        dy = 0;
      } else {
        labelR = outerR + 26;
        dy = 4;
      }
      const lx = cx + cos * labelR;
      const ly = cy + sin * labelR + dy;

      let conjunctionMarkup = '';
      if (h.planet && h.planetOrbit) {
        const px = cx + cos * h.planetOrbit;
        const py = cy + sin * h.planetOrbit;
        const tagOffsetX = Math.abs(cos) < 0.2 ? 18 : cos > 0 ? -10 : 10;
        const tagOffsetY = Math.abs(cos) < 0.2 ? 4 : sin > 0 ? 22 : -15;
        const saturnRing =
          h.planet === 'SATURN'
            ? `<ellipse cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" rx="12" ry="4" transform="rotate(-24 ${px.toFixed(1)} ${py.toFixed(1)})" fill="none" stroke="#f6df9e" stroke-width="1.4"/>`
            : '';

        conjunctionMarkup = `
          <line x1="${cx}" y1="${cy}" x2="${spokeX.toFixed(1)}" y2="${spokeY.toFixed(1)}" stroke="#d9594c" stroke-width="1.8" stroke-dasharray="5 3" opacity="0.9"/>
          <circle cx="${spokeX.toFixed(1)}" cy="${spokeY.toFixed(1)}" r="5" fill="#8f2620" stroke="#f6df9e" stroke-width="1.3"/>
          <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="10.5" fill="rgba(217,89,76,0.22)" stroke="#f6df9e" stroke-width="1.1"/>
          <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="6" fill="${h.planetColor}" stroke="#fff5dc" stroke-width="1"/>
          ${saturnRing}
          <text
            x="${(px + tagOffsetX).toFixed(1)}"
            y="${(py + tagOffsetY).toFixed(1)}"
            text-anchor="${Math.abs(cos) < 0.2 ? 'start' : 'middle'}"
            font-family="Cinzel, serif"
            font-size="10.5"
            font-weight="700"
            letter-spacing="1.2"
            fill="#fae3a8"
          >${h.planet}</text>
        `;
      }

      // Degree tick label inside outer ring on Scholar/Master for easy angle arithmetic
      const degLabel = !showDirectAnswer
        ? `<text x="${(cx + cos * (outerR - 22)).toFixed(1)}" y="${(cy + sin * (outerR - 22) + 3).toFixed(1)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="8.5" fill="rgba(212,175,106,0.58)">${idx * 30}°</text>`
        : '';

      return `
        <g>
          <line x1="${cx}" y1="${cy}" x2="${spokeX.toFixed(1)}" y2="${spokeY.toFixed(1)}" stroke="rgba(212,175,106,${isHighlighted ? '0.45' : '0.16'})" stroke-width="${isHighlighted ? '1.1' : '0.8'}"/>
          ${degLabel}
          ${conjunctionMarkup}
          <text
            x="${lx.toFixed(1)}"
            y="${ly.toFixed(1)}"
            text-anchor="${anchor}"
            font-family="Cinzel, serif"
            font-size="${isHighlighted ? '12' : '10'}"
            font-weight="${isHighlighted ? '700' : '500'}"
            letter-spacing="1.2"
            fill="${isHighlighted ? '#f6df9e' : 'rgba(244,236,220,0.68)'}"
          >${h.name}</text>
        </g>
      `;
    })
    .join('');

  return `
    <svg class="starchart-plate-svg" viewBox="0 0 560 460" role="img" aria-label="Celestial Star Chart showing the 12 zodiac houses and Great Conjunction reference">
      <defs>
        <radialGradient id="starChartSphere" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#192d54"/>
          <stop offset="68%" stop-color="#0b152a"/>
          <stop offset="100%" stop-color="#060b17"/>
        </radialGradient>
        <radialGradient id="sunCoreGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#fff8d6"/>
          <stop offset="55%" stop-color="#f2c45a"/>
          <stop offset="100%" stop-color="#b87e24"/>
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="url(#starChartSphere)" stroke="#d4af6a" stroke-width="1.8"/>
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="rgba(212,175,106,0.34)" stroke-width="1" stroke-dasharray="4 4"/>
      <circle cx="${cx}" cy="${cy}" r="100" fill="none" stroke="rgba(212,175,106,0.24)" stroke-width="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="74" fill="none" stroke="rgba(212,175,106,0.24)" stroke-width="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="rgba(212,175,106,0.2)" stroke-width="0.8"/>
      ${starDots.join('')}
      ${ticks.join('')}
      ${houseNodes}
      <circle cx="${cx}" cy="${cy}" r="15" fill="url(#sunCoreGrad)" stroke="#fff3c4" stroke-width="1.2"/>
      <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-family="Cinzel, serif" font-size="8.5" font-weight="700" fill="#231608">SOL</text>
    </svg>
  `;
}

function buildLunarAlmanacSVG(showMarks: boolean): string {
  const cx = 280;
  const cy = 245;
  const ringR = 138;
  const badgeR = 94;
  const phases: Array<{
    name: string;
    angleDeg: number;
    mark?: string;
    litPath: string;
    anchor: 'start' | 'middle' | 'end';
    labelR: number;
    dx?: number;
    dy?: number;
  }> = [
    {
      name: 'New Moon',
      angleDeg: -90,
      mark: 'IV',
      litPath: '',
      anchor: 'middle',
      labelR: ringR + 38,
      dy: 2,
    },
    {
      name: 'Waxing Crescent',
      angleDeg: -45,
      mark: 'I',
      litPath: 'M 0,-18 A 18,18 0 0,1 0,18 A 9,18 0 0,0 0,-18 Z',
      anchor: 'start',
      labelR: ringR + 36,
      dx: 4,
      dy: 0,
    },
    {
      name: 'First Quarter',
      angleDeg: 0,
      litPath: 'M 0,-18 A 18,18 0 0,1 0,18 Z',
      anchor: 'start',
      labelR: ringR + 30,
      dx: 2,
      dy: 4,
    },
    {
      name: 'Waxing Gibbous',
      angleDeg: 45,
      litPath: 'M 0,-18 A 18,18 0 0,1 0,18 A 9,18 0 0,1 0,-18 Z',
      anchor: 'start',
      labelR: ringR + 36,
      dx: 4,
      dy: 8,
    },
    {
      name: 'Full Moon',
      angleDeg: 90,
      mark: 'II',
      litPath: 'M 0,-18 A 18,18 0 1,1 0,18 A 18,18 0 1,1 0,-18 Z',
      anchor: 'middle',
      labelR: ringR + 44,
      dy: 2,
    },
    {
      name: 'Waning Gibbous',
      angleDeg: 135,
      mark: 'III',
      litPath: 'M 0,-18 A 18,18 0 0,0 0,18 A 9,18 0 0,0 0,-18 Z',
      anchor: 'end',
      labelR: ringR + 36,
      dx: -4,
      dy: 8,
    },
    {
      name: 'Last Quarter',
      angleDeg: 180,
      litPath: 'M 0,-18 A 18,18 0 0,0 0,18 Z',
      anchor: 'end',
      labelR: ringR + 30,
      dx: -2,
      dy: 4,
    },
    {
      name: 'Waning Crescent',
      angleDeg: 225,
      litPath: 'M 0,-18 A 18,18 0 0,0 0,18 A 9,18 0 0,1 0,-18 Z',
      anchor: 'end',
      labelR: ringR + 36,
      dx: -4,
      dy: 0,
    },
  ];

  const nodes = phases
    .map((p, idx) => {
      const rad = (p.angleDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const x = cx + cos * ringR;
      const y = cy + sin * ringR;
      const bx = cx + cos * badgeR;
      const by = cy + sin * badgeR;
      const lx = cx + cos * p.labelR + (p.dx ?? 0);
      const ly = cy + sin * p.labelR + (p.dy ?? 0);
      const isMarked = showMarks && Boolean(p.mark);

      const innerAnnotation = isMarked
        ? `
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="25" fill="none" stroke="#d9594c" stroke-width="2" stroke-dasharray="4 2"/>
          <line x1="${(cx + cos * (badgeR + 11)).toFixed(1)}" y1="${(cy + sin * (badgeR + 11)).toFixed(1)}" x2="${(cx + cos * (ringR - 25)).toFixed(1)}" y2="${(cy + sin * (ringR - 25)).toFixed(1)}" stroke="#d9594c" stroke-width="1.3"/>
          <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="12" fill="#8f2620" stroke="#f2d594" stroke-width="1.3"/>
          <text x="${bx.toFixed(1)}" y="${(by + 3.8).toFixed(1)}" text-anchor="middle" font-family="Cinzel, serif" font-size="10.5" font-weight="700" fill="#fff3d4">${p.mark}</text>
        `
        : !showMarks
          ? `
            <text x="${bx.toFixed(1)}" y="${(by + 3.5).toFixed(1)}" text-anchor="middle" font-family="Cinzel, serif" font-size="9.5" fill="rgba(212,175,106,0.72)">${SYNODIC_DAYS[idx]}</text>
          `
          : '';

      return `
        <g>
          <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(212,175,106,0.22)" stroke-width="0.9"/>
          ${innerAnnotation}
          <g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">
            <circle r="18" fill="#10182b" stroke="#d4af6a" stroke-width="1.35"/>
            ${p.litPath ? `<path d="${p.litPath}" fill="#f4e6bf"/>` : ''}
          </g>
          <text
            x="${lx.toFixed(1)}"
            y="${ly.toFixed(1)}"
            text-anchor="${p.anchor}"
            font-family="Cormorant Garamond, serif"
            font-size="14"
            font-weight="${isMarked ? '700' : '500'}"
            fill="${isMarked ? '#f6df9e' : 'rgba(244,236,220,0.84)'}"
          >${p.name}</text>
        </g>
      `;
    })
    .join('');

  return `
    <svg class="almanac-plate-svg" viewBox="0 0 560 490" role="img" aria-label="${
      showMarks
        ? 'Circular lunar phases plate with four encircled phases: I Waxing Crescent, II Full Moon, III Waning Gibbous, IV New Moon'
        : 'Circular unmarked synodic lunar phases plate showing all 8 lunar phases from Day 0 to Day 25'
    }">
      <defs>
        <radialGradient id="almanacGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(212,175,106,0.16)"/>
          <stop offset="70%" stop-color="rgba(22,36,68,0.12)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="188" fill="url(#almanacGlow)" stroke="rgba(212,175,106,0.3)" stroke-width="1"/>
      <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="rgba(212,175,106,0.45)" stroke-width="1.2" stroke-dasharray="5 4"/>
      <circle cx="${cx}" cy="${cy}" r="68" fill="none" stroke="rgba(212,175,106,0.28)" stroke-width="1"/>
      <circle cx="${cx}" cy="${cy}" r="36" fill="rgba(212,175,106,0.08)" stroke="#d4af6a" stroke-width="1.4"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Cinzel, serif" font-size="10.5" letter-spacing="2" fill="#f2d594">LUNA</text>
      <text x="${cx}" y="${cy + 11}" text-anchor="middle" font-family="Cormorant Garamond, serif" font-style="italic" font-size="11.5" fill="rgba(244,236,220,0.75)">1898</text>
      ${nodes}
    </svg>
  `;
}

function buildEyepieceReticleSVG(): string {
  const ticks: string[] = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const isMajor = deg % 30 === 0;
    const isMid = deg % 15 === 0;
    const rOuter = 248;
    const rInner = isMajor ? 232 : isMid ? 238 : 242;
    const rad = ((deg - 90) * Math.PI) / 180;
    const x1 = 250 + Math.cos(rad) * rInner;
    const y1 = 250 + Math.sin(rad) * rInner;
    const x2 = 250 + Math.cos(rad) * rOuter;
    const y2 = 250 + Math.sin(rad) * rOuter;
    ticks.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(242,213,148,${isMajor ? '0.68' : '0.32'})" stroke-width="${isMajor ? '1.3' : '0.8'}"/>`
    );
  }

  return `
    <svg class="eyepiece-reticle-svg" viewBox="0 0 500 500" fill="none" aria-hidden="true">
      <circle cx="250" cy="250" r="248" stroke="rgba(242,213,148,0.45)" stroke-width="1.5"/>
      <circle cx="250" cy="250" r="185" stroke="rgba(242,213,148,0.2)" stroke-width="0.9" stroke-dasharray="4 6"/>
      <circle cx="250" cy="250" r="95" stroke="rgba(242,213,148,0.22)" stroke-width="0.8"/>
      <circle cx="250" cy="250" r="14" stroke="rgba(242,213,148,0.52)" stroke-width="1"/>
      <line x1="250" y1="22" x2="250" y2="236" stroke="rgba(242,213,148,0.34)" stroke-width="0.9"/>
      <line x1="250" y1="264" x2="250" y2="478" stroke="rgba(242,213,148,0.34)" stroke-width="0.9"/>
      <line x1="22" y1="250" x2="236" y2="250" stroke="rgba(242,213,148,0.34)" stroke-width="0.9"/>
      <line x1="264" y1="250" x2="478" y2="250" stroke="rgba(242,213,148,0.34)" stroke-width="0.9"/>
      ${ticks.join('')}
      <text x="250" y="34" text-anchor="middle" font-family="Cinzel, serif" font-size="11" fill="rgba(242,213,148,0.75)">N · 0°</text>
      <text x="250" y="476" text-anchor="middle" font-family="Cinzel, serif" font-size="11" fill="rgba(242,213,148,0.55)">S · 180°</text>
      <text x="34" y="254" text-anchor="middle" font-family="Cinzel, serif" font-size="11" fill="rgba(242,213,148,0.55)">W</text>
      <text x="466" y="254" text-anchor="middle" font-family="Cinzel, serif" font-size="11" fill="rgba(242,213,148,0.55)">E</text>
    </svg>
  `;
}
