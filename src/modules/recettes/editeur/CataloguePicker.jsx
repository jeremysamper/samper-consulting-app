import React from 'react';
import { Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { normalizeSearch } from '../../../utils/searchText.js';

// ─────────────────────────────────────────────────────────────────────────────
// Choix dans le catalogue produits, pour l'éditeur de fiches : un produit pour
// une ligne (mode « ligne »), ou plusieurs lignes d'un coup (mode « multi »).
// Repris de l'éditeur des Outils consultant, sans les prix : ils se lisent et
// se tiennent dans le Chiffrage.
// ─────────────────────────────────────────────────────────────────────────────

export default function CataloguePicker({ catalogue = [], mode = 'ligne', rechercheInitiale = '', onChoisir, onAjouter, onClose }) {
  const multi = mode === 'multi';
  const [recherche, setRecherche] = React.useState(rechercheInitiale);
  const [categorie, setCategorie] = React.useState('Tous');
  const [choisis, setChoisis] = React.useState(() => new Set());

  const categories = ['Tous', ...new Set(catalogue.map(p => p.categorie).filter(Boolean))];
  const q = normalizeSearch(recherche);
  const visibles = catalogue
    .filter(p => (categorie === 'Tous' || p.categorie === categorie) && (q === '' || normalizeSearch(p.nom).includes(q)))
    .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')));

  const basculer = (id) => setChoisis(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pied = (
    <>
      <span style={{ ...fst.remarque, marginRight: 'auto' }}>
        {visibles.length} produit{visibles.length > 1 ? 's' : ''}
        {multi && choisis.size > 0 && `, ${choisis.size} choisi${choisis.size > 1 ? 's' : ''}`}
      </span>
      <button type="button" style={fst.secondaire} onClick={onClose}>Annuler</button>
      {multi && (
        <button
          type="button"
          style={{ ...fst.primaire, opacity: choisis.size === 0 ? 0.5 : 1 }}
          disabled={choisis.size === 0}
          onClick={() => onAjouter([...choisis].map(id => catalogue.find(p => p.id === id)).filter(Boolean))}
        >Ajouter{choisis.size > 0 ? ` (${choisis.size})` : ''}</button>
      )}
    </>
  );

  return (
    <Fenetre
      id="fiche-catalogue"
      titre={multi ? 'Ajouter depuis le catalogue' : 'Choisir un produit'}
      sousTitre={multi ? 'Cochez les produits, puis Ajouter.' : 'Le produit choisi remplace le lien de cette ligne.'}
      onClose={onClose}
      largeur={640}
      pied={pied}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          autoFocus
          type="text"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher un produit…"
          aria-label="Rechercher un produit"
          style={{ ...fst.champ, flex: '1 1 200px', width: 'auto' }}
        />
        <select value={categorie} onChange={e => setCategorie(e.target.value)} style={{ ...fst.champ, flex: '0 1 200px', width: 'auto' }} aria-label="Catégorie">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibles.length === 0 ? (
          <div style={{ ...fst.remarque, padding: 24, textAlign: 'center' }}>
            {catalogue.length === 0 ? 'Catalogue vide. Ajoutez des produits dans le module Catalogue.' : 'Aucun produit ne correspond à votre recherche.'}
          </div>
        ) : visibles.map((p) => {
          const coche = multi && choisis.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => (multi ? basculer(p.id) : onChoisir(p))}
              style={{ ...ligne, background: coche ? 'var(--accent-light)' : 'transparent' }}
            >
              {multi && <input type="checkbox" checked={coche} readOnly tabIndex={-1} style={{ width: 18, height: 18, accentColor: 'var(--accent)', flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {p.categorie}{p.fournisseurNom ? `, ${p.fournisseurNom}` : ''}{p.uniteRef ? `, par ${p.uniteRef}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Fenetre>
  );
}

const ligne = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 4px', minHeight: 48,
  borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0, boxSizing: 'border-box',
};
