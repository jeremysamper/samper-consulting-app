// ─────────────────────────────────────────────────────────────────────────────
// Chiffres de la branche Hôtel sur une période, sans React ni service (testé
// par node --test, serieHotel.test.mjs). hotelData.js lit la configuration de
// Supabase à son chargement : ses calculs ne se testent pas sous Node. Le
// calcul du registre du mois vit donc ici, et statsMois (hotelData.js)
// l'appelle : un seul calcul pour le registre et le module Statistiques.
//
// Registre (statsPeriode, la règle de statsMois sur des bornes libres) :
// nuitées chambres des séjours en maison ou partis, nuitées personnes
// (occupants, sinon personnes du séjour), arrivées, taux d'occupation
// (nuitées sur chambres actives fois jours), durée moyenne des séjours
// arrivés, prix moyen par nuitée vendue (lignes nuitée), taxes, nuitées et
// arrivées par pays de domicile. Les quotients sans dénominateur valent null.
//
// Par tranche (serieHotel), en plus du registre :
//   demandes  : créées (jour de création), faites (jour où elles sont
//               faites), délai moyen en heures de la création à la fin ;
//   technique : ordres de travail terminés, minutes et coût saisis ;
//   activités : personnes inscrites (inscriptions non annulées) et places des
//               activités non annulées, au jour de l'activité ;
//   étages    : chambres passées à « propre » dans le journal du ménage ;
//   linge     : pièces sorties sales et rentrées propres (totauxLinge).
// Les jours sont ceux de Zurich.
// ─────────────────────────────────────────────────────────────────────────────

import { zurichAjouterJours, zurichDateHeure } from '../../utils/zurichTime.js';

