/**
 * Minimal sound effects via Web Audio API.
 * ponytail: no files, no deps — oscillator beeps. Swap for mp3s when ready.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function beep(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
  } catch {
    // Audio not available (SSR, policy block, etc.)
  }
}

/** 매매 체결 — 짧은 코인 느낌 차임 */
export function sfxTrade() {
  beep(880, 0.08, "square", 0.1);
  setTimeout(() => beep(1174, 0.12, "square", 0.08), 60);
}

/** 게시글 작성 — 부드러운 팝 */
export function sfxPost() {
  beep(520, 0.1, "sine", 0.12);
  setTimeout(() => beep(660, 0.08, "sine", 0.1), 80);
}
