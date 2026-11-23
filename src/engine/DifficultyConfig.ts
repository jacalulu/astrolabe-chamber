import {
  COMPASS_BEARINGS,
  LUNAR_PHASE_NAMES,
  STAR_IDS,
  ZODIAC_NAMES,
  type DifficultyMode,
  type DoorCouplingMode,
  type PuzzleConfig,
} from '../types';

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickFrom<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

const LUNAR_PHASE_DESCRIPTIONS: Record<number, string> = {
  0: 'the Moon completely dark and unseen (Day 0, total eclipse of light)',
  1: 'a slender silver waxing sliver on the right (one step clockwise past darkness)',
  2: 'the Moon cleanly bisected at first quarter, its right half luminous',
  3: 'the waxing gibbous disk, nearly full with only a slim left shadow',
  4: 'the radiant Full Moon in unbroken splendor',
  5: 'the waning gibbous disk, just past full with a thin shadow nibbling the right rim',
  6: 'the Moon cleanly bisected at last quarter, its left half luminous',
  7: 'the final dying waning crescent on the left, one step before total darkness',
};

const HOUR_WORDS: Record<number, string> = {
  1: 'one hour',
  2: 'two hours',
  3: 'three hours',
  4: 'four hours',
  5: 'five hours',
  6: 'six hours',
};

const DEC_FRACTION_CLUES: Record<number, string> = {
  15: 'one-sixth of the 90° Zenith engraved on the North Meridian Transit Ring',
  30: 'one-third of the 90° Zenith engraved on the North Meridian Transit Ring',
  45: 'exactly half of the 90° Zenith engraved on the North Meridian Transit Ring',
  60: 'two-thirds of the 90° Zenith engraved on the North Meridian Transit Ring',
  75: 'five-sixths of the 90° Zenith engraved on the North Meridian Transit Ring',
};

interface AspectDef {
  steps: number;
  label: string;
}

const ORRERY_ASPECTS: readonly AspectDef[] = [
  { steps: 4, label: 'in Trine (+120° clockwise from Earth)' },
  { steps: 3, label: 'in Eastern Quadrature (+90° clockwise from Earth)' },
  { steps: 6, label: 'in Opposition (180° directly opposite Earth)' },
  { steps: 10, label: 'in Waning Sextile (−60° counter-clockwise from Earth)' },
  { steps: 9, label: 'in Western Quadrature (−90° counter-clockwise from Earth)' },
  { steps: 2, label: 'in Waxing Sextile (+60° clockwise from Earth)' },
];

const ROMAN_DIALS = ['I', 'II', 'III', 'IV'] as const;

function describeLunarStep(prevPhase: number, nextPhase: number, prevIdx: number): string {
  const diff = (nextPhase - prevPhase + 8) % 8;
  const ref = `Dial ${ROMAN_DIALS[prevIdx]}`;
  if (diff === 4) {
    return `directly opposite ${ref} across the Lunar Almanac wheel (4 steps / 180°)`;
  }
  if (diff <= 3) {
    return `${diff} ${diff === 1 ? 'step' : 'steps'} clockwise past ${ref} on the Lunar Almanac wheel`;
  }
  const ccw = 8 - diff;
  return `${ccw} ${ccw === 1 ? 'step' : 'steps'} counter-clockwise before ${ref} on the Lunar Almanac wheel`;
}

function buildTelescopeClue(ra: number, dec: number): string {
  let raPhrase: string;
  if (ra >= 5 && ra <= 10) {
    const diff = 11 - ra;
    raPhrase = `${HOUR_WORDS[diff] ?? `${diff} hours`} earlier than the East Wall Regulator Clock (11:00)`;
  } else {
    // ra in {1, 2, 3}: 2..4 hours past 11:00 on a 12-hour dial
    const past = (ra - 11 + 12) % 12;
    raPhrase = `${HOUR_WORDS[past] ?? `${past} hours`} past the East Wall Regulator Clock (11:00, wrapping a 12-hour dial)`;
  }
  const decPhrase = DEC_FRACTION_CLUES[dec] ?? `${dec}° above the horizon`;
  return `Set Right Ascension ${raPhrase}, and Declination to ${decPhrase}.`;
}

