import React from 'react';
import { notifyLegacy } from '../../../legacy/legacyApi.js';
import { normalizeSearch } from '../../../utils/searchText.js';
import { buildProduitIndex, resolvePrixProduit } from '../../../services/prixResolution.js';
import {
  buildAliasIndex, rapprocherLigne, calculerImpact, estApplicable,
  planScanWrites, prixUnitaireDepuisColis, SEUIL_ECART_PCT,
} from './scanFactureLogic.js';

// Écran de lecture d'une facture fournisseur par photo.
//
// Principe de sûreté : l'IA propose, Jérémy tranche, et RIEN n'est écrit avant
// le bouton de validation. Un OCR qui écrirait seul dans le catalogue de
// production serait une bombe : un chiffre mal lu se propage aux recettes.
//
// Props : etabId, fournisseurs, catalogue, legacySB, user, onClose, onDone

const PILES = [
  { id: 'reconnues', label: 'Reconnues',    hint: 'Produit identifié avec certitude. Vérifiez les prix, puis appliquez.' },
  { id: 'confirmer', label: 'À confirmer',  hint: 'Choisissez le bon produit : votre choix est mémorisé pour les prochaines factures.' },
  { id: 'nouveaux',  label: 'Nouveaux',     hint: 'Aucun produit au catalogue. Créez la fiche si le produit doit y entrer.' },
  { id: 'ignorees',  label: 'Ignorées',     hint: 'Frais de port, consigne, TVA : rien à mettre à jour.' },
];

const fmt = (n, d = 4) => (Number.isFinite(Number(n)) ? Number(n).toFixed(d) : '—');

