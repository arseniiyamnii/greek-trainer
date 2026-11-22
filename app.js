import * as G from './greek.js';
import { LETTERS, DIGRAPHS, WORDS } from './data.js';

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
  if (r < 0.4) return d;
  if (r < 0.8) return d[0].toUpperCase() + d.slice(1);
  return d.toUpperCase();
};

function load(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; } catch { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const settings = Object.assign({ rate: 0.9, voice: '', autoplay: true, autoNext: true, autoNextDelay: 0 }, load('gt.settings', {}));
const stats = load('gt.stats', {});
const modeOpts = load('gt.opts', {});

let voices = [];
function refreshVoices() {
  voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^el/i.test(v.lang));
}
if ('speechSynthesis' in window) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = () => { refreshVoices(); if (route().name === 'settings') renderSettings(); };
}

function speak(text, mul = 1) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'el-GR';
  const v = voices.find(v => v.voiceURI === settings.voice) || voices[0];
  if (v) u.voice = v;
  u.rate = Math.max(0.3, settings.rate * mul);
  speechSynthesis.speak(u);
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

const DIR = { key: 'dir', label: 'Режим', values: [['listen', 'Слушать'], ['speak', 'Говорить']] };

const MODES = [
  {
    id: 'letters', group: 'Алфавит', title: 'Буквы', sub: 'буква → звук', kind: 'choice',
    gen() {
      const L = pick(LETTERS);
      const traps = (L.trap || []).filter(() => Math.random() < 0.8);
      const others = choicesFrom(L, LETTERS, x => x.sound).filter(o => o !== L).map(o => o.sound);
      const labels = [L.sound, ...traps, ...others].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
      return {
        prompt: `<span class="big greek">${oneCase(L)}</span>`,
        choices: shuffle(labels).map(l => ({ label: l, ok: l === L.sound })),
        answer: `${L.up} ${L.lo} — ${L.sound}`,
        greek: `${L.name} (${L.ru})${L.note ? ` · ${L.note}` : ''}`,
        sayAfter: L.name,
      };
    },
    cheat: () => `<table>${LETTERS.map(l => `<tr><td class="greek">${l.up} ${l.lo}</td><td>${l.ru}</td><td>${l.sound}${l.note ? `<br><small>${l.note}</small>` : ''}</td></tr>`).join('')}</table>
      <p>Многие буквы похожи на русские и читаются так же (α, κ, μ, ο, π, τ, ς), но есть обманки: Η — и, ν — н, Υ — и, Δ — ð, Β — в, ρ — р, ω — о.</p>
      <p>Звук «и» дают сразу пять написаний: η, ι, υ, ει, οι. Звук «о» — ο и ω. Ударение ставится всегда (знак ´), кроме односложных слов.</p>`,
  },
  {
    id: 'letterNames', group: 'Алфавит', title: 'Названия букв', sub: 'слушай → выбери букву', kind: 'choice', listen: true,
    gen() {
      const L = pick(LETTERS);
      const opts = choicesFrom(L, LETTERS, x => x.up);
      return {
        say: L.name,
        choices: opts.map(o => ({ label: oneCase(o), ok: o === L, greek: true })),
        answer: `${L.up} ${L.lo}`,
        greek: `${L.name} (${L.ru})`,
      };
    },
    cheat: () => `<table>${LETTERS.map(l => `<tr><td class="greek">${l.up} ${l.lo}</td><td class="greek">${l.name}</td><td>${l.ru}</td></tr>`).join('')}</table>`,
  },
  {
    id: 'digraphs', group: 'Алфавит', title: 'Сочетания', sub: 'ου, μπ, ντ, αυ…', kind: 'choice',
    gen() {
      const D = pick(DIGRAPHS);
      const opts = choicesFrom(D, DIGRAPHS, x => x.sound);
      return {
        prompt: `<span class="big greek">${digraphCase(D.g)}</span>`,
        choices: opts.map(o => ({ label: o.sound, ok: o === D })),
        answer: `${D.g} — ${D.sound}`,
        greek: `${D.note ? `${D.note} · ` : ''}пример: ${D.ex}`,
        sayAfter: D.ex.split(',')[0],
      };
    },
    cheat: () => `<table>${DIGRAPHS.map(d => `<tr><td class="greek">${d.g}</td><td>${d.sound}${d.note ? `<br><small>${d.note}</small>` : ''}</td><td class="greek">${d.ex}</td></tr>`).join('')}</table>
      <p>αυ/ευ читаются «ав/эв» перед гласными и звонкими (αυγό, ευρώ), «аф/эф» — перед глухими (αυτοκίνητο, ευχαριστώ).</p>`,
  },
  {
    id: 'reading', group: 'Алфавит', title: 'Чтение', sub: 'вывески, меню, города', kind: 'card',
    gen() {
      const [w, tr, ru] = pick(WORDS);
      const caps = Math.random() < 0.4;
      const shown = caps ? w.normalize('NFD').replace(/\u0301/g, '').normalize('NFC').toUpperCase() : w;
      return {
        prompt: `<span class="mid greek">${shown}</span>`,
        hint: caps ? 'Как на вывеске: заглавными и без ударений' : 'Прочитай вслух, потом проверь',
        answer: tr, greek: caps ? `${w} — ${ru}` : ru, sayAfter: w,
      };
    },
    cheat: () => `<p>ð — как th в англ. <i>this</i>, θ — как th в <i>think</i>. Ударная гласная отмечена знаком ´.</p><p>Заглавными буквами ударение не пишут: ΦΑΡΜΑΚΕΙΟ = φαρμακείο. Ударение приходится угадывать или знать.</p>`,
  },
  {
    id: 'numbers', group: 'Числа', title: 'Числа', sub: 'от нуля до миллиона', kind: 'input', inputmode: 'numeric', placeholder: 'число',
    options: [DIR, { key: 'range', label: 'Диапазон', values: [['9', '0–9'], ['10-20', '10–20'], ['100', '0–100'], ['1000', '100–999'], ['1e4', '1 000–9 999'], ['1e6', 'до 1 млн']] }],
    gen(o) {
      let n;
      if (o.range === '9') n = rnd(0, 9);
      else if (o.range === '10-20') n = rnd(10, 20);
      else if (o.range === '100') n = rnd(0, 100);
      else if (o.range === '1000') n = rnd(100, 999);
      else if (o.range === '1e4') n = rnd(1000, 9999);
      else n = Math.random() < 0.5 ? rnd(10, 999) * 1000 : rnd(1000, 999999);
      return { say: G.num(n), display: fmtInt(n), answer: fmtInt(n), check: s => digits(s) === String(n) && digits(s).length > 0 };
    },
    cheat: () => numbersCheat(),
  },
  {
    id: 'prices', group: 'Числа', title: 'Цены', sub: 'евро и центы', kind: 'input', inputmode: 'decimal', placeholder: '14,70',
    options: [DIR, { key: 'tier', label: 'Цены', values: [['small', 'мелочь'], ['shop', 'магазин'], ['rent', 'аренда'], ['mix', 'всё']] }],
    gen(o) {
      const tier = o.tier === 'mix' ? pick(['small', 'shop', 'rent']) : o.tier;
      let e, c;
      if (tier === 'small') { e = rnd(0, 9); c = Math.random() < 0.8 ? rnd(0, 19) * 5 : rnd(1, 99); if (!e && !c) c = 50; }
      else if (tier === 'shop') { e = rnd(1, 99); c = pick([0, 0, 50, 99, 49, 95, rnd(1, 19) * 5]); }
      else { e = rnd(6, 60) * 50; c = 0; }
      const style = tier !== 'rent' && e && c && Math.random() < 0.4 ? 'short' : 'full';
      const shown = c ? `${fmtInt(e)},${pad2(c)} €` : `${fmtInt(e)} €`;
      return { say: G.price(e, c, style), display: shown, answer: shown, check: s => checkPrice(s, e, c) };
    },
    cheat: () => `<p><b class="greek">δεκατέσσερα ευρώ και εβδομήντα λεπτά</b> — 14,70 €. В магазине часто коротко: <b class="greek">δεκατέσσερα και εβδομήντα</b>.</p>
      <p>ευρώ не склоняется. Цент — <span class="greek">το λεπτό / τα λεπτά</span>. Оба слова среднего рода, поэтому числа в форме среднего рода: <span class="greek">τρία, τέσσερα, διακόσια, χίλια</span>.</p>
      <p><span class="greek">Πόσο κάνει;</span> — сколько стоит? <span class="greek">Πόσο κάνουν;</span> — сколько стоят?</p>`,
  },
  {
    id: 'phone', group: 'Числа', title: 'Телефоны', sub: 'парами: 99 12 34 56', kind: 'input', inputmode: 'numeric', placeholder: '99 12 34 56',
    options: [DIR],
    gen() {
      const p = pick(['99', '99', '97', '96', '95', '22', '25', '24', '26']) + Array.from({ length: 6 }, () => rnd(0, 9)).join('');
      const shown = p.match(/\d{2}/g).join(' ');
      return { say: G.phone(p), display: shown, answer: shown, check: s => digits(s) === p };
    },
    cheat: () => `<p>Номера диктуют парами: 99 05 23 00 → <span class="greek">ενενήντα εννιά, μηδέν πέντε, είκοσι τρία, μηδέν μηδέν</span>.</p>
      <p>Мобильные на Кипре начинаются с 9 (99, 97, 96, 95), городские — с 2 (22 — Никосия, 25 — Лимасол, 24 — Ларнака, 26 — Пафос).</p>`,
  },
  {
    id: 'time', group: 'Время', title: 'Время', sub: 'и τέταρτο, παρά, μισή', kind: 'input', inputmode: 'numeric', placeholder: '3:45',
    options: [DIR, { key: 'style', label: 'Стиль', values: [['spoken', 'разговорное'], ['digital', 'табло 24ч']] }],
    gen(o) {
      if (o.style === 'digital') {
        const h = rnd(5, 23), m = rnd(0, 59);
        const shown = `${h}:${pad2(m)}`;
        return { say: G.timeDigital(h, m), display: shown, answer: shown, check: s => checkTime(s, h, m, false) };
      }
      const h = rnd(1, 12), m = rnd(0, 11) * 5;
      const shown = `${h}:${pad2(m)}`;
      return { say: G.timeSpoken(h, m), display: shown, answer: shown, check: s => checkTime(s, h, m, true) };
    },
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
    gen() {
      const m = rnd(1, 12);
      const d = rnd(1, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);
      const shown = `${d}.${pad2(m)}`;
      return {
        say: G.date(d, m), display: `${d} ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][m - 1]}`,
        answer: shown, check: s => checkDate(s, d, m),
      };
    },
    cheat: () => `<p>Число месяца — женский род (η ημέρα), месяц — в родительном падеже: <span class="greek">πέντε Μαρτίου, είκοσι μία Μαΐου</span>. Первое число — порядковое: <span class="greek">πρώτη Ιανουαρίου</span>.</p>
      <table>${G.MONTHS.map((mo, i) => `<tr><td>${G.MONTHS_RU[i]}</td><td class="greek">${mo}</td><td class="greek">${G.MONTHS_GEN[i]}</td></tr>`).join('')}</table>`,
  },
  {
    id: 'calendar', group: 'Время', title: 'Дни и месяцы', sub: 'слушай → выбери', kind: 'choice', listen: true,
    options: [{ key: 'what', label: 'Что', values: [['days', 'дни недели'], ['months', 'месяцы']] }],
    gen(o) {
      const isDays = o.what !== 'months';
      const gr = isDays ? G.DAYS : G.MONTHS, ru = isDays ? G.DAYS_RU : G.MONTHS_RU;
      const i = rnd(0, gr.length - 1);
      return {
        say: gr[i],
        choices: ru.map((r, j) => ({ label: r, ok: j === i })),
        grid: isDays ? 'g7' : 'g12',
        answer: ru[i], greek: gr[i],
      };
    },
    cheat: () => `<table>${G.DAYS.map((d, i) => `<tr><td>${G.DAYS_RU[i]}</td><td class="greek">${d}</td></tr>`).join('')}</table>
      <p>Δευτέρα — «второй», Τρίτη — «третий», Τετάρτη — «четвёртый», Πέμπτη — «пятый» день от воскресенья. <span class="greek">σήμερα</span> — сегодня, <span class="greek">αύριο</span> — завтра, <span class="greek">χθες</span> — вчера.</p>`,
  },
];

