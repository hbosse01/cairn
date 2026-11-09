import { state, load, onChange, isDemo, canReachNetwork } from './data.js';
import { destroyAll } from './charts.js';
import { $, esc, fmtDate } from './util.js';
import { renderHome } from './views/home.js';
import { renderHealth } from './views/health.js';
import { renderActivities, renderActivity } from './views/activities.js';
import { renderVolume } from './views/volume.js';
import { renderPlanning } from './views/planning.js';
import { renderMore, renderRaces, renderTests, renderSettings } from './views/more.js';

const ROUTES = {
  accueil: { tab: 'accueil', title: 'Aujourd\'hui', render: renderHome },
  sante: { tab: 'sante', title: 'Santé', render: renderHealth },
  seances: { tab: 'seances', title: 'Séances', render: renderActivities },
  planning: { tab: 'planning', title: 'Planning', render: renderPlanning },
  charge: { tab: 'charge', title: 'Charge', render: renderVolume },
  volume: { tab: 'charge', title: 'Charge', render: renderVolume },
  plus: { tab: 'plus', title: 'Plus', render: renderMore },
  courses: { tab: 'plus', title: 'Courses', render: renderRaces },
  tests: { tab: 'plus', title: 'Tests labo', render: renderTests },
  reglages: { tab: 'plus', title: 'Réglages', render: renderSettings },
};

let lastRoute = null;
function route() {
  const h = decodeURIComponent((location.hash || '#accueil').slice(1));
  const main = $('#view');
  destroyAll();
  let tab;
  if (h.startsWith('seance-')) {
    tab = 'seances';
    renderActivity(main, h.slice(7));
  } else {
    const r = ROUTES[h] || ROUTES.accueil;
    tab = r.tab;
    r.render(main);
  }
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  if (lastRoute !== h) window.scrollTo(0, 0);
  lastRoute = h;
}

function status() {
  const s = $('#sync');
  if (state.loading) s.innerHTML = '<span class="spin" aria-hidden="true"></span>Synchro…';
  else if (state.error) s.innerHTML = `<a href="#reglages" class="err">⚠ Erreur de synchro</a>`;
  else if (state.demo) s.innerHTML = `<a href="#reglages" class="demo-badge">${canReachNetwork() ? 'Démo · connecter' : 'Aperçu · données fictives'}</a>`;
  else if (state.updated) s.textContent = `Synchro ${String(state.updated.getHours()).padStart(2, '0')}h${String(state.updated.getMinutes()).padStart(2, '0')}`;
}

let renderTimer;
onChange(() => {
  status();
  clearTimeout(renderTimer);
  // évite de re-dessiner pendant la saisie d'un formulaire
  renderTimer = setTimeout(() => { if (!document.activeElement || !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) route(); }, 50);
});
window.addEventListener('hashchange', route);
$('#refresh').addEventListener('click', () => load());

// Rafraîchit quand on revient sur l'app
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !isDemo() && state.updated && Date.now() - state.updated.getTime() > 10 * 60 * 1000) load();
});

if ('serviceWorker' in navigator && canReachNetwork()) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

route();
load();
