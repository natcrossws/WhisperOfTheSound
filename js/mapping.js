/**
 * Sistema de mapeo audio → parámetros del motor visual
 *
 * Decisión: las bandas no mueven un solo dial; se mezclan con pesos y con
 * el comportamiento (picos / sostenido / suave) para que un mismo gesto
 * sonoro pueda influir en varios “estratos” del campo visual sin simetría
 * obvia ni reacción tipo ecualizador circular.
 */

/**
 * @param {object} features resultado de AudioAnalyzer.prototype.update()
 * @param {object} ui
 * @param {number} ui.lowWeight
 * @param {number} ui.midWeight
 * @param {number} ui.highWeight
 * @param {number} ui.pulseWeight
 * @param {number} ui.noiseScale
 * @param {number} ui.turbulence
 * @param {number} ui.persistence
 * @param {number} ui.silenceDissolve
 */
function mapAudioToVisual(features, ui) {
  const { bands, behavior, silence, flux, rms } = features;

  // Graves: inercia, cohesión, “masa” del campo vectorial.
  const heavy =
    bands.low * ui.lowWeight * (0.55 + behavior.sustained * 0.45);

  // Medios: curvatura y corriente (fluido).
  const fluid =
    bands.mid * ui.midWeight * (0.5 + behavior.smooth * 0.5 + rms * 0.15);

  // Agudos: micro-perturbación y velocidad local.
  const light =
    bands.high * ui.highWeight * (0.45 + (1 - behavior.smooth) * 0.25);

  const pulse = (behavior.peak * 0.65 + flux * 0.35) * ui.pulseWeight;

  // Intensidad global: deforma tamaño/brillo sin escalar todo linealmente.
  const intensity = Math.min(1.2, rms * 1.1 + pulse * 0.35);

  // Velocidad de evolución del ruido: lenta con graves, más rápida con agudos.
  const flowSpeed =
    0.00035 +
    heavy * 0.0009 +
    fluid * 0.0016 +
    light * 0.0028 +
    pulse * 0.001;

  // Cohesión del campo: valores altos = movimiento más “arrastrado”.
  const drag = 0.78 + heavy * 0.18 - light * 0.12;

  // Dispersión: agudos y picos abren el campo; graves lo compactan.
  const spread = 0.55 + light * 0.55 + pulse * 0.25 - heavy * 0.2;

  // Memoria en pantalla: en silencio forzamos disolución (vacío activo).
  const dissolveBoost = silence * ui.silenceDissolve;
  const effectivePersistence = Math.max(
    0.02,
    ui.persistence * (1 - dissolveBoost * 0.85)
  );

  return {
    heavy,
    fluid,
    light,
    pulse,
    intensity,
    flowSpeed,
    drag: Math.max(0.35, Math.min(0.98, drag)),
    spread: Math.max(0.25, Math.min(1.35, spread)),
    noiseScale: ui.noiseScale * (0.85 + heavy * 0.35),
    turbulence: ui.turbulence * (0.7 + fluid * 0.5 + pulse * 0.35),
    persistenceAlpha: effectivePersistence,
    silence,
    rms,
    /** Passthrough para el lienzo generativo (disolución en silencio). */
    silenceDissolve: ui.silenceDissolve,
  };
}
