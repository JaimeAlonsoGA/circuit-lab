'use client';
/** Tiny WebAudio engine: continuous tones per component + one-shot effects. Created lazily after a user gesture. */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<string, { osc: OscillatorNode; gain: GainNode }>();
  muted = false;

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.12, this.ctx.currentTime, 0.02);
  }

  /** Sync the set of sounding voices: id → frequency (Hz). */
  sync(tones: Record<string, { f: number; type: OscillatorType }>) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    for (const [id, v] of this.voices) {
      if (!tones[id]) {
        v.gain.gain.setTargetAtTime(0, now, 0.01);
        v.osc.stop(now + 0.1);
        this.voices.delete(id);
      }
    }
    for (const [id, { f, type }] of Object.entries(tones)) {
      let v = this.voices.get(id);
      if (!v) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        osc.type = type;
        osc.connect(gain).connect(this.master);
        osc.start();
        gain.gain.setTargetAtTime(0.5, now, 0.01);
        v = { osc, gain };
        this.voices.set(id, v);
      }
      v.osc.frequency.setTargetAtTime(f, now, 0.005);
    }
  }

  private noise(dur: number, freq: number, vol: number) {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filt).connect(g).connect(this.master);
    src.start();
  }

  pop() { this.noise(0.35, 900, 6); }
  click() { this.noise(0.03, 3000, 3); }
  zap() { this.noise(0.12, 4000, 2.5); }
}

export const audio = new AudioEngine();