function numbersCheat() {
  const row = ns => ns.map(n => `<tr><td>${fmtInt(n)}</td><td class="greek">${G.num(n)}</td></tr>`).join('');
  return `<table>${row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 30, 40, 50, 60, 70, 80, 90, 100, 101, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 1000000])}</table>
    <p>1, 3, 4 и сотни меняются по родам: <span class="greek">ένας άντρας, μία γυναίκα, ένα παιδί; τρεις/τέσσερις</span> для м. и ж. рода, <span class="greek">τρία/τέσσερα</span> для среднего. <span class="greek">χιλιάδες</span> — женский род: <span class="greek">τρεις χιλιάδες, διακόσιες χιλιάδες</span>.</p>
    <p>7, 8, 9 имеют книжные варианты: <span class="greek">επτά, οκτώ, εννέα</span>. Разговорные (<span class="greek">εφτά, οχτώ, εννιά</span>) услышишь чаще.</p>`;
}

function checkPrice(s, e, c) {
  let t = s.replace(/[\s€]/g, '');
  t = t.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const m = t.match(/^(\d*)(?:[.,](\d{1,2}))?$/);
  if (!m || (!m[1] && !m[2])) return false;
  const ee = +(m[1] || 0);
  const cc = m[2] ? +(m[2].length === 1 ? m[2] + '0' : m[2]) : 0;
  return ee === e && cc === c;
}

