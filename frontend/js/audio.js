// === 8-bit 音效 (Web Audio 现场合成,无音频文件) ===

let audioCtx = null;
let muted = false;

function getCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
  }
  return audioCtx;
}

function beep(freq, duration, type = 'square', volume = 0.1) {
  if (muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

const Audio = {
  correct() {
    beep(523, 0.1);
    setTimeout(() => beep(659, 0.1), 100);
    setTimeout(() => beep(784, 0.2), 200);
  },
  wrong() {
    beep(200, 0.3, 'sawtooth', 0.08);
  },
  key() {
    beep(800, 0.05, 'square', 0.05);
  },
  levelUp() {
    beep(523, 0.1);
    setTimeout(() => beep(659, 0.1), 100);
    setTimeout(() => beep(784, 0.1), 200);
    setTimeout(() => beep(1047, 0.3), 300);
  },
  combo(n) {
    beep(400 + n * 50, 0.08, 'square', 0.08);
  },
  toggle() {
    muted = !muted;
    return muted;
  },
  isMuted() {
    return muted;
  },
  // 浏览器策略:第一次用户交互后才能播放,这个函数解锁
  unlock() {
    getCtx();
  },
};

window.Audio = Audio;
