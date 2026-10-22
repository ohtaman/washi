/**
 * Cozy Pastoral Web Audio Synthesizer & Sound Effects for "もふもふ羊の牧場囲い"
 *
 * Uses warm marimba / acoustic pluck tones, gentle bass, and soft wooden percussion
 * for a relaxing storybook ranch atmosphere.
 */

export type PastureBgmTrack = "meadow" | "victory";

export class PastureAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private isMuted = true;
  private track: PastureBgmTrack = "meadow";
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  public get playing(): boolean {
    return this.isPlaying && !this.isMuted;
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleBgm(): boolean {
    if (this.isPlaying) {
      this.stopBgm();
      return false;
    }
    this.startBgm(this.track);
    return true;
  }

  public setTrack(track: PastureBgmTrack): void {
    const prev = this.track;
    this.track = track;
    if (this.isPlaying && prev !== track) {
      this.startBgm(track);
    }
  }

  public startBgm(track: PastureBgmTrack = this.track): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.track = track;
    this.isPlaying = true;
    this.isMuted = false;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.04;

    const tick = () => {
      if (!this.isPlaying || this.isMuted) return;
      const c = this.ensureCtx();
      if (!c) return;
      const stepSec = this.track === "victory" ? 0.16 : 0.21;
      if (this.nextTime < c.currentTime - 0.1) {
        this.nextTime = c.currentTime + 0.02;
      }
      while (this.nextTime < c.currentTime + 0.12) {
        this.scheduleStep(c, this.step, this.nextTime, stepSec);
        this.nextTime += stepSec;
        this.step++;
      }
    };

    tick();
    this.timer = window.setInterval(tick, 40);
  }

  public stopBgm(): void {
    this.isPlaying = false;
    this.isMuted = true;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleStep(ctx: AudioContext, step: number, time: number, stepSec: number): void {
    // Pastoral F-major / C-major acoustic melody loop (32 steps)
    const s = step % 32;
    const bassLine: readonly number[] = [
      174.61, 0, 261.63, 0, 220.0, 0, 261.63, 0, // F3 - C4 - A3 - C4
      233.08, 0, 293.66, 0, 196.0, 0, 261.63, 0, // Bb3 - D4 - G3 - C4
      174.61, 0, 261.63, 0, 220.0, 0, 349.23, 0, // F3 - C4 - A3 - F4
      196.0, 0, 246.94, 0, 261.63, 0, 196.0, 0, // G3 - B3 - C4 - G3
    ];

    const melodyLine: readonly number[] = [
      523.25, 0, 587.33, 659.25, 698.46, 0, 523.25, 0,
      587.33, 0, 523.25, 440.0, 392.0, 0, 0, 0,
      523.25, 0, 659.25, 698.46, 783.99, 0, 698.46, 659.25,
      587.33, 0, 523.25, 0, 698.46, 0, 0, 0,
    ];

    const bFreq = bassLine[s];
    if (bFreq > 0) {
      this.playWarmPluck(ctx, bFreq, time, stepSec * 1.7, 0.032, "triangle");
    }

    const mFreq = melodyLine[s];
    if (mFreq > 0) {
      this.playWarmPluck(ctx, mFreq, time, stepSec * 1.5, 0.038, "sine");
      this.playWarmPluck(ctx, mFreq * 0.5, time, stepSec * 1.4, 0.018, "triangle");
    }
  }

  private playWarmPluck(
    ctx: AudioContext,
    freq: number,
    time: number,
    dur: number,
    peak: number,
    type: OscillatorType
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(peak, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  /** Wooden mallet tap ("コンッ") when placing or removing a fence */
  public playFenceTap(placed: boolean): void {
    if (this.isMuted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (placed) {
      this.playWarmPluck(ctx, 320, now, 0.06, 0.065, "triangle");
      this.playWarmPluck(ctx, 540, now + 0.03, 0.08, 0.06, "sine");
    } else {
      this.playWarmPluck(ctx, 420, now, 0.05, 0.045, "sine");
      this.playWarmPluck(ctx, 280, now + 0.03, 0.07, 0.045, "triangle");
    }
  }

  /** Joyful sheep bell chime when pasture becomes completely safe */
  public playSafeChime(): void {
    if (this.isMuted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.playWarmPluck(ctx, f, now + i * 0.065, 0.24, 0.05, "sine");
    });
  }

  /** Low comical alert when wolf reaches sheep or cannot place fence */
  public playAlert(): void {
    if (this.isMuted) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playWarmPluck(ctx, 210, now, 0.12, 0.06, "sawtooth");
    this.playWarmPluck(ctx, 165, now + 0.09, 0.18, 0.06, "sawtooth");
  }
}

export const pastureAudio = new PastureAudioEngine();
