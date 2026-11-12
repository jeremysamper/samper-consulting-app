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
