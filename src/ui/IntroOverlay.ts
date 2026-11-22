import type { IntroAct, IntroOverlayAPI, IntroTimelineManifest } from '../types';

export function createIntroOverlay(
  mount: HTMLElement,
  onSkip: () => void
): IntroOverlayAPI {
  const root = document.createElement('div');
  root.className = 'intro-overlay';
  root.setAttribute('aria-label', 'Opening Cinematic');
  root.innerHTML = `
    <video
      id="intro-prologue-video"
      class="intro-prologue-video"
      playsinline
      muted
      preload="auto"
      src="./intro/prologue.mp4"
    ></video>
    <audio
      id="intro-master-audio"
      preload="auto"
      src="./intro/intro_audio.mp3"
    ></audio>
    <div class="intro-letterbox intro-letterbox-top" aria-hidden="true"></div>
    <div class="intro-letterbox intro-letterbox-bottom" aria-hidden="true"></div>
    <div class="intro-subtitle-wrap" aria-live="polite" aria-atomic="true">
      <p class="intro-subtitle-text" data-intro-subtitle></p>
    </div>
    <button type="button" class="intro-skip-btn" data-intro-skip aria-label="Skip opening cinematic">
      <span>Skip Intro</span>
      <kbd class="hud-kbd">Esc</kbd>
    </button>
  `;
  mount.appendChild(root);

  const videoEl = root.querySelector<HTMLVideoElement>('#intro-prologue-video')!;
  const audioEl = root.querySelector<HTMLAudioElement>('#intro-master-audio')!;
  const subtitleEl = root.querySelector<HTMLElement>('[data-intro-subtitle]')!;
  const skipBtn = root.querySelector<HTMLButtonElement>('[data-intro-skip]')!;

  let active = false;
  let mutedState = false;
  let currentSubtitle: string | null = null;

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    }
  };

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

    try {
      videoEl.currentTime = 0;
    } catch {
      /* metadata may still be loading */
    }
    videoEl.muted = true;
    videoEl.play().catch(() => {
      /* graceful fallback if autoplay blocked or asset still loading */
    });

    try {
      audioEl.currentTime = 0;
    } catch {
      /* metadata may still be loading */
    }
    audioEl.muted = mutedState;
    audioEl.volume = 1;
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