/**
 * Applies a single player click to an Orrery planet collar.
 * On Master (`coupled = true`):
 *  - Saturn click: Saturn +1, Mars +2 (mod 12)
 *  - Mars click:   Mars +1, Earth +1 (mod 12)
 *  - Earth click:  Earth +1 (mod 12)
 * Upper-triangular matrix with det = 1 mod 12 — uniquely solvable from any state.
 */
export function applyOrreryRingClick(
  current: { earth: number; mars: number; saturn: number },
  planet: 'earth' | 'mars' | 'saturn',
  coupled: boolean
): { earth: number; mars: number; saturn: number } {
  const next = { ...current };
  if (!coupled) {
    next[planet] = (next[planet] + 1) % 12;
    return next;
  }
  if (planet === 'saturn') {
    next.saturn = (next.saturn + 1) % 12;
    next.mars = (next.mars + 2) % 12;
  } else if (planet === 'mars') {
    next.mars = (next.mars + 1) % 12;
    next.earth = (next.earth + 1) % 12;
  } else {
    next.earth = (next.earth + 1) % 12;
  }
  return next;
}

/**
 * Applies a single player click to one of the 3 Exit Door Astrolabe rings (0=Outer, 1=Middle, 2=Inner).
 *  - 'none' (Apprentice):          Outer [+1,0,0], Middle [0,+1,0], Inner [0,0,+1]
 *  - 'cascade' (Scholar):          Outer [+1,+1,0], Middle [0,+1,+1], Inner [0,0,+1] (det = 1 mod 8)
 *  - 'bidirectional' (Master):     Outer [+1,+1,0], Middle [+1,+1,+1], Inner [0,+1,+1] (det = -1 ≡ 7 mod 8)
 * All three modes are invertible mod 8 and 100% solvable from any state.
 */
export function applyDoorRingClick(
  current: readonly [number, number, number],
  ringIndex: 0 | 1 | 2,
  coupling: DoorCouplingMode
): [number, number, number] {
  const [r0, r1, r2] = current;
  if (coupling === 'none') {
    const out: [number, number, number] = [r0, r1, r2];
    out[ringIndex] = (out[ringIndex] + 1) % 8;
    return out;
  }
  if (coupling === 'cascade') {
    if (ringIndex === 0) return [(r0 + 1) % 8, (r1 + 1) % 8, r2];
    if (ringIndex === 1) return [r0, (r1 + 1) % 8, (r2 + 1) % 8];
    return [r0, r1, (r2 + 1) % 8];
  }
  // bidirectional
  if (ringIndex === 0) return [(r0 + 1) % 8, (r1 + 1) % 8, r2];
  if (ringIndex === 1) return [(r0 + 1) % 8, (r1 + 1) % 8, (r2 + 1) % 8];
  return [r0, (r1 + 1) % 8, (r2 + 1) % 8];
}

