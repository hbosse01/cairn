// Données de démonstration (fictives) — utilisées dans l'aperçu ou tant que la clé API n'est pas renseignée
import { isoDate, addDays, today } from './util.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ZONES = [158, 175, 192, 199, 206, 211];
const ZONE_NAMES = ['Récupération', 'Endurance fondamentale', 'Endurance active', 'Seuil', 'VMA', 'Anaérobie'];

export function buildDemo() {
  const r = rng(42);
  const t0 = today();
  const start = addDays(t0, -730);
  const acts = [];
  const loadByDay = {};
  let id = 1;
  const names = {
    Run: ['Footing', 'Footing récup', 'Sortie longue', 'Seuil 3x10 min SV1', '8 x 3 min SV2', 'Fartlek 10 x 1\'1\'', 'Double threshold'],
    TrailRun: ['Trail vallonné', 'Sortie longue D+', 'Côtes 10 x 1 min', 'Trail technique'],
    VirtualRun: ['Tapis incliné lesté', 'Tapis 2 x 400 D+ 12 %'],
    VirtualRide: ['Home trainer récup', 'Home trainer Z2'],
    WeightTraining: ['Renfo 1h', 'Muscu jambes'],
  };
  for (let d = new Date(start); d <= t0; d = addDays(d, 1)) {
    const wd = (d.getDay() + 6) % 7; // 0 = lundi
    const plan = [
      [['Run', 0.95]], [['Run', 0.9], ['WeightTraining', 0.35]], [['Run', 0.85]], [['Run', 0.9], ['VirtualRun', 0.25]],
      [['VirtualRide', 0.4], ['WeightTraining', 0.45]], [['TrailRun', 0.6], ['Run', 0.35]], [['Run', 0.9]],
    ][wd];
    for (const [type, p] of plan) {
      if (r() > p) continue;
      const long = (wd === 5 || wd === 6) && type !== 'VirtualRide';
      const isRun = ['Run', 'TrailRun', 'VirtualRun'].includes(type);
      const pace = isRun ? (type === 'TrailRun' ? 300 + r() * 60 : type === 'VirtualRun' ? 330 + r() * 40 : 240 + r() * 30) : null;
      let dur = type === 'WeightTraining' ? 2700 + r() * 1200 : type === 'VirtualRide' ? 2700 + r() * 1800 : long ? 5400 + r() * 3600 : 2700 + r() * 2400;
      const dist = isRun ? Math.round((dur / pace) * 1000) : type === 'VirtualRide' ? Math.round(dur * 8.3) : 0;
      const dplus = type === 'TrailRun' ? Math.round(dist / 1000 * (25 + r() * 25)) : type === 'VirtualRun' ? Math.round(dist / 1000 * 60) : isRun ? Math.round(dist / 1000 * (4 + r() * 6)) : 0;
      const intense = /SV2|Seuil|Fartlek|threshold|Côtes/i.test('');
      const nm = names[type][Math.floor(r() * names[type].length)];
      const hard = /SV1|SV2|Fartlek|threshold|Côtes|2 x 400/.test(nm);
      const avgHr = type === 'WeightTraining' ? 112 + r() * 15 : Math.round((hard ? 172 : 158) + r() * 10);
      const zt = zoneTimes(dur, avgHr, hard, r);
      const loadVal = Math.round(dur / 3600 * (hard ? 95 : 62) * (type === 'WeightTraining' ? 0.5 : 1));
      const hh = 6 + Math.floor(r() * 3) + (wd >= 5 ? 1 : 0) + (type === 'WeightTraining' ? 11 : 0);
      const startLocal = `${isoDate(d)}T${String(hh).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00`;
      acts.push({
        id: 'demo' + (id++), start_date_local: startLocal, type, name: nm, distance: dist, moving_time: Math.round(dur), elapsed_time: Math.round(dur * 1.04),
        total_elevation_gain: dplus, average_heartrate: Math.round(avgHr), max_heartrate: Math.min(211, Math.round(avgHr + 12 + r() * 14)),
        icu_hr_zones: ZONES, icu_hr_zone_times: zt, icu_training_load: loadVal, average_speed: dist && dur ? dist / dur : null, gap: isRun && dist ? (dist / dur) * (1 + dplus / dist * 7) : null, icu_resting_hr: 52, icu_lap_count: isRun ? Math.ceil(dist / 1000) : 1,
        average_cadence: isRun ? 86 + r() * 6 : null, calories: Math.round(dur / 60 * 12), gear: isRun ? { id: type === 'TrailRun' ? 'g2' : r() > 0.5 ? 'g1' : 'g3' } : null,
        source: 'SUUNTO', race: false, decoupling: isRun ? Math.round((r() * 8 - 1) * 10) / 10 : null,
      });
      loadByDay[isoDate(d)] = (loadByDay[isoDate(d)] || 0) + loadVal;
    }
  }
  // Une course récente pour l'exemple
  const raceDay = addDays(t0, -8);
  acts.push({
    id: 'demo-race', start_date_local: `${isoDate(raceDay)}T09:30:00`, type: 'TrailRun', name: 'Trail du dimanche (course)', distance: 30200, moving_time: 9420, elapsed_time: 9500,
    total_elevation_gain: 820, average_heartrate: 181, max_heartrate: 203, icu_hr_zones: ZONES, icu_hr_zone_times: [120, 900, 5600, 2500, 300, 0], icu_training_load: 238,
    average_speed: 3.21, gap: 3.62, icu_resting_hr: 52, icu_lap_count: 31, average_cadence: 88, calories: 2100, gear: { id: 'g2' }, source: 'SUUNTO', race: true, decoupling: 5.4,
  });
  loadByDay[isoDate(raceDay)] = (loadByDay[isoDate(raceDay)] || 0) + 238;
  acts.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));

  // Santé + forme (CTL/ATL)
  const wellness = [];
  let ctl = 55, atl = 55, hrvBase = 52;
  for (let d = new Date(start); d <= t0; d = addDays(d, 1)) {
    const k = isoDate(d);
    const load = loadByDay[k] || 0;
    ctl = ctl + (load - ctl) / 42; atl = atl + (load - atl) / 7;
    const tsb = ctl - atl;
    hrvBase += (r() - 0.5) * 0.6; hrvBase = Math.min(60, Math.max(44, hrvBase));
    const hrv = Math.round(hrvBase + tsb * 0.25 + (r() - 0.5) * 9);
    const sleep = Math.round((7.3 + (r() - 0.45) * 1.8 + (d.getDay() === 0 || d.getDay() === 6 ? 0.6 : 0)) * 3600);
    wellness.push({
      id: k, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, rampRate: null, sleepSecs: sleep, sleepScore: Math.round(Math.min(98, 62 + (sleep / 3600 - 6) * 9 + r() * 10)),
      hrv, restingHR: Math.round(53 - tsb * 0.08 + (r() - 0.5) * 4), avgSleepingHR: Math.round(55 + (r() - 0.5) * 5), steps: Math.round(9000 + r() * 11000 + (loadByDay[k] ? 6000 : 0)), spO2: Math.round(95 + r() * 3),
    });
  }

  const runActs = acts.filter(a => ['Run', 'TrailRun', 'VirtualRun'].includes(a.type));
  const kmBy = gid => runActs.filter(a => a.gear?.id === gid).reduce((s, a) => s + a.distance, 0);
  const gear = [
    { id: 'g1', type: 'Shoes', name: 'Chaussure route — entraînement', distance: kmBy('g1') * 0.35, retired: null, activities: 0 },
    { id: 'g2', type: 'Shoes', name: 'Chaussure trail — polyvalente', distance: kmBy('g2') * 0.5, retired: null, activities: 0 },
    { id: 'g3', type: 'Shoes', name: 'Chaussure route — carbone', distance: kmBy('g3') * 0.3, retired: null, activities: 0 },
    { id: 'g4', type: 'Shoes', name: 'Ancienne paire trail', distance: 912000, retired: '2026-03-01', activities: 0 },
    { id: 'g5', type: 'Bike', name: 'Vélo de route', distance: 1856000, retired: null, activities: 0 },
  ];

  const curveDist = [400, 1000, 1609.34, 3000, 5000, 10000, 15000, 21097.5, 30000, 42195, 50000];
  const allT = [66, 172, 285, 535, 925, 1960, 3010, 4520, 6950, 10380, 14400];
  const yrT = allT.map((v, i) => Math.round(v * (1 + 0.012 * (i % 3))));
  const pick = () => runActs[Math.floor(r() * Math.min(200, runActs.length))].id;
  const ids1 = curveDist.map(pick), ids2 = curveDist.map(pick);
  const actMap = {};
  [...ids1, ...ids2].forEach(i => { const a = acts.find(x => x.id === i); actMap[i] = { name: a.name, start_date_local: a.start_date_local, distance: a.distance }; });
  const paceCurves = {
    list: [
      { id: 'all', label: 'Tout temps', distance: curveDist, values: allT, activity_id: ids1 },
      { id: '1y', label: '12 derniers mois', distance: curveDist, values: yrT, activity_id: ids2 },
    ], activities: actMap,
  };

  const athlete = { name: 'Henri (démo)', weight: 62, restingHR: 52, run: { lthr: 195, max_hr: 211, hr_zones: ZONES, hr_zone_names: ZONE_NAMES, threshold_pace: 1000 / 211 } };
  return { athlete, activities: acts, wellness, gear, paceCurves };
}

