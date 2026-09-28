import React from 'react';
import { dbService } from '../../services/dbService.js';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { normalizeName } from '../../services/recipeProductMatching.js';
import { cleProduit, ligneLibre } from './inventaireLignes.js';
import {
  TYPES_DOCUMENT, libelleType, devinerTypeDocument, periodeInventaire, dansPeriode,
  statutsDocuments, trouverDoublon, quantiteEnUniteInventaire,
  construireContexteRapprochement, rapprocherLigneDoc, calculerConsommation,
  SEUIL_ECART_PRIX_PCT, nomDepuisLibelle,
} from './achatsLogic.js';

// ─────────────────────────────────────────────────────────────────────────────
// Onglet « Achats & consommation » de l'inventaire.
//
// On dépose d'un coup toutes les factures et tous les bons de la période
// (PDF reçus par mail, photos). L'IA lit chaque document, ses lignes sont
// rattachées aux produits de l'inventaire, et le module calcule :
//
//   consommation = stock de début + achats - stock de fin
//
// Principe de sûreté : l'IA ne fait que LIRE. Elle n'écrit ni dans le
// catalogue ni dans les prix ; les prix de l'inventaire ne changent que sur
// un bouton explicite, et un rattachement douteux attend une décision.
//
// La lecture IA est réservée au consultant (ai-proxy refuse les autres
// rôles) ; le patron voit les documents et le calcul.
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENCE = 3;

const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');
const qte = (n) => (n == null ? '-' : String(+Number(n).toFixed(3)));

// Unité de comptage d'un produit créé depuis une ligne de document. Un
// liquide livré « 6 x 75 cl » se compte en bouteilles, comme au bar ; le
// reste en kg, en L ou à la pièce.
const uniteDepuisLigneDoc = (l) => {
  if (l.uniteTotale === 'ml') {
    const m = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l)\b/i.exec(String(l.conditionnement || l.libelle || ''));
    if (m) {
      const facteur = { ml: 1, cl: 10, dl: 100, l: 1000 }[m[3].toLowerCase()];
      const contenance = Number(m[2].replace(',', '.')) * facteur;
      if (contenance > 0 && contenance <= 1500) return 'btl';
    }
    return 'L';
  }
  return l.uniteTotale === 'g' ? 'kg' : 'pcs';
};

