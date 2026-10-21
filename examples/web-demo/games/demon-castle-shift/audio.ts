/**
 * Procedural Web Audio API Synthesizer & Combat SFX Engine for "魔王城の24時間警備シフト"
 *
 * Designed to avoid repetitive "music-box arpeggio" (チャラチャラ) patterns:
 * - Uses low-pass filtered multi-oscillator pads/brass, punchy synthesized drums (kick, snare/taiko, hi-hat),
 *   groovy basslines, and sustained/syncopated phrasing with real musical rests.
 * - Includes impactful metallic sword clashes, shield blocks, war horns, and gate-breach explosion SFX.
 */

export type BgmTrack =
  | "title"
  | "opening"
  | "prologue"
  | "planning"
  | "battle"
  | "victory"
  | "gameover";

interface NoteEvent {
  readonly freq: number;
  /** Duration in steps */
  readonly len: number;
}

export class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isBgmPlaying = false;
  private isMuted = true;
  private currentTrack: BgmTrack = "title";
  private bgmTimer: number | null = null;
  private stepIndex = 0;
  private nextNoteTime = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public toggleBgm(): boolean {
    if (this.isBgmPlaying) {
      this.stopBgm();
      return false;
    } else {
      this.startBgm(this.currentTrack);
      return true;
    }
  }

  public setSceneTrack(track: BgmTrack): void {
    const prevTrack = this.currentTrack;
    this.currentTrack = track;
    if (this.isBgmPlaying && prevTrack !== track) {
      this.startBgm(track);
    }
  }

  public startBgm(track: BgmTrack = this.currentTrack): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.isBgmPlaying && this.currentTrack === track && this.bgmTimer !== null) return;

    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }

    this.currentTrack = track;
    this.isBgmPlaying = true;
    this.isMuted = false;
    this.stepIndex = 0;
    this.nextNoteTime = ctx.currentTime + 0.03;

    const tickScheduler = () => {
      if (!this.isBgmPlaying || this.isMuted) return;
      const c = this.ensureContext();
      if (!c) return;
      const stepSec = this.getStepMs(this.currentTrack) / 1000;
      // If tab was backgrounded, resync nextNoteTime smoothly
      if (this.nextNoteTime < c.currentTime - 0.1) {
        this.nextNoteTime = c.currentTime + 0.02;
      }
      // Schedule all steps within a 110ms lookahead window onto the hardware audio clock
      while (this.nextNoteTime < c.currentTime + 0.11) {
        this.playStepForTrack(c, this.currentTrack, this.stepIndex, this.nextNoteTime, stepSec);
        this.nextNoteTime += stepSec;
        this.stepIndex++;
      }
    };

    tickScheduler();
    this.bgmTimer = window.setInterval(tickScheduler, 35);
  }

  public stopBgm(): void {
    this.isBgmPlaying = false;
    this.isMuted = true;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public get playing(): boolean {
    return this.isBgmPlaying;
  }

  /**
   * Duration of 1 eighth-note step (in ms).
   * Kept within a natural, cohesive range (155ms–250ms) so scene transitions never feel rhythmically warped.
   */
  private getStepMs(track: BgmTrack): number {
    switch (track) {
      case "title":
        return 220; // Dignified 4/4 castle theme (~136 BPM eighth-note pulse)
      case "opening":
        return 200; // Steady orchestral march (150 BPM eighth-note pulse)
      case "prologue":
        return 230; // Calm, warm indoor dialogue theme
      case "planning":
        return 195; // Steady, clear tactical strategy beat
      case "battle":
        return 148; // Classic orchestral JRPG (Dragon Quest style) urgent battle allegro
      case "victory":
        return 185; // Bright celebratory fanfare march
      case "gameover":
        return 250; // Solemn slow minor progression
    }
  }

  // ============================================================================
  // Scene Track Sequencers (Straight, natural 4/4 grid: 8 eighth-notes per bar × 4 bars = 32 steps)
  // Beats 1, 2, 3, 4 are steps 0, 2, 4, 6 of each bar.
  // ============================================================================

  private playStepForTrack(
    ctx: AudioContext,
    track: BgmTrack,
    step: number,
    now: number,
    stepSec: number
  ): void {
    const s = step % 32;
    switch (track) {
      case "title":
        this.stepTitleTrack(ctx, now, stepSec, s);
        break;
      case "opening":
        this.stepOpeningTrack(ctx, now, stepSec, s);
        break;
      case "prologue":
        this.stepPrologueTrack(ctx, now, stepSec, s);
        break;
      case "planning":
        this.stepPlanningTrack(ctx, now, stepSec, s);
        break;
      case "battle":
        this.stepBattleTrack(ctx, now, stepSec, step);
        break;
      case "victory":
        this.stepVictoryTrack(ctx, now, stepSec, s);
        break;
      case "gameover":
        this.stepGameoverTrack(ctx, now, stepSec, s);
        break;
    }
  }

  /**
   * 1. TITLE: Majestic dark-fantasy castle overture in A minor (Am -> F -> Dm -> E)
   * Every chord, bass note, and melody note lands squarely on the 4/4 beats (0, 2, 4, 6).
   */
  private stepTitleTrack(ctx: AudioContext, now: number, stepSec: number, s: number): void {
    const chords: Record<number, readonly number[]> = {
      0: [110.0, 220.0, 261.63, 329.63], // Am
      8: [87.31, 174.61, 220.0, 261.63], // F
      16: [73.42, 146.83, 220.0, 293.66], // Dm
      24: [82.41, 164.81, 246.94, 329.63], // E
    };
    if (chords[s]) {
      this.playWarmPadChord(ctx, chords[s], now, stepSec * 7.6, 0.028, 720);
    }

    // Smooth sustained bass once per bar (s%8===0) with soft attack (no drum kick)
    const bassRoots = [110.0, 87.31, 73.42, 82.41]; // A2, F2, D2, E2
    const barIdx = Math.floor(s / 8);
    if (s % 8 === 0) {
      this.playSoftSustainedBass(ctx, bassRoots[barIdx], now, stepSec * 7.5, 0.068);
    }

    // Clear, lyrical melody squarely on quarter-note beats (0, 2, 4, 6)
    const leadMap: Record<number, NoteEvent> = {
      0: { freq: 440.0, len: 4 }, // A4 (Beats 1-2)
      4: { freq: 523.25, len: 2 }, // C5 (Beat 3)
      6: { freq: 493.88, len: 2 }, // B4 (Beat 4)
      8: { freq: 440.0, len: 4 }, // A4 (Beats 1-2)
      12: { freq: 349.23, len: 4 }, // F4 (Beats 3-4)
      16: { freq: 293.66, len: 2 }, // D4 (Beat 1)
      18: { freq: 349.23, len: 2 }, // F4 (Beat 2)
      20: { freq: 440.0, len: 4 }, // A4 (Beats 3-4)
      24: { freq: 329.63, len: 6 }, // E4 (Beats 1-3)
    };
    const note = leadMap[s];
    if (note) {
      this.playSoftLegatoLead(ctx, note.freq, now, note.len * stepSec * 0.94, 0.04, 1100);
    }
  }

  /**
   * 2. OPENING MOVIE: Dignified orchestral march in D minor (Dm -> Bb -> Gm -> A)
   * Straight 4/4 march: Kick on Beats 1 & 3 (0, 4), Snare on Beats 2 & 4 (2, 6).
   */
  private stepOpeningTrack(ctx: AudioContext, now: number, stepSec: number, s: number): void {
    const barStep = s % 8;
    if (barStep === 0 || barStep === 4) {
      this.playDrumKick(ctx, now, 0.11, 130, 38, 0.18);
    }
    if (barStep === 2 || barStep === 6 || s === 31) {
      this.playWarSnare(ctx, now, barStep === 2 || barStep === 6 ? 0.05 : 0.035, 0.13);
    }

    // Brass chords on Beat 1 (0) and Beat 3 (4) of each bar
    const brassChords: Record<number, readonly number[]> = {
      0: [146.83, 220.0, 293.66], // Dm (D3, A3, D4)
      4: [146.83, 220.0, 349.23], // Dm (D3, A3, F4)
      8: [116.54, 174.61, 233.08], // Bb (Bb2, F3, Bb3)
      12: [116.54, 174.61, 293.66], // Bb (Bb2, F3, D4)
      16: [98.0, 146.83, 196.0], // Gm (G2, D3, G3)
      20: [98.0, 146.83, 233.08], // Gm (G2, D3, Bb3)
      24: [110.0, 164.81, 277.18], // A major (A2, E3, C#4)
      28: [110.0, 164.81, 220.0], // A5 (A2, E3, A3)
    };
    if (brassChords[s]) {
      this.playBrassChord(ctx, brassChords[s], now, stepSec * 3.6, 0.032);
    }

    // Heroic melody squarely on Beats 1, 2, 3, 4 (0, 2, 4, 6)
    const lead: Record<number, NoteEvent> = {
      0: { freq: 293.66, len: 2 }, // D4
      2: { freq: 349.23, len: 2 }, // F4
      4: { freq: 440.0, len: 4 }, // A4
      8: { freq: 466.16, len: 2 }, // Bb4
      10: { freq: 440.0, len: 2 }, // A4
      12: { freq: 392.0, len: 4 }, // G4
      16: { freq: 349.23, len: 2 }, // F4
      18: { freq: 392.0, len: 2 }, // G4
      20: { freq: 440.0, len: 4 }, // A4
      24: { freq: 392.0, len: 2 }, // G4
      26: { freq: 349.23, len: 2 }, // F4
      28: { freq: 329.63, len: 4 }, // E4
    };
    const n = lead[s];
    if (n) {
      this.playFilteredLead(ctx, n.freq, now, n.len * stepSec * 0.92, 0.052, 1600);
    }
  }

  /**
   * 3. PROLOGUE / BRIEFING: Warm, calm chamber accompaniment in F major (Fmaj7 -> Dm7 -> Gm7 -> C7)
   * All chords, bass, and melody notes sit cleanly on Beats 1, 2, 3, 4 (0, 2, 4, 6).
   */
  private stepPrologueTrack(ctx: AudioContext, now: number, stepSec: number, s: number): void {
    const chords: Record<number, readonly number[]> = {
      0: [174.61, 220.0, 261.63, 329.63], // Fmaj7
      8: [146.83, 174.61, 220.0, 261.63], // Dm7
      16: [196.0, 233.08, 293.66, 349.23], // Gm7
      24: [130.81, 196.0, 233.08, 329.63], // C7
    };
    if (chords[s]) {
      this.playWarmPadChord(ctx, chords[s], now, stepSec * 7.5, 0.025, 800);
    }

    // Smooth sustained bass once per bar (0, 8, 16, 24) with gentle cello-like attack
    const bass: Record<number, number> = {
      0: 87.31, // F2
      8: 73.42, // D2
      16: 98.0, // G2
      24: 65.41, // C2
    };
    if (bass[s]) {
      this.playSoftSustainedBass(ctx, bass[s], now, stepSec * 7.5, 0.065);
    }

    // Gentle, unhurried melody on the main beats (0, 2, 4)
    const melody: Record<number, NoteEvent> = {
      0: { freq: 349.23, len: 2 }, // F4
      2: { freq: 392.0, len: 2 }, // G4
      4: { freq: 440.0, len: 4 }, // A4
      8: { freq: 392.0, len: 2 }, // G4
      10: { freq: 349.23, len: 2 }, // F4
      12: { freq: 293.66, len: 4 }, // D4
      16: { freq: 349.23, len: 2 }, // F4
      18: { freq: 392.0, len: 2 }, // G4
      20: { freq: 466.16, len: 4 }, // Bb4
      24: { freq: 392.0, len: 2 }, // G4
      26: { freq: 349.23, len: 2 }, // F4
      28: { freq: 329.63, len: 4 }, // E4
    };
    const m = melody[s];
    if (m) {
      this.playSoftLegatoLead(ctx, m.freq, now, m.len * stepSec * 0.94, 0.034, 940);
    }
  }

  /**
   * 4. PLANNING (SHIFT BOARD): Smooth, calm RPG strategy room theme in G minor (Gm -> Ebmaj7 -> Cm7 -> D7)
   * Zero percussion or short bass thumps (no "トトトっ" tapping sound while thinking);
   * uses warm sustained pad chords, slow-attack cello bass once per bar, and a gentle legato melody.
   */
  private stepPlanningTrack(ctx: AudioContext, now: number, stepSec: number, s: number): void {
    // Warm, sustained chords once per bar (0, 8, 16, 24)
    const chords: Record<number, readonly number[]> = {
      0: [196.0, 233.08, 293.66, 349.23], // Gm7
      8: [155.56, 196.0, 233.08, 293.66], // Ebmaj7
      16: [130.81, 155.56, 196.0, 233.08], // Cm7
      24: [146.83, 185.0, 220.0, 261.63], // D7
    };
    if (chords[s]) {
      this.playWarmPadChord(ctx, chords[s], now, stepSec * 7.6, 0.024, 860);
    }

    // Slow-attack sustained cello bass once per bar (0, 8, 16, 24) — zero percussive thumping
    const bassByBar: Record<number, number> = {
      0: 98.0, // G2
      8: 77.78, // Eb2
      16: 65.41, // C2
      24: 73.42, // D2
    };
    if (bassByBar[s]) {
      this.playSoftSustainedBass(ctx, bassByBar[s], now, stepSec * 7.5, 0.062);
    }

    // Smooth, legato melody with soft envelope attacks (no sharp transients)
    const lead: Record<number, NoteEvent> = {
      0: { freq: 392.0, len: 4 }, // G4 (Beats 1-2)
      4: { freq: 587.33, len: 4 }, // D5 (Beats 3-4)
      8: { freq: 523.25, len: 2 }, // C5 (Beat 1)
      10: { freq: 466.16, len: 2 }, // Bb4 (Beat 2)
      12: { freq: 392.0, len: 4 }, // G4 (Beats 3-4)
      16: { freq: 311.13, len: 2 }, // Eb4 (Beat 1)
      18: { freq: 392.0, len: 2 }, // G4 (Beat 2)
      20: { freq: 523.25, len: 4 }, // C5 (Beats 3-4)
      24: { freq: 440.0, len: 4 }, // A4 (Beats 1-2)
      28: { freq: 370.0, len: 4 }, // F#4 (Beats 3-4)
    };
    const l = lead[s];
    if (l) {
      this.playSoftLegatoLead(ctx, l.freq, now, l.len * stepSec * 0.94, 0.034, 1080);
    }
  }

  /**
   * 5. BATTLE: Classic Orchestral JRPG (Dragon Quest style) Encounter Intro + Symphonic Battle Theme in E Harmonic Minor
   * - `rawStep < 8` (Intro Bar): Urgent diminished/dominant orchestral fanfare ("ジャッ・ジャッ・ジャーン！")
   * - `rawStep >= 8` (8-Bar / 64-Step Loop):
   *   - Section A (Bars 1–4): Tense staccato strings ostinato + timpani + neoclassical half-step/diminished brass theme
   *   - Section B (Bars 5–8): Soaring heroic trumpet counter-melody over rapid orchestral string figures
   */
  private stepBattleTrack(ctx: AudioContext, now: number, stepSec: number, rawStep: number): void {
    // =========================================================================
    // INTRO BAR (Steps 0..7): Dragon Quest–style Encounter Fanfare Intro
    // =========================================================================
    if (rawStep < 8) {
      if (rawStep === 0) {
        // Shock chord 1: Fdim7 + Timpani
        this.playTimpani(ctx, 87.31, now, 0.16);
        this.playBrassChord(ctx, [174.61, 246.94, 293.66, 415.3], now, stepSec * 1.8, 0.048);
        this.playOrchestralTrumpet(ctx, 698.46, now, stepSec * 1.7, 0.058); // F5
      } else if (rawStep === 2) {
        // Shock chord 2: F#dim7 + Timpani
        this.playTimpani(ctx, 92.5, now, 0.16);
        this.playBrassChord(ctx, [185.0, 261.63, 311.13, 440.0], now, stepSec * 1.8, 0.05);
        this.playOrchestralTrumpet(ctx, 739.99, now, stepSec * 1.7, 0.06); // F#5
      } else if (rawStep === 4) {
        // Dominant Tutti Hit: B7(b9) ("ジャーン！")
        this.playTimpani(ctx, 61.74, now, 0.19);
        this.playWarSnare(ctx, now, 0.09, 0.15);
        this.playBrassChord(ctx, [123.47, 246.94, 311.13, 440.0, 523.25], now, stepSec * 2.8, 0.054);
        this.playOrchestralTrumpet(ctx, 987.77, now, stepSec * 2.4, 0.065); // B5
      } else if (rawStep === 6 || rawStep === 7) {
        // Urgent string & snare pickup into Bar 1
        this.playWarSnare(ctx, now, 0.075, 0.1);
        const runFreq = rawStep === 6 ? 880.0 : 739.99; // A5 -> F#5
        this.playStaccatoStrings(ctx, [runFreq / 2, runFreq], now, stepSec * 0.85, 0.048);
      }
      return;
    }

    // =========================================================================
    // MAIN 8-BAR SYMPHONIC LOOP (64 steps in E Harmonic Minor)
    // =========================================================================
    const ls = (rawStep - 8) % 64;
    const barIdx = Math.floor(ls / 8); // 0..7
    const barStep = ls % 8; // 0..7

    // 1. Pitched Orchestral Timpani & Martial Snare
    const timpaniRoots = [82.41, 82.41, 82.41, 61.74, 110.0, 98.0, 92.5, 61.74]; // E2, E2, E2, B1, A2, G2, F#2, B1
    const timpaniFifths = [61.74, 61.74, 65.41, 92.5, 82.41, 73.42, 61.74, 92.5];
    if (barStep === 0) {
      this.playTimpani(ctx, timpaniRoots[barIdx], now, 0.15);
    } else if (barStep === 4) {
      this.playTimpani(ctx, timpaniFifths[barIdx], now, 0.14);
    } else if (barStep === 7 && (barIdx % 2 === 1)) {
      this.playTimpani(ctx, timpaniRoots[barIdx], now, 0.11);
    }

    if (barStep === 2 || barStep === 6 || ls === 31 || ls === 63) {
      this.playWarSnare(ctx, now, barStep === 2 || barStep === 6 ? 0.078 : 0.055, 0.11);
    }

    // 2. Urgent Staccato Strings Ostinato ("ザッ・チャ・ザッ・チャ" across all 8 bars)
    const stringDyadsByBar: readonly (readonly number[])[] = [
      [164.81, 246.94, 329.63], // Bar 1: Em
      [164.81, 261.63, 329.63], // Bar 2: Am/E
      [164.81, 246.94, 329.63], // Bar 3: Em
      [155.56, 246.94, 369.99], // Bar 4: B7/D#
      [220.0, 261.63, 329.63],  // Bar 5: Am
      [196.0, 246.94, 293.66],  // Bar 6: G
      [185.0, 261.63, 329.63],  // Bar 7: F#dim7
      [155.56, 246.94, 369.99], // Bar 8: B7
    ];
    const dyad = stringDyadsByBar[barIdx];
    const isDownbeat = barStep % 2 === 0;
    const activeVoices = isDownbeat ? [dyad[0], dyad[1]] : [dyad[1], dyad[2]];
    this.playStaccatoStrings(
      ctx,
      activeVoices,
      now,
      stepSec * (isDownbeat ? 0.65 : 0.52),
      isDownbeat ? 0.036 : 0.028
    );

    // 3. Low Brass Harmonic Punctuation on Beats 1 & 3 (barStep 0, 4)
    if (barStep === 0 || barStep === 4) {
      this.playBrassChord(ctx, dyad, now, stepSec * 2.4, 0.032);
    }

    // 4. Symphonic Brass & String Lead Melody (64-step 2-part form)
    const battleLead: Record<number, NoteEvent> = {
      // --- SECTION A: Urgent Neoclassical Minor & Diminished Theme ---
      // Bar 1 (Em -> Fdim7/E): E5 - D#5 - E5 - F5 - E5 - B4
      0: { freq: 659.25, len: 1 },  // E5
      1: { freq: 622.25, len: 1 },  // D#5
      2: { freq: 659.25, len: 1 },  // E5
      3: { freq: 698.46, len: 1 },  // F5 (Neapolitan half-step tension)
      4: { freq: 659.25, len: 2 },  // E5
      6: { freq: 493.88, len: 2 },  // B4

      // Bar 2 (Am/E -> B7): C5 - B4 - C5 - D5 - D#5 - B4
      8: { freq: 523.25, len: 1 },  // C5
      9: { freq: 493.88, len: 1 },  // B4
      10: { freq: 523.25, len: 1 }, // C5
      11: { freq: 587.33, len: 1 }, // D5
      12: { freq: 622.25, len: 2 }, // D#5 (Harmonic minor leading tone)
      14: { freq: 493.88, len: 2 }, // B4

      // Bar 3 (Ascending sequence): E5 - G5 - F#5 - A5
      16: { freq: 659.25, len: 2 }, // E5
      18: { freq: 783.99, len: 2 }, // G5
      20: { freq: 739.99, len: 2 }, // F#5
      22: { freq: 880.0, len: 2 },  // A5

      // Bar 4 (Dominant B7b9 turnaround): G#5 - A5 - B5 - F#5 - D#5
      24: { freq: 830.61, len: 1 }, // G#5
      25: { freq: 880.0, len: 1 },  // A5
      26: { freq: 987.77, len: 2 }, // B5
      28: { freq: 739.99, len: 2 }, // F#5
      30: { freq: 622.25, len: 2 }, // D#5

      // --- SECTION B: Heroic Soaring Orchestral Trumpet Line ---
      // Bar 5 (Am -> D7): A5 (dotted quarter) - G5 - F#5 - D5
      32: { freq: 880.0, len: 3 },  // A5
      35: { freq: 783.99, len: 1 }, // G5
      36: { freq: 739.99, len: 2 }, // F#5
      38: { freq: 587.33, len: 2 }, // D5

      // Bar 6 (G -> Cmaj7): G5 (dotted quarter) - F#5 - E5 - C5
      40: { freq: 783.99, len: 3 }, // G5
      43: { freq: 739.99, len: 1 }, // F#5
      44: { freq: 659.25, len: 2 }, // E5
      46: { freq: 523.25, len: 2 }, // C5

      // Bar 7 (F#dim7 -> B7): F#5 - E5 - D#5 - F#5
      48: { freq: 739.99, len: 2 }, // F#5
      50: { freq: 659.25, len: 2 }, // E5
      52: { freq: 622.25, len: 2 }, // D#5
      54: { freq: 739.99, len: 2 }, // F#5

      // Bar 8 (Climactic turnaround into E5): B5 - A5 - G5 - F#5 - F5 - D#5
      56: { freq: 987.77, len: 3 }, // B5
      59: { freq: 880.0, len: 1 },  // A5
      60: { freq: 783.99, len: 1 }, // G5
      61: { freq: 739.99, len: 1 }, // F#5
      62: { freq: 698.46, len: 1 }, // F5
      63: { freq: 622.25, len: 1 }, // D#5
    };

    const bl = battleLead[ls];
    if (bl) {
      this.playOrchestralTrumpet(ctx, bl.freq, now, bl.len * stepSec * 0.88, 0.056);
    }
  }

  /**
   * 6. VICTORY: Celebratory march in C major (C -> F -> G -> C)
   * Straight 4/4 fanfare on Beats 1, 2, 3, 4 (0, 2, 4, 6).
   */
  private stepVictoryTrack(ctx: AudioContext, now: number, stepSec: number, s: number): void {
    const barStep = s % 8;
    if (barStep === 0 || barStep === 4) {
      this.playDrumKick(ctx, now, 0.09, 130, 42, 0.14);
    }
    if (barStep === 2 || barStep === 6 || s === 7 || s === 15 || s === 23) {
      this.playWarSnare(ctx, now, 0.045, 0.1);
    }

    const chords: Record<number, readonly number[]> = {
      0: [130.81, 196.0, 261.63, 329.63], // C
      8: [174.61, 220.0, 261.63, 349.23], // F
      16: [196.0, 246.94, 293.66, 392.0], // G
      24: [130.81, 196.0, 261.63, 392.0], // C
    };
    if (chords[s]) {
      this.playBrassChord(ctx, chords[s], now, stepSec * 7.2, 0.03);
    }

    const lead: Record<number, NoteEvent> = {
      0: { freq: 523.25, len: 2 }, // C5
      2: { freq: 659.25, len: 2 }, // E5
      4: { freq: 783.99, len: 4 }, // G5
      8: { freq: 880.0, len: 2 }, // A5
      10: { freq: 783.99, len: 2 }, // G5
      12: { freq: 698.46, len: 4 }, // F5
      16: { freq: 783.99, len: 2 }, // G5
      18: { freq: 659.25, len: 2 }, // E5
      20: { freq: 587.33, len: 4 }, // D5
      24: { freq: 523.25, len: 6 }, // C5
    };
    const l = lead[s];
    if (l) {
      this.playFilteredLead(ctx, l.freq, now, l.len * stepSec * 0.9, 0.05, 1800);
    }
  }

  /**
   * 7. GAME OVER: Deep solemn minor progression (Fm -> Db -> Eb -> C)
   * All chords and melody notes land on Beats 1 and 3 (0, 4).
   */
  private stepGameoverTrack(ctx: AudioContext, now: number, stepSec: number, s: number): void {
    const chords: Record<number, readonly number[]> = {
      0: [87.31, 130.81, 174.61, 207.65], // Fm
      8: [69.3, 103.83, 138.59, 174.61], // Db
      16: [77.78, 116.54, 155.56, 196.0], // Eb
      24: [65.41, 98.0, 130.81, 164.81], // C
    };
    if (chords[s]) {
      this.playWarmPadChord(ctx, chords[s], now, stepSec * 7.5, 0.032, 520);
    }
    if (s % 8 === 0) {
      this.playDrumKick(ctx, now, 0.08, 80, 28, 0.35);
    }
    const lead: Record<number, NoteEvent> = {
      0: { freq: 261.63, len: 4 }, // C4
      4: { freq: 207.65, len: 4 }, // Ab3
      8: { freq: 233.08, len: 4 }, // Bb3
      12: { freq: 174.61, len: 4 }, // F3
      16: { freq: 196.0, len: 4 }, // G3
      20: { freq: 155.56, len: 4 }, // Eb3
      24: { freq: 164.81, len: 6 }, // E3
    };
    const l = lead[s];
    if (l) {
      this.playFilteredLead(ctx, l.freq, now, l.len * stepSec * 0.92, 0.035, 750);
    }
  }

  // ============================================================================
  // Synth Voice Primitives (Drums, Filtered Chords, Bass, Brass & Leads)
  // ============================================================================

  private playDrumKick(
    ctx: AudioContext,
    now: number,
    peakGain: number,
    startFreq = 140,
    endFreq = 36,
    duration = 0.16
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration * 0.75);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playWarSnare(
    ctx: AudioContext,
    now: number,
    peakGain: number,
    duration = 0.14
  ): void {
    // Low taiko/snare body
    this.playDrumKick(ctx, now, peakGain * 0.85, 210, 85, duration * 0.7);

    // Filtered noise burst for snare wires
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  private playRimshot(ctx: AudioContext, now: number, peakGain: number): void {
    this.playTone(420, now, 0.045, "triangle", peakGain);
    this.playHiHat(ctx, now, peakGain * 0.6, 0.04);
  }

  private playHiHat(
    ctx: AudioContext,
    now: number,
    peakGain: number,
    duration = 0.035
  ): void {
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(6500, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  private playWarmPadChord(
    ctx: AudioContext,
    freqs: readonly number[],
    now: number,
    duration: number,
    perVoiceGain: number,
    cutoffHz: number
  ): void {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffHz, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(perVoiceGain, now + Math.min(0.18, duration * 0.25));
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }
  }

  private playBrassChord(
    ctx: AudioContext,
    freqs: readonly number[],
    now: number,
    duration: number,
    perVoiceGain: number
  ): void {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1900, now + 0.06);
    filter.frequency.exponentialRampToValueAtTime(850, now + duration);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(perVoiceGain, now + 0.025);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }
  }

  private playBassNote(
    ctx: AudioContext,
    freq: number,
    now: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playAggressiveBass(
    ctx: AudioContext,
    freq: number,
    now: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playFilteredLead(
    ctx: AudioContext,
    freq: number,
    now: number,
    duration: number,
    peakGain: number,
    cutoffHz: number
  ): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "triangle";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.003, now); // Subtle chorus warmth

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffHz, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, cutoffHz * 0.55), now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.03);
    osc2.stop(now + duration + 0.03);
  }

  private playSoftSustainedBass(
    ctx: AudioContext,
    freq: number,
    now: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(340, now);

    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.18, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.04);
  }

  private playSoftLegatoLead(
    ctx: AudioContext,
    freq: number,
    now: number,
    duration: number,
    peakGain: number,
    cutoffHz: number
  ): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = "triangle";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 1.002, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffHz, now);

    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.09, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.04);
    osc2.stop(now + duration + 0.04);
  }

  /**
   * Pitched orchestral timpani (kettledrum) with realistic transient pitch drop and warm resonant body.
   */
  private playTimpani(
    ctx: AudioContext,
    pitchHz: number,
    now: number,
    peakGain: number,
    duration = 0.24
  ): void {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    sub.type = "sine";
    osc.frequency.setValueAtTime(pitchHz * 1.24, now);
    osc.frequency.exponentialRampToValueAtTime(pitchHz, now + 0.045);
    sub.frequency.setValueAtTime(pitchHz, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(360, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    sub.start(now);
    osc.stop(now + duration + 0.03);
    sub.stop(now + duration + 0.03);
  }

  /**
   * Crisp staccato bowed-string section for Dragon Quest–style battle ostinato ("ザッ・チャ・ザッ・チャ").
   */
  private playStaccatoStrings(
    ctx: AudioContext,
    freqs: readonly number[],
    now: number,
    duration: number,
    perVoiceGain: number
  ): void {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2300, now);
    filter.frequency.exponentialRampToValueAtTime(1100, now + duration);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(perVoiceGain, now + 0.01);
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    for (const f of freqs) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      osc1.frequency.setValueAtTime(f, now);
      osc2.frequency.setValueAtTime(f * 1.004, now);
      osc1.connect(filter);
      osc2.connect(filter);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.02);
      osc2.stop(now + duration + 0.02);
    }
  }

  /**
   * Bright symphonic trumpet / horn lead for classic orchestral JRPG battle melodies.
   */
  private playOrchestralTrumpet(
    ctx: AudioContext,
    freq: number,
    now: number,
    duration: number,
    peakGain: number
  ): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "square";
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 0.5, now); // Rich horn body sub-octave

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(750, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.032);
    filter.frequency.exponentialRampToValueAtTime(1450, now + duration);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.025);
    osc2.stop(now + duration + 0.025);
  }

  // ============================================================================
  // UI & Combat Sound Effects (戦闘音・効果音)
  // ============================================================================

  /**
   * Dawn / Nightfall sky transition chime (Beat 1: "夜が明けた" / "日が暮れた")
   */
  public playTimeTransitionCue(isDay: boolean, isFullMoon = false): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (isDay) {
      // Bright morning chime (G4 -> B4 -> D5)
      this.playTone(392.0, now, 0.18, "sine", 0.036);
      this.playTone(493.88, now + 0.07, 0.22, "sine", 0.038);
      this.playTone(587.33, now + 0.14, 0.3, "sine", 0.042);
    } else if (isFullMoon) {
      // Mystical full moon bell (A4 -> E5 -> C5)
      this.playTone(440.0, now, 0.2, "sine", 0.04);
      this.playTone(659.25, now + 0.08, 0.26, "sine", 0.042);
      this.playTone(523.25, now + 0.18, 0.32, "sine", 0.038);
    } else {
      // Calm nightfall bell (B4 -> F#4 -> E4)
      this.playTone(493.88, now, 0.18, "sine", 0.035);
      this.playTone(369.99, now + 0.08, 0.22, "sine", 0.035);
      this.playTone(329.63, now + 0.16, 0.28, "sine", 0.04);
    }
  }

  /**
   * Dragon Quest–style Enemy Encounter Shock Flourish (Beat 2: "「○○」が現れた"):
   * Rapid ascending chromatic/diminished string-and-brass run ("テレレレ・テレレレ・ジャーン！")
   * that immediately launches into the symphonic "battle" BGM track!
   */
  public playEncounterCue(isDay: boolean, isBossRaid = false): void {
    void isDay;
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Rapid ascending diminished/chromatic string & brass shock run ("テレレレ・テレレレ")
    const runNotes = isBossRaid
      ? [311.13, 329.63, 369.99, 392.0, 440.0, 493.88, 554.37, 622.25] // D#4 -> D#5
      : [329.63, 349.23, 369.99, 415.3, 440.0, 493.88, 523.25, 622.25]; // E4 -> D#5
    const noteGap = 0.034;
    for (let i = 0; i < runNotes.length; i++) {
      const t = now + i * noteGap;
      const f = runNotes[i];
      this.playStaccatoStrings(ctx, [f * 0.5, f], t, 0.06, 0.045);
    }

    // 2. Dramatic Diminished-7th / Dominant Tutti Shock Chord ("ジャーン！") at the peak of the run
    const hitTime = now + runNotes.length * noteGap;
    this.playTimpani(ctx, isBossRaid ? 61.74 : 82.41, hitTime, 0.18, 0.26);
    this.playWarSnare(ctx, hitTime, 0.085, 0.14);
    this.playBrassChord(
      ctx,
      isBossRaid ? [123.47, 246.94, 311.13, 440.0, 622.25] : [164.81, 246.94, 329.63, 493.88, 659.25],
      hitTime,
      0.28,
      0.052
    );

    // 3. Synchronize the "battle" BGM track so its orchestral intro & symphonic loop kick in right after the shock hit!
    this.currentTrack = "battle";
    this.stepIndex = 0;
    this.nextNoteTime = hitTime + 0.24;
  }

  public playShiftStamp(shift: "day" | "night" | "off"): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (shift === "day") {
      this.playTone(523.25, now, 0.08, "triangle", 0.06);
      this.playTone(659.25, now + 0.04, 0.11, "triangle", 0.065);
    } else if (shift === "night") {
      this.playTone(440.0, now, 0.09, "sine", 0.065);
      this.playTone(659.25, now + 0.04, 0.12, "sine", 0.055);
    } else {
      this.playTone(261.63, now, 0.07, "sine", 0.05);
      this.playTone(196.0, now + 0.03, 0.09, "sine", 0.045);
    }
  }

  public playHintSound(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone(587.33, now, 0.1, "triangle", 0.07);
    this.playTone(880.0, now + 0.08, 0.16, "triangle", 0.075);
  }

  public playErrorSound(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playDrumKick(ctx, now, 0.12, 160, 42, 0.2);
    this.playTone(155.56, now, 0.16, "sawtooth", 0.05);
    this.playTone(130.81, now + 0.1, 0.22, "sawtooth", 0.05);
  }

  public playClick(shift: "day" | "night" | "off"): void {
    this.playShiftStamp(shift);
  }

  public playSolveSuccess(): void {
    this.playHintSound();
  }

  public playError(): void {
    this.playErrorSound();
  }

  /**
   * Metallic sword-on-sword / weapon clash + impact thud for combat ticks
   */
  public playBattleClashTick(step = 0): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Low physical weapon impact thud
    this.playDrumKick(ctx, now, 0.11, 180 + step * 25, 50, 0.09);

    // 2. Metallic steel-clash partials (inharmonic ring)
    const clangSets: readonly (readonly number[])[] = [
      [780, 1290, 2140],
      [920, 1510, 2480],
      [1060, 1740, 2890],
    ];
    const partials = clangSets[step % clangSets.length];
    for (const freq of partials) {
      this.playTone(freq, now, 0.075, "square", 0.024);
    }

    // 3. Crisp steel slash noise burst
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(3600 + step * 500, now);
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.065);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.08);
    }
  }

  /**
   * Decisive shield-block parry + counter-slash + heroic chord when winning a slot battle
   */
  public playBattleWin(isPerfect = false): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Shield block impact + snare snap
    this.playDrumKick(ctx, now, 0.14, 190, 45, 0.14);
    this.playWarSnare(ctx, now, 0.08, 0.11);

    // Metallic counter-slash ring
    this.playTone(1180, now, 0.09, "square", 0.025);
    this.playTone(1860, now + 0.02, 0.11, "triangle", 0.03);

    // Heroic brass/chord hit
    if (isPerfect) {
      this.playBrassChord(ctx, [261.63, 329.63, 392.0, 523.25], now + 0.04, 0.28, 0.045);
    } else {
      this.playBrassChord(ctx, [220.0, 277.18, 329.63], now + 0.04, 0.22, 0.038);
    }
  }

  /**
   * Heavy stone-gate breach explosion, rumble & shattering impact when losing a slot battle
   */
  public playBattleBreach(): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Massive sub-bass gate impact boom
    this.playDrumKick(ctx, now, 0.22, 130, 24, 0.38);

    // 2. Low-frequency stone collapse rumble (filtered noise)
    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.38);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.42);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.45);
    }

    // 3. Dissonant danger brass stab
    this.playBrassChord(ctx, [110.0, 155.56, 207.65], now + 0.02, 0.34, 0.045);
  }

  public playVictoryFanfare(isOptimalS = true): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    this.playWarSnare(ctx, now, 0.075, 0.12);
    this.playDrumKick(ctx, now + 0.12, 0.12, 140, 40, 0.18);

    const notes = isOptimalS
      ? [261.63, 329.63, 392.0, 523.25]
      : [261.63, 311.13, 392.0, 523.25];

    notes.forEach((freq, idx) => {
      this.playFilteredLead(ctx, freq, now + idx * 0.09, 0.32, 0.055, 1900);
    });
  }

  public playOpeningCutChime(cutIndex: number): void {
    if (this.isMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    this.playDrumKick(ctx, now, 0.08, 110, 38, 0.2);
    const chords: readonly (readonly number[])[] = [
      [146.83, 220.0, 293.66],
      [130.81, 196.0, 246.94],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 293.66],
      [146.83, 220.0, 293.66, 440.0],
    ];
    this.playWarmPadChord(ctx, chords[cutIndex % chords.length], now, 0.65, 0.032, 950);
  }

  private playTone(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peakGain: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export const soundEngine = new GameAudioEngine();
