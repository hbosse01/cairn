// Script Google pour Cairn : renvoie le contenu (valeurs affichées) de tous les onglets
// du calendrier des courses et du plan d'entraînement.
// À déployer en « Application Web » (Exécuter en tant que : moi, Accès : tout le monde).
const SHEETS = {
  calendrier: '1tWbSyZ-WKS4PHJ8PfpeE2q1EeRh6VB3f2-Eat0ZTkEg', // Calendrier Saison 2025/2027
  plan: '1D4-NZk7bY_4dhvsosQyqe4KTlk2XjkCIYqublF3kDZ8',       // Prépa Hivernale
};

function doGet() {
  const out = {};
  Object.keys(SHEETS).forEach(function (key) {
    const ss = SpreadsheetApp.openById(SHEETS[key]);
    out[key] = ss.getSheets().map(function (sh) {
      return { name: sh.getName(), rows: sh.getDataRange().getDisplayValues() };
    });
  });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