function checkTime(s, h, m, twelve) {
  const t = s.trim();
  let mm = t.match(/^(\d{1,2})\D+(\d{1,2})$/) || t.match(/^(\d{1,2})(\d{2})$/);
  if (!mm) return false;
  const hh = +mm[1], mi = +mm[2];
  if (mi !== m) return false;
  return twelve ? hh % 12 === h % 12 : hh === h;
}

function checkDate(s, d, m) {
  const mm = s.trim().match(/^(\d{1,2})\D+(\d{1,2})/);
  return !!mm && +mm[1] === d && +mm[2] === m;
}

function optsFor(mode) {
  const o = { ...(modeOpts[mode.id] || {}) };
  for (const op of mode.options || []) if (!op.values.some(v => v[0] === o[op.key])) o[op.key] = op.values[0][0];
  return o;
}

function route() {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (h[0] === 'mode' && MODES.some(m => m.id === h[1])) return { name: 'mode', id: h[1] };
  if (h[0] === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

const view = $('#view');
const title = $('#title');
const backBtn = $('#back');

function render() {
  const r = route();
  if (window.speechSynthesis) speechSynthesis.cancel();
  backBtn.hidden = r.name === 'home';
  if (r.name === 'mode') renderMode(MODES.find(m => m.id === r.id));
  else if (r.name === 'settings') renderSettings();
  else renderHome();
  window.scrollTo(0, 0);
}

function pct(id) {
  const s = stats[id];
  if (!s || !s.total) return '';
  return `${Math.round((100 * s.ok) / s.total)}% · ${s.total}`;
}

function renderHome() {
  title.textContent = 'Ελληνικά';
  const groups = [...new Set(MODES.map(m => m.group))];
  const warn = voices.length || !('speechSynthesis' in window) ? '' : `<a class="warn" href="#/settings">Греческий голос пока не найден — открой настройки</a>`;
  view.innerHTML = warn + groups.map(g => `
    <section><h2>${g}</h2><div class="tiles">
      ${MODES.filter(m => m.group === g).map(m => `
        <a class="tile" href="#/mode/${m.id}"><b>${m.title}</b><span>${m.sub}</span><i>${pct(m.id)}</i></a>`).join('')}
    </div></section>`).join('');
}

let session = null;

function renderMode(mode) {
  title.textContent = mode.title;
  session = { mode, opts: optsFor(mode), ok: 0, total: 0, count: 0, retry: [], q: null, done: false };
  view.innerHTML = `
    <div class="opts">${(mode.options || []).map(op => `
      <div class="seg" data-key="${op.key}">${op.values.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`).join('')}
    </div>
    <div class="score" id="score"></div>
    <div class="card" id="card"></div>
    <div id="answer"></div>
    <div id="feedback"></div>
    <details class="cheat"><summary>Шпаргалка</summary><div>${mode.cheat ? mode.cheat() : ''}</div></details>`;
  view.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      session.opts[seg.dataset.key] = b.dataset.v;
      modeOpts[mode.id] = session.opts;
      save('gt.opts', modeOpts);
      session.retry = [];
      syncSegs();
      nextQuestion();
    });
  });
  syncSegs();
  nextQuestion();
}

