import * as G from './greek.js';
import { LETTERS, DIGRAPHS, WORDS } from './data.js';
import { VERSION } from './version.js';
import { FW_MODES } from './fw.js';

const $ = (s, el = document) => el.querySelector(s);
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const digits = s => s.replace(/\D/g, '');
const fmtInt = n => n.toLocaleString('ru-RU').replace(/ /g, ' ');
const pad2 = n => String(n).padStart(2, '0');
const lower = L => pick(L.lo.split(' / '));
const oneCase = L => (Math.random() < 0.5 ? L.up : lower(L));
const digraphCase = g => {
  const d = pick(g.split(' / '));
  const r = Math.random();
  if (r < 0.6) return d;
  if (r < 0.85) return d[0].toUpperCase() + d.slice(1);
  return d.toUpperCase();
};
const sayAttr = x => `data-say="${esc(JSON.stringify(x))}"`;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS_RU_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const settings = Object.assign({ rate: 0.9, voice: '', autoplay: true, autoNext: true, autoNextDelay: 0, seqPause: 0.6, waitSpeech: true }, load('gt.settings', {}));
const stats = load('gt.stats', {});
const items = load('gt.items', {});
const modeOpts = load('gt.opts', {});
const modeSettings = load('gt.modeSettings', {});
let activeMode = null;
const cfg = () => ({ ...settings, ...(activeMode ? modeSettings[activeMode] || {} : {}) });

let voices = [];
function refreshVoices() {
  voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^el/i.test(v.lang));
}
if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = () => { refreshVoices(); const r = route(); if (r.name === 'settings') renderSettings(r.id); };
}

let speakToken = 0;
let finishSpeech = () => {};
let speechDone = Promise.resolve();

function speakOne(text, mul, onend) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'el-GR';
  const v = voices.find(v => v.voiceURI === settings.voice) || voices[0];
  if (v) u.voice = v;
  u.rate = Math.max(0.3, cfg().rate * mul);
  let started = false;
  u.onstart = () => { started = true; };
  u.onend = e => onend(started, e);
  u.onerror = e => onend(started, e);
  speechSynthesis.speak(u);
}

function stopSpeech() {
  speakToken++;
  finishSpeech();
  if (window.speechSynthesis) speechSynthesis.cancel();
}

function speak(text, mul = 1) {
  if (!('speechSynthesis' in window) || !text) return Promise.resolve();
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  stopSpeech();
  const token = speakToken;
  const parts = Array.isArray(text) ? text : [text];
  let resolve;
  speechDone = new Promise(r => { resolve = r; });
  const watchdog = setTimeout(() => resolve(), 15000);
  finishSpeech = () => { clearTimeout(watchdog); resolve(); };
  const end = finishSpeech;
  const step = (i, retry = 0) => {
    if (token !== speakToken) return end();
    if (i >= parts.length) return end();
    let fired = false;
    speakOne(parts[i], mul, started => {
      if (fired) return;
      fired = true;
      if (token !== speakToken) return end();
      if (!started && retry < 2) return setTimeout(() => step(i, retry + 1), 150);
      if (i + 1 < parts.length) setTimeout(() => step(i + 1), cfg().seqPause * 1000);
      else end();
    });
  };
  if (busy) setTimeout(() => step(0), 150);
  else step(0);
  return speechDone;
}

function choicesFrom(correct, pool, keyFn, n = 4) {
  const key = keyFn(correct);
  const others = shuffle(pool.filter(x => keyFn(x) !== key));
  const uniq = [];
  for (const o of others) {
    if (!uniq.some(u => keyFn(u) === keyFn(o))) uniq.push(o);
    if (uniq.length === n - 1) break;
  }
  return shuffle([correct, ...uniq]);
}

