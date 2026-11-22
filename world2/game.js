/* =====================================================================
   ПИКСЕЛЬНАЯ ФЕРМА
   Полностью самодостаточная игра: canvas-графика рисуется кодом,
   звук — синтезом WebAudio, прогресс — localStorage + облако (Python).
   ===================================================================== */
(() => {
'use strict';

/* ---------------------------------------------------------------
   Утилиты
   --------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : (isFinite(parseFloat(v)) ? parseFloat(v) : d);
const pad2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m <= 0) return s + ' с';
  return m + ' мин' + (s ? ' ' + s + ' с' : '');
}

/* ---------------------------------------------------------------
   Константы мира
   --------------------------------------------------------------- */
const VW = 400, VH = 240, SCALE = 3, TS = 16;
const FARM_COLS = 9, FARM_ROWS = 6, PLOTS = FARM_COLS * FARM_ROWS;
const FARM_X = 128, FARM_Y = 72;
const DAY_START = 6 * 60, DAY_END = 24 * 60, MIN_PER_SEC = 5;
const SAVE_KEY = 'pixelFarm.save.v2';
const PID_KEY = 'pixelFarm.playerId';
const MAX_SAVE_MS = 700;

const CROPS = {
  wheat:      { id: 'wheat',      name: 'Пшеница',    cost: 5,  sell: 14,  grow: 70,  xp: 3,  level: 1, color: '#e6c15a', desc: 'Быстрая и надёжная культура для старта.' },
  carrot:     { id: 'carrot',     name: 'Морковь',    cost: 9,  sell: 22,  grow: 110, xp: 4,  level: 1, color: '#ef8a3c', desc: 'Сочная и хрустящая. Любит воду.' },
  corn:       { id: 'corn',       name: 'Кукуруза',   cost: 15, sell: 38,  grow: 170, xp: 6,  level: 2, color: '#ffd94a', desc: 'Золотые початки. Открывается на 2 уровне.' },
  pumpkin:    { id: 'pumpkin',    name: 'Тыква',      cost: 24, sell: 65,  grow: 240, xp: 9,  level: 3, color: '#f28a2e', desc: 'Большая и выгодная. Нужен 3 уровень.' },
  strawberry: { id: 'strawberry', name: 'Клубника',   cost: 34, sell: 95,  grow: 330, xp: 12, level: 4, color: '#e6485a', desc: 'Сладкая ягода для рынка. 4 уровень.' },
  sunflower:  { id: 'sunflower',  name: 'Подсолнух',  cost: 46, sell: 135, grow: 430, xp: 16, level: 5, color: '#ffd34d', desc: 'Солнце на грядке. 5 уровень.' }
};
const CROP_IDS = Object.keys(CROPS);
const ITEM_ICONS = { wheat: '🌾', carrot: '🥕', corn: '🌽', pumpkin: '🎃', strawberry: '🍓', sunflower: '🌻', egg: '🥚' };
const ITEM_NAMES = { wheat: 'Пшеница', carrot: 'Морковь', corn: 'Кукуруза', pumpkin: 'Тыква', strawberry: 'Клубника', sunflower: 'Подсолнух', egg: 'Яйцо' };
const SELL_PRICES = { wheat: 14, carrot: 22, corn: 38, pumpkin: 65, strawberry: 95, sunflower: 135, egg: 18 };

const WEATHER = {
  sunny:  { name: 'Солнечно', icon: '☀️' },
  cloudy: { name: 'Облачно',  icon: '☁️' },
  rain:   { name: 'Дождь',    icon: '🌧️' },
  heat:   { name: 'Жара',     icon: '🔥' },
  windy:  { name: 'Ветрено',  icon: '🍃' }
};

const LEVELS = [0, 35, 90, 170, 280, 420, 600, 820, 1100, 1450, 1900, 2500];

const UPGRADES = [
  { id: 'can',       name: 'Большая лейка', ico: '💧', desc: '+5 к вместимости лейки',            max: 5, levelReq: 2, cost: (l) => 90 + l * 70 },
  { id: 'energy',    name: 'Термос с чаем', ico: '⚡', desc: '+20 к максимуму энергии',           max: 5, levelReq: 2, cost: (l) => 120 + l * 90 },
  { id: 'compost',   name: 'Компост',       ico: '🌱', desc: '+15% к скорости роста',             max: 3, levelReq: 3, cost: (l) => 160 + l * 120 },
  { id: 'chicken',   name: 'Новая курочка', ico: '🐔', desc: '+1 курочка и больше яиц',           max: 3, levelReq: 2, cost: (l) => 240 + l * 160 },
  { id: 'autoWater', name: 'Автополив',     ico: '🚿', desc: 'Поливает все грядки каждое утро',   max: 1, levelReq: 4, cost: () => 600 }
];

const ACHIEVEMENTS = [
  { id: 'first_harvest', name: 'Первый урожай',   desc: 'Соберите первый урожай', ico: '🌱', check: (s) => s.stats.harvested >= 1 },
  { id: 'harvest_50',    name: 'Трудяга',         desc: 'Соберите 50 урожаев', ico: '🧺', check: (s) => s.stats.harvested >= 50 },
  { id: 'coins_1000',    name: 'Богач',           desc: 'Заработайте 1000 монет', ico: '💰', check: (s) => s.stats.earned >= 1000 },
  { id: 'day_10',        name: 'Старожил',        desc: 'Проживите 10 дней', ico: '📅', check: (s) => s.day >= 10 },
  { id: 'level_5',       name: 'Опытный фермер',  desc: 'Достигните 5 уровня', ico: '⭐', check: (s) => levelOf(s.xp) >= 5 },
  { id: 'all_crops',     name: 'Коллекционер',    desc: 'Соберите все 6 культур', ico: '🏆', check: (s) => CROP_IDS.every((c) => (s.stats.types[c] || 0) > 0) },
  { id: 'eggs_20',       name: 'Яичный магнат',   desc: 'Соберите 20 яиц', ico: '🥚', check: (s) => (s.stats.eggs || 0) >= 20 }
];

const QUEST_POOL = [
  { type: 'plant',   icon: '🌱' },
  { type: 'harvest', icon: '🧺' },
  { type: 'water',   icon: '💧' },
  { type: 'earn',    icon: '🪙' }
];

const TOOL_SLOTS = [
  { key: 'hoe', kind: 'tool', id: 'hoe', name: 'Мотыга' },
  { key: 'can', kind: 'tool', id: 'can', name: 'Лейка' },
  ...CROP_IDS.map((id) => ({ key: 'seed:' + id, kind: 'seed', id, name: CROPS[id].name }))
];

/* ---------------------------------------------------------------
   DOM
   --------------------------------------------------------------- */
const canvas = $('game');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');
bgCanvas.width = VW; bgCanvas.height = VH;
const bgx = bgCanvas.getContext('2d');

const hotbar = $('hotbar');
const toastsEl = $('toasts');
const hintEl = $('hint');
const modalWrap = $('modalWrap');
const modalBody = $('modalBody');
const modalTitle = $('modalTitle');
const confirmWrap = $('confirmWrap');
const confirmTitle = $('confirmTitle');
const confirmText = $('confirmText');
const confirmYes = $('confirmYes');
const confirmNo = $('confirmNo');
const splash = $('splash');
const flashEl = $('flash');

/* ---------------------------------------------------------------
   Изменяемое состояние
   --------------------------------------------------------------- */
let state = null;
let splashOpen = true;
let started = false;
let persistence = true;
let modalOpen = false;
let confirming = false;
let sleeping = false;
let menuTab = 'quests';
let hover = null;
let lastHint = '';
let animT = 0;
let cloudOnline = false;
let cloudChecked = false;
let cloudBusy = false;
let cloudLastSync = 0;
let leaderboard = null;
let leaderboardState = 'idle';
let confirmCb = null;
let saveT = 0;

const chickens = [];
const fx = [];
const ftexts = [];
const plotDetail = [];

/* ---------------------------------------------------------------
   Кошелёк мини-приложения: монеты и звёзды живут в Farm Stars,
   мир только показывает их и сообщает об изменениях.
   --------------------------------------------------------------- */
let walletCoins = 0;
let walletStars = 0;
let walletMute = false;

function postWallet(msg) {
  try {
    if (parent !== window) parent.postMessage(Object.assign({ source: 'world2' }, msg), location.origin);
  } catch (e) { /* открыто напрямую, без приложения */ }
}

function attachWallet(s) {
  walletCoins = Math.max(0, Math.floor(num(s.coins, 0)));
  walletStars = Math.max(0, Math.floor(num(s.stars, 0)));
  Object.defineProperty(s, 'coins', {
    configurable: true,
    enumerable: true,
    get() { return walletCoins; },
    set(v) {
      const next = Math.max(0, Math.floor(num(v, 0)));
      const delta = next - walletCoins;
      walletCoins = next;
      if (delta && !walletMute) postWallet({ type: delta > 0 ? 'earn' : 'spend', amount: Math.abs(delta) });
    }
  });
  return s;
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const m = e.data;
  if (!m || m.source !== 'farmstars' || m.type !== 'wallet') return;
  walletMute = true;
  walletCoins = Math.max(0, Math.floor(num(m.coins, 0)));
  walletStars = Math.max(0, Math.floor(num(m.stars, 0)));
  walletMute = false;
  if (state) updateHUD();
});

/* =====================================================================
   СОХРАНЕНИЕ И ОБЛАКО
   ===================================================================== */
function newState() {
  const readyPlots = new Set([40, 41, 49, 50, 51]);
  return attachWallet({
    v: 2, coins: 150, xp: 0, day: 1, minutes: DAY_START,
    energy: 100, water: 10, weather: 'sunny', selected: 'hoe',
    plots: Array.from({ length: PLOTS }, (_, i) => ({ tilled: readyPlots.has(i), crop: null })),
    inventory: { wheat: 0, carrot: 0, corn: 0, pumpkin: 0, strawberry: 0, sunflower: 0, egg: 0 },
    eggs: 0,
    upgrades: { can: 0, energy: 0, compost: 0, chicken: 0, autoWater: false },
    stats: { harvested: 0, planted: 0, watered: 0, earned: 0, eggs: 0, daysPlayed: 1, types: {} },
    quests: [], questsDay: 0, achv: [], sound: true,
    name: 'Фермер', savedAt: 0
  });
}

function levelOf(xp) {
  let l = 1;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) l = i + 1;
  return l;
}
function level() { return levelOf(state.xp); }
function nextThreshold(lvl) {
  if (lvl < LEVELS.length) return LEVELS[lvl];
  return LEVELS[LEVELS.length - 1] + (lvl - LEVELS.length + 1) * 700;
}
function maxEnergyOf(s) { return 100 + (s.upgrades.energy || 0) * 20 + (levelOf(s.xp) - 1) * 5; }
function maxEnergy() { return maxEnergyOf(state); }
function waterCap() { return 10 + (state.upgrades.can || 0) * 5; }
function chickensCount() { return 3 + (state.upgrades.chicken || 0); }

function sanitize(raw) {
  const base = newState();
  if (!raw || typeof raw !== 'object') return base;
  const s = Object.assign({}, base, raw);
  s.coins = Math.max(0, Math.floor(num(raw.coins, 150)));
  s.xp = Math.max(0, Math.floor(num(raw.xp, 0)));
  s.day = Math.max(1, Math.floor(num(raw.day, 1)));
  s.minutes = clamp(num(raw.minutes, DAY_START), DAY_START, DAY_END - 1);
  s.weather = WEATHER[raw.weather] ? raw.weather : 'sunny';
  s.inventory = Object.assign({}, base.inventory, raw.inventory || {});
  for (const k of Object.keys(base.inventory)) s.inventory[k] = Math.max(0, Math.floor(num(s.inventory[k], 0)));
  s.upgrades = Object.assign({}, base.upgrades, raw.upgrades || {});
  s.upgrades.can = clamp(Math.floor(num(s.upgrades.can, 0)), 0, 5);
  s.upgrades.energy = clamp(Math.floor(num(s.upgrades.energy, 0)), 0, 5);
  s.upgrades.compost = clamp(Math.floor(num(s.upgrades.compost, 0)), 0, 3);
  s.upgrades.chicken = clamp(Math.floor(num(s.upgrades.chicken, 0)), 0, 3);
  s.upgrades.autoWater = !!s.upgrades.autoWater;
  s.energy = clamp(num(raw.energy, 100), 0, maxEnergyOf(s));
  s.water = clamp(num(raw.water, 10), 0, 10 + s.upgrades.can * 5);
  s.stats = Object.assign({}, base.stats, raw.stats || {});
  s.stats.types = Object.assign({}, (raw.stats && raw.stats.types) || {});
  s.achv = Array.isArray(raw.achv) ? raw.achv.filter((x) => typeof x === 'string') : [];
  s.quests = Array.isArray(raw.quests) ? raw.quests.filter((q) => q && typeof q.type === 'string').map((q) => ({
    type: q.type, icon: typeof q.icon === 'string' ? q.icon : '🌱',
    text: String(q.text || 'Задание'), goal: Math.max(1, Math.floor(num(q.goal, 1))),
    reward: Math.max(0, Math.floor(num(q.reward, 0))),
    progress: Math.max(0, Math.floor(num(q.progress, 0))), done: !!q.done
  })) : [];
  s.questsDay = Math.floor(num(raw.questsDay, s.day));
  s.name = (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim().slice(0, 20) : 'Фермер';
  s.sound = raw.sound !== false;
  s.savedAt = num(raw.savedAt, 0);
  s.plots = [];
  for (let i = 0; i < PLOTS; i++) {
    const p = Array.isArray(raw.plots) ? raw.plots[i] : null;
    let crop = null;
    if (p && p.crop && CROPS[p.crop.id]) {
      crop = {
        id: p.crop.id,
        growth: clamp(num(p.crop.growth, 0), 0, CROPS[p.crop.id].grow),
        watered: !!p.crop.watered
      };
    }
    s.plots.push({ tilled: !!(p && p.tilled), crop });
  }
  const validSel = ['hoe', 'can', ...CROP_IDS.map((c) => 'seed:' + c)];
  s.selected = validSel.indexOf(raw.selected) >= 0 ? raw.selected : 'hoe';
  return attachWallet(s);
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch (e) {
    console.warn('Не удалось загрузить сохранение', e);
    return null;
  }
}

function save() {
  if (!state || !persistence) return;
  try {
    state.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) { /* приватный режим — играем без сохранения */ }
}

function hasLocalSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function getPid() {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
      id = 'farm' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch (e) { return 'offline-farm'; }
}

async function syncUp(silent) {
  if (!cloudOnline || cloudBusy || !persistence) return;
  cloudBusy = true;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: getPid(), state })
    });
    if (res.ok) {
      cloudLastSync = Date.now();
      if (!silent) toast('☁️ Прогресс сохранён в облако', 'good');
    } else if (!silent) {
      toast('Не удалось сохранить в облако', 'bad');
    }
  } catch (e) {
    cloudOnline = false;
    if (!silent) toast('Облако недоступно — играем локально', 'bad');
  } finally {
    cloudBusy = false;
  }
}

