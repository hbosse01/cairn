import { state, getStreams, getLaps, getFit, tests, addManualActivity } from '../data.js';
import { chart, C, gradient, ZONE_COLORS } from '../charts.js';
import { hrZones, isRun, gapSpeed, gradeFactor, ZONE_NAMES } from '../metrics.js';
import { esc, fmtDate, fmtTime, fmtKm, fmtDur, fmtChrono, fmtPace, fmtNum, paceFromSpeed, sportCat, typeLabel, ICONS, parseLocal, startOfWeek, isoDate, fmtHours, weekNumber } from '../util.js';
import { zoneBar, zoneTable, segmented, bindSeg, empty } from './parts.js';

let filter = 'all', shown = 40, query = '';
const FILTERS = [['all', 'Tout'], ['run', 'Course'], ['ride', 'Vélo'], ['strength', 'Muscu'], ['other', 'Autre']];
function matches(a) {
  const c = sportCat(a.type);
  if (filter === 'all') return true;
  if (filter === 'other') return !['run', 'ride', 'strength'].includes(c);
  return c === filter;
}

export function renderActivities(el) {
  const list = state.activities.filter(a => matches(a) && (!query || (a.name || '').toLowerCase().includes(query)));
  const groups = [];
  for (const a of list.slice(0, shown)) {
    const wk = isoDate(startOfWeek(parseLocal(a.start_date_local)));
    let g = groups[groups.length - 1];
    if (!g || g.key !== wk) { g = { key: wk, acts: [] }; groups.push(g); }
    g.acts.push(a);
  }
  el.innerHTML = `
    <div class="page-head"><h2>Séances</h2><button class="btn small" id="add-act">+ Ajouter</button></div>
    ${segmented('f', FILTERS, filter)}
    <div id="add-form" hidden></div>
    <input class="search" type="search" placeholder="Rechercher une séance…" value="${esc(query)}" aria-label="Rechercher une séance">
    ${!list.length ? empty('Aucune séance ne correspond.') : groups.map(g => {
      const d = parseLocal(g.key);
      const allWeek = list.filter(a => isoDate(startOfWeek(parseLocal(a.start_date_local))) === g.key);
      const km = allWeek.filter(isRun).reduce((s, a) => s + (a.distance || 0), 0);
      const sec = allWeek.reduce((s, a) => s + (a.moving_time || 0), 0);
      return `<h4 class="week-h">Sem. ${weekNumber(d)} · ${fmtDate(d)} <span>${km ? fmtKm(km, 1) + ' km course · ' : ''}${fmtHours(sec)}</span></h4>
      <div class="act-list">${g.acts.map(row).join('')}</div>`;
    }).join('')}
    ${list.length > shown ? `<button class="btn ghost wide" id="more">Afficher plus de séances</button>` : ''}
  `;
  bindSeg(el, 'f', v => { filter = v; shown = 40; renderActivities(el); });
  el.querySelector('#add-act').addEventListener('click', () => showAddForm(el));
  el.querySelector('#more')?.addEventListener('click', () => { shown += 60; renderActivities(el); });
  const s = el.querySelector('.search');
  s.addEventListener('change', () => { query = s.value.trim().toLowerCase(); shown = 40; renderActivities(el); });
}

