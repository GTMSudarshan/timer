/**
 * One shared AudioContext for every UI sound.
 * Creating a context per tick exhausts the browser limit (~6) and makes all
 * sounds silently stop working after a few seconds.
 */
let context = null;

function getContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!context || context.state === "closed") context = new AudioCtx();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

/** Call from the first user gesture so later timer sounds aren't blocked. */
export function unlockAudio() {
  getContext();
}

export function playTone(freqs, vol = 0.18, spacing = 0.18, type = "sine") {
  const ctx = getContext();
  if (!ctx) return;
  try {
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      const start = ctx.currentTime + index * spacing;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  } catch {
    // Audio is a nice-to-have, never a reason to break the timer.
  }
}

export function playTick() {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 900;
    osc.type = "square";
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // ignore
  }
}

export function closeAudio() {
  if (context && context.state !== "closed") context.close().catch(() => {});
  context = null;
}

export const playFocusEnd = () => playTone([528, 660, 784, 660], 0.2, 0.14);
export const playBreakEnd = () => playTone([392, 330], 0.12, 0.22);
export const playStart = () => playTone([440, 550], 0.1, 0.1);
export const playPause = () => playTone([330, 260], 0.08, 0.1);