function parsePrice(s) {
  let t = s.replace(/[\s€]/g, '');
  t = t.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const m = t.match(/^(\d*)(?:[.,](\d{1,2}))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return { e: +(m[1] || 0), c: m[2] ? +(m[2].length === 1 ? m[2] + '0' : m[2]) : 0 };
}

function parseTime(s) {
  const t = s.trim();
  const mm = t.match(/^(\d{1,2})\D+(\d{1,2})$/) || t.match(/^(\d{1,2})(\d{2})$/) || t.match(/^(\d{1,2})$/);
  if (!mm) return null;
  return { h: +mm[1], m: mm[2] === undefined ? 0 : +mm[2] };
}

function parseDate(s) {
  const mm = s.trim().match(/^(\d{1,2})\D+(\d{1,2})/);
  return mm ? { d: +mm[1], m: +mm[2] } : null;
}

const checkPrice = (s, e, c) => { const p = parsePrice(s); return !!p && p.e === e && p.c === c; };
const checkTime = (s, h, m, twelve) => {
  const p = parseTime(s);
  if (!p || p.m !== m) return false;
  return twelve ? p.h % 12 === h % 12 : p.h === h;
};
const checkDate = (s, d, m) => { const p = parseDate(s); return !!p && p.d === d && p.m === m; };

function letterTable() {
  return `<table class="ref">${LETTERS.map(l => `<tr ${sayAttr(l.name)}><td class="greek lg">${l.up} ${l.lo.replace(' / ', ' ')}</td><td class="greek">${l.name}<br><small>${l.ru}</small></td><td>${l.sound}${l.note ? `<br><small>${l.note}</small>` : ''}</td></tr>`).join('')}</table>`;
}

function digraphTable() {
  return `<table class="ref">${DIGRAPHS.map(d => `<tr><td class="greek lg" ${sayAttr(d.syl)}>${d.g}</td><td>${d.sound}${d.note ? `<br><small>${d.note}</small>` : ''}</td><td>${d.words.map(([w, ru]) => `<button class="chip" ${sayAttr([d.syl, w])}><span class="greek">${w}</span><small>${ru}</small></button>`).join('')}</td></tr>`).join('')}</table>`;
}

const DIR = { key: 'dir', label: 'Режим', values: [['listen', 'Слушать'], ['read', 'Читать'], ['speak', 'Говорить']] };

const RANGES = { 9: [0, 9], '10-20': [10, 20], 100: [0, 100], 1000: [100, 999], '1e4': [1000, 9999], '1e6': [1000, 999999], '1e7': [0, 9999999] };
const numBounds = o => (o.range === 'custom' ? [o.from, o.to] : RANGES[o.range] || [0, 9]);
function digitUnits(lo, hi) {
  const out = [];
  for (let p = 0, P = 1; P <= Math.max(hi, 1); p++, P *= 10) {
    const M = P * 10;
    const lo2 = Math.max(lo, p ? P : 0);
    if (lo2 > hi) continue;
    for (let d = 0; d < 10; d++) {
      let base = Math.floor(lo2 / M) * M + d * P;
      if (base + P - 1 < lo2) base += M;
      const n = Math.max(base, lo2);
      if (n <= hi && Math.floor(n / P) % 10 === d && (p === 0 || n >= P)) out.push(`p${p}d${d}`);
    }
  }
  return out;
}
const numUnitKeys = n => [...String(n)].reverse().map((d, p) => `p${p}d${d}`);

const MODES = [
  {
    id: 'letters', group: 'Алфавит', title: 'Буквы', sub: 'буква → звук', kind: 'choice',
    size: () => LETTERS.length,
    gen() {
      const L = pick(LETTERS);
      const traps = (L.trap || []).filter(() => Math.random() < 0.8);
      const others = choicesFrom(L, LETTERS, x => x.sound).filter(o => o !== L).map(o => o.sound);
      const labels = [L.sound, ...traps, ...others].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
      return {
        key: L.up,
        prompt: `<span class="big greek">${oneCase(L)}</span>`,
        choices: shuffle(labels).map(l => ({ label: l, ok: l === L.sound })),
        answer: `${L.up} ${L.lo} — ${L.sound}`,
        greek: `${L.name} (${L.ru})${L.note ? ` · ${L.note}` : ''}`,
        sayAfter: L.name,
      };
    },
    ref: () => ({ html: letterTable() }),
    cheat: () => `<p>Многие буквы похожи на русские и читаются так же (α, κ, μ, ο, π, τ, ς), но есть обманки: Η — и, ν — н, Υ — и, Δ — ð, Β — в, ρ — р, ω — о.</p>
      <p>Звук «и» дают сразу пять написаний: η, ι, υ, ει, οι. Звук «о» — ο и ω. Ударение ставится всегда (знак ´), кроме односложных слов.</p>`,
  },
  {
    id: 'letterNames', group: 'Алфавит', title: 'Названия букв', sub: 'слушай → выбери букву', kind: 'choice', listen: true,
    size: () => LETTERS.length,
    gen() {
      const L = pick(LETTERS);
      const opts = choicesFrom(L, LETTERS, x => x.up);
      return {
        key: L.up,
        say: L.name,
        choices: opts.map(o => ({ label: oneCase(o), ok: o === L, greek: true })),
        answer: `${L.up} ${L.lo}`,
        greek: `${L.name} (${L.ru})`,
      };
    },
    ref: () => ({ html: letterTable() }),
  },
  {
    id: 'digraphs', group: 'Алфавит', title: 'Сочетания', sub: 'ου, μπ, ντ, αυ…', kind: 'choice',
    size: () => DIGRAPHS.length,
    gen() {
      const D = pick(DIGRAPHS);
      const [w, ru] = pick(D.words);
      const opts = choicesFrom(D, DIGRAPHS, x => x.sound);
      return {
        key: D.g,
        prompt: `<span class="big greek">${digraphCase(D.g)}</span>`,
        choices: opts.map(o => ({ label: o.sound, ok: o === D })),
        answer: `${D.g} — ${D.sound}`,
        greek: `${D.note ? `${D.note} · ` : ''}пример: ${w} — ${ru}`,
        sayAfter: [D.syl, w],
      };
    },
    ref: () => ({ html: digraphTable() }),
    cheat: () => `<p>αυ/ευ читаются «ав/эв» перед гласными и звонкими (αυγό, ευρώ), «аф/эф» — перед глухими (αυτοκίνητο, ευχαριστώ).</p>`,
  },
  {
    id: 'digraphSounds', group: 'Алфавит', title: 'Сочетания на слух', sub: 'слушай звук и слово → выбери', kind: 'choice', listen: true,
    size: () => DIGRAPHS.length,
    gen() {
      const D = pick(DIGRAPHS);
      const [w, ru] = pick(D.words);
      const plain = w.normalize('NFD').replace(/́/g, '').normalize('NFC').toLowerCase();
      const inWord = g => g.split(' / ').some(x => plain.includes(x));
      const pool = shuffle(DIGRAPHS.filter(o => o.hear !== D.hear && !inWord(o.g)));
      const others = [];
      for (const o of pool) if (others.length < 3 && !others.some(x => x.hear === o.hear)) others.push(o);
      return {
        key: D.g,
        say: [D.syl, w],
        sayAfter: [D.syl, w],
        choices: shuffle([D, ...others]).map(o => ({ label: digraphCase(o.g), ok: o === D, greek: true })),
        answer: `${D.g} — ${D.sound}`,
        greek: `${w} — ${ru}`,
      };
    },
    ref: () => ({ html: digraphTable() }),
    cheat: () => `<p>ει и οι звучат одинаково («и»), как и γκ с γγ в середине слова («нг») — поэтому вместе в вариантах они не встречаются.</p>`,
  },
  {
    id: 'reading', group: 'Алфавит', title: 'Чтение', sub: 'вывески, меню, города', kind: 'card',
    size: () => WORDS.length,
    gen() {
      const [w, tr, ru] = pick(WORDS);
      const caps = Math.random() < 0.4;
      const shown = caps ? w.normalize('NFD').replace(/́/g, '').normalize('NFC').toUpperCase() : w;
      return {
        key: w,
        prompt: `<span class="mid greek">${shown}</span>`,
        hint: caps ? 'Как на вывеске: заглавными и без ударений' : 'Прочитай вслух, потом проверь',
        answer: tr, greek: caps ? `${w} — ${ru}` : ru, sayAfter: w,
      };
    },
    ref: () => ({ html: `<table class="ref">${WORDS.map(([w, tr, ru]) => `<tr ${sayAttr(w)}><td class="greek">${w}</td><td>${tr}</td><td>${ru}</td></tr>`).join('')}</table>` }),
    cheat: () => `<p>ð — как th в англ. <i>this</i>, θ — как th в <i>think</i>. Ударная гласная отмечена знаком ´.</p><p>Заглавными буквами ударение не пишут: ΦΑΡΜΑΚΕΙΟ = φαρμακείο. Ударение приходится угадывать или знать.</p>`,
  },
  {
    id: 'numbers', group: 'Числа', title: 'Числа', sub: 'от нуля до 10 миллионов', kind: 'input', inputmode: 'numeric', placeholder: 'число',
    options: [DIR, { key: 'range', label: 'Диапазон', values: [['9', '0–9'], ['10-20', '10–20'], ['100', '0–100'], ['1000', '100–999'], ['1e4', '1 000–9 999'], ['1e6', 'до 1 млн'], ['1e7', 'до 10 млн'], ['custom', 'свой']] }],
    defaults: { from: 0, to: 50 },
    scopeOpts: ['dir'],
    need: 3,
    goals: [{ dir: 'listen', range: '1e7' }, { dir: 'read', range: '1e7' }],
    units: o => digitUnits(...numBounds(o)),
    size: o => digitUnits(...numBounds(o)).length,
    record(sc, q, given, ok, cheated) {
      const got = ok ? String(q.key) : digits(given || '');
      const want = String(q.key);
      numUnitKeys(q.key).forEach((k, p) => {
        const hit = !cheated && given !== null && got[got.length - 1 - p] === want[want.length - 1 - p];
        sc[k] = hit ? (sc[k] || 0) + 1 : 0;
      });
    },
    freshScore: (q, sc) => numUnitKeys(q.key).reduce((a, k) => a + Math.min(sc[k] || 0, 3) - 3, 0) / 3,
    progressHint: 'цифра в разряде — 3 раза подряд',
    extra: o => (o.range === 'custom' ? `<form class="range" id="rangeForm">
        <label>от <input id="rFrom" inputmode="numeric" autocomplete="off" value="${o.from}"></label>
        <label>до <input id="rTo" inputmode="numeric" autocomplete="off" value="${o.to}"></label>
        <button>OK</button></form>` : ''),
    readExtra(o) {
      const a = $('#rFrom'), b = $('#rTo');
      if (!a || !b) return false;
      let from = Math.min(+digits(a.value || '0'), 999999999), to = Math.min(+digits(b.value || '0'), 999999999);
      if (from > to) [from, to] = [to, from];
      a.value = from;
      b.value = to;
      if (from === o.from && to === o.to) return false;
      o.from = from;
      o.to = to;
      return true;
    },
    gen(o) {
      let n;
      if (o.range === 'custom') n = rnd(o.from, o.to);
      else if (o.range === '9') n = rnd(0, 9);
      else if (o.range === '10-20') n = rnd(10, 20);
      else if (o.range === '100') n = rnd(0, 100);
      else if (o.range === '1000') n = rnd(100, 999);
      else if (o.range === '1e4') n = rnd(1000, 9999);
      else if (o.range === '1e7') n = Math.random() < 0.15 ? rnd(0, 99999) : rnd(0, 9999999);
      else n = Math.random() < 0.5 ? rnd(10, 999) * 1000 : rnd(1000, 999999);
      return { key: n, say: G.num(n), display: fmtInt(n), answer: fmtInt(n), check: s => digits(s) === String(n) && digits(s).length > 0 };
    },
    ref: () => ({
      placeholder: '147', inputmode: 'numeric',
      convert(s) {
        const d = digits(s);
        if (!d) return null;
        const n = +d;
        if (n >= 1e9) return { error: 'Максимум 999 999 999' };
        const nt = G.num(n), ft = G.num(n, 'f'), mt = G.num(n, 'm');
        const rows = [{ label: `${fmtInt(n)} — средний род (счёт, цены, το)`, text: nt }];
        if (ft === mt && ft !== nt) rows.push({ label: 'мужской и женский род (ο, η, ώρα, χιλιάδες)', text: ft });
        else {
          if (mt !== nt) rows.push({ label: 'мужской род (ο)', text: mt });
          if (ft !== nt) rows.push({ label: 'женский род (η, ώρα, χιλιάδες)', text: ft });
        }
        return { rows };
      },
    }),
    cheat: () => numbersCheat(),
  },
  {
    id: 'prices', group: 'Числа', title: 'Цены', sub: 'евро и центы', kind: 'input', inputmode: 'decimal', placeholder: '14,70',
    options: [DIR, { key: 'tier', label: 'Цены', values: [['small', 'мелочь'], ['shop', 'магазин'], ['rent', 'аренда'], ['mix', 'всё']] }],
    size: o => (o.tier === 'rent' ? 55 : null),
    gen(o) {
      const tier = o.tier === 'mix' ? pick(['small', 'shop', 'rent']) : o.tier;
      let e, c;
      if (tier === 'small') { e = rnd(0, 9); c = Math.random() < 0.8 ? rnd(0, 19) * 5 : rnd(1, 99); if (!e && !c) c = 50; }
      else if (tier === 'shop') { e = rnd(1, 99); c = pick([0, 0, 50, 99, 49, 95, rnd(1, 19) * 5]); }
      else { e = rnd(6, 60) * 50; c = 0; }
      const style = tier !== 'rent' && e && c && Math.random() < 0.4 ? 'short' : 'full';
      const shown = c ? `${fmtInt(e)},${pad2(c)} €` : `${fmtInt(e)} €`;
      return { key: `${e},${c}`, say: G.price(e, c, style), display: shown, answer: shown, check: s => checkPrice(s, e, c) };
    },
    ref: () => ({
      placeholder: '14,70', inputmode: 'decimal',
      convert(s) {
        const p = parsePrice(s);
        if (!p) return s.trim() ? { error: 'Формат: 14,70 или 1200' } : null;
        if (p.e >= 1e9) return { error: 'Слишком большая сумма' };
        const rows = [{ label: 'полностью', text: G.price(p.e, p.c) }];
        if (p.e && p.c) rows.push({ label: 'коротко, как в магазине', text: G.price(p.e, p.c, 'short') });
        return { rows };
      },
    }),
    cheat: () => `<p><b class="greek">δεκατέσσερα ευρώ και εβδομήντα λεπτά</b> — 14,70 €. В магазине часто коротко: <b class="greek">δεκατέσσερα και εβδομήντα</b>.</p>
      <p>ευρώ не склоняется. Цент — <span class="greek">το λεπτό / τα λεπτά</span>. Оба слова среднего рода, поэтому числа в форме среднего рода: <span class="greek">τρία, τέσσερα, διακόσια, χίλια</span>.</p>
      <p><span class="greek">Πόσο κάνει;</span> — сколько стоит? <span class="greek">Πόσο κάνουν;</span> — сколько стоят?</p>`,
  },
  {
    id: 'phone', group: 'Числа', title: 'Телефоны', sub: 'парами: 99 12 34 56', kind: 'input', inputmode: 'numeric', placeholder: '99 12 34 56',
    options: [DIR],
    size: () => null,
    gen() {
      const p = pick(['99', '99', '97', '96', '95', '22', '25', '24', '26']) + Array.from({ length: 6 }, () => rnd(0, 9)).join('');
      const shown = p.match(/\d{2}/g).join(' ');
      return { key: p, say: G.phone(p), display: shown, answer: shown, check: s => digits(s) === p };
    },
    ref: () => ({
      placeholder: '99 12 34 56', inputmode: 'numeric',
      convert(s) {
        const d = digits(s);
        if (!d) return null;
        if (d.length % 2) return { error: 'Нужно чётное количество цифр — номер читается парами' };
        return { rows: [{ label: d.match(/\d{2}/g).join(' '), text: G.phone(d) }] };
      },
    }),
    cheat: () => `<p>Номера диктуют парами: 99 05 23 00 → <span class="greek">ενενήντα εννιά, μηδέν πέντε, είκοσι τρία, μηδέν μηδέν</span>.</p>
      <p>Мобильные на Кипре начинаются с 9 (99, 97, 96, 95), городские — с 2 (22 — Никосия, 25 — Лимасол, 24 — Ларнака, 26 — Пафос).</p>`,
  },
  {
    id: 'time', group: 'Время', title: 'Время', sub: 'и τέταρτο, παρά, μισή', kind: 'input', inputmode: 'numeric', placeholder: '3:45',
    options: [DIR, { key: 'style', label: 'Стиль', values: [['spoken', 'разговорное'], ['digital', 'табло 24ч']] }],
    size: o => (o.style === 'digital' ? 19 * 60 : 144),
    gen(o) {
      if (o.style === 'digital') {
        const h = rnd(5, 23), m = rnd(0, 59);
        const shown = `${h}:${pad2(m)}`;
        return { key: shown, say: G.timeDigital(h, m), display: shown, answer: shown, check: s => checkTime(s, h, m, false) };
      }
      const h = rnd(1, 12), m = rnd(0, 11) * 5;
      const shown = `${h}:${pad2(m)}`;
      return { key: shown, say: G.timeSpoken(h, m), display: shown, answer: shown, check: s => checkTime(s, h, m, true) };
    },
    ref: () => ({
      placeholder: '3:45', inputmode: 'numeric',
      convert(s) {
        const p = parseTime(s);
        if (!p) return s.trim() ? { error: 'Формат: 3:45 или 15:45' } : null;
        if (p.h > 24 || p.m > 59) return { error: 'Часы 0–24, минуты 0–59' };
        const rows = [];
        const h12 = p.h % 12 || 12;
        rows.push({ label: `${h12}:${pad2(p.m)} — разговорное`, text: G.timeSpoken(h12, p.m) });
        if (p.h > 0 && p.h < 24) rows.push({ label: `${p.h}:${pad2(p.m)} — табло, объявления`, text: G.timeDigital(p.h, p.m) });
        return { rows };
      },
    }),
    cheat: () => `<table>
      <tr><td>3:00</td><td class="greek">τρεις η ώρα</td></tr>
      <tr><td>3:10</td><td class="greek">τρεις και δέκα</td></tr>
      <tr><td>3:15</td><td class="greek">τρεις και τέταρτο</td></tr>
      <tr><td>3:30</td><td class="greek">τρεισήμισι</td></tr>
      <tr><td>3:40</td><td class="greek">τέσσερις παρά είκοσι</td></tr>
      <tr><td>3:45</td><td class="greek">τέσσερις παρά τέταρτο</td></tr>
      <tr><td>14:37</td><td class="greek">δεκατέσσερις και τριάντα εφτά</td></tr></table>
      <p>Часы — женский род (η ώρα): <span class="greek">μία, τρεις, τέσσερις</span>. «и» = <span class="greek">και</span>, «без» = <span class="greek">παρά</span>.</p>
      <p>Половины пишутся одним словом: <span class="greek">μιάμιση, δυόμισι, τρεισήμισι, τεσσερισήμισι, πεντέμισι, εξίμισι, εφτάμισι, οχτώμισι, εννιάμισι, δεκάμισι, εντεκάμισι, δωδεκάμισι</span>.</p>
      <p><span class="greek">Τι ώρα είναι;</span> — который час? <span class="greek">στις πέντε</span> — в пять.</p>`,
  },
  {
    id: 'dates', group: 'Время', title: 'Даты', sub: 'πέντε Μαρτίου → 5.3', kind: 'input', inputmode: 'decimal', placeholder: '5.3',
    options: [DIR],
    size: () => 365,
    gen() {
      const m = rnd(1, 12);
      const d = rnd(1, DAYS_IN_MONTH[m - 1]);
      const shown = `${d}.${pad2(m)}`;
      return { key: shown, say: G.date(d, m), display: `${d} ${MONTHS_RU_GEN[m - 1]}`, answer: shown, check: s => checkDate(s, d, m) };
    },
    ref: () => ({
      placeholder: '5.3', inputmode: 'decimal',
      convert(s) {
        const p = parseDate(s);
        if (!p) return s.trim() ? { error: 'Формат: день.месяц, например 5.3' } : null;
        if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > (p.m === 2 ? 29 : DAYS_IN_MONTH[p.m - 1])) return { error: 'Такой даты нет' };
        return { rows: [{ label: `${p.d} ${MONTHS_RU_GEN[p.m - 1]}`, text: G.date(p.d, p.m) }] };
      },
    }),
    cheat: () => `<p>Число месяца — женский род (η ημέρα), месяц — в родительном падеже: <span class="greek">πέντε Μαρτίου, είκοσι μία Μαΐου</span>. Первое число — порядковое: <span class="greek">πρώτη Ιανουαρίου</span>.</p>
      <table>${G.MONTHS.map((mo, i) => `<tr><td>${G.MONTHS_RU[i]}</td><td class="greek">${mo}</td><td class="greek">${G.MONTHS_GEN[i]}</td></tr>`).join('')}</table>`,
  },
  {
    id: 'calendar', group: 'Время', title: 'Дни и месяцы', sub: 'слушай → выбери', kind: 'choice', listen: true,
    options: [{ key: 'what', label: 'Что', values: [['days', 'дни недели'], ['months', 'месяцы']] }],
    size: o => (o.what === 'months' ? 12 : 7),
    gen(o) {
      const isDays = o.what !== 'months';
      const gr = isDays ? G.DAYS : G.MONTHS, ru = isDays ? G.DAYS_RU : G.MONTHS_RU;
      const i = rnd(0, gr.length - 1);
      return {
        key: i,
        say: gr[i],
        choices: ru.map((r, j) => ({ label: r, ok: j === i })),
        grid: isDays ? 'g7' : 'g12',
        answer: ru[i], greek: gr[i],
      };
    },
    ref: () => ({
      html: `<h3>Дни недели</h3><table class="ref">${G.DAYS.map((d, i) => `<tr ${sayAttr(d)}><td class="greek">${d}</td><td>${G.DAYS_RU[i]}</td></tr>`).join('')}</table>
        <h3>Месяцы</h3><table class="ref">${G.MONTHS.map((m, i) => `<tr ${sayAttr(m)}><td class="greek">${m}<br><small>${G.MONTHS_GEN[i]}</small></td><td>${G.MONTHS_RU[i]}</td></tr>`).join('')}</table>`,
    }),
    cheat: () => `<p>Δευτέρα — «второй», Τρίτη — «третий», Τετάρτη — «четвёртый», Πέμπτη — «пятый» день от воскресенья. <span class="greek">σήμερα</span> — сегодня, <span class="greek">αύριο</span> — завтра, <span class="greek">χθες</span> — вчера.</p>`,
  },
];

