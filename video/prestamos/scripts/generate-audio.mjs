#!/usr/bin/env node
/**
 * Genera la capa de audio local del video de préstamos.
 *
 *   node scripts/generate-audio.mjs
 *
 * Salidas (todas locales, sin red):
 *   assets/bgm.mp3    · pad corporativo/tech de 60 s (80 BPM, 5 ciclos de 12 s)
 *   assets/click.wav  · click suave de UI
 *   assets/success.wav· ding brillante para aprobaciones/cierres
 *
 * El WAV de la música se genera con Node puro y se comprime a MP3 con FFmpeg.
 * El script es determinista: no usa Math.random() ni descarga nada.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'assets');
const SR = 44100;
const DURATION = 60;

mkdirSync(ASSETS, { recursive: true });

/* ------------------------------------------------------------------ */
/* Utilidades de audio                                                */
/* ------------------------------------------------------------------ */

const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function createBuffer(seconds) {
  const length = Math.round(seconds * SR);
  return { left: new Float64Array(length), right: new Float64Array(length), length };
}

/** PRNG determinista (xorshift32). */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0x100000000) * 2 - 1;
  };
}

/** Paneo de potencia constante. */
function panGains(pan) {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Añade una nota senoidal con armónicos, detune y envolvente.
 * `decay` activa una cola exponencial; si no, usa ataque/sostenido/release.
 */
function addTone(buffer, options) {
  const {
    start,
    duration,
    frequency,
    amplitude,
    pan = 0,
    attack = 0.01,
    release = 0.2,
    decay = 0,
    detune = 0,
    harmonics = [1],
  } = options;
  const startSample = Math.max(0, Math.round(start * SR));
  const endSample = Math.min(buffer.length, Math.round((start + duration) * SR));
  const [leftGain, rightGain] = panGains(pan);
  const detuneLow = 1 - detune;
  const detuneHigh = 1 + detune;

  for (let i = startSample; i < endSample; i += 1) {
    const t = (i - startSample) / SR;
    let envelope;
    if (decay > 0) {
      envelope = Math.exp(-t / decay);
    } else {
      const attackEnv = smoothstep(t / Math.max(0.0001, attack));
      const releaseEnv = smoothstep((duration - t) / Math.max(0.0001, release));
      envelope = attackEnv * releaseEnv;
    }
    if (envelope < 1e-6) continue;

    let sample = 0;
    for (let h = 0; h < harmonics.length; h += 1) {
      const harmonic = harmonics[h];
      const freq = frequency * (h + 1) * harmonic.mult;
      const phase = 2 * Math.PI * freq * t;
      let voice = Math.sin(phase);
      if (detune > 0) {
        voice = (voice + Math.sin(2 * Math.PI * freq * detuneLow * t)) * 0.5;
        voice += Math.sin(2 * Math.PI * freq * detuneHigh * t) * 0.5;
        voice *= 0.5;
      }
      sample += harmonic.amp * voice;
    }

    const value = sample * amplitude * envelope;
    buffer.left[i] += value * leftGain;
    buffer.right[i] += value * rightGain;
  }
}

/** Golpe grave suave (corazón rítmico, no un kick de club). */
function addKick(buffer, start, amplitude = 0.2) {
  const duration = 0.32;
  const startSample = Math.max(0, Math.round(start * SR));
  const endSample = Math.min(buffer.length, Math.round((start + duration) * SR));
  let phase = 0;
  for (let i = startSample; i < endSample; i += 1) {
    const t = (i - startSample) / SR;
    const frequency = 42 + 70 * Math.exp(-t / 0.045);
    phase += (2 * Math.PI * frequency) / SR;
    const envelope = Math.exp(-t / 0.11) * smoothstep(t / 0.004);
    const value = Math.sin(phase) * amplitude * envelope;
    buffer.left[i] += value;
    buffer.right[i] += value;
  }
}

/** Shaker/air de octavos a contratiempo, muy discreto. */
function addShaker(buffer, start, amplitude = 0.05, pan = 0) {
  const random = createRandom(0x51ed270b ^ Math.round(start * 1000));
  const duration = 0.1;
  const startSample = Math.max(0, Math.round(start * SR));
  const endSample = Math.min(buffer.length, Math.round((start + duration) * SR));
  const [leftGain, rightGain] = panGains(pan);
  let previous = 0;
  for (let i = startSample; i < endSample; i += 1) {
    const t = (i - startSample) / SR;
    const noise = random();
    const bright = noise - previous * 0.72;
    previous = noise;
    const envelope = Math.exp(-t / 0.028) * smoothstep(t / 0.003);
    const value = bright * amplitude * envelope;
    buffer.left[i] += value * leftGain;
    buffer.right[i] += value * rightGain;
  }
}

/** Normaliza al pico indicado y aplica un fade global. */
function finishBuffer(buffer, { peak = 0.9, fadeIn = 0, fadeOut = 0 } = {}) {
  let maximum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    maximum = Math.max(maximum, Math.abs(buffer.left[i]), Math.abs(buffer.right[i]));
  }
  const gain = maximum > 0 ? peak / maximum : 1;
  const fadeOutStart = buffer.length - Math.round(fadeOut * SR);
  for (let i = 0; i < buffer.length; i += 1) {
    let envelope = 1;
    if (fadeIn > 0) {
      envelope *= smoothstep(i / (fadeIn * SR));
    }
    if (fadeOut > 0 && i >= fadeOutStart) {
      envelope *= smoothstep((buffer.length - i) / (fadeOut * SR));
    }
    buffer.left[i] *= gain * envelope;
    buffer.right[i] *= gain * envelope;
  }
}

