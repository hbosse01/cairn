import { state, getStreams, getLaps, getSuunto } from '../data.js';
import { chart, C, gradient, ZONE_COLORS } from '../charts.js';
import { hrZones, isRun, gapSpeed, gradeFactor } from '../metrics.js';
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
    <div class="page-head"><h2>Séances</h2>${segmented('f', FILTERS, filter)}</div>
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
  el.querySelector('#more')?.addEventListener('click', () => { shown += 60; renderActivities(el); });
  const s = el.querySelector('.search');
  s.addEventListener('change', () => { query = s.value.trim().toLowerCase(); shown = 40; renderActivities(el); });
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
  const a = state.activities.find(x => String(x.id) === String(id));
  if (!a) { el.innerHTML = empty('Séance introuvable (elle n\'est peut-être pas encore synchronisée).'); return; }
  const cat = sportCat(a.type);
  const z = hrZones(a, state.athlete);
  const run = isRun(a);
  const pace = run ? paceFromSpeed(a.average_speed) : null;
  const paceZ = run && a.pace_zone_times?.length && a.pace_zones?.length ? paceZones(a) : null;

  el.innerHTML = `
    <a class="back" href="#seances">← Séances</a>
    <section class="card">
      <div class="act-head big"><span class="sport-ico s-${cat}">${ICONS[cat]}</span><div><h2>${esc(a.name)}</h2><span class="muted tiny">${typeLabel(a.type)} · ${fmtDate(a.start_date_local, { weekday: true, year: true })} à ${fmtTime(a.start_date_local)}${a.device_name ? ' · ' + esc(a.device_name) : ''}</span></div></div>
      <div class="stat-grid">
        ${a.distance ? st('Distance', `${fmtKm(a.distance, 2)} km`) : ''}
        ${st('Durée', fmtDur(a.moving_time))}
        ${a.elapsed_time && a.elapsed_time - a.moving_time > 60 ? st('Temps total', fmtDur(a.elapsed_time)) : ''}
        ${pace ? st('Allure moy.', `${fmtPace(pace)}/km`) : ''}
        ${run ? st('VAP moy.', `<span id="vap-val">${a.gap ? fmtPace(paceFromSpeed(a.gap)) + '/km' : '…'}</span>`) : ''}
        ${!run && a.average_speed && a.distance ? st('Vitesse moy.', `${fmtNum(a.average_speed * 3.6, 1)} km/h`) : ''}
        ${a.average_heartrate ? st('FC moy.', `${Math.round(a.average_heartrate)} bpm`) : ''}
        ${a.max_heartrate ? st('FC max', `${Math.round(a.max_heartrate)} bpm`) : ''}
        ${a.distance ? st('D+', `${fmtNum(a.total_elevation_gain || 0)} m`) : ''}
        ${a.distance ? st('D−', `<i id="dminus">${a.total_elevation_loss != null ? fmtNum(a.total_elevation_loss) + ' m' : '…'}</i>`) : ''}
        ${a.average_cadence ? st('Cadence', `${Math.round(run && a.average_cadence < 120 ? a.average_cadence * 2 : a.average_cadence)} pas/min`) : ''}
        ${a.source === 'SUUNTO' || state.demo ? `<div class="st" id="vo2" hidden><span>VO2max (Suunto)</span><b></b></div>` : ''}
        ${a.calories ? st('Calories', `${fmtNum(a.calories)} kcal`) : ''}
      </div>
      ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    </section>

    ${z ? `<section class="card">${zoneTable(z, { title: 'Temps dans les zones de FC' })}</section>`
      : `<section class="card"><p class="muted">Pas de données de fréquence cardiaque pour cette séance.</p></section>`}

    ${paceZ ? `<section class="card">${zoneTable(paceZ, { title: 'Temps dans les zones d\'allure' })}</section>` : ''}

    <section class="card" id="charts"><p class="muted tiny">Chargement des graphiques…</p></section>
    ${a.distance ? `<section class="card" id="laps"><div class="card-head"><h3>Tours (montre)</h3></div><p class="muted tiny">Chargement…</p></section>` : ''}
    ${run ? `<section class="card" id="splits"><div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Chargement…</p></section>` : ''}
  `;

  getSuunto(a).then(x => { const b = el.querySelector('#vo2'); if (b && x?.vo2max) { b.hidden = false; b.querySelector('b').innerHTML = `${fmtNum(x.vo2max, 1)} <small>ml/kg/min</small>`; } }).catch(() => {});
  if (a.distance) {
    getLaps(a.id).then(laps => renderLaps(el.querySelector('#laps'), laps, run)).catch(e => { const b = el.querySelector('#laps'); if (b) b.innerHTML = `<div class="card-head"><h3>Tours (montre)</h3></div><p class="muted tiny">Indisponible : ${esc(e.message)}</p>`; });
  }
  try {
    const s = await getStreams(a.id);
    if (!el.isConnected || !el.querySelector('#charts')) return;
    const alt = s.fixed_altitude || s.altitude;
    if (a.total_elevation_loss == null) { const e = el.querySelector('#dminus'); if (e) { let dn = 0; if (alt) for (let j = 1; j < alt.length; j++) { const x = alt[j] - alt[j - 1]; if (x < 0) dn -= x; } e.textContent = alt ? fmtNum(dn) + ' m' : '–'; } }
    if (run && !a.gap && s.distance && s.time) { const v = gapSpeed(s, 0, s.distance.length - 1); const e = el.querySelector('#vap-val'); if (e && v) e.textContent = fmtPace(paceFromSpeed(v)) + '/km'; }
    renderCharts(el.querySelector('#charts'), a, s);
    if (run) renderSplits(el.querySelector('#splits'), s);
  } catch (e) {
    const c = el.querySelector('#charts'); if (c) c.innerHTML = `<p class="muted tiny">Graphiques indisponibles : ${esc(e.message)}</p>`;
    const b = el.querySelector('#splits'); if (b) b.innerHTML = `<div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Indisponible : ${esc(e.message)}</p>`;
    const v = el.querySelector('#vap-val'); if (v && v.textContent === '…') v.textContent = '–';
    const d = el.querySelector('#dminus'); if (d && d.textContent === '…') d.textContent = '–';
  }
}

