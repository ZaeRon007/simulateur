import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly muted = signal(false);

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Engine nodes
  private engineNoise: AudioBufferSourceNode | null = null;
  private engineThump: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Call ringtone
  private callLoopActive = false;
  private callTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted() ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** Call on a user gesture to unlock the AudioContext. */
  unlock(): void {
    this.ensureContext();
  }

  toggleMute(): void {
    const nowMuted = !this.muted();
    this.muted.set(nowMuted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(nowMuted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
  }

  startEngine(): void {
    if (this.engineNoise) return;
    const ctx = this.ensureContext();

    // 2-second looping white-noise buffer
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    this.engineNoise = ctx.createBufferSource();
    this.engineNoise.buffer = buffer;
    this.engineNoise.loop = true;

    // Bandpass filter shapes noise into engine rumble; centre shifts with speed
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'bandpass';
    this.engineFilter.frequency.value = 130;
    this.engineFilter.Q.value = 0.9;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    // Low-frequency sine for the engine "heartbeat" under the rumble
    this.engineThump = ctx.createOscillator();
    this.engineThump.type = 'sine';
    this.engineThump.frequency.value = 60;
    const thumpGain = ctx.createGain();
    thumpGain.gain.value = 0.3;

    this.engineNoise.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineThump.connect(thumpGain);
    thumpGain.connect(this.engineGain);
    this.engineGain.connect(this.masterGain!);

    this.engineNoise.start();
    this.engineThump.start();

    // Fade in gently to idle level
    this.engineGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.8);
  }

  updateEngineSpeed(speedKph: number): void {
    if (!this.engineGain || !this.engineFilter || !this.engineThump || !this.ctx) return;
    const ratio = Math.max(0, Math.min(1, speedKph / 30));
    const t = this.ctx.currentTime;
    // Gain stays subtle: 0.03 idle → 0.09 max
    this.engineGain.gain.setTargetAtTime(0.03 + ratio * 0.06, t, 0.5);
    // Bandpass centre rises with speed: 130 Hz → 420 Hz
    this.engineFilter.frequency.setTargetAtTime(130 + ratio * 290, t, 0.5);
    // Thump rises from 60 Hz to 130 Hz
    this.engineThump.frequency.setTargetAtTime(60 + ratio * 70, t, 0.5);
  }

  stopEngine(): void {
    if (!this.engineNoise || !this.ctx) return;
    const noise = this.engineNoise;
    const thump = this.engineThump;
    const gain = this.engineGain;
    this.engineNoise = null;
    this.engineThump = null;
    this.engineGain = null;
    this.engineFilter = null;

    gain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    setTimeout(() => {
      try { noise.stop(); } catch { /* already stopped */ }
      try { thump?.stop(); } catch { /* already stopped */ }
      gain?.disconnect();
    }, 700);
  }

  // Filtered-noise sweep — more organic than a pure oscillator chirp
  playBrake(): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const duration = 0.85;

    const bufSize = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buf;

    // High-Q bandpass that sweeps upward = squeal character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + duration);
    filter.Q.value = 5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    gain.connect(this.masterGain!);

    noiseNode.connect(filter);
    filter.connect(gain);
    noiseNode.start(now);
    noiseNode.stop(now + duration);
    noiseNode.onended = () => gain.disconnect();
  }

  // iMessage-style: two descending chimes (E6 → C6)
  playSmsNotification(): void {
    const ctx = this.ensureContext();
    this.chime(ctx, 1319, 0.24, 0.28, 0);
    this.chime(ctx, 1047, 0.20, 0.32, 0.22);
  }

  playCallRingtone(): void {
    if (this.callLoopActive) return;
    this.callLoopActive = true;
    this.scheduleRingtoneBar();
  }

  stopCallRingtone(): void {
    this.callLoopActive = false;
    if (this.callTimeoutId !== null) {
      clearTimeout(this.callTimeoutId);
      this.callTimeoutId = null;
    }
  }

  // 3-note ascending chime (macOS-style notification)
  playGeneralNotification(): void {
    const ctx = this.ensureContext();
    this.chime(ctx, 880,  0.14, 0.22, 0);
    this.chime(ctx, 1109, 0.14, 0.22, 0.18);
    this.chime(ctx, 1319, 0.16, 0.28, 0.36);
  }

  // 4-note ascending melody (C5 – E5 – G5 – C6) repeated in a loop
  private scheduleRingtoneBar(): void {
    if (!this.callLoopActive) return;
    const ctx = this.ensureContext();
    const notes = [
      { freq: 523,  delay: 0,    dur: 0.15 },  // C5
      { freq: 659,  delay: 0.18, dur: 0.15 },  // E5
      { freq: 784,  delay: 0.36, dur: 0.15 },  // G5
      { freq: 1047, delay: 0.54, dur: 0.24 },  // C6
    ];
    for (const n of notes) this.chime(ctx, n.freq, 0.30, n.dur, n.delay);

    // Melody lasts ~0.78 s; next bar starts after 1.9 s total (1.1 s silence)
    this.callTimeoutId = setTimeout(() => this.scheduleRingtoneBar(), 1900);
  }

  // Bell-like tone: sine + octave harmonic, fast attack, natural exponential decay
  private chime(ctx: AudioContext, freq: number, gainPeak: number, duration: number, delay: number): void {
    const now = ctx.currentTime + delay;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.006);   // 6 ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    gain.connect(this.masterGain!);

    // Fundamental
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);

    // Octave harmonic for bell brightness
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.18;
    const harmOsc = ctx.createOscillator();
    harmOsc.type = 'sine';
    harmOsc.frequency.value = freq * 2;
    harmOsc.connect(harmGain);
    harmGain.connect(gain);

    osc.start(now);
    osc.stop(now + duration);
    harmOsc.start(now);
    harmOsc.stop(now + duration);
    osc.onended = () => gain.disconnect();
  }
}
