'use strict';

const DATA = window.RUTH_DATA;
const TEXT = window.RUTH_I18N;
const emotions = DATA.emotions;
const count = emotions.length;
const categories = Object.fromEntries(DATA.categories.map(category => [category.id, category]));
const SVG_NS = 'http://www.w3.org/2000/svg';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = id => document.getElementById(id);
const player = $('player');
const dial = $('dial');
const ring = $('dial-ring');
const svg = $('dial-svg');
const hubCanvas = $('hub-canvas');
const pointer = dial.querySelector('.dial-pointer');

const state = {
  language: initialLanguage(),
  index: 0,
  position: 0,
  source: null,
  hasListened: false,
};

const mod = (value, size) => ((value % size) + size) % size;
const t = key => TEXT[state.language][key];

// Explicit choice first (?lang= or a saved switch), then visitors in the Netherlands get Dutch.
function initialLanguage() {
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'en' || requested === 'nl') return requested;
  try {
    const saved = localStorage.getItem('ruth-language');
    if (saved === 'en' || saved === 'nl') return saved;
  } catch (error) { /* storage blocked */ }
  return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Amsterdam' ? 'nl' : 'en';
}

/* ---------- Text ---------- */

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('metaDescription');
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(element => { element.innerHTML = t(element.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-attr]').forEach(element => {
    element.dataset.i18nAttr.split(';').forEach(pair => {
      const [attribute, key] = pair.split(':');
      element.setAttribute(attribute, t(key));
    });
  });
  document.querySelectorAll('[data-language]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.language === state.language));
  });
  document.querySelectorAll('[data-sample-text]').forEach(element => {
    element.textContent = DATA.extras[element.dataset.sampleText][state.language].text;
    element.lang = state.language;
  });
  renderCategories();
  slots.forEach(slot => { slot.abs = null; });
  render();
  updateTake();
  updateButtons();
}

function escapeHTML(text) {
  return text.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/* ---------- Category chips ---------- */

function renderCategories() {
  $('categories').replaceChildren(...DATA.categories.map(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.dataset.category = category.id;
    button.style.setProperty('--chip', category.color);
    button.textContent = category[state.language];
    button.addEventListener('click', () => turnTo(emotions.findIndex(emotion => emotion.category === category.id), state.hasListened));
    return button;
  }));
}

/* ---------- The dial: an endless half circle, opening to the right ---------- */

const geo = {};
let slots = [];
let reach = 0;
let hovered = -1;

// Angles in degrees, 0 = 3 o'clock (the selected position), positive = clockwise.
function arcPath(inner, outer, from, to) {
  const point = (radius, degrees) => {
    const angle = degrees * Math.PI / 180;
    return `${(geo.cx + radius * Math.cos(angle)).toFixed(2)},${(geo.cy + radius * Math.sin(angle)).toFixed(2)}`;
  };
  return `M${point(outer, from)} A${outer},${outer} 0 0 1 ${point(outer, to)} L${point(inner, to)} A${inner},${inner} 0 0 0 ${point(inner, from)} Z`;
}

function layoutDial() {
  const desktop = window.innerWidth > 980;
  const outer = desktop
    ? Math.round(Math.max(280, Math.min(410, (window.innerHeight - 126) / 2 - 12, document.querySelector('.stage').clientWidth * 0.36)))
    : Math.round(Math.min(360, document.documentElement.clientWidth - 40));
  const inner = Math.round(outer * 0.5);
  const height = desktop ? 2 * (outer + 12) : Math.round(outer * 1.6);
  Object.assign(geo, {
    width: outer + 34, height, outer, inner, cx: 0, cy: height / 2,
    step: Math.min(8, Math.max(5, 24 / (inner + 14) * 180 / Math.PI)),
    labelStart: inner + 14,
    labelSize: outer < 330 ? 13 : 14,
  });
  dial.style.width = `${geo.width}px`;
  dial.style.height = `${height}px`;
  dial.style.setProperty('--hub', `${inner - 14}px`);
  pointer.style.left = `${outer + 14}px`;
  pointer.style.top = `${geo.cy - 8}px`;
  svg.setAttribute('viewBox', `0 0 ${geo.width} ${height}`);
  svg.setAttribute('width', geo.width);
  svg.setAttribute('height', height);

  reach = Math.ceil(95 / geo.step);
  const sector = arcPath(inner + 4, outer, -geo.step / 2 + 0.35, geo.step / 2 - 0.35);
  const rim = arcPath(outer + 4, outer + 9, -geo.step / 2, geo.step / 2);
  svg.replaceChildren();
  slots = Array.from({ length: reach * 2 + 1 }, () => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'slot');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'sector');
    path.setAttribute('d', sector);
    const band = document.createElementNS(SVG_NS, 'path');
    band.setAttribute('class', 'rim');
    band.setAttribute('d', rim);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', geo.cx + geo.labelStart);
    text.setAttribute('y', geo.cy);
    text.style.fontSize = `${geo.labelSize}px`;
    group.append(path, band, text);
    svg.appendChild(group);
    return { group, text, abs: null };
  });
  hovered = -1;
  render();
  sizeCanvas(hubCanvas);
  drawFrame(performance.now());
}