/** WAV PCM 16-bit estéreo (sin dependencias). */
function writeWav(path, buffer) {
  const channels = 2;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = SR * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(SR, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    const left = clamp(buffer.left[i], -1, 1);
    const right = clamp(buffer.right[i], -1, 1);
    wav.writeInt16LE(Math.round(left * 32767), offset);
    wav.writeInt16LE(Math.round(right * 32767), offset + 2);
    offset += 4;
  }

  writeFileSync(path, wav);
}

/* ------------------------------------------------------------------ */
/* Música de fondo (60 s, 80 BPM, Cmaj7 · Am7 · Fmaj7 · G6/9)         */
/* ------------------------------------------------------------------ */

function buildMusic() {
  const buffer = createBuffer(DURATION);
  const beat = 60 / 80; // 0.75 s
  const chordDuration = beat * 4; // 3 s
  const cycleDuration = chordDuration * 4; // 12 s
  const cycles = DURATION / cycleDuration; // 5

  const progression = [
    {
      name: 'Cmaj7',
      pad: [48, 55, 60, 64, 71], // C3 G3 C4 E4 B4
      bass: 36, // C2
      arp: [60, 64, 67, 71, 72, 76, 79, 84],
    },
    {
      name: 'Am7',
      pad: [45, 52, 57, 60, 67], // A2 E3 A3 C4 G4
      bass: 45, // A2
      arp: [57, 60, 64, 67, 69, 72, 76, 79],
    },
    {
      name: 'Fmaj7',
      pad: [41, 48, 53, 57, 64], // F2 C3 F3 A3 E4
      bass: 41, // F2
      arp: [53, 57, 60, 64, 65, 69, 72, 76],
    },
    {
      name: 'G6/9',
      pad: [43, 50, 55, 59, 64, 69], // G2 D3 G3 B3 E4 A4
      bass: 43, // G2
      arp: [55, 59, 62, 64, 67, 71, 74, 79],
    },
  ];

  const padPan = [-0.42, 0.28, -0.12, 0.48, 0.08];
  const arpPattern = [0, 4, 2, 6, 1, 5, 3, 7];
  const arpPan = [-0.52, 0.48, -0.24, 0.3, -0.34, 0.56, -0.12, 0.22];

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (let chordIndex = 0; chordIndex < progression.length; chordIndex += 1) {
      const chord = progression[chordIndex];
      const start = cycle * cycleDuration + chordIndex * chordDuration;

      // Pad: cada voz entra con ataque lento y se solapa con el siguiente acorde.
      chord.pad.forEach((midi, voice) => {
        addTone(buffer, {
          start,
          duration: chordDuration + 0.36,
          frequency: midiToFreq(midi),
          amplitude: 0.045,
          pan: padPan[voice % padPan.length],
          attack: 0.62,
          release: 0.72,
          detune: 0.0011,
          harmonics: [
            { mult: 1, amp: 1 },
            { mult: 2, amp: 0.24 },
            { mult: 3, amp: 0.08 },
          ],
        });
      });

      // Bajo cálido, una octava por debajo del pad.
      addTone(buffer, {
        start,
        duration: chordDuration - 0.12,
        frequency: midiToFreq(chord.bass),
        amplitude: 0.17,
        attack: 0.035,
        release: 0.32,
        harmonics: [
          { mult: 1, amp: 1 },
          { mult: 2, amp: 0.18 },
        ],
      });

      // Arpegio de plucks: da movimiento "tech" sin robar protagonismo.
      for (let step = 0; step < 8; step += 1) {
        const note = chord.arp[arpPattern[step]];
        addTone(buffer, {
          start: start + step * (beat / 2),
          duration: 0.72,
          frequency: midiToFreq(note),
          amplitude: 0.052,
          pan: arpPan[step],
          attack: 0.006,
          decay: 0.17,
          detune: 0.0008,
          harmonics: [
            { mult: 1, amp: 1 },
            { mult: 2, amp: 0.26 },
            { mult: 3, amp: 0.1 },
          ],
        });
      }

      // Pulso grave en negras 1 y 3, y shaker en contratiempos.
      addKick(buffer, start, 0.16);
      addKick(buffer, start + beat * 2, 0.12);
      for (let step = 0; step < 4; step += 1) {
        addShaker(
          buffer,
          start + beat / 2 + step * beat,
          0.036,
          step % 2 === 0 ? -0.62 : 0.62,
        );
      }
    }
  }

  finishBuffer(buffer, { peak: 0.92, fadeIn: 1.2, fadeOut: 2.8 });
  return buffer;
}

