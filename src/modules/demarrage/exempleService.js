import { dbService } from '../../services/dbService.js';
import { supabase } from '../../services/supabase.js';
import { construireExemple } from './exemple.js';
import { inscrireRegistre, lireRegistre, marquerEtapes, retirerRegistre } from './demarrageService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Données d'exemple : chargées et effacées par les fonctions du pont
// (upsertRecette, upsertCarte, upsertProduit ; deleteRecette, deleteCarte,
// deleteProduit), chaque id inscrit au registre donnees_exemple.
//
// Charger : le registre d'abord. Une ligne écrite sans être inscrite ne
// s'effacerait plus ; un id inscrit sans ligne ne coûte rien à l'effacement.
// Effacer : les ids du registre seulement, jamais un filtre de nom. Une
// suppression refusée (RLS, ligne reliée ailleurs) ne lève pas toujours
// d'erreur : on relit ce qui reste, et seuls les ids partis quittent le
// registre.
// ─────────────────────────────────────────────────────────────────────────────

const LOT = 10;
const ORDRE_EFFACEMENT = ['cartes', 'recettes', 'produits'];

async function parLots(liste, ecrire) {
  let echecs = 0;
  for (let i = 0; i < liste.length; i += LOT) {
    const res = await Promise.allSettled(liste.slice(i, i + LOT).map(ecrire));
    res.forEach((r) => {
      if (r.status === 'rejected') { echecs += 1; console.error('[exemple]', r.reason); }
    });
  }
  return echecs;
}

function pont() {
  const db = dbService.getDb();
  if (!db) throw new Error('Connexion à la base indisponible.');
  return db;
}

export async function chargerExemple(etabId) {
  const db = pont();
  const { produits, recettes, carte } = construireExemple(etabId);
  await inscrireRegistre(etabId, [
    ...produits.map((p) => ({ table: 'produits', id: p.id })),
    ...recettes.map((r) => ({ table: 'recettes', id: r.id })),
    { table: 'cartes', id: carte.id },
  ]);
  // Produits avant recettes (les ingrédients pointent sur eux), carte en dernier.
  let echecs = await parLots(produits, (p) => db.upsertProduit(p));
  echecs += await parLots(recettes, (r) => db.upsertRecette(r));
  echecs += await parLots([carte], (c) => db.upsertCarte(c));
  await marquerEtapes(etabId, ['exemple']);
  return { echecs };
}

export async function effacerExemple(etabId) {
  const db = pont();
  const supprimer = { cartes: (id) => db.deleteCarte(id), recettes: (id) => db.deleteRecette(id), produits: (id) => db.deleteProduit(id) };
  const registre = await lireRegistre(etabId);
  let restes = 0;
  for (const table of ORDRE_EFFACEMENT) {
    const ids = registre.filter((l) => l.table_cible === table).map((l) => l.ligne_id);
    if (!ids.length) continue;
    await parLots(ids, supprimer[table]);
    const { data, error } = await supabase.from(table).select('id').in('id', ids);
    if (error) throw error;
    const encore = new Set((data || []).map((r) => r.id));
    await retirerRegistre(etabId, table, ids.filter((id) => !encore.has(id)));
    restes += encore.size;
  }
  return { restes };
}

// Modèles Excel servis depuis public/modeles/. Lus par fetch puis enregistrés :
// un simple lien de téléchargement passerait par le service worker comme une
// navigation et recevrait l'app à la place du fichier.
export async function telechargerModele(nom) {
  const reponse = await fetch(`/modeles/${nom}`);
  const type = reponse.headers.get('content-type') || '';
  if (!reponse.ok || type.includes('text/html')) throw new Error('Modèle introuvable. Réessayez plus tard.');
  const url = URL.createObjectURL(await reponse.blob());
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
