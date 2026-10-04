'use strict';

const DATA = window.RUTH_DATA;
const TEXT = window.RUTH_I18N;
const SVG_NS = 'http://www.w3.org/2000/svg';
const ENGLISH = ['en', 'en-gb', 'en-scot'];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = id => document.getElementById(id);
const player = $('player');
const mod = (value, size) => ((value % size) + size) % size;

const state = { ...initialChoice(), source: null, hasListened: false };
const wheels = {};
const t = key => TEXT[state.language][key];

// The audio version: Dutch, or English in the chosen accent (en = American).
const variant = () => (state.language === 'nl' ? 'nl' : state.english);

// Explicit choice first (?lang= or a saved switch), then visitors in the Netherlands get Dutch.
function initialChoice() {
  let saved = {};
  try {
    saved = { language: localStorage.getItem('ruth-language'), english: localStorage.getItem('ruth-english') };
  } catch (error) { /* storage blocked */ }
  const choice = { language: 'en', english: ENGLISH.includes(saved.english) ? saved.english : 'en' };
  const requested = new URLSearchParams(location.search).get('lang');
  if (requested === 'nl') choice.language = 'nl';
  else if (ENGLISH.includes(requested)) choice.english = requested;
  else if (saved.language === 'en' || saved.language === 'nl') choice.language = saved.language;
  else if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Amsterdam') choice.language = 'nl';
  return choice;
}

function escapeHTML(text) {
  return text.replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
}

function withTags(prompt) {
  return escapeHTML(prompt).replace(/\[[^\]]*\]/g, tag => `<span class="tag">${tag}</span>`);
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/* ---------- A wheel: an endless half circle, opening to the right ---------- */

class Wheel {
  constructor(root, { source, items, categories, takeFor, statusKeys = {} }) {
    Object.assign(this, { root, source, items, takeFor, statusKeys, count: items.length, categoryList: categories });
    this.categories = Object.fromEntries(categories.map(category => [category.id, category]));
    this.dial = root.querySelector('.dial');
    this.ring = root.querySelector('.dial-ring');
    this.svg = root.querySelector('.dial-svg');
    this.pointer = root.querySelector('.dial-pointer');
    this.canvas = root.querySelector('.hub-canvas');
    Object.assign(this, { index: 0, position: 0, hovered: -1, slots: [], reach: 0, geo: {}, animation: null, drag: null, engaged: false, wheelTimer: 0 });
    this.ring.setAttribute('aria-valuemax', String(this.count));
    this.bind();
  }

  el(selector) {
    return this.root.querySelector(selector);
  }

  take() {
    return this.takeFor(this.items[this.index]);
  }

