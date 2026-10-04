#!/usr/bin/env python3
"""Transcribe every generated clip and compare it with its script.

Checks that Ruth says the scripted words and does not read a tag aloud. It does
not judge emotional delivery. Needs faster-whisper (pip install faster-whisper).

    python scripts/verify_audio.py [--only id,id] [--model small]
"""

import argparse
import difflib
import json
import re
import subprocess

import numpy as np
from faster_whisper import WhisperModel

from generate_audio import CONFIG, ROOT, TAG, build_jobs, spoken_text

REPORT = ROOT / "docs" / "audio-verification.json"
THRESHOLD = 0.8


def load_audio(path):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.int16).astype(np.float32) / 32768


def normalize(text):
    text = text.lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", re.sub(r"[^\w' ]+", " ", text)).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated emotion, use case or extra ids")
    parser.add_argument("--variants", help="comma-separated variants, e.g. en-scot")
    parser.add_argument("--model", default="small")
    args = parser.parse_args()

    config = json.loads(CONFIG.read_text())
    only = set(args.only.split(",")) if args.only else None
    all_jobs = build_jobs(config)
    hashes = {job["path"]: job["hash"] for job in all_jobs}
    chosen = set(args.variants.split(",")) if args.variants else None
    jobs = [job for job in all_jobs if (only is None or job["id"] in only) and (chosen is None or job["variant"] in chosen)
            and (ROOT / job["path"]).exists()]
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}
    checks = {check["clip"]: check for check in report.get("checks", []) if hashes.get(check["clip"]) == check.get("hash")}

    for job in jobs:
        script = spoken_text(job["prompt"])
        segments, _ = model.transcribe(load_audio(ROOT / job["path"]), language=job["language"], beam_size=5)
        recognized = " ".join(segment.text.strip() for segment in segments).strip()
        similarity = difflib.SequenceMatcher(None, normalize(script), normalize(recognized), autojunk=False).ratio()
        script_words = set(normalize(script).split())
        tag_words = {word for tag in TAG.findall(job["prompt"]) for word in normalize(tag).split() if len(word) > 3}
        spoken_tags = sorted(word for word in tag_words - script_words if word in normalize(recognized).split())
        checks[job["path"]] = {
            "clip": job["path"], "hash": job["hash"], "script": script, "recognized": recognized,
            "similarity": round(similarity, 3), "spoken_tag_words": spoken_tags,
            "flagged": similarity < THRESHOLD or bool(spoken_tags),
        }
        mark = "FLAG" if checks[job["path"]]["flagged"] else "ok  "
        print(f"{mark} {similarity:.2f} {job['path']}: {recognized}" + (f" [tag words: {spoken_tags}]" if spoken_tags else ""), flush=True)

    ordered = [checks[path] for path in sorted(checks)]
    REPORT.write_text(json.dumps({
        "method": f"Local faster-whisper {args.model}, CPU int8. Each clip is transcribed in its own language and compared "
                  "with its script after removing audio tags. Flags similarity below "
                  f"{THRESHOLD} or tag words that were spoken aloud. This checks content, not emotional delivery.",
        "minimum_similarity": min(check["similarity"] for check in ordered),
        "flagged": [check["clip"] for check in ordered if check["flagged"]],
        "checks": ordered,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"{sum(check['flagged'] for check in ordered)} of {len(ordered)} clips flagged")


if __name__ == "__main__":
    main()
