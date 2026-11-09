import { state, settings, tests, load, clearCache, pushRunSettings, isDemo, canReachNetwork } from '../data.js';
import { chart, C } from '../charts.js';
import { bestEfforts, activityRecords, isRun } from '../metrics.js';
import { MOIS_LONG, esc, fmtDate, fmtKm, fmtDur, fmtPace, fmtNum, fmtChrono, parseLocal, today, daysBetween, isoDate } from '../util.js';
import { segmented, bindSeg, empty } from './parts.js';
import { raceLine } from './home.js';

export function renderMore(el) {
  const items = [
    ['courses', 'Calendrier des courses', 'Tes objectifs de la saison, compte à rebours', '🏁'],
    ['tests', 'Tests labo', 'VO2max, seuils SV1 / SV2 et leur évolution', '🧪'],
    ['reglages', 'Réglages', 'Connexion Intervals.icu, calendrier, données', '⚙️'],
  ];
  el.innerHTML = `<div class="page-head"><h2>Plus</h2></div>
    <nav class="menu">${items.map(([h, t, d, i]) => `<a href="#${h}" class="menu-item"><span class="mi-ico" aria-hidden="true">${i}</span><span><b>${t}</b><small>${d}</small></span><span class="chev">›</span></a>`).join('')}</nav>`;
}

// ---------- Courses ----------
export function renderRaces(el) {
  const t = today();
  const upcoming = [...state.races].filter(r => r.date && parseLocal(r.date) >= t && !r.cancelled).sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  el.innerHTML = `
    <a class="back" href="#plus">← Plus</a>
    <div class="page-head"><h2>Courses à venir</h2></div>
    ${next ? `<section class="card race-next">${raceLine(next, t)}</section>` : ''}
    ${!upcoming.length ? empty('Aucune course à venir.') : `<div class="race-list">${upcoming.map(r => raceItem(r, t)).join('')}</div>`}`;
}
function raceItem(r, t) {
  const d = r.date ? parseLocal(r.date) : null;
  const days = d ? daysBetween(t, d) : null;
  const match = d && d < t ? state.activities.find(a => a.start_date_local.slice(0, 10) === r.date && isRun(a) && (a.distance || 0) > 5000) : null;
  const st = (r.statut || '').toLowerCase();
  return `<div class="race-item prio-b-${r.priority}">
    <div class="ri-date"><b>${d ? (r.approx ? '≈' : d.getDate()) : '?'}</b><span>${d ? fmtDate(d).split(' ')[1] : ''}</span><small>${d ? d.getFullYear() : ''}</small></div>
    <div class="ri-main">
      <b>${esc(r.titre)}</b>
      <span class="muted tiny">${esc(r.lieu)}${r.approx ? ' · ' + esc(r.dateTxt) : ''}</span>
      <span class="tags"><span class="tag prio-${r.priority}">${r.priority === 'A' ? 'Principale' : r.priority === 'B' ? 'Secondaire' : esc(r.objectif || 'Préparation')}</span><span class="tag">${esc(r.format)}</span>${r.objectif && r.priority === 'B' && /\d/.test(r.objectif) ? `<span class="tag">Objectif ${esc(r.objectif)}</span>` : ''}<span class="tag st-${st.includes('inscrit') && !st.includes("s'") ? 'ok' : st.includes("s'inscrire") ? 'todo' : 'maybe'}">${esc(r.statut)}</span></span>
      ${r.remarque ? `<span class="tiny note">${esc(r.remarque)}</span>` : ''}
      ${match ? `<a class="tiny link" href="#seance-${encodeURIComponent(match.id)}">Résultat : ${fmtKm(match.distance, 1)} km en ${fmtDur(match.moving_time)} →</a>` : ''}
    </div>
    ${days != null && days >= 0 ? `<div class="ri-cd"><b>J−${days}</b></div>` : ''}
  </div>`;
}