MODES.push(...FW_MODES);

const GOALS = {
  prices: [], phone: [],
  time: [{ dir: 'listen', style: 'spoken' }, { dir: 'read', style: 'spoken' }],
  dates: [{ dir: 'listen' }, { dir: 'read' }],
  calendar: [{ what: 'days' }, { what: 'months' }],
};
for (const m of MODES) if (!m.goals) m.goals = GOALS[m.id] || [{}];

const WEIGHTS = {
  letters: 2, letterNames: 1, digraphs: 1, digraphSounds: 1, reading: 3,
  numbers: 20, time: 5, dates: 4, calendar: 1,
  fwMean: 15, fwGreek: 12, fwListen: 8, fwGap: 12, fwTraps: 3, tblFill: 4, tblPick: 4, tblWhat: 4,
};

for (const m of MODES) {
  if (!m.scopeOpts || m.scopeOpts.length) continue;
  for (const k of Object.keys(items)) {
    if (!k.startsWith(`${m.id}|`)) continue;
    const dst = (items[m.id] ||= {});
    for (const [key, v] of Object.entries(items[k])) dst[key] = Math.max(dst[key] || 0, v);
    delete items[k];
  }
}
save('gt.items', items);

const days = load('gt.days', {});
const DAY_GOAL = 20;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function bumpDay() {
  const k = dayKey();
  days[k] = (days[k] || 0) + 1;
  save('gt.days', days);
}
function streak() {
  const d = new Date();
  if ((days[dayKey(d)] || 0) < DAY_GOAL) d.setDate(d.getDate() - 1);
  let n = 0;
  while ((days[dayKey(d)] || 0) >= DAY_GOAL) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

function modeDone(m) {
  const parts = m.goals.map(g => {
    const o = { ...optsFor(m), ...g };
    const total = m.size ? m.size(o) : 0;
    return total ? Math.min(1, learnedCount(m, o) / total) : null;
  }).filter(v => v !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

function overallHtml() {
  let sum = 0, wsum = 0;
  for (const m of MODES) {
    const w = WEIGHTS[m.id] || 0, v = w ? modeDone(m) : null;
    if (v === null) continue;
    sum += w * v;
    wsum += w;
  }
  const total = wsum ? sum / wsum : 0;
  const st = streak(), today = days[dayKey()] || 0;
  const pctS = `${total > 0 && total < 0.01 ? '<1' : Math.floor(total * 100)}%`;
  return `<div class="overall">
    <div class="ovtop"><b>Язык пройден на ${pctS}</b><span>🔥 ${st} ${plural(st, 'день', 'дня', 'дней')} подряд</span></div>
    <div class="bar"><i style="width:${(total * 100).toFixed(1)}%"></i></div>
    <div class="ovday">Сегодня: ${today} из ${DAY_GOAL} ответов${today >= DAY_GOAL ? ' ✓' : ''}</div>
  </div>`;
}

function numbersCheat() {
  const row = ns => ns.map(n => `<tr><td>${fmtInt(n)}</td><td class="greek">${G.num(n)}</td></tr>`).join('');
  return `<table>${row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 30, 40, 50, 60, 70, 80, 90, 100, 101, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 1000000])}</table>
    <p>1, 3, 4 и сотни меняются по родам: <span class="greek">ένας άντρας, μία γυναίκα, ένα παιδί; τρεις/τέσσερις</span> для м. и ж. рода, <span class="greek">τρία/τέσσερα</span> для среднего. <span class="greek">χιλιάδες</span> — женский род: <span class="greek">τρεις χιλιάδες, διακόσιες χιλιάδες</span>.</p>
    <p>7, 8, 9 имеют книжные варианты: <span class="greek">επτά, οκτώ, εννέα</span>. Разговорные (<span class="greek">εφτά, οχτώ, εννιά</span>) услышишь чаще.</p>`;
}

function optsFor(mode) {
  const o = { ...(modeOpts[mode.id] || {}) };
  for (const op of mode.options || []) if (!op.values.some(v => v[0] === o[op.key])) o[op.key] = op.values[0][0];
  for (const [k, v] of Object.entries(mode.defaults || {})) if (o[k] === undefined) o[k] = v;
  return o;
}

const scopeId = (mode, o) => [mode.id, ...(mode.options || []).filter(op => !mode.scopeOpts || mode.scopeOpts.includes(op.key)).map(op => o[op.key]), mode.scopeExtra ? mode.scopeExtra(o) : ''].filter(Boolean).join('|');

function learnedCount(mode, o) {
  const sc = items[scopeId(mode, o)] || {};
  const need = mode.need || 2;
  if (mode.units) return mode.units(o).filter(k => (sc[k] || 0) >= need).length;
  return Object.values(sc).filter(v => v >= need).length;
}

function progressText(mode, o) {
  const n = learnedCount(mode, o);
  const total = mode.size ? mode.size(o) : null;
  return total ? `выучено ${n} из ${total}` : `выучено ${n}`;
}

function recordItem(mode, o, q, ok, given, cheated) {
  if (q.key === undefined) return;
  const sc = (items[scopeId(mode, o)] ||= {});
  if (mode.record) mode.record(sc, q, given, ok, cheated);
  else sc[q.key] = ok ? (sc[q.key] || 0) + 1 : 0;
  save('gt.items', items);
}

function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if ((h[0] === 'mode' || h[0] === 'ref') && MODES.some(m => m.id === h[1])) return { name: h[0], id: h[1] };
  if (h[0] === 'settings') return { name: 'settings', id: MODES.some(m => m.id === h[1]) ? h[1] : null };
  return { name: 'home' };
}

const view = $('#view');
const title = $('#title');
const backBtn = $('#back');

function render() {
  const r = route();
  stopSpeech();
  backBtn.hidden = r.name === 'home';
  activeMode = r.id || null;
  $('#ver').textContent = r.name === 'home' ? `v${VERSION.n} · ${VERSION.date}` : `v${VERSION.n}`;
  $('#settingsBtn').href = r.id ? `#/settings/${r.id}` : '#/settings';
  $('#settingsBtn').hidden = r.name === 'settings';
  if (r.name === 'mode') renderMode(MODES.find(m => m.id === r.id));
  else if (r.name === 'ref') renderRef(MODES.find(m => m.id === r.id));
  else if (r.name === 'settings') renderSettings(r.id);
  else renderHome();
  window.scrollTo(0, 0);
}

function pct(id) {
  const s = stats[id];
  if (!s || !s.total) return '';
  return ` · ${Math.round((100 * s.ok) / s.total)}%`;
}

function renderHome() {
  title.textContent = 'Ελληνικά';
  const groups = [...new Set(MODES.map(m => m.group))];
  const warn = voices.length || !('speechSynthesis' in window) ? '' : `<a class="warn" href="#/settings">Греческий голос пока не найден — открой настройки</a>`;
  view.innerHTML = warn + overallHtml() + groups.map(g => `
    <section><h2>${g}</h2><div class="tiles">
      ${MODES.filter(m => m.group === g).map(m => `
        <a class="tile" href="#/mode/${m.id}"><b>${m.title}</b><span>${m.sub}</span><i>${progressText(m, optsFor(m))}${pct(m.id)}</i></a>`).join('')}
    </div></section>`).join('') + `<p class="hint center">«Выучено» — ответил правильно два раза подряд. В «Числах» — каждая цифра в каждом разряде три раза подряд.<br>«Язык пройден» — взвешенно: служебные слова ≈ 60%, числа 20%, время и даты 10%, алфавит 8%. Всё на полном уровне: числа до 10 млн на слух и при чтении, служебные слова уровня «всё». День засчитывается после ${DAY_GOAL} ответов.</p>`;
}

let session = null;
let parked = null;

function renderMode(mode) {
  title.textContent = mode.title;
  const restored = parked && parked.mode === mode && parked.q && !parked.done ? parked : null;
  parked = null;
  session = restored || { mode, opts: optsFor(mode), ok: 0, total: 0, count: 0, retry: [], seen: {}, q: null, done: false, answered: false };
  view.innerHTML = `
    <div class="opts">${(mode.options || []).map(op => `
      <div class="seg" data-key="${op.key}">${op.values.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`).join('')}
      <div id="extra"></div>
    </div>
    <div class="score"><span id="rep"></span><span id="progress"></span><a class="reflink" href="#/ref/${mode.id}">📖 Словарь</a></div>
    <div class="card" id="card"></div>
    <div id="answer"></div>
    <div id="feedback"></div>
    ${mode.cheat ? `<details class="cheat" id="cheat"><summary>Шпаргалка <small>· с ней ответ не засчитывается</small></summary><div>${mode.cheat(session.opts)}</div></details>` : ''}`;
  view.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      session.opts[seg.dataset.key] = b.dataset.v;
      modeOpts[mode.id] = session.opts;
      save('gt.opts', modeOpts);
      session.retry = [];
      session.seen = {};
      syncSegs();
      renderExtra();
      const cd = $('#cheat > div');
      if (cd) cd.innerHTML = mode.cheat(session.opts);
      nextQuestion();
    });
  });
  renderExtra();
  $('#cheat')?.addEventListener('toggle', e => { if (e.target.open && !session.done) { session.cheated = true; updateScore(); } });
  syncSegs();
  if (restored) renderQuestion();
  else nextQuestion();
}