function st(k, v) { return `<div class="st"><span>${k}</span><b>${v}</b></div>`; }

function paceZones(a) {
  const names = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5a', 'Z5b', 'Z5c'];
  const tp = a.threshold_pace; // m/s
  const total = a.pace_zone_times.reduce((s, x) => s + x, 0) || 1;
  return a.pace_zone_times.map((t, i) => {
    const loPct = i === 0 ? 0 : a.pace_zones[i - 1], hiPct = a.pace_zones[i];
    const range = tp ? `${hiPct && hiPct < 900 ? fmtPace(1000 / (tp * hiPct / 100)) : '+'}–${loPct ? fmtPace(1000 / (tp * loPct / 100)) : ''}` : '';
    return { z: names[i] || `Z${i + 1}`, name: '', t, pct: t / total * 100, lo: null, hi: null, rangeTxt: range };
  });
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
  const alt = s.fixed_altitude || s.altitude;
  if (!d || !t) { box.innerHTML = `<div class="card-head"><h3>Temps au km</h3></div><p class="muted tiny">Pas de données GPS pour cette séance.</p>`; return; }
  const splits = []; let k = 1, i0 = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] >= k * 1000 || i === d.length - 1) {
      const dd = d[i] - d[i0]; if (dd < 200) break;
      const dt = t[i] - t[i0];
      const hrs = hr ? hr.slice(i0, i + 1).filter(Boolean) : [];
      let up = null; if (alt) { up = 0; for (let j = i0 + 1; j <= i; j++) { const x = alt[j] - alt[j - 1]; if (x > 0) up += x; } }
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
        { data: pts(hrS), borderColor: '#ff6178', borderWidth: 1.4, pointRadius: 0, spanGaps: true, backgroundColor: gradient('#ff6178', 0.22, 0), fill: 'start' },
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
      { data, borderColor: C.blue, borderWidth: 1.4, pointRadius: 0, spanGaps: true, yAxisID: 'y', order: 1 },
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