function syncSegs() {
  view.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', session.opts[seg.dataset.key] === b.dataset.v));
  });
}

function isListen(q) {
  const { mode, opts } = session;
  if (mode.kind === 'input') return opts.dir !== 'speak';
  return !!mode.listen;
}

let autoTimer = null;
function scheduleAutoNext() {
  clearTimeout(autoTimer);
  const s = session;
  autoTimer = setTimeout(() => { if (session === s && s.done) nextQuestion(); }, settings.autoNextDelay * 1000);
}

function nextQuestion() {
  clearTimeout(autoTimer);
  const s = session;
  s.count++;
  s.done = false;
  const due = s.retry.findIndex(r => r.due <= s.count && r.q !== s.q);
  if (due >= 0) {
    s.q = s.retry.splice(due, 1)[0].q;
    s.q.repeat = true;
    if (s.q.choices) s.q.choices = shuffle(s.q.choices);
  } else {
    s.q = s.mode.gen(s.opts);
  }
  renderQuestion();
}

function playButtons() {
  return `<div class="play"><button data-act="play">🔊 Ещё раз</button><button data-act="slow">🐢 Медленно</button></div>`;
}

function renderQuestion() {
  const { mode, q } = session;
  const listen = isListen(q);
  const card = $('#card'), ans = $('#answer');
  $('#feedback').innerHTML = '';
  $('#score').innerHTML = `${q.repeat ? '<span class="rep">↻ повтор</span>' : ''}${session.total ? `✓ ${session.ok} из ${session.total}` : ''}`;

  if (mode.kind === 'input' && listen) {
    card.innerHTML = `<div class="listen">🎧</div><p class="hint">Послушай и запиши цифрами</p>${playButtons()}`;
    ans.innerHTML = `<form class="inp"><input id="inp" inputmode="${mode.inputmode}" autocomplete="off" placeholder="${mode.placeholder}"><button>Проверить</button></form>`;
    const f = $('form', ans), inp = $('#inp');
    f.addEventListener('submit', e => { e.preventDefault(); if (inp.value.trim()) grade(q.check(inp.value), inp.value); });
    inp.focus();
  } else if (mode.kind === 'input' || mode.kind === 'card') {
    const shown = mode.kind === 'input' ? `<span class="mid">${esc(q.display)}</span>` : q.prompt;
    card.innerHTML = `${shown}<p class="hint">${q.hint || 'Скажи вслух по-гречески'}</p>`;
    ans.innerHTML = `<button class="wide" data-act="reveal">Показать ответ</button>`;
  } else {
    card.innerHTML = listen ? `<div class="listen">🎧</div>${playButtons()}` : q.prompt;
    ans.innerHTML = `<div class="choices ${q.grid || ''}">${q.choices.map((c, i) => `<button data-choice="${i}" class="${c.greek ? 'greek' : ''}">${esc(c.label)}</button>`).join('')}</div>`;
  }
  if (listen && settings.autoplay) setTimeout(() => speak(q.say), 250);
}

