import { FW_WORDS, FW_TABLES, FW_TRAPS } from './func.js';

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sayAttr = x => `data-say="${esc(JSON.stringify(x))}"`;
const plain = s => s.replace(/[[\]]/g, '');
const hl = s => esc(s).replace(/\[([^\]]+)\]/g, '<b class="hl">$1</b>');
const gap = s => esc(s).replace(/\[[^\]]+\]/g, '<span class="gap">？</span>');
const lc = s => s.toLocaleLowerCase('el');
const noAcc = s => lc(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const phon = s => noAcc(s).replace(/ς/g, 'σ').replace(/ει|οι|υι|η|υ/g, 'ι').replace(/αι/g, 'ε').replace(/ω/g, 'ο').replace(/(.)\1/g, '$1').replace(/[^α-ω ]/g, '').trim();
const capLike = (form, sample) => (sample && sample[0] !== lc(sample[0]) ? form[0].toLocaleUpperCase('el') + form.slice(1) : form);

export const CATS = [
  ['part', 'частицы'], ['prep', 'предлоги'], ['conj', 'союзы'], ['q', 'вопросы'], ['pron', 'местоимения'],
  ['time', 'время'], ['place', 'место'], ['adv', 'наречия'], ['phr', 'связки'],
];
const CAT_NAME = Object.fromEntries(CATS);

const BY_ID = Object.fromEntries(FW_WORDS.map(w => [w.id, w]));
const SYN = {};
for (const w of FW_WORDS) for (const s of w.syn || []) {
  if (!BY_ID[s]) continue;
  (SYN[w.id] ||= new Set()).add(s);
  (SYN[s] ||= new Set()).add(w.id);
}
const clash = (a, b) => a.id === b.id || a.el === b.el || SYN[a.id]?.has(b.id);

const LVL = { key: 'lvl', label: 'Уровень', values: [['1', 'база'], ['2', 'база+'], ['3', 'всё']] };
const CAT = { key: 'cat', label: 'Тема', values: [['all', 'все'], ...CATS.filter(([c]) => FW_WORDS.some(w => w.cat === c))] };
const TBL = { key: 'tbl', label: 'Таблица', values: [['all', 'все'], ...FW_TABLES.map(t => [t.id, t.short || t.title])] };

function wordPool(o) {
  const inCat = FW_WORDS.filter(w => o.cat === 'all' || w.cat === o.cat);
  const byLvl = inCat.filter(w => w.lvl <= +o.lvl);
  return byLvl.length ? byLvl : inCat;
}

function others(w, n, keyFn, extra = () => true) {
  const same = shuffle(FW_WORDS.filter(x => x.cat === w.cat));
  const rest = shuffle(FW_WORDS.filter(x => x.cat !== w.cat));
  const out = [];
  const keys = new Set([keyFn(w)]);
  for (const x of [...same, ...rest]) {
    if (out.length >= n) break;
    const k = keyFn(x);
    if (keys.has(k) || clash(w, x) || !extra(x)) continue;
    keys.add(k);
    out.push(x);
  }
  return out;
}

const trBox = tr => `<details class="trd"><summary>транскрипция</summary><div>${esc(tr)}</div></details>`;
const exHtml = (e, withRu = true) => `<div class="exl" ${sayAttr(plain(e[0]))}><span class="greek">${hl(e[0])}</span> 🔊<br><small>${esc(e[1])}</small>${withRu ? `<br><span>${esc(e[2])}</span>` : ''}</div>`;
const noteHtml = w => (w.note ? `<p class="fwnote">${esc(w.note)}</p>` : '');
const wordFb = (w, e) => `<div class="fwfb">${exHtml(e)}${w.ex.filter(x => x !== e).slice(0, 1).map(x => exHtml(x)).join('')}${noteHtml(w)}</div>`;

function wordRows(list) {
  return `<table class="ref fwref">${list.map(w => `
    <tr><td class="greek" ${sayAttr(w.el)}><b>${esc(w.el)}</b><br><small>${esc(w.tr)}</small></td>
    <td>${esc(w.ru)}${w.note ? `<br><small>${esc(w.note)}</small>` : ''}
      ${w.ex.map(e => `<div class="exs" ${sayAttr(plain(e[0]))}><span class="greek">${hl(e[0])}</span><br><small>${esc(e[2])}</small></div>`).join('')}</td></tr>`).join('')}</table>`;
}

function wordsRef(o) {
  return CATS.map(([c, name]) => {
    const list = FW_WORDS.filter(w => w.cat === c).sort((a, b) => a.lvl - b.lvl);
    if (!list.length) return '';
    return `<details class="refsec" ${o && o.cat === c ? 'open' : ''}><summary>${name} <small>· ${list.length}</small></summary>${wordRows(list)}</details>`;
  }).join('');
}

const wordModeBase = {
  group: 'Служебные слова', kind: 'choice',
  options: [LVL, CAT],
  size: o => wordPool(o).length,
  ref: o => ({ html: wordsRef(o) }),
  cheat: o => wordRows(wordPool(o)),
};

const cellForms = f => (f.includes('(') ? [f.replace(/\(.*?\)/g, ''), f.replace(/[()]/g, '')] : [f]);
const cellLabel = (t, r, c) => `${t.rows[r]} · ${t.cols[c]}`;
const markText = e => (e[0].match(/\[([^\]]+)\]/) || [])[1] || '';

