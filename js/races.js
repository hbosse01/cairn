// Lecture du calendrier de courses (Google Sheet "Calendrier Saison")
const MONTHS = { 'janv': 0, 'jan': 0, 'févr': 1, 'fevr': 1, 'fév': 1, 'feb': 1, 'mars': 2, 'mar': 2, 'avr': 3, 'avril': 3, 'mai': 4, 'juin': 5, 'juil': 6, 'juillet': 6, 'août': 7, 'aout': 7, 'sept': 8, 'sep': 8, 'oct': 9, 'octobre': 9, 'nov': 10, 'déc': 11, 'dec': 11, 'septembre': 8, 'novembre': 10, 'décembre': 11, 'janvier': 0, 'février': 1, 'avril ': 3 };

export function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function monthFrom(txt) {
  const t = txt.toLowerCase().replace(/[().]/g, ' ');
  for (const [k, v] of Object.entries(MONTHS)) if (new RegExp(`(^|[^a-zé])${k}`).test(t)) return v;
  return null;
}

// La saison "2026/2027" : août → décembre = 2026, janvier → juillet = 2027
function seasonYears(tab) {
  const m = String(tab).match(/(\d{4})\s*\/\s*(\d{4})/);
  if (m) return [Number(m[1]), Number(m[2])];
  const y = new Date().getFullYear();
  return [y, y + 1];
}

export function priorityOf(objectif) {
  const o = (objectif || '').toLowerCase();
  if (o.includes('principal')) return 'A';
  if (o.includes('secondaire') || /\d+h\d+|\d+min/.test(o)) return 'B';
  return 'C';
}

export function parseRaceRows(rows, tab) {
  const [y1, y2] = seasonYears(tab);
  const hi = rows.findIndex(r => r.some(c => /^\s*titre\s*$/i.test(c)));
  if (hi < 0) return [];
  const head = rows[hi].map(c => c.trim().toLowerCase());
  const col = name => head.findIndex(h => h.startsWith(name));
  const ci = { date: col('date'), titre: col('titre'), lieu: col('lieu'), format: col('format'), objectif: col('objectif'), statut: col('statut'), remarque: col('remarque') };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const titre = (r[ci.titre] || '').trim();
    if (!titre) continue;
    const dateTxt = (r[ci.date] || '').trim();
    const month = monthFrom(dateTxt);
    const dayM = dateTxt.match(/^(\d{1,2})/);
    const approx = !dayM;
    let date = null;
    if (month != null) {
      const year = month >= 7 ? y1 : y2;
      // jour exact, sinon milieu / début / fin du mois selon le texte
      const hint = dateTxt.replace(/d[ée]finir/i, '');
      const day = dayM ? Number(dayM[1]) : /d[ée]but/i.test(hint) ? 5 : /\bfin\b/i.test(hint) ? 25 : 15;
      date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const statut = (r[ci.statut] || '').trim();
    const format = (r[ci.format] || '').trim();
    const dist = format.match(/(\d+(?:[.,]\d+)?)\s*k/i);
    const dplus = format.match(/(\d{3,4})\s*d\s*\+/i);
    out.push({
      id: `${tab}-${titre}-${dateTxt}`,
      season: `${y1}/${y2}`, titre, lieu: (r[ci.lieu] || '').trim(), format, dateTxt, date, approx,
      objectif: (r[ci.objectif] || '').trim(), statut, remarque: (r[ci.remarque] || '').trim(),
      priority: priorityOf(r[ci.objectif]), cancelled: /suppr/i.test(statut),
      km: dist ? Number(dist[1].replace(',', '.')) : (/semi/i.test(format) ? 21.1 : /marathon/i.test(format) ? 42.2 : null),
      dplus: dplus ? Number(dplus[1]) : null,
    });
  }
  return out;
}

export function parseRaceSheet(csv, tab) { return parseRaceRows(parseCSV(csv), tab); }