function renderExtra() {
  const box = $('#extra');
  const { mode, opts } = session;
  if (!box || !mode.extra) return;
  box.innerHTML = mode.extra(opts);
  const f = $('#rangeForm');
  if (!f) return;
  const apply = () => {
    if (!mode.readExtra(opts)) return;
    modeOpts[mode.id] = opts;
    save('gt.opts', modeOpts);
    session.retry = [];
    session.seen = {};
    nextQuestion();
  };
  f.addEventListener('submit', e => { e.preventDefault(); apply(); document.activeElement?.blur(); });
  f.querySelectorAll('input').forEach(i => i.addEventListener('change', apply));
}

function syncSegs() {
  view.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', session.opts[seg.dataset.key] === b.dataset.v));
  });
}

function updateScore() {
  const s = session;
  $('#rep').innerHTML = [s.q?.repeat ? '↻ повтор' : '', s.cheated && !s.done ? '<span class="peek">👀 подсмотрено</span>' : ''].filter(Boolean).join(' ');
  $('#progress').textContent = `${progressText(s.mode, s.opts)}${s.total ? ` · ✓ ${s.ok}/${s.total}` : ''}`;
}

function isListen() {
  const { mode, opts } = session;
  if (mode.kind === 'input') return opts.dir === 'listen';
  return !!mode.listen;
}

