# Voice of Ruth

A static showcase for Ruth's ElevenLabs voices. The centrepiece, directly under the headline, is an endless half-circle emotion wheel with 71 emotions, each performed as a short scene in English and Dutch. The site also has three voice cards with samples and direct ElevenLabs links, and a section about ElevenLabs, Eleven v4 and Ruth. All 150 clips were generated with Eleven v4.

## Preview

Serve the folder locally:

```sh
python -m http.server 8000
```

Visit `http://localhost:8000`. No build step, dependencies, backend or API key is needed to use the site. Opening `index.html` directly also plays everything, but the web fonts and audio-reactive visuals only load over HTTP.

## Site features

- **Languages.** English and Dutch. The whole page and the wheel audio follow the chosen language. Default order: `?lang=en` or `?lang=nl` in the URL, then a saved choice from the language switch, then Dutch for visitors whose device time zone is `Europe/Amsterdam`, otherwise English. The time zone is a privacy-friendly stand-in for location: no IP lookup or third-party request is made.
- **Emotion wheel.** Sits directly under the full-width headline and intro, with the selected-emotion card and category chips beside it on desktop and below it on phones. The half circle opens to the right and the selected emotion sits horizontal at 3 o'clock, so every label reads left to right. It defaults to English. Turn it by dragging or swiping up and down, with the arrow keys, with the up/down buttons in the hub, by clicking a label, or with the scroll wheel after clicking the dial. The scroll wheel does not trap page scrolling until the dial is engaged. On phones a swipe on the labels turns the wheel and a swipe on the hub scrolls the page. Category chips jump to a group; "Surprise me" picks a random emotion. The card shows the selected emotion, what Ruth says and the exact prompt with its audio tags. The 50,000+ stats sit below the wheel.
- **Voices.** Cards for the three shared voices, each with a v4 sample in the current language and a link to the ElevenLabs Voice Library:
  - Warm and Dynamic Narrator: https://elevenlabs.io/app/voice-library?voiceId=YUdpWWny7k5yb4QCeweX
  - Friendly Children's Storyteller: https://elevenlabs.io/app/voice-library?voiceId=yO6w2xlECAQRFP6pX7Hw
  - Soothing Meditation Guide & ASMR: https://elevenlabs.io/app/voice-library?voiceId=ZPrQ2I47gewiFOmXksok
- One `<audio>` element plays everything, so clips never overlap. Fonts are self-hosted in `fonts/`. `og-image.jpg` is the social share image.

Files: `index.html` (markup, English defaults), `i18n.js` (all English and Dutch interface text), `main.js` (language, dial, playback, visuals), `styles.css`, and the generated `audio-data.js`.

The "50,000+ creators" figure and the per-voice counts come from `cloned_by_count` in the ElevenLabs shared-voices API on 2026-10-04 and are hard-coded in `i18n.js`. Eleven v4 facts (release date, #1 on Artificial Analysis, about 75% blind-test preference) come from the ElevenLabs Eleven v4 announcement.

## Audio

`scripts/emotions.json` is the source of truth: categories, emotion labels in both languages, the scene scripts with their audio tags, the voice samples and the hero intro. The wheel uses Ruth - Warm and Dynamic Narrator (`YUdpWWny7k5yb4QCeweX`) with `eleven_v4`, stability 0.4 and similarity 0.8. Every English prompt starts with `[american accent]`.

Clips live in `audio/{en,nl}/scene/<emotion>.mp3`, `audio/voices/` and `audio/intro/`, as delivered by the API (`mp3_44100_128`, mono, unprocessed).

To add or change an emotion, edit `scripts/emotions.json` and run:

```sh
python scripts/generate_audio.py --dry-run   # list clips that will be generated
python scripts/generate_audio.py             # generate changed clips, rewrite audio-data.js
python scripts/generate_audio.py --only singing --force   # retake one emotion
```

It needs `ELEVEN_API_KEY` in the environment and FFprobe. Only clips whose prompt or settings changed are regenerated. Each call is charged; `docs/audio-generation.json` logs the prompt, settings, `character-cost`, request ID, checksum and duration of every clip. Generating the first 292 clips, plus one retake of the four "with a cold" clips, cost 2,480 credits on 2026-10-04. That set included 142 same-line clips, which were removed the same day; they are in the Git history.

## Verification

`scripts/verify_audio.py` transcribes every clip with faster-whisper (`small`, CPU) in its own language and compares it with the script after removing tags. It flags similarity below 0.8 and tag words read aloud. Results are in `docs/audio-verification.json`. It checks the words, not the emotional delivery, so listening remains the final check.

```sh
pip install faster-whisper numpy
python scripts/verify_audio.py [--only id,id]
```

## Hosting

- Repository: https://github.com/broeh/voiceofruth
- GitHub Pages address: https://broeh.github.io/voiceofruth/ redirects to the custom domain.
- Public domain: https://voiceofruth.com/
- GitHub Pages source: `main`, repository root, branch publishing.
- Custom domain: `voiceofruth.com`, also recorded in the root `CNAME` file.
- GoDaddy apex `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- GoDaddy `www` CNAME: `broeh.github.io`. Website record TTL: 600 seconds.
- Other DNS records were preserved. Pre-change backups remain in the ignored `dns-backups/` folder.
- HTTPS is enforced with a valid certificate for both the apex and `www`; HTTP and `www` redirect to `https://voiceofruth.com/`.

Pushing a commit to `main` publishes the site through GitHub Pages.

DNS values follow [GitHub's custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

The first MVP's batch recordings stay untouched in the ignored `recordings/` folder. Its 48 cut clips and cutting script are in the Git history before this redesign. Local prompts, credentials and DNS backups are excluded from Git.
