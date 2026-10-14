// Sons sintetizados com WebAudio (nenhum arquivo de áudio externo, sem questões de licença).
// O contexto de áudio só é criado após um gesto do jogador, como exigem os navegadores.

export interface AudioSettings {
  master: number; // 0..1
  sfx: number;
  ambience: number;
  muted: boolean;
}

class Sfx {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private sfxGain!: GainNode;
  private ambGain!: GainNode;
  private noise!: AudioBuffer;
  private ambienceOn = false;
  private musicTimer: number | null = null;
  settings: AudioSettings = { master: 0.7, sfx: 0.8, ambience: 0.35, muted: false };
  private lastPlay: Record<string, number> = {};

  /** Chamado no primeiro clique/tecla. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.ambGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.ambGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    this.startAmbience();
  }

  apply(): void {
    if (!this.ctx) return;
    const m = this.settings.muted ? 0 : this.settings.master;
    this.masterGain.gain.value = m;
    this.sfxGain.gain.value = this.settings.sfx;
    this.ambGain.gain.value = this.settings.ambience;
  }

  private throttle(name: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.lastPlay[name] || 0) < ms) return false;
    this.lastPlay[name] = now;
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slide = 0, out?: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, vol: number, when = 0, q = 1, out?: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(out || this.sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  click(): void {
    this.tone(660, 0.05, 'square', 0.05);
  }
  bubble(): void {
    if (!this.throttle('bubble', 140)) return;
    const f = 280 + Math.random() * 260;
    this.tone(f, 0.09, 'sine', 0.08, 0, f * 1.4);
  }
  clink(): void {
    if (!this.throttle('clink', 90)) return;
    this.tone(1900 + Math.random() * 400, 0.18, 'triangle', 0.06);
    this.tone(2800, 0.1, 'sine', 0.03, 0.02);
  }
  chop(): void {
    if (!this.throttle('chop', 160)) return;
    this.noiseBurst(0.05, 1800, 0.12, 0, 2);
  }
  step(): void {
    if (!this.throttle('step', 220)) return;
    this.noiseBurst(0.04, 500, 0.06, 0, 1.5);
  }
  coin(): void {
    if (!this.throttle('coin', 80)) return;
    this.tone(988, 0.07, 'square', 0.05);
    this.tone(1319, 0.16, 'square', 0.05, 0.07);
  }
  success(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.07, i * 0.09));
  }
  fail(): void {
    this.tone(220, 0.35, 'sawtooth', 0.05, 0, -120);
    this.noiseBurst(0.3, 400, 0.08, 0.02, 0.8);
  }
  event(): void {
    [784, 988, 1175].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.06, i * 0.12));
  }
  upgrade(): void {
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, i * 0.06));
  }
  error(): void {
    this.tone(180, 0.12, 'square', 0.05);
    this.tone(140, 0.16, 'square', 0.05, 0.1);
  }
  door(): void {
    if (!this.throttle('door', 300)) return;
    this.tone(1568, 0.3, 'sine', 0.04);
    this.tone(2093, 0.35, 'sine', 0.03, 0.05);
  }
  victory(): void {
    [523, 659, 784, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.08, i * 0.14));
  }
  defeat(): void {
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.07, i * 0.22));
  }

  /** Ambiente: crepitar do fogo + melodia suave e lenta. */
  private startAmbience(): void {
    if (!this.ctx || this.ambienceOn) return;
    this.ambienceOn = true;
    const notes = [220, 262, 294, 330, 392, 440, 523];
    let i = 0;
    const tick = () => {
      if (!this.ctx) return;
      if (this.settings.ambience > 0.01 && !this.settings.muted) {
        this.noiseBurst(0.03, 2500 + Math.random() * 1500, 0.04, Math.random() * 0.3, 3, this.ambGain);
        if (i % 4 === 0) {
          const f = notes[Math.floor(Math.random() * notes.length)];
          this.tone(f / 2, 1.8, 'sine', 0.05, 0, 0, this.ambGain);
          this.tone(f, 1.2, 'triangle', 0.025, 0.4, 0, this.ambGain);
        }
      }
      i++;
    };
    this.musicTimer = window.setInterval(tick, 600);
  }

  stopAmbience(): void {
    if (this.musicTimer != null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.ambienceOn = false;
  }
}

export const sfx = new Sfx();
