// ─────────────────────────────────────────────────────────────────────────────
// Contrôles de la lecture IA d'une facture ou d'un bon, sans React.
//
// Depuis le 18.11.2026, le modèle recopie pour chaque article le texte complet
// de la ligne imprimée (`brut`) avant d'en tirer les champs. Le front vérifie
// que le montant retenu figure bien dans ce texte : un montant calculé, deviné
// ou pris sur une autre ligne n'y est pas, et la ligne passe « à vérifier ».
// ─────────────────────────────────────────────────────────────────────────────

// Nombres écrits dans un texte de facture : « 1'234.50 », « 1’234,50 », « 38.80 »,
// « 2,5 », « 12 ». Apostrophes de milliers retirées, virgule décimale en point.
export function nombresDuTexte(texte) {
  const trouves = String(texte || '').match(/\d{1,3}(?:['’]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) || [];
  return trouves
    .map(t => Number(t.replace(/['’]/g, '').replace(',', '.')))
    .filter(Number.isFinite);
}

// Le montant figure-t-il dans le texte de la ligne ? null quand il n'y a rien
// à contrôler (pas de texte recopié : réponse d'une fonction plus ancienne).
export function montantRetrouve(montant, brut) {
  const m = montant == null || montant === '' ? NaN : Number(montant);
  if (!Number.isFinite(m) || !String(brut || '').trim()) return null;
  return nombresDuTexte(brut).some(n => Math.abs(n - Math.abs(m)) < 0.005);
}

// Écart entre la somme des lignes et le total HT au-delà duquel la lecture est
// annoncée « à vérifier » : 10 centimes, ou un demi pour cent du total.
export function ecartSignificatif(ecartTotal, totalHT) {
  const e = Number(ecartTotal);
  if (ecartTotal == null || !Number.isFinite(e)) return false;
  return Math.abs(e) > Math.max(0.1, (Number(totalHT) || 0) * 0.005);
}
