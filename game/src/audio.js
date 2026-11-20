// Synthesised sound, no audio assets: WebAudio oscillators plus filtered
// noise. The context is created lazily on the first user gesture, so the
// browser's autoplay rules never block it.
export function createAudio() {
  let ctx = null;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  // Short burst of filtered noise with a linear decay — gunshots, explosions.
  function burst(dur, cutoff, gain) {
    const c = ensure();
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const out = c.createGain();
    out.gain.value = gain;
    src.connect(filter);
    filter.connect(out);
    out.connect(c.destination);
    src.start();
  }

  // Single oscillator note with an exponential fade — beeps, hits, jingles.
  function blip(freq, dur, gain, type = 'sine') {
    const c = ensure();
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const out = c.createGain();
    out.gain.setValueAtTime(gain, c.currentTime);
    out.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.connect(out);
    out.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur);
  }

  return {
    unlock() {
      ensure();
    },
    shot() {
      burst(0.09, 1800, 0.25);
    },
    hit() {
      blip(1200, 0.06, 0.15, 'square');
    },
    kill() {
      blip(880, 0.12, 0.2, 'square');
      blip(1320, 0.1, 0.12, 'square');
    },
    reload() {
      blip(440, 0.08, 0.1, 'triangle');
    },
    plant() {
      blip(660, 0.15, 0.2, 'square');
    },
    beep() {
      blip(990, 0.07, 0.15, 'square');
    },
    explode() {
      burst(0.7, 300, 0.5);
      blip(60, 0.6, 0.4, 'sine');
    },
    round() {
      blip(523, 0.15, 0.18, 'triangle');
      blip(784, 0.25, 0.18, 'triangle');
    },
  };
}
