# Development log

## 2026-10-03: Emotion-wheel MVP

- Created a static English-first showcase with twelve emotion segments and English/Dutch and same-line/scene controls.
- Split four original ElevenLabs batches into 48 MP3 clips using their eleven long separator gaps. Kept the source recordings unchanged and excluded them from Git.
- Added a reproducible FFmpeg preparation script, source-to-clip timestamps, checksums, and independent speech-recognition verification for every clip.
- Used one player to prevent overlapping takes. Added keyboard navigation, accessible button states, playback feedback, and a responsive layout.
- Verified all 48 local clips in Chromium; checked both languages at six screen widths and inspected desktop/mobile screenshots.
- Created the public repository https://github.com/broeh/voiceofruth and pushed the MVP to `main`.
- Enabled GitHub Pages from the repository root. The deployment succeeded at https://broeh.github.io/voiceofruth/ with HTTPS enforced.
- Repeated the full 48-clip playback and responsive browser checks against the published site. All passed, with no JavaScript errors or failed resource responses.
- GoDaddy currently points the apex at WebsiteBuilder and `www` at the apex. Replacing those two website record groups requires confirmation under Hans's instructions. Other DNS records will be preserved.

## 2026-10-04: Custom-domain connection

- Hans confirmed the domain connection.
- Registered `voiceofruth.com` in GitHub Pages before changing DNS and pulled GitHub's generated `CNAME` commit.
- Saved a fresh private backup of all GoDaddy records. Replaced only the apex `A` group and `www` CNAME with GitHub Pages targets, using TTL 600. Verified the remaining records were unchanged.
- A Google Public DNS query returned all four new apex addresses and `www` pointing at `broeh.github.io`. Some resolver caches still retained the previous parked-site addresses.
- Refreshed GitHub's certificate request after its initial check retained the parked-site DNS result. The certificate was approved for both `voiceofruth.com` and `www.voiceofruth.com`.
- Enabled HTTPS enforcement and verified `www` and HTTP redirect to `https://voiceofruth.com/`.
- Verified the HTTPS domain serves the exact local `index.html`, including through the machine's normal resolver. Repeated all 48 playback and responsive browser checks over HTTPS; all passed without JavaScript errors or failed responses.

## 2026-10-04: Bilingual redesign and 71-emotion wheel

- Researched Eleven v4 (released 2026-09-28) through the ElevenLabs announcement, v4 emotion blog and best-practices docs. Picked emotions v4 can direct with audio tags: emotions, reactions (laughs, sighs, gasps, crying), delivery (whispering, shouting, fast) and experimental tags (sings, operatic singing, eating while talking, hiccups).
- Grew the wheel from 12 to 71 emotions in ten colour-coded groups. `scripts/emotions.json` is now the single source for labels, scripts and tags.
- Added `scripts/generate_audio.py`: Eleven v4 (`eleven_v4`), Ruth - Warm and Dynamic Narrator, stability 0.4, similarity 0.8, `[american accent]` before every English prompt. It regenerates only changed clips and logs cost, request ID and checksum per clip in `docs/audio-generation.json`.
- Generated all 292 clips individually, including new takes of the original 12 emotions: 71 emotions × 2 languages × 2 modes, three voice samples × 2 languages and a hero intro × 2. Cost: 2,480 credits, including one retake.
- Replaced the batch-cutting pipeline. Removed `scripts/prepare_audio.py`, `recording-scripts/` and `docs/audio-cuts.json`; they described the old cuts and the script would have overwritten the new clips. The old clips remain in Git history.
- Verified all clips with faster-whisper `small` (`scripts/verify_audio.py`, report in `docs/audio-verification.json`). 291 of 292 scored at least 0.8 similarity, and no tag was read aloud. The only flag, `audio/intro/nl.mp3`, was a recogniser stop at a pause: transcribing the tail separately returned the missing sentence verbatim. The first English "with a cold" take repeated its last sentence and was regenerated.
- Rebuilt the site: dark cinematic design, self-hosted Fraunces and Manrope, an endless half-circle dial, audio-reactive hub and hero orb via Web Audio, a hero intro, stats, voice cards with samples and ElevenLabs links, and an Eleven v4 / Why Ruth section with usage steps. Added a social share image.
- Full English/Dutch interface in `i18n.js`. Default language: `?lang` parameter, then the saved switch, then Dutch for the `Europe/Amsterdam` time zone, otherwise English. Chose the time zone over IP geolocation to avoid a third-party request and the extra privacy notice it would need.
- Wheel defaults to English and "Performance scene". The scroll wheel only turns the dial after the visitor clicks it, so page scrolling is never trapped.
- Browser checks in Chromium against a local server: 25 of 25 functional checks passed. They covered time-zone language detection (Amsterdam to Dutch; New York and Brussels to English), the URL override, saved language, default mode, label click, keyboard, drag, scroll engagement, chips, mode and language switching, voice samples, intro, shuffle, all 292 audio URLs and no console errors. Inspected screenshots at 1440 and 390 pixels in both languages with no horizontal overflow.

## 2026-10-04: Rotated wheel as the opening screen, scene only

- Hans asked for the selected emotion to sit horizontal on the right, the wheel to be more prominent, and the one-sentence audio to go.
- Rotated the half circle 90 degrees: it opens to the right, the selected emotion sits at 3 o'clock, and every label reads left to right. The label-flip animation is gone because it is no longer needed. Dragging now follows the pointer's angle around the centre, so vertical drags and swipes turn it. The hub on the left holds up, play and down buttons with the audio bars.
- Made the wheel the opening screen. The headline, intro button, selected-emotion card and category chips sit beside it on desktop and below it on phones, and the hero orb is gone. Moved the 50,000+ stats below the wheel. Desktop sizes the wheel to the window height, so the whole wheel is visible at 1366×768, 1440×900 and 1920×1080.
- On phones the labels block page scrolling so a swipe turns the wheel, and the hub still scrolls the page. Touch devices get their own hint text.
- Removed the "same line" mode: the toggle, the 142 same-line clips, the same-line scripts in `scripts/emotions.json`, and their entries in the generation log and verification report. The data shape is now `takes[language]`. No audio was regenerated; the remaining 150 clips keep their verified hashes.
- Browser checks against a local server: 29 of 29 passed. New checks cover the horizontal selected label, the removed toggle, vertical drag, and real touch swipes on a 390 px phone viewport (the ring turns, the hub scrolls). All 150 audio URLs load with no console errors. Screenshots were inspected at 390, 1366, 1440 and 1920 px.
