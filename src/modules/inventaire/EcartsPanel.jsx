import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { normalizeSearch } from '../../utils/searchText.js';
import { dateCH, estCompte } from './inventaireLignes.js';
import { zoneOf } from './zones.js';
import ChoixZone from './ChoixZone.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Écarts & valeur : le bloc `#inventaire-print` du module Inventaire, extrait
// tel quel d'Inventaire.jsx (titre du document, cartes de synthèse, filtres,
// sélection, tableau des lignes). C'est aussi le document imprimé
// (pdfUtils.printElement) : son id et sa structure ne bougent pas.
//
// Les données, les droits et toutes les écritures restent dans Inventaire.jsx
// et arrivent en props : ce composant n'écrit rien de lui-même. Les filtres
// (catégorie, type, recherche) sont les siens.
// ─────────────────────────────────────────────────────────────────────────────

// Feuilles du format d'import Samper, en mots : la valeur brute ne parle pas.
const TYPES_LIGNE = { sec: 'sec', positif: 'froid positif', negatif: 'froid négatif' };
const chfKpi = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nbProduits = (n) => `${n} produit${n > 1 ? 's' : ''}`;

export default function EcartsPanel({
  inv, previousInv, perimetreActif, perimetres, estValide, validateurNom, valeurTousPerimetres,
  canManage, canEditLignes, canGererLignes, sel, bulkBusy,
  stockDraft, setStockDraft, stockRefs, commitStockReel, focusLigneSuivante,
  onDeleteLine, onSupprimerSelection, onExporterSelection, onChangerZone,
}) {
  const [catFilter, setCatFilter] = React.useState('Tous');
  const [typeFilter, setTypeFilter] = React.useState('Tous');
  const [search, setSearch] = React.useState('');

  const cats = ['Tous', ...Array.from(new Set((inv.lignes || []).map(l => l.categorie)))];
  const filtered = (inv.lignes || []).filter(l =>
    (catFilter === 'Tous' || l.categorie === catFilter) &&
    (typeFilter === 'Tous' || (l.type || '') === typeFilter) &&
    (search === '' || normalizeSearch(l.produit).includes(normalizeSearch(search)))
  );
  // Liste des types présents dans l'inventaire (pour afficher le filtre si au moins 1 ligne a un type)
  const hasTypes = inv.lignes.some(l => l.type);

  // Gabarit de colonnes partagé par l'en-tête et les lignes : deux chaînes
  // séparées finissaient toujours par diverger. « Stock réel » passe en
  // minmax quand elle porte un champ de saisie : en fr pur, la colonne tombait
  // à 54px sur tablette (police forcée à 16px par la règle tactile), soit
  // quatre caractères visibles pour saisir une quantité. Le tableau déborde et
  // défile dans son conteneur, la page ne pane pas pour autant.
  const colonnesTableau = (sel.active ? '34px ' : '')
    + `2fr 1fr 1fr ${canEditLignes ? 'minmax(124px, 1.6fr)' : '1fr'} 1fr 1.2fr 1.2fr`
    + (canManage ? ' 90px' : '');

  // Synthèse des écarts (écart = stock réel - stock théorique, par ligne
  // comptée). Le moins et le plus sont chiffrés séparément : leur somme en
  // valeur absolue, affichée autrefois en négatif sous « Écarts défavorables »,
  // mêlait les surplus aux manques.
  const totPositif = (inv.lignes || []).filter(l => l.ecart > 0).length;
  const totNegatif = (inv.lignes || []).filter(l => l.ecart < 0).length;
  const totNul = (inv.lignes || []).filter(l => l.ecart === 0).length;
  const valeurEcartsMoins = (inv.lignes || []).reduce((s, l) => s + Math.min(0, Number(l.ecartValeur) || 0), 0);
  const valeurEcartsPlus = (inv.lignes || []).reduce((s, l) => s + Math.max(0, Number(l.ecartValeur) || 0), 0);
  const nbNonComptes = (inv.lignes || []).filter(l => !estCompte(l)).length;

  const deltaValeur = previousInv ? (inv.valeurTotale - previousInv.valeurTotale) : null;
  const deltaPct = (previousInv && previousInv.valeurTotale > 0)
    ? (deltaValeur / previousInv.valeurTotale * 100)
    : null;

  return (
      <div id="inventaire-print">
        {/* Identité du document : reprise telle quelle dans l'impression et le PDF,
            où l'en-tête de l'écran (no-print) a disparu. */}
        <div style={st.docTitle}>
          <span style={st.docTitlePerimetre}>{perimetreActif}</span>
          <span style={st.docTitleDate}>Inventaire du {inv.date}</span>
          {/* Sur un document imprimé, « validé » sans nom de valideur ne prouve rien. */}
          <span style={st.docTitleDate}>
            {estValide ? `Validé${validateurNom ? ' par ' + validateurNom : ''}` : 'En cours'}
          </span>
        </div>

        {/* Chaque carte dit en clair ce qu'elle compte : un chiffre seul sous
            « Écarts positifs » ne disait ni par rapport à quoi, ni en quoi. */}
        <div style={st.kpiBar}>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Valeur du stock ({perimetreActif})</div>
            <div style={st.kpiVal}>CHF {(Number(inv.valeurTotale) || 0).toLocaleString('fr-CH', {minimumFractionDigits:2})}</div>
            <div style={st.kpiNote}>
              {nbNonComptes > 0
                ? `Produits comptés × prix unitaire. ${nbProduits(nbNonComptes)} pas encore compté${nbNonComptes > 1 ? 's' : ''}, à 0 ici.`
                : 'Produits comptés × prix unitaire.'}
            </div>
          </div>
          {/* Consolidé : dernier inventaire de CHAQUE périmètre. Additionner
              toute la liste compterait plusieurs fois le même stock. */}
          {perimetres.length > 1 && (
            <div style={st.kpiCard}>
              <div style={st.kpiLabel}>Stock total ({perimetres.length} périmètres)</div>
              <div style={st.kpiVal}>CHF {valeurTousPerimetres.toLocaleString('fr-CH', {minimumFractionDigits:2})}</div>
              <div style={st.kpiNote}>Le dernier inventaire de chaque périmètre, additionnés.</div>
            </div>
          )}
          {/* Évolution vs inventaire précédent du même périmètre */}
          {previousInv && deltaValeur != null && (
            <div style={st.kpiCard}>
              <div style={st.kpiLabel}>Depuis le {dateCH(previousInv.date)}</div>
              <div style={{
                ...st.kpiVal,
                color: deltaValeur > 0 ? 'var(--success-strong)' : deltaValeur < 0 ? 'var(--danger-strong)' : 'var(--text2)',
              }}>
                <span style={{ whiteSpace: 'nowrap' }}>{deltaValeur > 0 ? '+' : ''}CHF {deltaValeur.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {deltaPct != null && (
                  <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 6, opacity: 0.85 }}>
                    ({deltaPct > 0 ? '+' : ''}{deltaPct.toLocaleString('fr-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %)
                  </span>
                )}
              </div>
              <div style={st.kpiNote}>
                {deltaValeur > 0
                  ? `Le stock vaut plus qu'à l'inventaire « ${perimetreActif} » du ${dateCH(previousInv.date)}.`
                  : deltaValeur < 0
                    ? `Le stock vaut moins qu'à l'inventaire « ${perimetreActif} » du ${dateCH(previousInv.date)}.`
                    : `Même valeur qu'à l'inventaire « ${perimetreActif} » du ${dateCH(previousInv.date)}.`}
              </div>
            </div>
          )}
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Écarts en moins</div>
            <div style={{...st.kpiVal, color: totNegatif ? 'var(--danger-strong)' : 'var(--text2)'}}>
              {valeurEcartsMoins < 0 ? '−' : ''}CHF {chfKpi(Math.abs(valeurEcartsMoins))}
            </div>
            <div style={st.kpiNote}>{nbProduits(totNegatif)} compté{totNegatif > 1 ? 's' : ''} sous le stock théorique.</div>
          </div>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Écarts en plus</div>
            <div style={{...st.kpiVal, color: totPositif ? 'var(--success-strong)' : 'var(--text2)'}}>
              {valeurEcartsPlus > 0 ? '+' : ''}CHF {chfKpi(valeurEcartsPlus)}
            </div>
            <div style={st.kpiNote}>{nbProduits(totPositif)} compté{totPositif > 1 ? 's' : ''} au-dessus du stock théorique.</div>
          </div>
          <div style={st.kpiCard}>
            <div style={st.kpiLabel}>Sans écart</div>
            <div style={{...st.kpiVal, color:'var(--success-text)'}}>{totNul} / {(inv.lignes || []).length}</div>
            <div style={st.kpiNote}>Produits comptés exactement au stock théorique.</div>
          </div>
        </div>

        <div style={st.filters} className="no-print">
          <SegmentedTabs
            size="sm"
            active={catFilter}
            onChange={setCatFilter}
            tabs={cats.map(c => ({ id: c, label: c }))}
          />
          {hasTypes && (
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <span style={{fontSize:11, color:'var(--text2)', fontWeight:500, textTransform:'uppercase', letterSpacing:0.4}}>Type :</span>
              <SegmentedTabs
                size="sm"
                active={typeFilter}
                onChange={setTypeFilter}
                tabs={['Tous', 'sec', 'positif', 'negatif'].map(t => ({ id: t, label: t === 'negatif' ? 'Négatif' : t === 'sec' ? 'Sec' : t === 'positif' ? 'Positif' : 'Tous' }))}
              />
            </div>
          )}
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher un produit…" />
        </div>

        {sel.active && (
          <SelectionToolbar
            count={sel.count}
            total={filtered.length}
            allSelected={sel.count > 0 && sel.count === filtered.length}
            onToggleAll={() => (sel.count === filtered.length ? sel.clear() : sel.selectAll(filtered.map(l => l.id)))}
            onDelete={canGererLignes ? onSupprimerSelection : undefined}
            onExport={onExporterSelection}
            exportLabel="Exporter Excel"
            onCancel={sel.exit}
            busy={bulkBusy}
          />
        )}
        {sel.active && canEditLignes && sel.count > 0 && (
          <div style={st.rangement} className="no-print">
            <span>Ranger {sel.count > 1 ? `les ${sel.count} lignes sélectionnées` : 'la ligne sélectionnée'} dans :</span>
            <ChoixZone
              value=""
              lignes={inv.lignes || []}
              videLabel="Choisir une zone…"
              ariaLabel="Zone des lignes sélectionnées"
              style={st.invSelect}
              onChange={async (zone) => {
                if (!zone) return;
                const n = sel.count;
                await onChangerZone([...sel.ids], zone);
                notifyLegacy(`${n} ligne${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} dans « ${zone} ».`, 'success');
              }}
            />
          </div>
        )}

        {canEditLignes && filtered.length > 0 && (
          <div style={st.saisieHint} className="no-print">
            Tapez la quantité comptée dans la colonne « Stock réel ». La virgule est acceptée ;
            Entrée passe à la ligne suivante. Écarts et valeurs se recalculent à la sortie du champ.
          </div>
        )}

        <div style={st.tableWrap} className="grid-table-scroll">
          <div className="grid-table-row" style={{...st.tableHead, gridTemplateColumns: colonnesTableau}}>
            {sel.active && <span className="no-print"/>}
            <span>Produit</span><span>Catégorie</span><span style={{textAlign:'right'}}>Stock théorique</span><span style={{textAlign:'right'}}>Stock réel</span><span style={{textAlign:'right'}}>Écart</span><span style={{textAlign:'right'}}>Valeur (CHF)</span><span style={{textAlign:'right'}}>Écart valeur</span>{canManage && <span className="no-print"/>}
          </div>
          {(filtered || []).map(l => {
            const ecartColor = l.ecart < 0 ? 'var(--danger-strong)' : l.ecart > 0 ? 'var(--success-strong)' : 'var(--text2)';
            // Type de la ligne (format d'import Samper) en mots, en texte simple.
            const typeBadge = l.type ? (
              <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 400, color: 'var(--text2)' }}>
                {TYPES_LIGNE[l.type] || l.type}
              </span>
            ) : null;
            return (
              <div key={l.id} className="grid-table-row" style={{
                ...st.tableRow,
                gridTemplateColumns: colonnesTableau,
                ...(sel.active && sel.isSelected(l.id) ? { background: 'var(--bg)' } : {}),
              }}>
                {sel.active && (
                  <span className="no-print" style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" checked={sel.isSelected(l.id)} onChange={() => sel.toggle(l.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  </span>
                )}
                <span style={st.prodName}>{l.produit}{typeBadge}</span>
                <span style={st.cell}>
                  <span style={st.catTag}>{l.categorie}</span>
                  {zoneOf(l) && <span style={st.zoneTag}>{zoneOf(l)}</span>}
                </span>
                <span style={{...st.cell, textAlign:'right'}}>{l.stockTheo} {l.unite}</span>
                <span style={{...st.cellBold, textAlign:'right'}}>
                  {canEditLignes ? (
                    <span style={st.stockSaisie}>
                      <input
                        // type="text" + inputMode="decimal" et non type="number" :
                        // sur iOS le pavé numérique français propose une virgule que
                        // type="number" rejette en silence (champ vidé au tap).
                        type="text"
                        inputMode="decimal"
                        aria-label={`Stock réel - ${l.produit} (${l.unite})`}
                        ref={el => { if (el) stockRefs.current[l.id] = el; else delete stockRefs.current[l.id]; }}
                        value={stockDraft[l.id] ?? String(l.stockReel ?? '')}
                        onChange={e => setStockDraft(d => ({ ...d, [l.id]: e.target.value }))}
                        onFocus={e => e.target.select()}
                        onBlur={e => commitStockReel(l.id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitStockReel(l.id, e.target.value);
                            focusLigneSuivante(l.id, filtered);
                          } else if (e.key === 'Escape') {
                            // Abandon de la frappe : on revient à la quantité enregistrée.
                            setStockDraft(d => { const suite = { ...d }; delete suite[l.id]; return suite; });
                            e.target.blur();
                          }
                        }}
                        style={st.stockInput}
                      />
                      <span style={st.stockUnite}>{l.unite}</span>
                    </span>
                  ) : (
                    <>{estCompte(l) ? `${l.stockReel} ${l.unite}` : '-'}</>
                  )}
                </span>
                <span style={{...st.cell, textAlign:'right', color:ecartColor, fontWeight:500}}>{l.ecart == null ? '-' : <>{l.ecart > 0 ? '+' : ''}{l.ecart} {l.unite}</>}</span>
                {/* Number(...) || 0 : une ligne relue de la base n'est pas
                    recalculée au chargement, un champ absent ne doit pas faire
                    tomber tout le module. */}
                <span style={{...st.cellBold, textAlign:'right'}}>{(Number(l.valeur) || 0).toLocaleString('fr-CH', {minimumFractionDigits:2})}</span>
                <span style={{...st.cell, textAlign:'right', color:ecartColor, fontWeight:500}}>{l.ecart == null ? '-' : <>{l.ecartValeur > 0 ? '+' : ''}{(Number(l.ecartValeur) || 0).toFixed(2)}</>}</span>
                {canManage && <span className="no-print">{canGererLignes && <button className="btn-suppr-discret" style={st.deleteBtn} onClick={() => onDeleteLine(l.id)}>Supprimer</button>}</span>}
              </div>
            );
          })}
        </div>
      </div>
  );
}

