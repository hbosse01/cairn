// Accès aux données : Intervals.icu (API publique, clé personnelle) + cache local + mode démo
import { isoDate, addDays, today } from './util.js';
import { buildDemo, demoStreams, demoLaps } from './demo.js';
import { fitActivity } from './fit.js';

const BASE = 'https://intervals.icu/api/v1';
const LS = {
  settings: 'ss.settings',
  cache: 'ss.cache.v1',
  tests: 'ss.tests',
};
const ACT_FIELDS = [
  'id', 'start_date_local', 'type', 'name', 'distance', 'moving_time', 'elapsed_time', 'total_elevation_gain', 'total_elevation_loss',
  'average_heartrate', 'max_heartrate', 'icu_hr_zones', 'icu_hr_zone_times', 'pace_zones', 'pace_zone_times', 'gap_zone_times',
  'icu_training_load', 'average_speed', 'max_speed', 'gap', 'average_cadence', 'calories', 'gear', 'race', 'trainer', 'icu_rpe', 'feel',
  'icu_resting_hr', 'athlete_max_hr', 'icu_lap_count', 'trimp', 'device_name', 'source', 'lthr', 'threshold_pace', 'description'
].join(',');

function readJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } }

export const settings = {
  get() {
    return Object.assign({ apiKey: '', athleteId: '0', sheetId: '1tWbSyZ-WKS4PHJ8PfpeE2q1EeRh6VB3f2-Eat0ZTkEg', sheetTabs: 'Calendrier 2025/2026,Calendrier 2026/2027', scriptUrl: '', planSheetId: '1D4-NZk7bY_4dhvsosQyqe4KTlk2XjkCIYqublF3kDZ8', planTabPrefix: 'S', shoeLimit: 800, demo: false }, readJSON(LS.settings, {}));
  },
  set(patch) { const s = Object.assign(this.get(), patch); writeJSON(LS.settings, s); return s; },
};

// L'aperçu publié sur claude.ai ne peut pas appeler d'autres sites : on y bascule en démo.
export function canReachNetwork() {
  return !/claude\.ai|claudeusercontent|anthropic/.test(location.hostname);
}
export function isDemo() {
  const s = settings.get();
  return s.demo || !s.apiKey || !canReachNetwork();
}