const sejourCompte = (s) => s.statut === 'en_maison' || s.statut === 'parti';
const personnesDe = (s) => (s.nbAdultes || 0) + (s.nbEnfants || 0);
const nuitsEntre = (a, d) => Math.max(0, Math.round((Date.parse(`${d}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000));
const joursEntre = (debut, fin) => nuitsEntre(debut, fin) + 1;

// Nuits d'un séjour [arrivee, depart[ qui tombent dans [debut, fin].
export function nuitsDansPeriode(arrivee, depart, debut, fin) {
  const finExclue = zurichAjouterJours(fin, 1);
  const a = arrivee > debut ? arrivee : debut;
  const d = depart < finExclue ? depart : finExclue;
  return d > a ? nuitsEntre(a, d) : 0;
}

export function statsPeriode({ sejours = [], chambres = [], occupants = [], lignes = [], debut, fin }) {
  const duPas = sejours.filter((s) => sejourCompte(s) && s.arrivee <= fin && s.depart > debut);
  const nuiteesChambres = duPas.reduce((n, s) => n + nuitsDansPeriode(s.arrivee, s.depart, debut, fin), 0);
  const arrivees = duPas.filter((s) => s.arrivee >= debut && s.arrivee <= fin);
  const ids = new Set(duPas.map((s) => s.id));
  const parSejour = new Map();
  for (const o of occupants) {
    if (!ids.has(o.sejourId)) continue;
    parSejour.set(o.sejourId, [...(parSejour.get(o.sejourId) || []), o]);
  }
  let nuiteesPersonnes = 0;
  let arriveesPersonnes = 0;
  const parPays = new Map();
  const compter = (pays, nuitees, arriveesN) => {
    const cle = (pays || '').trim() || 'Non renseigné';
    const e = parPays.get(cle) || { pays: cle, arrivees: 0, nuitees: 0 };
    e.nuitees += nuitees;
    e.arrivees += arriveesN;
    nuiteesPersonnes += nuitees;
    arriveesPersonnes += arriveesN;
    parPays.set(cle, e);
  };
  for (const s of duPas) {
    const liste = parSejour.get(s.id);
    if (liste && liste.length) {
      for (const o of liste) {
        const arr = o.arrivee || s.arrivee;
        compter(o.domicilePays || o.nationalite, nuitsDansPeriode(arr, o.depart || s.depart, debut, fin), arr >= debut && arr <= fin ? 1 : 0);
      }
    } else {
      const p = personnesDe(s) || 1;
      compter('', nuitsDansPeriode(s.arrivee, s.depart, debut, fin) * p, s.arrivee >= debut && s.arrivee <= fin ? p : 0);
    }
  }
  const chambresActives = chambres.filter((c) => c.actif).length;
  const capacite = chambresActives * joursEntre(debut, fin);
  const lignesDuPas = lignes.filter((l) => l.jour >= debut && l.jour <= fin);
  const caNuitees = lignesDuPas.filter((l) => l.type === 'nuitee').reduce((n, l) => n + l.montant, 0);
  const taxes = { sejour: 0, hebergement: 0 };
  for (const l of lignesDuPas) {
    if (l.type === 'taxe_sejour') taxes.sejour += l.montant;
    if (l.type === 'taxe_hebergement') taxes.hebergement += l.montant;
  }
  return {
    nuiteesChambres, nuiteesPersonnes, arrivees: arrivees.length, arriveesPersonnes,
    nuitsArrivees: arrivees.reduce((n, s) => n + nuitsEntre(s.arrivee, s.depart), 0),
    tauxOccupation: capacite ? nuiteesChambres / capacite : null, chambresActives,
    dureeMoyenne: arrivees.length ? arrivees.reduce((n, s) => n + nuitsEntre(s.arrivee, s.depart), 0) / arrivees.length : null,
    prixMoyen: nuiteesChambres ? caNuitees / nuiteesChambres : null, caNuitees,
    taxes, parPays: [...parPays.values()].sort((a, b) => b.nuitees - a.nuitees || a.pays.localeCompare(b.pays, 'fr')),
  };
}

// ── Lot 13 du panel : classes de la taxe de séjour et décompte du mois ──────

// Âge révolu d'une personne à une date donnée, ou null sans date de naissance.
// (Rangé ici depuis le lot 13 ; hotelData.js le réexporte.)
export function ageAu(dateNaissance, jour) {
  if (!dateNaissance || !jour) return null;
  const [ny, nm, nd] = dateNaissance.split('-').map(Number);
  const [jy, jm, jd] = jour.split('-').map(Number);
  let age = jy - ny;
  if (jm < nm || (jm === nm && jd < nd)) age -= 1;
  return age;
}

// Classe d'une personne pour la taxe de séjour, à un jour donné (le jour
// d'arrivée du séjour) : 'exonere_motif' (case exonéré cochée), 'exonere_age'
// (sous l'âge d'exonération), 'enfant' (sous l'âge du tarif réduit), sinon
// 'adulte', âge inconnu compris. Seule règle : la note (lignesAutomatiques)
// et le décompte de la commune la lisent toutes deux.
export function classeTaxe(occupant, jourReference, reglages) {
  if (occupant?.exonereTaxe) return 'exonere_motif';
  const r = reglages || {};
  const age = ageAu(occupant?.dateNaissance, jourReference);
  if (age != null && age < r.ageEnfantExonere) return 'exonere_age';
  if (age != null && age < r.ageEnfantReduit) return 'enfant';
  return 'adulte';
}

export const MOTIF_NON_RENSEIGNE = 'Motif non renseigné';
const auCentime = (x) => Math.round(x * 100) / 100;
const cleMotif = (m) => String(m || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');

// Décompte de la taxe de séjour d'une période : mêmes séjours que le registre
// (en maison ou partis), nuits de chaque personne dans la période, âge au
// jour d'arrivée du séjour, mêmes replis que statsPeriode (dates de la
// personne, sinon du séjour ; séjour sans personne inscrite compté d'après
// ses adultes et ses enfants, enfants au tarif réduit, ou pour un adulte sans
// nombre). La somme des classes égale donc toujours statsPeriode(...).
// nuiteesPersonnes. Taxes dues aux taux des réglages ; taxes des notes : les
// lignes taxe_sejour et taxe_hebergement datées dans la période. Écart =
// taxes des notes moins taxes dues ; il se montre, il ne se corrige pas.
export function decompteTaxe({ sejours = [], occupants = [], lignes = [], reglages, debut, fin }) {
  const r = reglages || {};
  const duPas = sejours.filter((s) => sejourCompte(s) && s.arrivee <= fin && s.depart > debut);
  const ids = new Set(duPas.map((s) => s.id));
  const parSejour = new Map();
  for (const o of occupants) {
    if (!ids.has(o.sejourId)) continue;
    parSejour.set(o.sejourId, [...(parSejour.get(o.sejourId) || []), o]);
  }
  const nuitees = { adultes: 0, enfants: 0, exonereAge: 0, exonereMotif: 0 };
  const motifs = new Map();
  const sansInscrit = { sejours: 0, nuitees: 0 };
  for (const s of duPas) {
    const liste = parSejour.get(s.id);
    if (liste && liste.length) {
      for (const o of liste) {
        const n = nuitsDansPeriode(o.arrivee || s.arrivee, o.depart || s.depart, debut, fin);
        const classe = classeTaxe(o, s.arrivee, r);
        if (classe === 'adulte') nuitees.adultes += n;
        else if (classe === 'enfant') nuitees.enfants += n;
        else if (classe === 'exonere_age') nuitees.exonereAge += n;
        else {
          nuitees.exonereMotif += n;
          const cle = cleMotif(o.exonereMotif);
          const e = motifs.get(cle) || { motif: cle ? String(o.exonereMotif).trim().replace(/\s+/g, ' ') : MOTIF_NON_RENSEIGNE, nuitees: 0 };
          e.nuitees += n;
          motifs.set(cle, e);
        }
      }
    } else {
      const n = nuitsDansPeriode(s.arrivee, s.depart, debut, fin);
      const adultes = personnesDe(s) ? (s.nbAdultes || 0) : 1;
      const enfants = personnesDe(s) ? (s.nbEnfants || 0) : 0;
      nuitees.adultes += n * adultes;
      nuitees.enfants += n * enfants;
      if (n > 0) { sansInscrit.sejours += 1; sansInscrit.nuitees += n * (adultes + enfants); }
    }
  }
  const total = nuitees.adultes + nuitees.enfants + nuitees.exonereAge + nuitees.exonereMotif;
  const tauxAdulte = Number(r.taxeSejourAdulte) || 0;
  const tauxEnfant = Number(r.taxeSejourEnfant) || 0;
  const tauxHebergement = Number(r.taxeHebergement) || 0;
  const assujetties = nuitees.adultes + nuitees.enfants;
  const du = {
    adultes: auCentime(nuitees.adultes * tauxAdulte),
    enfants: auCentime(nuitees.enfants * tauxEnfant),
    sejour: auCentime(nuitees.adultes * tauxAdulte + nuitees.enfants * tauxEnfant),
    hebergement: auCentime(assujetties * tauxHebergement),
  };
  const notes = { sejour: 0, hebergement: 0 };
  for (const l of lignes) {
    if (!(l.jour >= debut && l.jour <= fin)) continue;
    if (l.type === 'taxe_sejour') notes.sejour += l.montant;
    if (l.type === 'taxe_hebergement') notes.hebergement += l.montant;
  }
  notes.sejour = auCentime(notes.sejour);
  notes.hebergement = auCentime(notes.hebergement);
  return {
    nuitees: { ...nuitees, assujetties, total },
    motifs: [...motifs.values()].sort((a, b) => b.nuitees - a.nuitees || a.motif.localeCompare(b.motif, 'fr')),
    sansInscrit,
    taux: { adulte: tauxAdulte, enfant: tauxEnfant, hebergement: tauxHebergement },
    du,
    notes,
    ecart: { sejour: auCentime(notes.sejour - du.sejour), hebergement: auCentime(notes.hebergement - du.hebergement) },
  };
}

// État de l'écran du registre : 'reserve' sans le droit Modifier (les
// lectures des personnes et des lignes ne sont pas lancées), 'erreur' si une
// lecture a échoué ou si la table manque, 'pret' quand les trois lectures sont
// abouties, 'chargement' sinon. Hors 'pret', le décompte ne s'affiche pas.
export function etatRegistre({ peutGerer, statuts = [] } = {}) {
  if (!peutGerer) return 'reserve';
  if (statuts.some((x) => x === 'error' || x === 'absent')) return 'erreur';
  if (statuts.length && statuts.every((x) => x === 'ready')) return 'pret';
  return 'chargement';
}

const jourDe = (iso) => (iso ? zurichDateHeure(iso).jour : null);
const dans = (jour, t) => !!jour && jour >= t.debut && jour <= t.fin;

//   donnees : { sejours, chambres, occupants, lignes, demandes, ordres,
//               activites, inscriptions, journalChambres, linge }
export function serieHotel(donnees, tranches) {
  const d = donnees || {};
  const demandes = (d.demandes || []).map((x) => ({ ...x, jourCree: jourDe(x.createdAt), jourFaite: x.statut === 'faite' ? jourDe(x.faiteAt) : null }));
  const ordres = (d.ordres || []).filter((o) => o.statut === 'termine').map((o) => ({ ...o, jour: jourDe(o.termineAt) }));
  const activites = (d.activites || []).filter((a) => !a.annulee).map((a) => ({ ...a, jour: jourDe(a.debut) }));
  const parActivite = new Map(activites.map((a) => [a.id, a]));
  const inscriptions = (d.inscriptions || []).filter((i) => i.statut !== 'annule' && parActivite.has(i.activiteId));
  const faites = (d.journalChambres || []).filter((j) => j.nouveau === 'propre').map((j) => jourDe(j.at));
  return (tranches || []).map((t) => {
    const creees = demandes.filter((x) => dans(x.jourCree, t));
    const finies = demandes.filter((x) => dans(x.jourFaite, t));
    const delais = finies.map((x) => (Date.parse(x.faiteAt) - Date.parse(x.createdAt)) / 3600000).filter((h) => Number.isFinite(h) && h >= 0);
    const ot = ordres.filter((o) => dans(o.jour, t));
    const acts = activites.filter((a) => dans(a.jour, t));
    const idsActs = new Set(acts.map((a) => a.id));
    const linge = (d.linge || []).filter((m) => dans(m.jour, t));
    return {
      debut: t.debut,
      fin: t.fin,
      registre: statsPeriode({ ...d, debut: t.debut, fin: t.fin }),
      demandes: { creees: creees.length, faites: finies.length, heuresTotal: delais.reduce((s, h) => s + h, 0), nbDelais: delais.length },
      technique: { termines: ot.length, minutes: ot.reduce((s, o) => s + (Number(o.tempsMinutes) || 0), 0), cout: ot.reduce((s, o) => s + (Number(o.cout) || 0), 0) },
      activites: {
        nombre: acts.length,
        places: acts.reduce((s, a) => s + (Number(a.places) || 0), 0),
        inscrits: inscriptions.filter((i) => idsActs.has(i.activiteId)).reduce((s, i) => s + (Number(i.nbPersonnes) || 0), 0),
      },
      chambresFaites: faites.filter((j) => dans(j, t)).length,
      linge: {
        sale: linge.filter((m) => m.sens === 'sale').reduce((s, m) => s + m.quantite, 0),
        propre: linge.filter((m) => m.sens === 'propre').reduce((s, m) => s + m.quantite, 0),
      },
    };
  });
}
