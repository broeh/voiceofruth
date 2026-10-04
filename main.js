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
const orbCanvas = $('orb-canvas');

const state = {
  language: initialLanguage(),
  mode: 'scene',
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

/* ---------- The dial: an endless half circle ---------- */

const geo = {};
let slots = [];
let reach = 0;
let pending = [];
let hovered = -1;

function arcPath(inner, outer, from, to) {
  const point = (radius, degrees) => {
    const angle = (degrees - 90) * Math.PI / 180;
    return `${(geo.cx + radius * Math.cos(angle)).toFixed(2)},${(geo.cy + radius * Math.sin(angle)).toFixed(2)}`;
  };
  return `M${point(outer, from)} A${outer},${outer} 0 0 1 ${point(outer, to)} L${point(inner, to)} A${inner},${inner} 0 0 0 ${point(inner, from)} Z`;
}

function layoutDial() {
  const width = dial.clientWidth;
  const cap = Math.max(300, Math.min(440, window.innerHeight - 470));
  const outer = Math.round(Math.min(cap, Math.max(width / 2 - 10, Math.min(width * 0.85, 290))));
  const inner = Math.round(outer * 0.6);
  const top = 30;
  Object.assign(geo, {
    width, outer, inner, cx: width / 2, cy: outer + top, height: outer + top,
    step: Math.min(8, Math.max(5, 24 / inner * 180 / Math.PI)),
    labelRadius: (inner + 10 + outer - 12) / 2,
    labelSize: Math.round(Math.min(14, Math.max(11, outer * 0.03))),
  });
  dial.style.height = `${geo.height}px`;
  dial.style.setProperty('--hub', `${(inner - 16) * 2}px`);
  svg.setAttribute('viewBox', `0 0 ${width} ${geo.height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', geo.height);

  reach = Math.ceil(100 / geo.step);
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
    text.setAttribute('x', geo.cx);
    text.setAttribute('y', geo.cy - geo.labelRadius);
    text.style.fontSize = `${geo.labelSize}px`;
    text.style.transformOrigin = `${geo.cx}px ${geo.cy - geo.labelRadius}px`;
    group.append(path, band, text);
    svg.appendChild(group);
    return { group, text, abs: null };
  });
  render();
  sizeCanvas(hubCanvas);
  drawFrame(performance.now());
}

// Each absolute position i (the emotion is i mod count) keeps its own slot while visible,
// so a label only flips direction when it really crosses the top of the wheel.
function render() {
  if (!slots.length) return;
  const base = Math.round(state.position);
  for (let i = base - reach; i <= base + reach; i += 1) {
    const slot = slots[mod(i, slots.length)];
    const angle = (i - state.position) * geo.step;
    if (slot.abs !== i) {
      const emotion = emotions[mod(i, count)];
      slot.abs = i;
      slot.group.style.setProperty('--c', categories[emotion.category].color);
      slot.text.textContent = emotion[state.language];
      slot.text.classList.add('instant');
      pending.push(slot.text);
    }
    slot.group.setAttribute('transform', `rotate(${angle.toFixed(3)} ${geo.cx} ${geo.cy})`);
    slot.group.classList.toggle('current', i === base);
    slot.text.style.transform = `rotate(${angle < 0 ? 90 : -90}deg)`;
  }
  if (pending.length) {
    const texts = pending;
    pending = [];
    requestAnimationFrame(() => texts.forEach(text => text.classList.remove('instant')));
  }
  const current = mod(base, count);
  if (current !== hovered) {
    hovered = current;
    showHub(current);
  }
}

function showHub(index) {
  const emotion = emotions[index];
  const category = categories[emotion.category];
  document.documentElement.style.setProperty('--c', category.color);
  $('hub-category').textContent = category[state.language];
  const name = $('hub-emotion');
  name.textContent = emotion[state.language];
  name.lang = state.language;
  name.style.fontSize = '';
  const room = dial.querySelector('.hub').clientWidth * 0.86;
  if (name.scrollWidth > room) name.style.fontSize = `${parseFloat(getComputedStyle(name).fontSize) * room / name.scrollWidth}px`;
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

dial.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.hub')) return;
  engaged = true;
  stopAnimation();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: state.position, moved: false, samples: [] };
});

dial.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) > 5) {
    drag.moved = true;
    dial.setPointerCapture(event.pointerId);
    dial.classList.add('dragging');
  }
  if (!drag.moved) return;
  state.position = drag.start - dx / (geo.labelRadius * geo.step * Math.PI / 180);
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
  const box = dial.getBoundingClientRect();
  const x = event.clientX - box.left - geo.cx;
  const y = event.clientY - box.top - geo.cy;
  const radius = Math.hypot(x, y);
  if (radius < geo.inner || radius > geo.outer + 12) return;
  const angle = Math.atan2(x, -y) * 180 / Math.PI;
  animateTo(Math.round(state.position + angle / geo.step), true);
}
dial.addEventListener('pointerup', endDrag);
dial.addEventListener('pointercancel', endDrag);
dial.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && !drag) engaged = false; });

// The wheel scrolls the page until the visitor engages the dial, so it never traps scrolling.
dial.addEventListener('wheel', event => {
  const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
  if (!engaged && !horizontal) return;
  event.preventDefault();
  stopAnimation();
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 600 : 1;
  state.position += (horizontal ? event.deltaX : event.deltaY) * unit / 70;
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
  return emotions[state.index].takes[state.language][state.mode];
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
  hovered = -1;
  render();
  $('take-number').textContent = `${String(state.index + 1).padStart(2, '0')} / ${count}`;
  const text = $('take-text');
  text.textContent = take.text;
  text.lang = state.language;
  $('take-prompt').innerHTML = escapeHTML(take.prompt).replace(/\[[^\]]*\]/g, tag => `<span class="tag">${tag}</span>`);
  ring.setAttribute('aria-valuenow', String(state.index + 1));
  ring.setAttribute('aria-valuetext', `${emotion[state.language]}, ${category[state.language]}`);
  document.querySelectorAll('.chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.category === emotion.category)));
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode)));
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
  if (source === 'intro') $('intro-caption').textContent = `“${take.text}”`;
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

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (state.mode === button.dataset.mode) return;
  state.mode = button.dataset.mode;
  const wasWheel = state.source === 'wheel';
  if (wasWheel) stop();
  updateTake();
  if (state.hasListened) play('wheel');
  else if (wasWheel) updateButtons();
}));

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
  const cx = width / 2;
  const radius = width / 2;
  const bars = 56;
  context.lineCap = 'round';
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, width / 230);
  for (let i = 0; i < bars; i += 1) {
    const fromCenter = Math.abs(i - (bars - 1) / 2) / (bars / 2);
    const value = values[Math.min(values.length - 1, Math.floor(fromCenter * values.length * 0.85))];
    const angle = Math.PI + (i + 0.5) / bars * Math.PI;
    const start = radius * (radius < 200 ? 0.86 : 0.8);
    const length = radius * (0.012 + value * (radius < 200 ? 0.12 : 0.17));
    context.globalAlpha = 0.25 + value * 0.75;
    context.beginPath();
    context.moveTo(cx + Math.cos(angle) * start, height + Math.sin(angle) * start);
    context.lineTo(cx + Math.cos(angle) * (start + length), height + Math.sin(angle) * (start + length));
    context.stroke();
  }
  context.globalAlpha = 1;
}

function rgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function drawOrb(values, now, color) {
  const context = orbCanvas.getContext('2d');
  const { width, height } = orbCanvas;
  if (!width || !height) return;
  const energy = values.reduce((sum, value) => sum + value, 0) / values.length;
  const base = width * 0.24 * (1 + energy * 0.35);
  context.clearRect(0, 0, width, height);
  const halo = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
  halo.addColorStop(0, rgba('#f17fb0', 0.22 + energy * 0.2));
  halo.addColorStop(1, rgba('#f17fb0', 0));
  context.fillStyle = halo;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'screen';
  ['#f6c453', state.source === 'wheel' ? color : '#f17fb0', '#8e8cf7'].forEach((tint, layer) => {
    const phase = layer * 2.1;
    const cx = width / 2 + Math.cos(now / 2600 + phase) * width * 0.045;
    const cy = height / 2 + Math.sin(now / 3100 + phase) * width * 0.045;
    context.beginPath();
    for (let step = 0; step <= 96; step += 1) {
      const angle = step / 96 * Math.PI * 2;
      const band = values[Math.floor((step % 48) / 48 * values.length)] || 0;
      const radius = base * (1 + 0.07 * Math.sin(angle * 3 + now / 1400 + phase)
        + 0.045 * Math.sin(angle * 5 - now / 1900 + phase) + band * 0.24);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (step) context.lineTo(x, y); else context.moveTo(x, y);
    }
    const fill = context.createRadialGradient(cx, cy, 0, cx, cy, base * 1.25);
    fill.addColorStop(0, rgba(tint, 0.95));
    fill.addColorStop(0.6, rgba(tint, 0.42));
    fill.addColorStop(1, rgba(tint, 0));
    context.fillStyle = fill;
    context.fill();
  });
  const core = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, base * 0.7);
  core.addColorStop(0, `rgba(255,248,252,${0.55 + energy * 0.4})`);
  core.addColorStop(1, 'rgba(255,248,252,0)');
  context.fillStyle = core;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';
}

function drawFrame(now) {
  loop = 0;
  const animate = !player.paused && !player.ended && !reducedMotion;
  const values = levels(now, animate);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--c').trim() || '#f6c453';
  drawHub(values, color);
  drawOrb(values, animate ? now : 0, color);
  if (animate) {
    updateProgress();
    startLoop();
  }
}

/* ---------- Start ---------- */

$('stat-emotions').textContent = count;
ring.setAttribute('aria-valuemax', String(count));
new ResizeObserver(() => {
  sizeCanvas(orbCanvas);
  layoutDial();
}).observe(dial);
layoutDial();
applyLanguage();
