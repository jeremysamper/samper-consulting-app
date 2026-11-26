import { REGLAGES_MODULES } from '../demo/donnees/reglages.js';
import { ETABLISSEMENT } from '../demo/donnees/base.js';
import { demandesOuvertesAuxHotes } from './regles.js';

// Demande par QR, adresse de la démo publique (/chambre/demo) : la chambre 201
// de la démo et ses demandes ouvertes, un envoi simulé et un suivi qui passe
// de « Reçue » à « Prise en charge » au deuxième relevé. Rien ne part vers la
// base. Mêmes réponses que demande_chambre_ouvrir, _envoyer et _suivi.

// Les six libellés ouverts aux hôtes, comme demandes_qr_parametres de la démo
// de l'app (src/demo/donnees/hotel.js).
export const LIBELLES_OUVERTS_DEMO = [
  'Oreillers en plus', 'Serviettes en plus', 'Peignoirs pour le spa', 'Lit bébé', 'Taxi à commander', 'Départ tardif',
];

const categories = REGLAGES_MODULES.find((r) => r.module === 'demandes')?.config?.categories || [];
const envoyees = [];
const attendre = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

export async function ouvrirDemo() {
  await attendre(300);
  return {
    etablissement: ETABLISSEMENT.nom,
    chambre: '201',
    demandes: demandesOuvertesAuxHotes(categories, LIBELLES_OUVERTS_DEMO).map((c) => ({ libelle: c.libelle })),
  };
}

export async function envoyerDemo({ libelle }) {
  await attendre(600);
  const cat = demandesOuvertesAuxHotes(categories, LIBELLES_OUVERTS_DEMO)
    .find((c) => c.libelle.toLowerCase() === String(libelle || '').trim().toLowerCase());
  if (!cat) return { erreur: 'demande' };
  if (envoyees.some((d) => d.libelle === cat.libelle && (d.etat === 'recue' || d.etat === 'prise'))) {
    return { ok: true, deja: true };
  }
  envoyees.unshift({ libelle: cat.libelle, etat: 'recue', at: new Date().toISOString(), releves: 0 });
  return { ok: true };
}

export async function suiviDemo() {
  await attendre(200);
  envoyees.forEach((d) => {
    d.releves += 1;
    if (d.etat === 'recue' && d.releves >= 2) d.etat = 'prise';
  });
  return { demandes: envoyees.slice(0, 10).map(({ libelle, etat, at }) => ({ libelle, etat, at })) };
}