// Absolute position i shows emotion i mod count. Labels sit between -90 and +90 degrees,
// so they always read left to right.
function render() {
  if (!slots.length) return;
  const base = Math.round(state.position);
  for (let i = base - reach; i <= base + reach; i += 1) {
    const slot = slots[mod(i, slots.length)];
    if (slot.abs !== i) {
      const emotion = emotions[mod(i, count)];
      slot.abs = i;
      slot.group.style.setProperty('--c', categories[emotion.category].color);
      slot.text.textContent = emotion[state.language];
    }
    slot.group.setAttribute('transform', `rotate(${((i - state.position) * geo.step).toFixed(3)} ${geo.cx} ${geo.cy})`);
    slot.group.classList.toggle('current', i === base);
  }
  const current = mod(base, count);
  if (current !== hovered) {
    hovered = current;
    dial.style.setProperty('--h', categories[emotions[current].category].color);
  }
}

let animation = null;

function stopAnimation() {
  if (animation) cancelAnimationFrame(animation.frame);
  animation = null;
}

// Playback starts right away (inside the click or key handler, which mobile browsers require)
// while the wheel is still turning.
function animateTo(target, autoplay) {
  stopAnimation();
  if (autoplay) select(mod(target, count), true);
  const from = state.position;
  const duration = reducedMotion ? 0 : Math.min(950, 280 + Math.abs(target - from) * 40);
  const start = performance.now();
  animation = { target };
  const frame = now => {
    const progress = duration ? Math.min(1, (now - start) / duration) : 1;
    state.position = from + (target - from) * (1 - Math.pow(1 - progress, 3));
    render();
    if (progress < 1) {
      animation.frame = requestAnimationFrame(frame);
    } else {
      animation = null;
      select(mod(target, count), false);
    }
  };
  animation.frame = requestAnimationFrame(frame);
}

function turnBy(steps) {
  const from = animation ? animation.target : Math.round(state.position);
  animateTo(from + steps, state.hasListened);
}

function turnTo(index, autoplay) {
  const base = animation ? animation.target : Math.round(state.position);
  let delta = mod(index - base, count);
  if (delta > count / 2) delta -= count;
  animateTo(base + delta, autoplay);
}

let drag = null;
let engaged = false;
let wheelTimer = 0;

function pointerAngle(event) {
  const box = dial.getBoundingClientRect();
  const x = event.clientX - box.left - geo.cx;
  const y = event.clientY - box.top - geo.cy;
  return { angle: Math.atan2(y, x) * 180 / Math.PI, radius: Math.hypot(x, y) };
}

dial.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.hub')) return;
  engaged = true;
  stopAnimation();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, angle: pointerAngle(event).angle, start: state.position, moved: false, samples: [] };
});

dial.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) {
    drag.moved = true;
    dial.setPointerCapture(event.pointerId);
    dial.classList.add('dragging');
  }
  if (!drag.moved) return;
  const turned = mod(pointerAngle(event).angle - drag.angle + 180, 360) - 180;
  state.position = drag.start - turned / geo.step;
  drag.samples.push({ time: event.timeStamp, position: state.position });
  drag.samples = drag.samples.filter(sample => event.timeStamp - sample.time < 120);
  render();
});

function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const finished = drag;
  drag = null;
  dial.classList.remove('dragging');
  if (event.type === 'pointercancel') {
    animateTo(Math.round(state.position), false);
    return;
  }
  if (finished.moved) {
    const [first, last] = [finished.samples[0], finished.samples[finished.samples.length - 1]];
    const velocity = first && last && last.time > first.time ? (last.position - first.position) / (last.time - first.time) : 0;
    animateTo(Math.round(state.position + velocity * 260), state.hasListened);
    return;
  }
  const { angle, radius } = pointerAngle(event);
  if (radius < geo.inner || radius > geo.outer + 12) return;
  animateTo(Math.round(state.position + angle / geo.step), true);
}
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);
dial.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && !drag) engaged = false; });

// The wheel scrolls the page until the visitor engages the dial, so it never traps scrolling.
dial.addEventListener('wheel', event => {
  if (!engaged) return;
  event.preventDefault();
  stopAnimation();
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 600 : 1;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  state.position += delta * unit / 70;
  render();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => animateTo(Math.round(state.position), state.hasListened), 160);
}, { passive: false });

