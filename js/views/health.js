import { state } from '../data.js';
import { chart, C, gradient } from '../charts.js';
import { recovery } from '../metrics.js';
import { fmtDate, fmtHours, fmtNum, rolling, mean, sd, parseLocal, addDays, isoDate, today } from '../util.js';
import { segmented, bindSeg, legend, empty } from './parts.js';

let period = 30;

export function renderHealth(el) {
  const all = state.wellness || [];
  if (!all.length) { el.innerHTML = empty('Aucune donnée santé pour le moment. Vérifie que « Télécharger les données de santé » est activé dans Intervals.icu → Suunto.'); return; }
  const end = parseLocal(all[all.length - 1].id) > today() ? today() : parseLocal(all[all.length - 1].id);
  // série continue de jours (les jours sans donnée restent vides)
  const map = new Map(all.map(w => [w.id, w]));
  const span = period + 60; // 60 jours en plus pour la référence glissante
  const days = []; for (let i = span - 1; i >= 0; i--) { const d = addDays(end, -i); days.push({ d, w: map.get(isoDate(d)) || {} }); }
  const hrvAll = days.map(x => x.w.hrv ?? null);
  const base = days.map((_, i) => { const win = hrvAll.slice(Math.max(0, i - 60), i).filter(v => v != null); return win.length > 10 ? { m: mean(win), s: sd(win) } : null; });
  const view = days.slice(-period);
  const off = days.length - period;
  const labels = view.map(x => fmtDate(x.d));
  const hrv = view.map(x => x.w.hrv ?? null);
  const hrv7 = rolling(hrvAll, 7).slice(off);
  const bandHi = base.slice(off).map(b => b ? b.m + b.s : null);
  const bandLo = base.slice(off).map(b => b ? b.m - b.s : null);
  const sleepH = view.map(x => x.w.sleepSecs ? +(x.w.sleepSecs / 3600).toFixed(2) : null);
  const sleepScore = view.map(x => x.w.sleepScore ?? null);
  const rhr = view.map(x => x.w.restingHR ?? null);
  const rhr7 = rolling(days.map(x => x.w.restingHR ?? null), 7).slice(off);
  const steps = view.map(x => x.w.steps ?? null);
  const prev = days.slice(-2 * period, -period);
  const cmp = (cur, prv, f, unit, dec = 0, invert = false) => {
    const a = mean(cur), b = mean(prv);
    if (a == null) return '<span class="ws-v">–</span>';
    const d = b != null ? a - b : null;
    const good = d == null ? null : invert ? d <= 0 : d >= 0;
    return `<span class="ws-v">${f(a)}</span>${d != null && fmtNum(Math.abs(d), dec) !== '0' ? `<span class="ws-d ${good ? 'up' : 'down'}">${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d), dec)}${unit}</span>` : ''}`;
  };
  const rec = recovery(all);

  el.innerHTML = `
    <div class="page-head"><h2>Santé & récupération</h2>${segmented('p', [[14, '14 j'], [30, '30 j'], [90, '3 mois'], [365, '1 an']], period)}</div>
    ${rec ? `<section class="card status-${rec.level} slim"><b>${rec.label}</b><span class="muted"> — ${rec.advice}</span></section>` : ''}
    <section class="card">
      <div class="week-stats">
        <div class="ws"><span class="ws-k">VFC moy.</span>${cmp(hrv, prev.map(x => x.w.hrv), v => `${Math.round(v)} ms`, ' ms')}</div>
        <div class="ws"><span class="ws-k">Sommeil moy.</span>${cmp(sleepH, prev.map(x => x.w.sleepSecs ? x.w.sleepSecs / 3600 : null), v => fmtHours(v * 3600), ' h', 1)}</div>
        <div class="ws"><span class="ws-k">FC repos moy.</span>${cmp(rhr, prev.map(x => x.w.restingHR), v => `${Math.round(v)} bpm`, '', 0, true)}</div>
        <div class="ws"><span class="ws-k">Pas / jour</span>${cmp(steps, prev.map(x => x.w.steps), v => fmtNum(v), '')}</div>
      </div>
      <p class="tiny muted">Variation par rapport aux ${period} jours précédents.</p>
    </section>

    <section class="card">
      <div class="card-head"><h3>Variabilité cardiaque (VFC)</h3></div>
      <p class="tiny muted">Une VFC dans ou au-dessus de ta zone habituelle = bonne récupération. Une baisse durable sous la zone signale de la fatigue.</p>
      ${legend([[C.blue, 'Nuit'], ['#ffc2a8', 'Moyenne 7 j'], ['rgba(111,207,224,.35)', 'Zone habituelle (60 j)']])}
      <div class="chart h220"><canvas id="c-hrv"></canvas></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Sommeil</h3></div>
      ${legend([[C.violet, 'Durée'], [C.text3, 'Moyenne', true]])}
      <div class="chart h200"><canvas id="c-sleep"></canvas></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>FC de repos</h3></div>
      <p class="tiny muted">Une FC de repos qui monte de plusieurs battements au-dessus de ta moyenne est souvent un signe de fatigue ou de maladie.</p>
      ${legend([[C.orange, 'Nuit'], ['#ffc2a8', 'Moyenne 7 j']])}
      <div class="chart h180"><canvas id="c-rhr"></canvas></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Pas</h3></div>
      ${legend([[C.aqua, 'Pas par jour'], [C.text3, 'Moyenne', true]])}
      <div class="chart h180"><canvas id="c-steps"></canvas></div>
    </section>
  `;
  bindSeg(el, 'p', v => { period = +v; renderHealth(el); });

  const xTicks = { maxTicksLimit: period > 60 ? 6 : 7 };
  chart(el.querySelector('#c-hrv'), {
    type: 'line',
    data: {
      labels, datasets: [
        { label: 'Zone haute', data: bandHi, borderWidth: 0, pointRadius: 0, backgroundColor: 'rgba(111,207,224,.10)', fill: '+1', spanGaps: true },
        { label: 'Zone basse', data: bandLo, borderWidth: 0, pointRadius: 0, fill: false, spanGaps: true },
        { label: 'VFC', data: hrv, borderColor: C.blue, backgroundColor: C.blue, borderWidth: period > 90 ? 1 : 1.5, pointRadius: period <= 30 ? 2.5 : 0, pointBorderWidth: 0, spanGaps: true },
        { label: 'Moy. 7 j', data: hrv7, borderColor: '#ffc2a8', borderWidth: 2.5, pointRadius: 0, tension: 0.35, spanGaps: true },
      ]
    },
    options: { scales: { x: { ticks: xTicks }, y: { ticks: { callback: v => v + ' ms' } } }, plugins: { tooltip: { filter: i => i.datasetIndex >= 2, callbacks: { label: c => `${c.dataset.label} : ${c.parsed.y != null ? Math.round(c.parsed.y) + ' ms' : '–'}`, afterBody: items => { const i = items[0].dataIndex; return bandLo[i] != null ? `Zone habituelle : ${Math.round(bandLo[i])}–${Math.round(bandHi[i])} ms` : ''; } } } } },
  });
  const sleepAvg = mean(sleepH);
  chart(el.querySelector('#c-sleep'), {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', label: 'Moyenne', data: labels.map(() => sleepAvg), borderColor: C.text3, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: 'Sommeil', data: sleepH, backgroundColor: gradient('#c0a8ff', 0.95, 0.35), maxBarThickness: 18 },
    ] },
    options: { scales: { x: { ticks: xTicks }, y: { min: 0, ticks: { callback: v => v + ' h' } } }, plugins: { tooltip: { callbacks: { label: c => c.dataset.label === 'Moyenne' ? `Moyenne : ${fmtHours(c.parsed.y * 3600)}` : `Sommeil : ${fmtHours(c.parsed.y * 3600)}${sleepScore[c.dataIndex] ? ` · score ${sleepScore[c.dataIndex]}` : ''}` } } } },
  });
  chart(el.querySelector('#c-rhr'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'FC repos', data: rhr, borderColor: C.orange, backgroundColor: gradient('#ff8f6b', 0.22, 0), fill: 'start', borderWidth: 1.5, pointRadius: period <= 30 ? 2.5 : 0, pointBackgroundColor: C.orange, spanGaps: true },
      { label: 'Moy. 7 j', data: rhr7, borderColor: '#ffc2a8', borderWidth: 2.5, tension: 0.35, pointRadius: 0, spanGaps: true },
    ] },
    options: { scales: { x: { ticks: xTicks }, y: { ticks: { callback: v => v + ' bpm' } } }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label} : ${c.parsed.y != null ? Math.round(c.parsed.y) + ' bpm' : '–'}` } } } },
  });
  const stepsAvg = mean(steps);
  chart(el.querySelector('#c-steps'), {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', label: 'Moyenne', data: labels.map(() => stepsAvg), borderColor: C.text3, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: 'Pas', data: steps, backgroundColor: gradient('#8fd6a0', 0.95, 0.35), maxBarThickness: 18 },
    ] },
    options: { scales: { x: { ticks: xTicks }, y: { min: 0, ticks: { callback: v => v >= 1000 ? (v / 1000) + 'k' : v } } }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label} : ${fmtNum(c.parsed.y)}` } } } },
  });
}