// Copie du calendrier (lu dans ton Google Sheet le 7 nov. 2026), utilisée si le Sheet n'est pas accessible
export function DEFAULT_RACES() {
  const H = ['', 'Date', 'Titre', 'Lieu', 'Format', 'objectif', 'Statut', 'Remarque'];
  const s1 = [H,
    ['', '16-nov.', 'Trail Malassis', 'Mantes', '12 km', 'Séance / plaisir', 'Suppr', ''],
    ['', '29-nov.', 'Vertrail', 'Versailles', '17 km', 'Course de reprise', 'inscrit', ''],
    ['', '7-déc.', 'Chocotrail', 'Hardricourt', '24/42 km', 'Séance / plaisir', 'inscrit', ''],
    ['', '14-déc.', 'Corrida de noel', 'Issy les moulineaux', '10km route', '34min30', 'Suppr', 'Parcours non roulant'],
    ['', '21-déc.', 'Corrida de Houilles', 'Houilles', '10km route', '34min30', 'Suppr', ''],
    ['', '4-janv.', 'Prom classic', 'Nice', '10km route', 'Secondaire', 'inscrit', 'Chrono cible 33min30'],
    ['', '11-janv.', 'Départ cross', 'Mantes', 'Cross long', 'Validé tour suivant', 'inscrit', ''],
    ['', '1-févr.', 'Régionaux cross', 'Franconville', 'Cross long', 'Validé tour suivant', 'inscrit', ''],
    ['', '1-févr.', "L'hivernales", 'Les bréviaires', '24km', 'Séance de seuil', 'Suppr', ''],
    ['', '8-févr.', 'Lifa cross', 'Bussy St Georges', 'Cross long', 'Course aboutie', 'Suppr', 'Sous réserve de qualification'],
    ['', '15-févr.', 'Trace des wolfs', 'Gambais', '30km', 'Séance de seuil', 'inscrit', ''],
    ['', '8-mars', 'Les foulées mantaise', 'Mantes', '10km route', 'Séance de seuil', 'Suppr', ''],
    ['', '21-mars', 'Eco trail', 'Versailles / Paris', '47,5km 800d+', 'Principale', 'inscrit', ''],
    ['', '12-avr.', 'TDCG', 'Guerville', '42km 1500d+', 'Course de reprise / plaisir', 'inscrit', ''],
    ['', 'A définir (fin avril)', 'Ramboli trail', 'Rambouillet', '26km', 'Séance de seuil', 'inscrit', ''],
    ['', 'A définir (mai)', 'Trail des portes du Vexin', 'Issou', '38km', 'Séance de seuil', 'inscrit', ''],
    ['', 'A définir (mai)', "Foulées d'orgerus", 'Orgerus', '20km', 'Séance de seuil', 'Suppr', 'Peut être même date St jacques'],
    ['', '14-juin', 'St Jacques By Utmb', 'Puy en Velais', '55km 2100d+', 'Principale', 'inscrit', ''],
    ['', 'A définir (juin)', 'T4P', 'La Queue', '31km', 'Séance de seuil', "S'inscrire", 'Qualificatif au France'],
    ['', 'A définir (juillet)', 'UT4M', 'Grenoble', '44km 2900d+', 'Secondaire', 'inscrit', ''],
    ['', '13-sept.', 'Trail du pays de Sully', 'Rosny', '38km', 'Séance de seuil', 'A voir', ''],
    ['', '20-sept.', 'Enjambée de la mauldre', 'Maule', '30km', 'Séance de seuil', 'A voir', ''],
    ['', 'A définir (début octobre)', 'Utmj', 'Métabief', '40k 1100d+', 'Secondaire', 'inscrit', ''],
    ['', 'A définir ( début octobre)', 'Trail de la grande ferme', 'Soindres', '28km', 'Séance de seuil', "S'inscrire", 'Qualificatif au France'],
    ['', 'A définir (mi-octobre)', 'Intégrale des causses', 'Millau', '62km 2700d+', 'Principale', 'inscrit', "Attention date d'inscription"],
  ];
  const s2 = [H,
    ['', '15-nov.', 'Semi-marathon Boulogne', 'Boulogne Billancourt', 'Semi route', '1h15', 'inscrit', ''],
    ['', '22-nov.', 'Cross des Mureaux', 'Verneuil Sur Seine', 'Cross long', '', 'inscrit', ''],
    ['', '29-nov.', 'Trail des 4 Pilliers', 'La queue les Yvelines', '30km', '', 'inscrit', 'Qualificatif au France'],
    ['', '27-déc.', 'Corrida de Houilles', 'Houilles', '10km route', '33min15', 'inscrit', ''],
    ['', '10-janv.', 'Départ cross', 'Sartrouville', 'Cross long', '', "S'inscrire", ''],
    ['', '24-nov.', 'Régionaux cross', '', 'Cross long', '', "S'inscrire", ''],
    ['', '31-janv.', "L'hivernales", 'Les bréviaires', '24km', 'Séance de seuil', "S'inscrire", ''],
    ['', '7-févr.', 'Trace des wolfs', 'Gambais', '30km', 'Séance de seuil', "S'inscrire", ''],
    ['', '20-mars', 'Eco trail', 'Paris', '80km 1100D+', 'Principale', 'inscrit', ''],
    ['', '4-avr.', 'TDCG', 'Guerville', '42km 1500d+', 'Secondaire', 'inscrit', ''],
    ['', 'A définir (fin avril)', 'Ramboli trail', 'Rambouillet', '26km', 'Séance de seuil', 'inscrit', ''],
    ['', '16-mai', 'Alsace by UTMB', 'Obernai', '47km 1700 D+', 'Principale', 'inscrit', ''],
    ['', 'A définir (mai)', 'Trail des portes du Vexin', 'Issou', '38km', 'Séance de seuil', 'inscrit', ''],
    ['', 'A définir (mai)', "Foulées d'orgerus", 'Orgerus', '20km', 'Séance de seuil', "S'inscrire", ''],
    ['', 'A définir (juin)', 'T4P', 'La Queue', '31km', 'Séance de seuil', "S'inscrire", ''],
    ['', 'A définir (septembre)', 'Trail du pays de Sully', 'Rosny', '38km', 'Séance de seuil', 'A voir', ''],
    ['', 'A définir ( début octobre)', 'Trail de la grande ferme', 'Soindres', '28km', 'Séance de seuil', "S'inscrire", 'Qualificatif au France'],
    ['', 'A définir (mi-octobre)', 'Intégrale des causses', 'Millau', '62km 2700d+', 'Principale', 'inscrit', ''],
  ];
  return [...parseRaceRows(s1, 'Calendrier 2025/2026'), ...parseRaceRows(s2, 'Calendrier 2026/2027')];
}
