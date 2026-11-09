import { state } from '../data.js';
import { chart, C, SPORT_COLORS } from '../charts.js';
import { weekly, monthly, zonesSum, isRun, ZONE_NAMES } from '../metrics.js';
import { fmtDate, fmtHours, fmtNum, mean, parseLocal, addDays, isoDate, today, MOIS, SPORT_LABEL, weekNumber, startOfWeek } from '../util.js';
import { segmented, bindSeg, legend, zoneTable } from './parts.js';

let nWeeks = 16;

export function renderVolume(el) {
  const weeks = weekly(state.activities, nWeeks);
  const labels = weeks.map(w => fmtDate(w.start));
  const km = weeks.map(w => +w.runKm.toFixed(1));
  const kmAvg = mean(km.slice(0, -1));
  const dplus = weeks.map(w => Math.round(w.dplus));
  const sports = ['run', 'ride', 'hike', 'strength', 'swim', 'other'].filter(s => weeks.some(w => w.bySport[s] > 0));
  const t = today();
  const from = addDays(startOfWeek(t), -7 * (nWeeks - 1));
  const actsPeriod = state.activities.filter(a => parseLocal(a.start_date_local) >= from);
  const zs = zonesSum(actsPeriod.filter(isRun));
  const zTotal = zs.reduce((s, x) => s + (x || 0), 0);
  const bounds = state.athlete?.run?.hr_zones;
  const names = state.athlete?.run?.hr_zone_names || ZONE_NAMES;
  const zRows = zTotal ? zs.map((tt, i) => ({ z: `Z${i + 1}`, name: names[i] || '', t: tt || 0, pct: (tt || 0) / zTotal * 100, lo: bounds ? (i === 0 ? 0 : bounds[i - 1] + 1) : null, hi: bounds?.[i] })) : null;
  const easy = zRows ? zRows.slice(0, 2).reduce((s, x) => s + x.pct, 0) : null;

  const months = monthly(state.activities, 12);
  const y = t.getFullYear();
  const ytd = (yr) => state.activities.filter(a => a.start_date_local.startsWith(String(yr)) && a.start_date_local.slice(5, 10) <= isoDate(t).slice(5, 10));
  const sumY = (list) => ({ km: list.filter(isRun).reduce((s, a) => s + (a.distance || 0), 0) / 1000, sec: list.reduce((s, a) => s + (a.moving_time || 0), 0), dplus: list.filter(isRun).reduce((s, a) => s + (a.total_elevation_gain || 0), 0) });
  const cy = sumY(ytd(y)), py = sumY(ytd(y - 1));

  el.innerHTML = `
    <div class="page-head"><h2>Charge</h2>${segmented('w', [[4, '4 sem.'], [8, '8 sem.'], [16, '16 sem.'], [26, '6 mois'], [52, '1 an']], nWeeks)}</div>

    <section class="card">
      <div class="card-head"><h3>Kilomètres de course / semaine</h3></div>
      ${legend([[C.blue, 'Km course'], [C.text3, `Moyenne (${fmtNum(kmAvg, 0)} km)`, true]])}
      <div class="chart h220"><canvas id="v-km"></canvas></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Heures d'entraînement / semaine</h3></div>
      ${legend(sports.map(s => [SPORT_COLORS[s], SPORT_LABEL[s]]))}
      <div class="chart h220"><canvas id="v-h"></canvas></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Dénivelé positif course / semaine</h3></div>
      <div class="chart h180"><canvas id="v-dp"></canvas></div>
    </section>

    ${zRows ? `<section class="card">${zoneTable(zRows, { title: `Intensité de la course à pied — ${nWeeks} dernières semaines` })}
      <p class="tiny muted">${fmtNum(easy, 0)} % du temps en Z1–Z2 (endurance facile).</p></section>` : ''}

    <section class="card">
      <div class="card-head"><h3>Cumul ${y} au ${fmtDate(t)}</h3></div>
      <div class="week-stats">
        <div class="ws"><span class="ws-k">Km course</span><span class="ws-v">${fmtNum(cy.km)} km</span><span class="ws-d ${cy.km >= py.km ? 'up' : 'down'}">${y - 1} : ${fmtNum(py.km)} km</span></div>
        <div class="ws"><span class="ws-k">Temps (tous sports)</span><span class="ws-v">${fmtNum(cy.sec / 3600)} h</span><span class="ws-d">${y - 1} : ${fmtNum(py.sec / 3600)} h</span></div>
        <div class="ws"><span class="ws-k">D+ course</span><span class="ws-v">${fmtNum(cy.dplus)} m</span><span class="ws-d">${y - 1} : ${fmtNum(py.dplus)} m</span></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Par mois</h3></div>
      <table class="tbl"><thead><tr><th>Mois</th><th>Km course</th><th>Heures<br><small>tous sports</small></th><th>D+<br><small>course</small></th><th>Séances<br><small>tous sports</small></th></tr></thead>
      <tbody>${[...months].reverse().map(m => `<tr><td>${MOIS[m.date.getMonth()]} ${m.date.getFullYear()}</td><td>${fmtNum(m.runKm)}</td><td>${fmtHours(m.totalSec)}</td><td>${fmtNum(m.dplus)}</td><td>${m.count}</td></tr>`).join('')}</tbody></table>
    </section>
  `;
  bindSeg(el, 'w', v => { nWeeks = +v; renderVolume(el); });

  const tipTitle = it => { const w = weeks[it[0].dataIndex]; return `Semaine ${weekNumber(w.start)} · du ${fmtDate(w.start)}`; };
  chart(el.querySelector('#v-km'), {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', label: 'Moyenne', data: labels.map(() => kmAvg), borderColor: C.text3, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
      { label: 'Km course', data: km, backgroundColor: weeks.map((_, i) => i === weeks.length - 1 ? 'rgba(111,207,224,.4)' : C.blue), maxBarThickness: 28 },
    ] },
    options: { scales: { y: { ticks: { callback: v => v + ' km' } } }, plugins: { tooltip: { callbacks: { title: tipTitle, label: c => c.dataset.label === 'Moyenne' ? `Moyenne : ${fmtNum(c.parsed.y, 1)} km` : `Course : ${fmtNum(c.parsed.y, 1)} km${c.dataIndex === weeks.length - 1 ? ' (en cours)' : ''}`, afterBody: it => { const w = weeks[it[0].dataIndex]; return w.runCount ? `${w.runCount} sorties · plus longue ${fmtNum(w.longest, 1)} km` : ''; } } } } },
  });
  chart(el.querySelector('#v-h'), {
    type: 'bar',
    data: { labels, datasets: sports.map(s => ({ label: SPORT_LABEL[s], data: weeks.map(w => +(w.bySport[s] / 3600).toFixed(2)), backgroundColor: SPORT_COLORS[s], borderColor: C.surface, borderWidth: { top: 2 }, borderSkipped: false, borderRadius: 2, maxBarThickness: 28, stack: 'h' })) },
    options: { scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => v + ' h' } } }, plugins: { tooltip: { callbacks: { title: tipTitle, label: c => c.parsed.y ? `${c.dataset.label} : ${fmtHours(c.parsed.y * 3600)}` : null, footer: it => `Total : ${fmtHours(weeks[it[0].dataIndex].totalSec)}` } } } },
  });
  chart(el.querySelector('#v-dp'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'D+', data: dplus, backgroundColor: C.aqua, maxBarThickness: 28 }] },
    options: { scales: { y: { ticks: { callback: v => v + ' m' } } }, plugins: { tooltip: { callbacks: { title: tipTitle, label: c => `D+ : ${fmtNum(c.parsed.y)} m` } } } },
  });
}