async function cloudBootstrap() {
  if (!persistence) return;
  try {
    const ping = await fetch('/api/ping', { cache: 'no-store' });
    if (!ping.ok) throw new Error('no server');
    cloudOnline = true;
    try {
      const res = await fetch('/api/load?id=' + encodeURIComponent(getPid()), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const remote = data && data.state ? sanitize(data.state) : null;
        if (remote && (remote.savedAt || 0) > (state.savedAt || 0) + 1500) {
          state = remote;
          ensureQuests();
          save();
          refreshAll();
          toast('☁️ Загружен прогресс из облака', 'good', 3200);
        } else if (state.savedAt) {
          syncUp(true);
        }
      } else if (state.savedAt) {
        syncUp(true);
      }
    } catch (e) { /* нет сохранения в облаке */ }
  } catch (e) {
    cloudOnline = false;
  }
  cloudChecked = true;
  if (modalOpen && menuTab === 'more') renderMenu();
}

async function loadLeaderboard() {
  if (leaderboardState === 'loading' || leaderboardState === 'ok') return;
  leaderboardState = 'loading';
  if (modalOpen && menuTab === 'rating') renderMenu();
  try {
    const res = await fetch('/api/leaderboard', { cache: 'no-store' });
    if (!res.ok) throw new Error('http');
    const data = await res.json();
    leaderboard = Array.isArray(data.leaders) ? data.leaders : [];
    leaderboardState = 'ok';
  } catch (e) {
    leaderboardState = 'error';
  }
  if (modalOpen && menuTab === 'rating') renderMenu();
}

/* =====================================================================
   ЗВУК (WebAudio, без файлов)
   ===================================================================== */
let audioCtx = null;
function ensureAudio() {
  if (!state || !state.sound) return null;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}
function tone(freq, dur, type, vol, delay, slideTo) {
  const ac = ensureAudio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.04), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  } catch (e) { /* тишина */ }
}
function noiseBurst(dur, vol, freq) {
  const ac = ensureAudio();
  if (!ac) return;
  try {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq || 900;
    const gain = ac.createGain();
    gain.gain.value = vol || 0.04;
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
  } catch (e) { /* тишина */ }
}
const SFX = {
  click:   () => tone(620, 0.045, 'square', 0.022),
  plant:   () => { tone(330, 0.07, 'triangle', 0.05); tone(470, 0.08, 'triangle', 0.04, 0.06); },
  water:   () => { noiseBurst(0.2, 0.05, 1300); tone(720, 0.13, 'sine', 0.022, 0, 980); },
  harvest: () => { tone(660, 0.08, 'square', 0.035); tone(880, 0.1, 'square', 0.03, 0.07); tone(1180, 0.12, 'triangle', 0.025, 0.14); },
  coin:    () => { tone(990, 0.07, 'square', 0.032); tone(1320, 0.12, 'square', 0.026, 0.06); },
  error:   () => tone(170, 0.11, 'sawtooth', 0.035, 0, 120),
  till:    () => { noiseBurst(0.1, 0.04, 520); tone(230, 0.07, 'triangle', 0.03); },
  sleep:   () => [392, 523, 659].forEach((f, i) => tone(f, 0.4, 'sine', 0.035, i * 0.15)),
  level:   () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.04, i * 0.09)),
  egg:     () => { tone(820, 0.07, 'sine', 0.035); tone(1030, 0.09, 'sine', 0.03, 0.06); },
  buy:     () => { tone(520, 0.06, 'square', 0.032); tone(780, 0.09, 'square', 0.028, 0.06); },
  buyErr:  () => { tone(250, 0.08, 'square', 0.03); tone(190, 0.12, 'square', 0.03, 0.08); }
};
function playSound(name) {
  if (!state || !state.sound) return;
  const fn = SFX[name];
  if (fn) { try { fn(); } catch (e) { /* тишина */ } }
}

/* =====================================================================
   ПИКСЕЛЬНАЯ ГРАФИКА — помощники
   ===================================================================== */
function box(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function pix(g, x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
function pixelCircle(g, cx, cy, r, c) {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
function pixelEllipse(g, cx, cy, rx, ry, c) {
  g.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))) * rx);
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
}
function pixelRound(g, x, y, w, h, r, c) {
  g.fillStyle = c;
  g.fillRect(x + r, y, w - 2 * r, h);
  g.fillRect(x, y + r, w, h - 2 * r);
  for (let i = 0; i < r; i++) {
    const dy = r - i;
    const dx = r - Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    g.fillRect(x + dx, y + i, w - 2 * dx, 1);
    g.fillRect(x + dx, y + h - 1 - i, w - 2 * dx, 1);
  }
}
function plotRect(i) {
  const c = i % FARM_COLS, r = (i / FARM_COLS) | 0;
  return { x: FARM_X + c * TS, y: FARM_Y + r * TS, c, r };
}

/* =====================================================================
   СТАТИЧНЫЙ ФОН
   ===================================================================== */
function drawFlower(g, x, y, color) {
  g.fillStyle = '#4d8a3a'; g.fillRect(x, y + 2, 1, 2);
  pix(g, x - 1, y + 1, color); pix(g, x + 1, y + 1, color);
  pix(g, x, y, color); pix(g, x, y + 1, color);
  pix(g, x, y, '#ffe27a');
}
function drawTree(g, cx, cy, r, apples) {
  pixelEllipse(g, cx + 1, cy + r + 6, r + 3, 3, 'rgba(35,72,28,.20)');
  box(g, cx - 2, cy + r - 3, 4, 12, '#7d5230');
  box(g, cx + 1, cy + r - 3, 1, 12, '#5e3b20');
  box(g, cx - 3, cy + r + 8, 6, 2, '#5e3b20');
  pixelCircle(g, cx, cy, r + 1, '#2f5f2b');
  pixelCircle(g, cx, cy, r, '#4c8b3c');
  pixelCircle(g, cx - 2, cy - 2, r - 2, '#61a44a');
  pixelCircle(g, cx - Math.round(r / 2), cy - Math.round(r / 2), Math.max(2, r - 5), '#7cbd5c');
  pix(g, cx - r + 2, cy - 2, '#95d273');
  if (apples) {
    const spots = [[-4, 1], [3, -3], [1, 4], [-2, -5]];
    for (const [dx, dy] of spots) {
      if (Math.abs(dx) > r || Math.abs(dy) > r) continue;
      pix(g, cx + dx, cy + dy, '#d94b3f');
      pix(g, cx + dx, cy + dy - 1, '#f77a63');
    }
  }
}
function drawBush(g, cx, cy, r) {
  pixelEllipse(g, cx + 1, cy + r + 2, r + 1, 2, 'rgba(35,72,28,.18)');
  pixelCircle(g, cx, cy, r, '#35702e');
  pixelCircle(g, cx - 1, cy - 1, r - 1, '#4f923f');
  pixelCircle(g, cx - 2, cy - 2, Math.max(1, r - 3), '#6cae52');
  pix(g, cx + r - 2, cy, '#d9564a');
  pix(g, cx - r + 2, cy + 1, '#ffe27a');
}
function drawRock(g, x, y, s) {
  pixelEllipse(g, x + s / 2 + 1, y + s + 1, s, 2, 'rgba(35,55,28,.18)');
  pixelRound(g, x, y, s * 2, s + 3, 2, '#7f7f78');
  pixelRound(g, x + 1, y + 1, s * 2 - 2, s, 2, '#a3a29a');
  box(g, x + 2, y + 2, Math.max(1, s - 2), 1, '#c2c1b7');
  pix(g, x + s + 2, y + s - 1, '#6e6d66');
}
function drawPath(g) {
  const rnd = mulberry32(77);
  pixelRound(g, 46, 86, 26, 102, 8, '#a97a4b');
  pixelRound(g, 48, 88, 22, 98, 7, '#c99a63');
  pixelRound(g, 44, 162, 168, 26, 9, '#a97a4b');
  pixelRound(g, 46, 164, 164, 22, 8, '#c99a63');
  for (let i = 0; i < 90; i++) {
    const x = 48 + Math.floor(rnd() * 160);
    const y = 164 + Math.floor(rnd() * 22);
    if (x < 70 && y > 90) continue;
    pix(g, x, y, rnd() < 0.5 ? '#b3854e' : '#d9b37b');
  }
  for (let i = 0; i < 40; i++) {
    const x = 49 + Math.floor(rnd() * 20);
    const y = 90 + Math.floor(rnd() * 74);
    pix(g, x, y, rnd() < 0.5 ? '#b3854e' : '#dcb982');
  }
}
function drawPond(g) {
  pixelRound(g, 16, 182, 96, 52, 12, '#2e5a45');
  pixelRound(g, 18, 184, 92, 48, 11, '#3d7f61');
  pixelRound(g, 20, 186, 88, 44, 10, '#58a9cf');
  box(g, 25, 188, 78, 6, '#70c1e2');
  box(g, 24, 216, 80, 10, '#4a95bd');
  pix(g, 30, 190, '#a3e2f5'); pix(g, 31, 190, '#a3e2f5'); pix(g, 32, 190, '#a3e2f5');
  // кувшинки
  pixelRound(g, 32, 204, 10, 5, 2, '#4f9b48');
  box(g, 34, 205, 4, 1, '#6fbd58');
  pix(g, 36, 203, '#f7a9c1'); pix(g, 37, 202, '#ffd7e4');
  pixelRound(g, 72, 220, 9, 5, 2, '#4a9244');
  pix(g, 76, 218, '#ffe27a');
  // камыши
  for (const [rx, h] of [[23, 15], [27, 11], [98, 14], [102, 9]]) {
    box(g, rx, 204 - h, 1, h, '#3f7f37');
    if (h > 12) { box(g, rx - 1, 203 - h, 3, 4, '#7a4d2b'); box(g, rx, 202 - h, 1, 1, '#a36b3c'); }
  }
  pix(g, 43, 199, '#8fd06a'); pix(g, 88, 213, '#8fd06a');
}
function drawFence(g) {
  const light = '#dfc08a', mid = '#b58a55', dark = '#6b4a2b';
  const railH = (x1, x2, y) => {
    box(g, x1, y, x2 - x1, 2, light);
    box(g, x1, y + 2, x2 - x1, 1, mid);
    box(g, x1, y + 3, x2 - x1, 1, 'rgba(70,45,22,.25)');
  };
  const post = (x, y) => {
    box(g, x, y, 5, 11, dark);
    box(g, x + 1, y + 1, 3, 9, light);
    box(g, x + 1, y + 3, 3, 1, mid);
    pix(g, x + 2, y, light);
  };
  // верх
  railH(120, 281, 68);
  railH(120, 281, 74);
  // низ с проходом
  railH(120, 177, 168);
  railH(208, 281, 168);
  railH(120, 177, 174);
  railH(208, 281, 174);
  // бока
  box(g, 120, 64, 2, 112, light);
  box(g, 123, 64, 1, 112, mid);
  box(g, 278, 64, 2, 112, light);
  box(g, 281, 64, 1, 112, mid);
  for (let x = 120; x <= 280; x += 20) {
    post(x, 68);
    if (x < 177 || x > 208) post(x, 166);
  }
  for (let y = 64; y <= 168; y += 21) {
    post(118, y);
    post(276, y);
  }
  // столбы у входа
  box(g, 174, 160, 5, 18, dark); box(g, 175, 161, 3, 16, light);
  box(g, 205, 160, 5, 18, dark); box(g, 206, 161, 3, 16, light);
  pix(g, 176, 160, '#f0d79f'); pix(g, 207, 160, '#f0d79f');
}
function drawWindow(g, x, y) {
  box(g, x - 2, y - 2, 18, 15, '#5e3b22');
  box(g, x - 1, y - 1, 16, 13, '#a87845');
  box(g, x, y, 14, 11, '#9bd4e8');
  box(g, x + 1, y + 1, 5, 3, '#d6f2fa');
  box(g, x + 6, y, 2, 11, '#8b5a35');
  box(g, x, y + 5, 14, 2, '#8b5a35');
  box(g, x - 2, y + 11, 18, 3, '#b07a4a');
  pix(g, x - 2, y + 11, '#e0b87a');
}
function drawHouse(g) {
  // тень
  pixelEllipse(g, 61, 91, 47, 5, 'rgba(35,72,28,.22)');
  // труба
  box(g, 82, 2, 10, 20, '#8f5140');
  box(g, 80, 1, 14, 3, '#5f3328');
  box(g, 83, 4, 2, 2, '#b46a52'); box(g, 88, 9, 2, 2, '#b46a52');
  // крыша
  for (let i = 0; i < 16; i++) {
    const yy = 14 + i * 2;
    const half = Math.min(46, 8 + i * 2.7);
    const c = i % 4 === 0 ? '#9c3f33' : i % 4 === 2 ? '#bf5645' : '#b24a3c';
    box(g, 60 - half, yy, half * 2, 2, c);
    if (i % 2 === 0) {
      for (let k = -half + 6; k < half; k += 12) pix(g, 60 + k, yy + 1, '#d06a55');
    }
  }
  box(g, 14, 42, 92, 4, '#7d332a');
  box(g, 16, 44, 88, 2, '#d9a24f');
  // стена
  box(g, 18, 46, 84, 42, '#f0d6a4');
  box(g, 19, 47, 82, 2, '#f9e6bf');
  // деревянные стойки
  box(g, 18, 46, 3, 42, '#9a683d');
  box(g, 99, 46, 3, 42, '#9a683d');
  box(g, 18, 64, 84, 2, '#d9b883');
  box(g, 20, 46, 1, 42, '#c89b64');
  // фундамент
  box(g, 16, 84, 88, 6, '#8f8a7e');
  box(g, 16, 88, 88, 2, '#6f6a60');
  for (let x = 20; x < 100; x += 12) pix(g, x, 86, '#b7b2a6');
  // окна
  drawWindow(g, 28, 52);
  drawWindow(g, 78, 52);
  // клумбы под окнами
  box(g, 25, 66, 18, 4, '#6b4526');
  box(g, 26, 66, 16, 1, '#8a5a35');
  pix(g, 28, 65, '#d9564a'); pix(g, 31, 64, '#ffd35a'); pix(g, 35, 65, '#ff9eb5'); pix(g, 39, 65, '#d9564a');
  box(g, 76, 66, 18, 4, '#6b4526');
  pix(g, 79, 65, '#ffd35a'); pix(g, 83, 65, '#d9564a'); pix(g, 87, 64, '#ff9eb5'); pix(g, 91, 65, '#ffd35a');
  // дверь
  box(g, 49, 57, 22, 31, '#5e3b22');
  box(g, 51, 59, 18, 29, '#8b5a35');
  box(g, 53, 61, 14, 11, '#9c6a40');
  box(g, 53, 74, 14, 11, '#9c6a40');
  box(g, 59, 61, 2, 24, '#7a4a2a');
  pix(g, 65, 72, '#ffd45f'); pix(g, 66, 72, '#c99b3f');
  box(g, 47, 88, 26, 3, '#b0a99a');
  box(g, 47, 89, 26, 1, '#8f8a7e');
  // сердце над дверью
  pix(g, 59, 50, '#e05c4c'); pix(g, 61, 50, '#e05c4c'); pix(g, 60, 51, '#e05c4c');
  pix(g, 60, 52, '#e05c4c'); pix(g, 59, 49, '#f48b78'); pix(g, 62, 51, '#f48b78');
}
function drawCoop(g) {
  pixelEllipse(g, 342, 69, 38, 5, 'rgba(35,72,28,.20)');
  // стена
  box(g, 306, 32, 66, 34, '#b06a45');
  box(g, 308, 34, 62, 30, '#c57e54');
  for (let x = 312; x < 370; x += 10) box(g, x, 34, 2, 30, '#9c5a38');
  box(g, 306, 34, 66, 2, '#d99a6b');
  box(g, 306, 62, 66, 4, '#84512f');
  // крыша
  for (let i = 0; i < 9; i++) {
    const y = 18 + i * 2;
    const half = Math.min(42, 16 + i * 3);
    box(g, 342 - half, y, half * 2, 2, i % 3 === 0 ? '#6b4127' : i % 3 === 1 ? '#83522f' : '#744627');
  }
  box(g, 300, 34, 86, 3, '#4e2f1b');
  // окно-чердак
  box(g, 336, 24, 12, 8, '#4e2f1b');
  box(g, 337, 25, 10, 6, '#ffd777');
  box(g, 341, 25, 1, 6, '#8a5a35');
  // лаз
  box(g, 333, 45, 18, 18, '#4e2f1b');
  box(g, 335, 47, 14, 16, '#3a2113');
  box(g, 337, 49, 10, 11, '#24140b');
  // пандус
  box(g, 331, 63, 22, 3, '#8a5a35');
  box(g, 329, 66, 26, 3, '#a06b3e');
  box(g, 327, 69, 30, 2, '#b9834b');
  // насест и солома
  box(g, 310, 58, 26, 2, '#e0b56a');
  box(g, 311, 56, 24, 1, '#f0d79f');
  for (let i = 0; i < 9; i++) {
    const x = 308 + i * 7, y = 64 + (i % 3);
    box(g, x, y, 1, 3, i % 2 ? '#d9a64f' : '#e8be6b');
    pix(g, x + 1, y + 2, '#c39443');
  }
  // мини-яйцо на стене
  pix(g, 360, 42, '#f7f1e1'); pix(g, 361, 42, '#f7f1e1'); pix(g, 360, 43, '#d8d0bd');
}
function drawWell(g) {
  pixelEllipse(g, 299, 109, 19, 4, 'rgba(35,72,28,.2)');
  // столбы
  box(g, 284, 74, 3, 24, '#6b4526');
  box(g, 311, 74, 3, 24, '#6b4526');
  // крыша
  for (let i = 0; i < 4; i++) box(g, 280 + i * 2, 68 + i * 2, 38 - i * 4, 2, '#8f5140');
  box(g, 282, 76, 34, 2, '#6b4127');
  // сруб
  pixelRound(g, 284, 92, 30, 16, 4, '#7d7a70');
  pixelRound(g, 285, 93, 28, 14, 3, '#a3a096');
  box(g, 288, 94, 6, 3, '#c2beb2'); box(g, 302, 100, 5, 3, '#c2beb2');
  box(g, 289, 92, 20, 2, '#5f5c54');
  box(g, 290, 93, 18, 2, '#3e7f9e');
  pix(g, 294, 93, '#8fd0e8'); pix(g, 300, 93, '#8fd0e8');
  // ведро
  box(g, 297, 88, 1, 5, '#4e2f1b');
  box(g, 295, 92, 5, 4, '#7a7a72');
  box(g, 296, 93, 3, 2, '#9e9e94');
  pix(g, 296, 92, '#4e2f1b');
  // мох
  pix(g, 287, 104, '#6fae50'); pix(g, 309, 98, '#6fae50'); pix(g, 306, 106, '#5c9e46');
}