let autoTimer = null;
let autoToken = 0;
function scheduleAutoNext() {
  clearTimeout(autoTimer);
  const s = session;
  const token = ++autoToken;
  const started = Date.now();
  const minMs = cfg().autoNextDelay * 1000;
  const go = () => { if (token === autoToken && session === s && s.done) nextQuestion(); };
  if (cfg().waitSpeech) {
    speechDone.then(() => {
      if (token !== autoToken) return;
      autoTimer = setTimeout(go, Math.max(0, minMs - (Date.now() - started)));
    });
  } else {
    autoTimer = setTimeout(go, minMs);
  }
}

function pickFresh(s) {
  const streaks = items[scopeId(s.mode, s.opts)] || {};
  const prev = s.q?.key;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 40; i++) {
    const q = s.mode.gen(s.opts);
    const base = s.mode.freshScore ? s.mode.freshScore(q, streaks) : Math.min(streaks[q.key] || 0, 5);
    const score = (q.key === prev ? 1000 : 0) + (s.seen[q.key] || 0) * 10 + base + Math.random();
    if (score < bestScore) { best = q; bestScore = score; }
  }
  return best;
}

function nextQuestion() {
  clearTimeout(autoTimer);
  autoToken++;
  const s = session;
  s.count++;
  s.done = false;
  s.answered = false;
  s.cheated = false;
  const ch = $('#cheat');
  if (ch) ch.open = false;
  const due = s.retry.findIndex(r => r.due <= s.count && r.q !== s.q);
  if (due >= 0) {
    s.q = s.retry.splice(due, 1)[0].q;
    s.q.repeat = true;
    if (s.q.choices) s.q.choices = shuffle(s.q.choices);
  } else {
    s.q = pickFresh(s);
  }
  s.seen[s.q.key] = (s.seen[s.q.key] || 0) + 1;
  renderQuestion();
}

