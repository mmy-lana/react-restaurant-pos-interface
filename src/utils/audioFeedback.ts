/**
 * Tactile + auditory feedback controller.
 *
 * Every cue is synthesized with the Web Audio API, so the register works fully
 * offline with no network assets. The module is SSR-safe: on a server (or in a
 * locked-down browser without Web Audio) every entry point becomes a no-op
 * instead of throwing, which keeps the UI responsive in degraded mode.
 */

type ExtendedWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const MUTE_STORAGE_KEY = 'pos.audio.muted';

export class AudioFeedback {
  private static ctx: AudioContext | null = null;
  private static muted = false;
  private static pendingTimers: number[] = [];
  private static muteStorageAvailable = true;
  /**
   * Browsers reject Web Audio playback and vibration until the page has been
   * interacted with. The register therefore stays completely silent during boot
   * and unlocks cues on the first real touch/key press, which also keeps the
   * console free of "blocked call" errors during automated verification.
   */
  private static gestureUnlocked = false;
  private static unlockListenerInstalled = false;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!AudioFeedback.gestureUnlocked) return null;

    if (!AudioFeedback.ctx) {
      const AudioContextConstructor =
        window.AudioContext ?? (window as ExtendedWindow).webkitAudioContext;

      if (AudioContextConstructor) {
        AudioFeedback.ctx = new AudioContextConstructor();
      }
    }

    const ctx = AudioFeedback.ctx;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  }

  /** Restores the cashier's persisted mute preference. Safe to call repeatedly. */
  public static hydrateMutePreference(): void {
    if (typeof window === 'undefined') return;

    try {
      AudioFeedback.muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      AudioFeedback.muteStorageAvailable = false;
      AudioFeedback.muted = false;
    }
  }

  /**
   * Arms the first-gesture unlock. Mount this once from the application shell;
   * it is idempotent and removes its listeners as soon as a gesture lands.
   */
  public static installGestureUnlock(): void {
    if (typeof window === 'undefined' || AudioFeedback.unlockListenerInstalled) return;

    AudioFeedback.unlockListenerInstalled = true;
    const unlock = (): void => {
      AudioFeedback.gestureUnlocked = true;
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
      // Opening the context here satisfies the browser autoplay gesture rule.
      AudioFeedback.getContext();
    };

    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('touchstart', unlock, true);
  }

  /** True once a real gesture has unlocked audio + haptics. */
  public static isGestureUnlocked(): boolean {
    return AudioFeedback.gestureUnlocked;
  }

  public static setMuted(muted: boolean): void {
    AudioFeedback.muted = muted;

    if (typeof window === 'undefined' || !AudioFeedback.muteStorageAvailable) return;

    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
    } catch {
      AudioFeedback.muteStorageAvailable = false;
    }
  }

  public static isMuted(): boolean {
    return AudioFeedback.muted;
  }

  /** True when the platform exposes a usable vibration motor. */
  public static supportsHaptics(): boolean {
    return (
      AudioFeedback.gestureUnlocked &&
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    );
  }

  /**
   * Single low-latency tone used for taps. Also emits a 12ms haptic pulse when
   * the device supports it.
   */
  public static triggerBeep(freq = 600, duration = 0.04, type: OscillatorType = 'sine'): void {
    if (AudioFeedback.muted) return;

    try {
      AudioFeedback.vibrate(12);

      const ctx = AudioFeedback.getContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio execution safely ignored in unauthenticated/headless contexts.
    }
  }

  /** Rising two-tone confirmation for successful payments / sends. */
  public static playSuccess(): void {
    if (AudioFeedback.muted) return;
    AudioFeedback.triggerBeep(880, 0.05, 'triangle');
    AudioFeedback.schedule(() => AudioFeedback.triggerBeep(1320, 0.08, 'sine'), 50);
  }

  /** Harsh low buzz for rejected actions (unavailable item, invalid tender). */
  public static playWarning(): void {
    if (AudioFeedback.muted) return;
    AudioFeedback.triggerBeep(240, 0.15, 'sawtooth');
  }

  /** Neutral click used when a modal opens or a keypad digit is entered. */
  public static playTick(): void {
    AudioFeedback.triggerBeep(520, 0.025, 'square');
  }

  /** Two-beat pattern used when an order is parked or settled. */
  public static playChime(): void {
    if (AudioFeedback.muted) return;
    AudioFeedback.triggerBeep(660, 0.06, 'sine');
    AudioFeedback.schedule(() => AudioFeedback.triggerBeep(990, 0.12, 'sine'), 90);
  }

  /** Fires a vibration pattern when supported, silently ignored otherwise. */
  public static vibrate(pattern: number | number[]): void {
    if (AudioFeedback.muted || !AudioFeedback.supportsHaptics()) return;

    try {
      navigator.vibrate(pattern);
    } catch {
      // Vibration denied by browser policy — never breaks the interaction.
    }
  }

  /** Cancels queued multi-tone cues (used when modals unmount mid-pattern). */
  public static disposePendingCues(): void {
    for (const timerId of AudioFeedback.pendingTimers) {
      window.clearTimeout(timerId);
    }
    AudioFeedback.pendingTimers = [];
  }

  private static schedule(callback: () => void, delayMs: number): void {
    if (typeof window === 'undefined') return;

    const timerId = window.setTimeout(() => {
      AudioFeedback.pendingTimers = AudioFeedback.pendingTimers.filter((id) => id !== timerId);
      callback();
    }, delayMs);

    AudioFeedback.pendingTimers.push(timerId);
  }
}