function buildBackground() {
  const g = bgx;
  g.imageSmoothingEnabled = false;
  box(g, 0, 0, VW, VH, '#7cc35b');
  const rnd = mulberry32(20260417);
  const grassTones = ['#73b952', '#87cc63', '#6cae4d', '#8fd06a', '#79bb56'];
  for (let i = 0; i < 2400; i++) {
    const x = Math.floor(rnd() * VW), y = Math.floor(rnd() * VH);
    pix(g, x, y, grassTones[Math.floor(rnd() * grassTones.length)]);
  }
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rnd() * VW), y = Math.floor(rnd() * VH);
    const c = rnd() < 0.5 ? '#5e9c43' : '#94d371';
    box(g, x, y, 1, 2 + Math.floor(rnd() * 2), c);
    pix(g, x + 1, y + 1, c);
  }
  for (let i = 0; i < 24; i++) {
    const x = 8 + Math.floor(rnd() * (VW - 16));
    const y = 8 + Math.floor(rnd() * (VH - 16));
    drawFlower(g, x, y, ['#ffe27a', '#ff9eb5', '#c7b5ff', '#fff3c4'][Math.floor(rnd() * 4)]);
  }
  drawPath(g);
  drawPond(g);
  // основа под грядками
  box(g, FARM_X - 5, FARM_Y - 5, FARM_COLS * TS + 10, FARM_ROWS * TS + 10, '#5d412a');
  box(g, FARM_X - 4, FARM_Y - 4, FARM_COLS * TS + 8, FARM_ROWS * TS + 8, '#6c4c31');
  // цветы у забора
  drawFlower(g, 112, 56, '#ffd35a');
  drawFlower(g, 116, 60, '#ff9eb5');
  drawFlower(g, 287, 170, '#fff3c4');
  drawFence(g);
  drawHouse(g);
  drawCoop(g);
  drawWell(g);
  // деревья
  drawTree(g, 10, 100, 11, false);
  drawTree(g, 8, 152, 9, true);
  drawTree(g, 112, 42, 7, false);
  drawTree(g, 196, 13, 10, false);
  drawTree(g, 238, 7, 8, true);
  drawTree(g, 286, 26, 10, false);
  drawTree(g, 302, 140, 12, false);
  drawTree(g, 346, 154, 9, true);
  drawTree(g, 375, 188, 10, false);
  drawTree(g, 252, 212, 9, false);
  drawTree(g, 206, 220, 7, true);
  drawTree(g, 120, 224, 8, false);
  // кусты и камни
  drawBush(g, 114, 136, 5);
  drawBush(g, 290, 198, 5);
  drawBush(g, 162, 222, 4);
  drawBush(g, 364, 130, 4);
  drawRock(g, 110, 108, 4);
  drawRock(g, 290, 122, 3);
  drawRock(g, 360, 104, 4);
  drawRock(g, 152, 214, 3);
  drawRock(g, 180, 230, 4);
  // маленькие грибы у дома
  for (const [mx, my] of [[14, 76], [101, 80], [108, 64]]) {
    box(g, mx, my, 1, 2, '#f2e2c4');
    box(g, mx - 1, my - 1, 3, 1, '#d9564a');
    pix(g, mx, my - 1, '#fff3c4');
  }
}

function buildPlotDetail() {
  plotDetail.length = 0;
  for (let i = 0; i < PLOTS; i++) {
    const rnd = mulberry32(9000 + i * 131);
    const specs = [], tufts = [];
    for (let j = 0; j < 8; j++) specs.push({ x: 2 + Math.floor(rnd() * 12), y: 2 + Math.floor(rnd() * 12), l: rnd() < 0.4 });
    for (let j = 0; j < 4; j++) tufts.push({ x: 2 + Math.floor(rnd() * 12), y: 4 + Math.floor(rnd() * 8), h: 2 + Math.floor(rnd() * 3) });
    plotDetail.push({ specs, tufts });
  }
}

/* =====================================================================
   РАСТЕНИЯ
   ===================================================================== */
function drawCrop(g, x, y, id, stage, t, seed) {
  const cx = x + 8, baseY = y + 15;
  const sway = stage >= 2 ? Math.round(Math.sin(t * 2.2 + seed * 1.7) * 0.7) : 0;
  if (id === 'wheat') {
    if (stage === 0) {
      for (const dx of [-3, 0, 3]) {
        box(g, cx + dx, baseY - 2, 1, 2, '#3f8c35');
        pix(g, cx + dx, baseY - 3, '#6fc04d');
      }
    } else {
      const h = stage === 1 ? 5 : stage === 2 ? 7 : 9;
      for (let k = -1; k <= 1; k++) {
        const sx = cx + k * 3 + sway;
        box(g, sx, baseY - h, 1, h, stage === 3 ? '#b99438' : '#5aa53f');
        box(g, sx - 1, baseY - h + 2, 1, 2, stage === 3 ? '#d6ae48' : '#79bd58');
        if (stage >= 2) {
          const head = stage === 2 ? '#bfcc6d' : '#e7c25a';
          box(g, sx - 1, baseY - h - 2, 3, 3, head);
          if (stage === 3) {
            pix(g, sx - 1, baseY - h - 3, '#f6dc8a');
            pix(g, sx + 1, baseY - h - 3, '#c99b3f');
            pix(g, sx, baseY - h - 3, '#f6dc8a');
          }
        }
      }
    }
  } else if (id === 'carrot') {
    if (stage === 0) {
      for (const dx of [-2, 0, 2]) { box(g, cx + dx, baseY - 3, 1, 3, '#5aa53f'); pix(g, cx + dx, baseY - 4, '#82c95e'); }
    } else {
      const blades = stage === 1 ? 3 : 5;
      const h = stage === 1 ? 4 : stage === 2 ? 6 : 7;
      for (let i = 0; i < blades; i++) {
        const dx = (i - (blades - 1) / 2) * 2;
        const hh = h - Math.abs(dx) * 0.3;
        box(g, cx + dx + sway, baseY - hh, 1, hh, i % 2 ? '#4f9b3a' : '#6fbe4e');
        pix(g, cx + dx + sway, baseY - hh - 1, '#8fd06a');
      }
      if (stage === 3) {
        box(g, cx - 2, baseY - 2, 4, 2, '#ef8a3c');
        pix(g, cx - 3, baseY - 1, '#f8a45e');
        pix(g, cx - 2, baseY - 2, '#ffbe7a');
        pix(g, cx - 1, baseY - 2, '#d9762c');
      }
    }
  } else if (id === 'corn') {
    if (stage === 0) {
      for (const dx of [-2, 1]) { box(g, cx + dx, baseY - 3, 1, 3, '#4f9b3a'); pix(g, cx + dx, baseY - 4, '#7cc75a'); }
    } else {
      const h = stage === 1 ? 6 : stage === 2 ? 9 : 11;
      box(g, cx + sway, baseY - h, 2, h, stage === 3 ? '#4f9136' : '#5aa53f');
      box(g, cx + sway, baseY - h, 1, h, '#79bd58');
      box(g, cx - 3 + sway, baseY - h + 3, 3, 1, '#6fbe4e');
      pix(g, cx - 4 + sway, baseY - h + 2, '#82c95e');
      box(g, cx + 2 + sway, baseY - h + 5, 3, 1, '#6fbe4e');
      pix(g, cx + 4 + sway, baseY - h + 4, '#82c95e');
      if (stage >= 2) {
        box(g, cx + sway, baseY - h - 1, 1, 2, '#c8d06a');
        pix(g, cx - 1 + sway, baseY - h - 2, '#d6dc7e');
        pix(g, cx + 2 + sway, baseY - h - 2, '#d6dc7e');
      }
      if (stage === 3) {
        box(g, cx + 2 + sway, baseY - 7, 3, 4, '#f4d24c');
        box(g, cx + 2 + sway, baseY - 7, 1, 4, '#ffe884');
        box(g, cx + 5 + sway, baseY - 7, 1, 4, '#c9a832');
        box(g, cx + 3 + sway, baseY - 3, 2, 2, '#6fae4a');
        pix(g, cx + 4 + sway, baseY - 8, '#c9a832');
      }
    }
  } else if (id === 'pumpkin') {
    if (stage === 0) {
      box(g, cx - 1, baseY - 3, 1, 3, '#4f9b3a');
      pix(g, cx + 1, baseY - 1, '#6fbe4e');
      box(g, cx - 4, baseY - 1, 3, 1, '#5aa53f');
    } else if (stage === 1) {
      box(g, cx - 5, baseY - 2, 10, 1, '#4f9b3a');
      box(g, cx - 5, baseY - 4, 1, 2, '#5aa53f');
      pix(g, cx - 6, baseY - 5, '#6fbe4e');
      box(g, cx + 4, baseY - 4, 1, 2, '#5aa53f');
      pix(g, cx + 5, baseY - 5, '#6fbe4e');
      pix(g, cx + 2, baseY - 3, '#8fd06a');
    } else if (stage === 2) {
      box(g, cx - 6, baseY - 2, 12, 1, '#4f9b3a');
      pixelRound(g, cx - 3, baseY - 5, 6, 5, 1, '#5d9e45');
      pixelRound(g, cx - 2, baseY - 5, 4, 4, 1, '#76b956');
      pix(g, cx - 1, baseY - 5, '#8fd06a');
      pix(g, cx - 6, baseY - 4, '#6fbe4e');
      pix(g, cx + 5, baseY - 4, '#6fbe4e');
    } else {
      box(g, cx - 6, baseY - 1, 12, 1, '#4f9b3a');
      pixelRound(g, cx - 5, baseY - 7, 10, 7, 2, '#d9762c');
      pixelRound(g, cx - 4, baseY - 7, 8, 6, 2, '#ef8a2d');
      box(g, cx - 3, baseY - 6, 1, 5, '#d9762c');
      box(g, cx + 1, baseY - 6, 1, 5, '#d9762c');
      box(g, cx - 2, baseY - 7, 2, 2, '#4f9b3a');
      pix(g, cx - 4, baseY - 6, '#f8a45e');
      pix(g, cx + 2, baseY - 3, '#c9661f');
      pix(g, cx - 5, baseY - 3, '#c9661f');
    }
  } else if (id === 'strawberry') {
    if (stage === 0) {
      box(g, cx, baseY - 3, 1, 3, '#4f9b3a');
      pix(g, cx - 1, baseY - 3, '#6fbe4e'); pix(g, cx + 1, baseY - 3, '#6fbe4e');
    } else {
      const r = stage === 1 ? 4 : stage === 2 ? 5 : 6;
      pixelRound(g, cx - r, baseY - 5, r * 2, 5, 2, '#3f7f35');
      pixelRound(g, cx - r + 1, baseY - 5, r * 2 - 2, 4, 2, '#5aa53f');
      pix(g, cx - 2, baseY - 5, '#7cc75a'); pix(g, cx + 2, baseY - 4, '#7cc75a');
      if (stage === 2) {
        for (const dx of [-3, 1]) { pix(g, cx + dx, baseY - 6, '#fff3e0'); pix(g, cx + dx, baseY - 7, '#ffffff'); }
        pix(g, cx - 1, baseY - 5, '#ffe27a');
      }
      if (stage === 3) {
        for (const [dx, dy] of [[-4, -2], [-1, -3], [2, -2]]) {
          box(g, cx + dx, baseY + dy, 2, 2, '#d94b3f');
          pix(g, cx + dx, baseY + dy - 1, '#4f9b3a');
          pix(g, cx + dx + 1, baseY + dy, '#ff8a7a');
          pix(g, cx + dx, baseY + dy, '#fff3e0');
        }
      }
    }
  } else if (id === 'sunflower') {
    if (stage === 0) {
      box(g, cx, baseY - 2, 1, 2, '#4f9b3a');
      pix(g, cx - 1, baseY - 3, '#6fbe4e'); pix(g, cx + 1, baseY - 3, '#6fbe4e');
    } else {
      const h = stage === 1 ? 5 : stage === 2 ? 8 : 10;
      box(g, cx + sway, baseY - h, 1, h, '#4f9136');
      box(g, cx - 2 + sway, baseY - Math.floor(h / 2), 2, 1, '#5aa53f');
      box(g, cx + 1 + sway, baseY - Math.floor(h / 2) - 2, 2, 1, '#5aa53f');
      pix(g, cx - 3 + sway, baseY - Math.floor(h / 2) - 1, '#6fbe4e');
      pix(g, cx + 3 + sway, baseY - Math.floor(h / 2) - 3, '#6fbe4e');
      if (stage === 2) {
        pixelCircle(g, cx + sway, baseY - h - 1, 2, '#6fae45');
        pix(g, cx + sway, baseY - h - 2, '#93c967');
      }
      if (stage === 3) {
        const hy = baseY - h - 1;
        box(g, cx - 4 + sway, hy - 1, 9, 3, '#ffd34d');
        box(g, cx - 1 + sway, hy - 4, 3, 9, '#ffd34d');
        for (const [dx, dy] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [-3, -4], [3, -4], [-3, 4], [3, 4]]) {
          pix(g, cx + dx + sway, hy + dy, '#f7c23e');
        }
        box(g, cx - 2 + sway, hy - 2, 5, 5, '#6b4226');
        pix(g, cx - 1 + sway, hy - 1, '#8a5a35');
        pix(g, cx + 1 + sway, hy + 1, '#4f2f1b');
      }
    }
  }
}

