#!/usr/bin/env python3
"""Generate the wheel performances and voice samples with ElevenLabs Eleven v4.

Reads scripts/emotions.json, calls the Text to Speech API for every clip whose
prompt or settings changed since the last run, and rewrites audio-data.js.
Needs ELEVEN_API_KEY in the environment and FFprobe installed.

    python scripts/generate_audio.py --dry-run
    python scripts/generate_audio.py
    python scripts/generate_audio.py --only singing,opera --force
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "scripts" / "emotions.json"
LOG = ROOT / "docs" / "audio-generation.json"
DATA = ROOT / "audio-data.js"
LANGUAGES = ("en", "nl")
MODES = ("scene", "same-line")
TAG = re.compile(r"\[[^\]]*\]")


def spoken_text(prompt):
    text = re.sub(r"\s+", " ", TAG.sub(" ", prompt)).strip()
    return re.sub(r"\s+([.,!?…])", r"\1", text)


def make_prompt(config, language, text):
    return f"{config['english_prefix']} {text}" if language == "en" else text


def build_jobs(config):
    jobs = []
    wheel_voice = config["voices"][config["wheel_voice"]]
    for emotion in config["emotions"]:
        for language in LANGUAGES:
            same = emotion["same"]
            same = same[language] if isinstance(same, dict) else same.replace("{line}", config["same_line"][language])
            for mode, text in (("scene", emotion["scene"][language]), ("same-line", same)):
                jobs.append({
                    "id": emotion["id"], "language": language, "mode": mode, "voice_id": wheel_voice,
                    "path": f"audio/{language}/{mode}/{emotion['id']}.mp3",
                    "prompt": make_prompt(config, language, text),
                })
    for extra in config["extras"]:
        for language in LANGUAGES:
            jobs.append({
                "id": extra["id"], "language": language, "mode": None, "voice_id": config["voices"][extra["voice"]],
                "path": extra["file"].replace("{lang}", language),
                "prompt": make_prompt(config, language, extra["text"][language]),
            })
    for job in jobs:
        settings = [config["model_id"], config["output_format"], config["voice_settings"], job["voice_id"], job["prompt"]]
        job["hash"] = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:16]
    return jobs


def synthesize(api_key, config, job):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{job['voice_id']}?output_format={config['output_format']}"
    body = json.dumps({
        "text": job["prompt"], "model_id": config["model_id"], "voice_settings": config["voice_settings"],
    }).encode()
    for attempt in range(5):
        request = urllib.request.Request(url, data=body, method="POST", headers={
            "xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg",
        })
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.read(), response.headers.get("character-cost"), response.headers.get("request-id")
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(3 * 2 ** attempt)
                continue
            raise RuntimeError(f"{job['path']}: HTTP {error.code} {error.read()[:300]!r}") from None


def duration(path):
    return round(float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        text=True, capture_output=True, check=True,
    ).stdout), 3)


def write_data(config, jobs, log):
    by_path = {job["path"]: job for job in jobs}

    def take(path):
        job = by_path[path]
        return {"file": path, "prompt": job["prompt"], "text": spoken_text(job["prompt"]),
                "duration": log["clips"][path]["duration"]}

    emotions = []
    for emotion in config["emotions"]:
        emotions.append({
            "id": emotion["id"], "category": emotion["category"], "en": emotion["en"], "nl": emotion["nl"],
            "takes": {language: {mode: take(f"audio/{language}/{mode}/{emotion['id']}.mp3") for mode in MODES}
                      for language in LANGUAGES},
        })
    extras = {extra["id"]: {language: take(extra["file"].replace("{lang}", language)) for language in LANGUAGES}
              for extra in config["extras"]}
    data = {"categories": config["categories"], "emotions": emotions, "extras": extras}
    DATA.write_text("window.RUTH_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="comma-separated emotion or extra ids")
    parser.add_argument("--force", action="store_true", help="regenerate even when unchanged")
    parser.add_argument("--dry-run", action="store_true", help="list pending clips and their character count")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    config = json.loads(CONFIG.read_text())
    jobs = build_jobs(config)
    log = json.loads(LOG.read_text()) if LOG.exists() else {"clips": {}}
    only = set(args.only.split(",")) if args.only else None
    pending = [
        job for job in jobs
        if (only is None or job["id"] in only) and (
            args.force or not (ROOT / job["path"]).exists() or log["clips"].get(job["path"], {}).get("hash") != job["hash"]
        )
    ]
    print(f"{len(pending)} of {len(jobs)} clips pending, {sum(len(job['prompt']) for job in pending)} characters")
    if args.dry_run:
        for job in pending:
            print(f"  {job['path']}: {job['prompt']}")
        return

    api_key = os.environ["ELEVEN_API_KEY"]
    lock = threading.Lock()
    failures = []

    def run(job):
        audio, cost, request_id = synthesize(api_key, config, job)
        destination = ROOT / job["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(audio)
        entry = {
            "prompt": job["prompt"], "voice_id": job["voice_id"], "model_id": config["model_id"],
            "voice_settings": config["voice_settings"], "hash": job["hash"], "character_cost": cost,
            "request_id": request_id, "sha256": hashlib.sha256(audio).hexdigest(),
            "duration": duration(destination), "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        with lock:
            log["clips"][job["path"]] = entry
            LOG.parent.mkdir(exist_ok=True)
            LOG.write_text(json.dumps(log, ensure_ascii=False, indent=1) + "\n")
        return job, entry

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run, job) for job in pending]
        for done, future in enumerate(as_completed(futures), 1):
            try:
                job, entry = future.result()
                print(f"[{done}/{len(pending)}] {job['path']} {entry['duration']}s cost={entry['character_cost']}", flush=True)
            except Exception as error:  # report every failed clip, keep the rest
                failures.append(str(error))
                print(f"[{done}/{len(pending)}] FAILED {error}", flush=True)

    missing = [job["path"] for job in jobs if job["path"] not in log["clips"]]
    if missing:
        print(f"audio-data.js not written: {len(missing)} clips have never been generated")
    else:
        write_data(config, jobs, log)
        print("Wrote audio-data.js")
    if failures:
        raise SystemExit(f"{len(failures)} clips failed")


if __name__ == "__main__":
    main()