function tablePool(o) {
  const ts = o.tbl === 'all' ? FW_TABLES.filter(t => t.lvl <= +o.lvl) : FW_TABLES.filter(t => t.id === o.tbl);
  const cells = [];
  for (const t of ts.length ? ts : FW_TABLES) t.cells.forEach((row, r) => row.forEach((f, c) => { if (f && t.ex[`${r}.${c}`]) cells.push({ t, r, c, f }); }));
  return cells;
}

function tableHtml(t, blank) {
  return `<table class="ref para"><tr><td></td>${t.cols.map(c => `<td class="ph">${esc(c)}</td>`).join('')}</tr>${t.rows.map((rw, r) => `
    <tr><td class="ph">${esc(rw)}</td>${t.cols.map((_, c) => {
      const f = t.cells[r][c];
      if (blank && blank.r === r && blank.c === c) return `<td class="blank">?</td>`;
      return f ? `<td class="greek" ${blank ? '' : sayAttr(cellForms(f)[0])}>${esc(f)}${!blank && t.tr ? `<br><small>${esc(t.tr[r][c])}</small>` : ''}</td>` : '<td>—</td>';
    }).join('')}</tr>`).join('')}</table>`;
}

function tableRef(t, open) {
  const ex = Object.entries(t.ex).sort(([a], [b]) => (a < b ? -1 : 1));
  return `<details class="refsec" ${open ? 'open' : ''}><summary>${esc(t.title)}</summary>
    ${tableHtml(t)}${t.note ? `<p class="fwnote">${esc(t.note)}</p>` : ''}
    <div class="exlist">${ex.map(([k, e]) => { const [r, c] = k.split('.').map(Number); return `<div class="exs" ${sayAttr(plain(e[0]))}><small>${esc(cellLabel(t, r, c))}</small><br><span class="greek">${hl(e[0])}</span><br><small>${esc(e[2])}</small></div>`; }).join('')}</div></details>`;
}

const tableModeBase = {
  group: 'Служебные слова', kind: 'choice',
  options: [LVL, TBL],
  size: o => tablePool(o).length,
  ref: o => ({ html: FW_TABLES.map(t => tableRef(t, o && (o.tbl === t.id || (o.tbl === 'all' && t.lvl === 1)))).join('') }),
  cheat: o => (o.tbl === 'all' ? FW_TABLES.filter(t => t.lvl <= +o.lvl) : FW_TABLES.filter(t => t.id === o.tbl)).map(t => `<h3>${esc(t.title)}</h3>${tableHtml(t)}`).join(''),
};

const cellFb = (x, e) => `<div class="fwfb">${exHtml(e)}${x.t.note ? `<p class="fwnote">${esc(x.t.note)}</p>` : ''}</div>`;