/* ------------------------------------------------------------------ */
/* SFX                                                                */
/* ------------------------------------------------------------------ */

function buildClick() {
  const buffer = createBuffer(0.16);
  const random = createRandom(0x0badc0de);
  let previous = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    const t = i / SR;
    const attack = smoothstep(t / 0.0015);

    const tick = Math.sin(2 * Math.PI * 1850 * t) * 0.52 * Math.exp(-t / 0.016);
    const body = Math.sin(2 * Math.PI * 920 * t) * 0.3 * Math.exp(-t / 0.032);

    const noise = random();
    const bright = noise - previous * 0.55;
    previous = noise;
    const air = bright * 0.32 * Math.exp(-t / 0.008);

    const value = (tick + body + air) * attack;
    buffer.left[i] += value;
    buffer.right[i] += value;
  }

  finishBuffer(buffer, { peak: 0.62, fadeOut: 0.04 });
  return buffer;
}

function buildSuccess() {
  const buffer = createBuffer(1.9);
  const random = createRandom(0x5ecc3550);

  // E6 · B6 · E7: una quinta perfecta que encaja con los cuatro acordes.
  const notes = [
    { start: 0.0, midi: 76, amp: 0.25, decay: 0.55 }, // E5
    { start: 0.035, midi: 88, amp: 0.32, decay: 0.48 }, // E6
    { start: 0.085, midi: 95, amp: 0.24, decay: 0.4 }, // B6
    { start: 0.15, midi: 100, amp: 0.16, decay: 0.3 }, // E7
  ];

  notes.forEach((note, index) => {
    addTone(buffer, {
      start: note.start,
      duration: 1.8,
      frequency: midiToFreq(note.midi),
      amplitude: note.amp,
      pan: 0.16 - index * 0.1,
      attack: 0.004,
      decay: note.decay,
      detune: 0.0006,
      harmonics: [
        { mult: 1, amp: 1 },
        { mult: 2, amp: 0.22 },
        { mult: 3, amp: 0.08 },
      ],
    });
  });

  // Destello de aire, muy corto, para que el ding no sea un seno puro.
  let previous = 0;
  for (let i = 0; i < Math.round(0.4 * SR); i += 1) {
    const t = i / SR;
    const noise = random();
    const bright = noise - previous * 0.82;
    previous = noise;
    const value = bright * 0.03 * Math.exp(-t / 0.08) * smoothstep(t / 0.002);
    buffer.left[i] += value * 0.7;
    buffer.right[i] += value;
  }

  finishBuffer(buffer, { peak: 0.82, fadeOut: 0.35 });
  return buffer;
}

/* ------------------------------------------------------------------ */
/* Escritura y compresión                                             */
/* ------------------------------------------------------------------ */

function encodeMp3(wavPath, mp3Path) {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', wavPath,
      '-af',
      [
        'highpass=f=26',
        'lowpass=f=11500',
        'aecho=0.92:0.8:120|240:0.18|0.10',
        'acompressor=threshold=-20dB:ratio=2.2:attack=25:release=280:makeup=2',
        'alimiter=limit=0.95',
        'afade=t=in:st=0:d=1.2',
        'afade=t=out:st=57.2:d=2.8',
      ].join(','),
      '-codec:a', 'libmp3lame',
      '-b:a', '192k',
      '-ar', String(SR),
      '-id3v2_version', '0',
      mp3Path,
    ],
    { stdio: 'inherit' },
  );
}

console.log('→ Generando música de fondo (60 s, 80 BPM)...');
const musicWav = resolve(ASSETS, 'bgm.wav');
const musicMp3 = resolve(ASSETS, 'bgm.mp3');
writeWav(musicWav, buildMusic());
encodeMp3(musicWav, musicMp3);
rmSync(musicWav, { force: true });

console.log('→ Generando SFX...');
writeWav(resolve(ASSETS, 'click.wav'), buildClick());
writeWav(resolve(ASSETS, 'success.wav'), buildSuccess());

for (const file of ['bgm.mp3', 'click.wav', 'success.wav']) {
  const path = resolve(ASSETS, file);
  const kb = (statSync(path).size / 1024).toFixed(1);
  console.log(`  ✓ assets/${file} (${kb} KB)`);
}
