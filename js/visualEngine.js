/**
 * Motor visual (p5 WEBGL)
 *
 * Partículas arrastradas por un campo de ruido 3D que evoluciona en el tiempo.
 * No dibujamos “barras” ni simetría radial: cada punto sigue un vector suave
 * pero asimétrico; los picos inyectan pulsos que rompen momentáneamente la laminaridad.
 *
 * La “memoria” se implementa con un velo semitransparente por frame (blanco sobre
 * lienzo claro) que disuelve hacia el fondo blanco. En silencio el mapeo sube el
 * alpha del velo para vaciar sin congelar la escena.
 */

class VisualEngine {
  /**
   * @param {import('p5')} p instancia p5
   */
  constructor(p) {
    this.p = p;
    /** @type {{ x: number, y: number, z: number, s: number, hue: number }[]} */
    this.particles = [];
    this._targetCount = 2400;
    this.time = 0;
    this.pulsePhase = 0;

    /** @type {import('p5').Graphics | null} lienzo 2D acumulativo (pintura). */
    this.paintPg = null;
    this._strokeCount = 0;
    this._lastNoteMs = 0;
    /** @type {object} */
    this._paintOpts = {
      threshold: 0.38,
      cooldownMs: 175,
      fadeWhileSound: 1.2,
      silenceDissolve: 0.22,
      fadeSilenceMult: 26,
      /** Por encima de esto se considera ruido de banda ancha (no pintar). */
      flatnessMax: 0.41,
      /** RMS útil mínimo por encima del fondo aprendido. */
      rmsExcessMin: 0.075,
      /** Graves/medios combinados: evita solo silbido o solo zumbido muy débil. */
      bandBodyMin: 0.048,
    };
  }

  setParticleCount(n) {
    this._targetCount = Math.floor(Math.max(400, Math.min(6000, n)));
    this._ensureParticles();
  }

  _ensureParticles() {
    const p = this.p;
    const w = p.width;
    const h = p.height;
    while (this.particles.length < this._targetCount) {
      this.particles.push({
        x: p.random(-w * 0.55, w * 0.55),
        y: p.random(-h * 0.55, h * 0.55),
        z: p.random(-180, 180),
        s: p.random(0.6, 2.4),
        hue: p.random(0.08, 0.22),
      });
    }
    while (this.particles.length > this._targetCount) {
      this.particles.pop();
    }
  }

  resize() {
    this._ensureParticles();
    this._ensurePaintBuffer(true);
  }

  /**
   * Crea o redimensiona el buffer 2D de pintura; opcionalmente conserva imagen previa.
   * @param {boolean} preserve
   */
  _ensurePaintBuffer(preserve) {
    const p = this.p;
    const nw = Math.max(1, p.width);
    const nh = Math.max(1, p.height);
    if (this.paintPg && this.paintPg.width === nw && this.paintPg.height === nh) {
      return;
    }
    const old = this.paintPg;
    this.paintPg = p.createGraphics(nw, nh, p.P2D);
    const d = Math.min(2, p.pixelDensity());
    this.paintPg.pixelDensity(d);
    this.paintPg.colorMode(p.RGB, 255);
    this.paintPg.background(255);
    if (preserve && old && old.width > 0) {
      this.paintPg.image(old, 0, 0, nw, nh);
    }
    old?.remove();
  }

  /**
   * @param {object} opts
   * @param {number} opts.threshold
   * @param {number} opts.cooldownMs
   * @param {number} opts.fadeWhileSound
   * @param {number} opts.silenceDissolve
   * @param {number} opts.fadeSilenceMult
   * @param {number} opts.flatnessMax
   * @param {number} opts.rmsExcessMin
   * @param {number} opts.bandBodyMin
   */
  setPaintOptions(opts) {
    this._paintOpts = { ...this._paintOpts, ...opts };
  }

  /**
   * @param {ReturnType<import('./mapping.js').mapAudioToVisual>} m
   * @param {ReturnType<import('./audioAnalyzer.js').AudioAnalyzer['prototype']['update']>} [features]
   */
  update(m, features) {
    const p = this.p;
    this._ensureParticles();
    this._ensurePaintBuffer(true);
    if (features) {
      this._updateGenerativePainting(features, m);
    }

    this.time += m.flowSpeed * (p.deltaTime || 16);
    this.pulsePhase += m.pulse * 0.18 * ((p.deltaTime || 16) / 16);

    const w = Math.max(1, p.width);
    const h = Math.max(1, p.height);
    const ns = m.noiseScale;
    const turb = m.turbulence;

    for (const pt of this.particles) {
      const nx =
        p.noise(pt.x * ns + this.time * 0.3, pt.y * ns, pt.z * ns * 0.02) -
        0.5;
      const ny =
        p.noise(pt.x * ns + 100, pt.y * ns + this.time * 0.28, pt.z * ns * 0.02) -
        0.5;
      const nz =
        p.noise(pt.x * ns * 0.5, pt.y * ns * 0.5 + 50, this.time * 0.15) - 0.5;

      // Sesgo de “masa” en graves: vectores más alineados y lentos.
      let vx = nx * turb * (18 + m.light * 22) * m.spread;
      let vy = ny * turb * (18 + m.light * 22) * m.spread;
      let vz = nz * turb * 10 * (0.6 + m.fluid * 0.5);

      // Componente fluida en medios: rotación suave del campo.
      const rot = m.fluid * 0.04;
      const rx = vx * Math.cos(rot) - vy * Math.sin(rot);
      const ry = vx * Math.sin(rot) + vy * Math.cos(rot);
      vx = rx;
      vy = ry;

      // Pulso: onda localizada que evita patrones perfectamente predecibles.
      const pulse = Math.sin(this.pulsePhase + pt.x * 0.01 + pt.y * 0.01) * m.pulse * 6;
      vx += pulse * (0.3 + m.light * 0.4);
      vy -= pulse * (0.25 + m.heavy * 0.2);

      pt.x += vx * m.drag * 0.9;
      pt.y += vy * m.drag * 0.9;
      pt.z += vz * m.drag * 0.75 + m.intensity * 0.4;

      // Reinyección suave desde los bordes (toro topológico aproximado).
      const marginX = w * 0.52;
      const marginY = h * 0.52;
      if (pt.x > marginX) pt.x -= marginX * 2;
      if (pt.x < -marginX) pt.x += marginX * 2;
      if (pt.y > marginY) pt.y -= marginY * 2;
      if (pt.y < -marginY) pt.y += marginY * 2;
      if (pt.z > 220) pt.z -= 440;
      if (pt.z < -220) pt.z += 440;

      // Deriva cromática muy lenta según posición (evita arcoíris de discoteca).
      pt.hue = (pt.hue + (nx + ny) * 0.00035 * (0.2 + m.intensity)) % 1;
    }
  }

