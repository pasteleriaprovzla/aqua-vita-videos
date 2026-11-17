# Aqua Vita · Video del módulo de préstamos

Video de 60 segundos, 1440×900, 30 fps, que muestra **solo el procedimiento completo del módulo de préstamos** de Aqua Vita: solicitud, aprobación, entrega, devolución parcial, devolución total, cierre e historial.

La composición es un único archivo (`composicion.html`) con el panel administrativo y una vista de chofer de 390×844 incrustada entre los segundos 27 y 36. No modifica `AguaPanel (4).html` ni `Chofer (5).html`.

## Salida

| Dato | Valor |
| --- | --- |
| Archivo | `out/prestamos.mp4` |
| Duración | 60 s |
| Resolución | 1440 × 900 |
| FPS | 30 |
| Códec | H.264 / `yuv420p` |
| Audio | AAC 48 kHz estéreo · narración + música + 6 SFX |
| Render | HyperFrames 0.9.59 + GSAP 3.15.1 |

## Flujo de 6 pasos

1. **Solicitud** — el administrador crea el préstamo PR-003 para Tienda Doña Rosa: 2 botellas + 1 bebedero.
2. **Aprobación** — la solicitud aparece en la pestaña *Aprobación*; al aprobar se asignan las 3 unidades y se avisa al chofer.
3. **Entrega** — el chofer ve la misma información en su teléfono: cliente, unidades, fecha límite y ruta.
4. **Devolución** — el chofer inicia la devolución en campo; el administrador registra primero una devolución parcial y luego la devolución total.
5. **Cierre** — al completar 3/3 unidades, el préstamo se cierra y la garantía queda liberada.
6. **Historial** — PR-003 pasa al historial junto con el préstamo cerrado anterior; el contador de abiertos queda en 0.

El video usa **capas de estado** para representar estos cambios sin recargar la página ni consultar datos. Los conteos narrativos son:

- Inicio: **5 unidades** en préstamo, **2 préstamos abiertos**.
- Después de aprobar PR-003: **8 unidades**, **3 abiertos**.
- Después de la devolución parcial: **7 unidades**, **2 abiertos**, PR-003 en estado *Parcial* (1/3).
- Después del cierre: **5 unidades**, **0 abiertos**, PR-003 en estado *Devuelto* (3/3).

## Vender, prestar y otorgar crédito

La comparación del video (segundos 4–9) resume la diferencia operativa:

| Operación | Qué pasa con el equipo | Qué controla el sistema |
| --- | --- | --- |
| **Vender** | Se entrega a cambio de un pago único; la propiedad pasa al cliente. | Stock vendido y comprobante. No hay retorno. |
| **Prestar** | El equipo sigue siendo de Aqua Vita y **debe volver**. | Unidad, cliente, chofer, fecha límite, estado de devolución y garantía. |
| **Otorgar crédito** | No hay equipo físico que devolver; es un pago diferido por un producto o servicio. | Deuda / cuenta por cobrar. No genera devolución de equipos. |

El módulo que se muestra es el de **préstamos**: el que conecta oficina y calle porque el mismo registro viaja con el chofer y vuelve con la devolución.

## Línea de tiempo

Todos los tiempos están en segundos dentro de `build()` en `composicion.html`.

| Tramo | Escena |
| --- | --- |
| 0–3 | Intro de marca y los 5 hitos del procedimiento. |
| 3–10 | Panel admin, tarjetas PR-001 / PR-002 / PR-000 y comparativa *vender / prestar / crédito*. |
| 10–20 | Modal *Nuevo préstamo*: tipeo de campos, construcción de equipos y envío de la solicitud. |
| 20–27 | Pestaña *Aprobación*, aprobación de PR-003 y actualización de conteos. |
| 27–36 | Vista de chofer 390×844: misma información, botón *Registrar devolución*. |
| 36–45 | Devolución parcial: 1 de 3 botellas; PR-003 queda *Parcial*. |
| 45–53 | Devolución total: 2 botellas + 1 bebedero; cierre y garantía liberada. |
| 53–58 | Pestaña *Historial*: PR-003 y PR-000 cerrados; 0 pendientes. |
| 58–60 | Outro: *Cada equipo vuelve.* |

## Audio

La capa de audio es local y se renderiza con el video. La voz está versionada: el render no descarga nada.

