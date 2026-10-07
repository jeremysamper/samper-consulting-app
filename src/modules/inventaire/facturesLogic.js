// ─────────────────────────────────────────────────────────────────────────────
// Onglet « Factures » de l'inventaire, sans React.
//
// Les factures d'un périmètre sont rangées par période d'inventaire : une
// période se clôt le jour d'un inventaire du périmètre, la suivante démarre
// le lendemain. Mêmes bornes que l'onglet Achats (periodeInventaire), qui
// reprend les factures de chaque période pour calculer la consommation :
//   - période close par l'inventaire du jour J : du lendemain de l'inventaire
//     précédent jusqu'à J inclus ;
//   - premier inventaire du périmètre : depuis le 1er du mois de J ;
//   - après le dernier inventaire : période « en cours », close au prochain.
// ─────────────────────────────────────────────────────────────────────────────

export const MODES_REGLEMENT = [
  { id: 'virement', label: 'Virement' },
  // « Carte bancaire » et pas « Carte » : le glossaire traduit « Carte » par
  // « Menu » (la carte du restaurant).
  { id: 'carte', label: 'Carte bancaire' },
  { id: 'especes', label: 'Espèces' },
  { id: 'prelevement', label: 'Prélèvement' },
];
export const libelleMode = (id) => MODES_REGLEMENT.find(m => m.id === id)?.label || '';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const premierDuMois = (iso) => `${iso.slice(0, 7)}-01`;

// Périodes du périmètre, la plus récente d'abord. `datesInventaires` : dates
// des inventaires du périmètre, dans n'importe quel ordre, doublons compris
// (deux comptages le même jour ne font qu'une borne).
export function periodesFactures(datesInventaires) {
  const dates = Array.from(new Set((datesInventaires || []).filter(d => ISO.test(String(d || ''))))).sort();
  if (!dates.length) {
    return [{ id: 'en-cours', ouverte: true, debut: null, debutInclus: false, fin: null }];
  }
  const periodes = [{ id: 'en-cours', ouverte: true, debut: dates[dates.length - 1], debutInclus: false, fin: null }];
  for (let k = dates.length - 1; k >= 1; k -= 1) {
    periodes.push({ id: `p-${dates[k]}`, debut: dates[k - 1], debutInclus: false, fin: dates[k] });
  }
  periodes.push({ id: `p-${dates[0]}`, premiere: true, debut: premierDuMois(dates[0]), debutInclus: true, fin: dates[0] });
  periodes.push({ id: 'anterieures', anterieures: true, debut: null, debutInclus: false, fin: premierDuMois(dates[0]), finExclue: true });
  return periodes;
}

export function dansPeriodeFacture(date, p) {
  if (!date) return false;
  if (p.debut && (p.debutInclus ? date < p.debut : date <= p.debut)) return false;
  if (p.fin && (p.finExclue ? date >= p.fin : date > p.fin)) return false;
  return true;
}

// Range les factures : Map id de période -> factures, plus 'sans-date'.
export function rangerParPeriode(factures, periodes) {
  const groupes = new Map(periodes.map(p => [p.id, []]));
  groupes.set('sans-date', []);
  (factures || []).forEach(f => {
    if (!f.dateDocument) { groupes.get('sans-date').push(f); return; }
    const p = periodes.find(x => dansPeriodeFacture(f.dateDocument, x));
    groupes.get(p ? p.id : 'en-cours').push(f);
  });
  return groupes;
}

// 'reglee' | 'en_retard' | 'a_regler'. `aujourdhui` : date du jour à Zurich.
export function statutPaiement(f, aujourdhui) {
  if (f.regleLe) return 'reglee';
  if (f.dateEcheance && aujourdhui && f.dateEcheance < aujourdhui) return 'en_retard';
  return 'a_regler';
}

export function joursEntre(debut, fin) {
  if (!ISO.test(String(debut || '')) || !ISO.test(String(fin || ''))) return 0;
  return Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${debut}T12:00:00Z`)) / 86400000);
}

// Totaux d'une liste de factures. Les montants sont TTC (le montant à payer) ;
// une facture dont le TTC n'est pas connu n'entre dans aucune somme, elle est
// comptée à part (sansTTC) pour que le total ne paraisse pas complet.
export function totauxFactures(factures, aujourdhui) {
  const t = {
    n: 0, total: 0, sansTTC: 0,
    aRegler: { n: 0, montant: 0 },
    enRetard: { n: 0, montant: 0 },
    reglees: { n: 0, montant: 0 },
  };
  (factures || []).forEach(f => {
    t.n += 1;
    const m = f.totalTTC != null && Number.isFinite(Number(f.totalTTC)) ? Number(f.totalTTC) : null;
    if (m == null) t.sansTTC += 1;
    else t.total += m;
    const s = statutPaiement(f, aujourdhui);
    const cible = s === 'reglee' ? t.reglees : t.aRegler;
    cible.n += 1;
    if (m != null) cible.montant += m;
    if (s === 'en_retard') {
      t.enRetard.n += 1;
      if (m != null) t.enRetard.montant += m;
    }
  });
  return t;
}

// ── Dates en toutes lettres ──
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const partie = (iso) => ({ j: Number(iso.slice(8, 10)), m: Number(iso.slice(5, 7)) - 1, a: iso.slice(0, 4) });
const jour = (j) => (j === 1 ? '1er' : String(j));

// « 2 octobre 2026 », « 1er août 2026 » ; sans l'année si `sansAnnee`.
export function dateLongue(iso, { sansAnnee = false } = {}) {
  if (!ISO.test(String(iso || ''))) return '';
  const { j, m, a } = partie(iso);
  return `${jour(j)} ${MOIS[m]}${sansAnnee ? '' : ` ${a}`}`;
}

// « du 3 au 31 octobre 2026 », « du 11 août au 2 octobre 2026 »,
// « du 28 décembre 2025 au 31 janvier 2026 ».
export function intervalleLong(debut, fin) {
  if (!ISO.test(String(debut || '')) || !ISO.test(String(fin || ''))) return '';
  const d = partie(debut);
  const f = partie(fin);
  if (debut === fin) return `le ${dateLongue(fin)}`;
  if (d.a !== f.a) return `du ${dateLongue(debut)} au ${dateLongue(fin)}`;
  if (d.m !== f.m) return `du ${dateLongue(debut, { sansAnnee: true })} au ${dateLongue(fin)}`;
  return `du ${jour(d.j)} au ${dateLongue(fin)}`;
}

export function lendemainIso(iso) {
  if (!ISO.test(String(iso || ''))) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