// ---------- Records ----------
let recCurve = 0;
export function renderRecords(el) {
  const pc = state.paceCurves;
  const curves = pc?.list || [];
  const eff = bestEfforts(pc, recCurve).filter(e => e.sec);
  const ar = activityRecords(state.activities);
  const runs = state.activities.filter(isRun);
  const weekMax = maxBy(groupSum(runs, a => isoDate(mondayOf(a.start_date_local)), a => a.distance || 0));
  const monthMax = maxBy(groupSum(runs, a => a.start_date_local.slice(0, 7), a => a.distance || 0));
  el.innerHTML = `
    <a class="back" href="#plus">← Plus</a>
    <div class="page-head"><h2>Records</h2>${curves.length > 1 ? segmented('c', curves.map((c, i) => [i, c.id === 'all' ? 'Tout temps' : c.id === '1y' ? '12 mois' : c.id === 's0' ? 'Saison' : esc(c.label)]), recCurve) : ''}</div>
    <section class="card">
      <div class="card-head"><h3>Meilleurs efforts en course</h3></div>
      ${eff.length ? `<div class="rec-list">${eff.map(e => `<a class="rec" ${e.actId ? `href="#seance-${encodeURIComponent(e.actId)}"` : ''}>
        <span class="rec-d">${e.label}</span><b class="rec-t">${fmtChrono(e.sec)}</b><span class="rec-p">${fmtPace(e.pace)}/km</span>
        <span class="rec-w tiny muted">${e.act ? `${fmtDate(e.act.start_date_local, { year: true })} · ${esc(e.act.name)}` : ''}</span></a>`).join('')}</div>`
      : '<p class="muted">Les meilleurs efforts apparaîtront une fois l\'historique synchronisé.</p>'}
      <p class="tiny muted">Meilleur temps sur la distance, extrait de n'importe quelle sortie (calculé par Intervals.icu). Les valeurs aberrantes de GPS (allure plus rapide que 2'40/km) sont écartées.</p>
    </section>
    <section class="card">
      <div class="card-head"><h3>Records de volume</h3></div>
      <div class="rec-list">
        ${ar.filter(r => r.a).map(r => `<a class="rec" href="#seance-${encodeURIComponent(r.a.id)}"><span class="rec-d">${r.label}</span><b class="rec-t">${r.fmt === 'km' ? fmtKm(r.a.distance, 1) + ' km' : r.fmt === 'dur' ? fmtDur(r.a.moving_time) : fmtNum(r.a.total_elevation_gain) + ' m'}</b><span class="rec-p"></span><span class="rec-w tiny muted">${fmtDate(r.a.start_date_local, { year: true })} · ${esc(r.a.name)}</span></a>`).join('')}
        ${weekMax ? `<div class="rec"><span class="rec-d">Plus grosse semaine</span><b class="rec-t">${fmtKm(weekMax[1], 0)} km</b><span class="rec-p"></span><span class="rec-w tiny muted">semaine du ${fmtDate(weekMax[0], { year: true })}</span></div>` : ''}
        ${monthMax ? `<div class="rec"><span class="rec-d">Plus gros mois</span><b class="rec-t">${fmtKm(monthMax[1], 0)} km</b><span class="rec-p"></span><span class="rec-w tiny muted">${MOIS_LONG[+monthMax[0].slice(5) - 1]} ${monthMax[0].slice(0, 4)}</span></div>` : ''}
      </div>
    </section>`;
  bindSeg(el, 'c', v => { recCurve = +v; renderRecords(el); });
}
function mondayOf(s) { const d = parseLocal(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d; }
function groupSum(list, kf, vf) { const m = new Map(); for (const a of list) { const k = kf(a); m.set(k, (m.get(k) || 0) + vf(a)); } return m; }
function maxBy(m) { let best = null; for (const e of m) if (!best || e[1] > best[1]) best = e; return best; }

// ---------- Matériel ----------
export function renderGear(el) {
  const limit = settings.get().shoeLimit || 800;
  const g = [...(state.gear || [])].sort((a, b) => (!!a.retired - !!b.retired) || (b.distance - a.distance));
  const shoes = g.filter(x => x.type === 'Shoes'), other = g.filter(x => x.type !== 'Shoes');
  const card = x => {
    const km = (x.distance || 0) / 1000;
    const pct = x.type === 'Shoes' ? km / limit * 100 : null;
    const lvl = pct == null ? '' : pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : 'good';
    return `<div class="gear ${x.retired ? 'retired' : ''}">
      <div class="gear-top"><b>${esc(x.name)}</b>${x.retired ? '<span class="tag">Retirée</span>' : pct != null ? `<span class="tag lvl-${lvl}">${pct >= 100 ? 'À remplacer' : pct >= 80 ? 'Bientôt usée' : 'En forme'}</span>` : ''}</div>
      <div class="gear-km"><b>${fmtNum(km)} km</b>${pct != null ? `<span class="muted tiny"> / ${limit} km conseillés</span>` : ''}</div>
      ${pct != null && !x.retired ? `<div class="gbar"><span class="lvl-bg-${lvl}" style="width:${Math.min(100, pct)}%"></span></div>` : ''}
    </div>`;
  };
  el.innerHTML = `<a class="back" href="#plus">← Plus</a><div class="page-head"><h2>Matériel</h2></div>
    ${!g.length ? empty('Aucun matériel. Ajoute tes chaussures dans Strava ou Intervals.icu et associe-les à tes sorties.') : ''}
    ${shoes.length ? `<h4 class="week-h">Chaussures</h4><div class="gear-list">${shoes.map(card).join('')}</div>` : ''}
    ${other.length ? `<h4 class="week-h">Autres</h4><div class="gear-list">${other.map(card).join('')}</div>` : ''}
    <p class="tiny muted">Le seuil d'usure (${limit} km) se règle dans Réglages. Le kilométrage vient d'Intervals.icu / Strava.</p>`;
}

// ---------- Tests labo ----------
export function renderTests(el) {
  const list = tests.all();
  const last = list[0];
  el.innerHTML = `<a class="back" href="#plus">← Plus</a>
    <div class="page-head"><h2>Tests labo</h2><button class="btn small" id="add">+ Ajouter un test</button></div>
    <div id="form" hidden></div>
    ${list.map((t, i) => testCard(t, list[i + 1])).join('')}
    ${list.length > 1 ? `<section class="card"><div class="card-head"><h3>Évolution de la VO2max</h3></div><div class="chart h180"><canvas id="t-vo2"></canvas></div></section>` : ''}
    ${last ? `<section class="card"><div class="card-head"><h3>Appliquer les zones</h3></div>
      <p class="muted">Envoie les valeurs du test le plus récent à Intervals.icu (course à pied) : FC seuil = milieu de SV2, FC max, allure seuil = milieu de SV2.</p>
      <p><b>FC seuil ${Math.round((last.sv2.hrMin + last.sv2.hrMax) / 2)} bpm · FC max ${last.fcmax} bpm · allure seuil ${fmtPace((last.sv2.paceMin + last.sv2.paceMax) / 2)}/km</b></p>
      <button class="btn" id="apply">Mettre à jour Intervals.icu</button><p class="tiny muted" id="apply-msg"></p></section>` : ''}
    <p class="tiny muted">Les tests sont enregistrés sur cet appareil. Pense à les exporter depuis Réglages si tu changes de téléphone.</p>`;
  el.querySelector('#add').addEventListener('click', () => showForm(el));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { if (b.dataset.confirm) { tests.remove(b.dataset.del); renderTests(el); } else { b.dataset.confirm = '1'; b.textContent = 'Confirmer la suppression'; } }));
  el.querySelector('#apply')?.addEventListener('click', async () => {
    const msg = el.querySelector('#apply-msg');
    msg.textContent = 'Envoi…';
    try {
      const pace = (last.sv2.paceMin + last.sv2.paceMax) / 2;
      await pushRunSettings({ lthr: Math.round((last.sv2.hrMin + last.sv2.hrMax) / 2), max_hr: last.fcmax, threshold_pace: +(1000 / pace).toFixed(4) });
      msg.textContent = 'Zones mises à jour dans Intervals.icu. Pour recalculer les anciennes séances : Intervals.icu → Paramètres → Course à pied → « Mettre à jour les activités ».';
    } catch (e) { msg.textContent = e.message; }
  });
  if (list.length > 1) {
    const ord = [...list].reverse();
    chart(el.querySelector('#t-vo2'), { type: 'line', data: { labels: ord.map(t => fmtDate(t.date, { year: true })), datasets: [{ label: 'VO2max', data: ord.map(t => t.vo2max), borderColor: C.blue, backgroundColor: C.blue, pointRadius: 5 }] }, options: { scales: { y: { ticks: { callback: v => v + '' } } }, plugins: { tooltip: { callbacks: { label: c => `VO2max : ${c.parsed.y} ml/kg/min` } } } } });
  }
}
function testCard(t, prev) {
  const dv = prev && t.vo2max && prev.vo2max ? t.vo2max - prev.vo2max : null;
  const sv = (s) => `${fmtPace(s.paceMin)}–${fmtPace(s.paceMax)}/km · ${s.hrMin}–${s.hrMax} bpm`;
  return `<section class="card test">
    <div class="card-head"><div><h3>${fmtDate(t.date, { year: true })}</h3><span class="muted tiny">${esc(t.lab || '')}${t.type ? ' · ' + esc(t.type) : ''}</span></div><button class="btn ghost small" data-del="${esc(t.id)}">Supprimer</button></div>
    <div class="stat-grid">
      <div class="st"><span>VO2max</span><b>${t.vo2max ?? '–'} <small>ml/kg/min</small></b>${dv != null ? `<span class="ws-d ${dv >= 0 ? 'up' : 'down'}">${dv >= 0 ? '+' : '−'}${fmtNum(Math.abs(dv), 1)} vs précédent</span>` : ''}</div>
      <div class="st"><span>FC max</span><b>${t.fcmax ?? '–'} bpm</b></div>
      ${t.sv2pctVo2 ? `<div class="st"><span>SV2 en % VO2max</span><b>${t.sv2pctVo2} %</b></div>` : ''}
    </div>
    <div class="thr"><span class="thr-k">SV1</span><span>${sv(t.sv1)}</span></div>
    <div class="thr"><span class="thr-k">SV2</span><span>${sv(t.sv2)}</span></div>
    ${t.notes ? `<p class="tiny muted">${esc(t.notes)}</p>` : ''}
  </section>`;
}
function showForm(el) {
  const f = el.querySelector('#form');
  f.hidden = false;
  f.innerHTML = `<section class="card"><h3>Nouveau test</h3>
    <form class="form" id="tf">
      <label>Date<input type="date" name="date" required value="${isoDate(today())}"></label>
      <label>Laboratoire<input name="lab" placeholder="Le Lab, PaceLab…"></label>
      <label>VO2max (ml/kg/min)<input name="vo2max" inputmode="decimal" placeholder="57,3"></label>
      <label>FC max (bpm)<input name="fcmax" inputmode="numeric" placeholder="211"></label>
      <fieldset><legend>SV1</legend><label>Allure de<input name="s1p1" placeholder="4:04"></label><label>à<input name="s1p2" placeholder="4:10"></label><label>FC de<input name="s1h1" inputmode="numeric" placeholder="176"></label><label>à<input name="s1h2" inputmode="numeric" placeholder="180"></label></fieldset>
      <fieldset><legend>SV2</legend><label>Allure de<input name="s2p1" placeholder="3:28"></label><label>à<input name="s2p2" placeholder="3:34"></label><label>FC de<input name="s2h1" inputmode="numeric" placeholder="193"></label><label>à<input name="s2h2" inputmode="numeric" placeholder="197"></label></fieldset>
      <label>Notes<textarea name="notes" rows="2"></textarea></label>
      <p class="tiny err" id="ferr"></p>
      <div class="row"><button class="btn" type="submit">Enregistrer</button><button class="btn ghost" type="button" id="cancel">Annuler</button></div>
    </form></section>`;
  f.querySelector('#cancel').addEventListener('click', () => { f.hidden = true; });
  f.querySelector('#tf').addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const p = s => { const m = String(s).trim().match(/^(\d{1,2})[:'’](\d{1,2})$/); return m ? +m[1] * 60 + +m[2] : null; };
    const n = s => s === '' ? null : Number(String(s).replace(',', '.'));
    const t = { id: 't' + d.date, date: d.date, lab: d.lab, vo2max: n(d.vo2max), fcmax: n(d.fcmax), sv1: { paceMin: p(d.s1p1), paceMax: p(d.s1p2), hrMin: n(d.s1h1), hrMax: n(d.s1h2) }, sv2: { paceMin: p(d.s2p1), paceMax: p(d.s2p2), hrMin: n(d.s2h1), hrMax: n(d.s2h2) }, notes: d.notes };
    if (!t.sv2.paceMin || !t.sv2.hrMin || !t.fcmax) { f.querySelector('#ferr').textContent = 'Renseigne au moins la FC max et le SV2 (allures au format 3:30).'; return; }
    tests.add(t); renderTests(el);
  });
}

// ---------- Réglages ----------
export function renderSettings(el) {
  const s = settings.get();
  const net = canReachNetwork();
  el.innerHTML = `<a class="back" href="#plus">← Plus</a><div class="page-head"><h2>Réglages</h2></div>
    ${!net ? `<section class="card status-warn slim">Cet aperçu tourne dans Claude : il ne peut pas se connecter à Intervals.icu et affiche des <b>données fictives</b>. La version installée sur ton téléphone utilisera tes vraies données.</section>` : ''}
    <section class="card"><h3>Connexion Intervals.icu</h3>
      <p class="muted">Dans Intervals.icu : <b>Paramètres → Paramètres développeur → Clé API</b>, clique sur « Générer » puis copie la clé ici. Elle reste sur ce téléphone.</p>
      <form class="form" id="sf">
        <label>Clé API<input name="apiKey" type="password" autocomplete="off" value="${esc(s.apiKey)}" placeholder="Colle ta clé API"></label>
        <label>ID athlète<input name="athleteId" value="${esc(s.athleteId)}" placeholder="0 = toi"></label>
        <label>Seuil d'usure des chaussures (km)<input name="shoeLimit" inputmode="numeric" value="${s.shoeLimit}"></label>
        <label class="check"><input type="checkbox" name="demo" ${s.demo ? 'checked' : ''}> Mode démo (données fictives)</label>
        <div class="row"><button class="btn" type="submit">Enregistrer et synchroniser</button></div>
        <p class="tiny" id="smsg">${state.error ? `<span class="err">${esc(state.error)}</span>` : state.updated && !isDemo() ? `Dernière synchro : ${fmtDate(state.updated)} à ${String(state.updated.getHours()).padStart(2, '0')}h${String(state.updated.getMinutes()).padStart(2, '0')}` : ''}</p>
      </form>
    </section>
    <section class="card"><h3>Google Sheets (courses et plan)</h3>
      <p class="muted">L'app lit ton calendrier de courses et ton plan d'entraînement dans Google Sheets. Pour la synchro automatique, chaque Sheet doit être partagé en lecture : <b>Partager → Accès général → « Tous les utilisateurs disposant du lien » → Lecteur</b>.</p>
      <form class="form" id="rf">
        <label>ID du Google Sheet<input name="sheetId" value="${esc(s.sheetId)}"></label>
        <label>Onglets à lire (séparés par des virgules)<input name="sheetTabs" value="${esc(s.sheetTabs)}"></label>
        <label>ID du Google Sheet du plan<input name="planSheetId" value="${esc(s.planSheetId)}"></label>
        <label>Préfixe des onglets semaine<input name="planTabPrefix" value="${esc(s.planTabPrefix)}" placeholder="S (pour S01, S02…)"></label>
        <div class="row"><button class="btn" type="submit">Enregistrer</button></div>
      </form>
    </section>
    <section class="card"><h3>Données</h3>
      <div class="row wrap">
        <button class="btn ghost" id="resync">Tout re-télécharger</button>
        <button class="btn ghost" id="export">Exporter mes tests labo</button>
        <button class="btn ghost" id="import">Importer des tests</button>
      </div>
      <textarea id="io" rows="4" hidden placeholder="Colle ici l'export de tes tests puis appuie à nouveau sur « Importer »"></textarea>
      <p class="tiny muted" id="dmsg"></p>
    </section>
    <p class="tiny muted center">Cairn · version Alpenglow du 9 nov. · données Suunto & Strava via Intervals.icu</p>`;
  el.querySelector('#sf').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    settings.set({ apiKey: d.apiKey.trim(), athleteId: d.athleteId.trim() || '0', shoeLimit: Number(d.shoeLimit) || 800, demo: !!d.demo });
    el.querySelector('#smsg').textContent = 'Synchronisation…';
    clearCache(); await load({ force: true });
    renderSettings(el);
  });
  el.querySelector('#rf').addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    settings.set({ sheetId: d.sheetId.trim(), sheetTabs: d.sheetTabs, planSheetId: d.planSheetId.trim(), planTabPrefix: d.planTabPrefix.trim() || 'S' });
    localStorage.removeItem('ss.races'); localStorage.removeItem('ss.plan'); await load();
    location.hash = '#planning';
  });
  el.querySelector('#resync').addEventListener('click', async () => { el.querySelector('#dmsg').textContent = 'Téléchargement de tout l\'historique…'; clearCache(); await load({ force: true }); el.querySelector('#dmsg').textContent = state.error || 'Terminé.'; });
  el.querySelector('#export').addEventListener('click', async () => {
    const txt = JSON.stringify(tests.all());
    const io = el.querySelector('#io'); io.hidden = false; io.value = txt;
    try { await navigator.clipboard.writeText(txt); el.querySelector('#dmsg').textContent = 'Copié dans le presse-papiers.'; } catch { el.querySelector('#dmsg').textContent = 'Copie le texte ci-dessus et garde-le en lieu sûr.'; }
  });
  el.querySelector('#import').addEventListener('click', () => {
    const io = el.querySelector('#io');
    if (io.hidden || !io.value.trim()) { io.hidden = false; io.value = ''; io.focus(); return; }
    try { const l = JSON.parse(io.value); if (!Array.isArray(l)) throw 0; tests.save(l); el.querySelector('#dmsg').textContent = `${l.length} test(s) importé(s).`; } catch { el.querySelector('#dmsg').textContent = 'Texte invalide.'; }
  });
}
