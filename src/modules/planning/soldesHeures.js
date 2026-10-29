// ─────────────────────────────────────────────────────────────────────────────
// Solde d'heures par personne : heures dues selon le contrat, heures faites,
// retards et jours d'absence, sur un mois civil ou une période.
//
// Pur, sans React ni base : Mon planning, les chiffres de la direction et la
// feuille « Soldes » de l'export salaires l'appellent tous. Testé par
// soldesHeures.test.mjs (node --test).
//
// Règle :
//   heures dues   = heures par semaine × taux / 100 ÷ 7, pour chaque jour de la
//                   période couvert par un contrat, sauf les jours d'absence
//                   créditée (congé, vacances, formation, jour férié) ;
//                   « absence » ne crédite pas ;
//   heures faites = la mesure du relevé CCNT : arrivée et départ pointés,
//                   pause déduite, coupures comprises ;
//   solde         = faites moins dues ; sans contrat sur la période, pas de
//                   solde (null), jamais 0 ;
//   retard        = arrivée pointée plus de 5 minutes après le début prévu.
// Les dates sont des jours ISO (heure de Zurich déjà appliquée par la base) :
// aucun calcul en millisecondes, un passage d'heure ne décale rien.
// ─────────────────────────────────────────────────────────────────────────────

export const MOTIFS_CREDITES = new Set(['conge', 'vacances', 'formation', 'ferie']);
export const SEUIL_RETARD_MIN = 5;

// Durée travaillée du relevé CCNT, en heures : fin moins début moins la pause,
// sans borne ni arrondi (l'affichage passe par formatDuree). null si une heure
// manque. Planning.jsx l'importe pour le relevé : une seule mesure.
export const calcHeures = (debut, fin, pause) => {
  if (!debut || !fin) return null;
  const [dh, dm] = debut.split(':').map(Number);
  const [fh, fm] = fin.split(':').map(Number);
  const total = (fh * 60 + fm) - (dh * 60 + dm) - (pause || 0);
  return total / 60;
};

const enMinutes = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Jours ISO de debut à fin inclus, comptés en jours UTC (pas d'heure locale).
const versNumero = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const versIso = (numero) => new Date(numero * 86400000).toISOString().slice(0, 10);

export function joursEntre(debut, fin) {
  const out = [];
  if (!debut || !fin || debut > fin) return out;
  const a = versNumero(debut);
  const b = versNumero(fin);
  for (let n = a; n <= b && out.length < 400; n += 1) out.push(versIso(n));
  return out;
}

// Premier et dernier jour d'un mois civil ('2026-10').
export function bornesMois(mois) {
  const [y, m] = mois.split('-').map(Number);
  const dernier = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { debut: `${mois}-01`, fin: `${mois}-${String(dernier).padStart(2, '0')}` };
}

// Période lue en cours de mois : du 1er à hier (une journée commencée n'est
// pas encore faite). Le 1er, le mois précédent en entier.
export function periodeEnCours(aujourdhui) {
  const numero = versNumero(aujourdhui);
  const hier = versIso(numero - 1);
  if (aujourdhui.endsWith('-01')) return { ...bornesMois(hier.slice(0, 7)), complet: true };
  return { debut: `${aujourdhui.slice(0, 7)}-01`, fin: hier, complet: false };
}

// Contrat qui couvre un jour ; s'il y en a deux, le plus récent.
export function contratDuJour(contrats, jour) {
  let retenu = null;
  for (const c of contrats || []) {
    if (!c.debut || c.debut > jour) continue;
    if (c.fin && c.fin < jour) continue;
    if (!retenu || c.debut > retenu.debut) retenu = c;
  }
  return retenu;
}

// Heures faites : même boucle que buildCCNTData du relevé.
export const heuresFaites = (shifts) => (shifts || []).reduce((t, s) => (
  s.pointageDebut && s.pointageFin ? t + (parseFloat(calcHeures(s.pointageDebut, s.pointageFin, s.pause)) || 0) : t
), 0);

// Minutes de retard d'un horaire pointé (0 si à l'heure, en avance, ou dans
// la tolérance de 5 minutes).
export function minutesRetard(s) {
  if (!s?.pointageDebut || !s?.debut) return 0;
  const ecart = enMinutes(s.pointageDebut) - enMinutes(s.debut);
  return ecart > SEUIL_RETARD_MIN ? ecart : 0;
}

export function retardsDe(shifts) {
  let nombre = 0;
  let minutes = 0;
  for (const s of shifts || []) {
    const m = minutesRetard(s);
    if (m > 0) { nombre += 1; minutes += m; }
  }
  return { nombre, minutes };
}

// Arrivées en retard d'un jour, par personne (le plus en retard d'abord).
export function retardsDuJour(shifts, jour) {
  const parPersonne = new Map();
  for (const s of shifts || []) {
    if (s.date !== jour) continue;
    const m = minutesRetard(s);
    if (m > 0) parPersonne.set(s.userId, (parPersonne.get(s.userId) || 0) + m);
  }
  return [...parPersonne.entries()]
    .map(([userId, minutes]) => ({ userId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

// Solde d'une personne sur [debut, fin]. contrats, shifts et absences peuvent
// porter toute l'équipe : seuls ceux de la personne comptent.
export function soldePersonne({ userId, debut, fin, contrats, shifts, absences }) {
  const jours = joursEntre(debut, fin);
  const siens = (shifts || []).filter(s => s.userId === userId && s.date >= debut && s.date <= fin);
  const sesContrats = (contrats || []).filter(c => c.profileId === userId);
  const sesAbsences = (absences || []).filter(a => a.userId === userId);

  const joursParMotif = {};
  let dues = 0;
  let joursCouverts = 0;
  let joursDus = 0;
  for (const jour of jours) {
    const motifs = new Set(sesAbsences.filter(a => a.dateDebut <= jour && a.dateFin >= jour).map(a => a.motif));
    motifs.forEach(m => { joursParMotif[m] = (joursParMotif[m] || 0) + 1; });
    const c = contratDuJour(sesContrats, jour);
    if (!c) continue;
    joursCouverts += 1;
    if ([...motifs].some(m => MOTIFS_CREDITES.has(m))) continue;
    joursDus += 1;
    dues += (Number(c.heuresSemaine) * Number(c.taux)) / 100 / 7;
  }

  const faites = heuresFaites(siens);
  const avecContrat = joursCouverts > 0;
  // Contrat montré (taux de l'export) : celui du dernier jour couvert.
  const dernierCouvert = [...jours].reverse().find(j => contratDuJour(sesContrats, j));
  return {
    userId,
    avecContrat,
    contrat: dernierCouvert ? contratDuJour(sesContrats, dernierCouvert) : null,
    joursDus,
    heuresDues: avecContrat ? dues : null,
    heuresFaites: faites,
    solde: avecContrat ? faites - dues : null,
    retards: retardsDe(siens),
    joursParMotif,
  };
}

// Solde d'un mois civil ('2026-10').
export const soldeMois = ({ mois, ...reste }) => soldePersonne({ ...bornesMois(mois), ...reste });

// Solde signé lisible : « +3 h 15 », « -1 h 05 », « 0 h ».
export function formatSolde(h) {
  if (h == null || !Number.isFinite(h)) return '';
  const minutes = Math.round(Math.abs(h) * 60);
  if (minutes === 0) return '0 h';
  const signe = h > 0 ? '+' : '-';
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${signe}${hh} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`;
}