| Archivo | Duración | Uso |
| --- | --- | --- |
| `assets/bgm.mp3` | 60,24 s | Música instrumental suave, 80 BPM, pad + arpegio. Se reproduce a `data-volume="0.08"` (−22 dB) para dejar la voz al frente. |
| `assets/narracion.mp3` | 54,92 s | Voz en off profesional (`es-MX-JorgeNeural`, Edge TTS), normalizada a −16 LUFS. Entra en el segundo 3 y cubre hasta el 58. |
| `assets/click.wav` | 0,16 s | Click suave de UI. |
| `assets/success.wav` | 1,90 s | Ding brillante (quinta perfecta E–B) para aprobaciones y cierres. |

### Generar los audios

```bash
cd video/prestamos
npm run audio:generate
```

El script `scripts/generate-audio.mjs` compone la música muestra a muestra con Node puro (sin dependencias), escribe WAV PCM 16-bit y usa FFmpeg para el MP3 final. Es determinista: no usa `Math.random()` ni red. Los tres archivos están versionados, así que el render no necesita ejecutar este paso.

### Integración con HyperFrames

Dentro de `#root` hay ocho elementos `<audio>` con `id`, `data-start`, `data-duration`, `data-volume` y `data-track-index`. HyperFrames descubre esos clips y los mezcla con FFmpeg en el MP4; no hay que llamar `play()` ni `currentTime` desde JavaScript.

- La narración lleva `data-timeline-role="voiceover"`, `data-start="3"`, `data-duration="55"` y `data-volume="1"`.
- La música lleva `data-timeline-role="music"`, `loop` y `data-volume="0.08"`.
- Los SFX usan un elemento por disparo (HyperFrames agenda cada clip una vez).
- `window.setTime(ms)` conserva el guard `lastSfxTime`, pero solo registra el cue cruzado en `window.__lastAudioCue`. El audio real lo agenda el runtime desde los atributos; controlar medios de forma imperativa está prohibido por el lint (`imperative_media_control`).

| Gesto visual | Brief | Frame real | SFX |
| --- | --- | --- | --- |
| Abrir modal *Nuevo préstamo* | 10,5 s | 10,06 s | `sfx-click` |
| Enviar solicitud | 20,0 s | 19,00 s | `sfx-click-submit` |
| Aprobado | 23,0 s | 23,00 s | `sfx-success` |
| Abrir devolución (teléfono) | 36,0 s | 35,40 s | `sfx-click-return` |
| Devolución parcial | 45,0 s | 42,72 s | `sfx-success-partial` |
| Préstamo cerrado | 53,0 s | 50,90 s | `sfx-success-closed` |

Los tiempos del brief caían entre 0,4 y 2,3 s después del gesto; se ajustaron al frame real para que el sonido coincida con la acción. Si se prefiere el valor literal, cambia el `data-start` del elemento y su entrada en `AUDIO_CUES` (ambos deben coincidir).

### Narración

El guion legible está en `guion.txt`; la fuente de verdad (texto y tiempos) y la mezcla están en `scripts/generate-narration.py`.

| Entrada | Escena | Frase |
| --- | --- | --- |
| 3,0 s | Panel y comparativa | «Bienvenido al módulo de préstamos de Aqua Vita…» |
| 10,2 s | Modal *Nuevo préstamo* | «Registre cliente, documento, teléfono…» |
| 20,3 s | Aprobación | «Aprobación: confirme la solicitud…» |
| 27,5 s | Vista del chofer | «El chofer recibe la misma información…» |
| 36,7 s | Devolución parcial | «Devolución parcial: registre lo que regresa…» |
| 45,6 s | Devolución total | «Con las tres unidades devueltas…» |
| 53,6 s | Historial y cierre | «Historial completo. Cada equipo vuelve.» |

Para regenerarla:

```bash
cd video/prestamos
python -m pip install edge-tts
npm run narration:generate
```

`npm run narration:generate` ejecuta `python scripts/generate-narration.py`.

Requiere Python 3.9 o superior, `edge-tts` y FFmpeg/ffprobe en PATH. El script sintetiza cada frase con `es-MX-JorgeNeural` a −4 %, comprueba que no se solapen, las coloca en su offset exacto dentro de una pista de 55 s y normaliza el conjunto a −16 LUFS / −1,5 dBTP. También reescribe `guion.txt` para que el guion y la voz no se desincronicen. La red solo se usa al regenerar; `assets/narracion.mp3` está versionado y el render funciona sin conexión.