  /**
   * En cada frame: velo de olvido suave en el lienzo 2D y, si hay ataque/nota,
   * una nueva capa generativa (no sustituye lo anterior).
   * @param {object} features
   * @param {object} m
   */
  _updateGenerativePainting(features, m) {
    if (!this.paintPg) return;
    const po = this._paintOpts;
    const silence = features.silence ?? 1;
    const fadeSilence = (m.silenceDissolve ?? po.silenceDissolve) * po.fadeSilenceMult;
    fadePaintAccumulation(
      this.paintPg,
      po.fadeWhileSound,
      fadeSilence,
      silence
    );

    const now =
      typeof performance !== "undefined" ? performance.now() : this.p.millis();
    const flat = features.spectralFlatness ?? 0.5;
    if (flat > po.flatnessMax) return;

    const excess = features.rmsExcess ?? 0;
    if (excess < po.rmsExcessMin) return;

    const b = features.bands || {};
    const body = (b.low ?? 0) * 0.55 + (b.mid ?? 0) * 0.65 + (b.high ?? 0) * 0.22;
    if (body < po.bandBodyMin) return;

    const gate = features.behavior.peak * 0.48 + features.flux * 0.52;
    if (gate < po.threshold) return;
    if (now - this._lastNoteMs < po.cooldownMs) return;
    this._lastNoteMs = now;
    this._strokeCount += 1;
    paintGenerativeNoteLayer(this.paintPg, this.p, features, m, this._strokeCount);
  }

  /**
   * @param {ReturnType<import('./mapping.js').mapAudioToVisual>} m
   */
  draw(m) {
    const p = this.p;

    // Lienzo pictórico acumulado (2D → textura), detrás del velo de partículas.
    if (this.paintPg) {
      p.push();
      p.noLights();
      p.noStroke();
      p.textureMode(p.NORMAL);
      p.texture(this.paintPg);
      p.translate(0, 0, -520);
      p.rotateX(Math.PI);
      p.plane(p.width * 1.02, p.height * 1.02);
      p.pop();
    }

    // Capa de olvido: velo blanco que acerca el cuadro al fondo claro.
    p.push();
    p.colorMode(p.RGB, 255);
    p.translate(0, 0, -400);
    p.noStroke();
    const fade = Math.min(95, 10 + m.persistenceAlpha * 235);
    p.fill(255, 255, 255, fade);
    p.plane(p.max(p.width, p.height) * 2.2, p.max(p.width, p.height) * 2.2);
    p.pop();

    p.colorMode(p.HSB, 1, 1, 1, 1);
    const gl = p.drawingContext;
    if (gl) gl.clear(gl.DEPTH_BUFFER_BIT);

    p.push();
    const centerShift = m.rms * 12 * (1 - m.silence);
    p.translate(centerShift * 0.2, -centerShift * 0.15, 50 + m.intensity * 40);

    // Sobre fondo blanco, ADD no aplica; tinta suave con BLEND.
    p.blendMode(p.BLEND);
    p.noStroke();

    for (const pt of this.particles) {
      const depth = p.map(pt.z, -220, 220, 0.35, 1.15);
      const a =
        (0.14 + m.intensity * 0.2 + m.fluid * 0.07) *
        depth *
        (0.5 + (1 - m.silence) * 0.45);

      // Pigmentos oscuros sobre papel claro.
      const hue = 0.09 + pt.hue * 0.08;
      const sat = 0.38 + m.light * 0.28;
      const bri = 0.2 + m.intensity * 0.22 + m.pulse * 0.12;
      const c = p.color(hue, sat, bri, a);
      p.fill(c);

      const sz = pt.s * (1.1 + m.heavy * 0.6 + m.pulse * 0.35);
      p.push();
      p.translate(pt.x, pt.y, pt.z);
      p.sphere(sz, 6, 4);
      p.pop();
    }

    p.blendMode(p.BLEND);
    p.pop();
  }
}
