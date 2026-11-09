// Calculs : semaines, récupération, zones, records
import { parseLocal, startOfWeek, isoDate, addDays, today, mean, sd, sportCat, fmtHours } from './util.js';

export const isRun = a => sportCat(a.type) === 'run';

// Agrégats hebdomadaires sur n semaines (lundi → dimanche), la plus récente en dernier
export function weekly(acts, n = 12, refDate = today()) {
  const w0 = startOfWeek(refDate);
  const weeks = Array.from({ length: n }, (_, i) => {
    const s = addDays(w0, -7 * (n - 1 - i));
    return { start: s, key: isoDate(s), runKm: 0, runSec: 0, totalSec: 0, dplus: 0, load: 0, bySport: { run: 0, ride: 0, hike: 0, strength: 0, swim: 0, other: 0 }, count: 0, runCount: 0, longest: 0 };
  });
  const idx = new Map(weeks.map((w, i) => [w.key, i]));
  for (const a of acts) {
    const k = isoDate(startOfWeek(parseLocal(a.start_date_local)));
    const i = idx.get(k); if (i == null) continue;
    const w = weeks[i];
    const sec = a.moving_time || 0;
    const cat = sportCat(a.type);
    w.totalSec += sec; w.bySport[cat] += sec; w.load += a.icu_training_load || 0; w.count++;
    if (cat === 'run') { w.runKm += (a.distance || 0) / 1000; w.runSec += sec; w.runCount++; w.longest = Math.max(w.longest, (a.distance || 0) / 1000); }
    if (cat === 'run') w.dplus += a.total_elevation_gain || 0;
  }
  return weeks;
}

export function monthly(acts, months = 12) {
  const t = today();
  const list = Array.from({ length: months }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth() - (months - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, date: d, runKm: 0, totalSec: 0, dplus: 0, count: 0 };
  });
  const idx = new Map(list.map((m, i) => [m.key, i]));
  for (const a of acts) {
    const i = idx.get(a.start_date_local.slice(0, 7)); if (i == null) continue;
    const m = list[i];
    m.totalSec += a.moving_time || 0; m.count++;
    if (isRun(a)) { m.runKm += (a.distance || 0) / 1000; m.dplus += a.total_elevation_gain || 0; }
  }
  return list;
}