export const FW_MODES = [
  {
    ...wordModeBase, id: 'fwMean', title: 'Что значит', sub: 'греческое слово → смысл',
    gen(o) {
      const w = pick(wordPool(o)), e = pick(w.ex);
      const opts = shuffle([w, ...others(w, 3, x => x.ru)]);
      return {
        key: w.id,
        prompt: `<span class="mid greek" ${sayAttr(w.el)}>${esc(w.el)}</span><p class="sent greek" ${sayAttr(plain(e[0]))}>${hl(e[0])}</p>${trBox(e[1])}`,
        choices: opts.map(x => ({ label: x.ru, ok: x === w })),
        answer: `${w.el} — ${w.ru}`, greek: w.tr, html: wordFb(w, e),
        say: [w.el, plain(e[0])], sayAfter: [w.el, plain(e[0])],
      };
    },
  },
  {
    ...wordModeBase, id: 'fwGreek', title: 'Как сказать', sub: 'смысл → греческое слово',
    gen(o) {
      const w = pick(wordPool(o)), e = pick(w.ex);
      const opts = shuffle([w, ...others(w, 3, x => x.el, x => x.ru !== w.ru)]);
      return {
        key: w.id,
        prompt: `<span class="mid">${esc(w.ru)}</span><p class="hint">${CAT_NAME[w.cat] || ''} · «${esc(e[2])}»</p>`,
        choices: opts.map(x => ({ label: x.el, ok: x === w, greek: true })),
        answer: `${w.el} — ${w.ru}`, greek: w.tr, html: wordFb(w, e),
        sayAfter: [w.el, plain(e[0])],
      };
    },
  },
  {
    ...wordModeBase, id: 'fwListen', title: 'Слова на слух', sub: 'слово и фраза → выбери', listen: true,
    gen(o) {
      const w = pick(wordPool(o)), e = pick(w.ex);
      const opts = shuffle([w, ...others(w, 3, x => phon(x.el))]);
      return {
        key: w.id,
        say: [w.el, plain(e[0])], sayAfter: [w.el, plain(e[0])],
        choices: opts.map(x => ({ label: x.el, ok: x === w, greek: true })),
        answer: `${w.el} — ${w.ru}`, greek: w.tr, html: wordFb(w, e),
      };
    },
  },
  {
    ...wordModeBase, id: 'fwGap', title: 'Вставь слово', sub: 'фраза с пропуском',
    gen(o) {
      const w = pick(wordPool(o)), e = pick(w.ex);
      const first = e[0].trimStart().startsWith('[');
      const opts = shuffle([w, ...others(w, 3, x => lc(x.el))]);
      return {
        key: w.id,
        prompt: `<p class="sent greek big2">${gap(e[0])}</p><p class="hint">${esc(e[2])}</p>`,
        choices: opts.map(x => ({ label: first ? capLike(x.el, 'A') : x.el, ok: x === w, greek: true })),
        answer: `${w.el} — ${w.ru}`, greek: w.tr, html: wordFb(w, e),
        sayAfter: plain(e[0]),
      };
    },
  },
  {
    id: 'fwTraps', group: 'Служебные слова', title: 'Ловушки', sub: 'πού/που, πώς/πως, με…', kind: 'choice',
    size: () => FW_TRAPS.length * 2,
    gen() {
      const tp = pick(FW_TRAPS), side = pick(['a', 'b']), s = tp[side], e = pick(s.ex);
      const both = [tp.a, tp.b];
      const fb = `<div class="fwfb">${exHtml(e)}<p class="fwnote">${esc(tp.rule)}</p></div>`;
      if (tp.kind === 'spell') {
        const first = e[0].trimStart().startsWith('[');
        return {
          key: `${tp.id}:${side}`,
          prompt: `<p class="sent greek big2">${gap(e[0])}</p><p class="hint">${esc(e[2])}</p>`,
          choices: both.map(x => ({ label: first ? capLike(x.el, 'A') : x.el, ok: x === s, greek: true })),
          answer: `${s.el} — ${s.ru}`, html: fb, sayAfter: plain(e[0]),
        };
      }
      return {
        key: `${tp.id}:${side}`,
        prompt: `<p class="sent greek big2" ${sayAttr(plain(e[0]))}>${hl(e[0])}</p><p class="hint">Что здесь значит выделенное слово?</p>${trBox(e[1])}`,
        choices: both.map(x => ({ label: x.ru, ok: x === s })),
        answer: `${s.el} — ${s.ru}`, html: fb, say: plain(e[0]), sayAfter: plain(e[0]),
      };
    },
    ref: () => ({
      html: FW_TRAPS.map(tp => `<details class="refsec"><summary class="greek">${esc(tp.a.el)} / ${esc(tp.b.el)}</summary><p class="fwnote">${esc(tp.rule)}</p>
        ${[tp.a, tp.b].map(s => `<h3><span class="greek">${esc(s.el)}</span> — ${esc(s.ru)}</h3>${s.ex.map(e => `<div class="exs" ${sayAttr(plain(e[0]))}><span class="greek">${hl(e[0])}</span><br><small>${esc(e[2])}</small></div>`).join('')}`).join('')}</details>`).join(''),
    }),
    cheat: () => FW_TRAPS.map(tp => `<p><b class="greek">${esc(tp.a.el)} / ${esc(tp.b.el)}</b> — ${esc(tp.rule)}</p>`).join(''),
  },
  {
    ...tableModeBase, id: 'tblFill', title: 'Таблицы: клетка', sub: 'заполни пустую клетку',
    gen(o) {
      const x = pick(tablePool(o)), { t, r, c, f } = x, e = t.ex[`${r}.${c}`];
      const all = [...new Set(t.cells.flat().filter(Boolean))].filter(v => v !== f);
      const opts = shuffle([f, ...shuffle(all).slice(0, 3)]);
      return {
        key: `${t.id}:${r}.${c}`,
        prompt: `<p class="hint">${esc(t.title)}</p>${tableHtml(t, { r, c })}`,
        choices: opts.map(v => ({ label: v, ok: v === f, greek: true })),
        answer: `${cellLabel(t, r, c)}: ${f}`, greek: t.tr ? t.tr[r][c] : '', html: cellFb(x, e),
        sayAfter: [cellForms(f)[0], plain(e[0])],
      };
    },
  },
  {
    ...tableModeBase, id: 'tblPick', title: 'Таблицы: форма', sub: 'выбери форму в фразе',
    gen(o) {
      const x = pick(tablePool(o)), { t, r, c, f } = x, e = t.ex[`${r}.${c}`];
      const surf = markText(e), own = cellForms(f).map(lc);
      const pool = [];
      t.cells.forEach(row => row.forEach(g => {
        if (!g) return;
        const v = pick(cellForms(g));
        if (own.includes(lc(v)) || cellForms(g).some(y => own.includes(lc(y))) || pool.some(p => lc(p) === lc(v))) return;
        pool.push(v);
      }));
      const opts = shuffle([lc(surf), ...shuffle(pool).slice(0, 3)]);
      return {
        key: `${t.id}:${r}.${c}`,
        prompt: `<p class="sent greek big2">${gap(e[0])}</p><p class="lbl">${esc(t.title)}: ${esc(cellLabel(t, r, c))}</p><p class="hint">${esc(e[2])}</p>`,
        choices: opts.map(v => ({ label: capLike(v, surf), ok: v === lc(surf), greek: true })),
        answer: `${surf} — ${cellLabel(t, r, c)}`, greek: t.tr ? t.tr[r][c] : '', html: cellFb(x, e),
        sayAfter: plain(e[0]),
      };
    },
  },
  {
    ...tableModeBase, id: 'tblWhat', title: 'Таблицы: что за форма', sub: 'род, число, падеж, лицо',
    gen(o) {
      const x = pick(tablePool(o)), { t, r, c, f } = x, e = t.ex[`${r}.${c}`];
      const own = cellForms(f).map(lc);
      const same = [], diff = [];
      t.cells.forEach((row, rr) => row.forEach((g, cc) => {
        if (!g || (rr === r && cc === c)) return;
        (cellForms(g).some(y => own.includes(lc(y))) ? same : diff).push(cellLabel(t, rr, cc));
      }));
      const right = cellLabel(t, r, c);
      const opts = shuffle([right, ...shuffle(diff).slice(0, 3)]);
      return {
        key: `${t.id}:${r}.${c}`,
        prompt: `<p class="hint">${esc(t.title)}</p><p class="sent greek big2" ${sayAttr(plain(e[0]))}>${hl(e[0])}</p><p class="hint">${esc(e[2])}</p>`,
        say: plain(e[0]),
        choices: opts.map(v => ({ label: v, ok: v === right })),
        answer: `${f} — ${right}`, greek: same.length ? `так же выглядит: ${same.join('; ')}` : '', html: cellFb(x, e),
        sayAfter: plain(e[0]),
      };
    },
  },
];
