import React from 'react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { estCompte, UNITES_INVENTAIRE } from './inventaireLignes.js';
import { zoneOf, zonesDesLignes, SANS_ZONE } from './zones.js';
import ChoixZone from './ChoixZone.jsx';

// Vue « Comptage » : ce qu'on fait vraiment en chambre froide, et rien d'autre.
//
// Une carte par produit, un grand champ, l'unité à côté. La quantité du
// dernier inventaire est affichée en indication, un tap sur « = » la reprend.
// Entrée passe au produit suivant : on compte une étagère de haut en bas sans
// lâcher le clavier. Écarts, valeurs et KPI vivent dans la vue « Écarts ».
//
// Dès qu'un produit a une zone (Chambre froide, Congélateur...), les cartes se
// rangent par zone puis par catégorie, et des onglets permettent de compter
// une zone après l'autre, dans l'ordre du tour.
//
// La saisie elle-même (brouillon, blur, file hors-ligne) reste dans le parent :
// ce composant ne fait qu'afficher et relayer.

const FILTRES = [
  { id: 'tous', label: 'Tous' },
  { id: 'a_compter', label: 'À compter' },
  { id: 'comptes', label: 'Comptés' },
];

export default function ComptageRapide({
  lignes, canEdit, stockDraft, setStockDraft, stockRefs, commitStockReel,
  onAjoutRapide, onChangerUnite, onChangerZone, onReprendreRestants, catalogue,
}) {
  const [filtre, setFiltre] = React.useState('tous');
  // 'toutes', une zone, ou SANS_ZONE.
  const [zoneActive, setZoneActive] = React.useState('toutes');
  // Mode « ranger » : la zone de chaque produit devient modifiable sur sa
  // carte. Hors de ce mode les cartes restent compactes : sur tablette une
  // liste de choix fait 44 px de haut, une par carte doublerait la liste.
  const [rangement, setRangement] = React.useState(false);
  const [recherche, setRecherche] = React.useState('');
  const [ajout, setAjout] = React.useState('');
  const [ajoutBusy, setAjoutBusy] = React.useState(false);
  const [focusApres, setFocusApres] = React.useState(null);

  const total = lignes.length;
  const nbComptes = lignes.filter(estCompte).length;
  const restants = total - nbComptes;
  const pct = total ? Math.round((nbComptes / total) * 100) : 0;

  const zones = zonesDesLignes(lignes);
  const avecZones = zones.length > 0;
  const nbSansZone = lignes.filter(l => !zoneOf(l)).length;
  // La zone mémorisée peut avoir disparu (dernier produit rangé ailleurs).
  const zoneFiltre = zoneActive === 'toutes' || zoneActive === SANS_ZONE || zones.includes(zoneActive) ? zoneActive : 'toutes';
  const dansZone = (l) => zoneFiltre === 'toutes'
    || (zoneFiltre === SANS_ZONE ? !zoneOf(l) : zoneOf(l) === zoneFiltre);

  const match = makeSearchMatcher(recherche);
  const visibles = lignes.filter(l => (
    (filtre === 'tous' || (filtre === 'comptes' ? estCompte(l) : !estCompte(l)))
    && dansZone(l)
    && match(l.produit, l.categorie, zoneOf(l))
  ));

  // Regroupées par zone (dans l'ordre du tour) puis par catégorie, chaque
  // catégorie dans l'ordre d'apparition (celui de l'étagère quand l'inventaire
  // vient d'un classeur). Sans aucune zone, un seul niveau : la catégorie.
  // La liste plate sert à Entrée.
  const clesZones = zones.join('|');
  const groupes = React.useMemo(() => {
    const parZone = new Map();
    (avecZones ? [...zones, ''] : ['']).forEach(z => parZone.set(z, new Map()));
    visibles.forEach(l => {
      const z = avecZones ? zoneOf(l) : '';
      const c = l.categorie || 'Autres';
      const cats = parZone.get(z);
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(l);
    });
    return Array.from(parZone.entries())
      .filter(([, cats]) => cats.size > 0)
      .map(([z, cats]) => ({ zone: z, categories: Array.from(cats.entries()) }));
  }, [visibles, avecZones, clesZones]);
  const ordre = groupes.flatMap(g => g.categories.flatMap(([, ls]) => ls));

  // Un produit ajouté à la volée prend le focus dès qu'il est à l'écran.
  React.useEffect(() => {
    if (!focusApres) return;
    const champ = stockRefs.current[focusApres];
    if (champ) { champ.focus(); champ.select?.(); setFocusApres(null); }
  }, [lignes, focusApres]);

  const focusSuivant = (ligneId) => {
    const i = ordre.findIndex(l => l.id === ligneId);
    const suivante = ordre[i + 1];
    const champ = suivante && stockRefs.current[suivante.id];
    if (champ) { champ.focus(); champ.select?.(); }
  };

  const ajouter = async () => {
    const nom = ajout.trim();
    if (!nom || ajoutBusy) return;
    setAjoutBusy(true);
    try {
      // Ajouté dans la zone qu'on est en train de compter.
      const zone = zoneFiltre !== 'toutes' && zoneFiltre !== SANS_ZONE ? zoneFiltre : '';
      const id = await onAjoutRapide(nom, zone);
      setAjout('');
      if (filtre === 'comptes') setFiltre('tous');
      if (id) setFocusApres(id);
    } finally {
      setAjoutBusy(false);
    }
  };

  return (
    <div style={st.root}>
      <div style={st.progression}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text)' }}>
            <strong style={{ fontSize: 18, fontFamily: 'var(--font-num)' }}>{nbComptes}</strong> / {total} produit{total > 1 ? 's' : ''} compté{total > 1 ? 's' : ''}
          </span>
          {canEdit && restants > 0 && nbComptes > 0 && lignes.some(l => !estCompte(l) && l.precedent != null) && (
            <button type="button" style={st.lienBtn} onClick={onReprendreRestants}>
              {restants > 1
                ? `Reprendre la quantité précédente pour les ${restants} restants`
                : 'Reprendre la quantité précédente pour le dernier produit'}
            </button>
          )}
        </div>
        <div style={st.barre}><div style={{ ...st.barreRemplie, width: `${pct}%` }} /></div>
      </div>

      {avecZones && (
        <SegmentedTabs
          size="sm"
          active={zoneFiltre}
          onChange={setZoneActive}
          tabs={[
            { id: 'toutes', label: 'Toutes les zones' },
            ...zones.map(z => {
              const ls = lignes.filter(l => zoneOf(l) === z);
              return { id: z, label: `${z} (${ls.filter(estCompte).length}/${ls.length})` };
            }),
            ...(nbSansZone ? [{ id: SANS_ZONE, label: `${SANS_ZONE} (${nbSansZone})` }] : []),
          ]}
        />
      )}

      <div style={st.outils}>
        <SegmentedTabs
          size="sm"
          active={filtre}
          onChange={setFiltre}
          tabs={FILTRES.map(f => ({
            id: f.id,
            label: f.id === 'a_compter' ? `${f.label} (${restants})` : f.id === 'comptes' ? `${f.label} (${nbComptes})` : f.label,
          }))}
        />
        {canEdit && onChangerZone && total > 0 && (
          <button
            type="button"
            style={{ ...st.rangerBtn, ...(rangement ? st.rangerBtnActif : {}) }}
            aria-pressed={rangement}
            onClick={() => setRangement(r => !r)}
          >
            {rangement ? '✓ Rangement terminé' : '📍 Ranger par zone'}
          </button>
        )}
        <input
          type="search"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Chercher un produit…"
          style={st.recherche}
        />
      </div>

      {canEdit && (
        <div style={st.ajoutRapide}>
          <input
            type="text"
            list="inventaire-ajout-rapide"
            value={ajout}
            onChange={e => setAjout(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } }}
            placeholder="+ Ajouter un produit"
            style={st.ajoutInput}
            autoComplete="off"
          />
          <datalist id="inventaire-ajout-rapide">
            {(catalogue || []).filter(p => p?.nom && p.actif !== false).slice(0, 2000).map(p => <option key={p.id} value={p.nom} />)}
          </datalist>
          <button type="button" style={{ ...st.ajoutBtn, opacity: ajout.trim() ? 1 : 0.5 }} onClick={ajouter} disabled={!ajout.trim() || ajoutBusy}>
            {ajoutBusy ? '…' : 'Ajouter'}
          </button>
        </div>
      )}

      {canEdit && onChangerZone && !avecZones && total > 0 && !rangement && (
        <div style={st.astuceZones}>
          Rangez les produits par zone (chambre froide, congélateur, économat) pour compter une zone après l'autre.
          <button type="button" style={st.lienBtn} onClick={() => setRangement(true)}>Ranger par zone</button>
        </div>
      )}

      {visibles.length === 0 && (
        <div style={st.vide}>
          {total === 0
            ? 'Aucun produit dans cet inventaire. Ajoutez-les depuis le catalogue avec « + Produits », ou tapez un nom ci-dessus.'
            : filtre === 'a_compter' ? 'Tout est compté. 👍' : 'Aucun produit ne correspond.'}
        </div>
      )}

      {groupes.map(({ zone, categories }) => (
        <div key={zone || '__sans__'} style={st.groupeZone}>
          {avecZones && (
            <div style={st.zoneTitre}>
              {zone || SANS_ZONE}
              <span style={st.catCompte}>
                {categories.reduce((n, [, ls]) => n + ls.filter(estCompte).length, 0)}/{categories.reduce((n, [, ls]) => n + ls.length, 0)}
              </span>
            </div>
          )}
          {categories.map(([cat, ls]) => (
        <div key={cat}>
          <div style={st.catTitre}>
            {cat}
            <span style={st.catCompte}>{ls.filter(estCompte).length}/{ls.length}</span>
          </div>
          <div style={st.cartes}>
            {ls.map(l => {
              const compte = estCompte(l);
              const brouillon = stockDraft[l.id];
              return (
                <div key={l.id} style={{ ...st.carte, ...(compte ? st.carteComptee : {}) }}>
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div data-no-translate style={st.nom}>{l.produit}</div>
                    <div style={st.indication}>
                      <span>
                        {l.precedent != null
                          ? <>préc. {l.precedent} {l.unite}</>
                          : compte ? <>✓ compté</> : <>à compter</>}
                      </span>
                      {canEdit && onChangerZone && rangement && (
                        <ChoixZone
                          value={zoneOf(l)}
                          lignes={lignes}
                          ariaLabel={`Zone - ${l.produit}`}
                          style={st.zoneSelect}
                          onChange={(z) => onChangerZone(l.id, z)}
                        />
                      )}
                    </div>
                  </div>
                  {canEdit ? (
                    <div style={st.saisie}>
                      {!compte && l.precedent != null && (
                        <button
                          type="button"
                          style={st.egal}
                          title={`Reprendre ${l.precedent} ${l.unite}`}
                          aria-label={`Reprendre la quantité précédente : ${l.precedent} ${l.unite}`}
                          onClick={() => commitStockReel(l.id, String(l.precedent))}
                        >=</button>
                      )}
                      <input
                        // type="text" + inputMode="decimal" et non type="number" :
                        // sur iOS le pavé numérique français propose une virgule que
                        // type="number" rejette en silence (champ vidé au tap).
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="next"
                        aria-label={`Quantité comptée - ${l.produit} (${l.unite})`}
                        ref={el => { if (el) stockRefs.current[l.id] = el; else delete stockRefs.current[l.id]; }}
                        value={brouillon ?? (compte ? String(l.stockReel) : '')}
                        placeholder={l.precedent != null ? String(l.precedent) : '0'}
                        onChange={e => setStockDraft(d => ({ ...d, [l.id]: e.target.value }))}
                        onFocus={e => e.target.select()}
                        onBlur={e => commitStockReel(l.id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitStockReel(l.id, e.target.value);
                            focusSuivant(l.id);
                          } else if (e.key === 'Escape') {
                            setStockDraft(d => { const suite = { ...d }; delete suite[l.id]; return suite; });
                            e.target.blur();
                          }
                        }}
                        style={{ ...st.champ, ...(compte ? st.champCompte : {}) }}
                      />
                      <select
                        value={l.unite}
                        onChange={e => onChangerUnite(l.id, e.target.value)}
                        style={st.unite}
                        aria-label={`Unité - ${l.produit}`}
                      >
                        {(UNITES_INVENTAIRE.includes(l.unite) ? UNITES_INVENTAIRE : [l.unite, ...UNITES_INVENTAIRE]).map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {compte ? `${l.stockReel} ${l.unite}` : '-'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const st = {
  root: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  progression: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  barre: { height: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' },
  barreRemplie: { height: '100%', background: 'var(--success-strong, var(--accent))', transition: 'width .2s ease' },
  lienBtn: { background: 'none', border: 'none', padding: '6px 0', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 36 },
  outils: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  recherche: { flex: '1 1 180px', minWidth: 0, maxWidth: 320, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  ajoutRapide: { display: 'flex', gap: 8, minWidth: 0 },
  ajoutInput: { flex: 1, minWidth: 0, padding: '11px 14px', border: '1px dashed var(--border)', borderRadius: 10, fontSize: 15, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  ajoutBtn: { flexShrink: 0, padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  vide: { padding: '30px 16px', textAlign: 'center', color: 'var(--text2)', fontSize: 13, lineHeight: 1.5, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 },
  groupeZone: { display: 'flex', flexDirection: 'column', gap: 4 },
  zoneTitre: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', margin: '10px 2px 0', paddingBottom: 4, borderBottom: '2px solid var(--border)' },
  zoneSelect: { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)', padding: '4px 8px', cursor: 'pointer', maxWidth: 180 },
  rangerBtn: { padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40, whiteSpace: 'nowrap' },
  rangerBtnActif: { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 },
  astuceZones: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)', padding: '8px 12px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, lineHeight: 1.45 },
  catTitre: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '6px 2px 6px' },
  catCompte: { fontWeight: 600, color: 'var(--text3, var(--text2))', letterSpacing: 0 },
  cartes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 8 },
  carte: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, minWidth: 0 },
  carteComptee: { borderColor: 'var(--success-bd)' },
  nom: { fontSize: 14, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word', lineHeight: 1.3 },
  indication: { fontSize: 11, color: 'var(--text2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  saisie: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' },
  egal: { width: 40, height: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text2)', fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  champ: { width: 92, height: 44, padding: '0 10px', textAlign: 'right', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 17, fontWeight: 700, fontFamily: 'var(--font)', boxSizing: 'border-box' },
  champCompte: { borderColor: 'var(--success-bd)' },
  unite: { height: 44, padding: '0 4px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer', maxWidth: 64 },
};
