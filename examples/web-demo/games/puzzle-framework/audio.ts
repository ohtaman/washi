import type { SoundType } from "./types.js";

export interface AudioManager {
  playSound: (type: SoundType) => void;
  isMuted: boolean;
  toggleMute: () => boolean;
}

export function createAudioManager(): AudioManager {
  let ctx: AudioContext | null = null;
  let isMuted = false;

  const ensureCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        ctx = new AudioCtx();
      }
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  };

  const playSound = (type: SoundType): void => {
    if (isMuted) return;
    const audioCtx = ensureCtx();
    if (!audioCtx) return;

    try {
      const now = audioCtx.currentTime;

      switch (type) {
        case "tap": {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }

        case "undo": {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }

        case "restart": {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        }

        case "hint": {
          const notes = [659.25, 880.0, 1174.66]; // E5, A5, D6
          notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const noteStart = now + idx * 0.05;
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, noteStart);
            gain.gain.setValueAtTime(0.1, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.12);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(noteStart);
            osc.stop(noteStart + 0.12);
          });
          break;
        }

        case "clear": {
          // Playful major triad arpeggio
          const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
          chord.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const noteStart = now + idx * 0.08;
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, noteStart);
            gain.gain.setValueAtTime(0.15, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(noteStart);
            osc.stop(noteStart + 0.25);
          });
          break;
        }

        case "invalid": {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(140, now);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }
      }
    } catch {
      // Audio autoplay restriction or device failure, fail silently
    }
  };

  const toggleMute = (): boolean => {
    isMuted = !isMuted;
    return isMuted;
  };

  return {
    playSound,
    get isMuted() {
      return isMuted;
    },
    toggleMute,
  };
}