En el MP4 final la voz entra exactamente a los 3,00 s (correlación de energía contra `narracion.mp3`), el mix integrado queda en −16 LUFS y el pico real en −1,0 dBTP. Los tramos sin voz bajan a unos −36 dB de media, así que la música acompaña sin competir con la locución.

### Flags del CLI

El CLI real de HyperFrames 0.9.59 **no tiene** `--audio`, `--autoplay-policy`, `--mute-audio` ni `--duration`. El audio se activa por la presencia de clips audibles. Su Chromium ya se lanza con `--autoplay-policy=no-user-gesture-required`; no se usa `--mute-audio`. Añadir flags inexistentes rompería el render.

### Cambiar la duración

La duración y el tamaño viven en el elemento raíz:

```html
<div id="root"
     data-composition-id="prestamos"
     data-start="0"
     data-duration="60"
     data-width="1440"
     data-height="900"
     data-fps="30">
```

Si cambias `data-duration`:

1. Ajusta los tweens de `build()` y el cierre del timeline.
2. Actualiza el límite de `window.setTime` (hoy hace `Math.min(60000, …)`).
3. Ajusta `data-duration` de `#narracion`, `#bgm` y los SFX, y las entradas de `AUDIO_CUES` si cambian los gestos. Si mueves el corte de entrada o salida de la voz, regenera `narracion.mp3` desde `scripts/generate-narration.py`.
4. Mantén el último tween/placeholder antes del nuevo final.
5. Verifica que `window.__timelines['prestamos']` siga registrándose después de construir el timeline.

HyperFrames toma el tamaño y la duración del elemento raíz, **no** de flags `--width`, `--height` o `--duration` (esas flags no existen en el CLI real).

## Datos mock

Los datos están escritos en el HTML, no vienen de Supabase ni de una API:

- **PR-001** · Minimarket El Sol · Luis Mamani · vencido · 3 unidades.
- **PR-002** · Restaurante Los Andes · María Fernández · en curso · 2 bebederos.
- **PR-000** · Panadería San José · Juana Rojas · historial · 2 bebederos.
- **PR-003** · Tienda Doña Rosa · Rosa Quispe · el préstamo que se crea, aprueba, devuelve y cierra.

Al cambiar nombres, cantidades o fechas hay que tocar también las capas de estado y los conteos del timeline. Los estados de PR-003 están separados por capas (`pr003-badge-*`, `pr003-text-*`, `pr003-count-*`, `pr003-chips-*`, `pr003-footer-*`) para que las transiciones sean deterministas y no dependan de JavaScript asíncrono.

## Cursor e interacción simulada

`CURSOR_TARGETS` define los movimientos y clics. En tiempo de build se calculan las coordenadas reales con `getBoundingClientRect()` y se publican como:

```js
window.CURSOR_EVENTS = [
  { time: 10050, x: 1234, y: 308, click: true },
  // …
];
```

- `time` está en milisegundos.
- `click: true` genera un anillo de pulso en ese punto.
- `dx` / `dy` permiten desplazar el puntero respecto del centro del elemento; se usan en el botón del teléfono.
- El cursor se oculta durante las tarjetas de confirmación y la escena del teléfono, y reaparece en los momentos definidos en el timeline.

Para mover un clic, cambia el selector o las coordenadas en `CURSOR_TARGETS` y vuelve a renderizar. El script no usa `Math.random`, `setTimeout`, `setInterval` ni datos remotos.

## Render local

Requisitos:

- **Node.js 22 o superior.** HyperFrames 0.9.59 declara `engines.node >=22`; Node 20 no es compatible con el CLI.
- FFmpeg disponible en `PATH`.
- Haber ejecutado `npm ci` dentro de `video/prestamos`.

```bash
cd video/prestamos
npm ci
npm run lint
npm run render
```

El comando de `package.json` es equivalente a:

```bash
npx hyperframes render \
  -c composicion.html \
  --fps 30 \
  --quality looks \
  --output ../../out/prestamos.mp4
```

La música, la narración y los SFX ya están versionados en `assets/`. Si quieres regenerar la música o los SFX, ejecuta `npm run audio:generate`; para la voz, `npm run narration:generate`. Después vuelve a renderizar.