export default function ScanFacture({ etabId, fournisseurs, catalogue, legacySB, user, onClose, onDone }) {
  const [etape, setEtape] = React.useState('capture'); // capture | analyse | revue
  const [fichiers, setFichiers] = React.useState([]);
  const [apercus, setApercus] = React.useState([]);
  const [fournisseurId, setFournisseurId] = React.useState('');
  const [entete, setEntete] = React.useState(null);
  const [lignes, setLignes] = React.useState([]);
  const [pile, setPile] = React.useState('reconnues');
  const [erreur, setErreur] = React.useState('');
  const [progress, setProgress] = React.useState(null);
  const [extra, setExtra] = React.useState([]); // produits créés en séance
  const fileRef = React.useRef(null);
  const abortRef = React.useRef(false);

  const catalogueComplet = React.useMemo(() => [...(catalogue || []), ...extra], [catalogue, extra]);
  const produitIndex = React.useMemo(() => buildProduitIndex(catalogueComplet), [catalogueComplet]);
  const produitParNom = React.useMemo(() => {
    const m = new Map();
    catalogueComplet.forEach(p => { if (p?.nom && !m.has(p.nom)) m.set(p.nom, p); });
    return m;
  }, [catalogueComplet]);
  const nomsCatalogue = React.useMemo(
    () => [...produitParNom.keys()].sort((a, b) => a.localeCompare(b)),
    [produitParNom],
  );

  // Les aperçus sont des URL d'objet : sans révocation, chaque photo reprise
  // laisse un blob en mémoire pour toute la session.
  React.useEffect(() => () => apercus.forEach(u => URL.revokeObjectURL(u)), [apercus]);

  const ajouterPhotos = (liste) => {
    const nouveaux = [...fichiers, ...liste].slice(0, 5);
    setFichiers(nouveaux);
    setApercus(prev => {
      prev.forEach(u => URL.revokeObjectURL(u));
      return nouveaux.map(f => URL.createObjectURL(f));
    });
  };
  const retirerPhoto = (idx) => {
    const nouveaux = fichiers.filter((_, i) => i !== idx);
    setFichiers(nouveaux);
    setApercus(prev => {
      prev.forEach(u => URL.revokeObjectURL(u));
      return nouveaux.map(f => URL.createObjectURL(f));
    });
  };

  // ── Analyse ──
  const analyser = async () => {
    if (!fichiers.length) return;
    setEtape('analyse');
    setErreur('');
    try {
      const { parseFacture } = await import('../../../services/aiService.js');
      const fournHint = fournisseurs.find(f => f.id === fournisseurId)?.nom || '';
      const res = await parseFacture(fichiers, fournHint ? { fournisseurHint: fournHint } : {});

      // Le fournisseur choisi prime : c'est lui qui porte les alias et les
      // références. Celui lu sur la facture ne sert qu'à le deviner.
      let fId = fournisseurId;
      if (!fId && res.fournisseur) {
        const q = normalizeSearch(res.fournisseur);
        const trouve = (fournisseurs || []).find(f => normalizeSearch(f.nom) === q)
          || (fournisseurs || []).find(f => normalizeSearch(f.nom).includes(q) || q.includes(normalizeSearch(f.nom)));
        if (trouve) { fId = trouve.id; setFournisseurId(trouve.id); }
      }

      const alias = await legacySB.db.listProduitAliasEtab(etabId).catch(() => []);
      const aliasIndex = buildAliasIndex(alias);
      const ctx = { catalogue: catalogueComplet, aliasIndex, produitIndex, fournisseurId: fId };
      const rapprochees = res.lignes.map(l => {
        const r = rapprocherLigne(l, ctx);
        // Pré-cochée seulement si le produit est certain ET le prix exploitable.
        return { ...r, applique: (r.statut === 'alias' || r.statut === 'auto') && estApplicable(r) };
      });

      setEntete(res);
      setLignes(rapprochees);
      const premiere = PILES.find(p => rapprochees.some(l => pileDe(l) === p.id));
      setPile(premiere ? premiere.id : 'reconnues');
      setEtape('revue');
      if (!rapprochees.length) setErreur("Aucune ligne de produit lisible sur ces photos.");
    } catch (e) {
      setErreur(e.message || String(e));
      setEtape('capture');
    }
  };

  const pileDe = (l) => {
    if (l.statut === 'ignoree') return 'ignorees';
    if (l.statut === 'alias' || l.statut === 'auto') return 'reconnues';
    if (l.statut === 'ambigu') return 'confirmer';
    return 'nouveaux';
  };

  const majLigne = (id, patch) => setLignes(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  // Choisir un produit ne change PAS le statut de la ligne : elle resterait
  // sinon dans la pile où on la traite, et disparaîtrait sous le curseur au
  // moment même du clic. Le statut sert aussi à savoir s'il faut apprendre un
  // alias, ce qui n'est vrai que pour une ligne non reconnue au départ.
  const choisirProduit = (id, produit) => {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const suivant = { ...l, produit };
      return { ...suivant, applique: produit ? estApplicable(suivant) : false };
    }));
  };

  const creerProduit = async (ligne) => {
    if (!legacySB) return;
    // L'unité de référence suit celle du conditionnement : un colis en kg ou en
    // L donne un prix par g ou par ml, comme la colonne générée en base.
    const uniteRef = ligne.uniteCond === 'kg' || ligne.uniteCond === 'g' ? 'g'
      : ligne.uniteCond === 'L' || ligne.uniteCond === 'ml' ? 'ml' : 'pcs';
    const prix = prixUnitaireDepuisColis(ligne.prixAchat, ligne.quantiteCond, ligne.uniteCond);
    try {
      const row = await legacySB.db.upsertProduit({
        etablissementId: etabId,
        nom: ligne.libelle,
        categorie: 'Autres',
        uniteRef,
        prixUnitaire: prix ?? null,
        referenceFourn: ligne.referenceFourn || null,
        conditionnement: ligne.conditionnement || null,
        fournisseurId: fournisseurId || null,
        actif: true,
      });
      const produit = {
        id: row?.id, nom: ligne.libelle, uniteRef, categorie: 'Autres',
        prixUnitaire: prix ?? 0, prixUnitaireManuel: prix ?? 0,
        fournisseurs: [], allergenes: [], strategiePrix: 'max', prixVerrouille: false,
      };
      setExtra(prev => [...prev, produit]);
      choisirProduit(ligne.id, produit);
      notifyLegacy(`« ${ligne.libelle} » créé au catalogue.`, 'success');
    } catch (e) {
      notifyLegacy('Création impossible : ' + (e.message || e), 'error');
    }
  };

  // ── Validation : c'est ici, et seulement ici, qu'on écrit ──
  const valider = async () => {
    if (!legacySB) return;
    if (!fournisseurId) { notifyLegacy('Choisissez le fournisseur de cette facture.', 'warning'); return; }
    const aAppliquer = lignes.filter(l => l.applique && estApplicable(l));
    if (!aAppliquer.length) { notifyLegacy('Aucune ligne à appliquer.', 'info'); return; }

    abortRef.current = false;
    const scanId = 'scan-' + Date.now();
    const plan = planScanWrites(lignes, {
      scanId,
      fournisseurId,
      dateFacture: entete?.dateFacture,
      userId: user?.id,
    });

    const total = plan.refs.length;
    setProgress({ done: 0, total, echecs: 0 });

    // Session enregistrée d'abord : si l'écriture des prix casse en cours de
    // route, il reste une trace de ce qui a été tenté.
    try {
      await legacySB.db.upsertScanFacture({
        id: scanId, etablissementId: etabId, fournisseurId,
        statut: 'brouillon',
        dateFacture: entete?.dateFacture || null,
        numeroFacture: entete?.numeroFacture || null,
        totalFacture: entete?.totalHT ?? null,
        lignes: lignes.map(l => ({
          libelle: l.libelle, referenceFourn: l.referenceFourn, statut: l.statut,
          produitId: l.produit?.id || null, prixAchat: l.prixAchat,
          quantiteCond: l.quantiteCond, uniteCond: l.uniteCond,
          applique: !!l.applique, issues: l.issues,
        })),
        nbLignes: lignes.length,
        nbAppliquees: total,
        createdBy: user?.id || null,
      });
    } catch (e) {
      setProgress(null);
      notifyLegacy("Enregistrement de la session impossible : " + (e.message || e), 'error');
      return;
    }

    let done = 0, echecs = 0;
    for (let i = 0; i < plan.refs.length; i++) {
      if (abortRef.current) break;
      try {
        await legacySB.db.upsertProduitFournisseurParCouple(plan.refs[i]);
        await legacySB.db.ajouterPrixHistorique(plan.historique[i]);
        await legacySB.db.upsertProduit({
          id: plan.refs[i].produitId,
          ...produitIndex.get(plan.refs[i].produitId),
          prixMajLe: new Date().toISOString(),
        });
      } catch (e) {
        echecs += 1;
        console.error('[ScanFacture] ligne', plan.refs[i]?.produitId, e);
      }
      done += 1;
      setProgress({ done, total, echecs });
    }

    // Les alias en dernier : ils ne valent que si les prix sont passés, et un
    // alias raté n'invalide pas une mise à jour de prix réussie.
    for (const a of plan.aliasACreer) {
      if (abortRef.current) break;
      try { await legacySB.db.upsertProduitAlias(a); } catch (e) { /* non bloquant */ }
    }

    const interrompu = abortRef.current;
    if (!interrompu && !echecs) {
      try {
        await legacySB.db.upsertScanFacture({
          id: scanId, etablissementId: etabId, fournisseurId, statut: 'valide',
          dateFacture: entete?.dateFacture || null,
          numeroFacture: entete?.numeroFacture || null,
          totalFacture: entete?.totalHT ?? null,
          lignes: [], nbLignes: lignes.length, nbAppliquees: done,
          createdBy: user?.id || null,
        });
      } catch (e) { /* la session reste en brouillon, les prix sont passés */ }
    }

    setProgress(null);
    if (echecs) notifyLegacy(`${done - echecs} prix mis à jour, ${echecs} en échec.`, 'warning');
    else if (interrompu) notifyLegacy(`Interrompu : ${done} prix mis à jour sur ${total}.`, 'info');
    else notifyLegacy(`${done} prix mis à jour, ${plan.aliasACreer.length} libellé(s) mémorisé(s).`, 'success');

    if (onDone) await onDone();
    if (!interrompu && !echecs) onClose();
  };

  const parPile = React.useMemo(() => {
    const m = { reconnues: [], confirmer: [], nouveaux: [], ignorees: [] };
    lignes.forEach(l => m[pileDe(l)].push(l));
    return m;
  }, [lignes]);

  const nbApplique = lignes.filter(l => l.applique && estApplicable(l)).length;

  // Deux lignes cochées qui visent le MÊME produit chez le MÊME fournisseur ne
  // peuvent pas coexister : produit_fournisseurs porte un index unique sur le
  // couple, la seconde écriture écraserait la première sans rien dire. On refuse
  // d'appliquer tant que le conflit n'est pas tranché, plutôt que de choisir à
  // la place de Jérémy quel prix garder.
  const doublons = React.useMemo(() => {
    const compte = new Map();
    lignes.forEach(l => {
      if (!l.applique || !estApplicable(l)) return;
      compte.set(l.produit.id, (compte.get(l.produit.id) || 0) + 1);
    });
    const ids = new Set([...compte.entries()].filter(([, n]) => n > 1).map(([id]) => id));
    return {
      ids,
      noms: [...ids].map(id => produitIndex.get(id)?.nom || id),
    };
  }, [lignes, produitIndex]);

  // ─────────── Rendu ───────────
  const overlay = { position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(960px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' };
  const inp = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)' };

  return (
    <div className="modal-full-overlay" style={overlay} onClick={e => { if (e.target === e.currentTarget && !progress) onClose(); }}>
      <div className="modal-full" style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
              Scanner une facture
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {etape === 'capture' && 'Photographiez la facture, page par page.'}
              {etape === 'analyse' && 'Lecture en cours…'}
              {etape === 'revue' && entete && (
                <>
                  {entete.fournisseur || 'Fournisseur non lu'}
                  {entete.numeroFacture ? ` · ${entete.numeroFacture}` : ''}
                  {entete.dateFacture ? ` · ${entete.dateFacture.split('-').reverse().join('.')}` : ''}
                  {entete.totalHT != null ? ` · total HT ${fmt(entete.totalHT, 2)}` : ''}
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} disabled={!!progress} title="Fermer"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: progress ? 'not-allowed' : 'pointer', color: 'var(--text2)', flexShrink: 0 }}>✕</button>
        </div>

        {erreur && (
          <div style={{ margin: '10px 18px 0', padding: '8px 10px', borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', fontSize: 12 }}>
            {erreur}
          </div>
        )}

        {/* ── Capture ── */}
        {etape === 'capture' && (
          <div style={{ padding: 18, overflowY: 'auto' }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4, textTransform: 'uppercase' }}>Fournisseur</label>
              <select style={{ ...inp, width: '100%', maxWidth: 320 }} value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}>
                <option value="">Le deviner depuis la facture</option>
                {(fournisseurs || []).map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Le fournisseur porte les prix et les libellés mémorisés. Il sera confirmé avant d'écrire.
              </div>
            </div>

            <input
              ref={fileRef} type="file" accept="image/*" capture="environment" multiple
              style={{ display: 'none' }}
              onChange={e => { ajouterPhotos([...e.target.files]); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              style={{ ...inp, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', fontWeight: 700, padding: '10px 16px', minHeight: 44 }}
            >📷 Prendre une photo</button>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 10 }}>
              {fichiers.length}/5 page(s). Une facture tient rarement sur une seule.
            </span>

            {apercus.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {apercus.map((src, i) => (
                  <div key={src} style={{ position: 'relative' }}>
                    <img src={src} alt={`Page ${i + 1}`} style={{ width: 110, height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <button
                      onClick={() => retirerPhoto(i)} title="Retirer cette page"
                      style={{ position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12 }}
                    >✕</button>
                    <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,0,0,.6)', color: '#fff' }}>p.{i + 1}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {etape === 'analyse' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
            Lecture de {fichiers.length} page(s)… l'IA extrait l'en-tête et les lignes.
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Rien n'est encore écrit au catalogue.</div>
          </div>
        )}

        {/* ── Revue ── */}
        {etape === 'revue' && (
          <>
            <div style={{ display: 'flex', gap: 4, padding: '8px 18px 0', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {PILES.map(p => {
                const n = (parPile[p.id] || []).length;
                const actif = pile === p.id;
                return (
                  <button key={p.id} onClick={() => setPile(p.id)}
                    style={{ padding: '7px 12px', fontSize: 12, fontWeight: actif ? 800 : 600, whiteSpace: 'nowrap', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', color: actif ? 'var(--accent)' : 'var(--text2)', borderBottom: `2px solid ${actif ? 'var(--accent)' : 'transparent'}` }}
                  >{p.label} ({n})</button>
                );
              })}
            </div>

            <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', flex: '1 1 200px', minWidth: 0 }}>{PILES.find(p => p.id === pile)?.hint}</span>
              <select style={inp} value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}>
                <option value="">Fournisseur à choisir</option>
                {(fournisseurs || []).map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>

            <datalist id="scan-facture-produits">
              {nomsCatalogue.map(n => <option key={n} value={n} />)}
            </datalist>

            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {(parPile[pile] || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text2)', fontSize: 13 }}>Rien dans cette pile.</div>
              )}
              {(parPile[pile] || []).map(l => {
                const impact = calculerImpact(l, l.produit);
                const applicable = estApplicable(l);
                return (
                  <div key={l.id} style={{
                    border: `1px solid ${l.applique ? 'var(--success-bd)' : 'var(--border)'}`,
                    background: l.applique ? 'var(--success-bg)' : 'var(--bg)',
                    borderRadius: 8, padding: '9px 12px', marginBottom: 7,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {l.statut !== 'ignoree' && (
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, margin: -12, cursor: applicable ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                          <input type="checkbox" checked={!!l.applique} disabled={!applicable}
                            onChange={e => majLigne(l.id, { applique: e.target.checked })}
                            style={{ width: 18, height: 18, cursor: applicable ? 'pointer' : 'not-allowed' }} />
                        </label>
                      )}
                      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                        {/* Libellé brut de facture : donnée, pas interface. */}
                        <div data-no-translate style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>{l.libelle}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                          {l.referenceFourn ? `réf. ${l.referenceFourn} · ` : ''}
                          {l.quantite != null ? `${l.quantite} × ` : ''}
                          {l.conditionnement || '—'}
                          {l.prixAchat != null ? ` · ${fmt(l.prixAchat, 2)} le colis` : ' · prix non lu'}
                        </div>
                      </div>
                      {impact && (
                        <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 }}>
                          <div>
                            {fmt(impact.actuel)} → <strong style={{ color: 'var(--text)' }}>{fmt(impact.nouveau)}</strong>
                            <span style={{ color: 'var(--text3)' }}> /{l.produit.uniteRef}</span>
                          </div>
                          {impact.ecartPct != null && (
                            <span style={{ fontWeight: 700, color: impact.alerte ? 'var(--danger-text)' : 'var(--text3)' }}>
                              {impact.ecartPct > 0 ? '+' : ''}{impact.ecartPct.toFixed(1)} %
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {impact?.alerte && (
                      <div style={{ marginTop: 7, padding: '5px 8px', borderRadius: 6, background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)', fontSize: 11 }}>
                        Écart de plus de {SEUIL_ECART_PCT} % avec le prix actuel. Vraie variation, ou chiffre mal lu ? Vérifiez sur la facture avant d'appliquer.
                      </div>
                    )}
                    {impact?.verrouille && (
                      <div style={{ marginTop: 7, fontSize: 11, color: 'var(--text3)' }}>
                        Produit verrouillé : son prix ne sera pas modifié.
                      </div>
                    )}
                    {l.applique && l.produit && doublons.ids.has(l.produit.id) && (
                      <div style={{ marginTop: 7, padding: '5px 8px', borderRadius: 6, background: 'var(--danger-bg)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', fontSize: 11 }}>
                        Une autre ligne cochée vise déjà « {l.produit.nom} ». Un fournisseur n'a qu'un prix
                        par produit : décochez celle qui ne doit pas faire foi.
                      </div>
                    )}
                    {(l.issues || []).length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {l.issues.map(x => (
                          <span key={x} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning-text)' }}>{x}</span>
                        ))}
                      </div>
                    )}

                    {l.statut !== 'ignoree' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                        {l.produit && (
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                            → <strong style={{ color: 'var(--text)' }}>{l.produit.nom}</strong>
                            {l.statut === 'alias' && <span style={{ color: 'var(--success-text)', marginLeft: 6 }}>libellé déjà connu</span>}
                          </span>
                        )}
                        {(l.suggestions || []).map(s => (
                          <button key={s.product?.id} onClick={() => choisirProduit(l.id, s.product)}
                            style={{ padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                            {s.product?.nom} <span style={{ color: 'var(--text3)' }}>{s.confidence}%</span>
                          </button>
                        ))}
                        <input list="scan-facture-produits" defaultValue="" placeholder="Choisir un produit…"
                          onChange={e => { const p = produitParNom.get(e.target.value); if (p) choisirProduit(l.id, p); }}
                          style={{ ...inp, background: 'var(--surface)', flex: '1 1 160px', minWidth: 0 }} />
                        {l.statut === 'aucun' && (
                          <button onClick={() => creerProduit(l)}
                            style={{ ...inp, cursor: 'pointer', background: 'var(--surface)', whiteSpace: 'nowrap' }}>+ Créer au catalogue</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', flex: '1 1 200px', minWidth: 0 }}>
                {doublons.noms.length > 0 ? (
                  <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                    Plusieurs lignes visent {doublons.noms.map(n => `« ${n} »`).join(', ')}. Décochez les doublons.
                  </span>
                ) : nbApplique === 0 ? 'Aucune ligne sélectionnée.' : (
                  <><strong style={{ color: 'var(--text)' }}>{nbApplique}</strong> prix à mettre à jour sur {lignes.length} ligne(s) lues</>
                )}
              </div>
              <button onClick={onClose} disabled={!!progress} style={{ ...inp, cursor: 'pointer', background: 'var(--surface)', minHeight: 44 }}>Annuler</button>
              <button onClick={valider} disabled={!nbApplique || !!progress || doublons.noms.length > 0}
                style={{ ...inp, cursor: nbApplique && !doublons.noms.length ? 'pointer' : 'not-allowed', background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', fontWeight: 700, opacity: nbApplique && !doublons.noms.length ? 1 : 0.5, minHeight: 44 }}>
                Appliquer {nbApplique || ''}
              </button>
            </div>
          </>
        )}

        {etape === 'capture' && (
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ ...inp, cursor: 'pointer', background: 'var(--surface)', minHeight: 44 }}>Annuler</button>
            <button onClick={analyser} disabled={!fichiers.length}
              style={{ ...inp, cursor: fichiers.length ? 'pointer' : 'not-allowed', background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', fontWeight: 700, opacity: fichiers.length ? 1 : 0.5, minHeight: 44 }}>
              Analyser {fichiers.length || ''}
            </button>
          </div>
        )}
      </div>

      {progress && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(20,16,12,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(420px,94vw)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)', marginBottom: 4 }}>Mise à jour des prix</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {progress.done}/{progress.total} produit(s){progress.echecs ? ` · ${progress.echecs} échec(s)` : ''}
            </div>
            <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)', margin: '12px 0' }}>
              <div style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, height: '100%', background: 'var(--accent)', transition: 'width .15s linear' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { abortRef.current = true; }}
                style={{ ...inp, cursor: 'pointer', background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)' }}>Interrompre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
