// Accès aux données : Intervals.icu (API publique, clé personnelle) + cache local + mode démo
import { isoDate, addDays, today } from './util.js';
import { buildDemo, demoStreams, demoLaps } from './demo.js';
import { suuntoSummary } from './fit.js';

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
    return Object.assign({ apiKey: '', athleteId: '0', sheetId: '1tWbSyZ-WKS4PHJ8PfpeE2q1EeRh6VB3f2-Eat0ZTkEg', sheetTabs: 'Calendrier 2025/2026,Calendrier 2026/2027', planSheetId: '1D4-NZk7bY_4dhvsosQyqe4KTlk2XjkCIYqublF3kDZ8', planTabPrefix: 'S', shoeLimit: 800, demo: false }, readJSON(LS.settings, {}));
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
    Object.assign(state, { athlete: slimAthlete(athlete), activities: merged, wellness: well.sort((a, b) => a.id.localeCompare(b.id)), gear, paceCurves: slimCurves(pc), updated: new Date() });
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
  if (!a || a.source !== 'SUUNTO' && !state.demo) return null;
  const all = readJSON('ss.suunto', {});
  if (all[a.id] !== undefined) return all[a.id];
  let res = null;
  if (state.demo) res = a.distance ? { vo2max: 57 + (a.id.length % 5) * 0.5 } : null;
  else {
    const x = suuntoSummary(await client().file(a.id));
    res = { vo2max: x.vo2max != null ? Math.round(x.vo2max * 10) / 10 : null, recoverySec: x.recoverySec ?? null };
  }
  if (!state.demo) { all[a.id] = res; writeJSON('ss.suunto', all); }
  return res;
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
import { parseRaceSheet, parseCSV, DEFAULT_RACES } from './races.js';
import { parsePlanRows, DEFAULT_PLAN } from './plan.js';
async function loadRaces(cacheOnly = false) {
  const s = settings.get();
  const cached = readJSON('ss.races', null);
  if (cacheOnly && cached) return cached;
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
    if (all.length) { writeJSON('ss.races', all); state.racesSource = 'sheet'; return all; }
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

export function clearCache() { localStorage.removeItem(LS.cache); localStorage.removeItem('ss.races'); localStorage.removeItem('ss.plan'); streamCache.clear(); lapCache.clear(); }

// --- Plan d'entraînement (Google Sheet, un onglet par semaine) ---
async function loadPlan(cacheOnly = false) {
  const s = settings.get();
  const cached = readJSON('ss.plan', null);
  if (cacheOnly && cached) return cached;
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
