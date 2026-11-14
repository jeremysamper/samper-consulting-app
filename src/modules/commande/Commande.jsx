import React from 'react';
import { dbService } from '../../services/dbService.js';
import { confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { ChevronDown, ChevronRight, LayoutGrid, ListChecks, ShoppingBasket, Trash2 } from 'lucide-react';
import { Fenetre } from '../../components/ui/Fenetres.jsx';
import { Btn, CarteRepere, Panneau, SegmentedTabs, ligneStyle } from '../../components/ui/index.jsx';
import './commande.css';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import AccueilCommande from './AccueilCommande.jsx';
import { normalizeSearch } from '../../utils/searchText.js';
import { readText, writeText } from '../../utils/storage.js';
import { useCartes } from '../../hooks/useCartes.js';
import { AUTRES, RAYONS, classerProduit, trierRayons } from './classerProduit.js';
import {
  besoinsDeCarte, besoinsFondsDeCuisine, contexteCommande, filtrerGroupes, nomCle, platsParProduit,
} from './besoinsParCarte.js';
import { messageErreur } from '../../utils/messageErreur.js';

// Rayon affiché d'une ligne : sa catégorie enregistrée, ou, si elle vaut
// « Autres » (ajouts sans catégorie), le rayon déduit de son nom.
const rayonDe = (item) => classerProduit(item?.nom, null, item?.categorie);

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDE - un onglet par carte, plus « Ma commande » et « Fonds de cuisine ».
// Dans l'onglet d'une carte, une carte blanche par plat, repliable, et dans
// chaque plat les ingrédients rangés par fiche (besoinsParCarte.js, calculé
// en direct depuis les fiches). On coche ce qu'il faut commander : une case
// vaut pour le produit, partout où il apparaît. « Ma commande » rassemble ce
// qui est coché, rangé par rayon, avec la quantité à commander ; c'est elle
// qui part en PDF ou à l'imprimante.
// Visible de tous les rôles qui ont le module ; les cartes cachées restent
// au seul consultant (useCartes). Les lignes cochées vivent dans
// commande_items, partagée par l'établissement.
// Direction Galet : la liste à gauche, les repères et les gros boutons à
// droite à l'ordinateur (commande.css). Aucun montant.
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_ID = 'commande-print';
const ONGLET_COMMANDE = 'commande';
const ONGLET_FONDS = 'fonds';
const cleOnglet = (etabId) => 'sc_commande_onglet_' + etabId;

// Unité de la quantité à commander : on commande au kilo et au litre.
const uniteDeCommande = (unite) => (unite === 'g' ? 'kg' : unite === 'ml' ? 'L' : (unite === 'pcs' ? 'pcs' : unite || ''));

// Nombres dans leurs propres nœuds : la phrase autour reste une entrée du
// glossaire.
const N = ({ children }) => <span data-no-translate="">{children}</span>;

const Commande = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const isConsultant = user?.role === 'consultant';

  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [collapsed, setCollapsed] = React.useState(new Set());
  const [busy, setBusy] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  // Saisie locale des quantites (persistee au blur) pour ne pas perdre le focus.
  const [draftQty, setDraftQty] = React.useState({});
  // Renommage en ligne d'un produit : id de la ligne en cours d'edition + brouillon du nom.
  const [editingId, setEditingId] = React.useState(null);
  const [draftName, setDraftName] = React.useState('');
  // Produits dont l'écriture est en cours : la case attend la base.
  const [enCours, setEnCours] = React.useState(() => new Set());
  // Plats dépliés, par onglet.
  const [ouverts, setOuverts] = React.useState({});

  // Cartes : source unique, cartes cachées filtrées selon le rôle.
  const { cartes, status: cartesStatus } = useCartes(etabId, { role: user?.role });
  // Fiches : plats, recettes et catalogue, lus pour tous les rôles du module.
  const [fiches, setFiches] = React.useState({ status: 'loading', plats: [], recettes: [], catalogue: [] });
  const [essaiFiches, setEssaiFiches] = React.useState(0);

  // ── Chargement + realtime (liste partagee) ──
  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return undefined; }
    let mounted = true;
    const reload = async () => {
      try { const rows = await legacySB.db.listCommandeItems(etabId); if (mounted) setItems(Array.isArray(rows) ? rows : []); }
      catch (e) { /* realtime relancera */ }
      finally { if (mounted) setLoading(false); }
    };
    reload();
    const unsub = legacySB.realtime.subscribeReload('commande_items', reload);
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  React.useEffect(() => {
    if (!legacySB) { setFiches({ status: 'ready', plats: [], recettes: [], catalogue: [] }); return undefined; }
    let mounted = true;
    setFiches(f => ({ ...f, status: 'loading' }));
    Promise.all([
      legacySB.db.listPlats(etabId, { strict: true }),
      legacySB.db.listRecettes(etabId, { strict: true }),
      legacySB.db.listProduits(etabId),
    ]).then(([plats, recettes, catalogue]) => {
      if (mounted) setFiches({ status: 'ready', plats: plats || [], recettes: recettes || [], catalogue: catalogue || [] });
    }).catch(() => {
      if (mounted) setFiches(f => ({ ...f, status: 'error' }));
    });
    return () => { mounted = false; };
  }, [etabId, essaiFiches]);

  const ctx = React.useMemo(
    () => (fiches.status === 'ready' ? contexteCommande(fiches) : null),
    [fiches],
  );

  // ── Ce qui est coché : par clé et par nom (une ligne renommée garde sa clé) ──
  const commande = React.useMemo(() => items.filter(i => i.coche), [items]);
  const coches = React.useMemo(() => ({
    cles: new Set(commande.map(i => i.cle)),
    noms: new Set(commande.map(i => nomCle(i.nom))),
  }), [commande]);
  // Une clé produit porte le nom normalisé (cleProduit) : « nom:<nom> ».
  const estCleCochee = React.useCallback((cle) => coches.cles.has(cle) || coches.noms.has(String(cle).slice(4)), [coches]);
  const estCochee = React.useCallback((l) => estCleCochee(l.cle) || coches.noms.has(nomCle(l.nom)), [coches, estCleCochee]);
  const lignesEnBase = (l) => items.filter(r => r.cle === l.cle || nomCle(r.nom) === nomCle(l.nom));

  // ── Onglets ──
  const tabsPrets = cartesStatus !== 'loading' && !loading;
  const onglets = React.useMemo(() => [
    { id: ONGLET_COMMANDE, label: <>Ma commande{commande.length > 0 && <> <N>{commande.length}</N></>}</> },
    ...cartes.map(c => ({ id: c.id, label: <>{c.nom || 'Carte sans nom'}{c.masquee ? ' (cachée)' : ''}</> })),
    { id: ONGLET_FONDS, label: 'Fonds de cuisine' },
  ], [cartes, commande.length]);
  const [ongletChoisi, setOngletChoisi] = React.useState(() => readText(cleOnglet(etabId), ''));
  React.useEffect(() => { setOngletChoisi(readText(cleOnglet(etabId), '')); }, [etabId]);
  // Onglet d'ouverture : le dernier choisi sur ce poste s'il existe encore,
  // sinon « Ma commande » si elle a du contenu, sinon la première carte.
  const onglet = onglets.some(o => o.id === ongletChoisi)
    ? ongletChoisi
    : (commande.length > 0 ? ONGLET_COMMANDE : (cartes[0]?.id || ONGLET_FONDS));
  const choisirOnglet = (id) => {
    setOngletChoisi(id);
    writeText(cleOnglet(etabId), id);
    setSearch('');
  };
  // La bande d'onglets défile : l'onglet choisi reste en vue (au téléphone,
  // une carte loin à droite s'ouvrirait hors champ).
  const bandeRef = React.useRef(null);
  React.useEffect(() => {
    if (!tabsPrets) return;
    const actif = bandeRef.current?.querySelector('[aria-selected="true"]');
    actif?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [onglet, tabsPrets]);

  const carteActive = cartes.find(c => c.id === onglet) || null;
  const besoins = React.useMemo(() => {
    if (onglet === ONGLET_FONDS) return besoinsFondsDeCuisine();
    if (!carteActive || !ctx) return null;
    return besoinsDeCarte(carteActive, ctx);
  }, [onglet, carteActive, ctx]);
  const ouDansCarte = React.useMemo(() => platsParProduit(besoins?.groupes), [besoins]);

  // ── Cocher / décocher un produit (toutes ses occurrences) ──
  const marquerEnCours = (cle, oui) => setEnCours(prev => {
    const n = new Set(prev);
    if (oui) n.add(cle); else n.delete(cle);
    return n;
  });

  const ecrireLigne = async (row) => {
    if (!legacySB) return row;
    return legacySB.db.upsertCommandeItem(row);
  };

  const toggleLigne = async (l) => {
    if (enCours.has(l.cle)) return;
    const rows = lignesEnBase(l);
    const cocher = !estCochee(l);
    marquerEnCours(l.cle, true);
    try {
      if (cocher) {
        const cible = rows.find(r => r.cle === l.cle) || rows[0];
        if (cible) {
          setItems(prev => prev.map(i => (i.id === cible.id ? { ...i, coche: true } : i)));
          await ecrireLigne({ ...cible, coche: true });
        } else {
          const neuve = {
            etablissementId: etabId,
            cle: l.cle,
            produitId: null,
            nom: l.nom,
            categorie: l.rayon || AUTRES,
            unite: uniteDeCommande(l.unite),
            besoin: 0,
            quantite: null,
            coche: true,
            source: 'auto',
          };
          const tmpId = 'tmp:' + l.cle;
          setItems(prev => [...prev, { ...neuve, id: tmpId }]);
          try {
            const saved = await ecrireLigne(neuve);
            setItems(prev => prev.map(i => (i.id === tmpId ? (saved || { ...neuve, id: tmpId }) : i)));
          } catch (err) {
            setItems(prev => prev.filter(i => i.id !== tmpId));
            throw err;
          }
        }
      } else {
        const cochees = rows.filter(r => r.coche);
        setItems(prev => prev.map(i => (cochees.some(r => r.id === i.id) ? { ...i, coche: false } : i)));
        await Promise.all(cochees.map(r => ecrireLigne({ ...r, coche: false })));
      }
    } catch (err) {
      notifyLegacy(messageErreur(err, 'commande'), 'error');
      // La liste de la base fait foi après un échec.
      if (legacySB) {
        try { const fresh = await legacySB.db.listCommandeItems(etabId); setItems(Array.isArray(fresh) ? fresh : []); }
        catch { /* realtime relancera */ }
      }
    } finally {
      marquerEnCours(l.cle, false);
    }
  };

  // ── Ma commande : quantité, renommage, retrait ──
  const persistQuantite = async (item) => {
    const raw = draftQty[item.id];
    if (raw === undefined) return;
    const val = raw === '' ? null : Number(raw);
    setDraftQty(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    if (val === item.quantite) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantite: val } : i));
    if (legacySB) {
      try { await legacySB.db.upsertCommandeItem({ ...item, quantite: val }); }
      catch (err) { notifyLegacy(messageErreur(err, 'commande'), 'error'); }
    }
  };

  const startRename = (item) => { setEditingId(item.id); setDraftName(item.nom || ''); };
  const renameItem = async (item, newNom) => {
    const nom = String(newNom || '').trim();
    setEditingId(null);
    if (!nom || nom === item.nom) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, nom } : i));
    if (legacySB) {
      try { await legacySB.db.upsertCommandeItem({ ...item, nom }); }
      catch (err) { notifyLegacy(messageErreur(err, 'commande'), 'error'); }
    }
  };

  // Retirer de la commande : un produit d'une carte se décoche (on peut le
  // recocher dans sa carte) ; un produit ajouté à la main se supprime.
  const retirer = async (item) => {
    if (item.source === 'manual') {
      if (!confirmLegacy('Retirer ce produit de la liste ?')) return;
      setItems(prev => prev.filter(i => i.id !== item.id));
      if (legacySB) {
        try { await legacySB.db.deleteCommandeItem(item.id); }
        catch (err) { notifyLegacy(messageErreur(err, 'commande'), 'error'); }
      }
      return;
    }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, coche: false } : i));
    if (legacySB) {
      try { await legacySB.db.upsertCommandeItem({ ...item, coche: false }); }
      catch (err) { notifyLegacy(messageErreur(err, 'commande'), 'error'); }
    }
  };

  // Une fois la commande passée : tout se décoche, les quantités s'effacent,
  // les ajouts à la main partent.
  const viderCommande = async () => {
    if (!commande.length) return;
    if (!confirmLegacy('Vider la commande ?\n\nTous les produits sont décochés et les quantités effacées. Les produits ajoutés à la main sont retirés.')) return;
    setBusy(true);
    const avant = commande;
    setItems(prev => prev
      .filter(i => !(i.coche && i.source === 'manual'))
      .map(i => (i.coche ? { ...i, coche: false, quantite: null } : i)));
    if (legacySB) {
      const res = await Promise.allSettled(avant.map(i => (i.source === 'manual'
        ? legacySB.db.deleteCommandeItem(i.id)
        : legacySB.db.upsertCommandeItem({ ...i, coche: false, quantite: null }))));
      const echec = res.find(r => r.status === 'rejected');
      if (echec) notifyLegacy('Commande vidée en partie. ' + messageErreur(echec.reason, 'commande'), 'error');
      try { const fresh = await legacySB.db.listCommandeItems(etabId); setItems(Array.isArray(fresh) ? fresh : []); }
      catch { /* realtime relancera */ }
    }
    setBusy(false);
  };

  const addManual = async ({ nom, categorie, unite }) => {
    const cleanNom = String(nom || '').trim();
    if (!cleanNom) return;
    // Déjà connu (coché puis retiré, ou dans une carte) : on le recoche.
    const existant = items.find(i => nomCle(i.nom) === nomCle(cleanNom));
    if (existant) {
      if (!existant.coche) {
        setItems(prev => prev.map(i => i.id === existant.id ? { ...i, coche: true } : i));
        try { await ecrireLigne({ ...existant, coche: true }); }
        catch (err) { notifyLegacy(messageErreur(err, 'commande'), 'error'); return; }
      }
      setShowAdd(false);
      return;
    }
    const item = {
      etablissementId: etabId,
      cle: 'manual:' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      produitId: null,
      nom: cleanNom,
      categorie: categorie || 'Autres',
      unite: unite || '',
      besoin: 0,
      quantite: null,
      coche: true,
      source: 'manual',
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertCommandeItem(item);
        setItems(prev => [...prev, saved]);
      } catch (err) { notifyLegacy(messageErreur(err, 'commande'), 'error'); return; }
    } else {
      setItems(prev => [...prev, { ...item, id: item.cle }]);
    }
    setShowAdd(false);
  };

  // ── Derives ──
  const searchVal = normalizeSearch(search.trim());
  const correspond = searchVal ? (txt) => normalizeSearch(txt || '').includes(searchVal) : null;
  const commandeFiltree = commande.filter(i => !correspond || correspond(i.nom));
  const groupesCommande = groupByCategorie(commandeFiltree);
  const groupesVus = besoins ? filtrerGroupes(besoins.groupes, correspond) : [];
  const totalOnglet = besoins ? besoins.cles.length : 0;
  const cochesOnglet = besoins ? besoins.cles.filter(estCleCochee).length : 0;
  const rayonsCount = new Set(commande.map(rayonDe)).size;
  const manuelsCount = commande.filter(i => i.source === 'manual').length;
  const sansFiche = besoins ? besoins.groupes.filter(g => g.sansFiche).length : 0;
  const plusieursCategories = besoins ? new Set(besoins.groupes.map(x => x.categorie)).size > 1 : false;

  const ouvertsOnglet = ouverts[onglet] || null;
  // Dépli par défaut : tout ouvert dans les fonds, dans une carte de deux plats
  // au plus, et pendant une recherche ; sinon tout replié, la carte se lit
  // d'abord par ses plats.
  const parDefautOuvert = onglet === ONGLET_FONDS || (besoins && besoins.groupes.length <= 2);
  const estOuvert = (id) => !!searchVal || (ouvertsOnglet ? ouvertsOnglet.has(id) : parDefautOuvert);
  const basculer = (id) => setOuverts(prev => {
    const base = prev[onglet] || new Set(parDefautOuvert ? (besoins?.groupes || []).map(g => g.id) : []);
    const n = new Set(base);
    if (n.has(id)) n.delete(id); else n.add(id);
    return { ...prev, [onglet]: n };
  });

  // Charge utile du PDF : ce qui est coché, par rayon, avec une case vide à
  // cocher à la réception.
  const buildPdfPayload = () => {
    const fmtQty = (q) => (Math.round(Number(q) * 100) / 100).toString().replace('.', ',');
    const cartesConcernees = ctx
      ? cartes.filter(c => besoinsDeCarte(c, ctx).cles.some(estCleCochee)).map(c => c.nom).filter(Boolean)
      : [];
    return {
      totalCount: commande.length,
      sansCompteurCoche: true,
      cartesLabel: cartesConcernees.join(', '),
      groups: groupByCategorie(commande).map(g => ({
        categorie: g.categorie,
        items: g.items.map(it => ({
          nom: it.nom,
          qtyText: it.quantite != null ? `${fmtQty(it.quantite)}${it.unite ? ' ' + it.unite : ''}` : '',
          coche: false,
        })),
      })),
    };
  };
  const exportPdf = () => {
    if (!commande.length) { notifyLegacy('La commande est vide.', 'info'); return; }
    pdfUtils?.exportCommandePdf?.(buildPdfPayload(), {
      etablissement, filename: `commande-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };
  const printList = () => {
    if (!commande.length) { notifyLegacy('La commande est vide.', 'info'); return; }
    pdfUtils?.exportCommandePdf?.(buildPdfPayload(), { etablissement, autoPrint: true });
  };

  if (loading || cartesStatus === 'loading') {
    return <Panneau><div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 'var(--t2)' }}>Chargement…</div></Panneau>;
  }

  const ongletCommande = onglet === ONGLET_COMMANDE;

  return (
    <div className="commande-page">
      {/* Libellé lu par les lecteurs d'écran devant le nom de chaque produit
          (aria-labelledby de la quantité). */}
      <span id="commande-lbl-qte" hidden>Quantité</span>
      <div className="commande-grille">
        <div className="commande-cote">
          {/* Gros boutons : ajouter, envoyer (commande non vide). */}
          <AccueilCommande
            listeVide={commande.length === 0}
            busy={busy}
            onAjouter={() => setShowAdd(true)}
            onPdf={exportPdf}
            onImprimer={printList}
            onVider={viderCommande}
          />
          <div className="commande-reperes no-print" data-commande-reperes="">
            {ongletCommande ? (
              <>
                <CarteRepere
                  Icone={ShoppingBasket}
                  valeur={commande.length}
                  libelle={commande.length > 1 ? 'produits à commander' : 'produit à commander'}
                />
                <CarteRepere
                  Icone={LayoutGrid}
                  valeur={rayonsCount}
                  libelle={rayonsCount > 1 ? 'rayons' : 'rayon'}
                  detail={manuelsCount > 0 ? <><N>{manuelsCount}</N> {manuelsCount > 1 ? 'ajoutés à la main' : 'ajouté à la main'}</> : null}
                />
              </>
            ) : besoins ? (
              <>
                <CarteRepere
                  Icone={ListChecks}
                  valeur={cochesOnglet}
                  libelle={<>{cochesOnglet > 1 ? 'cochés sur' : 'coché sur'} <N>{totalOnglet}</N> {totalOnglet > 1 ? 'produits' : 'produit'}</>}
                />
                <CarteRepere
                  Icone={LayoutGrid}
                  valeur={besoins.groupes.length}
                  libelle={onglet === ONGLET_FONDS ? (besoins.groupes.length > 1 ? 'listes' : 'liste') : (besoins.groupes.length > 1 ? 'plats' : 'plat')}
                  detail={sansFiche > 0 ? <><N>{sansFiche}</N> sans fiche technique</> : null}
                />
              </>
            ) : null}
          </div>
        </div>

        <div className="commande-corps">
          {tabsPrets && (
            <div ref={bandeRef} style={{ minWidth: 0 }}>
              <SegmentedTabs tabs={onglets} active={onglet} onChange={choisirOnglet} retourLigne />
            </div>
          )}
          {/* La loupe, puis l'avancement de l'onglet : la barre est muette, le
              compte est dit par le premier repère. */}
          <div style={s.ligneEtat} className="no-print">
            <SearchToggle
              value={search}
              onChange={setSearch}
              placeholder={ongletCommande ? 'Rechercher un produit…' : 'Rechercher un plat ou un produit…'}
            />
            {!ongletCommande && totalOnglet > 0 && (
              <div aria-hidden="true" style={s.progressBar}><div style={{ ...s.progressFill, width: `${(cochesOnglet / totalOnglet) * 100}%` }} /></div>
            )}
          </div>

          {ongletCommande ? (
            <div id={PRINT_ID} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {commande.length === 0 ? (
                <Panneau style={s.empty}>
                  <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', fontFamily: 'var(--font)' }}>Rien à commander pour l'instant</div>
                  <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 8, maxWidth: 420 }}>
                    Cochez des produits dans les onglets des cartes, ou ajoutez un produit.
                  </div>
                </Panneau>
              ) : groupesCommande.length === 0 ? (
                <Panneau style={s.empty}><div style={{ fontSize: 'var(--t2)', color: 'var(--text3)' }}>Aucun produit pour ce filtre.</div></Panneau>
              ) : (
                groupesCommande.map(group => {
                  const isCollapsed = collapsed.has(group.categorie);
                  return (
                    <Panneau key={group.categorie} style={s.section}>
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        style={{ ...s.sectionHead, ...(isCollapsed ? s.sectionHeadSeul : null) }}
                        onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(group.categorie) ? n.delete(group.categorie) : n.add(group.categorie); return n; })}
                      >
                        <span style={{ display: 'inline-flex', color: 'var(--text3)' }} className="no-print">{!isCollapsed ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</span>
                        <span style={s.sectionTitle}>{group.categorie}</span>
                        <span style={s.sectionCount}>{group.items.length}</span>
                      </button>
                      {!isCollapsed && group.items.map((item, i) => (
                        <div key={item.id} style={{ ...ligneStyle({ derniere: i === group.items.length - 1 }), ...s.row }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {editingId === item.id ? (
                              <input
                                autoFocus
                                value={draftName}
                                onChange={e => setDraftName(e.target.value)}
                                onBlur={() => renameItem(item, draftName)}
                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setEditingId(null); }}
                                style={s.nameInput}
                              />
                            ) : (
                              <div
                                id={`commande-nom-${item.id}`}
                                style={s.rowName}
                                onDoubleClick={() => startRename(item)}
                                title="Double-cliquer pour renommer"
                              >
                                {item.nom}
                                {item.source === 'manual' && <span style={s.tag}>ajouté</span>}
                              </div>
                            )}
                          </div>
                          <div style={s.qtyWrap}>
                            <input
                              type="number" min="0" step="any"
                              value={draftQty[item.id] !== undefined ? draftQty[item.id] : (item.quantite ?? '')}
                              placeholder="Qté"
                              aria-labelledby={`commande-lbl-qte commande-nom-${item.id}`}
                              onChange={e => setDraftQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                              onBlur={() => persistQuantite(item)}
                              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              style={s.qtyInput}
                            />
                            <span style={s.qtyUnit}>{item.unite}</span>
                          </div>
                          <button type="button" style={s.delBtn} className="no-print" onClick={() => retirer(item)} title="Retirer" aria-label="Retirer"><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                      ))}
                    </Panneau>
                  );
                })
              )}
            </div>
          ) : onglet !== ONGLET_FONDS && fiches.status === 'error' ? (
            <Panneau style={s.empty}>
              <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)' }}>Les fiches n'ont pas pu être lues.</div>
              <Btn variant="ghost" style={{ marginTop: 12 }} onClick={() => setEssaiFiches(n => n + 1)}>Réessayer</Btn>
            </Panneau>
          ) : !besoins ? (
            <Panneau style={s.empty}><div style={{ fontSize: 'var(--t2)', color: 'var(--text3)' }}>Chargement des fiches…</div></Panneau>
          ) : besoins.groupes.length === 0 ? (
            <Panneau style={s.empty}><div style={{ fontSize: 'var(--t2)', color: 'var(--text2)' }}>Aucun plat sur cette carte.</div></Panneau>
          ) : groupesVus.length === 0 ? (
            <Panneau style={s.empty}><div style={{ fontSize: 'var(--t2)', color: 'var(--text3)' }}>Aucun plat ni produit pour ce filtre.</div></Panneau>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groupesVus.map((g, i) => {
                // Catégorie de plat (entrées, plats, desserts) posée avant son
                // premier plat, quand la carte en a plusieurs.
                const titreCategorie = plusieursCategories && g.categorie && (i === 0 || groupesVus[i - 1].categorie !== g.categorie) ? g.categorie : null;
                return (
                  <React.Fragment key={g.id}>
                    {titreCategorie && <div style={s.categorie}>{titreCategorie}</div>}
                    <GroupeProduits
                      groupe={g}
                      ouvert={estOuvert(g.id)}
                      onBasculer={() => basculer(g.id)}
                      estCochee={estCochee}
                      enCours={enCours}
                      onToggle={toggleLigne}
                      ouDansCarte={ouDansCarte}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddProductModal onClose={() => setShowAdd(false)} onAdd={addManual} />}
    </div>
  );
};

// ── Un plat (ou une liste des fonds) : en-tête repliable, lignes par fiche ──
const GroupeProduits = ({ groupe, ouvert, onBasculer, estCochee, enCours, onToggle, ouDansCarte }) => {
  const lignesCommandables = groupe.sections.flatMap(sec => sec.lignes.filter(l => !l.preparation));
  const vues = new Set();
  let cochees = 0;
  lignesCommandables.forEach(l => {
    if (vues.has(l.cle)) return;
    vues.add(l.cle);
    if (estCochee(l)) cochees += 1;
  });
  const total = vues.size;
  const derniereSection = groupe.sections.length - 1;
  return (
    <Panneau style={s.section}>
      <button
        type="button"
        aria-expanded={ouvert}
        style={{ ...s.sectionHead, ...(ouvert ? null : s.sectionHeadSeul) }}
        onClick={onBasculer}
      >
        <span style={{ display: 'inline-flex', color: 'var(--text3)' }}>{ouvert ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</span>
        <span style={s.groupeTitre}>{groupe.titre}</span>
        {groupe.sansFiche && <span style={s.tag}>sans fiche technique</span>}
        {total > 0 && (
          <span style={{ ...s.sectionCount, ...(cochees > 0 ? s.sectionCountActif : null) }}>
            <N>{cochees}</N> sur <N>{total}</N>
          </span>
        )}
      </button>
      {ouvert && groupe.sections.map((sec, si) => (
        <div key={sec.id}>
          {sec.titre && <div style={s.ficheTitre}>{sec.titre}</div>}
          {sec.lignes.map((l, li) => {
            const derniere = si === derniereSection && li === sec.lignes.length - 1;
            if (l.preparation) {
              return (
                <div key={l.cle} style={{ ...ligneStyle({ derniere }), ...s.row, color: 'var(--text2)' }}>
                  <span style={s.caseVide} aria-hidden="true" />
                  <span style={s.ligneNom}>{l.nom}<span style={s.tag}>préparation</span></span>
                  {l.quantite && <span style={s.ligneQte} data-no-translate="">{l.quantite}</span>}
                </div>
              );
            }
            const coche = estCochee(l);
            const autres = coche ? (ouDansCarte.get(l.cle) || []).filter(t => t !== groupe.titre) : [];
            return (
              <label key={l.cle} style={{ ...ligneStyle({ derniere }), ...s.row, ...(coche ? s.rowChoisie : null), cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={coche}
                  disabled={enCours.has(l.cle)}
                  onChange={() => onToggle(l)}
                  style={s.case}
                />
                <span style={s.ligneNom}>
                  {l.nom}
                  {autres.length === 1 && <span style={s.tag}>aussi dans <span>{autres[0]}</span></span>}
                  {autres.length > 1 && <span style={s.tag}>aussi dans <N>{autres.length}</N> autres plats</span>}
                </span>
                {l.quantite && <span style={s.ligneQte} data-no-translate="">{l.quantite}</span>}
              </label>
            );
          })}
        </div>
      ))}
    </Panneau>
  );
};

// ── Modale d'ajout manuel ──
const AddProductModal = ({ onClose, onAdd }) => {
  const [nom, setNom] = React.useState('');
  // null = catégorie automatique, déduite du nom pendant la frappe. Dès que
  // l'opérateur choisit lui-même, son choix est gardé.
  const [categorieChoisie, setCategorieChoisie] = React.useState(null);
  const categorie = categorieChoisie || classerProduit(nom);
  const [unite, setUnite] = React.useState('');
  // Mêmes rayons que la liste. « Hygiène / non alimentaire » est le libellé du
  // catalogue ; à la main, on range sous « Hygiène & consommables ».
  const CATS = RAYONS.filter(c => c !== 'Hygiène / non alimentaire');
  const UNITES = ['', 'g', 'kg', 'ml', 'L', 'pcs'];
  return (
    <Fenetre
      id="commande-ajouter"
      titre="Ajouter un produit"
      onClose={onClose}
      largeur={420}
      pied={(
        <>
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" disabled={!nom.trim()} onClick={() => onAdd({ nom, categorie, unite })}>Ajouter</Btn>
        </>
      )}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={s.label}>Produit *</label>
            <input autoFocus style={s.input} value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Ex : Beurre doux" onKeyDown={e => { if (e.key === 'Enter' && nom.trim()) onAdd({ nom, categorie, unite }); }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>Catégorie</label>
              <select style={s.input} value={categorie} onChange={e => setCategorieChoisie(e.target.value)}>
                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {!categorieChoisie && nom.trim() && categorie !== AUTRES && (
                <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)', marginTop: 4 }}>Déduite du nom, modifiable.</div>
              )}
            </div>
            <div style={{ width: 110 }}>
              <label style={s.label}>Unité</label>
              <select style={s.input} value={unite} onChange={e => setUnite(e.target.value)}>
                {UNITES.map(u => <option key={u} value={u}>{u || '-'}</option>)}
              </select>
            </div>
          </div>
        </div>
    </Fenetre>
  );
};

// Groupes par rayon, dans l'ordre d'une tournée de réception (frais, puis
// sec, puis non alimentaire), « Autres » en dernier : cf. RAYONS.
function groupByCategorie(list) {
  const map = new Map();
  list.forEach(i => {
    const c = rayonDe(i);
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(i);
  });
  return [...map.keys()].sort(trierRayons).map(categorie => ({
    categorie,
    items: map.get(categorie).slice().sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr')),
  }));
}

const s = {
  // Une seule ligne : la loupe à gauche, la barre d'avancement dans l'espace restant.
  ligneEtat: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  // Barre d'avancement : une piste en pilule, la part cochée à l'accent.
  progressBar: { flex: 1, minWidth: 0, height: 8, background: 'var(--piste)', borderRadius: 'var(--r-full)', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 'var(--r-full)', transition: 'width 0.2s' },
  // Carte d'un rayon ou d'un plat (Panneau) : sans retrait, l'en-tête et les lignes posent le leur.
  section: { padding: 0, overflow: 'hidden' },
  // En-tête repliable : un bouton (clavier, aria-expanded). Le filet bas passe
  // par une ombre intérieure : avec une bordure, la règle « Plus de carrés »
  // le prendrait pour une ligne de liste.
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 'var(--ligne-aeree)', padding: '8px 16px', background: 'transparent', border: 'none', boxShadow: 'inset 0 -1px 0 var(--rule-soft)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', color: 'inherit' },
  sectionHeadSeul: { boxShadow: 'none' },
  sectionTitle: { flex: 1, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  groupeTitre: { flex: 1, minWidth: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  sectionCount: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', background: 'var(--piste)', borderRadius: 'var(--r-full)', padding: '2px 10px', fontFamily: 'var(--font-num)', flexShrink: 0, whiteSpace: 'nowrap' },
  // Un plat entamé : son compte passe à l'aplat sombre du choix en cours.
  sectionCountActif: { background: 'var(--accent)', color: 'var(--on-accent)' },
  // Catégorie de plat, posée sur la page entre les cartes.
  categorie: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text2)', padding: '8px 4px 0' },
  // Titre d'une fiche dans un plat.
  ficheTitre: { padding: '12px 16px 2px', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text3)' },
  // Ligne d'un produit : le style partagé d'une ligne de liste (ligneStyle),
  // plus son retrait.
  row: { padding: '6px 16px' },
  // Produit coché : la ligne choisie de la direction (--selection).
  rowChoisie: { background: 'var(--selection)' },
  case: { width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0, margin: 0 },
  caseVide: { width: 18, flexShrink: 0 },
  ligneNom: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', overflowWrap: 'anywhere' },
  ligneQte: { flexShrink: 0, fontSize: 'var(--t1)', color: 'var(--text2)', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' },
  rowName: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' },
  nameInput: { width: '100%', padding: '5px 8px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' },
  tag: { marginLeft: 8, fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', background: 'var(--piste)', borderRadius: 'var(--r-full)', padding: '1px 8px', whiteSpace: 'nowrap', display: 'inline-block' },
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  qtyInput: { width: 70, padding: '6px 8px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', textAlign: 'right', fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)' },
  qtyUnit: { fontSize: 'var(--t1)', color: 'var(--text2)', width: 26 },
  // Retirer : un cercle de 40 px dans une cible de 44 px.
  delBtn: { width: 44, height: 44, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 'var(--r-full)' },
  empty: { padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  label: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '9px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none' },
};

export default Commande;
