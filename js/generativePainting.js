/**
 * Pintura generativa por eventos sonoros
 *
 * No usamos un modelo de IA remoto: el “criterio” es algorítmico y reactivo al
 * espectro y al comportamiento (picos, sostenido). Cada nota o ataque fuerte
 * añade una capa que permanece en un buffer 2D y se acumula con el tiempo.
 * Así el lienzo tiene memoria pictórica distinta del velo de partículas WEBGL.
 *
 * Importante: no llamamos randomSeed/noiseSeed sobre la instancia p5 global,
 * porque alteraría el campo de partículas. Usamos RNG con semilla propia y
 * desplazamientos grandes en noise() para no interferir con el resto del sketch.
 */

/**
 * Generador pseudoaleatorio determinista (mulberry32).
 * @param {number} seed
 */
function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {import('p5').Graphics} pg lienzo offscreen 2D
 * @param {import('p5')} hostP instancia p5 (solo para noise con mismos parámetros)
 * @param {object} features salida de AudioAnalyzer.update()
 * @param {object} mapped salida de mapAudioToVisual()
 * @param {number} strokeIndex contador monótono de capas (unicidad)
 */
function paintGenerativeNoteLayer(pg, hostP, features, mapped, strokeIndex) {
  const w = pg.width;
  const h = pg.height;
  const seed =
    (strokeIndex * 73856093) ^
    (Math.floor(features.bands.low * 10000) * 19349663) ^
    (Math.floor(features.bands.mid * 10000) * 83492791) ^
    (Math.floor(features.flux * 10000) * 50331653);
  const rng = createRng(seed >>> 0);

  const ox = rng() * 4000 + strokeIndex * 17.13;
  const oy = rng() * 4000 + strokeIndex * 29.71;
  const oz = rng() * 12.7;

  // “Estilo” elegido como función del contenido espectral + semilla: variedad
  // con coherencia; no es clasificación de instrumento.
  const centroidHint =
    features.bands.low * 0.15 +
    features.bands.mid * 0.45 +
    features.bands.high * 0.85;
  const style = Math.floor((rng() * 0.4 + centroidHint * 0.6 + strokeIndex * 0.07) * 4) % 4;

  // Tinta sobre papel blanco: tonos profundos, no brillo tipo ADD sobre negro.
  const baseHue = 0.06 + centroidHint * 0.14 + rng() * 0.04;
  const sat = 0.32 + mapped.fluid * 0.38 + features.behavior.sustained * 0.14;
  const bri = 0.16 + mapped.intensity * 0.22;

  const cx = rng() * w * 0.65 + w * 0.175;
  const cy = rng() * h * 0.65 + h * 0.175;
  const scale = 0.7 + mapped.heavy * 0.9 + rng() * 0.35;

  pg.push();
  pg.colorMode(pg.HSB, 1, 1, 1, 1);
  pg.blendMode(pg.BLEND);
  pg.noStroke();

  if (style === 0) {
    // Velos: curvas suaves moduladas por ruido (textura orgánica laminar).
    const strips = 3 + Math.floor(rng() * 4);
    for (let s = 0; s < strips; s++) {
      const hy = baseHue + (rng() - 0.5) * 0.04;
      const steps = 28 + Math.floor(rng() * 16);
      let px = cx + (rng() - 0.5) * w * 0.15;
      let py = cy + (rng() - 0.5) * h * 0.15;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const ang =
          hostP.noise(px * 0.002 + ox, py * 0.002 + oy, oz + s * 2.1) * Math.PI * 2;
        const step = (12 + mapped.light * 40 + rng() * 20) * scale;
        const nx = px + Math.cos(ang) * step;
        const ny = py + Math.sin(ang) * step;
        const a = (0.18 + mapped.pulse * 0.14) * (0.45 + (1 - t) * 0.55);
        pg.stroke(hy, sat, bri, a);
        pg.strokeWeight(1.4 + mapped.spread * 1.8 + rng());
        pg.line(px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
    pg.noStroke();
  } else if (style === 1) {
    // Floraciones: manchas superpuestas (mancha de tinta / reverberación).
    const blobs = 18 + Math.floor(rng() * 22);
    for (let b = 0; b < blobs; b++) {
      const bx = cx + (rng() - 0.5) * w * 0.5 * scale;
      const by = cy + (rng() - 0.5) * h * 0.5 * scale;
      const rw =
        (15 + rng() * 90) *
        (0.5 + features.bands.mid) *
        (0.85 + mapped.spread * 0.25);
      const rh = rw * (0.55 + rng() * 0.9);
      const rot = rng() * Math.PI;
      const hy = baseHue + (rng() - 0.5) * 0.06;
      const a = (0.12 + mapped.intensity * 0.14) * (0.5 + rng() * 0.5);
      pg.push();
      pg.translate(bx, by);
      pg.rotate(rot);
      pg.fill(hy, sat, bri, a);
      pg.ellipse(0, 0, rw, rh);
      pg.pop();
    }
  } else if (style === 2) {
    // Trama: trazos cortos siguiendo un campo de ruido (textura tejida).
    const strokes = 55 + Math.floor(rng() * 55);
    for (let i = 0; i < strokes; i++) {
      const sx = rng() * w;
      const sy = rng() * h;
      const ang =
        hostP.noise(sx * 0.003 + ox, sy * 0.003 + oy, oz) * Math.PI * 2.2;
      const len = (20 + rng() * 80) * scale * (0.6 + features.behavior.peak * 0.5);
      const ex = sx + Math.cos(ang) * len;
      const ey = sy + Math.sin(ang) * len;
      const hy = baseHue + (rng() - 0.5) * 0.05;
      const sw = 0.8 + rng() * 2.2 + mapped.heavy * 1.2;
      const a = 0.14 + mapped.fluid * 0.12;
      pg.stroke(hy, sat, bri, a);
      pg.strokeWeight(sw);
      pg.line(sx, sy, ex, ey);
    }
    pg.noStroke();
  } else {
    // Constelación: arcos y puntos densos en zonas de alta energía aguda.
    const arcs = 8 + Math.floor(rng() * 7);
    for (let a = 0; a < arcs; a++) {
      const ax = rng() * w;
      const ay = rng() * h;
      const r = (40 + rng() * 160) * scale;
      const start = rng() * Math.PI;
      const span = Math.PI * (0.35 + rng() * 0.85);
      const hy = baseHue + rng() * 0.07;
      pg.stroke(hy, sat, bri + 0.06, 0.12 + mapped.light * 0.16);
      pg.strokeWeight(1.2 + rng() * 2 + mapped.pulse);
      pg.noFill();
      pg.arc(ax, ay, r, r, start, start + span);
    }
    pg.noStroke();
    const dots = 40 + Math.floor(rng() * 60);
    for (let d = 0; d < dots; d++) {
      const dx = rng() * w;
      const dy = rng() * h;
      const n = hostP.noise(dx * 0.004 + ox, dy * 0.004 + oy, oz + 3);
      if (n < 0.35 + features.bands.high * 0.35) continue;
      const hy = baseHue + (rng() - 0.5) * 0.08;
      pg.fill(hy, sat * 0.9, bri, 0.14 + rng() * 0.12);
      const ds = 1.2 + rng() * 3.5;
      pg.ellipse(dx, dy, ds, ds);
    }
  }

  pg.pop();
  pg.blendMode(pg.BLEND);
}

/**
 * Velo de olvido sobre el lienzo: rectángulo blanco semitransparente que acerca
 * la pintura al papel en blanco (mientras suena poco; en silencio más).
 * @param {import('p5').Graphics} pg
 * @param {number} fadeWhileSound alpha 0-255 del rect blanco encima
 * @param {number} fadeWhileSilence alpha extra en silencio
 * @param {number} silence 0-1
 */
function fadePaintAccumulation(pg, fadeWhileSound, fadeWhileSilence, silence) {
  const a = fadeWhileSound + silence * fadeWhileSilence;
  if (a <= 0.05) return;
  pg.push();
  pg.colorMode(pg.RGB, 255);
  pg.blendMode(pg.BLEND);
  pg.noStroke();
  pg.fill(255, 255, 255, Math.min(255, a));
  pg.rect(0, 0, pg.width, pg.height);
  pg.pop();
}
