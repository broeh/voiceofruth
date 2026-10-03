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