function playButtons() {
  return `<div class="play"><button data-act="play">🔊 Ещё раз</button><button data-act="slow">🐢 Медленно</button></div>`;
}

function renderQuestion() {
  const { mode, q } = session;
  const listen = isListen();
  const card = $('#card'), ans = $('#answer');
  $('#feedback').innerHTML = '';
  updateScore();

  const read = mode.kind === 'input' && session.opts.dir === 'read';
  if (mode.kind === 'input' && (listen || read)) {
    card.innerHTML = listen
      ? `<div class="listen">🎧</div><p class="hint">Послушай и запиши цифрами</p>${playButtons()}`
      : `<div class="mid greek readq">${esc(q.say)}</div><p class="hint">Прочитай и запиши цифрами</p>`;
    ans.innerHTML = `<form class="inp"><input id="inp" inputmode="${mode.inputmode}" autocomplete="off" placeholder="${mode.placeholder} · пусто = не знаю"><button>Проверить</button></form>`;
    const f = $('form', ans), inp = $('#inp');
    f.addEventListener('submit', e => { e.preventDefault(); const v = inp.value.trim(); grade(!!v && q.check(v), v || null); });
    inp.focus();
  } else if (mode.kind === 'input' || mode.kind === 'card') {
    const shown = mode.kind === 'input' ? `<span class="mid">${esc(q.display)}</span>` : q.prompt;
    card.innerHTML = `${shown}<p class="hint">${q.hint || 'Скажи вслух по-гречески'}</p>`;
    ans.innerHTML = `<button class="wide" data-act="reveal">Показать ответ</button>`;
  } else {
    card.innerHTML = listen ? `<div class="listen">🎧</div>${playButtons()}` : q.prompt + (q.say ? playButtons() : '');
    ans.innerHTML = `<div class="choices ${q.grid || ''}">${q.choices.map((c, i) => `<button data-choice="${i}" class="${c.greek ? 'greek' : ''}">${esc(c.label)}</button>`).join('')}</div><button class="wide ghost2 idk" data-act="idk">🤷 Не знаю</button>`;
  }
  if ((listen || (mode.kind === 'choice' && q.say)) && cfg().autoplay) setTimeout(() => { if (session?.q === q && !session.answered) speak(q.say); }, 250);
}