  // Angles in degrees, 0 = 3 o'clock (the selected position), positive = clockwise.
  arcPath(inner, outer, from, to) {
    const { cx, cy } = this.geo;
    const point = (radius, degrees) => {
      const angle = degrees * Math.PI / 180;
      return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`;
    };
    return `M${point(outer, from)} A${outer},${outer} 0 0 1 ${point(outer, to)} L${point(inner, to)} A${inner},${inner} 0 0 0 ${point(inner, from)} Z`;
  }

  layout() {
    const desktop = window.innerWidth > 980;
    const outer = desktop
      ? Math.round(Math.max(280, Math.min(410, (window.innerHeight - 126) / 2 - 12, this.root.clientWidth * 0.36)))
      : Math.round(Math.min(360, document.documentElement.clientWidth - 40));
    const inner = Math.round(outer * 0.5);
    const height = desktop ? 2 * (outer + 12) : Math.round(outer * 1.6);
    const geo = this.geo = {
      width: outer + 34, height, outer, inner, cx: 0, cy: height / 2,
      step: Math.min(8, Math.max(5, 24 / (inner + 14) * 180 / Math.PI)),
      labelStart: inner + 14,
      labelSize: outer < 330 ? 13 : 14,
    };
    this.dial.style.width = `${geo.width}px`;
    this.dial.style.height = `${height}px`;
    this.dial.style.setProperty('--hub', `${inner - 14}px`);
    this.pointer.style.left = `${outer + 14}px`;
    this.pointer.style.top = `${geo.cy - 8}px`;
    this.svg.setAttribute('viewBox', `0 0 ${geo.width} ${height}`);
    this.svg.setAttribute('width', geo.width);
    this.svg.setAttribute('height', height);

    this.reach = Math.ceil(95 / geo.step);
    const sector = this.arcPath(inner + 4, outer, -geo.step / 2 + 0.35, geo.step / 2 - 0.35);
    const rim = this.arcPath(outer + 4, outer + 9, -geo.step / 2, geo.step / 2);
    this.svg.replaceChildren();
    this.slots = Array.from({ length: this.reach * 2 + 1 }, () => {
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
      this.svg.appendChild(group);
      return { group, text, abs: null };
    });
    this.hovered = -1;
    this.render();
    sizeCanvas(this.canvas);
  }

  // Absolute position i shows item i mod count. Labels sit between -90 and +90 degrees,
  // so they always read left to right.
  render() {
    if (!this.slots.length) return;
    const { geo } = this;
    const base = Math.round(this.position);
    for (let i = base - this.reach; i <= base + this.reach; i += 1) {
      const slot = this.slots[mod(i, this.slots.length)];
      if (slot.abs !== i) {
        const item = this.items[mod(i, this.count)];
        slot.abs = i;
        slot.group.style.setProperty('--c', this.categories[item.category].color);
        slot.text.textContent = item[state.language];
      }
      slot.group.setAttribute('transform', `rotate(${((i - this.position) * geo.step).toFixed(3)} ${geo.cx} ${geo.cy})`);
      slot.group.classList.toggle('current', i === base);
    }
    const current = mod(base, this.count);
    if (current !== this.hovered) {
      this.hovered = current;
      this.dial.style.setProperty('--h', this.categories[this.items[current].category].color);
    }
  }

  relabel() {
    this.slots.forEach(slot => { slot.abs = null; });
    this.render();
  }

  stopAnimation() {
    if (this.animation) cancelAnimationFrame(this.animation.frame);
    this.animation = null;
  }

  // Playback starts right away (inside the click or key handler, which mobile browsers require)
  // while the wheel is still turning.
  animateTo(target, autoplay) {
    this.stopAnimation();
    if (autoplay) this.select(mod(target, this.count), true);
    const from = this.position;
    const duration = reducedMotion ? 0 : Math.min(950, 280 + Math.abs(target - from) * 40);
    const start = performance.now();
    this.animation = { target };
    const frame = now => {
      const progress = duration ? Math.min(1, (now - start) / duration) : 1;
      this.position = from + (target - from) * (1 - Math.pow(1 - progress, 3));
      this.render();
      if (progress < 1) {
        this.animation.frame = requestAnimationFrame(frame);
      } else {
        this.animation = null;
        this.select(mod(target, this.count), false);
      }
    };
    this.animation.frame = requestAnimationFrame(frame);
  }

  turnBy(steps) {
    const from = this.animation ? this.animation.target : Math.round(this.position);
    this.animateTo(from + steps, state.hasListened);
  }

  turnTo(index, autoplay) {
    const base = this.animation ? this.animation.target : Math.round(this.position);
    let delta = mod(index - base, this.count);
    if (delta > this.count / 2) delta -= this.count;
    this.animateTo(base + delta, autoplay);
  }

  select(index, autoplay) {
    const changed = index !== this.index;
    this.index = index;
    this.update();
    if (changed && state.source === this.source) stop();
    if (autoplay && (changed || state.source !== this.source || player.paused)) play(this.source);
  }

  renderCategories() {
    this.el('.categories').replaceChildren(...this.categoryList.map(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.dataset.category = category.id;
      button.style.setProperty('--chip', category.color);
      button.textContent = category[state.language];
      button.addEventListener('click', () => this.turnTo(this.items.findIndex(item => item.category === category.id), state.hasListened));
      return button;
    }));
  }

  update() {
    const item = this.items[this.index];
    const category = this.categories[item.category];
    const take = this.take();
    this.root.style.setProperty('--c', category.color);
    this.el('.take-category').textContent = category[state.language];
    this.el('.take-number').textContent = `${String(this.index + 1).padStart(2, '0')} / ${this.count}`;
    const name = this.el('.take-emotion');
    name.textContent = item[state.language];
    name.lang = state.language;
    const quote = this.el('.take-text');
    if (quote) {
      quote.textContent = take.text;
      quote.lang = state.language;
    }
    const script = this.el('.prompt-code') || this.el('.script-text');
    script.innerHTML = withTags(take.prompt);
    script.lang = state.language;
    const voice = this.el('.take-voice');
    if (voice) {
      const { id, name: voiceName } = DATA.voices[item.voice];
      voice.href = `https://elevenlabs.io/app/voice-library?voiceId=${id}`;
      voice.textContent = `${t('voiceLabel')}: ${voiceName} ↗`;
    }
    const note = this.el('.take-note');
    if (note) {
      note.hidden = take.file.split('/')[1] === variant();
      note.textContent = t('ucAmericanOnly');
    }
    this.ring.setAttribute('aria-valuenow', String(this.index + 1));
    this.ring.setAttribute('aria-valuetext', `${item[state.language]}, ${category[state.language]}`);
    this.root.querySelectorAll('.chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.category === item.category)));
    this.updateProgress();
    this.setStatus();
  }

  setStatus(key) {
    const status = this.el('.player-status');
    const active = state.source === this.source;
    const name = key || (!active ? 'statusIdle' : player.ended ? 'statusEnded' : player.paused ? (player.currentTime > 0 ? 'statusPaused' : 'statusIdle') : 'statusPlaying');
    status.textContent = name === 'statusPlaying' ? `${t(name)}: ${this.items[this.index][state.language]}` : t(this.statusKeys[name] || name);
    status.classList.toggle('error', name === 'statusError');
  }

  updateProgress() {
    const active = state.source === this.source;
    const total = active && Number.isFinite(player.duration) ? player.duration : this.take().duration;
    const current = active ? player.currentTime : 0;
    const percent = total ? Math.min(100, current / total * 100) : 0;
    this.el('.progress-fill').style.width = `${percent}%`;
    this.el('.progress').setAttribute('aria-valuenow', String(Math.round(percent)));
    this.el('.take-time').textContent = active && current > 0 ? `${formatTime(current)} / ${formatTime(total)}` : formatTime(total);
  }

  seek(fraction) {
    const apply = () => { player.currentTime = Math.max(0, Math.min(1, fraction)) * player.duration; };
    if (state.source === this.source && Number.isFinite(player.duration)) {
      apply();
    } else {
      play(this.source);
      player.addEventListener('loadedmetadata', apply, { once: true });
    }
    this.updateProgress();
  }

  pointerAngle(event) {
    const box = this.dial.getBoundingClientRect();
    const x = event.clientX - box.left - this.geo.cx;
    const y = event.clientY - box.top - this.geo.cy;
    return { angle: Math.atan2(y, x) * 180 / Math.PI, radius: Math.hypot(x, y) };
  }

  bind() {
    const { dial, ring } = this;
    dial.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.hub')) return;
      this.engaged = true;
      this.stopAnimation();
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, angle: this.pointerAngle(event).angle, start: this.position, moved: false, samples: [] };
    });

    dial.addEventListener('pointermove', event => {
      const { drag } = this;
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) {
        drag.moved = true;
        dial.setPointerCapture(event.pointerId);
        dial.classList.add('dragging');
      }
      if (!drag.moved) return;
      const turned = mod(this.pointerAngle(event).angle - drag.angle + 180, 360) - 180;
      this.position = drag.start - turned / this.geo.step;
      drag.samples.push({ time: event.timeStamp, position: this.position });
      drag.samples = drag.samples.filter(sample => event.timeStamp - sample.time < 120);
      this.render();
    });

    const endDrag = event => {
      const finished = this.drag;
      if (!finished || event.pointerId !== finished.id) return;
      this.drag = null;
      dial.classList.remove('dragging');
      if (event.type === 'pointercancel') {
        this.animateTo(Math.round(this.position), false);
        return;
      }
      if (finished.moved) {
        const [first, last] = [finished.samples[0], finished.samples[finished.samples.length - 1]];
        const velocity = first && last && last.time > first.time ? (last.position - first.position) / (last.time - first.time) : 0;
        this.animateTo(Math.round(this.position + velocity * 260), state.hasListened);
        return;
      }
      const { angle, radius } = this.pointerAngle(event);
      if (radius < this.geo.inner || radius > this.geo.outer + 12) return;
      this.animateTo(Math.round(this.position + angle / this.geo.step), true);
    };
    dial.addEventListener('pointerup', endDrag);
    dial.addEventListener('pointercancel', endDrag);
    dial.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && !this.drag) this.engaged = false; });

    // The scroll wheel scrolls the page until the visitor engages the dial, so it never traps scrolling.
    dial.addEventListener('wheel', event => {
      if (!this.engaged) return;
      event.preventDefault();
      this.stopAnimation();
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 600 : 1;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      this.position += delta * unit / 70;
      this.render();
      clearTimeout(this.wheelTimer);
      this.wheelTimer = setTimeout(() => this.animateTo(Math.round(this.position), state.hasListened), 160);
    }, { passive: false });

    ring.addEventListener('focus', () => { this.engaged = true; });
    ring.addEventListener('blur', () => { this.engaged = false; });
    ring.addEventListener('keydown', event => {
      const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[event.key];
      if (steps) {
        event.preventDefault();
        this.turnBy(steps);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.turnTo(event.key === 'Home' ? 0 : this.count - 1, state.hasListened);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle(this.source);
      }
    });

    this.root.querySelectorAll('[data-turn]').forEach(button => button.addEventListener('click', () => this.turnBy(Number(button.dataset.turn))));
    this.el('[data-shuffle]').addEventListener('click', () => {
      let next = this.index;
      while (next === this.index) next = Math.floor(Math.random() * this.count);
      this.turnTo(next, true);
    });

    const progress = this.el('.progress');
    progress.addEventListener('click', event => {
      const box = progress.getBoundingClientRect();
      this.seek((event.clientX - box.left) / box.width);
    });
    progress.addEventListener('keydown', event => {
      const delta = { ArrowRight: 0.1, ArrowUp: 0.1, ArrowLeft: -0.1, ArrowDown: -0.1 }[event.key];
      if (!delta || state.source !== this.source || !Number.isFinite(player.duration)) return;
      event.preventDefault();
      this.seek(player.currentTime / player.duration + delta);
    });
  }
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
  document.querySelectorAll('[data-variant]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.variant === variant()));
  });
  document.querySelectorAll('[data-sample-text]').forEach(element => {
    element.textContent = DATA.extras[element.dataset.sampleText][variant()].text;
    element.lang = state.language;
  });
  Object.values(wheels).forEach(wheel => {
    wheel.renderCategories();
    wheel.relabel();
    wheel.update();
  });
  updateButtons();
}

