import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { toutesLesPages } from '../../utils/lirePages.js';
import { JOURS_PAR_DEFAUT, debutPeriode, effetsSurFiches, haussesPrix } from './haussesPrix.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lecture des hausses de prix d'un établissement (haussesPrix.js), en lecture
// seule, sans table de plus :
//   1. ses produits (listProduits, lecture en cache du pont) ;
//   2. les produits qui ont un relevé de prix dans la période ;
//   3. tout l'historique de ces produits seulement (le prix d'avant la période
//      peut être ancien) ;
//   4. ses fiches (listRecettes), seulement s'il y a au moins une hausse.
// Par lots de 100 identifiants : un filtre .in() plus long dépasserait la
// longueur d'URL que le serveur accepte (même découpe que les Statistiques).
// La garde est posée par l'appelant (`enabled`) : rien n'est lu sans elle.
// ─────────────────────────────────────────────────────────────────────────────

const LOT = 100;

const enLots = (ids) => {
  const lots = [];
  for (let i = 0; i < ids.length; i += LOT) lots.push(ids.slice(i, i + LOT));
  return lots;
};

async function pages(requete) {
  const { data, error } = await toutesLesPages(requete);
  if (error) throw error;
  return data || [];
}

export async function lireHaussesPrix(etabId, aujourdhui, jours = JOURS_PAR_DEFAUT) {
  const db = dbService.getDb();
  if (!db?.listProduits || !db?.listRecettes) throw new Error('Lecture indisponible.');
  const produits = await db.listProduits(etabId, { strict: true });
  const debut = debutPeriode(aujourdhui, jours);

  const recents = await Promise.all(enLots((produits || []).map((p) => p.id)).map((lot) => pages((de, a) => supabase
    .from('produit_prix_historique').select('id, produit_id')
    .in('produit_id', lot).gte('releve_le', debut).order('id').range(de, a))));
  const candidats = [...new Set(recents.flat().map((x) => x.produit_id))];
  if (!candidats.length) return [];

  const lignes = (await Promise.all(enLots(candidats).map((lot) => pages((de, a) => supabase
    .from('produit_prix_historique')
    .select('id, produit_id, fournisseur_id, prix_unitaire, unite_cond, releve_le, created_at, fournisseurs(nom)')
    .in('produit_id', lot).order('releve_le').order('id').range(de, a))))).flat();
  const releves = lignes.map((r) => ({
    id: r.id, produitId: r.produit_id, fournisseurId: r.fournisseur_id, fournisseurNom: r.fournisseurs?.nom || '',
    prixUnitaire: r.prix_unitaire, uniteCond: r.unite_cond, releveLe: r.releve_le, createdAt: r.created_at,
  }));

  const hausses = haussesPrix(releves, produits, { aujourdhui, jours });
  if (!hausses.length) return [];
  const recettes = await db.listRecettes(etabId, { strict: true });
  return hausses.map((h) => ({ ...h, ...effetsSurFiches(h, recettes, produits) }));
}

// { statut: 'absent' | 'chargement' | 'pret' | 'erreur', hausses }
// Une relecture en échec garde la liste déjà lue pour le même établissement et
// le même jour ; une lecture jamais aboutie le dit ('erreur'), jamais une
// liste vide.
export function useHaussesPrix({ etabId, aujourdhui, enabled, jours = JOURS_PAR_DEFAUT }) {
  const cle = enabled && etabId && aujourdhui ? `${etabId}|${aujourdhui}|${jours}` : null;
  const [etat, setEtat] = useState({ cle: null, statut: 'absent', hausses: [] });

  useEffect(() => {
    if (!cle) return undefined;
    let vivant = true;
    lireHaussesPrix(etabId, aujourdhui, jours)
      .then((hausses) => { if (vivant) setEtat({ cle, statut: 'pret', hausses }); })
      .catch((err) => {
        console.warn('[useHaussesPrix] lecture en échec', err);
        if (vivant) setEtat((prec) => (prec.cle === cle && prec.statut === 'pret' ? prec : { cle, statut: 'erreur', hausses: [] }));
      });
    return () => { vivant = false; };
  }, [cle, etabId, aujourdhui, jours]);

  if (!cle) return { statut: 'absent', hausses: [] };
  if (etat.cle !== cle) return { statut: 'chargement', hausses: [] };
  return { statut: etat.statut, hausses: etat.hausses };
}
