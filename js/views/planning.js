import { state } from '../data.js';
import { classify, KIND_LABEL } from '../plan.js';
import { isRun } from '../metrics.js';
import { esc, fmtDate, fmtKm, fmtDur, fmtNum, isoDate, addDays, startOfWeek, today, weekNumber, parseLocal, sportCat, ICONS, JOURS, MOIS } from '../util.js';

let offset = 0; // semaines par rapport à la semaine en cours

export function renderPlanning(el) {
  const t = today();
  const w0 = addDays(startOfWeek(t), offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w0, i));
  const planBy = new Map((state.plan || []).map(p => [p.date, p]));
  const actsBy = new Map();
  for (const a of state.activities) { const k = a.start_date_local.slice(0, 10); if (!actsBy.has(k)) actsBy.set(k, []); actsBy.get(k).push(a); }
  const racesBy = new Map(state.races.filter(r => r.date && !r.cancelled && !r.approx).map(r => [r.date, r]));
  const keys = days.map(isoDate);
  const plannedKm = keys.reduce((s, k) => s + (planBy.get(k)?.km || 0), 0);
  const doneKm = keys.reduce((s, k) => s + (actsBy.get(k) || []).filter(isRun).reduce((x, a) => x + (a.distance || 0), 0), 0) / 1000;
  const doneSec = keys.reduce((s, k) => s + (actsBy.get(k) || []).reduce((x, a) => x + (a.moving_time || 0), 0), 0);
  const hasPlan = keys.some(k => planBy.has(k));
  const end = addDays(w0, 6);
  const pct = plannedKm ? Math.min(100, doneKm / plannedKm * 100) : 0;

  el.innerHTML = `
    <div class="page-head"><h2>Planning</h2>${offset !== 0 ? '<button class="btn ghost small" id="now">Cette semaine</button>' : ''}</div>
    <div class="weeknav card slim">
      <button class="icon-btn" id="prev" aria-label="Semaine précédente">‹</button>
      <div class="wn-mid"><b>Semaine ${weekNumber(w0)}</b><span class="muted tiny">${w0.getDate()} ${MOIS[w0.getMonth()]} – ${end.getDate()} ${MOIS[end.getMonth()]} ${end.getFullYear()}</span></div>
      <button class="icon-btn" id="next" aria-label="Semaine suivante">›</button>
    </div>
    <section class="card">
      <div class="week-stats">
        <div class="ws"><span class="ws-k">Course prévue</span><span class="ws-v">${plannedKm ? fmtNum(plannedKm) + ' km' : '–'}</span></div>
        <div class="ws"><span class="ws-k">Course réalisée</span><span class="ws-v">${fmtNum(doneKm, 1)} km</span></div>
        <div class="ws"><span class="ws-k">Temps (tous sports)</span><span class="ws-v">${fmtDur(doneSec)}</span></div>
      </div>
      ${plannedKm ? `<div class="gbar"><span class="lvl-bg-${pct >= 90 ? 'good' : 'ok'}" style="width:${pct}%"></span></div><p class="tiny muted">${fmtNum(pct)} % du kilométrage prévu</p>` : ''}
      ${!hasPlan ? `<p class="tiny muted">Pas de plan saisi pour cette semaine dans ton Google Sheet.</p>` : ''}
    </section>
    <div class="days">${days.map(d => dayCard(d, t, planBy.get(isoDate(d)), actsBy.get(isoDate(d)) || [], racesBy.get(isoDate(d)))).join('')}</div>
  `;
  el.querySelector('#prev').addEventListener('click', () => { offset--; renderPlanning(el); });
  el.querySelector('#next').addEventListener('click', () => { offset++; renderPlanning(el); });
  el.querySelector('#now')?.addEventListener('click', () => { offset = 0; renderPlanning(el); });
}

function dayCard(d, t, plan, acts, race) {
  const k = isoDate(d);
  const isToday = k === isoDate(t), past = d < t;
  const slots = plan ? [['Matin', plan.am], ['Après-midi', plan.pm]].filter(([, x]) => x) : [];
  if (plan?.note) slots.push(['', plan.note]);
  const doneRunKm = acts.filter(isRun).reduce((s, a) => s + (a.distance || 0), 0) / 1000;
  const missed = past && !isToday && slots.length && !acts.length;
  return `<div class="day ${isToday ? 'today' : ''} ${past && !isToday ? 'past' : ''}">
    <div class="day-h"><b>${JOURS[d.getDay()]} ${d.getDate()}</b>${isToday ? '<span class="tag prio-B">Aujourd\'hui</span>' : ''}</div>
    ${race ? `<div class="plan-item k-race-b"><span class="kind k-race">Course</span><span>${esc(race.titre)} · ${esc(race.format)}</span></div>` : ''}
    ${slots.map(([slot, txt]) => { const kind = classify(txt) || 'easy'; return `<div class="plan-item"><span class="kind k-${kind}">${slot || KIND_LABEL[kind]}</span><span>${esc(txt)}</span></div>`; }).join('')}
    ${acts.map(a => { const c = sportCat(a.type); return `<a class="done" href="#seance-${encodeURIComponent(a.id)}"><span class="check" aria-label="réalisé">✓</span><span class="sport-ico mini s-${c}">${ICONS[c]}</span><span class="dn">${esc(a.name)}</span><span class="dv">${a.distance ? fmtKm(a.distance, 1) + ' km · ' : ''}${fmtDur(a.moving_time, { short: true })}</span></a>`; }).join('')}
    ${missed ? '<p class="tiny muted">Non réalisé</p>' : ''}
    ${!slots.length && !acts.length && !race ? '<p class="tiny muted">Repos</p>' : ''}
  </div>`;
}