/* =====================================================================
   ГРЯДКИ
   ===================================================================== */
function drawPlot(g, p, i, t) {
  const { x, y, c, r } = plotRect(i);
  if (!p.tilled) {
    const base = (c * 3 + r * 5) % 2 ? '#68a449' : '#6cab4d';
    box(g, x, y, 16, 16, base);
    box(g, x, y, 16, 1, '#5a9440');
    box(g, x, y + 15, 16, 1, '#5a9440');
    box(g, x, y, 1, 16, '#5a9440');
    box(g, x + 15, y, 1, 16, '#5a9440');
    const det = plotDetail[i];
    if (det) {
      const patches = det.specs.slice(0, 3);
      for (const s of patches) {
        box(g, x + s.x - 1, y + s.y, 3, 2, '#8a6841');
        pix(g, x + s.x, y + s.y, '#a37d4e');
        pix(g, x + s.x + 1, y + s.y + 1, '#6f4f2f');
      }
      for (const tuft of det.tufts) {
        box(g, x + tuft.x, y + tuft.y - 1, 1, tuft.h + 1, '#4a8536');
        pix(g, x + tuft.x, y + tuft.y - 2, '#7cc45a');
        pix(g, x + tuft.x - 1, y + tuft.y + 1, '#5f9f43');
        pix(g, x + tuft.x + 1, y + tuft.y + 2, '#5f9f43');
      }
    }
    if (i % 7 === 3) drawFlower(g, x + 10, y + 8, '#ffe27a');
    if (i % 13 === 8) { box(g, x + 4, y + 11, 2, 1, '#8f8f86'); pix(g, x + 4, y + 10, '#b0b0a6'); }
    if (i % 11 === 5) pix(g, x + 4, y + 6, '#fff3c4');
  } else {
    const wet = !!(p.crop && p.crop.watered);
    box(g, x, y, 16, 16, wet ? '#5c3d26' : '#8a5b39');
    box(g, x, y, 16, 2, wet ? '#472d1c' : '#6f472c');
    box(g, x, y + 15, 16, 1, wet ? '#472d1c' : '#6f472c');
    box(g, x, y, 1, 16, wet ? '#503320' : '#774c2e');
    box(g, x + 15, y, 1, 16, wet ? '#503320' : '#774c2e');
    const det = plotDetail[i];
    if (det) {
      for (const s of det.specs) {
        pix(g, x + s.x, y + s.y, wet ? (s.l ? '#6b4a2e' : '#4e3420') : (s.l ? '#a3714b' : '#774b2d'));
      }
    }
    if (wet) {
      pix(g, x + 4, y + 5, 'rgba(150,215,240,.28)');
      pix(g, x + 5, y + 5, 'rgba(150,215,240,.16)');
      pix(g, x + 10, y + 11, 'rgba(150,215,240,.18)');
    }
    if (p.crop) {
      const def = CROPS[p.crop.id];
      const ratio = clamp(p.crop.growth / def.grow, 0, 1);
      const stage = ratio >= 1 ? 3 : ratio >= 0.62 ? 2 : ratio >= 0.28 ? 1 : 0;
      if (ratio >= 1) pixelEllipse(g, x + 8, y + 9, 7, 5, 'rgba(255,220,100,.10)');
      drawCrop(g, x, y, p.crop.id, stage, t, i);
      if (ratio < 1) {
        box(g, x + 2, y + 1, 9, 2, 'rgba(35,20,10,.55)');
        box(g, x + 2, y + 1, Math.max(1, Math.round(9 * ratio)), 1, ratio > 0.8 ? '#ffd45f' : '#8fdd62');
      }
      if (ratio >= 1) {
        const sp = 0.55 + 0.45 * Math.sin(t * 4 + i);
        ctx.globalAlpha = sp;
        pix(g, x + 12, y + 2, '#fff3b0');
        pix(g, x + 13, y + 1, '#ffe27a');
        pix(g, x + 14, y + 2, '#fff3b0');
        pix(g, x + 13, y + 2, '#fffbe6');
        ctx.globalAlpha = 1;
      }
    }
  }
}

function drawPondAnimation(t) {
  const g = ctx;
  for (let i = 0; i < 3; i++) {
    const x = 28 + ((t * 7 + i * 27) % 58);
    const y = 196 + i * 10;
    ctx.globalAlpha = 0.22 + 0.12 * Math.sin(t * 2 + i);
    box(g, x, y, 7, 1, '#d7f3ff');
    box(g, x + 2, y + 1, 4, 1, '#a9e2f7');
    ctx.globalAlpha = 1;
  }
  const fx1 = 44 + Math.sin(t * 0.8) * 2;
  pix(g, fx1, 202, '#ffd7e4');
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2.4);
  pix(g, fx1 + 1, 201, '#fff0f6');
  ctx.globalAlpha = 1;
}

/* =====================================================================
   ЖИВОТНЫЕ, ЯЙЦА, ПРИРОДА
   ===================================================================== */
function makeChicken() {
  return {
    x: 300 + Math.random() * 70, y: 78 + Math.random() * 44,
    tx: 300 + Math.random() * 70, ty: 78 + Math.random() * 44,
    wait: Math.random() * 3, dir: 1
  };
}
function initChickens() {
  chickens.length = 0;
  for (let i = 0; i < chickensCount(); i++) {
    const c = makeChicken();
    c.x = 304 + (i * 23) % 70;
    c.y = 84 + (i * 17) % 40;
    chickens.push(c);
  }
}
function updateChickens(dt) {
  while (chickens.length < chickensCount()) chickens.push(makeChicken());
  for (let i = 0; i < chickens.length; i++) {
    if (i >= chickensCount()) continue;
    const c = chickens[i];
    if (c.wait > 0) { c.wait -= dt; continue; }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d < 2) {
      c.wait = 1.2 + Math.random() * 4;
      c.tx = 298 + Math.random() * 78;
      c.ty = 76 + Math.random() * 50;
      continue;
    }
    const sp = 7.5;
    c.x += dx / d * sp * dt;
    c.y += dy / d * sp * dt;
    c.dir = dx >= 0 ? 1 : -1;
  }
}
function drawChicken(g, x, y, t, dir) {
  const bob = Math.round(Math.sin(t * 7 + x * 0.4) * 0.8);
  y += bob;
  box(g, x + 2, y + 5, 1, 2, '#e8a03c');
  box(g, x + 5, y + 5, 1, 2, '#e8a03c');
  box(g, x + 1, y + 2, 6, 4, '#f7f3e6');
  box(g, x, y + 3, 7, 2, '#f7f3e6');
  box(g, x + 1, y + 5, 5, 1, '#d9d2bf');
  box(g, x + 2, y + 3, 3, 2, '#e7dfcc');
  const hx = dir > 0 ? x + 6 : x - 2;
  box(g, hx, y + 1, 3, 3, '#f7f3e6');
  box(g, hx + 1, y, 1, 1, '#d9564a');
  box(g, hx + 2, y, 1, 1, '#d9564a');
  box(g, dir > 0 ? hx + 3 : hx - 1, y + 2, 1, 1, '#f0a232');
  pix(g, dir > 0 ? hx + 2 : hx, y + 2, '#332218');
  box(g, dir > 0 ? x - 1 : x + 6, y + 2, 2, 2, '#e6dfcc');
  pix(g, dir > 0 ? x - 1 : x + 7, y + 1, '#f7f3e6');
}
function drawChickens(t) {
  const g = ctx;
  for (let i = 0; i < chickens.length && i < chickensCount(); i++) {
    const c = chickens[i];
    drawChicken(g, c.x, c.y, t, c.dir);
  }
}
function drawEggs(t) {
  if (!state.eggs) return;
  const g = ctx;
  const n = Math.min(3, state.eggs);
  for (let i = 0; i < n; i++) {
    const x = 333 + i * 7;
    const y = 67 - (i % 2) + Math.round(Math.sin(t * 3 + i) * 0.5);
    box(g, x, y, 3, 4, '#e8e0cc');
    box(g, x + 1, y + 1, 1, 2, '#fffdf5');
    pix(g, x, y, '#c9c0aa');
    pix(g, x + 2, y + 3, '#c9c0aa');
  }
}

const butterflies = [
  { bx: 60, by: 120, p: 0.3, sp: 0.7, c: '#ffe28a' },
  { bx: 220, by: 48, p: 2.1, sp: 0.55, c: '#ffb3c9' },
  { bx: 330, by: 180, p: 4.2, sp: 0.8, c: '#b8e2ff' },
  { bx: 160, by: 200, p: 1.2, sp: 0.6, c: '#fff3c4' }
];
const fireflies = Array.from({ length: 12 }, (_, i) => {
  const r = mulberry32(300 + i * 17);
  return { bx: 20 + r() * 360, by: 90 + r() * 130, p: r() * 9, sp: 0.4 + r() * 0.7 };
});
const rainDrops = Array.from({ length: 85 }, (_, i) => {
  const r = mulberry32(600 + i * 31);
  return { x: r() * (VW + 40), off: r() * (VH + 30), speed: 120 + r() * 110, len: 3 + Math.floor(r() * 3) };
});
const leaves = Array.from({ length: 18 }, (_, i) => {
  const r = mulberry32(1200 + i * 41);
  return { y: r() * VH, off: r() * VW, speed: 20 + r() * 30, size: 1 + Math.floor(r() * 2), col: r() < 0.5 ? '#a7cf5a' : '#e0b64f' };
});

