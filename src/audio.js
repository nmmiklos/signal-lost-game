const AudioContextClass = typeof window !== 'undefined'
  ? (window.AudioContext || window.webkitAudioContext || null)
  : null;

const qualityFactor = String.fromCharCode(81);

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.muffleFilter = null;
    this.ambientGain = null;
    this.droneFilter = null;
    this.oceanFilter = null;
    this.noiseBuffer = null;

    this.ambientSources = [];
    this.started = false;
    this.disposed = false;
    this.muted = false;
    this.paused = false;

    this.danger = 0;
    this.speed = 0;
    this.battery = 100;
    this.powered = 0;
    this.stage = 'patrol';
    this.lastStage = 'patrol';
    this.hidden = false;
    this.crouched = false;

    this.stepAccumulator = 0;
    this.heartbeatTimer = 0;
    this.metalGroanTimer = 5 + Math.random() * 7;
    this.searchTickTimer = 0.4;
  }

  async start() {
    if (this.disposed) return;
    if (!AudioContextClass) {
      this.started = true;
      return;
    }

    if (!this.ctx) {
      try {
        this.ctx = new AudioContextClass();
      } catch (error) {
        this.started = true;
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (error) {}
    }

    if (!this.masterGain) {
      this._initAudioGraph();
    }

    this.setMuted(this.muted);
    this.started = true;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.ctx || !this.masterGain || this.disposed) return;

    const targetVolume = this.muted ? 0 : 0.32;
    const now = this.ctx.currentTime;
    try {
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(targetVolume, now, 0.02);
    } catch (error) {
      this.masterGain.gain.value = targetVolume;
    }
  }

  update(deltaTime = 0, { danger = 0, speed = 0, battery = 100, powered = true, paused = false, stage = 'patrol', hidden = false, crouched = false } = {}) {
    this.danger = typeof danger === 'number' ? Math.max(0, Math.min(1, danger)) : 0;
    this.speed = typeof speed === 'number' ? Math.max(0, speed) : 0;
    this.battery = typeof battery === 'number' ? battery : 100;
    this.powered = typeof powered === 'number' ? powered : (powered ? 3 : 0);
    this.paused = Boolean(paused);
    this.hidden = Boolean(hidden);
    this.crouched = Boolean(crouched);

    const nextStage = typeof stage === 'string' ? stage : 'patrol';
    if (this.lastStage !== nextStage) {
      this._handleStageChange(this.lastStage, nextStage);
      this.lastStage = nextStage;
    }
    this.stage = nextStage;

    if (!this.ctx || !this.started || this.disposed) return;

    const now = this.ctx.currentTime;

    if (this.ambientGain) {
      if (this.paused) {
        this.ambientGain.gain.setTargetAtTime(0, now, 0.08);
      } else {
        const powerBonus = Math.min(3, this.powered) * 0.04;
        const baseAmbient = (this.powered > 0 ? 0.38 : 0.24) + powerBonus;
        const targetAmbient = this.hidden ? (baseAmbient * 0.42) : baseAmbient;
        this.ambientGain.gain.setTargetAtTime(targetAmbient, now, 0.15);
      }
    }

    if (this.muffleFilter) {
      const targetCutoff = this.hidden ? 360 : 16000;
      this.muffleFilter.frequency.setTargetAtTime(targetCutoff, now, 0.12);
    }

    if (this.paused || deltaTime <= 0) return;

    if (this.speed > 0.15) {
      this.stepAccumulator += this.speed * deltaTime;
      const stepThreshold = this.crouched ? 2.3 : 1.7;
      if (this.stepAccumulator >= stepThreshold) {
        this.stepAccumulator -= stepThreshold;
        this._playStep({ crouched: this.crouched });
      }
    } else {
      this.stepAccumulator = Math.max(0, this.stepAccumulator - deltaTime * 0.5);
    }

    if (this.danger > 0.05 || this.stage === 'chase' || this.stage === 'search') {
      const stageDangerBonus = this.stage === 'chase' ? 0.35 : (this.stage === 'search' ? 0.15 : 0);
      const effectiveDanger = Math.min(1, this.danger + stageDangerBonus);
      const period = 1.1 - effectiveDanger * 0.69;
      this.heartbeatTimer -= deltaTime;
      if (this.heartbeatTimer <= 0) {
        this._playHeartbeat(effectiveDanger);
        this.heartbeatTimer = Math.max(0.35, period);
      }
    } else {
      this.heartbeatTimer = 0.6;
    }

    if (this.stage === 'search' || (this.stage === 'notice' && this.danger > 0.2)) {
      this.searchTickTimer -= deltaTime;
      if (this.searchTickTimer <= 0) {
        this._playSearchTick();
        this.searchTickTimer = Math.max(0.28, 0.72 - this.danger * 0.36);
      }
    } else {
      this.searchTickTimer = 0.4;
    }

    this.metalGroanTimer -= deltaTime;
    if (this.metalGroanTimer <= 0) {
      this._playMetalGroan();
      this.metalGroanTimer = 8.0 + Math.random() * 10.0;
    }

    if (this.droneFilter) {
      const droneCutoff = 80 + this.danger * 40;
      this.droneFilter.frequency.setTargetAtTime(droneCutoff, now, 0.2);
    }
  }

  cue(name) {
    if (!this.ctx || !this.started || this.disposed) return;

    switch (name) {
      case 'step':
        this._playStep({ crouched: this.crouched });
        break;
      case 'relay':
        this._playRelay();
        break;
      case 'hurt':
        this._playHurt();
        break;
      case 'win':
        this._playWin();
        break;
      case 'click':
        this._playClick();
        break;
      case 'empty':
        this._playEmpty();
        break;
      case 'breath':
        this._playBreath();
        break;
      case 'flash':
        this._playFlash();
        break;
      case 'throw':
        this._playThrow();
        break;
      case 'notice':
        this._playNotice();
        break;
      case 'chase':
        this._playChase();
        break;
      case 'hide':
        this._playHide();
        break;
      case 'task':
        this._playTask();
        break;
      case 'fuse':
        this._playFuse();
        break;
      case 'uplink':
        this._playUplink();
        break;
      case 'valve':
        this._playValve();
        break;
      default:
        break;
    }
  }

  dispose() {
    this.disposed = true;
    for (const source of this.ambientSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (error) {}
    }
    this.ambientSources = [];

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch (error) {}
    }

    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (error) {}
    }

    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.muffleFilter = null;
    this.ambientGain = null;
    this.droneFilter = null;
    this.oceanFilter = null;
    this.noiseBuffer = null;
  }

  _initAudioGraph() {
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(8, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    const targetVolume = this.muted ? 0 : 0.32;
    this.masterGain.gain.setValueAtTime(targetVolume, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.muffleFilter = this.ctx.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.setValueAtTime(16000, this.ctx.currentTime);
    this.muffleFilter[qualityFactor].setValueAtTime(1.0, this.ctx.currentTime);
    this.muffleFilter.connect(this.compressor);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(this.paused ? 0 : 0.42, this.ctx.currentTime);
    this.ambientGain.connect(this.muffleFilter);

    this._createNoiseBuffer();
    this._startLowPressureDrone();
    this._startOceanNoise();
  }

  _createNoiseBuffer() {
    const length = Math.floor(this.ctx.sampleRate * 4.0);
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const channelData = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index++) {
      channelData[index] = Math.random() * 2 - 1;
    }
  }

  _startLowPressureDrone() {
    const startTime = this.ctx.currentTime;

    const oscOne = this.ctx.createOscillator();
    oscOne.type = 'sine';
    oscOne.frequency.setValueAtTime(45, startTime);

    const oscTwo = this.ctx.createOscillator();
    oscTwo.type = 'sine';
    oscTwo.frequency.setValueAtTime(47.5, startTime);

    const oscThree = this.ctx.createOscillator();
    oscThree.type = 'triangle';
    oscThree.frequency.setValueAtTime(92, startTime);

    const oscThreeGain = this.ctx.createGain();
    oscThreeGain.gain.setValueAtTime(0.18, startTime);
    oscThree.connect(oscThreeGain);

    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.setValueAtTime(85, startTime);
    this.droneFilter[qualityFactor].setValueAtTime(3.0, startTime);

    const lfoOsc = this.ctx.createOscillator();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.setValueAtTime(0.12, startTime);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(18, startTime);
    lfoOsc.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);

    const droneMix = this.ctx.createGain();
    droneMix.gain.setValueAtTime(0.65, startTime);

    oscOne.connect(this.droneFilter);
    oscTwo.connect(this.droneFilter);
    oscThreeGain.connect(this.droneFilter);
    this.droneFilter.connect(droneMix);
    droneMix.connect(this.ambientGain);

    oscOne.start(startTime);
    oscTwo.start(startTime);
    oscThree.start(startTime);
    lfoOsc.start(startTime);

    this.ambientSources.push(oscOne, oscTwo, oscThree, lfoOsc);
  }

  _startOceanNoise() {
    if (!this.noiseBuffer) return;
    const startTime = this.ctx.currentTime;

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    noiseSource.loop = true;

    this.oceanFilter = this.ctx.createBiquadFilter();
    this.oceanFilter.type = 'lowpass';
    this.oceanFilter.frequency.setValueAtTime(140, startTime);
    this.oceanFilter[qualityFactor].setValueAtTime(2.2, startTime);

    const oceanLfo = this.ctx.createOscillator();
    oceanLfo.type = 'sine';
    oceanLfo.frequency.setValueAtTime(0.08, startTime);

    const oceanLfoGain = this.ctx.createGain();
    oceanLfoGain.gain.setValueAtTime(45, startTime);
    oceanLfo.connect(oceanLfoGain);
    oceanLfoGain.connect(this.oceanFilter.frequency);

    const oceanGain = this.ctx.createGain();
    oceanGain.gain.setValueAtTime(0.4, startTime);

    noiseSource.connect(this.oceanFilter);
    this.oceanFilter.connect(oceanGain);
    oceanGain.connect(this.ambientGain);

    noiseSource.start(startTime);
    oceanLfo.start(startTime);

    this.ambientSources.push(noiseSource, oceanLfo);
  }

  _handleStageChange(previousStage, currentStage) {
    if (!this.ctx || !this.started || this.disposed) return;
    if (currentStage === 'notice') {
      this._playNotice();
    } else if (currentStage === 'chase') {
      this._playChase();
    } else if (currentStage === 'search') {
      this._playStageSearch();
    } else if (currentStage === 'blinded') {
      this._playStageBlinded();
    } else if (currentStage === 'patrol' && previousStage !== 'patrol') {
      this._playStagePatrol();
    }
  }

  _playStep({ crouched = false } = {}) {
    const startTime = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    const startFrequency = crouched ? 52 : 80;
    const endFrequency = crouched ? 22 : 32;
    const volumeLevel = crouched ? 0.08 : 0.38;
    const splashLevel = crouched ? 0.04 : 0.25;

    osc.frequency.setValueAtTime(startFrequency, startTime);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, startTime + 0.18);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(volumeLevel, startTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

    osc.connect(oscGain);
    oscGain.connect(this.compressor);

    osc.start(startTime);
    osc.stop(startTime + 0.25);

    if (this.noiseBuffer) {
      const splash = this.ctx.createBufferSource();
      splash.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(crouched ? 180 : 260, startTime);
      filter[qualityFactor].setValueAtTime(2.5, startTime);

      const splashGain = this.ctx.createGain();
      splashGain.gain.setValueAtTime(splashLevel, startTime);
      splashGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

      splash.connect(filter);
      filter.connect(splashGain);
      splashGain.connect(this.compressor);

      splash.start(startTime);
      splash.stop(startTime + 0.18);
    }
  }

  _playRelay() {
    const startTime = this.ctx.currentTime;

    const oscClunkOne = this.ctx.createOscillator();
    oscClunkOne.type = 'sawtooth';
    oscClunkOne.frequency.setValueAtTime(118, startTime);
    oscClunkOne.frequency.exponentialRampToValueAtTime(45, startTime + 0.28);

    const oscClunkTwo = this.ctx.createOscillator();
    oscClunkTwo.type = 'square';
    oscClunkTwo.frequency.setValueAtTime(173, startTime);
    oscClunkTwo.frequency.exponentialRampToValueAtTime(60, startTime + 0.2);

    const clunkFilter = this.ctx.createBiquadFilter();
    clunkFilter.type = 'bandpass';
    clunkFilter.frequency.setValueAtTime(420, startTime);
    clunkFilter[qualityFactor].setValueAtTime(4.0, startTime);

    const clunkGain = this.ctx.createGain();
    clunkGain.gain.setValueAtTime(0.5, startTime);
    clunkGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

    oscClunkOne.connect(clunkFilter);
    oscClunkTwo.connect(clunkFilter);
    clunkFilter.connect(clunkGain);
    clunkGain.connect(this.compressor);

    oscClunkOne.start(startTime);
    oscClunkTwo.start(startTime);
    oscClunkOne.stop(startTime + 0.32);
    oscClunkTwo.stop(startTime + 0.32);

    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(90, startTime);
    subOsc.frequency.exponentialRampToValueAtTime(35, startTime + 0.35);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.45, startTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

    subOsc.connect(subGain);
    subGain.connect(this.compressor);
    subOsc.start(startTime);
    subOsc.stop(startTime + 0.38);

    const notes = [349.23, 440.00, 587.33];
    const noteStart = startTime + 0.14;
    const spacing = 0.13;

    notes.forEach((freq, noteIndex) => {
      const time = noteStart + noteIndex * spacing;

      const noteOsc = this.ctx.createOscillator();
      noteOsc.type = 'sine';
      noteOsc.frequency.setValueAtTime(freq, time);

      const harmOsc = this.ctx.createOscillator();
      harmOsc.type = 'triangle';
      harmOsc.frequency.setValueAtTime(freq * 2, time);

      const harmGain = this.ctx.createGain();
      harmGain.gain.setValueAtTime(0.15, time);
      harmOsc.connect(harmGain);

      const noteGain = this.ctx.createGain();
      noteGain.gain.setValueAtTime(0.0001, time);
      noteGain.gain.linearRampToValueAtTime(0.28, time + 0.015);
      noteGain.gain.exponentialRampToValueAtTime(0.001, time + 0.38);

      noteOsc.connect(noteGain);
      harmGain.connect(noteGain);
      noteGain.connect(this.compressor);

      noteOsc.start(time);
      harmOsc.start(time);
      noteOsc.stop(time + 0.4);
      harmOsc.stop(time + 0.4);
    });
  }

  _playHurt() {
    const startTime = this.ctx.currentTime;
    const clusterFreqs = [185.0, 246.9, 311.1, 466.2];
    const duration = 0.75;

    const clusterGain = this.ctx.createGain();
    clusterGain.gain.setValueAtTime(0.0001, startTime);
    clusterGain.gain.linearRampToValueAtTime(0.35, startTime + 0.015);
    clusterGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    const stingFilter = this.ctx.createBiquadFilter();
    stingFilter.type = 'bandpass';
    stingFilter.frequency.setValueAtTime(1800, startTime);
    stingFilter.frequency.exponentialRampToValueAtTime(220, startTime + duration);
    stingFilter[qualityFactor].setValueAtTime(3.5, startTime);

    clusterFreqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.65, startTime + duration);
      osc.connect(stingFilter);
      osc.start(startTime);
      osc.stop(startTime + duration);
    });

    const punch = this.ctx.createOscillator();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(80, startTime);
    punch.frequency.exponentialRampToValueAtTime(28, startTime + 0.4);

    const punchGain = this.ctx.createGain();
    punchGain.gain.setValueAtTime(0.4, startTime);
    punchGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    punch.connect(punchGain);
    punchGain.connect(this.compressor);
    punch.start(startTime);
    punch.stop(startTime + 0.45);

    stingFilter.connect(clusterGain);
    clusterGain.connect(this.compressor);
  }

  _playWin() {
    const startTime = this.ctx.currentTime;
    const chords = [130.81, 196.00, 261.63, 329.63, 493.88];

    const winGain = this.ctx.createGain();
    winGain.gain.setValueAtTime(0.0001, startTime);
    winGain.gain.linearRampToValueAtTime(0.32, startTime + 0.2);
    winGain.gain.exponentialRampToValueAtTime(0.001, startTime + 2.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, startTime);
    filter.frequency.linearRampToValueAtTime(2400, startTime + 2.0);

    chords.forEach((freq, chordIndex) => {
      const osc = this.ctx.createOscillator();
      osc.type = chordIndex % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.connect(filter);
      osc.start(startTime);
      osc.stop(startTime + 2.6);
    });

    filter.connect(winGain);
    winGain.connect(this.compressor);
  }

  _playClick() {
    const startTime = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, startTime);
    osc.frequency.exponentialRampToValueAtTime(400, startTime + 0.025);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(startTime);
    osc.stop(startTime + 0.035);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2500, startTime);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.2, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.02);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.compressor);

      noise.start(startTime);
      noise.stop(startTime + 0.025);
    }
  }

  _playEmpty() {
    const startTime = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(75, startTime);
    osc.frequency.exponentialRampToValueAtTime(30, startTime + 0.07);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(startTime);
    osc.stop(startTime + 0.09);
  }

  _playBreath() {
    if (!this.noiseBuffer) return;
    const startTime = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, startTime);
    filter.frequency.linearRampToValueAtTime(750, startTime + 0.4);
    filter.frequency.linearRampToValueAtTime(320, startTime + 1.1);
    filter[qualityFactor].setValueAtTime(3.0, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.28, startTime + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.compressor);

    noise.start(startTime);
    noise.stop(startTime + 1.2);
  }

  _playHeartbeat(danger) {
    const startTime = this.ctx.currentTime;
    const volume = 0.2 + danger * 0.45;

    this._heartbeatThump(startTime, 62, 38, 0.12, volume * 0.85);
    this._heartbeatThump(startTime + 0.11, 52, 32, 0.14, volume);
  }

  _heartbeatThump(time, startFreq, endFreq, duration, volume) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.compressor);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  _playSearchTick() {
    const startTime = this.ctx.currentTime;
    const clickOsc = this.ctx.createOscillator();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(1720, startTime);
    clickOsc.frequency.exponentialRampToValueAtTime(820, startTime + 0.028);

    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(1450, startTime);
    clickFilter[qualityFactor].setValueAtTime(6.0, startTime);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, startTime);
    clickGain.gain.linearRampToValueAtTime(0.14, startTime + 0.003);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.035);

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.compressor);

    clickOsc.start(startTime);
    clickOsc.stop(startTime + 0.04);

    const subEcho = this.ctx.createOscillator();
    subEcho.type = 'triangle';
    subEcho.frequency.setValueAtTime(420, startTime + 0.022);
    subEcho.frequency.exponentialRampToValueAtTime(180, startTime + 0.05);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, startTime + 0.022);
    subGain.gain.linearRampToValueAtTime(0.06, startTime + 0.026);
    subGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);

    subEcho.connect(subGain);
    subGain.connect(this.compressor);

    subEcho.start(startTime + 0.022);
    subEcho.stop(startTime + 0.065);
  }

  _playFlash() {
    const startTime = this.ctx.currentTime;

    const boomOsc = this.ctx.createOscillator();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(135, startTime);
    boomOsc.frequency.exponentialRampToValueAtTime(26, startTime + 0.55);

    const boomGain = this.ctx.createGain();
    boomGain.gain.setValueAtTime(0.42, startTime);
    boomGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.58);

    boomOsc.connect(boomGain);
    boomGain.connect(this.compressor);
    boomOsc.start(startTime);
    boomOsc.stop(startTime + 0.6);

    if (this.noiseBuffer) {
      const blastNoise = this.ctx.createBufferSource();
      blastNoise.buffer = this.noiseBuffer;

      const blastFilter = this.ctx.createBiquadFilter();
      blastFilter.type = 'lowpass';
      blastFilter.frequency.setValueAtTime(1100, startTime);
      blastFilter.frequency.exponentialRampToValueAtTime(160, startTime + 0.4);

      const blastGain = this.ctx.createGain();
      blastGain.gain.setValueAtTime(0.38, startTime);
      blastGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.42);

      blastNoise.connect(blastFilter);
      blastFilter.connect(blastGain);
      blastGain.connect(this.compressor);
      blastNoise.start(startTime);
      blastNoise.stop(startTime + 0.45);
    }

    const ringOsc = this.ctx.createOscillator();
    ringOsc.type = 'sine';
    ringOsc.frequency.setValueAtTime(3450, startTime);

    const ringGain = this.ctx.createGain();
    ringGain.gain.setValueAtTime(0.0001, startTime);
    ringGain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
    ringGain.gain.setValueAtTime(0.18, startTime + 0.45);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.3);

    ringOsc.connect(ringGain);
    ringGain.connect(this.compressor);
    ringOsc.start(startTime);
    ringOsc.stop(startTime + 2.35);
  }

  _playThrow() {
    const startTime = this.ctx.currentTime;

    const snapOsc = this.ctx.createOscillator();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(1850, startTime);
    snapOsc.frequency.exponentialRampToValueAtTime(450, startTime + 0.035);

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.22, startTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04);

    snapOsc.connect(snapGain);
    snapGain.connect(this.compressor);
    snapOsc.start(startTime);
    snapOsc.stop(startTime + 0.045);

    if (this.noiseBuffer) {
      const whooshNoise = this.ctx.createBufferSource();
      whooshNoise.buffer = this.noiseBuffer;

      const whooshFilter = this.ctx.createBiquadFilter();
      whooshFilter.type = 'bandpass';
      whooshFilter.frequency.setValueAtTime(380, startTime);
      whooshFilter.frequency.linearRampToValueAtTime(1450, startTime + 0.12);
      whooshFilter.frequency.linearRampToValueAtTime(480, startTime + 0.26);
      whooshFilter[qualityFactor].setValueAtTime(2.8, startTime);

      const whooshGain = this.ctx.createGain();
      whooshGain.gain.setValueAtTime(0.0001, startTime);
      whooshGain.gain.linearRampToValueAtTime(0.24, startTime + 0.1);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

      whooshNoise.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(this.compressor);
      whooshNoise.start(startTime);
      whooshNoise.stop(startTime + 0.3);
    }
  }

  _playNotice() {
    const startTime = this.ctx.currentTime;
    const clickOffsets = [0, 0.038, 0.076];

    clickOffsets.forEach((offset, index) => {
      const clickTime = startTime + offset;
      const chirpOsc = this.ctx.createOscillator();
      chirpOsc.type = 'sawtooth';
      chirpOsc.frequency.setValueAtTime(940 - index * 120, clickTime);
      chirpOsc.frequency.exponentialRampToValueAtTime(340 - index * 60, clickTime + 0.03);

      const chirpGain = this.ctx.createGain();
      chirpGain.gain.setValueAtTime(0.18, clickTime);
      chirpGain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.032);

      chirpOsc.connect(chirpGain);
      chirpGain.connect(this.compressor);
      chirpOsc.start(clickTime);
      chirpOsc.stop(clickTime + 0.035);
    });

    const alertDrone = this.ctx.createOscillator();
    alertDrone.type = 'sine';
    alertDrone.frequency.setValueAtTime(185, startTime + 0.06);
    alertDrone.frequency.linearRampToValueAtTime(285, startTime + 0.35);

    const alertGain = this.ctx.createGain();
    alertGain.gain.setValueAtTime(0.0001, startTime + 0.06);
    alertGain.gain.linearRampToValueAtTime(0.22, startTime + 0.16);
    alertGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.42);

    alertDrone.connect(alertGain);
    alertGain.connect(this.compressor);
    alertDrone.start(startTime + 0.06);
    alertDrone.stop(startTime + 0.44);
  }

  _playChase() {
    const startTime = this.ctx.currentTime;

    const punchOsc = this.ctx.createOscillator();
    punchOsc.type = 'sine';
    punchOsc.frequency.setValueAtTime(105, startTime);
    punchOsc.frequency.exponentialRampToValueAtTime(32, startTime + 0.38);

    const punchGain = this.ctx.createGain();
    punchGain.gain.setValueAtTime(0.42, startTime);
    punchGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

    punchOsc.connect(punchGain);
    punchGain.connect(this.compressor);
    punchOsc.start(startTime);
    punchOsc.stop(startTime + 0.42);

    const clusterFrequencies = [146.8, 155.6, 220.0];
    const duration = 0.65;

    const clusterGain = this.ctx.createGain();
    clusterGain.gain.setValueAtTime(0.0001, startTime);
    clusterGain.gain.linearRampToValueAtTime(0.32, startTime + 0.02);
    clusterGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    const chaseFilter = this.ctx.createBiquadFilter();
    chaseFilter.type = 'bandpass';
    chaseFilter.frequency.setValueAtTime(2600, startTime);
    chaseFilter.frequency.exponentialRampToValueAtTime(380, startTime + duration);
    chaseFilter[qualityFactor].setValueAtTime(3.6, startTime);

    clusterFrequencies.forEach(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, startTime + duration);
      osc.connect(chaseFilter);
      osc.start(startTime);
      osc.stop(startTime + duration);
    });

    chaseFilter.connect(clusterGain);
    clusterGain.connect(this.compressor);
  }

  _playHide() {
    const startTime = this.ctx.currentTime;

    const latchOsc = this.ctx.createOscillator();
    latchOsc.type = 'square';
    latchOsc.frequency.setValueAtTime(165, startTime);
    latchOsc.frequency.exponentialRampToValueAtTime(55, startTime + 0.12);

    const latchFilter = this.ctx.createBiquadFilter();
    latchFilter.type = 'lowpass';
    latchFilter.frequency.setValueAtTime(650, startTime);

    const latchGain = this.ctx.createGain();
    latchGain.gain.setValueAtTime(0.32, startTime);
    latchGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

    latchOsc.connect(latchFilter);
    latchFilter.connect(latchGain);
    latchGain.connect(this.compressor);
    latchOsc.start(startTime);
    latchOsc.stop(startTime + 0.18);

    if (this.noiseBuffer) {
      const scrapeNoise = this.ctx.createBufferSource();
      scrapeNoise.buffer = this.noiseBuffer;

      const scrapeFilter = this.ctx.createBiquadFilter();
      scrapeFilter.type = 'bandpass';
      scrapeFilter.frequency.setValueAtTime(520, startTime + 0.04);
      scrapeFilter[qualityFactor].setValueAtTime(3.2, startTime + 0.04);

      const scrapeGain = this.ctx.createGain();
      scrapeGain.gain.setValueAtTime(0.0001, startTime + 0.04);
      scrapeGain.gain.linearRampToValueAtTime(0.22, startTime + 0.08);
      scrapeGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

      scrapeNoise.connect(scrapeFilter);
      scrapeFilter.connect(scrapeGain);
      scrapeGain.connect(this.compressor);
      scrapeNoise.start(startTime + 0.04);
      scrapeNoise.stop(startTime + 0.3);
    }
  }

  _playTask() {
    const startTime = this.ctx.currentTime;

    const tickOsc = this.ctx.createOscillator();
    tickOsc.type = 'sine';
    tickOsc.frequency.setValueAtTime(980, startTime);
    tickOsc.frequency.exponentialRampToValueAtTime(340, startTime + 0.045);

    const tickGain = this.ctx.createGain();
    tickGain.gain.setValueAtTime(0.22, startTime);
    tickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

    tickOsc.connect(tickGain);
    tickGain.connect(this.compressor);
    tickOsc.start(startTime);
    tickOsc.stop(startTime + 0.055);

    const chimeOsc = this.ctx.createOscillator();
    chimeOsc.type = 'triangle';
    chimeOsc.frequency.setValueAtTime(587.33, startTime + 0.02);

    const chimeGain = this.ctx.createGain();
    chimeGain.gain.setValueAtTime(0.0001, startTime + 0.02);
    chimeGain.gain.linearRampToValueAtTime(0.18, startTime + 0.035);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.compressor);
    chimeOsc.start(startTime + 0.02);
    chimeOsc.stop(startTime + 0.18);
  }

  _playFuse() {
    const startTime = this.ctx.currentTime;

    const humOsc = this.ctx.createOscillator();
    humOsc.type = 'sawtooth';
    humOsc.frequency.setValueAtTime(60, startTime);

    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.setValueAtTime(750, startTime);

    const humGain = this.ctx.createGain();
    humGain.gain.setValueAtTime(0.25, startTime);
    humGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

    humOsc.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(this.compressor);
    humOsc.start(startTime);
    humOsc.stop(startTime + 0.16);

    if (this.noiseBuffer) {
      const sparkNoise = this.ctx.createBufferSource();
      sparkNoise.buffer = this.noiseBuffer;

      const sparkFilter = this.ctx.createBiquadFilter();
      sparkFilter.type = 'bandpass';
      sparkFilter.frequency.setValueAtTime(2200, startTime);
      sparkFilter[qualityFactor].setValueAtTime(4.5, startTime);

      const sparkGain = this.ctx.createGain();
      sparkGain.gain.setValueAtTime(0.32, startTime);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

      sparkNoise.connect(sparkFilter);
      sparkFilter.connect(sparkGain);
      sparkGain.connect(this.compressor);
      sparkNoise.start(startTime);
      sparkNoise.stop(startTime + 0.12);
    }
  }

  _playUplink() {
    const startTime = this.ctx.currentTime;
    const packetFrequencies = [784.0, 1174.66, 1567.98, 1975.53];
    const spacing = 0.045;

    packetFrequencies.forEach((freq, packetIndex) => {
      const time = startTime + packetIndex * spacing;

      const packetOsc = this.ctx.createOscillator();
      packetOsc.type = 'sine';
      packetOsc.frequency.setValueAtTime(freq, time);

      const packetGain = this.ctx.createGain();
      packetGain.gain.setValueAtTime(0.0001, time);
      packetGain.gain.linearRampToValueAtTime(0.18, time + 0.006);
      packetGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

      packetOsc.connect(packetGain);
      packetGain.connect(this.compressor);
      packetOsc.start(time);
      packetOsc.stop(time + 0.045);
    });
  }

  _playValve() {
    const startTime = this.ctx.currentTime;

    const squeakOsc = this.ctx.createOscillator();
    squeakOsc.type = 'triangle';
    squeakOsc.frequency.setValueAtTime(290, startTime);
    squeakOsc.frequency.linearRampToValueAtTime(360, startTime + 0.12);
    squeakOsc.frequency.linearRampToValueAtTime(270, startTime + 0.28);

    const squeakFilter = this.ctx.createBiquadFilter();
    squeakFilter.type = 'bandpass';
    squeakFilter.frequency.setValueAtTime(320, startTime);
    squeakFilter[qualityFactor].setValueAtTime(6.0, startTime);

    const squeakGain = this.ctx.createGain();
    squeakGain.gain.setValueAtTime(0.0001, startTime);
    squeakGain.gain.linearRampToValueAtTime(0.24, startTime + 0.04);
    squeakGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

    squeakOsc.connect(squeakFilter);
    squeakFilter.connect(squeakGain);
    squeakGain.connect(this.compressor);
    squeakOsc.start(startTime);
    squeakOsc.stop(startTime + 0.32);

    if (this.noiseBuffer) {
      const hissNoise = this.ctx.createBufferSource();
      hissNoise.buffer = this.noiseBuffer;

      const hissFilter = this.ctx.createBiquadFilter();
      hissFilter.type = 'bandpass';
      hissFilter.frequency.setValueAtTime(1350, startTime + 0.06);
      hissFilter[qualityFactor].setValueAtTime(2.0, startTime + 0.06);

      const hissGain = this.ctx.createGain();
      hissGain.gain.setValueAtTime(0.0001, startTime + 0.06);
      hissGain.gain.linearRampToValueAtTime(0.22, startTime + 0.12);
      hissGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.38);

      hissNoise.connect(hissFilter);
      hissFilter.connect(hissGain);
      hissGain.connect(this.compressor);
      hissNoise.start(startTime + 0.06);
      hissNoise.stop(startTime + 0.4);
    }
  }

  _playStageSearch() {
    const startTime = this.ctx.currentTime;

    const pingOsc = this.ctx.createOscillator();
    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(1320, startTime);
    pingOsc.frequency.exponentialRampToValueAtTime(660, startTime + 0.22);

    const pingGain = this.ctx.createGain();
    pingGain.gain.setValueAtTime(0.0001, startTime);
    pingGain.gain.linearRampToValueAtTime(0.18, startTime + 0.015);
    pingGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

    pingOsc.connect(pingGain);
    pingGain.connect(this.compressor);
    pingOsc.start(startTime);
    pingOsc.stop(startTime + 0.32);
  }

  _playStageBlinded() {
    const startTime = this.ctx.currentTime;

    const screechOsc = this.ctx.createOscillator();
    screechOsc.type = 'sawtooth';
    screechOsc.frequency.setValueAtTime(680, startTime);
    screechOsc.frequency.exponentialRampToValueAtTime(140, startTime + 0.45);

    const screechFilter = this.ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.setValueAtTime(820, startTime);
    screechFilter[qualityFactor].setValueAtTime(3.5, startTime);

    const screechGain = this.ctx.createGain();
    screechGain.gain.setValueAtTime(0.26, startTime);
    screechGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.48);

    screechOsc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(this.compressor);
    screechOsc.start(startTime);
    screechOsc.stop(startTime + 0.5);

    if (this.noiseBuffer) {
      const hissNoise = this.ctx.createBufferSource();
      hissNoise.buffer = this.noiseBuffer;

      const hissFilter = this.ctx.createBiquadFilter();
      hissFilter.type = 'highpass';
      hissFilter.frequency.setValueAtTime(1800, startTime);

      const hissGain = this.ctx.createGain();
      hissGain.gain.setValueAtTime(0.24, startTime);
      hissGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      hissNoise.connect(hissFilter);
      hissFilter.connect(hissGain);
      hissGain.connect(this.compressor);
      hissNoise.start(startTime);
      hissNoise.stop(startTime + 0.52);
    }
  }

  _playStagePatrol() {
    const startTime = this.ctx.currentTime;

    const settleOsc = this.ctx.createOscillator();
    settleOsc.type = 'sine';
    settleOsc.frequency.setValueAtTime(65, startTime);
    settleOsc.frequency.exponentialRampToValueAtTime(34, startTime + 0.6);

    const settleGain = this.ctx.createGain();
    settleGain.gain.setValueAtTime(0.0001, startTime);
    settleGain.gain.linearRampToValueAtTime(0.18, startTime + 0.08);
    settleGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.65);

    settleOsc.connect(settleGain);
    settleGain.connect(this.compressor);
    settleOsc.start(startTime);
    settleOsc.stop(startTime + 0.7);
  }

  _playMetalGroan() {
    if (!this.noiseBuffer) return;
    const startTime = this.ctx.currentTime;
    const duration = 1.8 + Math.random() * 0.8;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const startFreq = 180 + Math.random() * 120;
    const endFreq = startFreq + (Math.random() > 0.5 ? 60 : -60);
    filter.frequency.setValueAtTime(startFreq, startTime);
    filter.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
    filter[qualityFactor].setValueAtTime(14.0, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(0.24, startTime + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);

    noise.start(startTime);
    noise.stop(startTime + duration + 0.1);
  }
}

export default Soundscape;