// Récupération : compare la VFC, la FC de repos et le sommeil du jour à ta référence (60 jours)
export function recovery(wellness) {
  if (!wellness?.length) return null;
  const byDate = new Map(wellness.map(w => [w.id, w]));
  const last = [...wellness].reverse().find(w => w.hrv || w.restingHR || w.sleepSecs);
  if (!last) return null;
  const end = parseLocal(last.id);
  const win = [];
  for (let i = 1; i <= 60; i++) { const w = byDate.get(isoDate(addDays(end, -i))); if (w) win.push(w); }
  const last7 = []; for (let i = 0; i < 7; i++) { const w = byDate.get(isoDate(addDays(end, -i))); if (w) last7.push(w); }
  const hrvM = mean(win.map(w => w.hrv)), hrvS = sd(win.map(w => w.hrv));
  const hrv7 = mean(last7.map(w => w.hrv));
  const rhrM = mean(win.map(w => w.restingHR)), rhrS = sd(win.map(w => w.restingHR));
  const sleepM = mean(win.map(w => w.sleepSecs));
  const signals = [];
  let score = 0, n = 0;
  if (last.hrv && hrvM && hrvS) {
    const z = (hrv7 - hrvM) / hrvS; // tendance 7 j (plus robuste qu'une seule nuit)
    const zDay = (last.hrv - hrvM) / hrvS;
    score += Math.max(-2, Math.min(2, z)) * 1.5 + Math.max(-2, Math.min(2, zDay)) * 0.5; n += 2;
    signals.push({ k: 'VFC', v: `${Math.round(last.hrv)} ms`, ref: `réf. ${Math.round(hrvM - hrvS)}–${Math.round(hrvM + hrvS)} ms`, s: z < -1 ? 'bad' : z < -0.5 ? 'warn' : 'good' });
  }
  if (last.restingHR && rhrM && rhrS) {
    const z = (last.restingHR - rhrM) / Math.max(1, rhrS);
    score -= Math.max(-2, Math.min(2, z)); n += 1;
    signals.push({ k: 'FC de repos', v: `${last.restingHR} bpm`, ref: `réf. ${Math.round(rhrM)} bpm`, s: z > 1.5 ? 'bad' : z > 0.8 ? 'warn' : 'good' });
  }
  if (last.sleepSecs && sleepM) {
    const diff = (last.sleepSecs - sleepM) / 3600;
    score += Math.max(-1.5, Math.min(1, diff)); n += 1;
    signals.push({ k: 'Sommeil', v: fmtHours(last.sleepSecs), ref: `moy. ${(sleepM / 3600).toFixed(1).replace('.', ',')} h`, s: diff < -1.2 ? 'bad' : diff < -0.5 ? 'warn' : 'good' });
  }
  if (last.steps != null) signals.push({ k: 'Pas', v: last.steps.toLocaleString('fr-FR'), ref: (() => { const m = mean(win.map(w => w.steps)); return m ? `moy. ${Math.round(m).toLocaleString('fr-FR')}` : ''; })(), s: 'neutral' });
  const norm = n ? score / n : 0;
  let level, label, advice;
  if (norm > 0.25) { level = 'good'; label = 'Bien récupéré'; advice = 'Les signaux sont au vert : bonne journée pour une séance de qualité.'; }
  else if (norm > -0.35) { level = 'ok'; label = 'Récupération normale'; advice = 'Rien d\'anormal : suis ton plan.'; }
  else if (norm > -0.9) { level = 'warn'; label = 'Fatigue à surveiller'; advice = 'Ta VFC et/ou ton sommeil sont sous ta référence : privilégie l\'endurance facile.'; }
  else { level = 'bad'; label = 'Fatigue marquée'; advice = 'Plusieurs signaux dégradés : journée de récupération conseillée.'; }
  return { date: last.id, level, label, advice, signals, last, hrvM, hrvS, rhrM };
}

// Zones FC d'une activité : temps, %, bornes
export function hrZones(a, athlete) {
  const times = a.icu_hr_zone_times;
  const bounds = a.icu_hr_zones || athlete?.run?.hr_zones;
  if (!times?.length || !bounds?.length) return null;
  const names = athlete?.run?.hr_zone_names || ZONE_NAMES;
  const total = times.reduce((s, x) => s + x, 0) || 1;
  return times.map((t, i) => ({
    z: `Z${i + 1}`, name: names[i] || '', t, pct: t / total * 100,
    lo: i === 0 ? 0 : bounds[i - 1] + 1, hi: bounds[i],
  }));
}

// Répartition des zones sur une période (somme des activités)
export function zonesSum(acts) {
  const sum = [];
  for (const a of acts) (a.icu_hr_zone_times || []).forEach((t, i) => { sum[i] = (sum[i] || 0) + t; });
  return sum;
}

export const ZONE_NAMES = ['Récupération', 'Endurance fondamentale', 'Endurance active', 'Seuil', 'VMA', 'Anaérobie'];