// Ajout d'une séance sans montre (home trainer, tapis…) directement dans Intervals.icu
function showAddForm(el) {
  const box = el.querySelector('#add-form');
  if (!box.hidden) { box.hidden = true; return; }
  const now = new Date();
  box.hidden = false;
  box.innerHTML = `<section class="card"><h3>Nouvelle séance</h3>
    <p class="tiny muted">Pour les séances sans montre. Les séances saisies dans Strava ne peuvent pas arriver dans Cairn (règle de Strava) : saisis-les ici.</p>
    <form class="form" id="af">
      <label>Type<select name="type">
        <option value="VirtualRide">Home trainer</option><option value="VirtualRun">Tapis</option><option value="Run">Course à pied</option><option value="TrailRun">Trail</option>
        <option value="Ride">Vélo</option><option value="WeightTraining">Musculation</option><option value="Workout">Autre</option></select></label>
      <label>Nom<input name="name" placeholder="Home trainer Z2"></label>
      <fieldset><legend>Quand</legend><label>Date<input type="date" name="date" required value="${isoDate(now)}"></label><label>Heure<input type="time" name="time" value="${String(now.getHours()).padStart(2, '0')}:00"></label></fieldset>
      <fieldset><legend>Effort</legend><label>Durée (h:mm)<input name="dur" required placeholder="0:45"></label><label>Distance (km)<input name="km" inputmode="decimal" placeholder="optionnel"></label><label>FC moyenne<input name="hr" inputmode="numeric" placeholder="optionnel"></label><label>D+ (m)<input name="dplus" inputmode="numeric" placeholder="optionnel"></label></fieldset>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
      <p class="tiny err" id="aerr"></p>
      <div class="row"><button class="btn" type="submit">Enregistrer la séance</button><button class="btn ghost" type="button" id="acancel">Annuler</button></div>
    </form></section>`;
  box.querySelector('#acancel').addEventListener('click', () => { box.hidden = true; });
  box.querySelector('#af').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const m = String(d.dur).trim().match(/^(\d{1,2})(?:[:h](\d{1,2}))?$/);
    const err = box.querySelector('#aerr');
    if (!m) { err.textContent = 'Durée au format h:mm, par exemple 0:45 ou 1:30.'; return; }
    const sec = (+m[1]) * 3600 + (+(m[2] || 0)) * 60;
    const num = v => v === '' || v == null ? undefined : Number(String(v).replace(',', '.'));
    const typeName = e.target.type.selectedOptions[0].textContent;
    const body = { start_date_local: `${d.date}T${d.time || '12:00'}:00`, type: d.type, name: d.name || typeName, moving_time: sec, elapsed_time: sec,
      distance: num(d.km) != null ? Math.round(num(d.km) * 1000) : undefined, average_heartrate: num(d.hr), total_elevation_gain: num(d.dplus), description: d.notes || undefined };
    err.textContent = 'Enregistrement…';
    try { await addManualActivity(body); box.hidden = true; } catch (x) { err.textContent = x.message; }
  });
}

function row(a) {
  const cat = sportCat(a.type);
  const z = hrZones(a, state.athlete);
  const run = isRun(a);
  return `<a class="act-row" href="#seance-${encodeURIComponent(a.id)}">
    <span class="sport-ico s-${cat}">${ICONS[cat]}</span>
    <div class="act-main">
      <div class="act-title"><b>${esc(a.name)}</b>${a.race ? '<span class="tag prio-A">Course</span>' : ''}</div>
      <span class="muted tiny">${fmtDate(a.start_date_local, { weekday: true })} · ${typeLabel(a.type)}</span>
      <div class="act-nums">
        ${a.distance ? `<span>${fmtKm(a.distance, 1)} km</span>` : ''}
        <span>${fmtDur(a.moving_time, { short: true })}</span>
        ${run && a.average_speed ? `<span>${fmtPace(paceFromSpeed(a.average_speed))}/km</span>` : ''}
        ${run && a.gap ? `<span class="vap">VAP ${fmtPace(paceFromSpeed(a.gap))}</span>` : ''}
        ${a.average_heartrate ? `<span>♥ ${Math.round(a.average_heartrate)}</span>` : ''}
        ${a.total_elevation_gain > 20 ? `<span>↗ ${fmtNum(a.total_elevation_gain)} m</span>` : ''}
      </div>
      ${z ? zoneBar(z) : ''}
    </div>
  </a>`;
}