function drawButterflies(t) {
  if (state.weather === 'rain') return;
  const g = ctx;
  for (let i = 0; i < butterflies.length; i++) {
    const b = butterflies[i];
    const x = b.bx + Math.sin(t * b.sp + b.p) * 16;
    const y = b.by + Math.cos(t * b.sp * 1.3 + b.p) * 8;
    const flap = Math.sin(t * 14 + b.p) > 0 ? 1 : 0;
    pix(g, x - 1, y - flap, b.c);
    pix(g, x + 1, y - flap, b.c);
    pix(g, x - 2, y + 1, b.c);
    pix(g, x + 2, y + 1, b.c);
    pix(g, x, y, '#5e3b22');
  }
}
function drawWeather(t) {
  const g = ctx;
  if (state.weather === 'cloudy' || state.weather === 'rain') {
    for (let i = 0; i < 3; i++) {
      const x = ((t * 5 + i * 150) % (VW + 160)) - 80;
      pixelEllipse(g, x, 40 + i * 62, 46, 16, 'rgba(40,80,60,.075)');
      pixelEllipse(g, x + 40, 48 + i * 62, 30, 12, 'rgba(40,80,60,.05)');
    }
  }
  if (state.weather === 'rain') {
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < rainDrops.length; i++) {
      const d = rainDrops[i];
      const y = ((d.off + t * d.speed) % (VH + 30)) - 15;
      const x = d.x + y * 0.12;
      box(g, x, y, 1, d.len, '#bfe8ff');
    }
    ctx.globalAlpha = 1;
    box(g, 0, 0, VW, VH, 'rgba(40,70,110,.08)');
  } else if (state.weather === 'heat') {
    for (let i = 0; i < 4; i++) {
      const y = 150 + i * 18 + Math.sin(t * 1.5 + i) * 2;
      const x = (t * 6 + i * 90) % (VW + 80) - 40;
      ctx.globalAlpha = 0.10;
      box(g, x, y, 40, 1, '#fff3c4');
      ctx.globalAlpha = 1;
    }
    box(g, 0, 0, VW, VH, 'rgba(255,170,60,.05)');
  } else if (state.weather === 'windy') {
    for (let i = 0; i < leaves.length; i++) {
      const l = leaves[i];
      const x = ((l.off + t * l.speed) % (VW + 40)) - 20;
      const y = l.y + Math.sin(t * 1.8 + i) * 12;
      box(g, x, y, l.size + 1, l.size, l.col);
      pix(g, x + 1, y - 1, '#d4e88f');
    }
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 3; i++) {
      const y = 80 + i * 52;
      const x = (t * 40 + i * 130) % (VW + 100) - 50;
      box(g, x, y, 22, 1, '#e8f7d4');
    }
    ctx.globalAlpha = 1;
  } else if (state.weather === 'sunny') {
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 14; i++) {
      const x = (i * 53 + Math.sin(t * 0.5 + i) * 10) % VW;
      const y = (i * 31 + t * 4) % VH;
      pix(g, x, y, '#fff3c4');
    }
    ctx.globalAlpha = 1;
  }
}
function lightingInfo() {
  const m = state.minutes;
  if (m < 420) return { c: [255, 150, 80], a: 0.18 * (1 - (m - 360) / 60) };
  if (m < 1080) return { c: [0, 0, 0], a: 0 };
  if (m < 1200) return { c: [255, 140, 70], a: 0.15 * (m - 1080) / 120 };
  return { c: [20, 34, 84], a: Math.min(0.58, 0.16 + (m - 1200) / 240 * 0.42) };
}
function drawLighting() {
  const g = ctx;
  const li = lightingInfo();
  if (li.a > 0) box(g, 0, 0, VW, VH, 'rgba(' + li.c.join(',') + ',' + li.a.toFixed(3) + ')');
}
function drawNightGlow(t) {
  const g = ctx;
  const m = state.minutes;
  const night = m >= 1200 ? clamp((m - 1200) / 240, 0, 1) : 0;
  if (night > 0.08) {
    const glow = clamp(night * 1.2, 0, 0.9);
    g.fillStyle = 'rgba(255,190,90,' + (glow * 0.12).toFixed(3) + ')';
    g.fillRect(18, 44, 30, 28);
    g.fillRect(68, 44, 30, 28);
    g.fillStyle = 'rgba(255,198,98,' + (glow * 0.85).toFixed(3) + ')';
    g.fillRect(29, 53, 12, 9);
    g.fillRect(79, 53, 12, 9);
    g.fillStyle = 'rgba(60,34,16,.9)';
    g.fillRect(34, 53, 2, 9); g.fillRect(29, 57, 12, 1);
    g.fillRect(84, 53, 2, 9); g.fillRect(79, 57, 12, 1);
    g.fillStyle = 'rgba(255,190,90,.10)';
    g.fillRect(300, 26, 80, 42);
  }
  if (night > 0.15) {
    for (let i = 0; i < fireflies.length; i++) {
      const f = fireflies[i];
      const x = f.bx + Math.sin(t * f.sp + f.p) * 14;
      const y = f.by + Math.cos(t * f.sp * 0.8 + f.p) * 10;
      const glow = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.6 + f.p));
      ctx.globalAlpha = glow * clamp(night * 1.6, 0, 1);
      pix(g, x, y, '#ffe27a');
      ctx.globalAlpha = glow * 0.25;
      box(g, x - 1, y - 1, 3, 3, '#ffd45f');
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------------------------------------------------------
   Эффекты и подсказка
   --------------------------------------------------------------- */
function spawnBurst(x, y, colors, n, power) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (0.4 + Math.random()) * (power || 30);
    fx.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 10,
      life: 0.5 + Math.random() * 0.5,
      max: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() < 0.3 ? 2 : 1,
      grav: 55
    });
  }
}
function floatText(x, y, text, color) {
  ftexts.push({ x, y, text, color: color || '#fff3c4', life: 1.5, max: 1.5 });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.life -= dt;
    if (p.life <= 0) { fx.splice(i, 1); continue; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = ftexts.length - 1; i >= 0; i--) {
    const f = ftexts[i];
    f.life -= dt;
    f.y -= 13 * dt;
    if (f.life <= 0) ftexts.splice(i, 1);
  }
}
function drawFx() {
  const g = ctx;
  for (const p of fx) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    box(g, p.x, p.y, p.size, p.size, p.color);
  }
  ctx.globalAlpha = 1;
}
function drawFloatingTexts() {
  const g = ctx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of ftexts) {
    const a = clamp(f.life / 0.5, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = 'bold 6px "Pixelify Sans", monospace';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(30,18,8,.85)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
const HIT = {
  house: { x: 14, y: 12, w: 94, h: 82 },
  pond: { x: 14, y: 182, w: 100, h: 54 },
  well: { x: 280, y: 66, w: 38, h: 48 },
  coop: { x: 298, y: 10, w: 82, h: 72 }
};
function hitTest(x, y) {
  if (x >= FARM_X && x < FARM_X + FARM_COLS * TS && y >= FARM_Y && y < FARM_Y + FARM_ROWS * TS) {
    const c = Math.floor((x - FARM_X) / TS), r = Math.floor((y - FARM_Y) / TS);
    return { type: 'plot', i: r * FARM_COLS + c };
  }
  for (const k of ['house', 'pond', 'well', 'coop']) {
    const h = HIT[k];
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return { type: k };
  }
  return null;
}
function drawHover(t) {
  if (!hover) return;
  const g = ctx;
  let r = null;
  if (hover.type === 'plot') { const q = plotRect(hover.i); r = { x: q.x, y: q.y, w: 16, h: 16 }; }
  else r = HIT[hover.type];
  if (!r) return;
  const pulse = 0.65 + 0.35 * Math.sin(t * 5);
  g.strokeStyle = 'rgba(255,244,180,' + pulse.toFixed(2) + ')';
  g.lineWidth = 1;
  g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, r.w - 1, r.h - 1);
  const len = 4;
  g.strokeStyle = 'rgba(255,255,220,' + Math.min(1, pulse + 0.2).toFixed(2) + ')';
  g.beginPath();
  g.moveTo(r.x, r.y + len); g.lineTo(r.x, r.y); g.lineTo(r.x + len, r.y);
  g.moveTo(r.x + r.w - len, r.y); g.lineTo(r.x + r.w, r.y); g.lineTo(r.x + r.w, r.y + len);
  g.moveTo(r.x, r.y + r.h - len); g.lineTo(r.x, r.y + r.h); g.lineTo(r.x + len, r.y + r.h);
  g.moveTo(r.x + r.w - len, r.y + r.h); g.lineTo(r.x + r.w, r.y + r.h); g.lineTo(r.x + r.w, r.y + r.h - len);
  g.stroke();
}

/* =====================================================================
   РЕНДЕР
   ===================================================================== */
function render(t) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, VW, VH);
  ctx.drawImage(bgCanvas, 0, 0);
  drawPondAnimation(t);
  for (let i = 0; i < PLOTS; i++) drawPlot(ctx, state.plots[i], i, t);
  drawEggs(t);
  drawChickens(t);
  drawButterflies(t);
  drawWeather(t);
  drawLighting();
  drawNightGlow(t);
  drawFx();
  drawHover(t);
  drawFloatingTexts();
}

/* =====================================================================
   МИНИ-СЦЕНА НА ЗАСТАВКЕ
   ===================================================================== */
function drawSplashArt() {
  const cv = $('splashArt');
  if (!cv) return;
  const g = cv.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.imageSmoothingEnabled = false;
  // небо
  const sky = ['#7cc4e4', '#8ed0e8', '#a5dcef', '#bfe8f3'];
  for (let i = 0; i < 4; i++) box(g, 0, i * 17, 240, 18, sky[i]);
  // солнце
  pixelEllipse(g, 198, 22, 22, 18, 'rgba(255,236,150,.20)');
  pixelCircle(g, 198, 22, 11, '#ffd45f');
  pixelCircle(g, 197, 21, 8, '#ffe884');
  for (const [dx, dy] of [[-17, 0], [17, 0], [0, -16], [0, 16], [-12, -12], [12, -12], [-12, 12], [12, 12]]) {
    box(g, 198 + dx, 22 + dy, 2, 2, '#ffe27a');
  }
  // облака
  pixelRound(g, 26, 16, 42, 12, 5, '#f4fbff');
  pixelRound(g, 38, 10, 30, 12, 5, '#ffffff');
  pixelRound(g, 128, 12, 34, 10, 4, '#f4fbff');
  pixelRound(g, 138, 7, 22, 10, 4, '#ffffff');
  // холмы
  pixelEllipse(g, 52, 70, 70, 20, '#4f8f3f');
  pixelEllipse(g, 190, 72, 82, 24, '#579a45');
  // земля
  box(g, 0, 64, 240, 56, '#7cc35b');
  box(g, 0, 64, 240, 2, '#69ad4c');
  const rnd = mulberry32(555);
  for (let i = 0; i < 320; i++) pix(g, Math.floor(rnd() * 240), 66 + Math.floor(rnd() * 54), rnd() < 0.5 ? '#6cae4d' : '#8fd06a');
  // дорожка
  pixelRound(g, 38, 86, 22, 34, 6, '#c99a63');
  pixelRound(g, 40, 88, 18, 32, 5, '#d9b078');
  // амбар
  box(g, 18, 44, 60, 46, '#b64b39');
  box(g, 20, 46, 56, 42, '#c65a45');
  for (let x = 24; x < 76; x += 12) box(g, x, 46, 2, 42, '#a33f31');
  // крыша
  for (let i = 0; i < 10; i++) {
    const half = Math.min(38, 12 + i * 2.8);
    box(g, 48 - half, 26 + i * 2, half * 2, 2, i % 3 === 0 ? '#5e3326' : i % 3 === 1 ? '#7a4431' : '#6b3a2e');
  }
  box(g, 8, 44, 80, 3, '#4e2f1b');
  // дверь и окно
  box(g, 34, 62, 20, 28, '#5e3b22');
  box(g, 36, 64, 16, 26, '#8b5a35');
  box(g, 44, 64, 2, 26, '#754a2a');
  pix(g, 48, 77, '#ffd45f');
  box(g, 62, 56, 12, 10, '#5e3b22');
  box(g, 63, 57, 10, 8, '#ffe08a');
  box(g, 67, 57, 2, 8, '#8b5a35');
  // сено
  box(g, 20, 84, 10, 5, '#e0b64f');
  pix(g, 22, 83, '#f0d27a'); pix(g, 26, 84, '#c9a03f');
  // забор
  for (let x = 84; x < 228; x += 16) {
    box(g, x, 76, 4, 12, '#8a5a35');
    box(g, x + 1, 77, 2, 10, '#e0c08a');
  }
  box(g, 84, 79, 144, 2, '#e0c08a');
  box(g, 84, 84, 144, 2, '#c9a56b');
  // грядки
  pixelRound(g, 100, 92, 120, 22, 4, '#6e4a2d');
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 8; c++) {
      const x = 104 + c * 14, y = 95 + r * 10;
      if (r === 0) {
        for (const dx of [-2, 0, 2]) {
          box(g, x + dx, y - 4, 1, 6, '#d6ae48');
          box(g, x + dx - 1, y - 6, 3, 3, '#f0d27a');
        }
      } else {
        box(g, x, y - 4, 1, 5, '#4f9b3a');
        box(g, x - 2, y - 5, 2, 2, '#6fbe4e');
        box(g, x + 2, y - 5, 2, 2, '#6fbe4e');
        box(g, x - 1, y - 1, 3, 2, '#ef8a3c');
      }
    }
  }
  // дерево
  pixelEllipse(g, 12, 106, 14, 4, 'rgba(30,60,25,.2)');
  box(g, 10, 84, 4, 22, '#7d5230');
  pixelCircle(g, 12, 76, 16, '#2f5f2b');
  pixelCircle(g, 12, 75, 14, '#4c8b3c');
  pixelCircle(g, 8, 72, 9, '#65a84e');
  pix(g, 20, 74, '#d94b3f'); pix(g, 6, 82, '#d94b3f');
  // курочка
  box(g, 88, 100, 8, 5, '#f7f3e6');
  box(g, 94, 97, 4, 4, '#f7f3e6');
  pix(g, 95, 96, '#d9564a'); pix(g, 97, 96, '#d9564a');
  pix(g, 98, 98, '#f0a232');
  pix(g, 96, 98, '#332218');
  box(g, 89, 105, 1, 2, '#e8a03c'); box(g, 94, 105, 1, 2, '#e8a03c');
  box(g, 87, 99, 2, 3, '#e6dfcc');
  // цветы
  for (let i = 0; i < 10; i++) {
    const x = 84 + Math.floor(rnd() * 140), y = 108 + Math.floor(rnd() * 9);
    if (x > 96 && x < 224 && y < 116) continue;
    drawFlower(g, x, y, ['#ffd35a', '#ff9eb5', '#fff3c4'][i % 3]);
  }
  // бабочка
  pix(g, 130, 60, '#ffe28a'); pix(g, 132, 60, '#ffe28a'); pix(g, 131, 61, '#5e3b22');
}

/* =====================================================================
   УВЕДОМЛЕНИЯ И ДИАЛОГИ
   ===================================================================== */
function toast(msg, type, ms) {
  if (!toastsEl) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'bad' ? ' bad' : type === 'good' ? ' good' : type === 'gold' ? ' gold' : '');
  el.innerHTML = msg;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms || 2800);
}
function confirmDialog(title, text, yesLabel, onYes) {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  confirmYes.textContent = yesLabel || 'Да';
  confirmCb = onYes;
  confirmWrap.classList.remove('hidden');
  confirming = true;
  playSound('click');
}
function closeConfirm() {
  confirmWrap.classList.add('hidden');
  confirming = false;
  confirmCb = null;
}

/* =====================================================================
   ПРОКАЧКА, ЗАДАНИЯ, ДОСТИЖЕНИЯ
   ===================================================================== */
function addXP(amount) {
  if (!amount) return;
  const before = level();
  state.xp += amount;
  const after = level();
  if (after > before) {
    state.energy = Math.min(maxEnergy(), state.energy + 10);
    toast(`⭐ Новый уровень: <b>${after}</b>! Максимум энергии вырос.`, 'gold', 3400);
    playSound('level');
    spawnBurst(200, 110, ['#ffe27a', '#ffd45f', '#fff3c4', '#8fdd62'], 26, 55);
    const unlocked = CROP_IDS.filter((id) => CROPS[id].level === after);
    for (const id of unlocked) setTimeout(() => toast(`🌱 Новая культура: <b>${CROPS[id].name}</b>!`, 'good', 3400), 350);
    buildHotbar();
    checkAchievements();
  }
  updateHUD();
}

