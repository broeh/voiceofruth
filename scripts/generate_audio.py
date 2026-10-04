#!/usr/bin/env python3
"""Generate the wheel scenes, use cases and voice samples with ElevenLabs Eleven v4.

Reads scripts/content.json, calls the Text to Speech API for every clip whose
prompt or settings changed since the last run, and rewrites audio-data.js.
Needs ELEVEN_API_KEY in the environment and FFprobe installed.

    python scripts/generate_audio.py --dry-run
    python scripts/generate_audio.py
    python scripts/generate_audio.py --only singing,opera --force
    python scripts/generate_audio.py --variants en-gb,en-scot
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
CONFIG = ROOT / "scripts" / "content.json"
LOG = ROOT / "docs" / "audio-generation.json"
DATA = ROOT / "audio-data.js"
TAG = re.compile(r"\[[^\]]*\]")


def spoken_text(prompt):
    text = re.sub(r"\s+", " ", TAG.sub(" ", prompt)).strip()
    return re.sub(r"\s+([.,!?…])", r"\1", text)


# A variant either puts its accent tag in front of the text, or merges it into the first tag
# ("[warmly]" becomes "[warmly, strong Scottish accent]"), which v4 follows more reliably.
def make_prompt(config, variant, text):
    spec = config["variants"][variant]
    if spec.get("merge"):
        return re.sub(r"^\[([^\]]*)\]", lambda match: f"[{match.group(1)}, {spec['merge']}]", text, count=1)
    return f"{spec['prefix']} {text}" if spec["prefix"] else text


# A variant is an audio version: en (American), en-gb, en-scot or nl. Emotions and extras get
# every variant; use cases only the usecase_variants.
def build_jobs(config):
    jobs = []
    variants = config["variants"]

    def add(item_id, variant, voice, path, texts):
        jobs.append({
            "id": item_id, "variant": variant, "language": variants[variant]["language"],
            "voice_id": config["voices"][voice]["id"], "path": path,
            "voice_settings": {**config["voice_settings"], **variants[variant].get("voice_settings", {})},
            "prompt": make_prompt(config, variant, texts[variants[variant]["language"]]),
        })

    for emotion in config["emotions"]:
        for variant in variants:
            add(emotion["id"], variant, config["wheel_voice"], f"audio/{variant}/scene/{emotion['id']}.mp3", emotion["scene"])
    for case in config["usecases"]:
        for variant in config["usecase_variants"]:
            add(case["id"], variant, case["voice"], f"audio/{variant}/usecases/{case['id']}.mp3", case["script"])
    for extra in config["extras"]:
        for variant in variants:
            add(extra["id"], variant, extra["voice"], extra["file"].replace("{lang}", variant), extra["text"])
    for job in jobs:
        settings = [config["model_id"], config["output_format"], job["voice_settings"], job["voice_id"], job["prompt"]]
        job["hash"] = hashlib.sha256(json.dumps(settings, sort_keys=True).encode()).hexdigest()[:16]
    return jobs


def synthesize(api_key, config, job):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{job['voice_id']}?output_format={config['output_format']}"
    body = json.dumps({
        "text": job["prompt"], "model_id": config["model_id"], "voice_settings": job["voice_settings"],
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

    def item(entry, folder, variants, extra=None):
        return {"id": entry["id"], "category": entry["category"], "en": entry["en"], "nl": entry["nl"], **(extra or {}),
                "takes": {variant: take(f"audio/{variant}/{folder}/{entry['id']}.mp3") for variant in variants}}

    data = {
        "voices": config["voices"],
        "categories": config["categories"],
        "emotions": [item(emotion, "scene", config["variants"]) for emotion in config["emotions"]],
        "usecaseCategories": config["usecase_categories"],
        "usecases": [item(case, "usecases", config["usecase_variants"], {"voice": case["voice"]}) for case in config["usecases"]],
        "extras": {extra["id"]: {variant: take(extra["file"].replace("{lang}", variant)) for variant in config["variants"]}
                   for extra in config["extras"]},
    }
    DATA.write_text("window.RUTH_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="comma-separated emotion, use case or extra ids")
    parser.add_argument("--variants", help="comma-separated variants, e.g. en-gb,en-scot")
    parser.add_argument("--force", action="store_true", help="regenerate even when unchanged")
    parser.add_argument("--dry-run", action="store_true", help="list pending clips and their character count")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    config = json.loads(CONFIG.read_text())
    jobs = build_jobs(config)
    log = json.loads(LOG.read_text()) if LOG.exists() else {"clips": {}}
    only = set(args.only.split(",")) if args.only else None
    chosen = set(args.variants.split(",")) if args.variants else None
    pending = [
        job for job in jobs
        if (only is None or job["id"] in only) and (chosen is None or job["variant"] in chosen) and (
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
            "voice_settings": job["voice_settings"], "hash": job["hash"], "character_cost": cost,
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