export async function renderActivity(el, id) {
  let a = state.activities.find(x => String(x.id) === String(id));
  if (!a) { el.innerHTML = empty('Séance introuvable (elle n\'est peut-être pas encore synchronisée).'); return; }
  // Séance Suunto : on lit d'abord le fichier de la montre pour avoir ses chiffres exacts
  let fit = null;
  if (a.source === 'SUUNTO' && !state.demo) {
    if (!a._fit) el.innerHTML = `<a class="back" href="#seances">← Séances</a><section class="card"><p class="muted">Lecture des données de ta montre…</p></section>`;
    try { fit = await getFit(a); a = state.activities.find(x => String(x.id) === String(id)) || a; } catch (e) { console.warn(e); }
    if (location.hash !== `#seance-${encodeURIComponent(id)}` && location.hash !== `#seance-${id}`) return;
  }
  const cat = sportCat(a.type);
  const run = isRun(a);
  const pace = run ? paceFromSpeed(a.average_speed) : null;

  el.innerHTML = `
    <a class="back" href="#seances">← Séances</a>
    <section class="card">
      <div class="act-head big"><span class="sport-ico s-${cat}">${ICONS[cat]}</span><div><h2>${esc(a.name || typeLabel(a.type))}</h2><span class="muted tiny">${typeLabel(a.type)} · ${fmtDate(a.start_date_local, { weekday: true, year: true })} à ${fmtTime(a.start_date_local)}${a.device_name ? ' · ' + esc(a.device_name) : ''}</span></div></div>
      <div class="stat-grid">
        ${a.distance ? st('Distance', `${fmtKm(a.distance, 2)} km`) : ''}
        ${st('Durée', fmtChrono(a.moving_time))}
        ${a.elapsed_time && a.elapsed_time - a.moving_time > 30 ? st('Temps total', fmtChrono(a.elapsed_time)) : ''}
        ${pace ? st('Allure moy.', `${fmtPace(pace)}/km`) : ''}
        ${run ? st('VAP moy.', `<i id="vap-val">${a.gap ? fmtPace(paceFromSpeed(a.gap)) + '/km' : '…'}</i>`) : ''}
        ${!run && a.average_speed && a.distance ? st('Vitesse moy.', `${fmtNum(a.average_speed * 3.6, 1)} km/h`) : ''}
        ${a.average_heartrate ? st('FC moy.', `${Math.round(a.average_heartrate)} bpm`) : ''}
        ${a.max_heartrate ? st('FC max', `${Math.round(a.max_heartrate)} bpm`) : ''}
        ${a.distance ? st('D+', `${fmtNum(a.total_elevation_gain || 0)} m`) : ''}
        ${a.distance ? st('D−', `<i id="dminus">${a.total_elevation_loss != null ? fmtNum(a.total_elevation_loss) + ' m' : '…'}</i>`) : ''}
        ${a.average_cadence ? st('Cadence', `${Math.round(run && a.average_cadence < 120 ? a.average_cadence * 2 : a.average_cadence)} pas/min`) : ''}
        ${a.vo2max || fit?.summary?.vo2max ? st('VO2max (Suunto)', `${fmtNum(a.vo2max || fit.summary.vo2max, 1)} <small>ml/kg/min</small>`) : (state.demo && a.distance ? st('VO2max (Suunto)', `57,5 <small>ml/kg/min</small>`) : '')}
        ${a.calories ? st('Calories', `${fmtNum(a.calories)} kcal`) : ''}
      </div>
      ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    </section>
    <section class="card" id="hrz"><p class="muted tiny">Chargement…</p></section>
    ${run ? `<section class="card" id="pz" hidden></section>` : ''}
    <section class="card" id="charts"><p class="muted tiny">Chargement des graphiques…</p></section>
    ${a.distance ? `<section class="card" id="laps"><div class="card-head"><h3>Tours (montre)</h3></div><p class="muted tiny">Chargement…</p></section>` : ''}
    ${run ? `<section class="card" id="splits"><div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Chargement…</p></section>` : ''}
  `;

  let s = null;
  try {
    if (fit) s = { time: fit.streams.timer, elapsed: fit.streams.time, distance: fit.streams.distance, heartrate: fit.streams.heartrate, altitude: fit.streams.altitude, velocity_smooth: fit.streams.speed, pausedBefore: fit.streams.pausedBefore, fromWatch: true };
    else s = await getStreams(a.id);
  } catch (e) { console.warn(e); }
  if (!el.isConnected || !el.querySelector('#charts')) return;

  // Zones FC : calculées sur le temps chrono (pauses exclues) quand on a le fichier montre
  const zb = a.icu_hr_zones || state.athlete?.run?.hr_zones;
  const z = s?.fromWatch && zb ? zonesFromStreams(s, zb, state.athlete?.run?.hr_zone_names) : hrZones(a, state.athlete);
  el.querySelector('#hrz').innerHTML = z ? zoneTable(z, { title: 'Temps dans les zones de FC' }) : `<p class="muted">Pas de données de fréquence cardiaque pour cette séance.</p>`;
  if (run && s?.velocity_smooth && s?.time) {
    const pz = paceZonesFromStreams(s, tests.all()[0]);
    const box = el.querySelector('#pz'); if (pz && box) { box.hidden = false; box.innerHTML = zoneTable(pz, { title: 'Temps dans les zones d\'allure' }); }
  }
  if (!s) {
    el.querySelector('#charts').innerHTML = `<p class="muted tiny">Graphiques indisponibles pour cette séance.</p>`;
    const b = el.querySelector('#splits'); if (b) b.innerHTML = `<div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Indisponible.</p>`;
  } else {
    const alt = s.altitude;
    if (a.total_elevation_loss == null) { const e = el.querySelector('#dminus'); if (e) e.textContent = alt ? fmtNum(climb(alt, -1)) + ' m' : '–'; }
    if (run && !a.gap && s.distance && s.time) { const v = gapSpeed(s, 0, s.distance.length - 1); const e = el.querySelector('#vap-val'); if (e && v) e.textContent = fmtPace(paceFromSpeed(v)) + '/km'; }
    renderCharts(el.querySelector('#charts'), a, s);
    if (run) renderSplits(el.querySelector('#splits'), s);
  }
  const v = el.querySelector('#vap-val'); if (v && v.textContent === '…') v.textContent = '–';
  const d = el.querySelector('#dminus'); if (d && d.textContent === '…') d.textContent = '–';

  // Tours : ceux de la montre (temps chrono exact) si on a le fichier, sinon ceux d'Intervals.icu
  if (a.distance) {
    if (fit?.laps?.length) renderLaps(el.querySelector('#laps'), fit.laps.map(l => ({ distance: l.distance, moving_time: l.timer, average_heartrate: l.avgHr, total_elevation_gain: l.ascent, gap: l.i0 >= 0 && l.i1 > l.i0 ? gapSpeed(s, l.i0, l.i1) : null })), run);
    else getLaps(a.id).then(laps => renderLaps(el.querySelector('#laps'), laps, run)).catch(e => { const b = el.querySelector('#laps'); if (b) b.innerHTML = `<div class="card-head"><h3>Tours (montre)</h3></div><p class="muted tiny">Indisponible : ${esc(e.message)}</p>`; });
  }
}