Para comprobar que el MP4 salió con audio:

```bash
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate,channels \
  -of default=noprint_wrappers=1 ../../out/prestamos.mp4
```

Debe imprimir `codec_name=aac`, `sample_rate=48000` y `channels=2`.

Notas del CLI real:

- `-c composicion.html` renderiza el archivo directamente; el argumento posicional es un directorio de proyecto, no un archivo.
- El tamaño y la duración salen del root (`data-width`, `data-height`, `data-duration`, `data-fps`).
- `--quality draft` sirve para revisar rápido; `looks` es la calidad de entrega usada por el workflow.
- La primera ejecución puede tardar varios minutos: HyperFrames captura 1800 frames.
- Durante la fase de audio el log muestra `[audio] phases {prepare, mix, encode…}`; si no aparece, revisa que los `<audio>` sigan dentro de `#root` y con `src` local.

### Verificación visual (opcional)

`hyperframes check` y `hyperframes snapshot` esperan un `index.html` de proyecto. Como el entregable es un único `composicion.html`, para revisar localmente se puede crear un índice temporal y borrarlo después:

```bash
cd video/prestamos
cp composicion.html index.html
npx hyperframes snapshot . --at 3,12,23,30,40,52,55,59 --no-end --output ../../out/snapshots
rm index.html
```

No dejes `index.html` en el commit: el archivo de entrega es `composicion.html`.

## GitHub Actions

Workflow: `.github/workflows/render-prestamos.yml`.

- Se dispara con `workflow_dispatch` y con push a `video/prestamos/**` (o al propio workflow).
- Corre en `ubuntu-latest`, con **Node 22** (no 20: lo exige HyperFrames 0.9.59).
- Instala FFmpeg, ejecuta `npm ci`, verifica los assets de audio y corre lint y render.
- Comprueba que `narracion.mp3`, `bgm.mp3`, los SFX y `guion.txt` existan; además valida que la voz dure entre 54 y 56 s.
- Verifica con `ffprobe` que el MP4 contenga una pista AAC antes de subirlo.
- Sube el artifact `video-prestamos` con `out/prestamos.mp4`.
- `timeout-minutes: 30` y `permissions: contents: read`.

Para lanzarlo desde GitHub:

1. Abre **Actions → Render préstamos → Run workflow**.
2. Espera a que termine.
3. Descarga el artifact `video-prestamos`.

## Script de publicación

Desde la raíz del repositorio:

```bash
./render-prestamos.sh
```

El script:

1. Verifica `gh auth status`.
2. Hace commit de los archivos del video y del workflow.
3. Hace push a la rama actual.
4. Lanza el workflow y obtiene el `RUN_ID`.
5. Espera con `gh run watch`.
6. Descarga el artifact en `./output/`.
7. Imprime `✅ Video listo en ./output/prestamos.mp4`.

Requiere GitHub CLI autenticado y permisos para disparar workflows en el repositorio.

## Límites y decisiones

- **Audio local.** Música y SFX se generan con `scripts/generate-audio.mjs`; la narración se sintetiza con `edge-tts` desde `scripts/generate-narration.py`. Los cuatro archivos se versionan en `assets/` y el render no necesita red.
- **Sin red en render.** GSAP, Plus Jakarta Sans, Font Awesome y los audios están vendorizados en `assets/`. La composición no consulta Supabase, APIs, Chart.js, Leaflet, jsPDF, XLSX ni `localStorage`.
- **Determinismo.** No hay `Math.random`, timers, animaciones infinitas ni carga asíncrona de datos. Se espera `document.fonts.ready` antes de construir el timeline y se expone `window.setTime(ms)` para búsquedas exactas por frame. El generador de audio usa un PRNG con semilla fija.
- **Un solo HTML.** Todo el escenario vive en `composicion.html`; no hay subcomposiciones montadas.
- **Datos estáticos.** Los conteos y estados se mantienen a mano; no es un tablero operativo real.
- **Costo de render.** El CI usa CPU y puede acercarse al límite de 30 minutos; si se cambia el diseño conviene probar primero con `--quality draft`.
- **Fuente de verdad.** `AguaPanel (4).html` y `Chofer (5).html` son la referencia de producto y no se editan desde este proyecto.
