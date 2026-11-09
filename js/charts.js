// Graphiques (Chart.js) — thème sombre, une seule échelle Y par graphique
export const C = {
  blue: '#6fcfe0', orange: '#ff8f6b', aqua: '#8fd6a0', yellow: '#f4c46b', magenta: '#d64d8a', green: '#7fd6a3', violet: '#c0a8ff', red: '#ff8f6b',
  grid: 'rgba(159,196,214,0.10)', text2: '#a3b6c4', text3: '#6f8595', surface: '#15232e',
};
// Zones FC : du plus doux au plus intense, avec libellé toujours affiché à côté
// Zones : du froid (glacier) au chaud (alpenglow)
export const ZONE_COLORS = ['#5d7d92', '#6fcfe0', '#8fd6a0', '#f4c46b', '#ff8f6b', '#ff6178', '#d64d8a'];
export const SPORT_COLORS = { run: '#6fcfe0', ride: '#ffb26b', hike: '#8fd6a0', strength: '#c0a8ff', swim: '#7fa8ff', other: '#6f8595' };

const charts = new Map();
let ready = false;
function setup() {
  if (ready || !window.Chart) return;
  const Ch = window.Chart;
  Ch.defaults.color = C.text2;
  Ch.defaults.font.family = "'Hanken Grotesk', system-ui, -apple-system, sans-serif";
  Ch.defaults.font.size = 11;
  Ch.defaults.borderColor = C.grid;
  // Pas d'animation : le graphique est dessiné tout de suite, même si l'affichage est mis en pause (aperçu, webview)
  Ch.defaults.animation = false;
  Ch.defaults.animations = {};
  Ch.defaults.transitions.active = { animation: { duration: 0 } };
  Ch.defaults.font.size = 11.5;
  Ch.defaults.maintainAspectRatio = false;
  Ch.defaults.plugins.legend.display = false;
  Ch.defaults.plugins.tooltip.backgroundColor = '#1c2d3a';
  Ch.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
  Ch.defaults.plugins.tooltip.borderWidth = 1;
  Ch.defaults.plugins.tooltip.titleColor = '#eef3f6';
  Ch.defaults.plugins.tooltip.bodyColor = '#a3b6c4';
  Ch.defaults.plugins.tooltip.padding = 10;
  Ch.defaults.plugins.tooltip.displayColors = true;
  Ch.defaults.plugins.tooltip.boxPadding = 4;
  Ch.defaults.elements.bar.borderRadius = 5;
  Ch.defaults.elements.line.borderWidth = 2;
  Ch.defaults.elements.point.radius = 0;
  Ch.defaults.elements.point.hoverRadius = 5;
  ready = true;
}

export function chart(canvas, config) {
  setup();
  if (!window.Chart || !canvas) return null;
  const key = canvas.id || canvas;
  if (charts.has(key)) { charts.get(key).destroy(); charts.delete(key); }
  const base = {
    options: {
      responsive: true, interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, color: C.text3 } },
        y: { grid: { color: C.grid }, border: { display: false }, ticks: { color: C.text3, maxTicksLimit: 5 } },
      },
    },
  };
  const cfg = deepMerge(base, config);
  const c = new window.Chart(canvas, cfg);
  charts.set(key, c);
  return c;
}
// Remplissage en dégradé (haut coloré → transparent), dans l'esprit des reliefs de la DA
export function gradient(color, top = 0.35, bottom = 0) {
  return (ctx) => {
    const { chart: c } = ctx; const a = c.chartArea;
    if (!a) return 'transparent';
    const g = c.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    const rgb = color.match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16)).join(',');
    g.addColorStop(0, `rgba(${rgb},${top})`); g.addColorStop(1, `rgba(${rgb},${bottom})`);
    return g;
  };
}
export function destroyAll() { charts.forEach(c => c.destroy()); charts.clear(); }

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b == null) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (a && typeof a[k] === 'object' && !Array.isArray(a[k]) && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(a[k], v) : v;
  return out;
}
