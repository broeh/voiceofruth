#!/usr/bin/env python3
"""Cut the four recorded batches into the 48 public wheel performances.

Run from any directory with Python 3 and FFmpeg/FFprobe installed.
The originals in recordings/ are never modified.
"""

import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EMOTIONS = [
    "warm", "excited", "curious", "playful", "confident", "amazed",
    "tender", "sad", "frustrated", "urgent", "whisper", "calm",
]
BATCHES = [
    ("en", "same-line", "01-english-same-line.txt", "ElevenLabs_2026-10-03T21_24_43__s50_v4.mp3"),
    ("nl", "same-line", "02-dutch-same-line.txt", "ElevenLabs_2026-10-03T21_28_00__s50_v4.mp3"),
    ("en", "scene", "03-english-performance-scenes.txt", "ElevenLabs_2026-10-03T21_26_37__s50_v4.mp3"),
    ("nl", "scene", "04-dutch-performance-scenes.txt", "ElevenLabs_2026-10-03T21_28_40_Ruth - Professional female voiceover_pvc_sp100_s30_sb83_v4.mp3"),
]


def run(args):
    return subprocess.run(args, text=True, capture_output=True, check=True)


def duration(path):
    return float(run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ]).stdout)


def main():
    manifest = {"en": {}, "nl": {}}
    audit = []
    for language, mode, script_name, source_name in BATCHES:
        source = ROOT / "recordings" / source_name
        source_duration = duration(source)
        script = (ROOT / "recording-scripts" / script_name).read_text()
        paragraphs = script.strip().split("\n\n")
        assert len(paragraphs) == len(EMOTIONS), script_name
        lines = [re.sub(r"\[[^]]*\]", "", p).strip() for p in paragraphs]
        result = run([
            "ffmpeg", "-hide_banner", "-i", str(source), "-af",
            "silencedetect=noise=-38dB:d=0.1", "-f", "null", "-",
        ])
        gaps = [
            {"start": float(end) - float(length), "end": float(end), "duration": float(length)}
            for end, length in re.findall(
                r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", result.stderr
            )
        ]
        separators = [g for g in gaps if g["duration"] >= 1.1 and g["end"] < source_duration - 0.05]
        assert len(separators) == 11, f"Expected 11 batch separators: {source_name}"
        leading = next((g for g in gaps if g["start"] < 0.02), None)
        trailing = next((g for g in reversed(gaps) if g["end"] >= source_duration - 0.05), None)
        first_start = max(0, leading["end"] - 0.08) if leading else 0
        last_end = min(source_duration, trailing["start"] + 0.14) if trailing else source_duration
        starts = [first_start] + [max(0, g["end"] - 0.08) for g in separators]
        ends = [g["start"] + 0.14 for g in separators] + [last_end]
        manifest[language][mode] = {}
        for index, (emotion, text, start, end) in enumerate(zip(EMOTIONS, lines, starts, ends)):
            destination = ROOT / "audio" / language / mode / f"{emotion}.mp3"
            destination.parent.mkdir(parents=True, exist_ok=True)
            assert end > start
            length = end - start
            run([
                "ffmpeg", "-v", "error", "-y", "-ss", f"{start:.6f}", "-i", str(source),
                "-t", f"{length:.6f}", "-af",
                f"afade=t=in:st=0:d=0.01,afade=t=out:st={length - 0.015:.6f}:d=0.015",
                "-codec:a", "libmp3lame", "-q:a", "2", "-ar", "44100", "-ac", "1",
                "-map_metadata", "-1", str(destination),
            ])
            relative = destination.relative_to(ROOT).as_posix()
            clip_duration = duration(destination)
            manifest[language][mode][emotion] = {"file": relative, "text": text, "duration": round(clip_duration, 3)}
            audit.append({
                "language": language, "mode": mode, "emotion": emotion, "position": index + 1,
                "source": source_name, "source_start": round(start, 6), "source_end": round(end, 6),
                "clip": relative, "duration": round(clip_duration, 3), "script": text,
                "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            })
        print(f"{language} {mode}: 12 clips from {source_name}")
    (ROOT / "audio-data.js").write_text("window.RUTH_AUDIO = " + json.dumps(manifest, ensure_ascii=False, indent=2) + ";\n")
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs" / "audio-cuts.json").write_text(json.dumps({
        "method": "Eleven separator gaps >= 1.1 seconds at -38 dB; preserve 80 ms lead-in and 140 ms tail; 10/15 ms fades. Original level differences preserved.",
        "clips": audit,
    }, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {len(audit)} clips and audio-data.js")


if __name__ == "__main__":
    main()