ring.addEventListener('focus', () => { engaged = true; });
ring.addEventListener('blur', () => { engaged = false; });
ring.addEventListener('keydown', event => {
  const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[event.key];
  if (steps) {
    event.preventDefault();
    turnBy(steps);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    turnTo(event.key === 'Home' ? 0 : count - 1, state.hasListened);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggle('wheel');
  }
});

$('prev-emotion').addEventListener('click', () => turnBy(-1));
$('next-emotion').addEventListener('click', () => turnBy(1));
$('shuffle').addEventListener('click', () => {
  let next = state.index;
  while (next === state.index) next = Math.floor(Math.random() * count);
  turnTo(next, true);
});

/* ---------- Selection and the take panel ---------- */

function wheelTake() {
  return emotions[state.index].takes[state.language];
}

function takeFor(source) {
  return source === 'wheel' ? wheelTake() : DATA.extras[source][state.language];
}

function select(index, autoplay) {
  const changed = index !== state.index;
  state.index = index;
  updateTake();
  if (changed && state.source === 'wheel') stop();
  if (autoplay && (changed || state.source !== 'wheel' || player.paused)) play('wheel');
}

function updateTake() {
  const emotion = emotions[state.index];
  const category = categories[emotion.category];
  const take = wheelTake();
  document.documentElement.style.setProperty('--c', category.color);
  $('take-category').textContent = category[state.language];
  const name = $('take-emotion');
  name.textContent = emotion[state.language];
  name.lang = state.language;
  $('take-number').textContent = `${String(state.index + 1).padStart(2, '0')} / ${count}`;
  const text = $('take-text');
  text.textContent = take.text;
  text.lang = state.language;
  $('take-prompt').innerHTML = escapeHTML(take.prompt).replace(/\[[^\]]*\]/g, tag => `<span class="tag">${tag}</span>`);
  ring.setAttribute('aria-valuenow', String(state.index + 1));
  ring.setAttribute('aria-valuetext', `${emotion[state.language]}, ${category[state.language]}`);
  document.querySelectorAll('.chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.category === emotion.category)));
  updateProgress();
  setStatus();
}

/* ---------- Playback ---------- */

let audioContext = null;
let analyser = null;
let bins = null;

// Route audio through an analyser for the visuals. Skipped on file:// where it would mute the audio.
function connectAnalyser() {
  if (audioContext) {
    if (audioContext.state === 'suspended') audioContext.resume();
    return;
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context || !/^https?:$/.test(location.protocol)) return;
  try {
    audioContext = new Context();
    const source = audioContext.createMediaElementSource(player);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    bins = new Uint8Array(analyser.frequencyBinCount);
  } catch (error) {
    analyser = null;
  }
}

function isLoaded(file) {
  return player.getAttribute('src') === file;
}

async function play(source) {
  const take = takeFor(source);
  connectAnalyser();
  if (state.source !== source || !isLoaded(take.file)) {
    player.src = take.file;
    state.source = source;
  }
  try {
    await player.play();
  } catch (error) {
    if (error.name !== 'AbortError' && source === 'wheel') setStatus('statusBlocked');
  }
}

function stop() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  state.source = null;
  updateButtons();
  updateProgress();
}

function toggle(source) {
  if (state.source === source && !player.paused && !player.ended) player.pause();
  else play(source);
}

function isPlaying(source) {
  return state.source === source && !player.paused && !player.ended;
}

function updateButtons() {
  document.querySelectorAll('[data-source]').forEach(button => {
    const playing = isPlaying(button.dataset.source);
    button.classList.toggle('is-playing', playing);
    button.setAttribute('aria-pressed', String(playing));
    const label = button.querySelector('[data-i18n="listen"]');
    if (label) label.textContent = t(playing ? 'pauseSample' : 'listen');
  });
  $('wheel-play').setAttribute('aria-label', `${t(isPlaying('wheel') ? 'pause' : 'play')}: ${emotions[state.index][state.language]}`);
}

function setStatus(key) {
  const status = $('player-status');
  const wheel = state.source === 'wheel';
  const name = key || (!wheel ? 'statusIdle' : player.ended ? 'statusEnded' : player.paused ? (player.currentTime > 0 ? 'statusPaused' : 'statusIdle') : 'statusPlaying');
  status.textContent = name === 'statusPlaying' ? `${t(name)}: ${emotions[state.index][state.language]}` : t(name);
  status.classList.toggle('error', name === 'statusError');
}

function updateProgress() {
  const wheel = state.source === 'wheel';
  const total = wheel && Number.isFinite(player.duration) ? player.duration : wheelTake().duration;
  const current = wheel ? player.currentTime : 0;
  const percent = total ? Math.min(100, current / total * 100) : 0;
  $('progress-fill').style.width = `${percent}%`;
  $('progress').setAttribute('aria-valuenow', String(Math.round(percent)));
  $('take-time').textContent = wheel && current > 0 ? `${formatTime(current)} / ${formatTime(total)}` : formatTime(total);
}