function st(k, v) { return `<div class="st"><span>${k}</span><b>${v}</b></div>`; }

// Dénivelé cumulé avec un seuil de 2 m (évite de compter le bruit du baromètre) ; sign = 1 montée, -1 descente
function climb(alt, sign = 1, i0 = 0, i1 = alt.length - 1) {
  let total = 0, ref = null;
  for (let i = i0; i <= i1; i++) {
    const v = alt[i]; if (v == null) continue;
    if (ref == null) { ref = v; continue; }
    const dlt = (v - ref) * sign;
    if (dlt >= 2) { total += dlt; ref = v; } else if (dlt <= -2) ref = v;
  }
  return total;
}

// Temps (chrono) passé dans chaque zone FC, calculé point par point
function zonesFromStreams(s, bounds, names) {
  const t = s.time, hr = s.heartrate; if (!hr || !t) return null;
  const acc = new Array(bounds.length).fill(0);
  for (let i = 1; i < t.length; i++) {
    if (s.pausedBefore?.[i]) continue;
    const dt = t[i] - t[i - 1]; if (dt <= 0 || dt > 30 || hr[i] == null) continue;
    let k = bounds.findIndex(b => hr[i] <= b); if (k < 0) k = bounds.length - 1;
    acc[k] += dt;
  }
  const total = acc.reduce((p, q) => p + q, 0); if (!total) return null;
  const nm = names || ZONE_NAMES;
  return acc.map((x, i) => ({ z: `Z${i + 1}`, name: nm[i] || '', t: x, pct: x / total * 100, lo: i === 0 ? 0 : bounds[i - 1] + 1, hi: bounds[i] }));
}

// Zones d'allure en 6 zones, alignées sur les zones FC et calées sur le dernier test labo
export function paceBounds(test) {
  const sv1 = test?.sv1 || { paceMin: 244, paceMax: 250 }, sv2 = test?.sv2 || { paceMin: 208, paceMax: 214 };
  // bornes en s/km, de la plus lente à la plus rapide
  const z2slow = Math.round(sv1.paceMax * 1.25);
  return [
    { name: 'Récupération', slow: Infinity, fast: z2slow + 1 },
    { name: 'Endurance fondamentale', slow: z2slow, fast: sv1.paceMax + 1 },
    { name: 'Endurance active', slow: sv1.paceMax, fast: sv2.paceMax + 1 },
    { name: 'Seuil', slow: sv2.paceMax, fast: sv2.paceMin },
    { name: 'VMA', slow: sv2.paceMin - 1, fast: Math.round(sv2.paceMin * 0.9) },
    { name: 'Anaérobie', slow: Math.round(sv2.paceMin * 0.9) - 1, fast: 0 },
  ];
}
function paceZonesFromStreams(s, test) {
  const B = paceBounds(test), t = s.time, v = s.velocity_smooth;
  const acc = new Array(6).fill(0);
  for (let i = 1; i < t.length; i++) {
    if (s.pausedBefore?.[i]) continue;
    const dt = t[i] - t[i - 1]; if (dt <= 0 || dt > 30 || !(v[i] > 0.9)) continue;
    const p = 1000 / v[i];
    let k = B.findIndex(b => p <= b.slow && p >= b.fast); if (k < 0) k = p > B[0].fast ? 0 : 5;
    acc[k] += dt;
  }
  const total = acc.reduce((p, q) => p + q, 0); if (!total) return null;
  return acc.map((x, i) => ({ z: `Z${i + 1}`, name: B[i].name, t: x, pct: x / total * 100, rangeTxt: i === 0 ? `> ${fmtPace(B[0].fast)}` : i === 5 ? `< ${fmtPace(B[5].slow)}` : `${fmtPace(B[i].fast)}–${fmtPace(B[i].slow)}` }));
}

