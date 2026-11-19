// Every sound in Solmar City is synthesised with WebAudio — no audio files, nothing to load.
// A lazy AudioContext wakes on the first key or click. One-shots (shots, punches, crashes,
// chimes) are built from oscillators and filtered noise; the engine and the nearest siren are
// two looping nodes whose pitch and volume the game steers each frame; the music is a slow
// lookahead sequencer playing a warm four-chord loop with a soft bass and a brushed hat.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicOn = false;
  let nextNoteTime = 0;
  let beat = 0;

  function unlock() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();

    musicOn = true;
    nextNoteTime = ctx.currentTime + 0.1;
  }

  function noiseBuffer() {
    const length = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  let sharedNoise = null;
  function noise() {
    if (sharedNoise === null) sharedNoise = noiseBuffer();
    const source = ctx.createBufferSource();
    source.buffer = sharedNoise;
    return source;
  }

  function burst({ at = 0, dur = 0.12, freq = 1200, q = 0.8, gain = 0.3, type = 'bandpass' }) {
    if (ctx === null) return;
    const t = ctx.currentTime + at;
    const src = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone({ at = 0, dur = 0.15, freq = 440, slide = 0, gain = 0.2, type = 'sine' }) {
    if (ctx === null) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // The music loop: Am7 — Fmaj7 — Cmaj7 — G6, one chord a bar, a bass note on the beat.
  const CHORDS = [
    [110.0, 164.81, 196.0, 261.63],
    [87.31, 130.81, 174.61, 220.0],
    [98.0, 146.83, 196.0, 246.94],
    [130.81, 196.0, 261.63, 329.63],
  ];
  const BEAT_SECONDS = 0.46;

  function scheduleMusic() {
    if (ctx === null || !musicOn) return;
    while (nextNoteTime < ctx.currentTime + 0.18) {
      const at = nextNoteTime - ctx.currentTime;
      const bar = Math.floor(beat / 4) % CHORDS.length;
      const chord = CHORDS[bar];
      if (beat % 4 === 0) {
        for (const freq of chord) tone({ at, dur: BEAT_SECONDS * 4.1, freq, gain: 0.028, type: 'triangle' });
        tone({ at, dur: BEAT_SECONDS * 2, freq: chord[0] / 2, gain: 0.06, type: 'sine' });
      }
      if (beat % 2 === 0) tone({ at: at + BEAT_SECONDS / 2, dur: BEAT_SECONDS, freq: chord[0] / 2, gain: 0.035, type: 'sine' });
      burst({ at, dur: 0.03, freq: 7000, gain: 0.012, type: 'highpass' });
      nextNoteTime += BEAT_SECONDS;
      beat += 1;
    }
  }

  return {
    unlock,
    /** Call every frame: steers the engine and siren loops and keeps the music scheduled. */
    tick(engineLevel, sirenLevel, time) {
      if (ctx === null) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(engineLevel * 0.12, t, 0.06);
      engineOsc.frequency.setTargetAtTime(55 + engineLevel * 165, t, 0.06);
      sirenGain.gain.setTargetAtTime(sirenLevel * 0.05, t, 0.1);
      sirenOsc.frequency.setTargetAtTime(720 + Math.sin(time * 5.2) * 190, t, 0.03);
      scheduleMusic();
    },
    shoot() {
      burst({ dur: 0.14, freq: 900, gain: 0.4 });
      tone({ dur: 0.09, freq: 160, slide: -90, gain: 0.3, type: 'square' });
    },
    punch() {
      burst({ dur: 0.08, freq: 300, gain: 0.3, type: 'lowpass' });
    },
    hurt() {
      tone({ dur: 0.16, freq: 220, slide: -120, gain: 0.22, type: 'sawtooth' });
    },
    crash(strength) {
      burst({ dur: 0.22, freq: 500, gain: Math.min(0.5, 0.15 + strength * 0.4), type: 'lowpass' });
      tone({ dur: 0.18, freq: 90, slide: -40, gain: 0.25, type: 'square' });
    },
    door() {
      tone({ dur: 0.07, freq: 300, gain: 0.12, type: 'square' });
      tone({ at: 0.08, dur: 0.09, freq: 210, gain: 0.14, type: 'square' });
    },
    pickup() {
      tone({ dur: 0.09, freq: 660, gain: 0.16 });
      tone({ at: 0.07, dur: 0.12, freq: 990, gain: 0.16 });
    },
    cash() {
      tone({ dur: 0.07, freq: 1180, gain: 0.14, type: 'square' });
      tone({ at: 0.06, dur: 0.1, freq: 1560, gain: 0.14, type: 'square' });
    },
    blip() {
      tone({ dur: 0.05, freq: 840, gain: 0.08, type: 'square' });
    },
    sting(success) {
      const base = success ? [523.25, 659.25, 783.99, 1046.5] : [392, 329.63, 261.63, 196];
      base.forEach((freq, i) => tone({ at: i * 0.09, dur: 0.22, freq, gain: 0.14, type: 'triangle' }));
    },
    explosion() {
      burst({ dur: 0.7, freq: 160, gain: 0.6, type: 'lowpass' });
      tone({ dur: 0.6, freq: 70, slide: -30, gain: 0.4, type: 'sine' });
    },
    splash() {
      burst({ dur: 0.3, freq: 800, gain: 0.2 });
    },
  };
}