export function generatePuzzleConfig(difficulty: DifficultyMode, seed?: number): PuzzleConfig {
  if (difficulty === 'apprentice') {
    return {
      difficulty: 'apprentice',
      seed: seed ?? 1898,
      lunarSolution: [1, 4, 5, 0],
      lunarClues: {
        heading: 'I. The Lunar Cryptex',
        lines: [
          'First, consult my Framed Lunar Almanac on the South-West wall — the four marked phases unlock my desk cryptex in Roman order (I through IV).',
        ],
        showAlmanacMarks: true,
      },
      telescopeTargetRA: 4,
      telescopeTargetDEC: 45,
      telescopeClueText:
        'With the Sapphire Objective Lens seated, align the Great Equatorial to RA 04h and DEC +45° to behold the Triad of the North.',
      starChartSolution: ['polaris', 'sirius', 'vega'],
      starChartOrderMatters: false,
      eyepieceShowNames: true,
      orrerySolution: { earth: 0, mars: 4, saturn: 10 },
      orreryCoupled: false,
      orreryStart: { earth: 3, mars: 8, saturn: 1 },
      orreryEarthAnchor: 0,
      orreryClueLines: ['Earth — Aries (0°)', 'Mars — Leo (120°)', 'Saturn — Aquarius (300°)'],
      starChartShowDirectAnswer: true,
      doorTarget: [0, 0, 0],
      doorStart: [3, 5, 2],
      doorCoupling: 'none',
      doorAzimuthDegrees: 0,
      doorAzimuthLabel: 'N',
      showLeadRibbon: true,
      maxHints: null,
    };
  }

  if (difficulty === 'scholar') {
    // Cascade start reverse-scrambled from [0,0,0] by (2 outer, 3 middle, 2 inner)
    const doorStart: [number, number, number] = [6, 3, 3];
    return {
      difficulty: 'scholar',
      seed: seed ?? 1899,
      lunarSolution: [1, 2, 5, 7],
      lunarClues: {
        heading: 'I. Four Nights of the Synodic Watch',
        lines: [
          'Night I: A slender silver sliver rising on the right — one step clockwise past total darkness.',
          'Night II: The lunar disk cleanly bisected, its right half bright at evening meridian.',
          'Night III: Just past full splendor, a thin shadow nibbling the right rim as light begins to ebb.',
          'Night IV: The final dying crescent on the left, one step before total darkness returns.',
        ],
        showAlmanacMarks: false,
      },
      telescopeTargetRA: 7,
      telescopeTargetDEC: 60,
      telescopeClueText:
        'Set Right Ascension four hours earlier than the East Wall Regulator Clock (11:00), and Declination to two-thirds of the 90° Zenith engraved on the North Meridian Transit Ring.',
      starChartSolution: ['polaris', 'vega', 'rigel', 'sirius'],
      starChartOrderMatters: false,
      eyepieceShowNames: false,
      orrerySolution: { earth: 2, mars: 6, saturn: 0 },
      orreryCoupled: false,
      orreryStart: { earth: 5, mars: 10, saturn: 7 },
      orreryEarthAnchor: 2,
      orreryClueLines: [
        'Earth anchored in Gemini (60°).',
        'Mars stands in Trine (+120° clockwise from Earth).',
        'Saturn stands in Sextile (−60° counter-clockwise from Earth).',
      ],
      starChartShowDirectAnswer: false,
      doorTarget: [0, 0, 0],
      doorStart,
      doorCoupling: 'cascade',
      doorAzimuthDegrees: 0,
      doorAzimuthLabel: 'N',
      showLeadRibbon: false,
      maxHints: null,
    };
  }

  // Master Astronomer: seeded procedural generation across all 5 puzzles
  const resolvedSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.abs(Math.floor(seed)) & 0xffffff || 1901
      : ((Date.now() ^ 0x5a3c1f) & 0xffffff) || 1901;
  const rng = createRng(resolvedSeed);

  // 1. Lunar Cryptex: 4 distinct randomized phases + unambiguous wheel-step cipher
  const shuffledPhases = shuffleWithRng([0, 1, 2, 3, 4, 5, 6, 7], rng);
  const lunarSolution: [number, number, number, number] = [
    shuffledPhases[0],
    shuffledPhases[1],
    shuffledPhases[2],
    shuffledPhases[3],
  ];
  const lunarLines = [
    `Dial I: Set to ${LUNAR_PHASE_DESCRIPTIONS[lunarSolution[0]]}.`,
    `Dial II: Step ${describeLunarStep(lunarSolution[0], lunarSolution[1], 0)}.`,
    `Dial III: Step ${describeLunarStep(lunarSolution[1], lunarSolution[2], 1)}.`,
    `Dial IV: Step ${describeLunarStep(lunarSolution[2], lunarSolution[3], 2)}.`,
  ];

  // 2. Telescope: randomized RA (1..10 excl 4,7 for freshness? Include 1..10 excl 0,11) & DEC (15..75)
  const masterRAPool = [1, 2, 3, 5, 6, 8, 9, 10] as const;
  const masterDECPool = [15, 30, 45, 60, 75] as const;
  const telescopeTargetRA = pickFrom(masterRAPool, rng);
  const telescopeTargetDEC = pickFrom(masterDECPool, rng);
  const telescopeClueText = buildTelescopeClue(telescopeTargetRA, telescopeTargetDEC);

  // 3. Star Chart: 5 distinct randomized stars in strict sequence
  const starChartSolution = shuffleWithRng(STAR_IDS, rng).slice(0, 5);

  // 4. Orrery: randomized Earth anchor + 2 distinct astronomical aspects + coupled gears
  const earth = Math.floor(rng() * 12);
  const pickedAspects = shuffleWithRng(ORRERY_ASPECTS, rng);
  const marsAspect = pickedAspects[0];
  const saturnAspect = pickedAspects[1];
  const mars = (earth + marsAspect.steps) % 12;
  const saturn = (earth + saturnAspect.steps) % 12;
  const orrerySolution = { earth, mars, saturn };

  // Reverse-scramble from solution under Master coupled gears so start is guaranteed non-solved & cleanly solvable
  const sBack = 2 + Math.floor(rng() * 3); // 2..4
  const mBack = 2 + Math.floor(rng() * 3); // 2..4
  const eBack = 2 + Math.floor(rng() * 3); // 2..4
  let startSaturn = (saturn - sBack + 120) % 12;
  let startMars = (mars - 2 * sBack - mBack + 120) % 12;
  let startEarth = (earth - mBack - eBack + 120) % 12;
  if (startEarth === earth) startEarth = (startEarth + 2) % 12;
  if (startMars === mars) startMars = (startMars + 2) % 12;
  if (startSaturn === saturn) startSaturn = (startSaturn + 2) % 12;
  const orreryStart = { earth: startEarth, mars: startMars, saturn: startSaturn };

  const earthSign = ZODIAC_NAMES[earth];
  const earthDeg = earth * 30;
  const orreryClueLines = [
    `Earth anchored in ${earthSign} (${earthDeg}°).`,
    `Mars stands ${marsAspect.label}.`,
    `Saturn stands ${saturnAspect.label}.`,
  ];

  // 5. Exit Door Astrolabe: randomized non-12-o'clock azimuth bearing + bidirectional coupling
  const bearingPool = [2, 3, 4, 5, 6] as const;
  const bearingStep = pickFrom(bearingPool, rng);
  const doorTarget: [number, number, number] = [bearingStep, bearingStep, bearingStep];
  const doorAzimuthDegrees = bearingStep * 45;
  const doorAzimuthLabel = COMPASS_BEARINGS[bearingStep];

  // Reverse-scramble 4–6 clicks under bidirectional coupling:
  // Outer=[+1,+1,0], Middle=[+1,+1,+1], Inner=[0,+1,+1]
  const k0 = 1 + Math.floor(rng() * 3); // 1..3
  const k1 = 1 + Math.floor(rng() * 2); // 1..2
  const k2 = 1 + Math.floor(rng() * 3); // 1..3
  let d0 = (bearingStep - k0 - k1 + 64) % 8;
  let d1 = (bearingStep - k0 - k1 - k2 + 64) % 8;
  let d2 = (bearingStep - k1 - k2 + 64) % 8;
  if (d0 === bearingStep && d1 === bearingStep && d2 === bearingStep) {
    d0 = (d0 + 2) % 8;
    d1 = (d1 + 3) % 8;
    d2 = (d2 + 1) % 8;
  }
  const doorStart: [number, number, number] = [d0, d1, d2];

  return {
    difficulty: 'master',
    seed: resolvedSeed,
    lunarSolution,
    lunarClues: {
      heading: 'I. The Synodic Wheel Cipher',
      lines: lunarLines,
      showAlmanacMarks: false,
    },
    telescopeTargetRA,
    telescopeTargetDEC,
    telescopeClueText,
    starChartSolution,
    starChartOrderMatters: true,
    eyepieceShowNames: false,
    orrerySolution,
    orreryCoupled: true,
    orreryStart,
    orreryEarthAnchor: earth,
    orreryClueLines,
    starChartShowDirectAnswer: false,
    doorTarget,
    doorStart,
    doorCoupling: 'bidirectional',
    doorAzimuthDegrees,
    doorAzimuthLabel,
    showLeadRibbon: false,
    maxHints: 3,
  };
}

export function formatPhaseList(phases: readonly number[]): string {
  return phases.map((p) => LUNAR_PHASE_NAMES[p] ?? `Phase ${p}`).join(', ');
}
