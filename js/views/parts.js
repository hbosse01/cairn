import { ZONE_COLORS } from '../charts.js';
import { fmtDur, fmtNum, esc } from '../util.js';

// Barre empilée compacte (aperçu des zones) — chaque segment porte un titre au survol
export function zoneBar(z) {
  return `<div class="zbar" role="img" aria-label="Temps dans les zones FC : ${z.map(x => `${x.z} ${Math.round(x.pct)} %`).join(', ')}">
    ${z.filter(x => x.pct > 0.4).map((x) => `<span style="flex:${x.pct};background:${ZONE_COLORS[+x.z.slice(1) - 1]}" title="${x.z} · ${fmtDur(x.t)} · ${Math.round(x.pct)} %"></span>`).join('')}
  </div>`;
}

// Tableau détaillé : zone, bornes, temps, %, barre
export function zoneTable(z, { title = 'Temps dans les zones FC' } = {}) {
  const max = Math.max(...z.map(x => x.pct), 1);
  return `<div class="ztable">
    ${title ? `<p class="eyebrow">${esc(title)}</p>` : ''}
    ${z.map((x, i) => `<div class="zrow">
      <span class="zlab"><span class="zdot" style="background:${ZONE_COLORS[i]}"></span><b>${x.z}</b><span class="zname">${esc(x.name)}</span></span>
      <span class="zrange">${x.rangeTxt ?? (x.lo != null ? `${x.lo}–${x.hi}` : '')}</span>
      <span class="ztrack"><span style="width:${(x.pct / max) * 100}%;background:${ZONE_COLORS[i]}"></span></span>
      <span class="ztime">${x.t ? fmtDur(x.t, { short: true }) : '–'}</span>
      <span class="zpct">${fmtNum(x.pct, 0)} %</span>
    </div>`).join('')}
  </div>`;
}

export function segmented(name, options, value) {
  return `<div class="seg" role="tablist" data-seg="${name}">${options.map(([v, l]) => `<button role="tab" data-v="${v}" class="${String(v) === String(value) ? 'on' : ''}" aria-selected="${String(v) === String(value)}">${l}</button>`).join('')}</div>`;
}
export function bindSeg(root, name, cb) {
  root.querySelectorAll(`[data-seg="${name}"] button`).forEach(b => b.addEventListener('click', () => cb(b.dataset.v)));
}

export function empty(msg) { return `<div class="empty card"><p>${msg}</p></div>`; }

export function legend(items) {
  return `<div class="legend">${items.map(([c, l, dash]) => `<span><i style="background:${c}${dash ? ';height:2px;border-top:2px dashed ' + c + ';background:none' : ''}"></i>${esc(l)}</span>`).join('')}</div>`;
}