// Switch language and, for English, the accent. A playing clip continues in the new version.
function choose(language, english = state.english) {
  const source = state.source;
  const wasPlaying = source && !player.paused && !player.ended;
  Object.assign(state, { language, english });
  try {
    localStorage.setItem('ruth-language', language);
    localStorage.setItem('ruth-english', english);
  } catch (error) { /* storage blocked */ }
  if (source && !isLoaded(takeFor(source).file)) {
    stop();
    if (wasPlaying) play(source);
  }
  applyLanguage();
}

document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => choose(button.dataset.language)));
document.querySelectorAll('[data-variant]').forEach(button => button.addEventListener('click', () => {
  const chosen = button.dataset.variant;
  if (chosen === 'nl') choose('nl');
  else choose('en', chosen);
}));

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

function takeFor(source) {
  return wheels[source] ? wheels[source].take() : DATA.extras[source][variant()];
}

function isLoaded(file) {
  return player.getAttribute('src') === file;
}

async function play(source) {
  const take = takeFor(source);
  connectAnalyser();
  if (state.source !== source || !isLoaded(take.file)) {
    const previous = wheels[state.source];
    player.src = take.file;
    state.source = source;
    if (previous) {
      previous.updateProgress();
      previous.setStatus();
    }
  }
  try {
    await player.play();
  } catch (error) {
    if (error.name !== 'AbortError' && wheels[source]) wheels[source].setStatus('statusBlocked');
  }
}