function splitTable(rows, { first = 'Km' } = {}) {
  const paces = rows.map(x => x.pace).filter(Boolean);
  const best = Math.min(...paces), worst = Math.max(...paces);
  return `<div class="splits"><div class="sp head"><span>${first}</span><span>Allure</span><span>VAP</span><span></span><span>FC</span><span>D+</span></div>
    ${rows.map(x => `<div class="sp"><span>${x.label}</span><b>${fmtPace(x.pace)}</b><span class="vap">${x.gap ? fmtPace(x.gap) : '–'}</span><span class="sp-bar"><i style="width:${Math.max(8, 100 - (x.pace - best) / Math.max(1, worst - best) * 70)}%"></i></span><span>${x.hr ? Math.round(x.hr) : '–'}</span><span>${x.up != null ? Math.round(x.up) + ' m' : '–'}</span></div>`).join('')}</div>`;
}

function renderLaps(box, laps, run) {
  if (!box) return;
  const L = (laps || []).filter(l => (l.distance || 0) > 0 || (l.moving_time || 0) > 0);
  if (L.length < 2) { box.innerHTML = `<div class="card-head"><h3>Tours (montre)</h3></div><p class="muted tiny">Pas de tours enregistrés pendant cette séance.</p>`; return; }
  const rows = L.map((l, i) => ({
    label: `${i + 1}`, dist: l.distance, time: l.moving_time || l.elapsed_time,
    pace: l.distance ? (l.moving_time || l.elapsed_time) / (l.distance / 1000) : null,
    gap: l.gap ? 1000 / l.gap : null, hr: l.average_heartrate, up: l.total_elevation_gain,
  }));
  box.innerHTML = `<div class="card-head"><h3>Tours (montre)</h3><span class="tiny muted">${L.length} tours</span></div>
    <div class="splits laps"><div class="sp head"><span>#</span><span>Km</span><span>Temps</span><span>Allure</span><span>VAP</span><span>FC</span><span>D+</span></div>
    ${rows.map(x => `<div class="sp"><span>${x.label}</span><span>${fmtKm(x.dist, 2)}</span><span>${fmtChrono(x.time)}</span><b>${run ? fmtPace(x.pace) : x.dist && x.time ? fmtNum(x.dist / x.time * 3.6, 1) : '–'}</b><span class="vap">${run && x.gap ? fmtPace(x.gap) : '–'}</span><span>${x.hr ? Math.round(x.hr) : '–'}</span><span>${x.up != null ? Math.round(x.up) + ' m' : '–'}</span></div>`).join('')}</div>`;
}

function renderSplits(box, s) {
  if (!box) return;
  const { distance: d, time: t, heartrate: hr } = s;
  const alt = s.altitude || s.fixed_altitude;
  if (!d || !t) { box.innerHTML = `<div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Pas de données GPS pour cette séance.</p>`; return; }
  const splits = []; let k = 1, i0 = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] >= k * 1000 || i === d.length - 1) {
      const dd = d[i] - d[i0]; if (dd < 200) break;
      const dt = t[i] - t[i0];
      const hrs = hr ? hr.slice(i0, i + 1).filter(Boolean) : [];
      const up = alt ? climb(alt, 1, i0, i) : null;
      const g = gapSpeed(s, i0, i);
      const last = i === d.length - 1;
      splits.push({ label: last && dd < 950 ? fmtNum(dd / 1000, 2) : String(k), pace: dt / (dd / 1000), gap: g ? 1000 / g : null, hr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null, up });
      i0 = i; k++;
    }
  }
  if (splits.length < 2) { box.innerHTML = `<div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Séance trop courte pour un découpage au km.</p>`; return; }
  box.innerHTML = `<div class="card-head"><h3>Temps au km</h3></div>${splitTable(splits)}`;
}

