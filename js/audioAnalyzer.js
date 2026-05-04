/**
 * Análisis de audio (Web Audio API)
 *
 * Decisión: no intentamos “reconocer” instrumentos. Extraemos señales
 * interpretables como comportamiento (picos, sostenido, suavidad) y
 * energía por bandas para que el mapeo visual sea orgánico, no literal.
 *
 * getUserMedia permite múltiples entradas si el sistema operativo mezcla
 * varias fuentes en un único stream estéreo; el análisis sigue siendo válido
 * sobre esa mezcla.
 */

class AudioAnalyzer {
  constructor() {
    /** @type {AudioContext | null} */
    this.context = null;
    /** @type {AnalyserNode | null} */
    this.analyser = null;
    /** @type {MediaStreamAudioSourceNode | null} */
    this.source = null;
    /** @type {GainNode | null} */
    this.inputGain = null;

    this.fftSize = 2048;
    /** @type {Uint8Array | null} */
    this.freqBytes = null;
    /** @type {Uint8Array | null} */
    this.timeBytes = null;

    // Suavizado temporal: evita que el visual “tiemble” por ruido de análisis.
    this._rmsSmooth = 0;
    this._fluxSmooth = 0;
    this._lowSmooth = 0;
    this._midSmooth = 0;
    this._highSmooth = 0;

    // Historial corto para detectar sostenido vs transitorio.
    this._rmsHistory = [];
    this._historyLen = 12;

    /** Auto-normalización suave del rango dinámico del entorno. */
    this._rmsPeak = 0.02;
    this._fluxPeak = 0.05;

    /**
     * RMS normalizado estimado del ambiente (ventilación, teclado, calle) cuando
     * no hay picos claros; sirve para exigir señal por encima del ruido de fondo.
     */
    this._rmsAmbient = 0.02;
    /** Planitud espectral suavizada (0 = muy tonal / picos; 1 = muy plano / ruido). */
    this._flatSmooth = 0.32;

    this.running = false;
  }

  /**
   * Debe llamarse tras un gesto del usuario (click) para cumplir políticas del navegador.
   */
  async start() {
    if (this.running) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    this.context = new AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.65;

    this.inputGain = this.context.createGain();
    this.inputGain.gain.value = 1;

    this.source = this.context.createMediaStreamSource(stream);
    this.source.connect(this.inputGain);
    this.inputGain.connect(this.analyser);

    const bins = this.analyser.frequencyBinCount;
    this.freqBytes = new Uint8Array(bins);
    this.timeBytes = new Uint8Array(this.fftSize);

    this.running = true;
  }

  setGainLinear(value) {
    if (this.inputGain) this.inputGain.gain.value = Math.max(0.05, value);
  }

  suspend() {
    if (this.context?.state === "running") return this.context.suspend();
    return Promise.resolve();
  }

  resume() {
    if (this.context?.state === "suspended") return this.context.resume();
    return Promise.resolve();
  }