// VAP (vitesse ajustée à la pente) : facteur d'effort selon la pente, relatif au plat
export function gradeFactor(g) {
  // proche du modèle « GAP » de Strava : la montée coûte beaucoup, la descente ne fait gagner qu'un peu
  const G = Math.max(-30, Math.min(30, g * 100));
  return G >= 0 ? 1 + 0.035 * G + 0.0006 * G * G : Math.max(0.86, 1 + 0.018 * G + 0.0006 * G * G);
}
// VAP sur un segment de streams [i0, i1] : somme des distances équivalentes plat / temps
export function gapSpeed(s, i0, i1) {
  const d = s.distance, t = s.time, alt = s.fixed_altitude || s.altitude;
  if (!d || !t) return null;
  if (!alt) return (d[i1] - d[i0]) / Math.max(1, t[i1] - t[i0]);
  let eq = 0, j = i0;
  while (j < i1) {
    // fenêtre d'au moins 30 m pour lisser la pente
    let k = j + 1; while (k < i1 && d[k] - d[j] < 30) k++;
    const dd = d[k] - d[j];
    if (dd > 0) eq += dd * gradeFactor((alt[k] - alt[j]) / dd);
    j = k;
  }
  return eq / Math.max(1, t[i1] - t[i0]);
}

// VO2max estimée par sortie (Suunto ne transmet pas la sienne) :
// VO2 de la course (ACSM, sur la VAP) rapportée à la fraction de FC de réserve, puis calée sur le dernier test labo.
function rawVo2(a, athlete) {
  if (!isRun(a) || !a.average_heartrate || (a.moving_time || 0) < 1200) return null;
  const v = (a.gap || a.average_speed) * 60; // m/min
  const rest = a.icu_resting_hr || athlete?.restingHR || 50;
  const max = athlete?.run?.max_hr || a.athlete_max_hr || 200;
  const hrr = (a.average_heartrate - rest) / (max - rest);
  if (!v || hrr < 0.5 || hrr > 1) return null;
  return 0.2 * v / hrr;
}
let calib = null;
export function vo2Estimate(a, athlete, acts, lab) {
  const raw = rawVo2(a, athlete);
  if (raw == null) return null;
  if (!lab?.vo2max) return Math.round((3.5 + raw) * 10) / 10;
  const key = lab.date + ':' + acts.length;
  if (!calib || calib.key !== key) {
    const t0 = parseLocal(lab.date).getTime(), win = 75 * 86400000;
    let vals = acts.filter(x => Math.abs(parseLocal(x.start_date_local).getTime() - t0) < win).map(x => rawVo2(x, athlete)).filter(v => v != null);
    if (vals.length < 5) vals = acts.map(x => rawVo2(x, athlete)).filter(v => v != null);
    vals.sort((x, y) => x - y);
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    calib = { key, k: med ? (lab.vo2max - 3.5) / med : 1 };
  }
  return Math.round((3.5 + raw * calib.k) * 10) / 10;
}

// Records : meilleurs efforts depuis la courbe d'allure d'Intervals.icu
export const RECORD_DIST = [[1000, '1 km'], [1609.34, '1 mile'], [5000, '5 km'], [10000, '10 km'], [15000, '15 km'], [21097.5, 'Semi'], [30000, '30 km'], [42195, 'Marathon'], [50000, '50 km']];
export function bestEfforts(pc, curveIdx = 0) {
  const c = pc?.list?.[curveIdx];
  if (!c) return [];
  return RECORD_DIST.map(([d, label]) => {
    // on cherche la meilleure valeur plausible pour cette distance (allure > 2'40/km)
    const i = c.distance.findIndex(x => Math.abs(x - d) < 2);
    if (i < 0) return { d, label, sec: null };
    const sec = c.values[i];
    if (!sec || sec / (d / 1000) < 160) return { d, label, sec: null, suspicious: true };
    const actId = c.activity_id?.[i];
    return { d, label, sec, pace: sec / (d / 1000), actId, act: pc.activities?.[actId] };
  });
}

export function activityRecords(acts) {
  const runs = acts.filter(isRun);
  const by = (f) => runs.reduce((best, a) => (f(a) > (best ? f(best) : -Infinity) ? a : best), null);
  return [
    { label: 'Plus longue sortie', a: by(a => a.distance || 0), fmt: 'km' },
    { label: 'Plus longue durée', a: by(a => a.moving_time || 0), fmt: 'dur' },
    { label: 'Plus gros D+', a: by(a => a.total_elevation_gain || 0), fmt: 'dplus' },
  ];
}
