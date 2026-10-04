# Voice of Ruth

A static showcase for Ruth's ElevenLabs voices. The centrepiece, directly under the headline, is an endless half-circle emotion wheel with 71 emotions, each performed as a short scene in American, British and Scottish English and in Dutch. A second wheel plays 43 real-world use cases (ads, YouTube formats, audiobooks, phone menus, meditation and more) in American English and Dutch. The site also has three voice cards with samples and direct ElevenLabs links, and a section about ElevenLabs, Eleven v4 and Ruth. All 386 clips were generated with Eleven v4.

## Preview

Serve the folder locally:

```sh
python -m http.server 8000
```

Visit `http://localhost:8000`. No build step, dependencies, backend or API key is needed to use the site. Opening `index.html` directly also plays everything, but the web fonts and audio-reactive visuals only load over HTTP.

## Site features

- **Hero row.** "Hear Ruth say hello", "Try Ruth on ElevenLabs" (Voice Library link) and the accent buttons American | British | Scottish | Nederlands, on one line on desktop.
- **Languages and accents.** The interface is English or Dutch. The three English buttons keep the English interface and switch the emotion wheel, intro and voice samples to that accent. The use-case wheel stays American in English, with a small note when British or Scottish is chosen. The header EN/NL switch changes the interface language. Default order: `?lang=` in the URL (`en`, `en-gb`, `en-scot` or `nl`), then the saved choice, then Dutch for visitors whose device time zone is `Europe/Amsterdam`, otherwise English (American). The time zone is a privacy-friendly stand-in for location: no IP lookup or third-party request is made.
- **Emotion wheel.** Sits directly under the full-width headline and intro, with the selected-emotion card and category chips beside it on desktop and below it on phones. The half circle opens to the right and the selected emotion sits horizontal at 3 o'clock, so every label reads left to right. It defaults to English. Turn it by dragging or swiping up and down, with the arrow keys, with the up/down buttons in the hub, by clicking a label, or with the scroll wheel after clicking the dial. The scroll wheel does not trap page scrolling until the dial is engaged. On phones a swipe on the labels turns the wheel and a swipe on the hub scrolls the page. Category chips jump to a group; "Surprise me" picks a random emotion. The card shows the selected emotion, what Ruth says and the exact prompt with its audio tags. The 50,000+ stats sit below the wheel.
- **Use-case wheel.** Inside the Eleven v4 section, above "A real voice, not a synthetic one". Same controls as the emotion wheel. The card shows the use case, a link to the Ruth voice that performs it, and the full script with its audio tags. Most use cases use the Warm and Dynamic Narrator; the bedtime story, fairy tale and cartoon use the Children's Storyteller, and meditation, sleep story and ASMR use the Meditation Guide.
- **Voices.** Cards for the three shared voices, each with a v4 sample in the current language and a link to the ElevenLabs Voice Library:
  - Warm and Dynamic Narrator: https://elevenlabs.io/app/voice-library?voiceId=YUdpWWny7k5yb4QCeweX
  - Friendly Children's Storyteller: https://elevenlabs.io/app/voice-library?voiceId=yO6w2xlECAQRFP6pX7Hw
  - Soothing Meditation Guide & ASMR: https://elevenlabs.io/app/voice-library?voiceId=ZPrQ2I47gewiFOmXksok
- One `<audio>` element plays everything, so clips never overlap. Fonts are self-hosted in `fonts/`. `og-image.jpg` is the social share image.

Files: `index.html` (markup, English defaults), `i18n.js` (all English and Dutch interface text), `main.js` (language and accent, the `Wheel` class used by both wheels, playback, visuals), `styles.css`, and the generated `audio-data.js`.

The "50,000+ creators" figure and the per-voice counts come from `cloned_by_count` in the ElevenLabs shared-voices API on 2026-10-04 and are hard-coded in `i18n.js`. Eleven v4 facts (release date, #1 on Artificial Analysis, about 75% blind-test preference) come from the ElevenLabs Eleven v4 announcement.

## Audio

`scripts/content.json` is the source of truth: the audio variants, voices, emotion and use-case categories and labels in both languages, every script with its audio tags, the voice samples and the hero intro. All clips use `eleven_v4`, stability 0.4 and similarity 0.8 unless a variant overrides it. The emotion wheel uses Ruth - Warm and Dynamic Narrator (`YUdpWWny7k5yb4QCeweX`).

Variants (audio versions):

| Variant | Folder | How the accent is asked for |
| --- | --- | --- |
| American | `en` | `[american accent]` before the text |
| British | `en-gb` | `[british accent]` before the text |
| Scottish | `en-scot` | merged into the first tag, e.g. `[warmly, strong Scottish accent]`, with similarity 0.5 |
| Dutch | `nl` | no accent tag |

A plain `[scottish accent]` tag barely changed Ruth's voice: an accent classifier rated only 5 of 75 clips as Scottish. Merging a stronger tag into the emotion tag and lowering similarity to 0.5 worked best in a test, and a speaker-verification model showed no loss of resemblance to Ruth. Even so, the Scottish accent stays the weakest of the three.

Clips live in `audio/<variant>/scene/<emotion>.mp3`, `audio/<variant>/usecases/<use case>.mp3`, `audio/voices/` and `audio/intro/`, as delivered by the API (`mp3_44100_128`, mono, unprocessed).

To add or change an emotion or use case, edit `scripts/content.json` and run:

```sh
python scripts/generate_audio.py --dry-run   # list clips that will be generated
python scripts/generate_audio.py             # generate changed clips, rewrite audio-data.js
python scripts/generate_audio.py --only singing --force   # retake one emotion
python scripts/generate_audio.py --variants en-scot --force   # retake one variant
```

It needs `ELEVEN_API_KEY` in the environment and FFprobe. Only clips whose prompt or settings changed are regenerated. Each call is charged; `docs/audio-generation.json` logs the prompt, settings, `character-cost`, request ID, checksum and duration of every clip. Generating the first 292 clips, plus one retake of the four "with a cold" clips, cost 2,480 credits on 2026-10-04. That set included 142 same-line clips, which were removed the same day; they are in the Git history. The British, Scottish and use-case clips added on 2026-10-05 cost about 12,000 credits, including accent tests and extra takes.

Some British and Scottish clips were picked from several takes: extra takes were generated with the same prompt, and the one the accent classifier rated most British or Scottish was kept, as a producer would do in the ElevenLabs app. `docs/audio-generation.json` marks these with `selected_from_takes`.

## Verification

`scripts/verify_audio.py` transcribes every clip with faster-whisper (`small`, CPU) in its own language and compares it with the script after removing tags. It flags similarity below 0.8 and tag words read aloud. Results are in `docs/audio-verification.json`. It checks the words, not the emotional delivery, so listening remains the final check.

```sh
pip install faster-whisper numpy
python scripts/verify_audio.py [--only id,id] [--variants en-scot]
```

`scripts/check_accents.py` classifies the accent of every English emotion clip, intro and voice sample with SpeechBrain's CommonAccent model and writes `docs/audio-accents.json`. As a reference check, it rated 5 of 8 ElevenLabs Scottish library voices, 5 of 6 British and 5 of 6 American voices as their own accent. Results on 2026-10-05, 75 clips per variant:

| Variant | Top label |
| --- | --- |
| American | 73 North American (55 US, 18 Canada), 2 England |
| British | 67 England, 1 Ireland, 7 other |
| Scottish | 30 Scotland, 11 England, 2 Ireland, 31 North American, 1 other |

```sh
pip install torch speechbrain numpy
python scripts/check_accents.py
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