function stop() {
  const previous = wheels[state.source];
  player.pause();
  player.removeAttribute('src');
  player.load();
  state.source = null;
  updateButtons();
  if (previous) {
    previous.updateProgress();
    previous.setStatus();
  }
  drawFrame(performance.now());
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
    const wheel = wheels[button.dataset.source];
    if (wheel) button.setAttribute('aria-label', `${t(playing ? 'pause' : 'play')}: ${wheel.items[wheel.index][state.language]}`);
  });
}

document.querySelectorAll('[data-source]').forEach(button => button.addEventListener('click', () => toggle(button.dataset.source)));

const activeWheel = () => wheels[state.source];
player.addEventListener('play', () => {
  state.hasListened = true;
  if (audioContext && audioContext.state === 'suspended') audioContext.resume();
  updateButtons();
  activeWheel()?.setStatus();
  startLoop();
});
player.addEventListener('pause', () => { updateButtons(); activeWheel()?.setStatus(); });
player.addEventListener('ended', () => { updateButtons(); activeWheel()?.setStatus(); activeWheel()?.updateProgress(); });
player.addEventListener('timeupdate', () => activeWheel()?.updateProgress());
player.addEventListener('error', () => {
  if (!player.getAttribute('src')) return;
  updateButtons();
  activeWheel()?.setStatus('statusError');
});

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