  /**
   * RMS en dominio temporal: proxy de “volumen” percibido.
   */
  _computeRms() {
    if (!this.analyser || !this.timeBytes) return 0;
    this.analyser.getByteTimeDomainData(this.timeBytes);
    let sum = 0;
    for (let i = 0; i < this.timeBytes.length; i++) {
      const v = (this.timeBytes[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.timeBytes.length);
  }

  /**
   * Energía integrada entre frecuencias fMin–fMax (Hz), sobre bins FFT.
   */
  _bandEnergy(fMin, fMax) {
    if (!this.analyser || !this.freqBytes || !this.context) return 0;
    const sr = this.context.sampleRate;
    const nyquist = sr / 2;
    const n = this.freqBytes.length;
    const binHz = nyquist / n;
    let i0 = Math.floor(fMin / binHz);
    let i1 = Math.ceil(fMax / binHz);
    i0 = Math.max(0, Math.min(n - 1, i0));
    i1 = Math.max(i0 + 1, Math.min(n, i1));

    let e = 0;
    for (let i = i0; i < i1; i++) {
      const db = this.freqBytes[i] / 255;
      e += db * db;
    }
    return Math.sqrt(e / (i1 - i0));
  }

  /**
   * Flujo espectral aproximado (diferencia de forma espectral entre frames).
   * Valores altos sugieren ataques / percusión / gestos rápidos.
   */
  _spectralFlux(prev) {
    if (!this.freqBytes || !prev || prev.length !== this.freqBytes.length) return 0;
    let flux = 0;
    for (let i = 0; i < this.freqBytes.length; i++) {
      const diff = this.freqBytes[i] - prev[i];
      if (diff > 0) flux += diff * diff;
    }
    return Math.sqrt(flux / this.freqBytes.length) / 255;
  }

  /**
   * Planitud espectral aproximada (media geométrica / media aritmética en magnitud).
   * El ruido blanco/rosa tiende a valores altos; notas con armónicos concentrados bajan.
   */
  _spectralFlatness() {
    if (!this.freqBytes) return 0.5;
    const f = this.freqBytes;
    const step = Math.max(1, Math.floor(f.length / 72));
    let sum = 0;
    let logSum = 0;
    let n = 0;
    for (let i = 2; i < f.length; i += step) {
      const p = f[i] / 255 + 1e-5;
      sum += p;
      logSum += Math.log(p);
      n++;
    }
    if (n < 2) return 0.5;
    const am = sum / n;
    const gm = Math.exp(logSum / n);
    return Math.max(0, Math.min(1, gm / (am + 1e-8)));
  }

  update() {
    if (!this.running || !this.analyser || !this.freqBytes || !this.timeBytes) {
      return this.getSilentFeatures();
    }

    const prevFreq = new Uint8Array(this.freqBytes);
    this.analyser.getByteFrequencyData(this.freqBytes);

    const rms = this._computeRms();
    const flux = this._spectralFlux(prevFreq);

    const low = this._bandEnergy(40, 220);
    const mid = this._bandEnergy(220, 2200);
    const high = this._bandEnergy(2200, 9000);

    // Normalización adaptativa: escenas silenciosas vs ruidosas.
    this._rmsPeak = this._rmsPeak * 0.995 + Math.max(rms, 0.0001) * 0.005;
    this._fluxPeak = this._fluxPeak * 0.992 + Math.max(flux, 0.0001) * 0.008;

    const rmsN = Math.min(1, rms / (this._rmsPeak * 1.4 + 1e-6));
    const fluxN = Math.min(1, flux / (this._fluxPeak * 1.2 + 1e-6));

    this._rmsSmooth = this._rmsSmooth * 0.88 + rmsN * 0.12;
    this._fluxSmooth = this._fluxSmooth * 0.82 + fluxN * 0.18;
    this._lowSmooth = this._lowSmooth * 0.85 + low * 0.15;
    this._midSmooth = this._midSmooth * 0.85 + mid * 0.15;
    this._highSmooth = this._highSmooth * 0.82 + high * 0.18;

    this._rmsHistory.push(rmsN);
    if (this._rmsHistory.length > this._historyLen) this._rmsHistory.shift();

    const mean =
      this._rmsHistory.reduce((a, b) => a + b, 0) / this._rmsHistory.length;
    let varSum = 0;
    for (const v of this._rmsHistory) varSum += (v - mean) * (v - mean);
    const variance = varSum / Math.max(1, this._rmsHistory.length);

    // Comportamiento heurístico (0–1 cada uno; no son excluyentes).
    // Pico: subida brusca respecto a la media suavizada.
    const peakScore = Math.max(0, Math.min(1, (rmsN - this._rmsSmooth * 0.92) * 4 + fluxN * 0.85));

    // Sostenido: nivel alto con poca variación y flujo moderado.
    const sustainScore = Math.max(
      0,
      Math.min(1, mean * 1.6 - variance * 5 - fluxN * 0.4)
    );

    // Suave: baja varianza y flujo bajo (casi “respiración” del material).
    const smoothScore = Math.max(0, Math.min(1, (1 - variance * 6) * (1 - fluxN * 0.9)));

    const silence = Math.max(0, 1 - rmsN * 3.5);

    // Aprendizaje lento del nivel ambiente: solo cuando no hay ataque ni mucho flujo.
    if (rmsN < 0.07 && fluxN < 0.12) {
      this._rmsAmbient = this._rmsAmbient * 0.991 + rmsN * 0.009;
    }
    this._rmsAmbient = Math.max(0.012, Math.min(0.2, this._rmsAmbient));

    const flat = this._spectralFlatness();
    this._flatSmooth = this._flatSmooth * 0.82 + flat * 0.18;

    const rmsExcess = Math.max(0, rmsN - this._rmsAmbient * 2.75 - 0.028);

    return {
      rms: rmsN,
      rmsRaw: rms,
      flux: fluxN,
      bands: {
        low: this._lowSmooth,
        mid: this._midSmooth,
        high: this._highSmooth,
      },
      behavior: {
        peak: peakScore,
        sustained: sustainScore,
        smooth: smoothScore,
      },
      silence,
      /** 0–1: alto ≈ ruido de banda ancha; bajo ≈ contenido más tonal / picos espectrales. */
      spectralFlatness: this._flatSmooth,
      /** RMS “útil” por encima del piso ambiente (0–1 aprox.). */
      rmsExcess,
    };
  }

  getSilentFeatures() {
    return {
      rms: 0,
      rmsRaw: 0,
      flux: 0,
      bands: { low: 0, mid: 0, high: 0 },
      behavior: { peak: 0, sustained: 0, smooth: 1 },
      silence: 1,
      spectralFlatness: 0.55,
      rmsExcess: 0,
    };
  }
}