const st = {
  docTitle: {display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap',marginBottom:4},
  docTitlePerimetre: {fontSize:17,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  docTitleDate: {fontSize:12,color:'var(--text2)'},
  saisieHint: {fontSize:11,color:'var(--text2)',lineHeight:1.5,padding:'8px 12px',background:'var(--bg)',border:'1px dashed var(--border)',borderRadius:8},
  // Le champ prend la largeur de sa cellule ; l'unité reste collée à droite et
  // ne se comprime jamais (flexShrink 0), sinon « pcs » se coupe en « p… ».
  stockSaisie: {display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6,width:'100%',minWidth:0},
  stockInput: {width:'100%',maxWidth:110,minWidth:64,padding:'6px 8px',textAlign:'right',border:'1px solid var(--border)',borderRadius:6,background:'var(--bg)',color:'var(--text)',fontSize:13,fontWeight:500,fontFamily:'var(--font)',boxSizing:'border-box'},
  stockUnite: {fontSize:11,color:'var(--text2)',flexShrink:0},
  zoneTag: {display:'inline-block',marginLeft:4,fontSize:11,color:'var(--text2)'},
  rangement: {display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',fontSize:13,color:'var(--text2)',padding:'8px 12px',background:'var(--bg)',border:'1px dashed var(--border)',borderRadius:8},
  invSelect: {padding:'8px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)',cursor:'pointer'},
  // Supprimer, sur chaque ligne : discret au repos, rouge au survol et au focus (classe btn-suppr-discret, app.css).
  deleteBtn:{padding:'6px 10px',background:'transparent',border:'1px solid transparent',color:'var(--text3)',borderRadius:8,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  kpiBar: {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}, kpiCard: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'}, kpiLabel: {fontSize:11,fontWeight:500,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:6}, kpiVal: {fontSize:20,fontWeight:700,fontFamily:'var(--font-num)',color:'var(--text)'},
  kpiNote: {fontSize:11,color:'var(--text2)',marginTop:6,lineHeight:1.4},
  filters: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',minWidth:0},
  tableWrap: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}, tableHead: {display:'grid',padding:'10px 18px',background:'var(--bg)',fontSize:12,fontWeight:700,color:'var(--text2)',borderBottom:'1px solid var(--border)',gap:12}, tableRow: {display:'grid',padding:'11px 18px',borderBottom:'1px solid var(--border)',gap:12,alignItems:'center'}, prodName: {fontSize:13,fontWeight:500,color:'var(--text)'}, cell: {fontSize:13,color:'var(--text)'}, cellBold: {fontSize:13,fontWeight:500,color:'var(--text)'}, catTag: {fontSize:11,fontWeight:500,background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text2)',padding:'2px 8px',borderRadius:10},
};
