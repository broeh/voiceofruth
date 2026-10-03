'use strict';

const emotions = [
  { id: 'warm', en: 'Warm', nl: 'Warm', color: '#ead5df' },
  { id: 'excited', en: 'Excited', nl: 'Enthousiast', color: '#f4dbcc' },
  { id: 'curious', en: 'Curious', nl: 'Nieuwsgierig', color: '#efdfba' },
  { id: 'playful', en: 'Playful', nl: 'Speels', color: '#e6e6c7' },
  { id: 'confident', en: 'Confident', nl: 'Zelfverzekerd', color: '#d4e4d7' },
  { id: 'amazed', en: 'Amazed', nl: 'Verwonderd', color: '#cce1df' },
  { id: 'tender', en: 'Tender', nl: 'Teder', color: '#cfdce7' },
  { id: 'sad', en: 'Sad', nl: 'Verdrietig', color: '#d5d4e7' },
  { id: 'frustrated', en: 'Frustrated', nl: 'Gefrustreerd', color: '#e2d1e3' },
  { id: 'urgent', en: 'Urgent', nl: 'Dringend', color: '#ead1d6' },
  { id: 'whisper', en: 'Whisper', nl: 'Fluisterend', color: '#edd5ce' },
  { id: 'calm', en: 'Calm', nl: 'Rustig', color: '#e8decf' },
];

const player = document.getElementById('player');
const status = document.getElementById('player-status');
const wheel = document.getElementById('emotion-wheel');
const sectors = document.getElementById('wheel-sectors');
const playButton = document.getElementById('center-play');
let language = 'en';
let mode = 'same-line';
let emotionIndex = 0;
let hasListened = false;
let selectionVersion = 0;

function point(radius, degrees) {
  const angle = degrees * Math.PI / 180;
  return [300 + radius * Math.cos(angle), 300 + radius * Math.sin(angle)];
}

emotions.forEach((emotion, index) => {
  const start = -105 + index * 30 + 0.9;
  const end = start + 28.2;
  const a = point(287, start);
  const b = point(287, end);
  const c = point(147, end);
  const d = point(147, start);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${a} A287,287 0 0 1 ${b} L${c} A147,147 0 0 0 ${d} Z`);
  path.style.setProperty('--segment', emotion.color);
  path.classList.add('wheel-segment');
  path.dataset.emotion = emotion.id;
  path.addEventListener('click', () => { emotionIndex = index; selectTake(true); });
  sectors.appendChild(path);

  const button = document.createElement('button');
  const position = point(221, -90 + index * 30);
  button.type = 'button';
  button.className = 'emotion-button';
  button.dataset.emotion = emotion.id;
  button.style.left = `${position[0] / 6}%`;
  button.style.top = `${position[1] / 6}%`;
  button.textContent = emotion.en;
  button.addEventListener('mouseenter', () => path.classList.add('hovered'));
  button.addEventListener('mouseleave', () => path.classList.remove('hovered'));
  button.addEventListener('click', () => { emotionIndex = index; selectTake(true); });
  button.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % emotions.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + emotions.length - 1) % emotions.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = emotions.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      wheel.querySelectorAll('.emotion-button')[next].focus();
    }
  });
  wheel.appendChild(button);
});

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

async function playTake() {
  const version = selectionVersion;
  try {
    await player.play();
  } catch (error) {
    if (version !== selectionVersion || error.name === 'AbortError') return;
    setStatus(language === 'nl' ? 'Druk op afspelen om deze opname te horen.' : 'Press play to hear this recording.');
  }
}

function selectTake(autoplay = false) {
  selectionVersion += 1;
  player.pause();
  const emotion = emotions[emotionIndex];
  const take = window.RUTH_AUDIO[language][mode][emotion.id];
  wheel.lang = language;
  player.src = take.file;
  player.load();
  player.setAttribute('aria-label', `${emotion[language]}, ${language === 'en' ? 'English' : 'Nederlands'}, ${mode === 'same-line' ? 'same line' : 'scene'}`);
  document.getElementById('center-emotion').textContent = emotion[language];
  document.getElementById('take-emotion').textContent = emotion[language];
  document.getElementById('take-emotion').lang = language;
  document.getElementById('take-number').textContent = `${String(emotionIndex + 1).padStart(2, '0')} / 12`;
  document.getElementById('take-language').textContent = language === 'en' ? 'English' : 'Nederlands';
  const transcript = document.getElementById('take-script');
  transcript.textContent = take.text;
  transcript.lang = language;
  document.getElementById('mode-note').textContent = mode === 'same-line'
    ? (language === 'en' ? 'The same words, with a different feeling. Listen to what changes.' : 'Dezelfde woorden, met een ander gevoel. Luister naar het verschil.')
    : (language === 'en' ? 'A little scene, performed with feeling.' : 'Een kleine scène, verteld met gevoel.');
  wheel.querySelectorAll('.emotion-button').forEach((button, index) => {
    const selected = index === emotionIndex;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${language === 'en' ? 'Listen to' : 'Luister naar'} ${emotions[index][language]}`);
    button.textContent = emotions[index][language];
  });
  sectors.querySelectorAll('path').forEach((path, index) => path.classList.toggle('selected', index === emotionIndex));
  document.querySelectorAll('[data-language]').forEach(button => {
    const selected = button.dataset.language === language;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-mode]').forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  setStatus(language === 'en' ? 'Press play, or choose a feeling.' : 'Druk op afspelen, of kies een gevoel.');
  updatePlayButton();
  if (autoplay) playTake();
}

function updatePlayButton() {
  const playing = !player.paused && !player.ended;
  const name = emotions[emotionIndex][language];
  document.getElementById('play-icon').setAttribute('d', playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z');
  playButton.setAttribute('aria-label', `${playing ? (language === 'en' ? 'Pause' : 'Pauzeer') : (language === 'en' ? 'Play' : 'Speel')} ${name}`);
}

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
  language = button.dataset.language;
  selectTake(hasListened);
}));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  selectTake(hasListened);
}));
playButton.addEventListener('click', () => {
  if (player.paused || player.ended) playTake();
  else player.pause();
});
player.addEventListener('play', () => {
  hasListened = true;
  setStatus(language === 'en' ? 'Now playing.' : 'Wordt afgespeeld.');
  updatePlayButton();
});
player.addEventListener('pause', () => {
  updatePlayButton();
  if (player.paused && !player.ended) setStatus(language === 'en' ? 'Paused.' : 'Gepauzeerd.');
});
player.addEventListener('ended', () => {
  updatePlayButton();
  setStatus(language === 'en' ? 'Pick another feeling, or play it again.' : 'Kies een ander gevoel, of luister nog eens.');
});
player.addEventListener('error', () => setStatus(language === 'en' ? 'This recording couldn’t load. Please try again.' : 'Deze opname kon niet laden. Probeer het opnieuw.', true));
selectTake();