// Graphiques d'analyse type Strava : profil, FC, allure — curseur commun, moyennes, zones FC en fond
let xMode = 'dist';
function renderCharts(box, a, s) {
  const has = k => Array.isArray(s[k]) && s[k].some(v => v != null);
  const alt = has('fixed_altitude') ? s.fixed_altitude : has('altitude') ? s.altitude : null;
  const dist = has('distance') ? s.distance : null, time = has('time') ? s.time : null;
  const hr = has('heartrate') ? s.heartrate : null, vel = has('velocity_smooth') ? s.velocity_smooth : null;
  const run = isRun(a);
  const n = (dist || time || hr || []).length;
  if (!n || (!alt && !hr && !vel)) { box.innerHTML = '<p class="muted tiny">Pas de courbes enregistrées pour cette séance.</p>'; return; }
  const canDist = dist && dist[n - 1] > 500;
  if (!canDist) xMode = 'time';
  const X = i => xMode === 'dist' ? dist[i] / 1000 : (time ? time[i] : i) / 60;

  // échantillonnage fin (~1200 points) pour garder les variations
  const step = Math.max(1, Math.floor(n / 1200));
  const idx = []; for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  const xs = idx.map(X);

  // lissages légers (comme Strava : l'allure brute GPS est trop bruitée)
  const smooth = (arr, w) => { const out = new Array(arr.length); let sum = 0, cnt = 0; const q = [];
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; q.push(v); if (v != null) { sum += v; cnt++; } if (q.length > 2 * w + 1) { const o = q.shift(); if (o != null) { sum -= o; cnt--; } } out[i] = cnt ? sum / cnt : null; }
    return out.map((_, i) => out[Math.min(arr.length - 1, i + w)]); };
  const altS = alt ? smooth(idx.map(i => alt[i]), 2) : null;
  const hrS = hr ? smooth(idx.map(i => hr[i] || null), 1) : null;
  const velS = vel ? smooth(idx.map(i => vel[i]), 3) : null;
  const paceS = run && velS ? velS.map(v => v > 0.9 ? Math.min(1000 / v, 720) : null) : null;
  const spdS = !run && velS ? velS.map(v => v != null ? v * 3.6 : null) : null;
  // pente (%) sur ~40 m
  const grade = alt && dist ? idx.map((i, k) => { let j = k; while (j > 0 && dist[i] - dist[idx[j]] < 40) j--; const dd = dist[i] - dist[idx[j]]; return dd > 10 ? (alt[i] - alt[idx[j]]) / dd * 100 : 0; }) : null;
  // VAP instantanée
  const gapS = paceS && grade ? paceS.map((p, k) => p ? p / gradeFactor(grade[k] / 100) : null) : null;
  // coupures aux pauses de la montre : pas de trait entre avant et après la pause
  if (s.pausedBefore) {
    const cut = idx.map((i, k) => { if (k === 0) return false; for (let j = idx[k - 1] + 1; j <= i; j++) if (s.pausedBefore[j]) return true; return false; });
    [altS, hrS, paceS, spdS, gapS].forEach(arr => { if (arr) cut.forEach((c, k) => { if (c) arr[k] = null; }); });
  }

  const valid = arr => arr.filter(v => v != null && isFinite(v));
  const avgPace = run ? (a.average_speed ? 1000 / a.average_speed : null) : null;
  const hrVals = hr ? valid(hr) : [];
  const avgHr = a.average_heartrate || (hrVals.length ? hrVals.reduce((p, q) => p + q, 0) / hrVals.length : null);
  const maxHr = a.max_heartrate || (hrVals.length ? Math.max(...hrVals) : null);
  const altV = altS ? valid(altS) : [];
  const altMin = altV.length ? Math.min(...altV) : 0, altMax = altV.length ? Math.max(...altV) : 1;
  const hasElev = alt && (altMax - altMin) > 3;
  const pv = paceS ? valid(paceS).sort((p, q) => p - q) : [];
  const bestPace = pv.length ? pv[Math.floor(pv.length * 0.01)] : null;
  const xMax = xs[xs.length - 1];

  box.innerHTML = `
    <div class="an-head">
      <h3>Analyse</h3>
      ${canDist ? segmented('xm', [['dist', 'Distance'], ['time', 'Temps']], xMode) : ''}
    </div>
    <div class="readout" id="ro"><span class="ro-hint">Fais glisser ton doigt sur un graphique pour lire les valeurs.</span></div>
    ${hasElev ? `<div class="an-block"><div class="an-title"><b>Profil du parcours</b><span>D+ ${fmtNum(a.total_elevation_gain || 0)} m · ${fmtNum(altMin)}–${fmtNum(altMax)} m</span></div><div class="chart h150"><canvas id="s-alt"></canvas></div></div>` : ''}
    ${hr ? `<div class="an-block"><div class="an-title"><b>Fréquence cardiaque</b><span>Moy. ${Math.round(avgHr)} · Max ${Math.round(maxHr)} bpm</span></div><div class="chart h180"><canvas id="s-hr"></canvas></div></div>` : ''}
    ${(paceS || spdS) ? `<div class="an-block"><div class="an-title"><b>${run ? 'Allure' : 'Vitesse'}</b><span>${run ? `Moy. ${fmtPace(avgPace)} · Max ${fmtPace(bestPace)} /km` : `Moy. ${fmtNum((a.average_speed || 0) * 3.6, 1)} km/h`}</span></div><div class="chart h200"><canvas id="s-pace"></canvas></div></div>` : ''}
  `;
  bindSeg(box, 'xm', v => { xMode = v; renderCharts(box, a, s); });

  const pts = arr => arr.map((y, k) => ({ x: xs[k], y }));
  const fmtX = v => xMode === 'dist' ? `${fmtNum(v, 2)} km` : fmtChrono(v * 60);
  const xScale = { type: 'linear', min: 0, max: xMax, grid: { display: true, color: 'rgba(159,196,214,0.06)' }, ticks: { maxTicksLimit: 7, callback: v => xMode === 'dist' ? `${fmtNum(v, v < 10 && xMax < 12 ? 1 : 0)} km` : fmtDur(v * 60, { short: true }) } };
  const common = { parsing: false, normalized: true, animation: false, interaction: { mode: 'nearest', axis: 'x', intersect: false }, events: [], plugins: { tooltip: { enabled: false }, decimation: { enabled: false } }, layout: { padding: { right: 4 } } };
  // même largeur d'axe Y partout pour que le curseur tombe au même endroit sur les 3 graphiques
  const fixY = { afterFit: sc => { sc.width = 56; } };
  const charts = [];
  const zb = a.icu_hr_zones || state.athlete?.run?.hr_zones;
  let cur = null;
  const cross = {
    id: 'cross',
    afterDatasetsDraw(c) {
      if (cur == null) return;
      const xp = c.scales.x.getPixelForValue(xs[cur]); const { top, bottom } = c.chartArea; const g = c.ctx;
      g.save(); g.strokeStyle = 'rgba(238,243,246,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xp, top); g.lineTo(xp, bottom); g.stroke();
      const d0 = c.data.datasets[0].data[cur];
      if (d0 && d0.y != null) { const yp = c.scales[c.data.datasets[0].yAxisID || 'y'].getPixelForValue(d0.y); g.fillStyle = c.data.datasets[0].borderColor; g.beginPath(); g.arc(xp, yp, 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#0d1821'; g.lineWidth = 2; g.stroke(); }
      g.restore();
    },
  };

  if (hasElev) charts.push(chart(box.querySelector('#s-alt'), {
    type: 'line',
    data: { datasets: [{ data: pts(altS), borderColor: '#ffc2a8', borderWidth: 1.5, backgroundColor: gradient('#ff8f6b', 0.45, 0.04), fill: 'start', pointRadius: 0 }] },
    options: { ...common, scales: { x: xScale, y: { ...fixY, min: Math.floor((altMin - (altMax - altMin) * 0.15) / 10) * 10, max: Math.ceil((altMax + (altMax - altMin) * 0.1) / 10) * 10, ticks: { maxTicksLimit: 4, callback: v => v + ' m' } } } },
    plugins: [cross],
  }));
  if (hr) {
    const lo = Math.max(60, Math.floor((Math.min(...hrVals) - 5) / 10) * 10), hi = Math.ceil((Math.max(...hrVals) + 3) / 10) * 10;
    charts.push(chart(box.querySelector('#s-hr'), {
      type: 'line',
      data: { datasets: [
        { data: pts(hrS), borderColor: '#ff6178', borderWidth: 1.4, pointRadius: 0, spanGaps: false, backgroundColor: gradient('#ff6178', 0.22, 0), fill: 'start' },
        { data: [{ x: 0, y: avgHr }, { x: xMax, y: avgHr }], borderColor: 'rgba(238,243,246,0.55)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0 },
      ] },
      options: { ...common, scales: { x: xScale, y: { ...fixY, min: lo, max: hi, ticks: { maxTicksLimit: 5, callback: v => v + ' bpm' } } } },
      plugins: [zoneBands(zb), cross],
    }));
  }
  if (paceS || spdS) {
    let yOpt, data, avgLine;
    if (run) {
      const p2 = pv[Math.floor(pv.length * 0.02)] || 180, p98 = pv[Math.floor(pv.length * 0.98)] || 420;
      yOpt = { ...fixY, reverse: true, min: Math.max(120, Math.floor((p2 - 10) / 15) * 15), max: Math.ceil((p98 + 15) / 15) * 15, ticks: { maxTicksLimit: 5, callback: v => fmtPace(v) } };
      data = pts(paceS); avgLine = avgPace;
    } else {
      const sv = valid(spdS).sort((p, q) => p - q);
      yOpt = { ...fixY, min: 0, max: Math.ceil((sv[Math.floor(sv.length * 0.99)] || 40) / 5) * 5 + 5, ticks: { maxTicksLimit: 5, callback: v => v + ' km/h' } };
      data = pts(spdS); avgLine = (a.average_speed || 0) * 3.6;
    }
    const ds = [
      { data, borderColor: C.blue, borderWidth: 1.4, pointRadius: 0, spanGaps: false, yAxisID: 'y', order: 1 },
      { data: [{ x: 0, y: avgLine }, { x: xMax, y: avgLine }], borderColor: 'rgba(238,243,246,0.55)', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, yAxisID: 'y', order: 1 },
    ];
    const scales = { x: xScale, y: yOpt };
    if (hasElev) { ds.push({ data: pts(altS), yAxisID: 'yAlt', borderWidth: 0, pointRadius: 0, fill: 'start', backgroundColor: 'rgba(163,182,196,0.14)', order: 2 }); scales.yAlt = { display: false, min: altMin - (altMax - altMin) * 0.05, max: altMax + (altMax - altMin) * 1.3 }; }
    charts.push(chart(box.querySelector('#s-pace'), { type: 'line', data: { datasets: ds }, options: { ...common, scales }, plugins: [cross] }));
  }

  // --- Curseur commun aux graphiques ---
  const ro = box.querySelector('#ro');
  const near = v => { let lo2 = 0, hi2 = xs.length - 1; while (hi2 - lo2 > 1) { const m = (lo2 + hi2) >> 1; if (xs[m] < v) lo2 = m; else hi2 = m; } return Math.abs(xs[lo2] - v) < Math.abs(xs[hi2] - v) ? lo2 : hi2; };
  const show = k => {
    cur = k;
    const i = idx[k];
    const z = hrS && zb && hrS[k] ? (() => { const j = zb.findIndex(x => hrS[k] <= x); return `Z${j < 0 ? zb.length : j + 1}`; })() : '';
    ro.innerHTML = `
      <span><small>${xMode === 'dist' ? 'Distance' : 'Temps'}</small><b>${fmtX(xs[k])}</b></span>
      ${xMode === 'dist' && time ? `<span><small>Temps</small><b>${fmtChrono(time[i])}</b></span>` : ''}
      ${xMode === 'time' && dist ? `<span><small>Distance</small><b>${fmtNum(dist[i] / 1000, 2)} km</b></span>` : ''}
      ${altS ? `<span><small>Altitude</small><b>${Math.round(altS[k])} m</b></span>` : ''}
      ${grade ? `<span><small>Pente</small><b>${grade[k] > 0 ? '+' : ''}${fmtNum(grade[k], 0)} %</b></span>` : ''}
      ${paceS ? `<span><small>Allure</small><b class="c-pace">${fmtPace(paceS[k])}</b></span>` : ''}
      ${gapS ? `<span><small>VAP</small><b class="c-gap">${fmtPace(gapS[k])}</b></span>` : ''}
      ${spdS ? `<span><small>Vitesse</small><b class="c-pace">${fmtNum(spdS[k], 1)} km/h</b></span>` : ''}
      ${hrS ? `<span><small>FC</small><b class="c-hr">${hrS[k] ? Math.round(hrS[k]) : '–'}<em>${z}</em></b></span>` : ''}`;
    charts.forEach(c => c && c.draw());
  };
  const onMove = (c, ev) => {
    const r = c.canvas.getBoundingClientRect();
    const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
    const v = c.scales.x.getValueForPixel(Math.max(c.chartArea.left, Math.min(c.chartArea.right, px)));
    show(near(v));
  };
  charts.forEach(c => {
    if (!c) return;
    const cv = c.canvas; cv.style.touchAction = 'pan-y';
    cv.addEventListener('pointerdown', e => onMove(c, e));
    cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons || e.pressure) onMove(c, e); });
    cv.addEventListener('touchmove', e => onMove(c, e), { passive: true });
  });
  show(Math.floor(xs.length / 3));
}