function makeQuests() {
  const l = level();
  const defs = [
    { type: 'plant', icon: '🌱', goal: 4 + Math.min(6, l), reward: 30 + l * 8 },
    { type: 'harvest', icon: '🧺', goal: 3 + Math.min(7, l), reward: 40 + l * 10 },
    { type: 'water', icon: '💧', goal: 6 + Math.min(12, l * 2), reward: 30 + l * 7 },
    { type: 'earn', icon: '🪙', goal: 60 + l * 30, reward: 45 + l * 9 }
  ];
  defs.sort(() => Math.random() - 0.5);
  return defs.slice(0, 3).map((d) => {
    const text = d.type === 'plant' ? `Посадите ${d.goal} растений`
      : d.type === 'harvest' ? `Соберите ${d.goal} урожаев`
      : d.type === 'water' ? `Полейте ${d.goal} грядок`
      : `Заработайте ${d.goal} монет`;
    return { type: d.type, icon: d.icon, text, goal: d.goal, reward: d.reward, progress: 0, done: false };
  });
}
function ensureQuests() {
  if (!state.quests || state.quests.length !== 3 || state.questsDay !== state.day) {
    state.quests = makeQuests();
    state.questsDay = state.day;
  }
}
function questEvent(type, amount) {
  let changed = false;
  for (const q of state.quests) {
    if (q.done || q.type !== type) continue;
    q.progress = Math.min(q.goal, q.progress + amount);
    if (q.progress >= q.goal) {
      q.done = true;
      state.coins += q.reward;
      addXP(15);
      toast(`${q.icon} Задание выполнено: ${q.text}! <b>+${q.reward} 🪙</b>`, 'gold', 3400);
      playSound('coin');
      changed = true;
    }
  }
  if (changed) save();
  updateHUD();
}
function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (state.achv.indexOf(a.id) >= 0) continue;
    let ok = false;
    try { ok = !!a.check(state); } catch (e) { ok = false; }
    if (ok) {
      state.achv.push(a.id);
      toast(`🏆 Достижение: <b>${a.name}</b>`, 'gold', 3600);
      playSound('level');
      save();
    }
  }
}

/* =====================================================================
   ДЕЙСТВИЯ НА ФЕРМЕ
   ===================================================================== */
function spendEnergy(n) {
  if (state.energy < n) {
    toast('⚡ Не хватает энергии! Лягте спать — кнопка «Спать».', 'bad');
    playSound('error');
    return false;
  }
  state.energy -= n;
  return true;
}
function plotCenter(i) {
  const p = plotRect(i);
  return { x: p.x + 8, y: p.y + 7 };
}
function tillPlot(p, i) {
  if (!spendEnergy(2)) return;
  p.tilled = true;
  addXP(1);
  const c = plotCenter(i);
  spawnBurst(c.x, c.y + 4, ['#8a5b39', '#6f472c', '#a3714b'], 8, 24);
  playSound('till');
  floatText(c.x, c.y - 2, '−2⚡', '#ffe8a0');
  updateHUD();
}
function plantCrop(p, i, cropId) {
  const def = CROPS[cropId];
  if (!def) return;
  if (level() < def.level) {
    toast(`🔒 <b>${def.name}</b> откроется на ${def.level} уровне`, 'bad');
    playSound('error');
    return;
  }
  if (state.coins < def.cost) {
    toast(`🪙 Не хватает монет: нужно ещё ${def.cost - state.coins}`, 'bad');
    playSound('error');
    return;
  }
  if (!spendEnergy(1)) return;
  state.coins -= def.cost;
  p.crop = { id: cropId, growth: 0, watered: false };
  state.stats.planted += 1;
  const c = plotCenter(i);
  spawnBurst(c.x, c.y + 2, ['#8fdd62', '#6fbe4e', '#c8f0a0'], 7, 20);
  floatText(c.x, c.y, '−' + def.cost + '🪙', '#ffe08a');
  playSound('plant');
  questEvent('plant', 1);
  addXP(1);
  updateHUD();
}
function waterPlot(p, i) {
  if (!p.crop) {
    toast('Поливать нужно только посаженные растения', 'info');
    return;
  }
  if (p.crop.watered) {
    toast('💧 Эта грядка уже полита — до следующего утра', 'info');
    return;
  }
  if (state.water <= 0) {
    toast('💧 В лейке нет воды! Наберите её у пруда или колодца', 'bad');
    playSound('error');
    return;
  }
  if (!spendEnergy(1)) return;
  state.water -= 1;
  p.crop.watered = true;
  state.stats.watered += 1;
  const c = plotCenter(i);
  spawnBurst(c.x, c.y + 2, ['#8fd8ff', '#bfe8ff', '#d7f3ff'], 8, 22);
  floatText(c.x, c.y, '💧', '#9fe4ff');
  playSound('water');
  questEvent('water', 1);
  addXP(1);
  updateHUD();
}
function harvestPlot(p, i) {
  const def = CROPS[p.crop.id];
  if (!spendEnergy(1)) return;
  let yieldAmt = 1;
  if (Math.random() < 0.12 + level() * 0.012) yieldAmt = 2;
  state.inventory[def.id] = (state.inventory[def.id] || 0) + yieldAmt;
  state.stats.harvested += yieldAmt;
  state.stats.types[def.id] = (state.stats.types[def.id] || 0) + yieldAmt;
  p.crop = null;
  const c = plotCenter(i);
  spawnBurst(c.x, c.y, [def.color, '#ffe27a', '#fff3c4', '#8fdd62'], 12, 30);
  floatText(c.x, c.y - 4, '+' + yieldAmt + ' ' + def.name, def.color);
  playSound('harvest');
  questEvent('harvest', yieldAmt);
  addXP(def.xp * yieldAmt);
  checkAchievements();
  updateHUD();
  save();
}
function interactPlot(i) {
  const p = state.plots[i];
  if (!p) return;
  const sel = state.selected;
  const cropId = sel.indexOf('seed:') === 0 ? sel.slice(5) : null;
  if (p.crop) {
    const def = CROPS[p.crop.id];
    if (p.crop.growth >= def.grow) { harvestPlot(p, i); return; }
    if (sel === 'can') { waterPlot(p, i); return; }
    if (sel === 'hoe') {
      toast(`🌱 Здесь растёт <b>${def.name}</b> — дайте ей созреть`, 'info');
      return;
    }
    const pct = Math.floor((p.crop.growth / def.grow) * 100);
    toast(`${def.name}: рост ${pct}%. Возьмите <b>лейку</b> (2), чтобы ускорить рост.`, 'info');
    return;
  }
  if (!p.tilled) {
    if (sel === 'hoe') { tillPlot(p, i); return; }
    toast('Сначала вскопайте землю <b>мотыгой</b> (клавиша 1)', 'info');
    return;
  }
  if (cropId) { plantCrop(p, i, cropId); return; }
  if (sel === 'can') { toast('Здесь пока ничего не растёт — посадите семена', 'info'); return; }
  toast('Грядка готова! Выберите <b>семена</b> на нижней панели', 'info');
}
function refillWater(x, y) {
  const cap = waterCap();
  if (state.water >= cap) {
    toast('💧 Лейка уже полна', 'info');
    return;
  }
  const add = cap - state.water;
  state.water = cap;
  playSound('water');
  floatText(x, y, '+' + add + ' 💧', '#9fe4ff');
  spawnBurst(x, y, ['#8fd8ff', '#bfe8ff'], 10, 26);
  toast('💧 Лейка наполнена', 'good', 1600);
  updateHUD();
}
function collectEggs(x, y) {
  if (state.eggs <= 0) {
    toast('🐔 Курочки ещё не снеслись — яйца появляются каждое утро', 'info');
    return;
  }
  const n = state.eggs;
  state.eggs = 0;
  state.inventory.egg = (state.inventory.egg || 0) + n;
  state.stats.eggs = (state.stats.eggs || 0) + n;
  addXP(1);
  playSound('egg');
  floatText(x, y, '+' + n + ' 🥚', '#fff3c4');
  spawnBurst(x, y, ['#fff3c4', '#ffe27a'], 10, 24);
  toast(`🥚 Собрано яиц: <b>${n}</b>`, 'good', 2000);
  checkAchievements();
  updateHUD();
  save();
}
function selectTool(key) {
  const slot = TOOL_SLOTS.find((s) => s.key === key);
  if (!slot) return;
  if (slot.kind === 'seed' && level() < CROPS[slot.id].level) {
    toast(`🔒 <b>${CROPS[slot.id].name}</b> откроется на ${CROPS[slot.id].level} уровне`, 'bad');
    playSound('error');
    return;
  }
  state.selected = key;
  buildHotbar();
  updateHint();
  playSound('click');
}
function handleCanvasAction(lx, ly) {
  const hit = hitTest(lx, ly);
  if (!hit) return;
  if (hit.type === 'plot') interactPlot(hit.i);
  else if (hit.type === 'house') askSleep();
  else if (hit.type === 'pond' || hit.type === 'well') refillWater(lx, ly);
  else if (hit.type === 'coop') collectEggs(lx, ly);
}
function askSleep() {
  confirmDialog('Лечь спать?', `Сейчас ${clockText()}. День ${state.day} завершится, энергия восстановится, а задания обновятся.`, 'Спать', () => sleepNow(false));
}

/* =====================================================================
   РЫНОК, УЛУЧШЕНИЯ, ДЕНЬ
   ===================================================================== */
function inventoryCount() {
  let n = 0;
  for (const k of Object.keys(state.inventory)) n += state.inventory[k] || 0;
  return n;
}
function inventoryValue() {
  let v = 0;
  for (const k of Object.keys(state.inventory)) v += (state.inventory[k] || 0) * (SELL_PRICES[k] || 0);
  return v;
}
function sellAll() {
  const total = inventoryValue();
  if (!total) {
    toast('Пока нечего продавать — соберите урожай или яйца', 'info');
    return;
  }
  for (const k of Object.keys(state.inventory)) state.inventory[k] = 0;
  state.coins += total;
  state.stats.earned += total;
  playSound('coin');
  toast(`💰 Выручка: <b>${total} 🪙</b>`, 'gold', 2600);
  questEvent('earn', total);
  addXP(2);
  checkAchievements();
  save();
  updateHUD();
  if (modalOpen) renderMarket();
}
function upgradeLevel(u) {
  return u.id === 'autoWater' ? (state.upgrades.autoWater ? 1 : 0) : (state.upgrades[u.id] || 0);
}
function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return;
  const lvl = upgradeLevel(u);
  if (lvl >= u.max) { toast('Это улучшение уже максимальное', 'info'); return; }
  if (level() < u.levelReq) {
    toast(`🔒 Улучшение откроется на ${u.levelReq} уровне`, 'bad');
    playSound('buyErr');
    return;
  }
  const cost = u.cost(lvl);
  if (state.coins < cost) {
    toast(`🪙 Не хватает ${cost - state.coins} монет`, 'bad');
    playSound('buyErr');
    return;
  }
  state.coins -= cost;
  if (u.id === 'autoWater') {
    state.upgrades.autoWater = true;
    waterAllCrops();
    toast('🚿 Автополив установлен! Все грядки поливаются утром.', 'good', 3200);
  } else {
    state.upgrades[u.id] = lvl + 1;
    if (u.id === 'energy') state.energy = Math.min(maxEnergy(), state.energy + 20);
    if (u.id === 'chicken') {
      chickens.push(makeChicken());
      toast('🐔 На ферме новая курочка!', 'good');
    } else {
      toast(`⬆️ ${u.name}: уровень ${lvl + 1}`, 'good');
    }
  }
  playSound('buy');
  save();
  updateHUD();
  buildHotbar();
  checkAchievements();
  if (modalOpen) renderMarket();
}
function waterAllCrops() {
  for (const p of state.plots) if (p.crop) p.crop.watered = true;
}
function rollWeather() {
  const r = Math.random() * 100;
  if (r < 42) return 'sunny';
  if (r < 62) return 'cloudy';
  if (r < 80) return 'rain';
  if (r < 92) return 'windy';
  return 'heat';
}
function clockText() {
  const hh = Math.floor(state.minutes / 60) % 24;
  const mm = Math.floor(state.minutes % 60);
  return pad2(hh) + ':' + pad2(mm);
}
function sleepNow(forced) {
  if (sleeping) return;
  sleeping = true;
  closeConfirm();
  playSound('sleep');
  flashEl.classList.remove('on');
  void flashEl.offsetWidth;
  flashEl.classList.add('on');
  if (forced) toast('🌙 Вы уснули под звёздами...', 'info', 1800);
  setTimeout(() => {
    state.day += 1;
    state.minutes = DAY_START;
    state.energy = maxEnergy();
    state.water = waterCap();
    state.weather = rollWeather();
    for (const p of state.plots) if (p.crop) p.crop.watered = false;
    if (state.weather === 'rain' || state.upgrades.autoWater) waterAllCrops();
    const laid = 1 + Math.floor(chickensCount() / 3) + (Math.random() < 0.4 ? 1 : 0);
    state.eggs = Math.min(15, state.eggs + laid);
    state.stats.daysPlayed = state.day;
    state.quests = makeQuests();
    state.questsDay = state.day;
    save();
    syncUp(true);
    updateHUD();
    buildHotbar();
    const w = WEATHER[state.weather];
    let extra = '';
    if (state.weather === 'rain') extra = ' Дождь полил все грядки.';
    if (state.weather === 'heat') extra = ' Жара ускоряет рост.';
    toast(`🌅 День ${state.day} · ${w.icon} ${w.name}.${extra}`, 'good', 3600);
    if (state.eggs > 0) setTimeout(() => toast(`🐔 Курочки снесли яйца (${state.eggs}). Соберите их у курятника!`, 'info', 3600), 800);
    sleeping = false;
    checkAchievements();
  }, 460);
}
function update(dt) {
  state.minutes += dt * MIN_PER_SEC;
  if (state.minutes >= DAY_END) {
    state.minutes = DAY_END;
    sleepNow(true);
    return;
  }
  const wm = state.weather === 'heat' ? 1.25 : state.weather === 'rain' ? 1.08 : 1;
  const cm = 1 + (state.upgrades.compost || 0) * 0.15;
  for (const p of state.plots) {
    if (!p.crop) continue;
    const def = CROPS[p.crop.id];
    if (p.crop.growth >= def.grow) continue;
    const mul = (p.crop.watered ? 1 : 0.35) * wm * cm;
    p.crop.growth = Math.min(def.grow, p.crop.growth + dt * mul);
  }
  updateChickens(dt);
}

/* =====================================================================
   ПОДСКАЗКИ
   ===================================================================== */