function grade(ok, given, feedback = true) {
  const s = session;
  if (s.done) return;
  s.done = true;
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
  if (feedback) showFeedback(ok, given);
}

function showFeedback(ok, given) {
  const { mode, q } = session;
  const greekText = q.say && mode.kind === 'input' ? q.say : q.greek;
  const head = ok === null ? '' : ok ? `<div class="res ok">Верно</div>` : `<div class="res bad">Неверно${given ? `: <s>${esc(given)}</s>` : ''}</div>`;
  $('#feedback').innerHTML = `
    <div class="fb ${ok === false ? 'bad' : ok ? 'ok' : ''}">
      ${head}
      <div class="ans">${esc(q.answer)}</div>
      ${greekText ? `<div class="gr greek">${esc(greekText)}</div>` : ''}
      ${q.say || q.sayAfter ? playButtons() : ''}
      ${ok === null
        ? `<div class="self"><button data-act="know">✓ Знал</button><button data-act="dontknow">✗ Не знал</button></div>`
        : `<button class="wide" data-act="next" id="nextBtn">Дальше</button>`}
    </div>`;
  const ans = $('#answer');
  if (mode.kind === 'choice') {
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
  if (q.sayAfter || mode.kind === 'card' || (mode.kind === 'input' && !isListen(q))) speak(q.sayAfter || q.say);
  if (ok === true && settings.autoNext) scheduleAutoNext();
}

view.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !session) return;
  const q = session.q;
  const act = b.dataset.act;
  if (act === 'play') speak(q.say || q.sayAfter);
  else if (act === 'slow') speak(q.say || q.sayAfter, 0.6);
  else if (act === 'next') nextQuestion();
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