// Bandes de zones FC en fond du graphique
function zoneBands(bounds) {
  return {
    id: 'zones',
    beforeDatasetsDraw(c) {
      if (!bounds?.length) return;
      const y = c.scales.y, { left, right } = c.chartArea, g = c.ctx;
      g.save();
      bounds.forEach((hi, i) => {
        const lo = i === 0 ? 0 : bounds[i - 1];
        const y1 = y.getPixelForValue(Math.min(hi, y.max)), y2 = y.getPixelForValue(Math.max(lo, y.min));
        if (y2 <= y1) return;
        g.fillStyle = ZONE_COLORS[i] + '14'; g.fillRect(left, y1, right - left, y2 - y1);
        if (hi < y.max) { g.strokeStyle = ZONE_COLORS[i] + '40'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(left, y1); g.lineTo(right, y1); g.stroke(); }
        if (y2 - y1 > 12) { g.fillStyle = ZONE_COLORS[i] + 'aa'; g.font = '600 10px Hanken Grotesk, sans-serif'; g.textAlign = 'right'; g.fillText(`Z${i + 1}`, right - 4, y1 + 11); }
      });
      g.restore();
    },
  };
}

function zoneOf(bpm, a) {
  const b = a.icu_hr_zones || state.athlete?.run?.hr_zones; if (!b) return '';
  const i = b.findIndex(x => bpm <= x);
  return ` · Z${i < 0 ? b.length : i + 1}`;
}