function drawHub(canvas, values, color) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  if (!width || !height) return;
  context.clearRect(0, 0, width, height);
  const cy = height / 2;
  const radius = width;
  const small = canvas.clientWidth < 160;
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
  const idle = new Array(values.length).fill(0);
  Object.values(wheels).forEach(wheel => {
    const color = getComputedStyle(wheel.root).getPropertyValue('--c').trim() || '#f6c453';
    drawHub(wheel.canvas, state.source === wheel.source ? values : idle, color);
  });
  if (animate) {
    activeWheel()?.updateProgress();
    startLoop();
  }
}

/* ---------- Start ---------- */

wheels.emotions = new Wheel(document.querySelector('[data-wheel="emotions"]'), {
  source: 'emotions', items: DATA.emotions, categories: DATA.categories, takeFor: item => item.takes[variant()],
});
wheels.usecases = new Wheel(document.querySelector('[data-wheel="usecases"]'), {
  source: 'usecases', items: DATA.usecases, categories: DATA.usecaseCategories,
  takeFor: item => item.takes[state.language === 'nl' ? 'nl' : 'en'],
  statusKeys: { statusIdle: 'ucStatusIdle', statusEnded: 'ucStatusEnded' },
});

if (matchMedia('(pointer: coarse)').matches) document.querySelectorAll('.dial-hint').forEach(hint => { hint.dataset.i18n += 'Touch'; });
$('stat-emotions').textContent = DATA.emotions.length;
let layoutSize = '';
function layoutAll() {
  Object.values(wheels).forEach(wheel => wheel.layout());
  drawFrame(performance.now());
}
window.addEventListener('resize', () => {
  // Mobile browsers resize the height while scrolling; only the width matters there.
  const size = window.innerWidth > 980 ? `${window.innerWidth}x${window.innerHeight}` : `${window.innerWidth}`;
  if (size !== layoutSize) {
    layoutSize = size;
    layoutAll();
  }
});
layoutAll();
applyLanguage();