function renderSettings() {
  title.textContent = 'Настройки';
  const tts = 'speechSynthesis' in window;
  view.innerHTML = `
    <section class="settings">
      ${!tts ? `<p class="warn">Браузер не поддерживает синтез речи. Открой в Chrome.</p>` : ''}
      ${tts && !voices.length ? `<div class="warn">Греческий голос не найден. На Android: Настройки → Система → Язык и ввод → Синтез речи → Google → ⚙ → Установить голосовые данные → Ελληνικά. Потом перезапусти Chrome.</div>` : ''}
      <label>Голос
        <select id="voice">${voices.map(v => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === settings.voice ? 'selected' : ''}>${esc(v.name)}${v.localService ? '' : ' (онлайн)'}</option>`).join('') || '<option>—</option>'}</select>
      </label>
      <label>Скорость речи: <b id="rateV">${settings.rate.toFixed(2)}</b>
        <input type="range" id="rate" min="0.5" max="1.3" step="0.05" value="${settings.rate}">
      </label>
      <label class="row"><input type="checkbox" id="autoplay" ${settings.autoplay ? 'checked' : ''}> Проигрывать задание сразу</label>
      <label class="row"><input type="checkbox" id="autoNext" ${settings.autoNext ? 'checked' : ''}> Сразу дальше после правильного ответа</label>
      <label>Задержка перед следующим: <b id="delayV">${settings.autoNextDelay.toFixed(1)} с</b>
        <input type="range" id="delay" min="0" max="5" step="0.1" value="${settings.autoNextDelay}">
      </label>
      <button class="wide" id="test">🔊 Проверить голос</button>
      <button class="wide ghost" id="reset">Сбросить статистику</button>
      <p class="hint">Установить как приложение: меню Chrome ⋮ → «Добавить на главный экран». После первой загрузки работает без интернета.</p>
    </section>`;
  $('#voice').onchange = e => { settings.voice = e.target.value; save('gt.settings', settings); };
  $('#rate').oninput = e => { settings.rate = +e.target.value; $('#rateV').textContent = settings.rate.toFixed(2); save('gt.settings', settings); };
  $('#autoplay').onchange = e => { settings.autoplay = e.target.checked; save('gt.settings', settings); };
  $('#delay').oninput = e => { settings.autoNextDelay = +e.target.value; $('#delayV').textContent = `${settings.autoNextDelay.toFixed(1)} с`; save('gt.settings', settings); };
  $('#autoNext').onchange = e => { settings.autoNext = e.target.checked; save('gt.settings', settings); };
  $('#test').onclick = () => speak('Καλημέρα! Δεκατέσσερα ευρώ και εβδομήντα λεπτά.');
  $('#reset').onclick = () => { if (confirm('Сбросить статистику?')) { for (const k in stats) delete stats[k]; save('gt.stats', stats); } };
}

backBtn.addEventListener('click', () => { if (history.length > 1) history.back(); else location.hash = ''; });
window.addEventListener('hashchange', () => { clearTimeout(autoTimer); session = null; render(); });
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
