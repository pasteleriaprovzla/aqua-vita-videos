#!/usr/bin/env python3
"""Genera la narracion en off del video de prestamos con edge-tts.

La pista final dura 55 s (del segundo 3 al 58 del video) y coloca cada
frase en su tramo visual. Requiere edge-tts y ffmpeg/ffprobe:

    python -m pip install edge-tts
    python scripts/generate-narration.py

El MP3 resultante queda versionado en assets/narracion.mp3, por lo que el
render normal no necesita red ni ejecutar este script.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import edge_tts

VOICE = "es-MX-JorgeNeural"
RATE = "-4%"
VOLUME = "+0%"
PITCH = "+0Hz"

TRACK_START = 3.0
TRACK_DURATION = 55.0
TRACK_END = TRACK_START + TRACK_DURATION

# (segundo del video, frase). Los inicios coinciden con los cortes visuales.
SEGMENTS: list[tuple[float, str]] = [
    (
        3.0,
        "Bienvenido al módulo de préstamos de Aqua Vita. "
        "Cada equipo que sale debe volver.",
    ),
    (
        10.2,
        "Registre cliente, documento, teléfono, dirección y garantía. "
        "Añada los equipos y envíe la solicitud.",
    ),
    (
        20.3,
        "Aprobación: confirme la solicitud. Se asignan las unidades y se avisa al chofer.",
    ),
    (
        27.5,
        "El chofer recibe la misma información en su teléfono y puede "
        "registrar la devolución desde la calle.",
    ),
    (
        36.7,
        "Devolución parcial: registre lo que regresa. El préstamo sigue "
        "abierto y el saldo se actualiza.",
    ),
    (
        45.6,
        "Con las tres unidades devueltas, el préstamo se cierra y la garantía "
        "queda liberada.",
    ),
    (
        53.6,
        "Historial completo. Cada equipo vuelve.",
    ),
]


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def probe_duration(path: Path) -> float:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ]
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def write_script(path: Path) -> None:
    scenes = [
        "Panel y comparativa vender / prestar / crédito",
        "Modal Nuevo préstamo",
        "Aprobación de la solicitud",
        "Vista del chofer",
        "Devolución parcial",
        "Devolución total y cierre",
        "Historial y cierre de marca",
    ]
    rows = [
        "| Segundo | Escena | Narración |",
        "| --- | --- | --- |",
        "| 0–3 | Intro de marca | *(música, sin voz)* |",
    ]
    for (start, text), scene in zip(SEGMENTS, scenes):
        rows.append(f"| {start:.1f} | {scene} | {text} |")

    content = "\n".join(
        [
            "GUION DE NARRACIÓN — MÓDULO DE PRÉSTAMOS AQUA VITA",
            "",
            f"Voz: {VOICE} (Microsoft Edge TTS)",
            f"Velocidad: {RATE} · Tono: {PITCH} · Volumen: {VOLUME}",
            "Pista: 55 s, del segundo 3 al 58 del video.",
            "",
            "Tono: cercano, profesional y claro. Una idea por escena; "
            "deje respirar la imagen entre frases.",
            "",
            *rows,
            "",
            "Cierre visual: «Cada equipo vuelve.»",
            "",
            "Los tiempos exactos y el texto que sintetiza la voz viven en "
            "scripts/generate-narration.py.",
            "",
        ]
    )
    path.write_text(content, encoding="utf-8", newline="\n")


async def synthesize(text: str, destination: Path) -> None:
    communicate = edge_tts.Communicate(
        text,
        VOICE,
        rate=RATE,
        volume=VOLUME,
        pitch=PITCH,
    )
    await communicate.save(str(destination))


async def synthesize_all(jobs: list[tuple[str, Path]]) -> None:
    await asyncio.gather(*(synthesize(text, path) for text, path in jobs))


def build_track(parts: list[tuple[float, Path, float]], output: Path) -> None:
    """Mezcla cada frase en su offset exacto dentro de una pista de 55 s."""
    inputs: list[str] = []
    filters: list[str] = []
    labels: list[str] = []

    for index, (start, path, _duration) in enumerate(parts):
        inputs.extend(["-i", str(path)])
        delay_ms = max(0, round((start - TRACK_START) * 1000))
        label = f"a{index}"
        filters.append(
            f"[{index}:a]aresample=48000,"
            "aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"adelay={delay_ms}|{delay_ms}[{label}]"
        )
        labels.append(f"[{label}]")

    filters.append(
        "".join(labels)
        + f"amix=inputs={len(labels)}:normalize=0:dropout_transition=0,"
        "loudnorm=I=-16:TP=-1.5:LRA=11,"
        f"apad=whole_dur={TRACK_DURATION},"
        f"atrim=0:{TRACK_DURATION},asetpts=N/SR/TB[out]"
    )

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        *inputs,
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-t",
        f"{TRACK_DURATION}",
        "-metadata",
        "title=Narracion - Modulo de prestamos Aqua Vita",
        "-metadata",
        "artist=Aqua Vita",
        "-metadata",
        "comment=Voz sintetizada con edge-tts (es-MX-JorgeNeural)",
        str(output),
    ]
    run(command)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    assets = root / "assets"
    script = root / "guion.txt"
    output = assets / "narracion.mp3"
    assets.mkdir(parents=True, exist_ok=True)

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            raise SystemExit(f"No se encontró {tool} en PATH.")

    write_script(script)

    with tempfile.TemporaryDirectory(prefix="aqua-narracion-") as temp:
        temp_dir = Path(temp)
        tasks: list[tuple[str, Path]] = []
        for index, (_start, text) in enumerate(SEGMENTS):
            destination = temp_dir / f"segment-{index:02d}.mp3"
            tasks.append((text, destination))
        asyncio.run(synthesize_all(tasks))

        parts: list[tuple[float, Path, float]] = []
        for index, (start, _text) in enumerate(SEGMENTS):
            path = temp_dir / f"segment-{index:02d}.mp3"
            parts.append((start, path, probe_duration(path)))

        print("Duraciones medidas:")
        for index, (start, _path, duration) in enumerate(parts):
            print(
                f"  frase {index + 1}: {start:5.1f}s → {start + duration:5.2f}s "
                f"({duration:.2f}s)"
            )

        for index, (start, _path, duration) in enumerate(parts):
            end = start + duration
            next_start = (
                parts[index + 1][0] if index + 1 < len(parts) else TRACK_END
            )
            if end > next_start - 0.12:
                raise SystemExit(
                    f"La frase {index + 1} termina en {end:.2f}s y se cruza con "
                    f"el siguiente inicio ({next_start:.2f}s). "
                    "Acorta el texto o ajusta los tiempos."
                )
            if end > TRACK_END:
                raise SystemExit(
                    f"La frase {index + 1} termina en {end:.2f}s, fuera de la pista."
                )

        build_track(parts, output)

    duration = probe_duration(output)
    if abs(duration - TRACK_DURATION) > 0.08:
        raise SystemExit(
            f"Duración inesperada: {duration:.3f}s (esperada {TRACK_DURATION:.1f}s)."
        )

    print(f"guion:   {script}")
    print(f"narración: {output} ({duration:.2f}s)")
    for index, (start, _path, segment_duration) in enumerate(parts):
        print(f"  frase {index + 1}: {start:5.1f}s → {start + segment_duration:5.2f}s")


if __name__ == "__main__":
    main()
