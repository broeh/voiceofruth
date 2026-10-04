#!/usr/bin/env python3
"""Classify the English accent of every English wheel clip, intro and voice sample.

Uses SpeechBrain's CommonAccent ECAPA model (16 English accents) as an objective check
that American, British and Scottish clips sound the part. Writes docs/audio-accents.json.
Needs torch, speechbrain and numpy (pip install torch speechbrain numpy).

    python scripts/check_accents.py
"""

import collections
import json
import subprocess

import numpy as np
import torch
from speechbrain.inference.classifiers import EncoderClassifier

from generate_audio import CONFIG, ROOT, build_jobs

REPORT = ROOT / "docs" / "audio-accents.json"
MODEL = "Jzuluaga/accent-id-commonaccent_ecapa"
TARGET = {"en": "us", "en-gb": "england", "en-scot": "scotland"}


def load_audio(path):
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    return torch.from_numpy(np.frombuffer(pcm, np.int16).astype(np.float32) / 32768).unsqueeze(0)


def main():
    model = EncoderClassifier.from_hparams(source=MODEL, savedir=str(ROOT / ".cache" / "accent-model"))
    labels = model.hparams.label_encoder.lab2ind
    jobs = [job for job in build_jobs(json.loads(CONFIG.read_text())) if job["variant"] in TARGET and "/usecases/" not in job["path"]]
    summary, clips = {}, []
    for variant, target in TARGET.items():
        tops = collections.Counter()
        for job in (job for job in jobs if job["variant"] == variant):
            probabilities, _, _, label = model.classify_batch(load_audio(ROOT / job["path"]))
            tops[label[0]] += 1
            clips.append({"clip": job["path"], "top": label[0], target: round(float(probabilities[0][labels[target]]), 3)})
        summary[variant] = {"target": target, "clips": sum(tops.values()), "on_target": tops[target], "top_labels": dict(tops.most_common())}
        print(variant, summary[variant], flush=True)
    REPORT.write_text(json.dumps({
        "method": f"SpeechBrain {MODEL}, top label per clip among 16 English accents. Reference check on ElevenLabs "
                  "library voice previews: 5 of 8 Scottish voices, 5 of 6 British and 5 of 6 American voices were "
                  "classified as their own accent. Treat this as a rough, objective indication, not a listening test.",
        "summary": summary, "clips": clips,
    }, indent=1) + "\n")


if __name__ == "__main__":
    main()
