import React from 'react';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { Anneau, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { estCompte, UNITES_INVENTAIRE } from './inventaireLignes.js';
import { zoneOf, zonesOf, estMultiZone, quantiteZone, zonesDesLignes, zoneSuggeree, SANS_ZONE } from './zones.js';
import CasesZones from './CasesZones.jsx';
import ModifierProduit from './ModifierProduit.jsx';

// Vue « Comptage » : ce qu'on fait vraiment en chambre froide, et rien d'autre.
//
// Une ligne par produit, un grand champ, l'unité à côté. La quantité du
// dernier inventaire est affichée en indication, un tap sur « = » la reprend.
// Entrée passe au produit suivant : on compte une étagère de haut en bas sans
// lâcher le clavier. Écarts, valeurs et KPI vivent dans la vue « Écarts ».
//
// Dès qu'un produit a une zone (Cave, Économat, Froid positif, Froid négatif),
// chaque zone a son panneau, ses produits rangés par catégorie, et des onglets permettent
// de compter une zone après l'autre, dans l'ordre du tour. Un produit rangé
// dans deux zones a une carte dans chacune, avec sa propre quantité : la ligne
// vaut la somme.
//
// Ajouter un produit : nom, Entrée, quantité, Entrée, produit suivant. Le
// produit créé passe en tête (« Ajoutés à l'instant »), son champ de quantité
// ouvert, ses cases de zone sous le nom : rien à chercher derrière.
//
// La saisie elle-même (brouillon, blur, file hors-ligne) reste dans le parent :
// ce composant ne fait qu'afficher et relayer.

const FILTRES = [
  { id: 'tous', label: 'Tous' },
  { id: 'a_compter', label: 'À compter' },
  { id: 'comptes', label: 'Comptés' },
];

// Une carte = un produit dans une zone. `cle` sert au brouillon et au focus.
const cartesDe = (l) => (estMultiZone(l)
  ? zonesOf(l).map(z => ({ l, zone: z, multi: true, cle: `${l.id}::${z}` }))
  : [{ l, zone: zoneOf(l), multi: false, cle: l.id }]);

const carteComptee = (c) => (c.multi ? quantiteZone(c.l, c.zone) != null : estCompte(c.l));

export default function ComptageRapide({
  lignes, canEdit, stockDraft, setStockDraft, stockRefs, commitStockReel,
  onAjoutRapide, onChangerUnite, onChangerZones, onRangerSansZone, onReprendreRestants, catalogue,
  ajoutsRecents = [], focusDemande = null, onFocusFait,
  onModifier, onAnnulerSaisie, onSupprimer, canGerer = false,
}) {
  const [filtre, setFiltre] = React.useState('tous');
  // 'toutes', une zone, ou SANS_ZONE.
  const [zoneActive, setZoneActive] = React.useState('toutes');
  // Mode « ranger » : les cases de zone apparaissent sur chaque carte. Hors de
  // ce mode les cartes restent compactes, sauf celles qu'on vient d'ajouter.
  const [rangement, setRangement] = React.useState(false);
  const [recherche, setRecherche] = React.useState('');
  const [ajout, setAjout] = React.useState('');
  const [focusApres, setFocusApres] = React.useState(null);
  // Produit ouvert dans « Modifier » : { ligneId, zone } (zone de la carte).
  const [edition, setEdition] = React.useState(null);
  const ajoutRef = React.useRef(null);

  const total = lignes.length;
  const nbComptes = lignes.filter(estCompte).length;
  const restants = total - nbComptes;

  const toutes = React.useMemo(() => lignes.flatMap(cartesDe), [lignes]);
  const zones = zonesDesLignes(lignes);
  const avecZones = zones.length > 0;
  const nbSansZone = lignes.filter(l => !zonesOf(l).length).length;
  // Ceux que leur nom ou leur catégorie désigne : rangés d'un geste.
  const nbRangeables = lignes.filter(l => !zonesOf(l).length && zoneSuggeree(l)).length;
  // La zone mémorisée peut avoir disparu (dernier produit rangé ailleurs).
  const zoneFiltre = zoneActive === 'toutes' || zoneActive === SANS_ZONE || zones.includes(zoneActive) ? zoneActive : 'toutes';
  const dansFiltreZone = (c) => zoneFiltre === 'toutes'
    || (zoneFiltre === SANS_ZONE ? !c.zone : c.zone === zoneFiltre);

  // Produits ajoutés pendant ce comptage : en tête, quels que soient filtres et
  // recherche, le plus récent d'abord.
  const idsRecents = new Set(ajoutsRecents);
  const parId = new Map(lignes.map(l => [l.id, l]));
  const recentes = ajoutsRecents.map(id => parId.get(id)).filter(Boolean).flatMap(cartesDe);

  const match = makeSearchMatcher(recherche);
  const visibles = toutes.filter(c => (
    !idsRecents.has(c.l.id)
    && (filtre === 'tous' || (filtre === 'comptes' ? carteComptee(c) : !carteComptee(c)))
    && dansFiltreZone(c)
    && match(c.l.produit, c.l.categorie, c.zone)
  ));

  // Regroupées par zone (dans l'ordre du tour) puis par catégorie, chaque
  // catégorie dans l'ordre d'apparition (celui de l'étagère quand l'inventaire
  // vient d'un classeur). Sans aucune zone, un seul niveau : la catégorie.
  // La liste plate sert à Entrée.
  const clesZones = zones.join('|');
  const groupes = React.useMemo(() => {
    const parZone = new Map();
    (avecZones ? [...zones, ''] : ['']).forEach(z => parZone.set(z, new Map()));
    visibles.forEach(c => {
      const z = avecZones ? c.zone : '';
      const cat = c.l.categorie || 'Autres';
      const cats = parZone.get(z);
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push(c);
    });
    return Array.from(parZone.entries())
      .filter(([, cats]) => cats.size > 0)
      .map(([z, cats]) => ({ zone: z, categories: Array.from(cats.entries()) }));
  }, [visibles, avecZones, clesZones]);
  const ordre = groupes.flatMap(g => g.categories.flatMap(([, cs]) => cs));

  // Un produit ajouté prend le focus dès qu'il est à l'écran, qu'il vienne du
  // champ d'ajout ou de la fenêtre « Ajouter des produits ».
  // Une demande de focus ne sert qu'une fois : sans ce verrou, la saisie de la
  // quantité (nouveau rendu, même cible encore en état) ramenait le curseur
  // dans le champ juste après que Entrée l'a envoyé au champ d'ajout.
  const cibleFocus = focusApres || focusDemande;
  const dejaFocalise = React.useRef(null);
  React.useEffect(() => {
    if (!cibleFocus || dejaFocalise.current === cibleFocus) return;
    const ligne = parId.get(cibleFocus);
    const cle = ligne ? cartesDe(ligne)[0].cle : cibleFocus;
    const champ = stockRefs.current[cle];
    if (champ) {
      dejaFocalise.current = cibleFocus;
      champ.focus();
      champ.select?.();
      champ.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      setFocusApres(null);
      if (focusDemande) onFocusFait?.();
    }
  }, [lignes, cibleFocus]);

  const focusSuivant = (cle) => {
    const i = ordre.findIndex(c => c.cle === cle);
    const suivante = ordre[i + 1];
    const champ = suivante && stockRefs.current[suivante.cle];
    if (champ) { champ.focus(); champ.select?.(); }
  };

  // Aucune attente : la ligne est à l'écran au retour, l'enregistrement suit.
  const ajouter = async () => {
    const nom = ajout.trim();
    if (!nom) return;
    // Ajouté dans la zone qu'on est en train de compter, sinon dans celle que
    // désigne son nom (corrigeable d'un tap sur sa carte).
    const zone = zoneFiltre !== 'toutes' && zoneFiltre !== SANS_ZONE ? zoneFiltre : '';
    setAjout('');
    if (filtre === 'comptes') setFiltre('tous');
    const id = await onAjoutRapide(nom, zone);
    // Retaper un produit déjà là redonne le focus à son champ, même deux fois de suite.
    dejaFocalise.current = null;
    if (id) setFocusApres(id);
  };

  const zoneProposee = zoneSuggeree({ produit: ajout });

  const renderCarte = (c, { recente = false } = {}) => {
    const { l, zone, multi, cle } = c;
    const compte = carteComptee(c);
    const brouillon = stockDraft[cle];
    const valeur = multi ? quantiteZone(l, zone) : (estCompte(l) ? l.stockReel : null);
    const precedent = multi ? (l.precedentParZone?.[zone] ?? null) : l.precedent;
    const autres = multi ? zonesOf(l).filter(z => z !== zone) : [];
    const commit = (v) => commitStockReel(l.id, v, multi ? zone : '');
    return (
      <div key={cle} style={st.ligne}>
        <div style={{ flex: '1 1 124px', minWidth: 0 }}>
          <div style={st.nomLigne}>
            <div data-no-translate style={st.nom}>{l.produit}</div>
            {canEdit && onModifier && (
              <button type="button" style={st.modifierBtn} onClick={() => setEdition({ ligneId: l.id, zone: multi ? zone : '' })} aria-label={`Modifier - ${l.produit}`}>
                Modifier
              </button>
            )}
          </div>
          <div style={st.indication}>
            <span>
              {precedent != null
                ? <>préc. {precedent} {l.unite}</>
                : compte ? <>compté</> : <>à compter</>}
            </span>
            {multi && (
              <span>
                aussi en <span data-no-translate>{autres.join(', ')}</span>, total <span>{l.stockReel ?? 0}</span> {l.unite}
              </span>
            )}
          </div>
        </div>
        {canEdit ? (
          <div style={st.saisie}>
            {!compte && precedent != null && (
              <button
                type="button"
                style={st.egal}
                title={`Reprendre ${precedent} ${l.unite}`}
                aria-label={`Reprendre la quantité précédente : ${precedent} ${l.unite}`}
                onClick={() => commit(String(precedent))}
              >=</button>
            )}
            <input
              // type="text" + inputMode="decimal" et non type="number" :
              // sur iOS le pavé numérique français propose une virgule que
              // type="number" rejette en silence (champ vidé au tap).
              type="text"
              inputMode="decimal"
              enterKeyHint={recente ? 'done' : 'next'}
              aria-label={`Quantité comptée - ${l.produit}${multi ? ` (${zone})` : ''} (${l.unite})`}
              ref={el => { if (el) stockRefs.current[cle] = el; else delete stockRefs.current[cle]; }}
              value={brouillon ?? (valeur != null ? String(valeur) : '')}
              placeholder={precedent != null ? String(precedent) : '0'}
              onChange={e => setStockDraft(d => ({ ...d, [cle]: e.target.value }))}
              onFocus={e => e.target.select()}
              onBlur={e => commit(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit(e.target.value);
                  // Produit qu'on vient de créer : retour au champ d'ajout pour
                  // enchaîner le suivant.
                  if (recente && ajoutRef.current) ajoutRef.current.focus();
                  else focusSuivant(cle);
                } else if (e.key === 'Escape') {
                  setStockDraft(d => { const suite = { ...d }; delete suite[cle]; return suite; });
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
          <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {valeur != null ? `${valeur} ${l.unite}` : '-'}
          </div>
        )}
        {canEdit && onChangerZones && (rangement || recente) && (
          <div style={st.casesLigne}>
            <CasesZones zones={zonesOf(l)} nom={l.produit} onChange={(zs) => onChangerZones(l.id, zs)} />
          </div>
        )}
      </div>
    );
  };

  const ligneEditee = edition ? parId.get(edition.ligneId) : null;

  return (
    <div style={st.root}>
      {ligneEditee && (
        <ModifierProduit
          key={ligneEditee.id}
          ligne={ligneEditee}
          zone={edition.zone}
          lignes={lignes}
          canGerer={canGerer}
          onEnregistrer={(patch) => onModifier(ligneEditee.id, patch)}
          onAnnulerSaisie={(z) => onAnnulerSaisie(ligneEditee.id, z)}
          onSupprimer={() => onSupprimer(ligneEditee.id)}
          onClose={() => setEdition(null)}
        />
      )}
      <Panneau style={st.progression}>
        <Anneau part={total ? nbComptes / total : 0} couleur="var(--success-strong)" />
        <div style={st.progressionTexte}>
          <span style={{ fontSize: 'var(--t2)', color: 'var(--text)' }}>
            <span style={st.progressionChiffre}>{nbComptes}</span> / {total} produit{total > 1 ? 's' : ''} compté{total > 1 ? 's' : ''}
          </span>
          {canEdit && restants > 0 && nbComptes > 0 && lignes.some(l => !estCompte(l) && l.precedent != null) && (
            <button type="button" style={st.lienBtn} onClick={onReprendreRestants}>
              {restants > 1
                ? `Reprendre la quantité précédente pour les ${restants} restants`
                : 'Reprendre la quantité précédente pour le dernier produit'}
            </button>
          )}
        </div>
      </Panneau>

      {canEdit && (
        <div style={st.ajoutBloc}>
          <div style={st.ajoutRapide}>
            <input
              ref={ajoutRef}
              type="text"
              list="inventaire-ajout-rapide"
              value={ajout}
              onChange={e => setAjout(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } }}
              placeholder="Nouveau produit : tapez son nom, Entrée"
              aria-label="Ajouter un produit"
              enterKeyHint="go"
              style={st.ajoutInput}
              autoComplete="off"
            />
            <datalist id="inventaire-ajout-rapide">
              {(catalogue || []).filter(p => p?.nom && p.actif !== false).slice(0, 2000).map(p => <option key={p.id} value={p.nom} />)}
            </datalist>
            <button type="button" style={st.ajoutBtn} onClick={ajouter} disabled={!ajout.trim()}>
              Ajouter
            </button>
          </div>
          {ajout.trim() && (
            <div style={st.ajoutAide}>
              {zoneFiltre !== 'toutes' && zoneFiltre !== SANS_ZONE
                ? <>Rangé dans <span data-no-translate>{zoneFiltre}</span></>
                : zoneProposee ? <>Rangé dans <span data-no-translate>{zoneProposee}</span>, à corriger d'un tap si besoin</> : <>Sans zone, à cocher sur sa carte</>}
            </div>
          )}
        </div>
      )}

      {recentes.length > 0 && (
        <Panneau style={st.zone}>
          <div style={st.zoneTitre}>
            Ajoutés à l'instant
            <span style={st.catCompte}>{recentes.filter(carteComptee).length}/{recentes.length}</span>
          </div>
          <div style={st.lignes}>
            {recentes.map(c => renderCarte(c, { recente: true }))}
          </div>
        </Panneau>
      )}

      {avecZones && (
        <SegmentedTabs
          size="sm"
          active={zoneFiltre}
          onChange={setZoneActive}
          tabs={[
            { id: 'toutes', label: 'Toutes les zones' },
            ...zones.map(z => {
              const cs = toutes.filter(c => c.zone === z);
              return { id: z, label: `${z} (${cs.filter(carteComptee).length}/${cs.length})` };
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
        {canEdit && onChangerZones && total > 0 && (
          <button
            type="button"
            style={{ ...st.rangerBtn, ...(rangement ? st.rangerBtnActif : {}) }}
            aria-pressed={rangement}
            onClick={() => setRangement(r => !r)}
          >
            {rangement ? 'Rangement terminé' : 'Ranger par zone'}
          </button>
        )}
        <input
          type="search"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Chercher un produit…"
          aria-label="Chercher un produit"
          style={st.recherche}
        />
      </div>

      {canEdit && onChangerZones && rangement && (
        <div style={st.astuceZones}>
          <span style={{ flex: '1 1 260px', minWidth: 0 }}>
            Un tap sur une case range le produit, un second le retire. Deux cases cochées : le produit se compte dans chacune des deux zones.
          </span>
          {nbRangeables > 0 && onRangerSansZone && (
            <button type="button" style={st.rangerBtn} onClick={onRangerSansZone}>
              Ranger d'après leur nom <span>{nbRangeables}</span> produits sans zone
            </button>
          )}
        </div>
      )}

      {canEdit && onChangerZones && !avecZones && total > 0 && !rangement && (
        <div style={st.astuceZones}>
          Rangez les produits par zone (cave, économat, froid positif, froid négatif) avec le bouton « Ranger par zone », pour compter une zone après l'autre.
        </div>
      )}

      {visibles.length === 0 && recentes.length === 0 && (
        <div style={st.vide}>
          {total === 0
            ? 'Aucun produit dans cet inventaire. Ajoutez-les depuis le catalogue avec « Ajouter des produits », ou tapez un nom ci-dessus.'
            : filtre === 'a_compter' ? 'Tout est compté.' : 'Aucun produit ne correspond.'}
        </div>
      )}

      {groupes.length > 0 && (
        <div style={st.zones}>
          {groupes.map(({ zone, categories }) => (
            <Panneau key={zone || '__sans__'} style={st.zone}>
              {avecZones && (
                <div style={st.zoneTitre}>
                  {zone || SANS_ZONE}
                  <span style={st.catCompte}>
                    {categories.reduce((n, [, cs]) => n + cs.filter(carteComptee).length, 0)}/{categories.reduce((n, [, cs]) => n + cs.length, 0)}
                  </span>
                </div>
              )}
              {categories.map(([cat, cs]) => (
                <div key={cat}>
                  <div style={st.catTitre}>
                    {cat}
                    <span style={st.catCompte}>{cs.filter(carteComptee).length}/{cs.length}</span>
                  </div>
                  <div style={st.lignes}>
                    {cs.map(c => renderCarte(c))}
                  </div>
                </div>
              ))}
            </Panneau>
          ))}
        </div>
      )}
    </div>
  );
}

const st = {
  root: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  // Le compteur dans une carte : la part comptée en anneau, son compte écrit à côté.
  progression: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14, padding: '12px 16px' },
  progressionTexte: { flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  progressionChiffre: { fontSize: 'var(--t5)', fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
  lienBtn: { background: 'none', border: 'none', padding: '6px 0', color: 'var(--lien)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 36 },
  outils: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  recherche: { flex: '1 1 180px', minWidth: 0, maxWidth: 320, padding: '9px 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r-full)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  ajoutBloc: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  ajoutRapide: { display: 'flex', gap: 8, minWidth: 0 },
  ajoutInput: { flex: 1, minWidth: 0, padding: '11px 14px', border: '1px dashed var(--border)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  ajoutAide: { fontSize: 'var(--t1)', color: 'var(--text2)', padding: '0 4px' },
  // Même hauteur que le champ d'ajout qu'il prolonge (44 px). Bouton
  // secondaire : l'action principale de l'écran est « Terminer le comptage ».
  // Son état éteint (rien à ajouter) est dans app.css.
  ajoutBtn: { flexShrink: 0, padding: '0 18px', borderRadius: 'var(--r-full)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  vide: { padding: '30px 0', textAlign: 'center', color: 'var(--text2)', fontSize: 'var(--t2)', lineHeight: 1.5 },
  // Une zone = un panneau (Panneau de ui) : sa limite se voit, les zones se
  // séparent par l'espace. Retrait latéral resserré au téléphone, pour que le
  // nom, « = », la quantité et l'unité tiennent sur une ligne.
  zones: { display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 },
  zone: { display: 'flex', flexDirection: 'column', gap: 4, padding: '12px clamp(8px, 2vw, 16px)', minWidth: 0 },
  zoneTitre: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', fontFamily: 'var(--font)', color: 'var(--text)' },
  // Gabarit du bouton secondaire de Btn (38 px), écrit par les jetons --btn-*.
  rangerBtn: { padding: '8px 16px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r-full)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 38, whiteSpace: 'nowrap' },
  // Rangement en cours : fond de sélection et trait d'encre, pas d'accent.
  rangerBtnActif: { borderColor: 'var(--onglet)', background: 'var(--selection)', fontWeight: 'var(--g3)' },
  astuceZones: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 'var(--t1)', color: 'var(--text2)', padding: '8px 0', lineHeight: 1.45 },
  catTitre: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', margin: '8px 0 0' },
  catCompte: { fontWeight: 'var(--g2)', color: 'var(--text3, var(--text2))' },
  // Les produits d'une catégorie : des lignes de liste (ligneStyle de ui),
  // sur autant de colonnes que la largeur en offre.
  lignes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', columnGap: 24, rowGap: 0 },
  ligne: { ...ligneStyle(), flexWrap: 'wrap', gap: 10, padding: '4px 0', boxSizing: 'border-box' },
  // Les cases sur toute la largeur de la ligne, sous le nom et le champ.
  casesLigne: { flexBasis: '100%', minWidth: 0 },
  nomLigne: { display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 },
  nom: { flex: '1 1 auto', minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', wordBreak: 'break-word', lineHeight: 1.3 },
  // Lien discret, cible tactile de 32 px sans agrandir la ligne.
  modifierBtn: { flexShrink: 0, background: 'none', border: 'none', padding: '0 4px', minHeight: 32, marginTop: -7, color: 'var(--lien)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  indication: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  saisie: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' },
  egal: { width: 40, height: 44, borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t3)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  // Le contour vert d'une quantité comptée reste : c'est l'état de la ligne.
  champ: { width: 92, height: 44, padding: '0 10px', textAlign: 'right', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  champCompte: { borderColor: 'var(--success-bd)' },
  unite: { height: 44, padding: '0 4px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', cursor: 'pointer', maxWidth: 64 },
};