function grade(ok, given, feedback = true) {
  const s = session;
  if (s.done) return;
  s.done = true;
  const cheated = !!s.cheated;
  const raw = ok;
  ok = ok && !cheated;
  s.total++;
  if (ok) s.ok++;
  const q = s.q;
  if (!ok) {
    q.need = 2;
    s.retry.push({ q, due: s.count + rnd(2, 5) });
  } else if (q.need > 0 && --q.need > 0) {
    s.retry.push({ q, due: s.count + rnd(5, 9) });
  }
  const st = (stats[s.mode.id] ||= { ok: 0, total: 0 });
  st.total++;
  if (ok) st.ok++;
  save('gt.stats', stats);
  recordItem(s.mode, s.opts, q, ok, given, cheated);
  bumpDay();
  updateScore();
  if (feedback) showFeedback(raw, given, cheated);
}

function showFeedback(ok, given, cheated = false) {
  const { mode, q } = session;
  session.answered = true;
  const greekText = q.say && mode.kind === 'input' ? q.say : q.greek;
  const head = ok === null ? '' : ok && cheated ? `<div class="res cheat">Верно, но с подсказкой — не засчитано</div>` : ok ? `<div class="res ok">Верно</div>` : given === null ? `<div class="res bad">Не знаю</div>` : `<div class="res bad">Неверно${given ? `: <s>${esc(given)}</s>` : ''}</div>`;
  $('#feedback').innerHTML = `
    <div class="fb ${ok === false ? 'bad' : ok && cheated ? 'cheat' : ok ? 'ok' : ''}">
      ${head}
      <div class="ans">${esc(q.answer)}</div>
      ${greekText ? `<div class="gr greek">${esc(greekText)}</div>` : ''}
      ${q.html || ''}
      ${q.say || q.sayAfter ? playButtons() : ''}
      ${ok === null
        ? `<div class="self"><button data-act="know">✓ Знал</button><button data-act="dontknow">✗ Не знал</button></div>`
        : `<button class="wide" data-act="next" id="nextBtn">Дальше</button>`}
    </div>`;
  const ans = $('#answer');
  if (mode.kind === 'choice') {
    const idk = $('.idk', ans);
    if (idk) idk.hidden = true;
    ans.querySelectorAll('[data-choice]').forEach(b => {
      const c = q.choices[+b.dataset.choice];
      b.disabled = true;
      if (c.ok) b.classList.add('right');
    });
  } else if (ok !== null) {
    const inp = $('#inp');
    if (inp) inp.disabled = true;
  } else {
    ans.innerHTML = '';
  }
  $('#nextBtn')?.focus({ preventScroll: true });
  $('#feedback').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (q.sayAfter || mode.kind === 'card' || (mode.kind === 'input' && !isListen())) speak(q.sayAfter || q.say);
  if (ok === true && !cheated && cfg().autoNext) scheduleAutoNext();
}