function zoneTimes(dur, avgHr, hard, r) {
  const w = hard ? [0.1, 0.25, 0.35, 0.22, 0.07, 0.01] : avgHr < 130 ? [0.88, 0.1, 0.02, 0, 0, 0] : [0.15, 0.6, 0.22, 0.03, 0, 0];
  const j = w.map(x => x * (0.7 + r() * 0.6));
  const s = j.reduce((a, b) => a + b, 0);
  return j.map(x => Math.round(dur * x / s));
}

export function demoStreams(a) {
  if (!a) return {};
  const moving = (a.distance || 0) > 0;
  const r = rng(a.id.length * 97 + (a.moving_time || 1));
  const n = Math.max(60, Math.round((a.moving_time || 3600) / 10));
  const time = [], distance = [], heartrate = [], velocity_smooth = [], altitude = [];
  let d = 0, alt = 120, hr = 120, v = a.average_speed || 3;
  for (let i = 0; i < n; i++) {
    const t = i * 10; time.push(t);
    const phase = Math.sin(i / 23) + (r() - 0.5) * 0.4;
    const vi = Math.max(0.5, v * (1 + phase * 0.08));
    if (moving) { d += vi * 10; distance.push(Math.round(d)); }
    alt += (a.total_elevation_gain ? Math.sin(i / 40) * (a.total_elevation_gain / n) * 3.2 : (r() - 0.5)); altitude.push(Math.round(alt * 10) / 10);
    const target = (a.average_heartrate || 150) + phase * 9;
    hr += (target - hr) * (i < 30 ? 0.04 : 0.2); heartrate.push(Math.round(hr));
    if (moving) velocity_smooth.push(Math.round(vi * 100) / 100);
  }
  return moving ? { time, distance, heartrate, velocity_smooth, altitude } : { time, heartrate };
}

export function demoLaps(a) {
  const s = demoStreams(a);
  if (!s.distance) return [];
  const laps = []; let i0 = 0, k = 1;
  for (let i = 0; i < s.distance.length; i++) {
    if (s.distance[i] >= k * 1000 || i === s.distance.length - 1) {
      const dd = s.distance[i] - s.distance[i0], dt = s.time[i] - s.time[i0];
      if (dd < 50) break;
      const hr = s.heartrate.slice(i0, i + 1);
      let up = 0; for (let j = i0 + 1; j <= i; j++) up += Math.max(0, s.altitude[j] - s.altitude[j - 1]);
      laps.push({ start_index: i0, end_index: i, distance: dd, moving_time: dt, elapsed_time: dt, average_speed: dd / dt, gap: dd / dt * (1 + up / dd * 7), average_heartrate: Math.round(hr.reduce((x, y) => x + y, 0) / hr.length), max_heartrate: Math.max(...hr), total_elevation_gain: up, type: 'WORK' });
      i0 = i; k++;
    }
  }
  return laps;
}