function hintFor(hit) {
  if (!hit) return 'Кликните по грядке: <b>1</b> — мотыга, <b>2</b> — лейка, <b>3–8</b> — семена';
  if (hit.type === 'plot') {
    const p = state.plots[hit.i];
    if (!p) return '';
    const sel = state.selected;
    const cropId = sel.indexOf('seed:') === 0 ? sel.slice(5) : null;
    if (p.crop) {
      const def = CROPS[p.crop.id];
      if (p.crop.growth >= def.grow) return `✅ <b>${def.name}</b> созрела! Клик — собрать урожай (−1⚡)`;
      const pct = Math.floor((p.crop.growth / def.grow) * 100);
      if (sel === 'can' && !p.crop.watered) return `💧 Полить <b>${def.name}</b> (−1⚡, 1💧) · рост ${pct}%`;
      if (p.crop.watered) return `<b>${def.name}</b> полита · рост ${pct}%`;
      return `<b>${def.name}</b> · рост ${pct}% · не полита (растёт медленнее)`;
    }
    if (!p.tilled) {
      if (sel === 'hoe') return '🪓 Вскопать грядку (−2⚡)';
      return 'Дикая земля — возьмите <b>мотыгу</b> (1), чтобы вскопать';
    }
    if (cropId) {
      const def = CROPS[cropId];
      if (level() < def.level) return `🔒 <b>${def.name}</b> откроется на ${def.level} уровне`;
      if (state.coins < def.cost) return `🪙 Не хватает монет: <b>${def.name}</b> стоит ${def.cost}`;
      return `🌱 Посадить <b>${def.name}</b> (−1⚡, ${def.cost}🪙) · созреет за ${fmtTime(def.grow)}`;
    }
    if (sel === 'can') return 'Сначала посадите семена — поливать пустую грядку не нужно';
    return 'Грядка готова. Выберите <b>семена</b> внизу';
  }
  if (hit.type === 'house') return '🏠 <b>Дом</b> — лечь спать и начать новый день';
  if (hit.type === 'pond' || hit.type === 'well') return '💧 <b>Набрать воду</b> в лейку';
  if (hit.type === 'coop') return state.eggs > 0 ? `🥚 <b>Собрать яйца</b> (${state.eggs} шт.)` : '🐔 Курятник: утром курочки снесут яйца';
  return '';
}
function updateHint() {
  const html = hintFor(hover);
  if (html === lastHint) {
    if (html) hintEl.classList.add('show'); else hintEl.classList.remove('show');
    return;
  }
  lastHint = html;
  hintEl.innerHTML = html;
  hintEl.classList.toggle('show', !!html);
}

/* =====================================================================
   HUD И ХОТБАР
   ===================================================================== */
function equipIcon(g, slot) {
  g.clearRect(0, 0, 16, 16);
  if (slot.kind === 'seed') {
    drawCrop(g, 0, 0, slot.id, 3, 0, 2);
  } else if (slot.id === 'hoe') {
    for (let i = 0; i < 8; i++) box(g, 3 + i, 13 - i, 2, 2, i % 2 ? '#a86f43' : '#b97e4d');
    box(g, 10, 2, 4, 2, '#d7dee6');
    box(g, 12, 4, 2, 3, '#a7b3bd');
    pix(g, 10, 2, '#f0f4f8');
    pix(g, 13, 3, '#8b98a3');
    box(g, 3, 13, 2, 2, '#7a4a2a');
  } else {
    box(g, 3, 8, 8, 6, '#4f8fb3');
    box(g, 4, 9, 6, 4, '#8cc7e0');
    box(g, 4, 8, 6, 1, 'rgba(255,255,255,.35)');
    box(g, 5, 6, 4, 2, '#4f8fb3');
    box(g, 6, 5, 3, 1, '#3f7896');
    box(g, 10, 7, 3, 2, '#4f8fb3');
    box(g, 12, 5, 2, 3, '#4f8fb3');
    pix(g, 14, 4, '#9fe4ff');
    pix(g, 14, 6, '#9fe4ff');
    pix(g, 13, 8, '#9fe4ff');
    box(g, 9, 9, 1, 3, '#3f7896');
  }
}
function buildHotbar() {
  if (!hotbar) return;
  hotbar.innerHTML = '';
  TOOL_SLOTS.forEach((slot, idx) => {
    const crop = slot.kind === 'seed' ? CROPS[slot.id] : null;
    const locked = !!(crop && level() < crop.level);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot' + (state.selected === slot.key ? ' active' : '') + (locked ? ' locked' : '');
    btn.dataset.slot = slot.key;
    btn.title = crop
      ? `${crop.name} · ${crop.cost}🪙 · созревает за ${fmtTime(crop.grow)}` + (locked ? ` · с ${crop.level} уровня` : '')
      : slot.id === 'hoe' ? 'Мотыга: вскопать грядку (−2⚡)' : 'Лейка: полить растение (−1⚡, 1💧). Наполнить у пруда/колодца';
    if (slot.key === 'can') btn.id = 'slot-can';

    const cv = document.createElement('canvas');
    cv.width = 48; cv.height = 48; cv.className = 'slot-icon';
    const g = cv.getContext('2d');
    g.setTransform(3, 0, 0, 3, 0, 0);
    g.imageSmoothingEnabled = false;
    equipIcon(g, slot);
    btn.appendChild(cv);

    const key = document.createElement('span');
    key.className = 'slot-key'; key.textContent = String(idx + 1);
    btn.appendChild(key);

    const label = document.createElement('span');
    label.className = 'slot-label'; label.textContent = slot.name;
    btn.appendChild(label);

    if (crop) {
      const cost = document.createElement('span');
      cost.className = 'slot-cost'; cost.textContent = crop.cost + '🪙';
      btn.appendChild(cost);
    }
    if (slot.key === 'can') {
      const w = document.createElement('span');
      w.className = 'slot-water'; w.textContent = state.water + '/' + waterCap();
      btn.appendChild(w);
    }
    if (locked) {
      const tag = document.createElement('span');
      tag.className = 'lock-tag'; tag.textContent = '🔒 ур.' + crop.level;
      btn.appendChild(tag);
    }
    btn.addEventListener('click', () => {
      if (locked) {
        toast(`🔒 <b>${crop.name}</b> откроется на ${crop.level} уровне`, 'bad');
        playSound('error');
        btn.classList.add('lock-flash');
        setTimeout(() => btn.classList.remove('lock-flash'), 320);
        return;
      }
      selectTool(slot.key);
    });
    hotbar.appendChild(btn);
  });
}

function updateHUD() {
  if (!state) return;
  const lvl = level();
  const start = LEVELS[lvl - 1] || 0;
  const next = nextThreshold(lvl);
  const span = Math.max(1, next - start);
  $('coinsTxt').textContent = state.coins;
  const starsEl = $('starsTxt');
  if (starsEl) starsEl.textContent = walletStars;
  $('levelTxt').textContent = lvl;
  $('xpTxt').textContent = Math.max(0, state.xp - start) + ' / ' + span;
  $('xpFill').style.width = clamp((state.xp - start) / span * 100, 0, 100) + '%';
  $('dayTxt').textContent = 'День ' + state.day;
  const w = WEATHER[state.weather] || WEATHER.sunny;
  $('weatherTxt').textContent = w.icon + ' ' + w.name;
  $('clockTxt').textContent = clockText();
  const maxE = maxEnergy();
  const pct = clamp(state.energy / maxE, 0, 1);
  $('energyTxt').textContent = Math.ceil(state.energy);
  $('energyFill').style.width = (pct * 100) + '%';
  const bar = $('energyFill').parentElement;
  bar.classList.toggle('mid', pct < 0.55 && pct >= 0.25);
  bar.classList.toggle('low', pct < 0.25);
  $('waterTxt').textContent = state.water + '/' + waterCap();
  $('waterTxt').parentElement.classList.toggle('empty', state.water <= 0);
  const wb = document.querySelector('#slot-can .slot-water');
  if (wb) wb.textContent = state.water + '/' + waterCap();
  const count = inventoryCount();
  const badge = $('marketBadge');
  badge.textContent = count;
  badge.classList.toggle('hidden', count <= 0);
  $('menuBadge').classList.add('hidden');
  if (modalOpen && menuTab === 'quests') { /* не перерисовываем на лету */ }
}

/* =====================================================================
   РЫНОК
   ===================================================================== */
function openMarket() {
  if (splashOpen || confirming) return;
  ensureAudio();
  modalTitle.textContent = 'Рынок';
  renderMarket();
  modalWrap.classList.remove('hidden');
  modalOpen = true;
  playSound('click');
}
function renderMarket() {
  const scroll = modalBody.scrollTop;
  const total = inventoryValue();
  const count = inventoryCount();
  const items = Object.keys(SELL_PRICES).map((k) => {
    const c = state.inventory[k] || 0;
    const price = SELL_PRICES[k];
    return `<div class="item-card ${c ? '' : 'empty'}">
      <div class="item-ico">${ITEM_ICONS[k]}</div>
      <div class="item-main"><div class="item-name">${ITEM_NAMES[k]}</div><div class="item-sub">${c} шт. × ${price} 🪙</div></div>
      <div class="item-sum">${c * price} 🪙</div>
    </div>`;
  }).join('');
  const upgrades = UPGRADES.map((u) => {
    const lvl = upgradeLevel(u);
    const maxed = lvl >= u.max;
    const locked = level() < u.levelReq;
    const cost = u.cost(lvl);
    const shortage = !maxed && !locked && state.coins < cost;
    return `<div class="upgrade-card ${maxed ? 'maxed' : ''}">
      <div class="upgrade-ico">${u.ico}</div>
      <div class="upgrade-main">
        <div class="upgrade-name">${u.name} <span class="upgrade-lvl">${maxed ? 'МАКС' : lvl + '/' + u.max}</span></div>
        <div class="upgrade-desc">${u.desc}</div>
        <button class="pixel-btn upgrade-buy ${locked ? 'ghost' : ''}" data-act="buy" data-val="${u.id}" ${maxed ? 'disabled' : ''}>
          ${maxed ? '✅ Максимум' : locked ? '🔒 с ' + u.levelReq + ' уровня' : 'Купить · ' + cost + ' 🪙'}
        </button>
        ${shortage ? `<div class="upgrade-req">Не хватает ${cost - state.coins} 🪙</div>` : ''}
        ${locked ? `<div class="upgrade-req">Откроется на ${u.levelReq} уровне</div>` : ''}
      </div>
    </div>`;
  }).join('');
  modalBody.innerHTML = `
    <div class="modal-section">
      <div class="section-title"><span>Урожай на продажу</span><span class="muted">${count} шт. · ${total} 🪙</span></div>
      <div class="market-grid">${items}</div>
      <div class="sell-panel">
        <div class="sell-total">${total} 🪙<small>выручка за всё</small></div>
        <button class="pixel-btn green" data-act="sell-all" ${total ? '' : 'disabled'}>💰 Продать всё</button>
      </div>
    </div>
    <div class="modal-section">
      <div class="section-title"><span>Улучшения и постройки</span><span class="muted">монеты: ${state.coins} 🪙</span></div>
      <div class="upgrade-list">${upgrades}</div>
    </div>`;
  modalBody.scrollTop = scroll;
}

/* =====================================================================
   МЕНЮ
   ===================================================================== */