function renderRef(mode) {
  title.textContent = `Словарь: ${mode.title}`;
  const ref = mode.ref(optsFor(mode));
  if (ref.html) {
    view.innerHTML = `<p class="hint">Нажми на строку или слово, чтобы послушать.</p>${ref.html}
      <a class="wide btnlink" href="#/mode/${mode.id}">К упражнению</a>`;
    return;
  }
  view.innerHTML = `
    <p class="hint">Введи значение — покажу, как это пишется и звучит.</p>
    <form class="inp" id="convForm"><input id="convIn" inputmode="${ref.inputmode}" autocomplete="off" placeholder="${ref.placeholder}"><button>🔊</button></form>
    <div id="convOut"></div>
    <a class="wide btnlink" href="#/mode/${mode.id}">К упражнению</a>`;
  const inp = $('#convIn'), out = $('#convOut');
  let last = null;
  const update = () => {
    const r = ref.convert(inp.value);
    last = r;
    if (!r) { out.innerHTML = ''; return; }
    if (r.error) { out.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
    out.innerHTML = r.rows.map(row => `
      <div class="conv" ${sayAttr(row.text)}>
        <small>${esc(row.label)}</small>
        <div class="greek">${esc(row.text)}</div>
      </div>`).join('');
  };
  inp.addEventListener('input', update);
  $('#convForm').addEventListener('submit', e => { e.preventDefault(); update(); if (last?.rows) speak(last.rows[0].text); });
  inp.focus();
}

view.addEventListener('click', e => {
  const sayEl = e.target.closest('[data-say]');
  if (sayEl) {
    try { speak(JSON.parse(sayEl.dataset.say)); } catch {}
    return;
  }
  const b = e.target.closest('button');
  if (!b || !session) return;
  const q = session.q;
  const act = b.dataset.act;
  const what = session.answered ? q.sayAfter || q.say : q.say || q.sayAfter;
  if (act === 'play') speak(what);
  else if (act === 'slow') speak(what, 0.6);
  else if (act === 'next') nextQuestion();
  else if (act === 'idk' && !session.done) grade(false, null);
  else if (act === 'reveal') { session.done = false; showFeedback(null); }
  else if (act === 'know' || act === 'dontknow') {
    session.done = false;
    grade(act === 'know', '', false);
    nextQuestion();
  } else if (b.dataset.choice !== undefined && !session.done) {
    const c = q.choices[+b.dataset.choice];
    if (!c.ok) b.classList.add('wrong');
    grade(c.ok, c.ok ? '' : c.label);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && session?.done && route().name === 'mode' && document.activeElement?.id !== 'inp') {
    e.preventDefault();
    nextQuestion();
  }
});

function renderSettings(modeId) {
  const mode = MODES.find(m => m.id === modeId);
  title.textContent = mode ? `Настройки: ${mode.title}` : 'Общие настройки';
  const tts = 'speechSynthesis' in window;
  const c = cfg();
  const own = mode ? modeSettings[mode.id] || {} : null;
  const mark = k => (own && k in own ? ' <span class="own">своё</span>' : '');
  view.innerHTML = `
    <section class="settings">
      ${!tts ? `<p class="warn">Браузер не поддерживает синтез речи. Открой в Chrome.</p>` : ''}
      ${tts && !voices.length ? `<div class="warn">Греческий голос не найден. На Android: Настройки → Система → Язык и ввод → Синтез речи → Google → ⚙ → Установить голосовые данные → Ελληνικά. Потом перезапусти Chrome.</div>` : ''}
      <p class="hint">${mode
        ? `Действуют только в упражнении «${esc(mode.title)}». Что не меняешь здесь, берётся из <a href="#/settings">общих настроек</a>.`
        : 'Общие настройки для всех упражнений. В каждом упражнении можно задать свои: ⚙ внутри упражнения.'}</p>
      ${mode ? '' : `<label>Голос
        <select id="voice">${voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === settings.voice ? 'selected' : ''}>${esc(v.name)}${v.localService ? '' : ' (онлайн)'}</option>`).join('') || '<option>—</option>'}</select>
      </label>`}
      <label>Скорость речи: <b id="rateV">${c.rate.toFixed(2)}</b>${mark('rate')}
        <input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${c.rate}">
      </label>
      <label class="row"><input type="checkbox" id="autoplay" ${c.autoplay ? 'checked' : ''}> Проигрывать задание сразу${mark('autoplay')}</label>
      <label>Пауза между сочетанием и словом: <b id="seqV">${c.seqPause.toFixed(1)} с</b>${mark('seqPause')}
        <input type="range" id="seq" min="0" max="3" step="0.1" value="${c.seqPause}">
      </label>
      <label class="row"><input type="checkbox" id="autoNext" ${c.autoNext ? 'checked' : ''}> Сразу дальше после правильного ответа${mark('autoNext')}</label>
      <label class="row"><input type="checkbox" id="waitSpeech" ${c.waitSpeech ? 'checked' : ''}> Не переключать, пока идёт озвучка${mark('waitSpeech')}</label>
      <label>Задержка перед следующим (считается от ответа): <b id="delayV">${c.autoNextDelay.toFixed(1)} с</b>${mark('autoNextDelay')}
        <input type="range" id="delay" min="0" max="5" step="0.1" value="${c.autoNextDelay}">
      </label>
      <button class="wide" id="test">🔊 Проверить голос</button>
      ${mode ? `<button class="wide ghost2" id="resetMode">Вернуть общие настройки</button>
        <a class="wide btnlink" href="#/mode/${mode.id}">К упражнению</a>` : `<button class="wide ghost" id="reset">Сбросить статистику</button>
      <p class="hint">Установить как приложение: меню Chrome ⋮ → «Добавить на главный экран». После первой загрузки работает без интернета.</p>`}
    </section>`;
  const set = (k, v) => {
    if (mode) {
      (modeSettings[mode.id] ||= {})[k] = v;
      save('gt.modeSettings', modeSettings);
    } else {
      settings[k] = v;
      save('gt.settings', settings);
    }
  };
  if (!mode) $('#voice').onchange = e => { settings.voice = e.target.value; save('gt.settings', settings); };
  $('#rate').oninput = e => { set('rate', +e.target.value); $('#rateV').textContent = (+e.target.value).toFixed(2); };
  $('#autoplay').onchange = e => set('autoplay', e.target.checked);
  $('#seq').oninput = e => { set('seqPause', +e.target.value); $('#seqV').textContent = `${(+e.target.value).toFixed(1)} с`; };
  $('#delay').oninput = e => { set('autoNextDelay', +e.target.value); $('#delayV').textContent = `${(+e.target.value).toFixed(1)} с`; };
  $('#autoNext').onchange = e => set('autoNext', e.target.checked);
  $('#waitSpeech').onchange = e => set('waitSpeech', e.target.checked);
  $('#test').onclick = () => speak('Καλημέρα! Δεκατέσσερα ευρώ και εβδομήντα λεπτά.');
  if (mode) {
    $('#resetMode').onclick = () => { delete modeSettings[mode.id]; save('gt.modeSettings', modeSettings); renderSettings(mode.id); };
  } else {
    $('#reset').onclick = () => {
      if (!confirm('Сбросить статистику и прогресс?')) return;
      for (const k in stats) delete stats[k];
      for (const k in items) delete items[k];
      save('gt.stats', stats);
      save('gt.items', items);
    };
  }
}

backBtn.addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = ''; });
window.addEventListener('hashchange', () => {
  clearTimeout(autoTimer);
  autoToken++;
  const r = route();
  if (session && r.id === session.mode.id && (r.name === 'ref' || r.name === 'settings')) {
    parked = session;
    if (r.name === 'ref' && !session.done) parked.cheated = true;
  } else if (!parked || r.id !== parked.mode.id) {
    parked = null;
  }
  session = null;
  render();
});
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