export default function AchatsPanel({
  user, etabId, perimetreActif, perimetres, inv, previousInv, catalogue,
  canImport, canEditLignes, onAjouterLignes, onMajPrix,
}) {
  const legacySB = dbService.getBridge();
  // null = chargement, 'absente' = migration non appliquée, [] = aucun document
  const [docs, setDocs] = React.useState(null);
  const [loadError, setLoadError] = React.useState(false);
  const docsRef = React.useRef([]);
  const [aliasCatalogue, setAliasCatalogue] = React.useState([]);
  const [fournisseurs, setFournisseurs] = React.useState([]);

  const [file, setFile] = React.useState([]); // travaux de lecture
  const [typeImport, setTypeImport] = React.useState('auto');
  const [grouper, setGrouper] = React.useState(false);
  const [tousDocs, setTousDocs] = React.useState(false);
  const [docOuvert, setDocOuvert] = React.useState(null);
  const [creations, setCreations] = React.useState({}); // cle libellé -> nom en cours
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const enCoursRef = React.useRef(0);
  const attenteRef = React.useRef([]);

  const majDocs = React.useCallback((calculer) => {
    const liste = Array.isArray(docsRef.current) ? docsRef.current : [];
    docsRef.current = calculer(liste);
    setDocs(docsRef.current);
  }, []);

  // ── Chargement ──
  const reload = React.useCallback(async () => {
    if (!legacySB) { setDocs([]); return; }
    try {
      const liste = await legacySB.db.listAchatsDocuments(etabId);
      if (liste === null) { docsRef.current = []; setDocs('absente'); return; }
      docsRef.current = liste;
      setDocs(liste);
      setLoadError(false);
    } catch (err) {
      console.error('[AchatsPanel load]', err);
      setLoadError(true);
      setDocs(prev => (prev === null ? [] : prev));
    }
  }, [etabId]);

  React.useEffect(() => {
    docsRef.current = [];
    setDocs(null);
    reload();
    const unsub = legacySB?.realtime?.subscribeReload?.('achats_documents', reload);
    return () => { unsub && unsub(); };
  }, [etabId]);

  React.useEffect(() => {
    if (!legacySB) return;
    let vivant = true;
    legacySB.db.listProduitAliasEtab(etabId).then(a => { if (vivant) setAliasCatalogue(a || []); }).catch(() => {});
    legacySB.db.listFournisseurs(etabId).then(f => { if (vivant) setFournisseurs(f || []); }).catch(() => {});
    return () => { vivant = false; };
  }, [etabId]);

  const tableAbsente = docs === 'absente';
  const tousLesDocs = Array.isArray(docs) ? docs : [];

  // ── Période et documents du périmètre ──
  const periode = periodeInventaire(inv, previousInv);
  const docsPerimetre = React.useMemo(
    () => tousLesDocs.filter(d => ((d.perimetre || '').trim() || 'Général') === perimetreActif),
    [docs, perimetreActif],
  );
  const docsPeriode = React.useMemo(
    () => docsPerimetre.filter(d => dansPeriode(d.dateDocument, periode)),
    [docsPerimetre, periode.debut, periode.fin, periode.debutInclus],
  );
  const docsSansDate = docsPerimetre.filter(d => !d.dateDocument);
  const statuts = React.useMemo(() => statutsDocuments(docsPeriode), [docsPeriode]);

  // ── Rapprochement + calcul ──
  const produits = React.useMemo(() => {
    const m = new Map();
    [...(inv?.lignes || []), ...(previousInv?.lignes || [])].forEach(l => {
      const cle = cleProduit(l.produit);
      // Produits maison exclus : aucune facture ne peut les concerner.
      if (cle && !l.recetteId && !m.has(cle)) m.set(cle, { cle, nom: l.produit, unite: l.unite, prixUnit: Number(l.prixUnit) || 0 });
    });
    return Array.from(m.values());
  }, [inv, previousInv]);

  const ctx = React.useMemo(
    () => construireContexteRapprochement({ produits, documents: tousLesDocs, aliasCatalogue, catalogue }),
    [produits, docs, aliasCatalogue, catalogue],
  );

  const calcul = React.useMemo(
    () => calculerConsommation({ inv, previousInv, documents: docsPeriode, statuts, ctx }),
    [inv, previousInv, docsPeriode, statuts, ctx],
  );

  // Lignes à rattacher, une par libellé : décider une fois vaut pour tous
  // les documents qui portent ce libellé, ce mois-ci et les suivants.
  const aRattacher = React.useMemo(() => {
    const m = new Map();
    docsPeriode.forEach(d => {
      if (!statuts.get(d.id)?.compte) return;
      (d.lignes || []).forEach(l => {
        const r = rapprocherLigneDoc(l, ctx);
        if (r.mode !== 'aucun' && r.mode !== 'ambigu') return;
        const cle = normalizeName(l.libelle);
        if (!m.has(cle)) m.set(cle, { cle, ligne: l, fournisseur: d.fournisseurNom, suggestions: r.suggestions, montant: 0, occurrences: 0 });
        const e = m.get(cle);
        e.montant += Number(l.montantLigne) || 0;
        e.occurrences += 1;
      });
    });
    return Array.from(m.values()).sort((a, b) => b.montant - a.montant);
  }, [docsPeriode, statuts, ctx]);

  // ── Écritures ──
  const enregistrerDoc = async (doc) => {
    majDocs(liste => liste.map(d => (d.id === doc.id ? doc : d)));
    try {
      await legacySB.db.upsertAchatsDocument(doc);
    } catch (err) {
      notifyLegacy('Document non enregistré : ' + (err.message || err), 'error');
      reload();
    }
  };

  const supprimerDoc = async (doc) => {
    if (!confirmLegacy(`Supprimer le document ${libelleType(doc.typeDocument).toLowerCase()} ${doc.numero || ''} de ${doc.fournisseurNom || 'fournisseur inconnu'} ?\nIl sort du calcul des achats.`)) return;
    majDocs(liste => liste.filter(d => d.id !== doc.id));
    try { await legacySB.db.deleteAchatsDocument(doc.id); }
    catch (err) { notifyLegacy('Suppression impossible : ' + (err.message || err), 'error'); reload(); }
  };

  // Applique une décision à toutes les lignes portant ce libellé, dans tous
  // les documents de l'établissement.
  const decider = async (cleLibelle, patch) => {
    const cibles = (docsRef.current || []).filter(d => (d.lignes || []).some(l => normalizeName(l.libelle) === cleLibelle));
    for (const d of cibles) {
      await enregistrerDoc({
        ...d,
        lignes: d.lignes.map(l => (normalizeName(l.libelle) === cleLibelle ? { ...l, ...patch } : l)),
      });
    }
  };

  const rattacher = (cleLibelle, produitNom) => decider(cleLibelle, { lien: 'manuel', produitNom });
  const ignorer = (cleLibelle) => decider(cleLibelle, { lien: 'ignore', produitNom: null });
  const delier = (cleLibelle) => decider(cleLibelle, { lien: null, produitNom: null });

  // Crée la ligne d'inventaire depuis la ligne de document, puis rattache.
  const ligneInventaireDepuisDoc = (ligneDoc, nom) => {
    const unite = uniteDepuisLigneDoc(ligneDoc);
    const q = quantiteEnUniteInventaire(ligneDoc, unite);
    const montant = Number(ligneDoc.montantLigne);
    const prix = q && Number.isFinite(montant) ? montant / q : 0;
    const produitCat = (catalogue || []).find(p => p?.nom && cleProduit(p.nom) === cleProduit(nom));
    return ligneLibre(nom, { unite, prixUnit: +prix.toFixed(4), categorie: produitCat?.categorie || 'Autres' });
  };

  const creerDepuisDoc = async (entree, nom) => {
    const nomFinal = String(nom || '').trim();
    if (!nomFinal) return;
    setBusy(true);
    try {
      await onAjouterLignes([ligneInventaireDepuisDoc(entree.ligne, nomFinal)]);
      await rattacher(entree.cle, nomFinal);
      setCreations(c => { const s = { ...c }; delete s[entree.cle]; return s; });
    } finally { setBusy(false); }
  };

  const toutCreer = async () => {
    const cibles = aRattacher.filter(e => e.suggestions.length === 0);
    if (!cibles.length) return;
    if (!confirmLegacy(`Ajouter ${cibles.length} produit${cibles.length > 1 ? 's' : ''} lu${cibles.length > 1 ? 's' : ''} sur les documents à l'inventaire « ${perimetreActif} » ?\nNom, unité et prix sont repris des documents ; vous pourrez les compter tout de suite.`)) return;
    setBusy(true);
    try {
      const lignes = cibles.map(e => ligneInventaireDepuisDoc(e.ligne, nomDepuisLibelle(e.ligne.libelle, e.ligne.conditionnement)));
      await onAjouterLignes(lignes);
      for (let i = 0; i < cibles.length; i += 1) await rattacher(cibles[i].cle, lignes[i].produit);
      notifyLegacy(`${cibles.length} produit${cibles.length > 1 ? 's' : ''} ajouté${cibles.length > 1 ? 's' : ''} à l'inventaire.`, 'success');
    } finally { setBusy(false); }
  };

  const prixAMettreAJour = calcul.lignes.filter(r => r.prixFacture != null && r.prixFacture > 0
    && (r.prixInventaire === 0 || (r.ecartPrixPct != null && Math.abs(r.ecartPrixPct) >= 0.5)));

  const appliquerPrix = async () => {
    if (!prixAMettreAJour.length) return;
    if (!confirmLegacy(`Mettre à jour le prix de ${prixAMettreAJour.length} produit${prixAMettreAJour.length > 1 ? 's' : ''} de l'inventaire avec le dernier prix facturé ?\nLa valeur du stock sera recalculée.`)) return;
    setBusy(true);
    try {
      const n = await onMajPrix(prixAMettreAJour.map(r => ({ cle: r.cle, prixUnit: r.prixFacture })));
      notifyLegacy(`${n} prix mis à jour.`, 'success');
    } finally { setBusy(false); }
  };

  // ── Lecture des documents par l'IA ──
  const majTravail = (key, patch) => setFile(f => f.map(t => (t.key === key ? { ...t, ...patch } : t)));

  const trouverFournisseurId = (nom) => {
    const n = normalizeName(nom);
    if (!n) return null;
    const f = fournisseurs.find(x => normalizeName(x.nom) === n)
      || fournisseurs.find(x => { const y = normalizeName(x.nom); return y && (y.includes(n) || n.includes(y)); });
    return f?.id || null;
  };

  const traiter = async (travail) => {
    majTravail(travail.key, { statut: 'lecture' });
    try {
      const { parseFacture } = await import('../../services/aiService.js');
      const res = await parseFacture(travail.fichiers);
      const doc = {
        id: 'achat-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
        etablissementId: etabId,
        perimetre: travail.perimetre,
        typeDocument: travail.type === 'auto' ? devinerTypeDocument(travail.nom) : travail.type,
        fournisseurNom: res.fournisseur || '',
        fournisseurId: trouverFournisseurId(res.fournisseur),
        numero: res.numeroFacture || '',
        dateDocument: res.dateFacture || null,
        totalHT: res.totalHT,
        lignes: (res.lignes || []).map(l => ({
          libelle: l.libelle,
          referenceFourn: l.referenceFourn || '',
          quantite: l.quantite,
          conditionnement: l.conditionnement || '',
          quantiteTotale: l.quantiteTotale,
          uniteTotale: l.uniteTotale,
          montantLigne: l.montantLigne,
          issues: l.issues || [],
        })),
        source: res.source,
        nomFichier: travail.nom,
        createdBy: user?.id || null,
      };
      if (!doc.lignes.length) {
        majTravail(travail.key, { statut: 'erreur', message: 'Aucune ligne de produit lisible.' });
        return;
      }
      const doublon = trouverDoublon(docsRef.current || [], doc);
      if (doublon) {
        majTravail(travail.key, { statut: 'doublon', message: `Déjà importé (${doc.fournisseurNom} n° ${doc.numero})` });
        return;
      }
      const enregistre = await legacySB.db.upsertAchatsDocument(doc);
      majDocs(liste => [enregistre, ...liste]);
      majTravail(travail.key, {
        statut: 'ok',
        message: `${doc.fournisseurNom || 'Fournisseur non lu'} · ${doc.lignes.length} ligne${doc.lignes.length > 1 ? 's' : ''}`
          + (doc.dateDocument ? ` · ${dateCH(doc.dateDocument)}` : ' · date non lue'),
      });
    } catch (err) {
      majTravail(travail.key, { statut: 'erreur', message: err.message || String(err) });
    }
  };

  // File à concurrence bornée : trois lectures en parallèle, pas trente.
  const pomper = () => {
    while (enCoursRef.current < CONCURRENCE && attenteRef.current.length) {
      const travail = attenteRef.current.shift();
      enCoursRef.current += 1;
      traiter(travail).finally(() => { enCoursRef.current -= 1; pomper(); });
    }
  };

  const deposer = (liste) => {
    const fichiers = Array.from(liste || []);
    if (!fichiers.length) return;
    const estPdf = (f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
    const pdfs = fichiers.filter(estPdf);
    const images = fichiers.filter(f => !estPdf(f));
    const travaux = pdfs.map(f => [f]);
    if (grouper && images.length) {
      for (let i = 0; i < images.length; i += 5) travaux.push(images.slice(i, i + 5));
    } else {
      images.forEach(f => travaux.push([f]));
    }
    const nouveaux = travaux.map((fs, i) => ({
      key: `${Date.now()}-${i}-${fs[0].name}`,
      fichiers: fs,
      nom: fs.length > 1 ? `${fs[0].name} (+${fs.length - 1} page${fs.length > 2 ? 's' : ''})` : fs[0].name,
      type: typeImport,
      perimetre: perimetreActif,
      statut: 'attente',
      message: '',
    }));
    setFile(f => [...nouveaux, ...f]);
    attenteRef.current.push(...nouveaux);
    pomper();
  };

  const relancer = (travail) => {
    majTravail(travail.key, { statut: 'attente', message: '' });
    attenteRef.current.push(travail);
    pomper();
  };

  const enAttente = file.filter(t => t.statut === 'attente' || t.statut === 'lecture').length;

  // ─────────── Rendu ───────────
  if (docs === null) {
    return <div style={st.info}>Chargement des documents…</div>;
  }

  const docsAffiches = (tousDocs ? docsPerimetre : docsPeriode)
    .slice()
    .sort((a, b) => String(b.dateDocument || '').localeCompare(String(a.dateDocument || '')));
  const nbComptes = docsPeriode.filter(d => statuts.get(d.id)?.compte).length;
  const nonComptesFin = (inv?.lignes || []).filter(l => l.stockReel == null).length;
  const incoherents = calcul.lignes.filter(r => r.incoherent);
  const lignesTableau = calcul.lignes
    .filter(r => r.debutVal || r.achatsVal || r.finVal)
    .sort((a, b) => b.consoVal - a.consoVal);
  const nomsProduits = produits.map(p => p.nom).sort((a, b) => a.localeCompare(b, 'fr'));

  return (
    <div style={st.root}>
      {tableAbsente && (
        <div style={st.alerte}>
          La table des documents d'achat n'existe pas encore sur la base : la migration
          « 20260928_achats_documents » est à appliquer. En attendant, rien ne peut être enregistré ici.
        </div>
      )}
      {loadError && (
        <div style={st.alerte}>
          Documents indisponibles pour le moment : le calcul affiché peut être incomplet.
          <button type="button" style={{ ...st.btn, marginLeft: 10 }} onClick={reload}>Réessayer</button>
        </div>
      )}

      {/* ── Période + synthèse ── */}
      <div style={st.carte}>
        <div style={st.periode}>
          Période du <strong>{dateCH(periode.debutInclus ? periode.debut : lendemain(periode.debut))}</strong> au <strong>{dateCH(periode.fin)}</strong>
          <span style={{ color: 'var(--text2)' }}>
            {previousInv ? ` · depuis l'inventaire « ${perimetreActif} » du ${dateCH(previousInv.date)}` : ' · premier inventaire du périmètre, période ramenée au mois'}
          </span>
        </div>
        <div style={st.kpis}>
          <Kpi label="Stock de début" valeur={previousInv ? `CHF ${chf(calcul.stockDebut)}` : '-'} note={previousInv ? `inventaire du ${dateCH(previousInv.date)}` : 'aucun inventaire précédent'} />
          <Kpi label="+ Achats" valeur={`CHF ${chf(calcul.achatsTotal)}`} note={`${nbComptes} document${nbComptes > 1 ? 's' : ''} retenu${nbComptes > 1 ? 's' : ''}`} />
          <Kpi label="- Stock de fin" valeur={`CHF ${chf(calcul.stockFin)}`} note={`inventaire du ${dateCH(inv?.date)}`} />
          <Kpi label="= Consommation" valeur={`CHF ${chf(calcul.consommation)}`} fort note="matière consommée sur la période" />
        </div>
        {(calcul.sansDebut || nonComptesFin > 0 || calcul.lignesARattacher > 0 || incoherents.length > 0 || docsSansDate.length > 0) && (
          <ul style={st.avertissements}>
            {calcul.sansDebut && <li>Sans inventaire précédent, le stock de début vaut 0 : la consommation est surestimée du stock déjà en place.</li>}
            {nonComptesFin > 0 && <li>{nonComptesFin} produit{nonComptesFin > 1 ? 's' : ''} pas encore compté{nonComptesFin > 1 ? 's' : ''} dans l'inventaire de fin : ils valent 0 dans le stock de fin.</li>}
            {calcul.lignesARattacher > 0 && <li>CHF {chf(calcul.achatsNonRattaches)} d'achats ne sont rattachés à aucun produit de l'inventaire : ils comptent dans la consommation totale, pas dans le détail par produit.</li>}
            {incoherents.length > 0 && <li>{incoherents.length} produit{incoherents.length > 1 ? 's' : ''} avec plus de stock en fin qu'en début + achats : un document manque, ou un comptage est à revoir.</li>}
            {docsSansDate.length > 0 && <li>{docsSansDate.length} document{docsSansDate.length > 1 ? 's' : ''} sans date lisible : saisissez la date pour {docsSansDate.length > 1 ? 'les' : 'le'} compter.</li>}
          </ul>
        )}
      </div>

      {/* ── Import ── */}
      {canImport ? (
        <div style={st.carte}>
          <div style={st.titre}>Importer les factures et bons de la période</div>
          <div style={st.sousTitre}>
            Sélectionnez tous les documents d'un coup : PDF reçus par mail ou photos. Chaque document est lu par l'IA,
            ses lignes sont rattachées aux produits de l'inventaire. Rien n'est modifié dans le catalogue.
          </div>
          <div style={st.importLigne}>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
              onChange={e => { deposer(e.target.files); e.target.value = ''; }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => { deposer(e.target.files); e.target.value = ''; }} />
            <button type="button" style={st.btnPrimaire} disabled={tableAbsente} onClick={() => fileRef.current?.click()}>📄 Choisir des documents</button>
            <button type="button" style={st.btn} disabled={tableAbsente} onClick={() => cameraRef.current?.click()}>📷 Photographier</button>
            <select value={typeImport} onChange={e => setTypeImport(e.target.value)} style={st.select} aria-label="Type des documents">
              <option value="auto">Type : deviner</option>
              {TYPES_DOCUMENT.map(t => <option key={t.id} value={t.id}>Type : {t.pluriel}</option>)}
            </select>
            <label style={st.caseLabel}>
              <input type="checkbox" checked={grouper} onChange={e => setGrouper(e.target.checked)} style={{ width: 18, height: 18 }} />
              Photos = pages d'un même document
            </label>
          </div>
          {file.length > 0 && (
            <div style={st.file}>
              {enAttente > 0 && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Lecture en cours : {enAttente} document{enAttente > 1 ? 's' : ''}. Vous pouvez continuer à compter en attendant.</div>}
              {file.map(t => (
                <div key={t.key} style={st.travail}>
                  <span style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>
                    {t.statut === 'ok' ? '✓' : t.statut === 'erreur' ? '⚠' : t.statut === 'doublon' ? '≡' : t.statut === 'lecture' ? '…' : '·'}
                  </span>
                  <span data-no-translate style={{ flex: '1 1 160px', minWidth: 0, wordBreak: 'break-word', fontWeight: 600 }}>{t.nom}</span>
                  <span style={{ flex: '2 1 200px', minWidth: 0, color: t.statut === 'erreur' ? 'var(--danger-text)' : 'var(--text2)' }}>
                    {t.statut === 'attente' ? 'en attente' : t.statut === 'lecture' ? 'lecture par l\'IA…' : t.message}
                  </span>
                  {t.statut === 'erreur' && <button type="button" style={st.btnMini} onClick={() => relancer(t)}>Réessayer</button>}
                </div>
              ))}
              {enAttente === 0 && <button type="button" style={{ ...st.lien, marginTop: 4 }} onClick={() => setFile([])}>Effacer cette liste</button>}
            </div>
          )}
        </div>
      ) : (
        <div style={st.info}>La lecture des factures par l'IA est réservée au consultant. Les documents déjà importés et le calcul restent consultables ici.</div>
      )}

      {/* ── Lignes à rattacher ── */}
      {aRattacher.length > 0 && (
        <div style={st.carte}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={st.titre}>À rattacher ({aRattacher.length})</div>
            {canEditLignes && aRattacher.some(e => e.suggestions.length === 0) && (
              <button type="button" style={st.btn} disabled={busy} onClick={toutCreer}>
                {(() => {
                  const n = aRattacher.filter(e => e.suggestions.length === 0).length;
                  return n > 1 ? `+ Ajouter les ${n} produits inconnus à l'inventaire` : '+ Ajouter le produit inconnu à l\'inventaire';
                })()}
              </button>
            )}
          </div>
          <div style={st.sousTitre}>
            Lignes lues que l'app n'a pas reconnues avec certitude. Votre choix est mémorisé : ce libellé sera reconnu tout seul sur les prochains documents.
          </div>
          <datalist id="achats-produits-inventaire">
            {nomsProduits.map(n => <option key={n} value={n} />)}
          </datalist>
          {aRattacher.map(e => (
            <div key={e.cle} style={st.aRattacher}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div data-no-translate style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>{e.ligne.libelle}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  <span data-no-translate>{e.fournisseur || 'Fournisseur non lu'}</span>
                  {' · '}CHF {chf(e.montant)}{e.occurrences > 1 ? ` sur ${e.occurrences} documents` : ''}
                </div>
              </div>
              <div style={st.actionsLigne}>
                {e.suggestions.map(s => (
                  <button key={s.produit.cle} type="button" style={st.suggestion} onClick={() => rattacher(e.cle, s.produit.nom)}>
                    {s.produit.nom} <span style={{ color: 'var(--text3, var(--text2))' }}>{s.confidence}%</span>
                  </button>
                ))}
                <input
                  list="achats-produits-inventaire"
                  placeholder="Produit de l'inventaire…"
                  style={st.inputRattacher}
                  onChange={ev => {
                    const p = produits.find(x => x.nom === ev.target.value);
                    if (p) rattacher(e.cle, p.nom);
                  }}
                />
                {canEditLignes && (creations[e.cle] != null ? (
                  <span style={{ display: 'flex', gap: 6, flex: '1 1 220px', minWidth: 0 }}>
                    <input
                      autoFocus
                      value={creations[e.cle]}
                      onChange={ev => setCreations(c => ({ ...c, [e.cle]: ev.target.value }))}
                      onKeyDown={ev => { if (ev.key === 'Enter') creerDepuisDoc(e, creations[e.cle]); if (ev.key === 'Escape') setCreations(c => { const s = { ...c }; delete s[e.cle]; return s; }); }}
                      style={{ ...st.inputRattacher, flex: 1 }}
                      aria-label="Nom du produit à créer"
                    />
                    <button type="button" style={st.btnMini} disabled={busy} onClick={() => creerDepuisDoc(e, creations[e.cle])}>Créer</button>
                  </span>
                ) : (
                  <button type="button" style={st.btnMini} onClick={() => setCreations(c => ({ ...c, [e.cle]: nomDepuisLibelle(e.ligne.libelle, e.ligne.conditionnement) }))}>
                    + Nouveau produit
                  </button>
                ))}
                <button type="button" style={st.btnMini} onClick={() => ignorer(e.cle)} title="Port, consigne, emballage : hors stock">Ignorer</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Consommation par produit ── */}
      <div style={st.carte}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={st.titre}>Consommation par produit</div>
          {canEditLignes && prixAMettreAJour.length > 0 && (
            <button type="button" style={st.btn} disabled={busy} onClick={appliquerPrix}>
              Mettre à jour {prixAMettreAJour.length} prix avec les dernières factures
            </button>
          )}
        </div>
        {lignesTableau.length === 0 ? (
          <div style={st.info}>Rien à calculer pour l'instant : comptez l'inventaire et importez les documents de la période.</div>
        ) : (
          <div style={st.tableWrap}>
            <table style={st.table}>
              <thead>
                <tr>
                  <th style={st.th}>Produit</th>
                  <th style={st.thNum}>Début</th>
                  <th style={st.thNum}>+ Achats</th>
                  <th style={st.thNum}>- Fin</th>
                  <th style={st.thNum}>= Consommé</th>
                  <th style={st.thNum}>CHF</th>
                  <th style={st.thNum}>Prix facturé</th>
                </tr>
              </thead>
              <tbody>
                {lignesTableau.map(r => (
                  <tr key={r.cle} style={r.incoherent ? { background: 'var(--warning-bg)' } : undefined}>
                    <td style={st.td}><span data-no-translate>{r.produit}</span>{!r.finCompte && <span style={st.puce}>non compté</span>}</td>
                    <td style={st.tdNum}>{qte(r.debutQte)} {r.unite}</td>
                    <td style={st.tdNum}>
                      {r.achatsQteIncomplete ? <span title="Unité du document non convertible">? </span> : null}
                      {r.nbLignesAchat ? `${qte(r.achatsQte)} ${r.unite}` : '-'}
                    </td>
                    <td style={st.tdNum}>{qte(r.finQte)} {r.unite}</td>
                    <td style={{ ...st.tdNum, fontWeight: 700 }}>{r.consoQte == null ? '?' : `${qte(r.consoQte)} ${r.unite}`}</td>
                    <td style={{ ...st.tdNum, fontWeight: 700 }}>{chf(r.consoVal)}</td>
                    <td style={st.tdNum}>
                      {r.prixFacture == null ? '-' : (
                        <>
                          {chf(r.prixFacture)}/{r.unite}
                          {r.ecartPrixPct != null && Math.abs(r.ecartPrixPct) >= SEUIL_ECART_PRIX_PCT && (
                            <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: r.ecartPrixPct > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>
                              {r.ecartPrixPct > 0 ? '+' : ''}{r.ecartPrixPct.toFixed(0)} % vs inventaire
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Documents ── */}
      <div style={st.carte}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={st.titre}>Documents {tousDocs ? `du périmètre (${docsPerimetre.length})` : `de la période (${docsPeriode.length})`}</div>
          <button type="button" style={st.lien} onClick={() => setTousDocs(v => !v)}>
            {tousDocs ? 'Seulement la période' : `Tous les documents « ${perimetreActif} »`}
          </button>
        </div>
        <div style={st.sousTitre}>
          Par fournisseur, les factures font foi ; à défaut les bons de livraison, puis les bons de commande. Une livraison n'est ainsi jamais comptée deux fois.
        </div>
        {docsAffiches.length === 0 && <div style={st.info}>Aucun document{tousDocs ? '' : ' daté dans cette période'}.</div>}
        {docsAffiches.map(d => {
          const s = statuts.get(d.id);
          const horsPeriode = !dansPeriode(d.dateDocument, periode);
          const somme = (d.lignes || []).reduce((t, l) => t + (Number(l.montantLigne) || 0), 0);
          const ecartTotal = d.totalHT != null && d.totalHT > 0 ? somme - d.totalHT : 0;
          const ouvert = docOuvert === d.id;
          return (
            <div key={d.id} style={{ ...st.doc, ...(s?.compte && !horsPeriode ? {} : { opacity: 0.75 }) }}>
              <div style={st.docLigne}>
                <button type="button" style={st.docToggle} onClick={() => setDocOuvert(ouvert ? null : d.id)}>
                  <span style={{ width: 14, display: 'inline-block' }}>{ouvert ? '▾' : '▸'}</span>
                  <span style={{ fontWeight: 700 }} data-no-translate>{d.fournisseurNom || 'Fournisseur non lu'}</span>
                  <span style={{ color: 'var(--text2)' }}>
                    {d.numero ? ` · n° ${d.numero}` : ''} · {(d.lignes || []).length} ligne{(d.lignes || []).length > 1 ? 's' : ''} · CHF {chf(d.totalHT != null ? d.totalHT : somme)}
                  </span>
                </button>
                <div style={st.docChamps}>
                  <input
                    type="date"
                    value={d.dateDocument || ''}
                    onChange={e => enregistrerDoc({ ...d, dateDocument: e.target.value || null })}
                    style={{ ...st.select, ...(d.dateDocument ? {} : { borderColor: 'var(--warning-bd)' }) }}
                    aria-label="Date du document"
                  />
                  <select value={d.typeDocument} onChange={e => enregistrerDoc({ ...d, typeDocument: e.target.value })} style={st.select} aria-label="Type de document">
                    {TYPES_DOCUMENT.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <span style={{ ...st.statut, ...(s?.compte && !horsPeriode ? st.statutOk : {}) }}>
                    {!d.dateDocument ? 'date manquante' : horsPeriode ? 'hors période' : s?.compte ? 'compté' : (s?.raison || 'non compté')}
                  </span>
                </div>
              </div>
              {Math.abs(ecartTotal) > 0.05 && (
                <div style={st.docAlerte}>
                  Lignes lues : CHF {chf(somme)}, total du document : CHF {chf(d.totalHT)}. Une ligne est peut-être mal lue ou manquante.
                </div>
              )}
              {ouvert && (
                <div style={st.docDetail}>
                  {(d.lignes || []).map((l, i) => {
                    const r = rapprocherLigneDoc(l, ctx);
                    return (
                      <div key={i} style={st.docDetailLigne}>
                        <span data-no-translate style={{ flex: '2 1 200px', minWidth: 0, wordBreak: 'break-word' }}>{l.libelle}</span>
                        <span style={{ flex: '1 1 90px', color: 'var(--text2)' }}>
                          {l.quantiteTotale != null ? `${qte(l.quantiteTotale)} ${l.uniteTotale}` : l.quantite != null ? `${l.quantite} colis` : ''}
                        </span>
                        <span style={{ flex: '0 0 80px', textAlign: 'right' }}>{l.montantLigne != null ? chf(l.montantLigne) : 'non lu'}</span>
                        <span style={{ flex: '2 1 180px', minWidth: 0, color: r.produit ? 'var(--text)' : r.mode === 'ignore' ? 'var(--text2)' : 'var(--warning-text)' }}>
                          {r.produit ? <>→ <span data-no-translate>{r.produit.nom}</span></> : r.mode === 'ignore' ? 'ignorée' : 'à rattacher'}
                          {(l.lien === 'manuel' || l.lien === 'ignore') && (
                            <button type="button" style={st.lien} onClick={() => delier(normalizeName(l.libelle))} title="Annuler ce choix"> ✕</button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <select
                      value={(d.perimetre || '').trim() || 'Général'}
                      onChange={e => enregistrerDoc({ ...d, perimetre: e.target.value })}
                      style={st.select}
                      aria-label="Périmètre du document"
                    >
                      {Array.from(new Set([...(perimetres || []), (d.perimetre || '').trim() || 'Général'])).map(p => <option key={p} value={p}>Périmètre : {p}</option>)}
                    </select>
                    <button type="button" style={st.btnMini} onClick={() => enregistrerDoc({ ...d, exclu: !d.exclu })}>
                      {d.exclu ? 'Réintégrer au calcul' : 'Exclure du calcul'}
                    </button>
                    <button type="button" style={{ ...st.btnMini, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }} onClick={() => supprimerDoc(d)}>Supprimer</button>
                    {d.nomFichier && <span data-no-translate style={{ fontSize: 11, color: 'var(--text2)', alignSelf: 'center' }}>{d.nomFichier}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function lendemain(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function Kpi({ label, valeur, note, fort }) {
  return (
    <div style={{ ...st.kpi, ...(fort ? st.kpiFort : {}) }}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={st.kpiVal}>{valeur}</div>
      {note && <div style={st.kpiNote}>{note}</div>}
    </div>
  );
}

const st = {
  root: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  carte: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  titre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  info: { fontSize: 13, color: 'var(--text2)', padding: '12px 14px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 10, lineHeight: 1.45 },
  alerte: { fontSize: 12, lineHeight: 1.5, padding: '10px 14px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  periode: { fontSize: 13, color: 'var(--text)', lineHeight: 1.5 },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 10 },
  kpi: { background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, padding: '10px 12px', minWidth: 0 },
  kpiFort: { borderColor: 'var(--accent)' },
  kpiLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiVal: { fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--text)', marginTop: 4 },
  kpiNote: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  avertissements: { margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.55 },
  importLigne: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  btnPrimaire: { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  btn: { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  btnMini: { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36, whiteSpace: 'nowrap' },
  lien: { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  select: { padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', minHeight: 40 },
  caseLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', minHeight: 44, cursor: 'pointer' },
  file: { display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 10 },
  travail: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '4px 0', color: 'var(--text)' },
  aRattacher: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' },
  actionsLigne: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: '2 1 300px', minWidth: 0 },
  suggestion: { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36 },
  inputRattacher: { flex: '1 1 160px', minWidth: 0, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)', minHeight: 36, boxSizing: 'border-box' },
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, maxWidth: '100%' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 },
  th: { textAlign: 'left', padding: '8px 10px', background: 'var(--bg)', color: 'var(--text2)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)' },
  thNum: { textAlign: 'right', padding: '8px 10px', background: 'var(--bg)', color: 'var(--text2)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600 },
  tdNum: { padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' },
  puce: { marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'var(--warning-bg)', color: 'var(--warning-text)', textTransform: 'uppercase' },
  doc: { borderTop: '1px solid var(--border)', padding: '8px 0' },
  docLigne: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  docToggle: { flex: '1 1 240px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font)', textAlign: 'left', minHeight: 44 },
  docChamps: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statut: { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: 'var(--bg)', color: 'var(--text2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', maxWidth: 260 },
  statutOk: { background: 'var(--success-bg)', color: 'var(--success-text)', borderColor: 'var(--success-bd)' },
  docAlerte: { fontSize: 11, color: 'var(--warning-text)', marginTop: 4 },
  docDetail: { marginTop: 6, padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 },
  docDetailLigne: { display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--text)' },
};
