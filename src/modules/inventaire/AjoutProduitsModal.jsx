import React from 'react';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { cleProduit } from './inventaireLignes.js';
import ChoixZone from './ChoixZone.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { nomMaison } from './produitsMaison.js';

// Ajout de produits à l'inventaire, en masse, depuis le catalogue.
//
// Avant : un produit = une modale, six champs, un clic « Ajouter ». Monter un
// inventaire de 140 produits prenait une matinée. Ici on coche une catégorie
// entière ou quelques produits, et unité, catégorie et prix viennent du
// catalogue. Les produits déjà présents restent visibles mais grisés : on voit
// ce qui est déjà compté au lieu de se demander s'il manque.
//
// Les produits ajoutés d'un coup sont en général rangés au même endroit (on
// coche la chambre froide, puis l'économat) : une zone commune est proposée.
//
// Second onglet : les fiches du module Cartes & Recettes, ajoutées comme
// produits maison (prix = coût matière de la fiche, affiché avant l'ajout).
// Elles sont rangées par carte (Buffet PDJ, Beverage…) : « Tout cocher » sur
// une carte ajoute toutes ses recettes d'un coup. Une fiche présente sur deux
// cartes apparaît sous chacune, et n'est ajoutée qu'une fois.
//
// Props : catalogue, lignesExistantes, onAjouter(produits, nomsLibres, zone),
//         recettes, cartesParFiche (Map recetteId → [{ id, nom, rang }]),
//         infoFiche(recette) → texte, onAjouterFiches(recettes, zone), onClose

const HORS_CARTE = 'Fiches hors carte';

