import type { SoundEngineAPI } from '../types';

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function createSoundEngine(): SoundEngineAPI {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let muted = false;
  let initialized = false;
  let ambientStarted = false;
  let escapementTimer: number | null = null;
  let tickPhase = false;
  let footstepLeft = false;

  function ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      try {
        const AudioCtx =
          window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.15;

        masterGain = ctx.createGain();
        masterGain.gain.value = muted ? 0 : 0.85;
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);

        noiseBuffer = createPinkNoiseBuffer(ctx, 4.0);
      } catch {
        return null;
      }
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        /* autoplay policy — will resume on next user gesture */
      });
    }
    return ctx;
  }

  function createPinkNoiseBuffer(audioCtx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(audioCtx.sampleRate * durationSec);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.055;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  function startAmbience(): void {
    if (ambientStarted) return;
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || !noiseBuffer) return;
    ambientStarted = true;

    const now = audioCtx.currentTime;
    const ambientBus = audioCtx.createGain();
    ambientBus.gain.setValueAtTime(0.0001, now);
    ambientBus.gain.exponentialRampToValueAtTime(1.0, now + 2.2);
    ambientBus.connect(masterGain);

    // 1. Filtered high-altitude midnight mountain wind through dome shutter
    const windSource = audioCtx.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;

    const windFilter1 = audioCtx.createBiquadFilter();
    windFilter1.type = 'bandpass';
    windFilter1.frequency.value = 260;
    windFilter1.Q.value = 1.6;

    const windFilter2 = audioCtx.createBiquadFilter();
    windFilter2.type = 'bandpass';
    windFilter2.frequency.value = 540;
    windFilter2.Q.value = 2.4;

    const windLfo1 = audioCtx.createOscillator();
    windLfo1.type = 'sine';
    windLfo1.frequency.value = 0.065;
    const windLfoGain1 = audioCtx.createGain();
    windLfoGain1.gain.value = 95;
    windLfo1.connect(windLfoGain1);
    windLfoGain1.connect(windFilter1.frequency);

    const windLfo2 = audioCtx.createOscillator();
    windLfo2.type = 'sine';
    windLfo2.frequency.value = 0.11;
    const windLfoGain2 = audioCtx.createGain();
    windLfoGain2.gain.value = 150;
    windLfo2.connect(windLfoGain2);
    windLfoGain2.connect(windFilter2.frequency);

    const windGain = audioCtx.createGain();
    windGain.gain.value = 0.16;

    windSource.connect(windFilter1);
    windSource.connect(windFilter2);
    windFilter1.connect(windGain);
    windFilter2.connect(windGain);
    windGain.connect(ambientBus);

    windSource.start(now);
    windLfo1.start(now);
    windLfo2.start(now);

    // 2. Subtle warm obsidian-and-walnut chamber room tone
    const droneFilter = audioCtx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 155;
    const droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.014;
    droneFilter.connect(droneGain);
    droneGain.connect(ambientBus);

    const droneFreqs = [73.42, 110.0];
    for (const freq of droneFreqs) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(droneFilter);
      osc.start(now);
    }

    // 3. Soft Victorian observatory regulator clock / orrery escapement tick-tock
    if (escapementTimer === null) {
      escapementTimer = window.setInterval(() => {
        if (!ctx || !masterGain || muted || ctx.state !== 'running') return;
        playEscapementTick(ctx, masterGain, tickPhase);
        tickPhase = !tickPhase;
      }, 1000);
    }
  }

  function playEscapementTick(audioCtx: AudioContext, dest: AudioNode, isTick: boolean): void {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isTick ? 2420 : 1960, t);
    osc.frequency.exponentialRampToValueAtTime(isTick ? 1120 : 880, t + 0.018);

    filter.type = 'bandpass';
    filter.frequency.value = isTick ? 2200 : 1750;
    filter.Q.value = 3.5;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(isTick ? 0.02 : 0.016, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(t);
    osc.stop(t + 0.032);
  }

  function playFilteredNoise(
    audioCtx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    peakGain: number
  ): void {
    if (!noiseBuffer) return;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);
    }
    filter.Q.value = q;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.start(startTime, Math.random() * 2.5);
    src.stop(startTime + duration + 0.02);
  }

  function init(): void {
    const audioCtx = ensureContext();
    if (!audioCtx) return;
    initialized = true;
    startAmbience();
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted;
    if (ctx && masterGain) {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.04);
    }
  }

  function toggleMute(): boolean {
    if (!initialized) init();
    setMuted(!muted);
    return muted;
  }

  function playBrassGear(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;
    const pitchJitter = 0.96 + Math.random() * 0.08;

    // Metallic brass tooth ring
    const freqs = [1580 * pitchJitter, 2740 * pitchJitter];
    for (let i = 0; i < freqs.length; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freqs[i], t);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.86, t + 0.055);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.14 : 0.075, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(t);
      osc.stop(t + 0.075);
    }

    // Mechanical pawl detent snap
    playFilteredNoise(audioCtx, masterGain, t, 0.032, 'bandpass', 1400, 900, 2.2, 0.24);

    // Subtle low gear settle
    const thud = audioCtx.createOscillator();
    const thudGain = audioCtx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(290 * pitchJitter, t + 0.014);
    thud.frequency.exponentialRampToValueAtTime(145, t + 0.075);
    thudGain.gain.setValueAtTime(0.0001, t + 0.014);
    thudGain.gain.linearRampToValueAtTime(0.09, t + 0.02);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    thud.connect(thudGain);
    thudGain.connect(masterGain);
    thud.start(t + 0.014);
    thud.stop(t + 0.09);
  }

  function playHeavyLatch(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;

    // Deep steel deadbolt thump
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(145, t);
    sub.frequency.exponentialRampToValueAtTime(52, t + 0.14);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.linearRampToValueAtTime(0.28, t + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    sub.connect(subGain);
    subGain.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.17);

    // Bolt scrape
    playFilteredNoise(audioCtx, masterGain, t, 0.09, 'bandpass', 720, 420, 1.8, 0.28);

    // Delayed crisp brass lock clink
    const clinkTime = t + 0.078;
    for (const freq of [1360, 2180, 3120]) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, clinkTime);
      g.gain.setValueAtTime(0.0001, clinkTime);
      g.gain.linearRampToValueAtTime(0.08, clinkTime + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, clinkTime + 0.19);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(clinkTime);
      osc.stop(clinkTime + 0.2);
    }
  }

  function playPickup(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;
    const notes = [659.25, 987.77, 1318.51, 1661.22]; // E5, B5, E6, G#6 crystal shimmer

    notes.forEach((freq, idx) => {
      const start = t + idx * 0.055;
      const osc = audioCtx.createOscillator();
      const overtone = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      overtone.type = 'triangle';
      overtone.frequency.setValueAtTime(freq * 2.004, start);

      const overtoneGain = audioCtx.createGain();
      overtoneGain.gain.value = 0.22;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11 - idx * 0.012, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);

      osc.connect(gain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(gain);
      gain.connect(masterGain!);

      osc.start(start);
      overtone.start(start);
      osc.stop(start + 0.65);
      overtone.stop(start + 0.65);
    });
  }

  function playPuzzleSolved(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;

    // Lush celestial Dmaj9 arpeggio (D4, F#4, A4, C#5, E5, A5, D6)
    const chord = [293.66, 369.99, 440.0, 554.37, 659.25, 880.0, 1174.66];
    chord.forEach((freq, idx) => {
      const start = t + idx * 0.072;
      const osc = audioCtx.createOscillator();
      const bell = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      bell.type = 'sine';
      bell.frequency.setValueAtTime(freq * 2, start);
      const bellGain = audioCtx.createGain();
      bellGain.gain.value = 0.28;

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, start);
      filter.frequency.exponentialRampToValueAtTime(950, start + 1.65);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.75);

      osc.connect(filter);
      bell.connect(bellGain);
      bellGain.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain!);

      osc.start(start);
      bell.start(start);
      osc.stop(start + 1.8);
      bell.stop(start + 1.8);
    });
  }

  function playDoorOpen(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;

    // 1. Heavy deadbolts disengaging
    playHeavyLatch();

    // 2. Deep creaking heavy oak doors
    const creakStart = t + 0.22;
    const creakDur = 1.95;
    const creakOsc = audioCtx.createOscillator();
    const creakMod = audioCtx.createOscillator();
    const creakModGain = audioCtx.createGain();
    const creakFilter = audioCtx.createBiquadFilter();
    const creakGain = audioCtx.createGain();

    creakOsc.type = 'sawtooth';
    creakOsc.frequency.setValueAtTime(118, creakStart);
    creakOsc.frequency.linearRampToValueAtTime(192, creakStart + 0.65);
    creakOsc.frequency.linearRampToValueAtTime(144, creakStart + 1.35);
    creakOsc.frequency.linearRampToValueAtTime(106, creakStart + creakDur);

    creakMod.type = 'sine';
    creakMod.frequency.setValueAtTime(19, creakStart);
    creakMod.frequency.linearRampToValueAtTime(9, creakStart + creakDur);
    creakModGain.gain.value = 26;
    creakMod.connect(creakModGain);
    creakModGain.connect(creakOsc.frequency);

    creakFilter.type = 'bandpass';
    creakFilter.frequency.setValueAtTime(420, creakStart);
    creakFilter.frequency.linearRampToValueAtTime(680, creakStart + 0.7);
    creakFilter.frequency.linearRampToValueAtTime(320, creakStart + creakDur);
    creakFilter.Q.value = 4.2;

    creakGain.gain.setValueAtTime(0.0001, creakStart);
    creakGain.gain.linearRampToValueAtTime(0.16, creakStart + 0.22);
    creakGain.gain.setValueAtTime(0.13, creakStart + 1.35);
    creakGain.gain.exponentialRampToValueAtTime(0.0001, creakStart + creakDur);

    creakOsc.connect(creakFilter);
    creakFilter.connect(creakGain);
    creakGain.connect(masterGain);

    creakOsc.start(creakStart);
    creakMod.start(creakStart);
    creakOsc.stop(creakStart + creakDur + 0.05);
    creakMod.stop(creakStart + creakDur + 0.05);

    // 3. Low stone-threshold rumble + cool rushing night air from balcony
    playFilteredNoise(audioCtx, masterGain, creakStart, 2.2, 'lowpass', 180, 95, 1.0, 0.34);
    playFilteredNoise(audioCtx, masterGain, t + 0.55, 2.4, 'bandpass', 340, 880, 1.1, 0.26);

    // 4. Majestic resolving celestial swell
    const chordStart = t + 0.9;
    for (const freq of [293.66, 440.0, 587.33, 739.99, 880.0]) {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, chordStart);
      g.gain.setValueAtTime(0.0001, chordStart);
      g.gain.linearRampToValueAtTime(0.055, chordStart + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, chordStart + 2.4);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(chordStart);
      osc.stop(chordStart + 2.45);
    }
  }

  function playFootstep(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;
    footstepLeft = !footstepLeft;
    const base = footstepLeft ? 92 : 84;
    const jitter = 0.94 + Math.random() * 0.12;

    // Soft boot sole thump on inlaid marble/wood
    const thump = audioCtx.createOscillator();
    const thumpGain = audioCtx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(base * jitter, t);
    thump.frequency.exponentialRampToValueAtTime(42, t + 0.055);
    thumpGain.gain.setValueAtTime(0.0001, t);
    thumpGain.gain.linearRampToValueAtTime(0.095, t + 0.006);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.068);
    thump.connect(thumpGain);
    thumpGain.connect(masterGain);
    thump.start(t);
    thump.stop(t + 0.075);

    // Subtle crisp heel tap
    playFilteredNoise(audioCtx, masterGain, t, 0.032, 'bandpass', 920 * jitter, 620, 2.0, 0.075);
  }

  function playError(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(188, t);
    osc1.frequency.exponentialRampToValueAtTime(118, t + 0.14);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(244, t);
    osc2.frequency.exponentialRampToValueAtTime(152, t + 0.14);

    filter.type = 'lowpass';
    filter.frequency.value = 540;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.17);
    osc2.stop(t + 0.17);
  }

  function playClick(): void {
    const audioCtx = ensureContext();
    if (!audioCtx || !masterGain || muted) return;
    const t = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1850, t);
    osc.frequency.exponentialRampToValueAtTime(840, t + 0.022);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.085, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.032);
  }

  return {
    init,
    isMuted: () => muted,
    setMuted,
    toggleMute,
    playBrassGear,
    playHeavyLatch,
    playPickup,
    playPuzzleSolved,
    playDoorOpen,
    playFootstep,
    playError,
    playClick,
  };
}
