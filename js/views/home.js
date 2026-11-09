import { state } from '../data.js';
import { recovery, weekly, isRun } from '../metrics.js';
import { esc, fmtDate, fmtKm, fmtHours, fmtNum, fmtPace, fmtDur, paceFromSpeed, today, parseLocal, daysBetween, sportCat, typeLabel, ICONS, fmtTime } from '../util.js';
import { hrZones } from '../metrics.js';
import { zoneBar } from './parts.js';

const LEVEL_ICON = {
  good: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>',
};

export function renderHome(el) {
  const rec = recovery(state.wellness);
  const wk = weekly(state.activities, 2);
  const [prev, cur] = wk;
  const last = state.activities[0];
  const t = today();
  const nextRace = state.races.filter(r => !r.cancelled && r.date && parseLocal(r.date) >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  const nextA = state.races.filter(r => !r.cancelled && r.priority === 'A' && r.date && parseLocal(r.date) >= t).sort((a, b) => a.date.localeCompare(b.date))[0];

  el.innerHTML = `
    <section class="hero card status-${rec?.level || 'ok'}">
      <div class="hero-top">
        <div>
          <p class="eyebrow">État du jour, ${fmtDate(t, { weekday: true })}</p>
          <h2 class="hero-title"><span class="status-ico">${LEVEL_ICON[rec?.level || 'ok']}</span>${esc(rec?.label || 'Pas encore de données santé')}</h2>
          <p class="muted">${esc(rec?.advice || 'Synchronise ta montre pour voir ta récupération.')}</p>
        </div>
      </div>
      ${ridge(state.wellness)}
      ${rec ? `<ul class="signals">${rec.signals.map(s => `<li class="sig sig-${s.s}"><span class="sig-k">${s.k}</span><b>${s.v}</b><span class="sig-ref">${s.ref}</span></li>`).join('')}</ul>` : ''}
      ${rec && rec.date !== isoToday() ? `<p class="tiny muted">Dernières données santé : ${fmtDate(rec.date, { weekday: true })}</p>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h3>Cette semaine</h3><a class="link" href="#charge">Charge →</a></div>
      <div class="week-stats">
        ${weekStat('Course', `${fmtNum(cur.runKm, 1)} km`, delta(cur.runKm, prev.runKm, ' km'))}
        ${weekStat('Temps (tous sports)', fmtHours(cur.totalSec), delta(cur.totalSec / 3600, prev.totalSec / 3600, ' h'))}
        ${weekStat('D+ course', `${fmtNum(cur.dplus)} m`, delta(cur.dplus, prev.dplus, ' m', 0))}
        ${weekStat('Séances', cur.count, delta(cur.count, prev.count, '', 0))}
      </div>
    </section>

    ${last ? `<section class="card">
      <div class="card-head"><h3>Dernière séance</h3><a class="link" href="#seances">Toutes →</a></div>
      ${lastCard(last)}
    </section>` : ''}

    ${nextRace ? `<section class="card race-next">
      <div class="card-head"><h3>Prochaine course</h3><a class="link" href="#courses">Calendrier →</a></div>
      ${raceLine(nextRace, t)}
      ${nextA && nextA.id !== nextRace.id ? `<div class="divider"></div><p class="eyebrow">Prochain objectif principal</p>${raceLine(nextA, t)}` : ''}
    </section>` : ''}
  `;
}

function isoToday() { const d = today(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function tile(k, v, sub, href) { return `<a class="tile" href="#${href}"><span class="tile-k">${k}</span><span class="tile-v">${v}</span><span class="tile-sub">${sub}</span></a>`; }
function weekStat(k, v, d) { return `<div class="ws"><span class="ws-k">${k}</span><span class="ws-v">${v}</span>${d ? `<span class="ws-d">${d}</span>` : ''}</div>`; }
function delta(a, b, unit, dec = 1) {
  if (!b) return '';
  const d = a - b;
  if (fmtNum(Math.abs(d), dec) === '0') return ''; const s = d >= 0 ? '+' : '−';
  return `<span class="${d >= 0 ? 'up' : 'down'}">${s}${fmtNum(Math.abs(d), dec)}${unit}</span>`;
}

export function lastCard(a) {
  const cat = sportCat(a.type);
  const z = hrZones(a, state.athlete);
  const pace = isRun(a) ? fmtPace(paceFromSpeed(a.average_speed)) + '/km' : null;
  return `<a class="act-card" href="#seance-${encodeURIComponent(a.id)}">
    <div class="act-head"><span class="sport-ico s-${cat}">${ICONS[cat]}</span><div><b>${esc(a.name)}</b><span class="muted tiny">${typeLabel(a.type)} · ${fmtDate(a.start_date_local, { weekday: true })} · ${fmtTime(a.start_date_local)}</span></div></div>
    <div class="act-stats">
      ${a.distance ? `<div><span>Distance</span><b>${fmtKm(a.distance, 2)} km</b></div>` : ''}
      <div><span>Durée</span><b>${fmtDur(a.moving_time)}</b></div>
      ${pace ? `<div><span>Allure</span><b>${pace}</b></div>` : ''}
      ${isRun(a) && a.gap ? `<div><span>VAP</span><b>${fmtPace(paceFromSpeed(a.gap))}/km</b></div>` : ''}
      ${a.average_heartrate ? `<div><span>FC moy.</span><b>${Math.round(a.average_heartrate)} bpm</b></div>` : ''}
      ${a.total_elevation_gain ? `<div><span>D+</span><b>${fmtNum(a.total_elevation_gain)} m</b></div>` : ''}
    </div>
    ${z ? zoneBar(z) : ''}
  </a>`;
}

export function raceLine(r, t = today()) {
  const days = daysBetween(t, parseLocal(r.date));
  return `<div class="race-line">
    <div class="countdown"><b>${r.approx ? '≈ ' : ''}${days}</b><span>jour${days > 1 ? 's' : ''}</span></div>
    <div class="race-info"><b>${esc(r.titre)}</b><span class="muted tiny">${r.approx ? esc(r.dateTxt.replace(/^A définir/i, 'Date à définir')) : fmtDate(r.date, { weekday: true, year: true })} · ${esc(r.lieu)}</span>
    <span class="tags"><span class="tag prio-${r.priority}">${r.priority === 'A' ? 'Objectif principal' : r.priority === 'B' ? 'Secondaire' : esc(r.objectif || 'Préparation')}</span><span class="tag">${esc(r.format)}</span></span></div>
  </div>`;
}

// Ligne de crête : la VFC des 14 dernières nuits dessinée comme un relief
function ridge(wellness) {
  const pts = (wellness || []).filter(w => w.hrv).slice(-14);
  if (pts.length < 4) return '';
  const W = 400, H = 96, pad = 6;
  const v = pts.map(w => w.hrv);
  const lo = Math.min(...v) - 6, hi = Math.max(...v) + 4;
  const x = i => pad + i * (W - 2 * pad) / (pts.length - 1);
  const y = val => H - 4 - (val - lo) / (hi - lo) * (H - 22);
  // courbe lissée (Catmull-Rom → Bézier)
  let d = `M${x(0)},${y(v[0])}`;
  for (let i = 0; i < v.length - 1; i++) {
    const p0 = [x(Math.max(0, i - 1)), y(v[Math.max(0, i - 1)])], p1 = [x(i), y(v[i])], p2 = [x(i + 1), y(v[i + 1])], p3 = [x(Math.min(v.length - 1, i + 2)), y(v[Math.min(v.length - 1, i + 2)])];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const lx = x(v.length - 1), ly = y(v[v.length - 1]);
  return `<div class="ridge" role="img" aria-label="VFC des ${pts.length} dernières nuits, de ${Math.round(Math.min(...v))} à ${Math.round(Math.max(...v))} ms">
    <span class="ridge-cap">VFC, ${pts.length} dernières nuits</span>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="rg-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8f6b" stop-opacity=".55"/><stop offset=".55" stop-color="#6fcfe0" stop-opacity=".18"/><stop offset="1" stop-color="#6fcfe0" stop-opacity="0"/></linearGradient>
        <linearGradient id="rg-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6fcfe0"/><stop offset="1" stop-color="#ffc2a8"/></linearGradient>
      </defs>
      <path d="${d} L${lx},${H} L${x(0)},${H} Z" fill="url(#rg-fill)"/>
      <path d="${d}" fill="none" stroke="url(#rg-line)" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>
    <span class="ridge-dot" style="left:calc(${(lx / W * 100).toFixed(2)}% - 5px);top:${ly - 5}px"></span>
  </div>`;
}
