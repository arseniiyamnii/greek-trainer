const ONES_N = ['μηδέν', 'ένα', 'δύο', 'τρία', 'τέσσερα', 'πέντε', 'έξι', 'εφτά', 'οχτώ', 'εννιά'];
const ONES_F = { 1: 'μία', 3: 'τρεις', 4: 'τέσσερις' };
const ONES_M = { 1: 'ένας', 3: 'τρεις', 4: 'τέσσερις' };
const TEENS_N = ['δέκα', 'έντεκα', 'δώδεκα', 'δεκατρία', 'δεκατέσσερα', 'δεκαπέντε', 'δεκαέξι', 'δεκαεφτά', 'δεκαοχτώ', 'δεκαεννιά'];
const TEENS_FM = { 13: 'δεκατρείς', 14: 'δεκατέσσερις' };
const TENS = { 2: 'είκοσι', 3: 'τριάντα', 4: 'σαράντα', 5: 'πενήντα', 6: 'εξήντα', 7: 'εβδομήντα', 8: 'ογδόντα', 9: 'ενενήντα' };
const HUNDREDS = { 2: 'διακόσι', 3: 'τριακόσι', 4: 'τετρακόσι', 5: 'πεντακόσι', 6: 'εξακόσι', 7: 'εφτακόσι', 8: 'οχτακόσι', 9: 'εννιακόσι' };
const H_END = { n: 'α', f: 'ες', m: 'οι' };

function unit(n, g) {
  if (g === 'f' && ONES_F[n]) return ONES_F[n];
  if (g === 'm' && ONES_M[n]) return ONES_M[n];
  return ONES_N[n];
}

function below100(n, g) {
  if (n < 10) return unit(n, g);
  if (n < 20) return g !== 'n' && TEENS_FM[n] ? TEENS_FM[n] : TEENS_N[n - 10];
  const t = Math.floor(n / 10), u = n % 10;
  return u ? `${TENS[t]} ${unit(u, g)}` : TENS[t];
}

function below1000(n, g) {
  if (n < 100) return below100(n, g);
  const h = Math.floor(n / 100), r = n % 100;
  const head = h === 1 ? (r ? 'εκατόν' : 'εκατό') : HUNDREDS[h] + H_END[g];
  return r ? `${head} ${below100(r, g)}` : head;
}

export function num(n, g = 'n') {
  if (n === 0) return 'μηδέν';
  const parts = [];
  const mil = Math.floor(n / 1e6);
  const th = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  if (mil) parts.push(mil === 1 ? 'ένα εκατομμύριο' : `${below1000(mil, 'n')} εκατομμύρια`);
  if (th) parts.push(th === 1 ? { n: 'χίλια', f: 'χίλιες', m: 'χίλιοι' }[g] : `${below1000(th, 'f')} χιλιάδες`);
  if (rest) parts.push(below1000(rest, g));
  return parts.join(' ');
}

export function price(euros, cents, style = 'full') {
  const e = euros === 1 ? 'ένα ευρώ' : `${num(euros)} ευρώ`;
  const c = cents === 1 ? 'ένα λεπτό' : `${num(cents)} λεπτά`;
  if (!cents) return e;
  if (!euros) return c;
  if (style === 'short') return `${num(euros)} και ${num(cents)}`;
  return `${e} και ${c}`;
}

const HALF = {
  1: 'μιάμιση', 2: 'δυόμισι', 3: 'τρεισήμισι', 4: 'τεσσερισήμισι', 5: 'πεντέμισι', 6: 'εξίμισι',
  7: 'εφτάμισι', 8: 'οχτώμισι', 9: 'εννιάμισι', 10: 'δεκάμισι', 11: 'εντεκάμισι', 12: 'δωδεκάμισι',
};

export function timeSpoken(h, m) {
  const next = h === 12 ? 1 : h + 1;
  if (m === 0) return `${num(h, 'f')} η ώρα`;
  if (m === 15) return `${num(h, 'f')} και τέταρτο`;
  if (m === 30) return HALF[h];
  if (m === 45) return `${num(next, 'f')} παρά τέταρτο`;
  if (m < 30) return `${num(h, 'f')} και ${num(m)}`;
  return `${num(next, 'f')} παρά ${num(60 - m)}`;
}

export function timeDigital(h, m) {
  if (m === 0) return `${num(h, 'f')} ακριβώς`;
  return `${num(h, 'f')} και ${num(m)}`;
}

export const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
export const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];
export const DAYS_RU = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

export function date(d, m) {
  return `${d === 1 ? 'πρώτη' : num(d, 'f')} ${MONTHS_GEN[m - 1]}`;
}

export function phone(digits) {
  const pairs = digits.match(/\d{2}/g);
  return pairs.map(p => (p[0] === '0' ? `μηδέν ${num(+p[1])}` : num(+p))).join(', ');
}
