// Utilitaires de formatage et de calcul
export const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Dates locales au format ISO (YYYY-MM-DD)
export function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}
export function parseLocal(s) {
  // "2026-11-07" ou "2026-11-07T08:12:00"
  const [d, t = '00:00:00'] = String(s).split('T');
  const [y, m, j] = d.split('-').map(Number);
  const [h = 0, mi = 0, se = 0] = t.split(':').map(Number);
  return new Date(y, m - 1, j, h, mi, se || 0);
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfWeek(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
export function today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
export function daysBetween(a, b) { return Math.round((startDay(b) - startDay(a)) / 86400000); }
function startDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

export function fmtDate(d, opts = {}) {
  if (!(d instanceof Date)) d = parseLocal(d);
  const base = `${opts.weekday ? JOURS[d.getDay()] + ' ' : ''}${d.getDate()} ${MOIS[d.getMonth()]}`;
  return opts.year ? `${base} ${d.getFullYear()}` : base;
}
export function fmtTime(d) { if (!(d instanceof Date)) d = parseLocal(d); return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`; }
export function weekNumber(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x - y0) / 86400000 + 1) / 7);
}

// Durées
export function fmtDur(sec, { short = false } = {}) {
  if (sec == null || isNaN(sec)) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return short || m >= 10 ? `${m} min` : `${m} min ${String(s).padStart(2, '0')}`;
  return `${s} s`;
}
export function fmtHours(sec) { if (!sec) return '0h00'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return m === 60 ? `${h + 1}h00` : `${h}h${String(m).padStart(2, '0')}`; }
export function fmtChrono(sec) {
  if (sec == null) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
// Allure (sec/km) à partir de m/s
export function paceFromSpeed(ms) { return ms > 0.3 ? 1000 / ms : null; }
export function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '–';
  let m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  if (s === 60) { m++; s = 0; }
  return `${m}'${String(s).padStart(2, '0')}`;
}
export function fmtKm(m, dec = 1) { if (m == null) return '–'; return (m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
export function fmtNum(n, dec = 0) { if (n == null || isNaN(n)) return '–'; return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

export function mean(a) { const v = a.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
export function sd(a) { const v = a.filter(x => x != null && !isNaN(x)); if (v.length < 2) return null; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }
export function rolling(arr, n) {
  return arr.map((_, i) => { const w = arr.slice(Math.max(0, i - n + 1), i + 1).filter(x => x != null); return w.length >= Math.min(3, n) ? w.reduce((s, x) => s + x, 0) / w.length : null; });
}

// Catégories de sport
const RUN = ['Run', 'TrailRun', 'VirtualRun'];
const RIDE = ['Ride', 'VirtualRide', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'TrackRide', 'Velomobile'];
export function sportCat(type) {
  if (RUN.includes(type)) return 'run';
  if (RIDE.includes(type)) return 'ride';
  if (['Hike', 'Walk'].includes(type)) return 'hike';
  if (['WeightTraining', 'Workout', 'Crossfit', 'Yoga', 'Pilates'].includes(type)) return 'strength';
  if (['Swim', 'OpenWaterSwim'].includes(type)) return 'swim';
  return 'other';
}
export const SPORT_LABEL = { run: 'Course', ride: 'Vélo', hike: 'Rando / marche', strength: 'Renfo', swim: 'Natation', other: 'Autre' };
export const TYPE_LABEL = {
  Run: 'Course à pied', TrailRun: 'Trail', VirtualRun: 'Tapis', Ride: 'Vélo', VirtualRide: 'Home trainer', MountainBikeRide: 'VTT', GravelRide: 'Gravel',
  Hike: 'Randonnée', Walk: 'Marche', WeightTraining: 'Musculation', Workout: 'Entraînement', Swim: 'Natation', Yoga: 'Yoga', Elliptical: 'Elliptique', NordicSki: 'Ski de fond', AlpineSki: 'Ski', BackcountrySki: 'Ski de rando'
};
export function typeLabel(t) { return TYPE_LABEL[t] || t || 'Activité'; }

export const ICONS = {
  run: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2a5.2 5.2 0 0 1-4.5-2.5l-1-1.6A2 2 0 0 0 11.8 6c-.3 0-.5 0-.8.1L6 8.3V13h2V9.6l1.8-.7Z"/></svg>',
  ride: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm5.8-10.1 2.4-2.4.8.8A7 7 0 0 0 19 13v-2a5 5 0 0 1-3.6-1.5l-1.9-1.9a2 2 0 0 0-1.4-.6 2 2 0 0 0-1.4.6L7.4 10.9a2 2 0 0 0 .6 3.2L11 15.5V20h2v-6l-2.2-1.6ZM19 12a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/></svg>',
  hike: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 10.5V23h1.5V10.5H17Zm-7.2-1.6L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7 7 0 0 0 16 12.4v-2a5 5 0 0 1-2.5-1.9l-1-1.6A2 2 0 0 0 10.8 6c-.3 0-.5 0-.8.1L5 8.3V13h2V9.6l2.8-.7Z"/></svg>',
  strength: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 14.9 22 13.4l-1.4-1.4-3.6 3.6-8.6-8.6 3.6-3.6L10.6 2l-1.4 1.4L7.8 2 5.6 4.2 4.2 2.8 2.8 4.2l1.4 1.4L2 7.8l1.4 1.4L2 10.6 3.4 12l3.6-3.6 8.6 8.6-3.6 3.6 1.4 1.4 1.4-1.4 1.4 1.4 2.2-2.2 1.4 1.4 1.4-1.4-1.4-1.4 2.2-2.2-1.4-1.4Z"/></svg>',
  swim: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 21c-1.1 0-1.7-.4-2.2-.7-.4-.2-.6-.3-1.1-.3s-.6.1-1.1.3c-.5.3-1.1.7-2.2.7s-1.7-.4-2.2-.7c-.4-.2-.6-.3-1.1-.3s-.6.1-1.1.3c-.5.3-1.1.7-2.2.7s-1.7-.4-2.2-.7c-.4-.2-.6-.3-1.1-.3s-.6.1-1.1.3c-.5.3-1.1.7-2.2.7v-2c.5 0 .6-.1 1.1-.3.5-.3 1.1-.7 2.2-.7s1.7.4 2.2.7c.4.2.6.3 1.1.3s.6-.1 1.1-.3c.5-.3 1.1-.7 2.2-.7s1.7.4 2.2.7c.4.2.6.3 1.1.3s.6-.1 1.1-.3c.5-.3 1.1-.7 2.2-.7s1.7.4 2.2.7c.4.2.6.3 1.1.3v2ZM8.7 12.5l1.9-1.9-3-3-1.5-1.5L7.5 4.7 10.7 8 16 13.3c-.3.1-.7.2-1 .2-.5 0-.6-.1-1.1-.3-.5-.3-1.1-.7-2.2-.7s-1.7.4-2.2.7c-.4.2-.5.2-.8.3ZM16.5 9a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0Z"/></svg>',
  other: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13h-2v6l5.2 3.2 1-1.6-4.2-2.5V7Z"/></svg>'
};