function seek(fraction) {
  const apply = () => { player.currentTime = Math.max(0, Math.min(1, fraction)) * player.duration; };
  if (state.source === 'wheel' && Number.isFinite(player.duration)) {
    apply();
  } else {
    play('wheel');
    player.addEventListener('loadedmetadata', apply, { once: true });
  }
  updateProgress();
}

$('progress').addEventListener('click', event => {
  const box = event.currentTarget.getBoundingClientRect();
  seek((event.clientX - box.left) / box.width);
});
$('progress').addEventListener('keydown', event => {
  const delta = { ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1 }[event.key];
  if (!delta || state.source !== 'wheel' || !Number.isFinite(player.duration)) return;
  event.preventDefault();
  seek(player.currentTime / player.duration + delta);
});

document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.source)));

player.addEventListener('play', () => {
  state.hasListened = true;
  if (audioContext && audioContext.state === 'suspended') audioContext.resume();
  updateButtons();
  setStatus();
  startLoop();
});
player.addEventListener('pause', () => { updateButtons(); setStatus(); });
player.addEventListener('ended', () => { updateButtons(); setStatus(); updateProgress(); });
player.addEventListener('timeupdate', updateProgress);
player.addEventListener('error', () => {
  if (!player.getAttribute('src')) return;
  updateButtons();
  if (state.source === 'wheel') setStatus('statusError');
});

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => {
  if (state.language === button.dataset.language) return;
  const source = state.source;
  const wasPlaying = source && !player.paused && !player.ended;
  state.language = button.dataset.language;
  try { localStorage.setItem('ruth-language', state.language); } catch (error) { /* storage blocked */ }
  if (source) stop();
  applyLanguage();
  if (wasPlaying) play(source);
}));

/* ---------- Visuals ---------- */

let loop = 0;

function sizeCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
}

function startLoop() {
  if (!loop) loop = requestAnimationFrame(drawFrame);
}

// Bar heights 0..1. Uses the analyser when available, otherwise a gentle stand-in while playing.
function levels(now, playing) {
  const values = new Array(32).fill(0);
  if (!playing) return values;
  if (analyser) {
    analyser.getByteFrequencyData(bins);
    for (let i = 0; i < values.length; i += 1) values[i] = bins[1 + Math.floor(i * 0.75)] / 255;
  } else {
    for (let i = 0; i < values.length; i += 1) values[i] = 0.35 + 0.3 * Math.sin(now / 160 + i * 0.7) * Math.sin(now / 410 + i * 0.23);
  }
  return values;
}

function drawHub(values, color) {
  const context = hubCanvas.getContext('2d');
  const { width, height } = hubCanvas;
  if (!width || !height) return;
  context.clearRect(0, 0, width, height);
  const cy = height / 2;
  const radius = width;
  const small = hubCanvas.clientWidth < 160;
  const bars = 56;
  context.lineCap = 'round';
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, width / 115);
  for (let i = 0; i < bars; i += 1) {
    const fromCenter = Math.abs(i - (bars - 1) / 2) / (bars / 2);
    const value = values[Math.min(values.length - 1, Math.floor(fromCenter * values.length * 0.85))];
    const angle = -Math.PI / 2 + (i + 0.5) / bars * Math.PI;
    const start = radius * (small ? 0.86 : 0.82);
    const length = radius * (0.012 + value * (small ? 0.12 : 0.16));
    context.globalAlpha = 0.25 + value * 0.75;
    context.beginPath();
    context.moveTo(Math.cos(angle) * start, cy + Math.sin(angle) * start);
    context.lineTo(Math.cos(angle) * (start + length), cy + Math.sin(angle) * (start + length));
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawFrame(now) {
  loop = 0;
  const animate = !player.paused && !player.ended && !reducedMotion;
  const values = levels(now, animate);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--c').trim() || '#f6c453';
  drawHub(values, color);
  if (animate) {
    updateProgress();
    startLoop();
  }
}

/* ---------- Start ---------- */

if (matchMedia('(pointer: coarse)').matches) document.querySelector('.dial-hint').dataset.i18n = 'dialHintTouch';
$('stat-emotions').textContent = count;
ring.setAttribute('aria-valuemax', String(count));
let layoutSize = '';
window.addEventListener('resize', () => {
  // Mobile browsers resize the height while scrolling; only the width matters there.
  const size = window.innerWidth > 980 ? `${window.innerWidth}x${window.innerHeight}` : `${window.innerWidth}`;
  if (size !== layoutSize) {
    layoutSize = size;
    layoutDial();
  }
});
layoutDial();
applyLanguage();
