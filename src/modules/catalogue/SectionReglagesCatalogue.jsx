import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { BASES_UNITE } from '../../utils/reglagesModules.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { EtatModule, ListeTextes, st as stm } from '../compte/sections/reglagesModulesUi.jsx';
import { CATEGORIES_PRODUITS } from './categoriesCatalogue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Catalogue » de la page des réglages (plan 15, lot 2),
// reglages_modules, module 'catalogue' :
//   - catégories de la maison : vide = les catégories de l'app ;
//   - unités de la maison : un multiple d'une unité de référence
//     (bouteille 75 cl = 750 ml), proposées au conditionnement d'un produit.
// produits.categorie reste un texte libre : un produit garde sa catégorie
// même si elle sort de la liste. Écriture : direction de la maison (RLS).
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionReglagesCatalogue({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'catalogue');
  const [enCours, setEnCours] = React.useState(false);
  const [unite, setUnite] = React.useState({ code: '', base: 'ml', facteur: '' });
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (changes) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer(changes);
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };
  const propres = reglages.categories.length > 0;

  const ajouterUnite = async () => {
    const code = unite.code.trim();
    const facteur = Number(String(unite.facteur).replace(',', '.'));
    if (!code || code.length > 20) { notify("Nommez l'unité en 20 caractères au plus.", 'warning'); return; }
    if (!Number.isFinite(facteur) || facteur <= 0) { notify('Indiquez ce que contient une unité.', 'warning'); return; }
    if (reglages.unites.some((u) => u.code.toLowerCase() === code.toLowerCase())) { notify('Cette unité existe déjà.', 'warning'); return; }
    if (await ecrire({ unites: [...reglages.unites, { code, base: unite.base, facteur }] })) setUnite({ code: '', base: unite.base, facteur: '' });
  };

  return (
    <div style={ui.liste} data-section-reglages="catalogue">
      <Ligne colonne titre="Catégories de produits" aide={propres ? 'Les catégories de la maison, proposées dans la fiche produit et le filtre.' : "Aucune catégorie propre : la maison utilise les catégories de l'app."}>
        {propres ? (
          <>
            <ListeTextes label="Nouvelle catégorie" valeurs={reglages.categories} max={40} maxLen={60} placeholder="Produits du lac"
              desactive={enCours} onChange={(categories) => ecrire({ categories })} />
            <div style={ui.pied}>
              <Btn variant="ghost" disabled={enCours} style={ui.btn44} onClick={() => ecrire({ categories: [] })}>Reprendre les catégories de l'app</Btn>
            </div>
          </>
        ) : (
          <div style={ui.pied}>
            <Btn variant="primary" disabled={enCours} style={ui.btn44} onClick={() => ecrire({ categories: CATEGORIES_PRODUITS })}>Créer les catégories de la maison</Btn>
          </div>
        )}
      </Ligne>
      <Ligne colonne derniere titre="Unités de la maison" aide="Une unité de la maison vaut un nombre de grammes, de millilitres ou de pièces. Au conditionnement d'un produit, elle est convertie tout de suite.">
        <div style={stm.liste}>
          {reglages.unites.length === 0 && <p style={stm.vide}>Aucune unité de la maison.</p>}
          {reglages.unites.map((u) => (
            <div key={u.code} style={stm.ligne} data-unite-maison="">
              <span style={stm.texte}>
                <span data-no-translate="">{u.code}</span>
                <span> = </span>
                <span data-no-translate="">{u.facteur}</span>{' '}
                <span>{BASES_UNITE.find((b) => b.id === u.base)?.label}</span>
              </span>
              <Btn variant="ghost" disabled={enCours} style={stm.btn44} onClick={() => ecrire({ unites: reglages.unites.filter((x) => x.code !== u.code) })}>Retirer</Btn>
            </div>
          ))}
          <div style={stm.ajout}>
            <input type="text" value={unite.code} maxLength={20} aria-label="Nom de l'unité" placeholder="bouteille 75 cl"
              onChange={(e) => setUnite({ ...unite, code: e.target.value })} style={stm.champ} />
            <input type="text" inputMode="decimal" value={unite.facteur} aria-label="Contenu d'une unité" placeholder="750"
              onChange={(e) => setUnite({ ...unite, facteur: e.target.value })} style={{ ...stm.champ, flex: '0 1 110px', width: 110 }} />
            <select value={unite.base} aria-label="Unité de référence" onChange={(e) => setUnite({ ...unite, base: e.target.value })} style={{ ...stm.champ, flex: '0 1 160px', width: 160 }}>
              {BASES_UNITE.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <Btn variant="primary" disabled={enCours || !unite.code.trim()} style={stm.btn44} onClick={ajouterUnite}>Ajouter</Btn>
          </div>
        </div>
      </Ligne>
    </div>
  );
}
