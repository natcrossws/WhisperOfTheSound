# Proyecto: Whisper of the Sound

Quiero construir un sistema audiovisual generativo en tiempo real donde una interpretación musical en vivo (piano acústico, voz, percusión) genere texturas visuales en evolución.

Esto NO debe ser un visualizador de música típico. Debe sentirse como una instalación artística.

## Stack tecnológico
- JavaScript
- p5.js con WEBGL (usar Three.js solo si es necesario)
- Web Audio API
- Opcional: shaders en GLSL para texturas orgánicas

## Concepto principal
El sistema no debe reaccionar de forma directa o simplista.
Debe:
- acumular memoria visual
- evolucionar con el tiempo
- responder de forma orgánica, no mecánica

## Entrada de audio
- Usar micrófono o interfaz de audio
- Idealmente soportar múltiples fuentes (piano, voz, percusión)
- Analizar en tiempo real:
  - amplitud (volumen)
  - espectro de frecuencias (FFT)
  - energía por bandas (graves, medios, agudos)

## Estrategia de audio
NO se busca identificar instrumentos con precisión.

En su lugar:
- clasificar el comportamiento del sonido (picos, sonidos sostenidos, suavidad)
- mapear estos comportamientos a diferentes sistemas visuales

## Sistema visual

Crear un sistema visual abstracto basado en:
- partículas
- ruido (Perlin o Simplex)
- movimiento tipo fluido
- texturas en evolución

Evitar:
- círculos simples reaccionando al audio
- patrones simétricos obvios
- animaciones predecibles

## Reglas de mapeo (idea inicial)

- frecuencias bajas → movimiento pesado, lento y denso
- frecuencias medias → estructuras fluidas
- frecuencias altas → partículas ligeras y rápidas

- amplitud → intensidad o deformación
- ritmo → pulsos o interrupciones

## Comportamiento temporal

Las visuales deben:
- acumularse con el tiempo
- desvanecerse lentamente
- transformarse continuamente

El silencio debe:
- disolver o desvanecer las formas
- generar vacío, no inactividad

## Estructura del código

Organizar en módulos:
- análisis de audio
- motor visual
- sistema de mapeo

## Interacción

- incluir parámetros ajustables (sliders o configuración)
- permitir experimentar con diferentes mapeos

## Primeros pasos

1. Configurar entrada de audio y análisis FFT
2. Crear un sistema básico de partículas reactivo al audio
3. Sustituir partículas por texturas más orgánicas usando noise
4. Introducir memoria visual (persistencia en pantalla)
5. Aumentar complejidad progresivamente

## Importante

Explicar todas las decisiones en comentarios.
Priorizar claridad sobre optimización.
Enfocarse en construir un sistema artístico, no solo una demo.