/**
 * Punto de entrada: orquesta audio, mapeo y motor visual.
 * p5 y las clases (audioAnalyzer.js, mapping.js, visualEngine.js) se cargan
 * como scripts clásicos en index.html para que funcione con file://; los ES
 * modules suelen bloquearse al abrir el HTML sin servidor (CORS).
 */

const audio = new AudioAnalyzer();

/** Estado de UI enlazado a sliders (valores por defecto alineados con index.html). */
const ui = {
  persistence: 0.12,
  silenceDissolve: 0.22,
  inputGain: 1.6,
  lowWeight: 1,
  midWeight: 1,
  highWeight: 1,
  pulseWeight: 1,
  noiseScale: 0.0018,
  turbulence: 1,
  density: 1800,
  paintThreshold: 0.38,
  paintCooldownMs: 175,
  paintFadeWhileSound: 1.2,
  paintFadeSilenceMult: 26,
  paintFlatnessMax: 0.41,
  paintRmsExcessMin: 0.075,
  paintBandBodyMin: 0.048,
};

function readUiFromDom() {
  const g = (id) => document.getElementById(id);
  const num = (id) => parseFloat(/** @type {HTMLInputElement} */ (g(id)).value);
  ui.persistence = num("sl-persistence");
  ui.silenceDissolve = num("sl-silence-dissolve");
  ui.inputGain = num("sl-input-gain");
  ui.lowWeight = num("sl-low-weight");
  ui.midWeight = num("sl-mid-weight");
  ui.highWeight = num("sl-high-weight");
  ui.pulseWeight = num("sl-pulse-weight");
  ui.noiseScale = num("sl-noise-scale");
  ui.turbulence = num("sl-turbulence");
  ui.density = num("sl-density");
  ui.paintThreshold = num("sl-paint-threshold");
  ui.paintCooldownMs = num("sl-paint-cooldown");
  ui.paintFadeWhileSound = num("sl-paint-fade-sound");
  ui.paintFadeSilenceMult = num("sl-paint-fade-silence-mult");
  ui.paintFlatnessMax = num("sl-paint-flatness-max");
  ui.paintRmsExcessMin = num("sl-paint-rms-excess-min");
  ui.paintBandBodyMin = num("sl-paint-band-body-min");
}

function bindSliders() {
  const sliders = document.querySelectorAll('#controls input[type="range"]');
  for (const el of sliders) {
    el.addEventListener("input", () => {
      readUiFromDom();
      const span = document.querySelector(`[data-for="${el.id}"]`);
      if (span) span.textContent = /** @type {HTMLInputElement} */ (el).value;
      if (window._visualEngine) window._visualEngine.setParticleCount(ui.density);
    });
  }
  readUiFromDom();
  for (const el of sliders) {
    const span = document.querySelector(`[data-for="${el.id}"]`);
    if (span) span.textContent = /** @type {HTMLInputElement} */ (el).value;
  }
}

const sketch = (p) => {
  /** @type {VisualEngine | null} */
  let engine = null;

  function canvasSize() {
    // Lienzo a tamaño de ventana completa; el panel de controles va en overlay (CSS).
    const vv = window.visualViewport;
    const w = Math.max(320, Math.floor(vv?.width ?? window.innerWidth));
    const h = Math.max(400, Math.floor(vv?.height ?? window.innerHeight));
    return { w, h };
  }

  p.setup = () => {
    const host = document.getElementById("canvas-host");
    const { w, h } = canvasSize();
    const canvas = p.createCanvas(w, h, p.WEBGL);
    canvas.parent(host);
    p.colorMode(p.HSB, 1, 1, 1, 1);
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));

    // Fondo blanco (HSB: saturación 0, brillo 1). El velo del motor tiñe hacia el blanco.
    p.background(0, 0, 1);

    engine = new VisualEngine(p);
    engine.setParticleCount(ui.density);
    window._visualEngine = engine;
  };

  p.windowResized = () => {
    const { w, h } = canvasSize();
    p.resizeCanvas(w, h);
    engine?.resize();
    p.background(0, 0, 1);
  };

  p.draw = () => {
    readUiFromDom();
    audio.setGainLinear(ui.inputGain);

    const features = audio.update();
    const mapped = mapAudioToVisual(features, ui);

    if (engine) {
      engine.setPaintOptions({
        threshold: ui.paintThreshold,
        cooldownMs: ui.paintCooldownMs,
        fadeWhileSound: ui.paintFadeWhileSound,
        silenceDissolve: ui.silenceDissolve,
        fadeSilenceMult: ui.paintFadeSilenceMult,
        flatnessMax: ui.paintFlatnessMax,
        rmsExcessMin: ui.paintRmsExcessMin,
        bandBodyMin: ui.paintBandBodyMin,
      });
      engine.update(mapped, features);
      engine.draw(mapped);
    }
  };
};

function wireAudioButton() {
  const btn = document.getElementById("btn-audio");
  const status = document.getElementById("audio-status");
  if (!btn || !status) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.textContent = "Solicitando acceso al micrófono…";
    try {
      await audio.start();
      await audio.resume();
      status.textContent =
        "Audio activo. Interpreta; observa cómo el silencio disuelve la materia.";
    } catch (e) {
      status.textContent =
        "No se pudo acceder al micrófono. Revisa permisos del navegador.";
      console.error(e);
      btn.disabled = false;
    }
  });
}

bindSliders();
wireAudioButton();

// p5 global desde CDN
// eslint-disable-next-line no-undef
new p5(sketch);