function openMenu(tab) {
  if (splashOpen || confirming) return;
  ensureAudio();
  menuTab = tab || 'quests';
  modalTitle.textContent = 'Меню фермера';
  renderMenu();
  modalWrap.classList.remove('hidden');
  modalOpen = true;
  playSound('click');
  if (menuTab === 'rating') loadLeaderboard();
}
function renderMenu() {
  const scroll = modalBody.scrollTop;
  const tabs = [
    ['quests', '📜 Задания'],
    ['achv', '🏆 Достижения'],
    ['rating', '🥇 Рейтинг'],
    ['more', '⚙️ Ещё']
  ];
  let content = '';
  if (menuTab === 'quests') content = questsHTML();
  else if (menuTab === 'achv') content = achvHTML();
  else if (menuTab === 'rating') content = ratingHTML();
  else content = moreHTML();
  modalBody.innerHTML = `<div class="tabs">${tabs.map(([id, label]) =>
    `<button class="tab ${menuTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>${content}`;
  modalBody.scrollTop = scroll;
}
function questsHTML() {
  const done = state.quests.filter((q) => q.done).length;
  let h = `<div class="modal-section">
    <div class="section-title"><span>Ежедневные задания</span><span class="muted">День ${state.day} · ${done}/3</span></div>`;
  for (const q of state.quests) {
    const pct = clamp(q.progress / q.goal * 100, 0, 100);
    h += `<div class="quest ${q.done ? 'done' : ''}">
      <div class="quest-ico">${q.icon}</div>
      <div class="quest-main">
        <div class="quest-title">${q.text}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="item-sub">${Math.min(q.progress, q.goal)} / ${q.goal}</div>
      </div>
      <div class="quest-reward">${q.done ? '✅' : '+' + q.reward + ' 🪙'}<small>${q.done ? 'выполнено' : 'награда'}</small></div>
    </div>`;
  }
  h += `<p class="muted" style="font-size:12.5px;margin:6px 0 0;line-height:1.4">Награда начисляется автоматически. Новые задания появляются каждое утро.</p></div>`;
  h += `<div class="modal-section"><div class="section-title"><span>Совет дня</span></div>
    <div class="offline-note">💡 Политые растения растут в <b>3 раза быстрее</b>. Дождь и автополив поливают всю ферму сразу.
    А ещё курочки несутся каждое утро — не забывайте собирать яйца у курятника.</div></div>`;
  return h;
}
function achvHTML() {
  const unlocked = state.achv.length;
  return `<div class="modal-section">
    <div class="section-title"><span>Достижения</span><span class="muted">${unlocked} / ${ACHIEVEMENTS.length}</span></div>
    <div class="ach-grid">${ACHIEVEMENTS.map((a) => {
      const on = state.achv.indexOf(a.id) >= 0;
      return `<div class="ach ${on ? 'unlocked' : ''}">
        <div class="ach-ico">${a.ico}</div>
        <div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div></div>
      </div>`;
    }).join('')}</div>
  </div>`;
}
function ratingHTML() {
  let h = `<div class="modal-section">
    <div class="section-title"><span>Рейтинг фермеров</span><span class="muted">${cloudOnline ? '☁️ облако' : cloudChecked ? 'офлайн' : 'проверяем...'}</span></div>
    <div class="leader-row me">
      <div class="rank">🏡</div>
      <div class="lname">${esc(state.name)} <span class="muted">(вы)</span></div>
      <div class="lstat">Ур. ${level()} · День ${state.day}</div>
      <div class="lcoins">${state.coins} 🪙</div>
    </div>`;
  if (leaderboardState === 'loading') {
    h += `<div class="offline-note">Загружаем таблицу лидеров...</div>`;
  } else if (leaderboardState === 'error' || !cloudOnline) {
    h += `<div class="offline-note"><b>Облако недоступно.</b> Запустите игру через <code>python server.py</code> — тогда прогресс будет сохраняться в облако, а здесь появится общий рейтинг фермеров.
      <br><br>Ваш локальный результат: <b>${level()} ур.</b>, день <b>${state.day}</b>, собрано <b>${state.stats.harvested}</b> урожаев, заработано <b>${state.stats.earned} 🪙</b>.</div>`;
  } else if (leaderboard && leaderboard.length) {
    const medals = ['🥇', '🥈', '🥉'];
    h += leaderboard.slice(0, 12).map((r, i) => {
      const me = r.id === getPid();
      return `<div class="leader-row ${me ? 'me' : ''}">
        <div class="rank">${medals[i] || (i + 1)}</div>
        <div class="lname">${esc(r.name || 'Фермер')}${me ? ' <span class="muted">(вы)</span>' : ''}</div>
        <div class="lstat">Ур. ${r.level || 1} · День ${r.day || 1}</div>
        <div class="lcoins">${r.coins || 0} 🪙</div>
      </div>`;
    }).join('');
  } else {
    h += `<div class="offline-note">Таблица пока пуста — станьте первым фермером в рейтинге!</div>`;
  }
  h += `<div style="margin-top:10px"><button class="pixel-btn small ghost" data-act="refresh-rating">🔄 Обновить рейтинг</button></div></div>`;
  return h;
}
function moreHTML() {
  const cloudText = !cloudChecked ? 'проверяем...' : cloudOnline ? 'подключено' : 'офлайн-режим';
  const last = cloudLastSync ? new Date(cloudLastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
  return `<div class="modal-section">
    <div class="section-title">Настройки фермы</div>
    <div class="settings-row"><span>👤 Имя фермера</span><span class="settings-actions"><b>${esc(state.name)}</b><button class="pixel-btn small ghost" data-act="name">Изменить</button></span></div>
    <div class="settings-row"><span>🔊 Звуки</span><button class="pixel-btn small ${state.sound ? 'green' : 'ghost'}" data-act="sound">${state.sound ? 'Включены' : 'Выключены'}</button></div>
    <div class="settings-row"><span>☁️ Облако</span><span class="settings-actions"><span class="muted" style="font-size:12px">${cloudText} · ${last}</span><button class="pixel-btn small blue" data-act="cloud-save" ${cloudOnline ? '' : 'disabled'}>Сохранить</button></span></div>
    <div class="settings-row"><span>🚜 Начать заново</span><button class="pixel-btn small red" data-act="new-game">Новая ферма</button></div>
  </div>
  <div class="modal-section">
    <div class="section-title">Справочник культур</div>
    <div class="ref-row head"><span>Культура</span><span>Ур.</span><span>Цена</span><span>Продажа</span><span>Рост</span></div>
    ${CROP_IDS.map((id) => {
      const c = CROPS[id];
      const locked = level() < c.level;
      return `<div class="ref-row ${locked ? 'locked' : ''}">
        <span><i class="crop-dot" style="background:${c.color}"></i>${c.name}${locked ? ' 🔒' : ''}</span>
        <span>${c.level}</span><span>${c.cost} 🪙</span><span>${c.sell} 🪙</span><span>${fmtTime(c.grow)}</span>
      </div>`;
    }).join('')}
    <p class="muted" style="font-size:12px;margin:7px 0 0">Политая культура растёт с обычной скоростью, сухая — в 3 раза медленнее.</p>
  </div>
  <div class="modal-section">
    <div class="section-title">Как играть</div>
    <div class="help-list">
      <div><b>1</b> — мотыга: вскопать дикую грядку за 2⚡. <b>2</b> — лейка: полить растение за 1⚡ и 1💧.</div>
      <div><b>3–8</b> — семена. Выберите культуру и кликните по вскопанной грядке. Посадка стоит монет.</div>
      <div>Созревшее растение можно собрать кликом. Урожай попадает на склад — продавайте его на <b>Рынке</b>.</div>
      <div>Вода в лейке заканчивается — наполните её у <b>пруда</b> или <b>колодца</b>.</div>
      <div>Кликнув по дому или кнопке <span class="kbd">Спать</span>, вы завершаете день: энергия восстанавливается, курочки несут яйца, задания обновляются.</div>
      <div>Погода меняется каждый день: <b>дождь</b> поливает всё, <b>жара</b> ускоряет рост, <b>ветер</b> приносит листья.</div>
      <div>Горячие клавиши: <span class="kbd">1</span>–<span class="kbd">8</span> инструменты, <span class="kbd">S</span> сон, <span class="kbd">M</span> рынок, <span class="kbd">Esc</span> закрыть окно.</div>
    </div>
  </div>
  <p class="muted" style="font-size:12px;text-align:center;margin:8px 0 0">Пиксельная ферма · v2.0 · Python + Java + HTML/CSS/JS</p>`;
}

/* =====================================================================
   ОБЩИЕ ОБНОВЛЕНИЯ
   ===================================================================== */
function refreshAll() {
  buildHotbar();
  updateHUD();
  updateHint();
}
function closeModal() {
  modalOpen = false;
  modalWrap.classList.add('hidden');
}
function updateSplashNote() {
  const has = hasLocalSave();
  $('continueBtn').textContent = has ? 'Продолжить' : 'Начать игру';
  if (has) {
    $('splashNote').textContent = `Сохранение: день ${state.day} · ${state.coins} 🪙 · ${state.name}`;
  } else {
    $('splashNote').textContent = 'Прогресс сохраняется автоматически';
  }
}
function hideSplash() {
  if (!splashOpen) return;
  splashOpen = false;
  splash.classList.add('hide');
  setTimeout(() => splash.classList.add('hidden'), 380);
  started = true;
  updateHint();
}
function startNewGame() {
  state = newState();
  ensureQuests();
  initChickens();
  save();
  closeConfirm();
  closeModal();
  hideSplash();
  refreshAll();
  updateSplashNote();
  playSound('day');
  toast('🚜 Новая ферма готова! Начните с мотыги (клавиша 1)', 'good', 3600);
  setTimeout(() => toast('💡 Совет: полейте посадки — они растут в 3 раза быстрее', 'info', 4200), 1400);
  syncUp(true);
  postWallet({ type: 'ready' });
}
function continueGame() {
  hideSplash();
  ensureAudio();
  playSound('day');
  const fresh = !hasLocalSave();
  if (fresh) {
    setTimeout(() => toast('🌱 Вскопайте грядку мотыгой (1) и посадите первые семена (3)', 'good', 4200), 500);
  }
}

/* =====================================================================
   СОБЫТИЯ
   ===================================================================== */
function bindUI() {
  $('continueBtn').addEventListener('click', continueGame);
  $('newBtn').addEventListener('click', () => {
    if (hasLocalSave() || state.savedAt) {
      confirmDialog('Начать новую ферму?', 'Весь текущий прогресс будет потерян. Это действие нельзя отменить.', 'Начать заново', startNewGame);
    } else {
      startNewGame();
    }
  });
  $('sleepBtn').addEventListener('click', () => { if (!splashOpen) askSleep(); });
  $('marketBtn').addEventListener('click', openMarket);
  $('menuBtn').addEventListener('click', () => openMenu('quests'));
  $('modalClose').addEventListener('click', closeModal);
  modalWrap.addEventListener('pointerdown', (e) => { if (e.target === modalWrap) closeModal(); });
  confirmNo.addEventListener('click', closeConfirm);
  confirmYes.addEventListener('click', () => {
    const cb = confirmCb;
    closeConfirm();
    if (cb) cb();
  });
  confirmWrap.addEventListener('pointerdown', (e) => { if (e.target === confirmWrap) closeConfirm(); });

  modalBody.addEventListener('click', async (e) => {
    const tabEl = e.target.closest('[data-tab]');
    if (tabEl) {
      menuTab = tabEl.dataset.tab;
      renderMenu();
      if (menuTab === 'rating') {
        if (leaderboardState === 'idle') loadLeaderboard();
      }
      playSound('click');
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'sell-all') { sellAll(); return; }
    if (act === 'buy') { buyUpgrade(el.dataset.val); return; }
    if (act === 'refresh-rating') {
      leaderboard = null; leaderboardState = 'idle';
      loadLeaderboard();
      return;
    }
    if (act === 'sound') {
      state.sound = !state.sound;
      if (state.sound) { ensureAudio(); playSound('click'); }
      save();
      renderMenu();
      return;
    }
    if (act === 'name') {
      const name = prompt('Имя фермера (до 20 символов):', state.name);
      if (name && name.trim()) {
        state.name = name.trim().slice(0, 20);
        save();
        syncUp(true);
        renderMenu();
        updateSplashNote();
        toast('👤 Имя сохранено: <b>' + esc(state.name) + '</b>', 'good', 2000);
      }
      return;
    }
    if (act === 'cloud-save') { await syncUp(false); renderMenu(); return; }
    if (act === 'new-game') {
      confirmDialog('Начать новую ферму?', 'Весь текущий прогресс будет потерян. Это действие нельзя отменить.', 'Начать заново', () => {
        closeModal();
        startNewGame();
      });
      return;
    }
  });

  const canvasPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH };
  };
  canvas.addEventListener('pointermove', (e) => {
    const p = canvasPos(e);
    hover = hitTest(p.x, p.y);
    canvas.style.cursor = hover ? 'pointer' : 'default';
    updateHint();
  });
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    canvas.style.cursor = 'default';
    updateHint();
  });
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (splashOpen || modalOpen || confirming || sleeping) return;
    ensureAudio();
    const p = canvasPos(e);
    handleCanvasAction(p.x, p.y);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!confirmWrap.classList.contains('hidden')) { closeConfirm(); return; }
      if (modalOpen) { closeModal(); return; }
    }
    if (splashOpen) {
      if (e.key === 'Enter') $('continueBtn').click();
      return;
    }
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (modalOpen || confirming) return;
    if (/^[1-8]$/.test(e.key)) {
      const slot = TOOL_SLOTS[Number(e.key) - 1];
      if (slot) selectTool(slot.key);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 's' || k === 'ы') askSleep();
    else if (k === 'm' || k === 'ь') openMarket();
  });

  document.addEventListener('pointerdown', () => { ensureAudio(); }, { once: true });
  window.addEventListener('beforeunload', save);
  window.addEventListener('blur', save);
  setInterval(() => { if (!splashOpen && !modalOpen) syncUp(true); }, 45000);
}

/* =====================================================================
   ЦИКЛ И СТАРТ
   ===================================================================== */
let lastTs = 0, hudAcc = 0;
function loop(ts) {
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  dt = Math.min(0.08, Math.max(0, dt));
  animT += dt;
  const active = !splashOpen && !modalOpen && !confirming && !sleeping;
  if (active) update(dt);
  updateFx(dt);
  hudAcc += dt;
  if (hudAcc > 0.2) { updateHUD(); updateHint(); hudAcc = 0; }
  saveT += dt;
  if (saveT > 10 && active) { save(); saveT = 0; }
  render(animT);
  requestAnimationFrame(loop);
}

function scenicSeed() {
  const rows = [
    [['wheat', 1], ['carrot', 0.82], ['corn', 0.55], ['pumpkin', 1], ['strawberry', 0.4], ['sunflower', 0.7], ['wheat', 1], null, ['carrot', 0.22]],
    [['carrot', 1], ['wheat', 0.5], null, ['pumpkin', 0.85], ['corn', 1], ['strawberry', 0.6], ['sunflower', 0.9], ['wheat', 1], null],
    [['corn', 0.3], ['pumpkin', 1], ['wheat', 0.9], ['sunflower', 1], ['carrot', 0.6], ['strawberry', 1], ['corn', 0.4], null, ['wheat', 1]],
    [['strawberry', 0.2], ['sunflower', 0.5], ['pumpkin', 0.2], ['corn', 1], ['wheat', 0.7], ['carrot', 1], ['pumpkin', 0.9], ['strawberry', 0.8], ['corn', 0.6]],
    [['wheat', 1], null, ['carrot', 0.3], ['sunflower', 0.8], ['pumpkin', 0.4], ['corn', 0.9], ['strawberry', 0.3], ['wheat', 0.5], ['pumpkin', 1]],
    [null, ['wheat', 0.2], ['corn', 0.7], ['sunflower', 1], ['carrot', 0.9], ['pumpkin', 0.6], ['strawberry', 1], ['corn', 0.2], null]
  ];
  state.coins = 680;
  state.xp = 150;
  state.day = 6;
  state.minutes = 16 * 60 + 20;
  state.energy = 86;
  state.water = 15;
  state.weather = 'sunny';
  state.selected = 'seed:wheat';
  state.eggs = 3;
  state.upgrades.can = 1;
  state.upgrades.chicken = 1;
  state.inventory = { wheat: 3, carrot: 2, corn: 1, pumpkin: 1, strawberry: 0, sunflower: 0, egg: 2 };
  state.stats = { harvested: 37, planted: 61, watered: 95, earned: 980, eggs: 12, daysPlayed: 6, types: { wheat: 14, carrot: 8, corn: 5, pumpkin: 3, strawberry: 2, sunflower: 1 } };
  state.achv = ['first_harvest'];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 9; c++) {
      const i = r * 9 + c;
      const item = rows[r][c];
      const p = state.plots[i];
      p.tilled = true;
      p.crop = null;
      if (item) {
        const id = item[0], ratio = item[1];
        p.crop = { id, growth: CROPS[id].grow * ratio, watered: ratio < 1 && (i % 3 !== 0) };
      }
    }
  }
  state.plots[53].tilled = false;
}

function init() {
  buildBackground();
  buildPlotDetail();
  drawSplashArt();
  const params = new URLSearchParams(location.search);
  state = loadLocal() || newState();
  if (params.has('scenic')) {
    persistence = false;
    scenicSeed();
    state.savedAt = 0;
    if (params.has('hour')) {
      const hh = Number(params.get('hour'));
      if (isFinite(hh)) state.minutes = Math.max(DAY_START, Math.min(DAY_END - 1, hh * 60));
    }
  }
  ensureQuests();
  initChickens();
  buildHotbar();
  updateHUD();
  bindUI();
  hideSplash();
  postWallet({ type: 'ready' });
  updateSplashNote();
  updateHint();
  // Небольшой публичный API — удобно для отладки и автоматических проверок.
  window.PixelFarm = {
    version: 2,
    getState: () => JSON.parse(JSON.stringify(state)),
    getLevel: level,
    getClock: clockText,
    crops: CROPS,
    hitTest,
    autoPlay: () => hideSplash()
  };
  requestAnimationFrame(loop);
  setTimeout(cloudBootstrap, 500);
  if (params.has('play') || params.has('scenic')) {
    hideSplash();
    started = true;
  }
  if (params.has('debug')) {
    window.PixelFarm.debug = {
      tick(seconds) {
        let left = Math.max(0, seconds);
        while (left > 0) { const d = Math.min(0.5, left); update(d); left -= d; }
        updateHUD();
      },
      matureAll() {
        for (const p of state.plots) if (p.crop) p.crop.growth = CROPS[p.crop.id].grow;
        updateHUD();
      },
      addCoins(n) { state.coins = Math.max(0, state.coins + n); updateHUD(); },
      refill() { state.water = waterCap(); state.energy = maxEnergy(); updateHUD(); },
      setTime(minutes) { state.minutes = Math.max(DAY_START, Math.min(DAY_END, minutes)); updateHUD(); }
    };
  }
  const open = params.get('open');
  if (open === 'market') setTimeout(openMarket, 80);
  else if (open === 'menu') setTimeout(() => openMenu('quests'), 80);
  else if (open === 'achv') setTimeout(() => openMenu('achv'), 80);
  else if (open === 'rating') setTimeout(() => openMenu('rating'), 80);
  else if (open === 'more') setTimeout(() => openMenu('more'), 80);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