export default function AjoutProduitsModal({ catalogue, lignesExistantes, onAjouter, recettes, cartesParFiche, infoFiche, onAjouterFiches, onClose }) {
  const [source, setSource] = React.useState('catalogue');
  const [recherche, setRecherche] = React.useState('');
  const [coches, setCoches] = React.useState(() => new Set());
  const [ouvertes, setOuvertes] = React.useState(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [zone, setZone] = React.useState('');

  const dejaPresents = React.useMemo(
    () => new Set((lignesExistantes || []).map(l => cleProduit(l.produit))),
    [lignesExistantes],
  );
  const fichesPresentes = React.useMemo(
    () => new Set((lignesExistantes || []).map(l => l.recetteId).filter(Boolean)),
    [lignesExistantes],
  );

  const avecFiches = (recettes || []).length > 0 && typeof onAjouterFiches === 'function';
  const produitsCatalogue = React.useMemo(
    () => (catalogue || []).filter(p => p && p.nom && p.actif !== false),
    [catalogue],
  );
  // Les fiches passent par la même liste que le catalogue : nom d'inventaire,
  // catégorie de la fiche, coût matière en information.
  const elementsFiches = React.useMemo(() => (source === 'fiches' ? (recettes || []).flatMap(r => {
    const base = { nom: nomMaison(r), info: infoFiche ? infoFiche(r) : '', recette: r };
    const cartes = cartesParFiche?.get(r.id) || [];
    if (!cartes.length) return [{ ...base, id: 'fiche:' + r.id, categorie: HORS_CARTE, rang: Infinity }];
    return cartes.map(c => ({ ...base, id: `fiche:${c.id}:${r.id}`, categorie: c.nom, rang: c.rang }));
  }) : []), [source, recettes, cartesParFiche, infoFiche]);
  const actifs = source === 'fiches' ? elementsFiches : produitsCatalogue;

  const changerSource = (id) => {
    setSource(id);
    setCoches(new Set());
    setOuvertes(new Set());
  };

  const match = makeSearchMatcher(recherche);
  const visibles = actifs.filter(p => match(p.nom, p.categorie, p.fournisseurNom));

  const parCategorie = React.useMemo(() => {
    const m = new Map();
    visibles.forEach(p => {
      const c = p.categorie || 'Autres';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(p);
    });
    // Fiches : dans l'ordre des cartes, hors carte à la fin. Catalogue : alphabétique.
    const rang = (produits) => produits[0]?.rang ?? 0;
    return Array.from(m.entries()).sort((a, b) => (source === 'fiches' ? rang(a[1]) - rang(b[1]) : 0)
      || a[0].localeCompare(b[0], 'fr'));
  }, [visibles, source]);

  const selectionnable = (p) => !dejaPresents.has(cleProduit(p.nom)) && !(p.recette && fichesPresentes.has(p.recette.id));

  const basculer = (id) => setCoches(prev => {
    const suite = new Set(prev);
    if (suite.has(id)) suite.delete(id); else suite.add(id);
    return suite;
  });

  const basculerCategorie = (produits) => {
    const ids = produits.filter(selectionnable).map(p => p.id);
    const toutCoche = ids.length > 0 && ids.every(id => coches.has(id));
    setCoches(prev => {
      const suite = new Set(prev);
      ids.forEach(id => (toutCoche ? suite.delete(id) : suite.add(id)));
      return suite;
    });
  };

  const basculerOuverture = (cat) => setOuvertes(prev => {
    const suite = new Set(prev);
    if (suite.has(cat)) suite.delete(cat); else suite.add(cat);
    return suite;
  });

  // Nom tapé qui n'existe nulle part : on propose de l'ajouter hors catalogue.
  const nomLibre = source === 'catalogue' ? recherche.trim() : '';
  const nomLibreConnu = !nomLibre
    || dejaPresents.has(cleProduit(nomLibre))
    || actifs.some(p => cleProduit(p.nom) === cleProduit(nomLibre));

  const valider = async (libres = []) => {
    const choisis = actifs.filter(p => coches.has(p.id));
    if (!choisis.length && !libres.length) return;
    setBusy(true);
    try {
      if (source === 'fiches') {
        const parId = new Map(choisis.map(x => [x.recette.id, x.recette]));
        await onAjouterFiches(Array.from(parId.values()), zone);
      }
      else await onAjouter(choisis, libres, zone);
    } finally { setBusy(false); }
  };

  const nbCoches = source === 'fiches'
    ? new Set(actifs.filter(p => coches.has(p.id)).map(p => p.recette.id)).size
    : coches.size;
  // Pendant une recherche, on déplie tout : le résultat doit se voir sans clic.
  const estOuverte = (cat) => match.active || ouvertes.has(cat) || parCategorie.length === 1;

  return (
    <div className="modal-full-overlay" style={st.overlay} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal-full" style={st.panel}>
        <div style={st.header}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>Ajouter des produits</div>
            <div style={st.sousTitre}>
              {source === 'fiches'
                ? 'Cochez les préparations maison à compter : leur prix est le coût matière de la fiche.'
                : 'Cochez une catégorie entière ou quelques produits : unité et prix viennent du catalogue.'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={st.fermer} title="Fermer">✕</button>
        </div>

        {avecFiches && (
          <div style={{ padding: '10px 18px 0' }}>
            <SegmentedTabs
              size="sm"
              active={source}
              onChange={changerSource}
              tabs={[
                { id: 'catalogue', label: 'Catalogue' },
                { id: 'fiches', label: `Fiches recettes (${recettes.length})` },
              ]}
            />
          </div>
        )}
        <div style={{ padding: '12px 18px 8px' }}>
          <input
            type="search"
            autoFocus
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !nomLibreConnu && nbCoches === 0) { e.preventDefault(); valider([nomLibre]); }
            }}
            placeholder={source === 'fiches' ? `Rechercher parmi ${actifs.length} fiches recettes…` : `Rechercher parmi ${actifs.length} produits du catalogue…`}
            style={st.recherche}
          />
          {!nomLibreConnu && (
            <button type="button" style={st.libre} onClick={() => valider([nomLibre])} disabled={busy}>
              + Ajouter « {nomLibre} » hors catalogue
            </button>
          )}
        </div>

        <div style={st.liste}>
          {actifs.length === 0 && source === 'catalogue' && (
            <div style={st.vide}>
              Le catalogue de cet établissement est vide. Tapez un nom ci-dessus pour ajouter un produit hors catalogue,
              ou importez vos factures dans l'onglet Achats.
            </div>
          )}
          {source === 'fiches' && (
            <div style={st.noteFiches}>
              Chaque fiche devient un produit maison compté au kilo (ou à la portion), valorisé au coût matière de la fiche.
            </div>
          )}
          {actifs.length > 0 && parCategorie.length === 0 && (
            <div style={st.vide}>Aucun produit ne correspond.</div>
          )}
          {parCategorie.map(([cat, produits]) => {
            const dispo = produits.filter(selectionnable);
            const nbCat = dispo.filter(p => coches.has(p.id)).length;
            const toutCoche = dispo.length > 0 && nbCat === dispo.length;
            return (
              <div key={cat} style={st.categorie}>
                <div style={st.catHeader}>
                  <button type="button" style={st.catToggle} onClick={() => basculerOuverture(cat)}>
                    <span style={{ width: 14, display: 'inline-block' }}>{estOuverte(cat) ? '▾' : '▸'}</span>
                    <span style={{ fontWeight: 700 }}>{cat}</span>
                    <span style={st.catCompte}>
                      {nbCat > 0 ? `${nbCat} coché${nbCat > 1 ? 's' : ''} · ` : ''}
                      {dispo.length} à ajouter{produits.length > dispo.length ? ` · ${produits.length - dispo.length} déjà présent${produits.length - dispo.length > 1 ? 's' : ''}` : ''}
                    </span>
                  </button>
                  {dispo.length > 0 && (
                    <button type="button" style={st.toutCocher} onClick={() => basculerCategorie(produits)}>
                      {toutCoche ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  )}
                </div>
                {estOuverte(cat) && produits.map(p => {
                  const present = !selectionnable(p);
                  const coche = coches.has(p.id);
                  return (
                    <label key={p.id} style={{ ...st.produit, ...(present ? st.produitPresent : {}), ...(coche ? st.produitCoche : {}) }}>
                      <input
                        type="checkbox"
                        checked={present || coche}
                        disabled={present}
                        onChange={() => basculer(p.id)}
                        style={{ width: 20, height: 20, flexShrink: 0, cursor: present ? 'default' : 'pointer' }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span data-no-translate style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{p.nom}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                          {present ? 'déjà dans l\'inventaire' : (p.info || [p.uniteRef, p.fournisseurNom].filter(Boolean).join(' · '))}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={st.footer}>
          <label style={st.zone}>
            Ranger dans
            <ChoixZone value={zone} onChange={setZone} lignes={lignesExistantes} style={st.zoneSelect} ariaLabel="Zone des produits ajoutés" />
          </label>
          <span style={{ fontSize: 12, color: 'var(--text2)', flex: '1 1 160px', minWidth: 0 }}>
            {nbCoches === 0 ? 'Aucun produit coché.' : <><strong style={{ color: 'var(--text)' }}>{nbCoches}</strong> produit{nbCoches > 1 ? 's' : ''} à ajouter</>}
          </span>
          <button type="button" onClick={onClose} style={st.btnSecondaire} disabled={busy}>Annuler</button>
          <button type="button" onClick={() => valider()} style={{ ...st.btnPrimaire, opacity: nbCoches ? 1 : 0.5 }} disabled={!nbCoches || busy}>
            {busy ? 'Ajout…' : `Ajouter ${nbCoches || ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(640px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  titre: { fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.4 },
  fermer: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)', flexShrink: 0 },
  recherche: { width: '100%', padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 15, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  libre: { marginTop: 8, padding: '9px 14px', borderRadius: 8, border: '1px dashed var(--accent)', background: 'var(--surface)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44, width: '100%', textAlign: 'left' },
  liste: { overflowY: 'auto', flex: 1, padding: '4px 18px 12px', minHeight: 120 },
  noteFiches: { fontSize: 12, color: 'var(--text2)', padding: '8px 10px', margin: '6px 0', background: 'var(--bg)', borderRadius: 8, lineHeight: 1.45 },
  vide: { padding: '30px 10px', textAlign: 'center', color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 },
  categorie: { borderBottom: '1px solid var(--border)', padding: '4px 0' },
  catHeader: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  catToggle: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 44 },
  catCompte: { fontSize: 11, color: 'var(--text2)', fontWeight: 400 },
  toutCocher: { flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36 },
  produit: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', margin: '2px 0 2px 14px', borderRadius: 8, cursor: 'pointer', minHeight: 44 },
  produitPresent: { opacity: 0.5, cursor: 'default' },
  produitCoche: { background: 'var(--bg)' },
  zone: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', flexBasis: '100%' },
  zoneSelect: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)' },
  footer: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 18px', borderTop: '1px solid var(--border)' },
  btnSecondaire: { padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  btnPrimaire: { padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
};
