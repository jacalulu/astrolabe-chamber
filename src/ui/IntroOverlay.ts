import type { IntroAct, IntroOverlayAPI, IntroTimelineManifest } from '../types';

const INTRO_SOUND_ON_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
  </svg>
`;

const INTRO_SOUND_OFF_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/>
    <line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
`;

export function createIntroOverlay(
  mount: HTMLElement,
  onSkip: () => void,
  onToggleMute?: () => boolean
): IntroOverlayAPI {
  const root = document.createElement('div');
  root.className = 'intro-overlay';
  root.setAttribute('aria-label', 'Opening Cinematic');
  root.innerHTML = `
    <video
      id="intro-prologue-video"
      class="intro-prologue-video"
      width="1280"
      height="720"
      playsinline
      muted
      preload="none"
      src="./intro/prologue.mp4"
    ></video>
    <audio
      id="intro-master-audio"
      preload="none"
      src="./intro/intro_audio.mp3"
    ></audio>
    <div class="intro-letterbox intro-letterbox-top" aria-hidden="true"></div>
    <div class="intro-letterbox intro-letterbox-bottom" aria-hidden="true"></div>
    <div class="intro-subtitle-wrap" aria-live="polite" aria-atomic="true">
      <p class="intro-subtitle-text" data-intro-subtitle></p>
    </div>
    <div class="intro-top-controls">
      <button
        type="button"
        class="intro-mute-btn"
        data-intro-mute
        aria-label="Mute cinematic audio"
        aria-pressed="false"
        title="Mute / Unmute"
      >
        ${INTRO_SOUND_ON_ICON}
      </button>
      <button type="button" class="intro-skip-btn" data-intro-skip aria-label="Skip opening cinematic">
        <span>Skip Intro</span>
        <kbd class="hud-kbd">Esc</kbd>
      </button>
    </div>
  `;
  mount.appendChild(root);

  const videoEl = root.querySelector<HTMLVideoElement>('#intro-prologue-video')!;
  const audioEl = root.querySelector<HTMLAudioElement>('#intro-master-audio')!;
  const subtitleEl = root.querySelector<HTMLElement>('[data-intro-subtitle]')!;
  const muteBtn = root.querySelector<HTMLButtonElement>('[data-intro-mute]')!;
  const skipBtn = root.querySelector<HTMLButtonElement>('[data-intro-skip]')!;

  let active = false;
  let mutedState = false;
  let currentSubtitle: string | null = null;

  function syncMuteUI(): void {
    muteBtn.classList.toggle('is-muted', mutedState);
    muteBtn.innerHTML = mutedState ? INTRO_SOUND_OFF_ICON : INTRO_SOUND_ON_ICON;
    muteBtn.setAttribute('aria-pressed', String(mutedState));
    muteBtn.setAttribute('aria-label', mutedState ? 'Unmute cinematic audio' : 'Mute cinematic audio');
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    }
  };

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextMuted = onToggleMute ? onToggleMute() : !mutedState;
    setMuted(nextMuted);
  });

  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!active) return;
    onSkip();
  });

  function setAct(act: IntroAct): void {
    if (act === 'act1') {
      root.classList.remove('is-act2');
    } else if (act === 'act2') {
      root.classList.add('is-act2');
    } else {
      root.classList.remove('is-act2');
    }
  }

  function start(_manifest: IntroTimelineManifest): void {
    active = true;
    currentSubtitle = null;

    subtitleEl.textContent = '';
    subtitleEl.classList.remove('is-visible');

    setAct('act1');
    root.classList.add('is-active');

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    if (videoEl.readyState === 0) {
      videoEl.load();
    }
    try {
      videoEl.currentTime = 0;
    } catch {
      /* metadata may still be loading */
    }
    videoEl.muted = true;
    videoEl.play().catch(() => {
      /* graceful fallback if autoplay blocked or asset still loading */
    });

    if (audioEl.readyState === 0) {
      audioEl.load();
    }
    try {
      audioEl.currentTime = 0;
    } catch {
      /* metadata may still be loading */
    }
    audioEl.muted = mutedState;
    audioEl.volume = 1;
    syncMuteUI();
    audioEl.play().catch(() => {
      /* graceful fallback if autoplay blocked */
    });
  }

  function stop(): void {
    if (!active && !root.classList.contains('is-active')) return;
    active = false;
    currentSubtitle = null;

    window.removeEventListener('keydown', handleKeyDown, { capture: true });

    root.classList.remove('is-active');
    root.classList.remove('is-act2');
    subtitleEl.classList.remove('is-visible');
    subtitleEl.textContent = '';

    try {
      videoEl.pause();
      videoEl.currentTime = 0;
    } catch {
      /* ignore reset error */
    }
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      /* ignore reset error */
    }
  }

  function setSubtitle(text: string | null): void {
    const normalized = text && text.trim().length > 0 ? text.trim() : null;
    if (normalized === currentSubtitle) return;
    currentSubtitle = normalized;

    if (!normalized) {
      subtitleEl.classList.remove('is-visible');
      return;
    }
    subtitleEl.textContent = normalized;
    subtitleEl.classList.add('is-visible');
  }

  function getCurrentTime(): number {
    if (!active || audioEl.paused || audioEl.readyState < 2) return 0;
    return Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
  }

  function isAudioEnded(): boolean {
    return Boolean(audioEl.ended);
  }

  function setMuted(muted: boolean): void {
    mutedState = muted;
    audioEl.muted = muted;
    syncMuteUI();
  }

  function dispose(): void {
    stop();
    root.remove();
  }

  return {
    start,
    setAct,
    setSubtitle,
    getCurrentTime,
    isAudioEnded,
    setMuted,
    stop,
    isActive: () => active,
    dispose,
  };
}