class Intervals {
  constructor(key, athleteId = '0') { this.key = key; this.id = athleteId || '0'; }
  async get(path, params = {}) {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    let r;
    try { r = await fetch(`${BASE}${path}${q ? '?' + q : ''}`, { headers: { Authorization: 'Basic ' + btoa('API_KEY:' + this.key) } }); }
    catch { throw new Error('Impossible de joindre Intervals.icu (pas de connexion ?). Les dernières données enregistrées restent affichées.'); }
    if (r.status === 401 || r.status === 403) throw new Error('Clé API refusée par Intervals.icu (vérifie-la dans Réglages).');
    if (!r.ok) throw new Error(`Intervals.icu a répondu ${r.status} pour ${path}`);
    return r.json();
  }
  async put(path, body) {
    const r = await fetch(`${BASE}${path}`, { method: 'PUT', headers: { Authorization: 'Basic ' + btoa('API_KEY:' + this.key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Intervals.icu a répondu ${r.status}`);
    return r.json();
  }
  athlete() { return this.get(`/athlete/${this.id}`); }
  activities(oldest, newest) { return this.get(`/athlete/${this.id}/activities`, { oldest, newest, fields: ACT_FIELDS }); }
  wellness(oldest, newest) { return this.get(`/athlete/${this.id}/wellness`, { oldest, newest }); }
  gear() { return this.get(`/athlete/${this.id}/gear`); }
  paceCurves(curves = 'all,1y,s0') { return this.get(`/athlete/${this.id}/pace-curves.json`, { type: 'Run', curves }); }
  laps(actId) { return this.get(`/activity/${actId}/intervals`); }
  async file(actId) {
    const r = await fetch(`${BASE}/activity/${actId}/file`, { headers: { Authorization: 'Basic ' + btoa('API_KEY:' + this.key) } });
    if (!r.ok) throw new Error(`fichier ${r.status}`);
    let buf = await r.arrayBuffer();
    const b = new Uint8Array(buf, 0, 2);
    if (b[0] === 0x1f && b[1] === 0x8b && 'DecompressionStream' in window) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return buf;
  }
  streams(actId) { return this.get(`/activity/${actId}/streams.json`, { types: 'time,distance,heartrate,velocity_smooth,altitude,fixed_altitude' }); }
  async post(path, body) {
    const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { Authorization: 'Basic ' + btoa('API_KEY:' + this.key), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Intervals.icu a refusé l'enregistrement (${r.status}) : ${(await r.text()).slice(0, 160)}`);
    return r.json().catch(() => ({}));
  }
  addManual(body) { return this.post(`/athlete/${this.id}/activities/manual`, body); }
  updateRunSettings(patch) { return this.put(`/athlete/${this.id}/sport-settings/Run`, patch); }
}

function client() { const s = settings.get(); return new Intervals(s.apiKey, s.athleteId); }

// --- État global ---
export const state = {
  athlete: null, activities: [], wellness: [], gear: [], paceCurves: null, races: [], plan: [],
  updated: null, loading: false, error: null, demo: false,
};
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(f => { try { f(state); } catch (e) { console.error(e); } }); }

function sortActs(a) { return a.sort((x, y) => (y.start_date_local || '').localeCompare(x.start_date_local || '')); }

export async function load({ force = false } = {}) {
  state.demo = isDemo();
  state.error = null;
  if (state.demo) {
    const d = buildDemo();
    Object.assign(state, d, { updated: new Date() });
    state.races = await loadRaces();
    state.plan = await loadPlan();
    emit();
    return;
  }
  // 1) cache immédiat
  const cache = readJSON(LS.cache, null);
  if (cache && !force) {
    Object.assign(state, cache, { updated: cache.updated ? new Date(cache.updated) : null });
    state.stravaStubs = (state.activities || []).filter(isStub);
    state.activities = (state.activities || []).filter(a => !isStub(a)).map(a => applyFit(a));
    state.races = await loadRaces(true);
    state.plan = await loadPlan(true);
    emit();
  }
  // 2) rafraîchissement réseau
  state.loading = true; emit();
  try {
    const api = client();
    const end = isoDate(addDays(today(), 1));
    let oldestActs = '2022-01-01';
    let prev = [];
    if (cache && !force && cache.activities?.length) {
      prev = cache.activities;
      oldestActs = isoDate(addDays(today(), -21)); // rafraîchit les 3 dernières semaines
    }
    const [athlete, acts, well, gear, pc] = await Promise.all([
      api.athlete(),
      api.activities(oldestActs, end),
      api.wellness(isoDate(addDays(today(), -730)), isoDate(today())),
      api.gear().catch(() => []),
      api.paceCurves().catch(() => null),
    ]);
    const ids = new Set(acts.map(a => a.id));
    const merged = sortActs([...acts, ...prev.filter(a => !ids.has(a.id) && a.start_date_local < oldestActs)]);
    state.stravaStubs = merged.filter(isStub);
    Object.assign(state, { athlete: slimAthlete(athlete), activities: merged.filter(a => !isStub(a)).map(a => applyFit(a)), wellness: well.sort((a, b) => a.id.localeCompare(b.id)), gear, paceCurves: slimCurves(pc), updated: new Date() });
    if (!writeJSON(LS.cache, { athlete: state.athlete, activities: state.activities, wellness: state.wellness, gear, paceCurves: state.paceCurves, updated: state.updated })) {
      // Si le stockage est plein, on garde le cache sans les descriptions
      writeJSON(LS.cache, { athlete: state.athlete, activities: state.activities.map(({ description, ...a }) => a), wellness: state.wellness, gear, paceCurves: state.paceCurves, updated: state.updated });
    }
    state.races = await loadRaces();
    state.plan = await loadPlan();
  } catch (e) {
    console.error(e);
    state.error = e.message || String(e);
  } finally {
    state.loading = false;
    emit();
  }
  if (!state.error) prefetchFits();
}

// Séances venues de Strava : Intervals.icu n'a pas le droit de les transmettre (règle Strava) → coquilles vides
export const isStub = a => !!a._note || (a.source === 'STRAVA' && !a.type);

// Chiffres exacts de la montre (lus dans le fichier FIT) appliqués par-dessus ceux d'Intervals.icu
function fitStore() { return readJSON('ss.fit', {}); }
function applyFit(a, store = null) {
  const f = (store || (applyFit._s ||= fitStore()))[a.id];
  if (!f) return a;
  const x = { ...a, _fit: true };
  if (f.distance) x.distance = f.distance;
  if (f.timer) x.moving_time = Math.round(f.timer);
  if (f.elapsed) x.elapsed_time = Math.round(f.elapsed);
  if (x.distance && x.moving_time) x.average_speed = x.distance / x.moving_time;
  if (f.avgHr) x.average_heartrate = f.avgHr;
  if (f.maxHr) x.max_heartrate = f.maxHr;
  if (f.ascent != null) x.total_elevation_gain = f.ascent;
  if (f.descent != null) x.total_elevation_loss = f.descent;
  if (f.vo2max) x.vo2max = f.vo2max;
  return x;
}
const fitCache = new Map();
export async function getFit(a) {
  if (!a || state.demo || a.source !== 'SUUNTO') return null;
  if (fitCache.has(a.id)) return fitCache.get(a.id);
  const full = fitActivity(await client().file(a.id));
  const sm = { ...full.summary };
  if (sm.vo2max != null) sm.vo2max = Math.round(sm.vo2max * 10) / 10;
  const st = fitStore(); st[a.id] = sm; writeJSON('ss.fit', st); applyFit._s = st;
  const i = state.activities.findIndex(x => x.id === a.id);
  if (i >= 0) state.activities[i] = applyFit(state.activities[i], st);
  fitCache.clear(); fitCache.set(a.id, full); // on ne garde en mémoire que la dernière séance ouverte
  return full;
}
// En arrière-plan : récupère les chiffres montre des 60 dernières séances Suunto (une fois par séance)
let prefetching = false;
async function prefetchFits() {
  if (prefetching || state.demo) return;
  prefetching = true;
  try {
    const st = fitStore();
    const todo = state.activities.filter(a => a.source === "SUUNTO" && st[a.id] === undefined).slice(0, 60);
    let n = 0;
    for (const a of todo) {
      try {
        const sm = fitActivity(await client().file(a.id)).summary;
        if (sm.vo2max != null) sm.vo2max = Math.round(sm.vo2max * 10) / 10;
        st[a.id] = sm; n++;
        if (n % 10 === 0) writeJSON('ss.fit', st);
      } catch (e) { if (st[a.id] == null) st[a.id] = false; }
      await new Promise(r => setTimeout(r, 250));
    }
    writeJSON('ss.fit', st); applyFit._s = st;
    if (n) { state.activities = state.activities.map(a => applyFit(a, st)); emit(); }
  } finally { prefetching = false; }
}

export async function addManualActivity(body) {
  if (state.demo) throw new Error('Indisponible en mode démo : renseigne ta clé API dans Réglages.');
  await client().addManual(body);
  await load();
}

function slimAthlete(a) {
  if (!a) return null;
  const run = (a.sportSettings || []).find(s => (s.types || []).includes('Run')) || {};
  return {
    name: a.name || [a.firstname, a.lastname].filter(Boolean).join(' '), weight: a.icu_weight ?? a.weight, restingHR: a.icu_resting_hr,
    run: { lthr: run.lthr, max_hr: run.max_hr, hr_zones: run.hr_zones, hr_zone_names: run.hr_zone_names, threshold_pace: run.threshold_pace, pace_zones: run.pace_zones, pace_zone_names: run.pace_zone_names, id: run.id },
  };
}
function slimCurves(pc) {
  if (!pc?.list) return null;
  return {
    list: pc.list.map(c => ({ id: c.id, label: c.label, distance: c.distance, values: c.values, activity_id: c.activity_id })),
    activities: Object.fromEntries(Object.entries(pc.activities || {}).map(([k, v]) => [k, { name: v.name, start_date_local: v.start_date_local, distance: v.distance }])),
  };
}

const streamCache = new Map();
const lapCache = new Map();
// Données propres à Suunto (VO2max estimée…) lues dans le fichier FIT d'origine, gardées sur l'appareil
export async function getSuunto(a) {
  if (state.demo) return a?.distance ? { vo2max: 57 + (String(a.id).length % 5) * 0.5 } : null;
  const f = await getFit(a);
  return f ? f.summary : null;
}
export async function getLaps(actId) {
  if (lapCache.has(actId)) return lapCache.get(actId);
  let res = [];
  if (state.demo) {
    res = demoLaps(state.activities.find(a => a.id === actId));
  } else {
    const r = await client().laps(actId);
    res = (r.icu_intervals || []).sort((a, b) => a.start_index - b.start_index);
  }
  lapCache.set(actId, res);
  return res;
}
export async function getStreams(actId) {
  if (streamCache.has(actId)) return streamCache.get(actId);
  let res;
  if (state.demo) {
    res = demoStreams(state.activities.find(a => a.id === actId));
  } else {
    const raw = await client().streams(actId);
    res = Object.fromEntries(raw.map(s => [s.type, s.data]));
  }
  streamCache.set(actId, res);
  return res;
}

export async function pushRunSettings(patch) {
  if (state.demo) throw new Error('Indisponible en mode démo : renseigne ta clé API dans Réglages.');
  return client().updateRunSettings(patch);
}

// --- Calendrier des courses (Google Sheet) ---
import { parseRaceSheet, parseRaceRows, parseCSV, DEFAULT_RACES } from './races.js';
import { parsePlanRows, DEFAULT_PLAN } from './plan.js';
// Lecture des Google Sheets par le petit script Google (valeurs exactement comme affichées, tous les onglets)
let scriptPromise = null;
function loadScript() {
  const s = settings.get();
  if (!s.scriptUrl || !canReachNetwork()) return Promise.resolve(null);
  if (!scriptPromise) scriptPromise = fetch(s.scriptUrl).then(r => { if (!r.ok) throw new Error('script ' + r.status); return r.json(); }).catch(e => { console.warn(e); state.scriptError = String(e.message || e); return null; }).finally(() => setTimeout(() => { scriptPromise = null; }, 5000));
  return scriptPromise;
}
async function loadRaces(cacheOnly = false) {
  const s = settings.get();
  const cached = readJSON('ss.races', null);
  if (cacheOnly && cached) return cached;
  const js = await loadScript();
  if (js?.calendrier) {
    const all = js.calendrier.filter(t => /calendrier|saison|\d{4}\s*\/\s*\d{4}/i.test(t.name)).flatMap(t => parseRaceRows(t.rows, t.name));
    if (all.some(r => r.date)) { writeJSON('ss.races', all); state.racesSource = 'script'; return all; }
  }
  if (!s.sheetId || !canReachNetwork()) return cached || DEFAULT_RACES();
  try {
    const tabs = s.sheetTabs.split(',').map(t => t.trim()).filter(Boolean);
    const all = [];
    for (const tab of tabs) {
      const url = `https://docs.google.com/spreadsheets/d/${s.sheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(tab)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('sheet ' + r.status);
      const txt = await r.text();
      if (txt.trim().startsWith('<')) throw new Error('sheet non partagé');
      all.push(...parseRaceSheet(txt, tab));
    }
    if (all.some(r => r.date)) { writeJSON('ss.races', all); state.racesSource = 'sheet'; return all; }
  } catch (e) {
    console.warn('Calendrier Google Sheet indisponible', e);
    state.racesSource = 'fallback';
  }
  return cached || DEFAULT_RACES();
}

// --- Tests labo (stockés sur l'appareil) ---
const DEFAULT_TESTS = [{
  id: 't2026-01', date: '2026-01-17', lab: 'Le Lab (Paris)', type: 'Test performance run', vo2max: 57.3, fcmax: 211,
  sv1: { paceMin: 244, paceMax: 250, hrMin: 176, hrMax: 180 }, sv2: { paceMin: 208, paceMax: 214, hrMin: 193, hrMax: 197 },
  sv2pctVo2: 84.5, notes: 'Objectif : Ecotrail de Paris 47 km. Plus gros gain : seuil 2.'
}];
export const tests = {
  all() { return readJSON(LS.tests, DEFAULT_TESTS).sort((a, b) => b.date.localeCompare(a.date)); },
  save(list) { writeJSON(LS.tests, list); },
  add(t) { const l = this.all().filter(x => x.id !== t.id); l.push(t); this.save(l); },
  remove(id) { this.save(this.all().filter(x => x.id !== id)); },
};

export function clearCache() { localStorage.removeItem('ss.fit'); applyFit._s = null; fitCache.clear(); localStorage.removeItem(LS.cache); localStorage.removeItem('ss.races'); localStorage.removeItem('ss.plan'); streamCache.clear(); lapCache.clear(); }

// --- Plan d'entraînement (Google Sheet, un onglet par semaine) ---
async function loadPlan(cacheOnly = false) {
  const s = settings.get();
  const cached = readJSON('ss.plan', null);
  if (cacheOnly && cached) return cached;
  const js = await loadScript();
  if (js?.plan) {
    const prefix = (s.planTabPrefix || 'S').toLowerCase();
    const days = new Map();
    js.plan.filter(t => t.name.toLowerCase().startsWith(prefix)).forEach(t => parsePlanRows(t.rows).forEach(d => days.set(d.date, d)));
    const plan = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (plan.length) { writeJSON('ss.plan', plan); state.planSource = 'script'; return plan; }
  }
  if (!s.planSheetId || !canReachNetwork()) return cached || DEFAULT_PLAN();
  try {
    const days = new Map(); let misses = 0;
    for (let w = 1; w <= 52 && misses < 3; w++) {
      const tab = `${s.planTabPrefix || 'S'}${String(w).padStart(2, '0')}`;
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${s.planSheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(tab)}`);
      const txt = r.ok ? await r.text() : '';
      if (!r.ok || txt.trim().startsWith('<')) { if (w === 1) throw new Error('plan non partagé'); misses++; continue; }
      const rows = parsePlanRows(parseCSV(txt));
      // un onglet inexistant renvoie le premier onglet : on s'arrête quand les dates se répètent
      if (!rows.length || rows.every(d => days.has(d.date))) { misses++; continue; }
      misses = 0;
      rows.forEach(d => days.set(d.date, d));
    }
    const plan = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (plan.length) { writeJSON('ss.plan', plan); state.planSource = 'sheet'; return plan; }
  } catch (e) {
    console.warn('Plan Google Sheet indisponible', e);
    state.planSource = 'fallback';
  }
  return cached || DEFAULT_PLAN();
}
