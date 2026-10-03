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
