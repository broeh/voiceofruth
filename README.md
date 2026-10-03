# Voice of Ruth

A static voice showcase with twelve emotions, English and Dutch, and two performance modes. The wheel plays 48 individual recordings through one audio player.

## Preview

Open `index.html`, or serve the folder locally:

```sh
python -m http.server 8000
```

Visit `http://localhost:8000`. No build step, dependencies, backend, or ElevenLabs API key is needed to use the site. It loads only the selected recording.

## Hosting

- Repository: https://github.com/broeh/voiceofruth
- GitHub Pages preview: https://broeh.github.io/voiceofruth/
- Intended public domain: https://voiceofruth.com/
- GitHub Pages source: `main`, repository root, branch publishing.
- Domain connection is pending confirmation before replacing the existing GoDaddy website records.

Pushing a commit to `main` publishes the site through GitHub Pages.

## Recordings

The four original MP3 batches stay untouched in the ignored `recordings/` folder. Each batch contains twelve performances in this order:

Warm, excited, curious, playful, confident, amazed, tender, sad, frustrated, urgent, whisper, calm.

| Source recording timestamp | Language | Mode |
| --- | --- | --- |
| 21:24:43 | English | Same line |
| 21:26:37 | English | Performance scene |
| 21:28:00 | Dutch | Same line |
| 21:28:40 | Dutch | Performance scene |

The published clips are in `audio/{en,nl}/{same-line,scene}/`. `audio-data.js` connects each clip to its emotion and script.

`scripts/prepare_audio.py` identifies the eleven long separator gaps in each batch, retains a short lead-in and tail, and applies tiny fades to avoid clicks. It preserves the performance's original level differences. To regenerate the clips with Python 3 and FFmpeg installed:

```sh
python scripts/prepare_audio.py
```

`docs/audio-cuts.json` records every source timestamp and published clip checksum. `docs/audio-verification.json` records independent speech-recognition checks of all 48 cuts with faster-whisper's base model. The minimum normalized text similarity was 93.1%; recognizer spelling differences remain in the audit. This verifies content and ordering, not subjective delivery quality.

## Verification

Browser checks loaded and played all 48 combinations, checked the transcript and selected state, keyboard navigation, play/pause, and no autoplay on initial load. Responsive checks covered 360, 375, 390, 768, 1024, and 1440 pixels in both languages with no page overflow or overlapping emotion buttons. Desktop and mobile screenshots were inspected.

The original full recordings, local prompts, credentials, and DNS backups are excluded from Git.
