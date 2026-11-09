// Lecture du plan d'entraînement (Google Sheet type « Prépa Hivernale » : un onglet par semaine S01, S02…)
// Structure : ligne des dates (jj/mm/aaaa), ligne « AM », séances du matin, ligne « PM », séances de l'après-midi, ligne « Total Km ».
export function parsePlanRows(rows) {
  const out = [];
  const di = rows.findIndex(r => r.filter(c => /^\d{2}\/\d{2}\/\d{4}$/.test(String(c).trim())).length >= 3);
  if (di < 0) return out;
  const dates = rows[di].map(c => { const m = String(c).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; });
  const find = (re, from) => rows.findIndex((r, i) => i > from && r.some(c => re.test(String(c).trim())));
  const amI = find(/^AM$/i, di), pmI = find(/^PM$/i, di), totI = find(/^total\s*km$/i, di);
  const amRow = amI >= 0 ? rows[amI + 1] : [];
  const pmRow = pmI >= 0 ? rows[pmI + 1] : [];
  const totRow = totI >= 0 ? rows[totI] : [];
  dates.forEach((d, c) => {
    if (!d) return;
    const clean = v => String(v ?? '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean).join(' · ');
    const am = clean(amRow?.[c]), pm = clean(pmRow?.[c]);
    const tot = String(totRow?.[c] ?? '').trim();
    out.push({ date: d, am, pm, km: /^\d+([.,]\d+)?$/.test(tot) ? Number(tot.replace(',', '.')) : null, note: tot && !/^\d/.test(tot) ? tot : '' });
  });
  return out;
}

export function classify(txt) {
  const t = (txt || '').toLowerCase();
  if (!t) return null;
  if (/test\s*vo2/.test(t)) return 'test';
  if (/fart/.test(t)) return 'quality';
  if (/semi|cross|t4p|houilles|corrida|marathon|trail des|ecotrail|eco trail/.test(t)) return 'race';
  if (/muscu|renfo|gainage/.test(t) && !/footing|sv|x\s*\d/.test(t)) return 'strength';
  if (/\bht\b|home\s*trainer|ht\d|vélo|velo/.test(t)) return 'ride';
  if (/sv1|sv2|as21|a10|fart|x\s*\d|\d\s*x|côte|cote|seuil|vma|threshold|prog|tapis\s+\d|\d'\d/.test(t)) return 'quality';
  return 'easy';
}
export const KIND_LABEL = { easy: 'Endurance', quality: 'Qualité', race: 'Course', strength: 'Renfo', ride: 'Vélo', test: 'Test' };

// Copie du Sheet « Prépa Hivernale » (lue le 7 nov. 2026), utilisée tant que le Sheet n'est pas partagé
export function DEFAULT_PLAN() {
  const P = [
    ['2026-10-26', '', "Footing 1h10 · 350D+ · 5 LD", 14], ['2026-10-27', '', "Fartleck · 10 x 1'1' · 10 x 30' 30'", 16], ['2026-10-28', '', 'Footing 30min · Muscu 1h', 6], ['2026-10-29', '', "SV2 · 5 x 4'", 16], ['2026-10-30', '', '', null, 'HT1H'], ['2026-10-31', '', 'Footing 1h15 · 400 D+', 15], ['2026-11-01', '20km prog', 'Echauff 3km · Muscu 1h', 23],
    ['2026-11-02', '', 'Footing récup · 350 D+ · 5LD', 15], ['2026-11-03', '', '8 x 3min SV2', 16], ['2026-11-04', '', 'Footing 30min · Muscu 1H', 6], ['2026-11-05', '', '3x3km AS21', 18], ['2026-11-06', '', '', null, 'HT45min'], ['2026-11-07', 'Footing · 3x10min SV1', '', 23], ['2026-11-08', 'Footing 1h15 · 400 D+ · Muscu 1H', 'HT45min', 15],
    ['2026-11-09', '', 'Footing 1h15 · 5 LD', 14], ['2026-11-10', '', '4 x 4min AS21', 15], ['2026-11-11', '', 'Footing 30min · Muscu 1h', 6], ['2026-11-12', '', 'Footing 1h10', 14], ['2026-11-13', '', '', null], ['2026-11-14', 'Footing 40min', '', 7], ['2026-11-15', 'Echauff 3km · Semi marathon de Boulogne', 'Footing récup 10km', 34],
    ['2026-11-16', '', 'Footing 1h récup', 12], ['2026-11-17', '', 'Footing 6km · Muscu 1H', 6], ['2026-11-18', '', "Fartelck type cross · 1'2'3'2'1 x 2", 18], ['2026-11-19', '', 'Footing 6km · Muscu 1H', 6], ['2026-11-20', '', 'Footing', 16], ['2026-11-21', 'TEST VO2', 'Footing 10km', 16], ['2026-11-22', 'Réveille musculaire 20min', 'Echauff 3km · Cross national des Mureaux', 16],
    ['2026-11-23', '', 'Footing récup 1h', 12], ['2026-11-24', '', "Tapis · 4'6'8'6'4", 16], ['2026-11-25', '', 'Footing 6km · Muscu 1h', 6], ['2026-11-26', '', '6*1 en cote · 3x5min a plat', 16], ['2026-11-27', '', 'HT 45min', null], ['2026-11-28', 'Footing 1 h', '', 12], ['2026-11-29', 'Echauff 2km · T4P 30km', 'Muscu 1H', 33],
    ['2026-11-30', '', 'Footing récup 1h', 12], ['2026-12-01', '', '', 15], ['2026-12-02', '', '', 6], ['2026-12-03', '', '', 16], ['2026-12-05', '', '', 20], ['2026-12-06', '', '', 25],
    ['2026-12-26', 'Footing Veille de course · 8km + 2x2 A10', '', 8], ['2026-12-27', 'Reveil musculaire 20min', 'Echauff 3km · 10km Houilles', 17],
    ['2027-01-10', '', 'Cross départemental Sartrouville', null], ['2027-01-24', '', 'LIFA Ouest Cross', null],
  ];
  return P.map(([date, am, pm, km, note]) => ({ date, am, pm, km, note: note || '' }));
}
