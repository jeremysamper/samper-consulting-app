import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';
import { normalizeSearch } from '../../../utils/searchText.js';
import { resolvePrixProduit } from '../../../services/prixResolution.js';
import {
  collectIngredientGroups, matchGroup, planLinkWrites,
  detectPerteDePrix, prixSeedPourNouveauProduit, uniteDominante,
} from '../bulkLinkLogic.js';

// Écran de liaison en masse des ingrédients au catalogue produits.
//
// Sans lui, un prix parfaitement tenu au catalogue n'atteint presque aucune
// recette : les ingrédients sont saisis à la main et rien ne les rattache. On
// travaille par NOM DISTINCT, pas par ligne, et chaque décision se propage à
// toutes les recettes qui emploient ce nom.
//
// Props : recettes, catalogue, legacySB, etabId, onClose, onDone

const CHUNK = 40; // groupes rapprochés par tick, pour ne pas geler l'interface

const PILES = [
  { id: 'auto',   label: 'Correspondance sûre', hint: 'Prêtes à lier, décochez ce qui ne va pas.' },
  { id: 'ambigu', label: 'À trancher',          hint: 'Plusieurs candidats : choisissez le bon produit.' },
  { id: 'aucun',  label: 'Sans correspondance', hint: 'Rien au catalogue. Créez le produit si besoin.' },
  { id: 'exclu',  label: 'Non commerciaux',     hint: 'Sel, poivre, eau : normalement rien à lier.' },
];

const chipStyle = (conf) => ({
  fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap',
  background: conf >= 85 ? 'var(--success-bg)' : conf >= 60 ? 'var(--warning-bg)' : 'var(--surface2)',
  color: conf >= 85 ? 'var(--success-text)' : conf >= 60 ? 'var(--warning-text)' : 'var(--text2)',
});

export default function BulkProductLinker({ recettes, catalogue, legacySB, etabId, onClose, onDone }) {
  const [scan, setScan] = React.useState({ phase: 'calcul', done: 0, total: 0, dejaLies: 0, totalIng: 0 });
  const [groups, setGroups] = React.useState([]);
  const [pile, setPile] = React.useState('auto');
  const [search, setSearch] = React.useState('');
  // clé de groupe -> produit retenu. Absent = non sélectionné.
  const [decisions, setDecisions] = React.useState(() => new Map());
  const [progress, setProgress] = React.useState(null);
  const abortRef = React.useRef(false);
  // Produits créés pendant la session, ajoutés au catalogue local sans rechargement.
  const [extraProduits, setExtraProduits] = React.useState([]);

  const catalogueComplet = React.useMemo(
    () => [...(catalogue || []), ...extraProduits],
    [catalogue, extraProduits],
  );
  // Choix manuel : datalist native plutôt qu'un menu maison. Sur 800 produits
  // elle filtre à la frappe, marche au clavier et se comporte correctement sur iPad.
  const produitParNom = React.useMemo(() => {
    const m = new Map();
    catalogueComplet.forEach(p => { if (p?.nom && !m.has(p.nom)) m.set(p.nom, p); });
    return m;
  }, [catalogueComplet]);
  const nomsCatalogue = React.useMemo(
    () => [...produitParNom.keys()].sort((a, b) => a.localeCompare(b)),
    [produitParNom],
  );

  // ── Rapprochement, découpé en tranches ──
  // matchIngredient fait du Levenshtein sur tout le catalogue : quelques
  // centaines de noms x 800 produits gèlerait l'onglet en une seule passe.
  React.useEffect(() => {
    let annule = false;
    const { groups: bruts, dejaLies, total } = collectIngredientGroups(recettes);
    setScan({ phase: 'calcul', done: 0, total: bruts.length, dejaLies, totalIng: total });
    if (!bruts.length) {
      setGroups([]);
      setScan(s => ({ ...s, phase: 'pret' }));
      return () => { annule = true; };
    }

    const acc = [];
    let i = 0;
    const tick = () => {
      if (annule) return;
      const fin = Math.min(i + CHUNK, bruts.length);
      for (; i < fin; i++) acc.push(matchGroup(bruts[i], catalogue));
      setScan(s => ({ ...s, done: i }));
      if (i < bruts.length) {
        setTimeout(tick, 0);
      } else {
        setGroups(acc);
        // Les correspondances sûres sont pré-cochées : c'est le gros du volume
        // et les décocher une à une serait absurde. Exception : celles qui
        // feraient tomber un coût à zéro restent décochées, sinon l'avertissement
        // affiché sur la ligne contredirait ce que le bouton s'apprête à faire.
        const d = new Map();
        acc.forEach(g => {
          if (g.statut !== 'auto' || !g.product) return;
          if (detectPerteDePrix(g, g.product)) return;
          d.set(g.key, g.product);
        });
        setDecisions(d);
        setScan(s => ({ ...s, phase: 'pret' }));
      }
    };
    setTimeout(tick, 0);
    return () => { annule = true; };
    // Le catalogue de départ suffit : les produits créés en séance sont rattachés
    // à la main, relancer tout le rapprochement à chaque création serait pénible.
  }, [recettes, catalogue]);

  const parPile = React.useMemo(() => {
    const m = { auto: [], ambigu: [], aucun: [], exclu: [] };
    groups.forEach(g => { if (m[g.statut]) m[g.statut].push(g); });
    return m;
  }, [groups]);

  const visibles = React.useMemo(() => {
    const list = parPile[pile] || [];
    const q = normalizeSearch(search);
    return q ? list.filter(g => normalizeSearch(g.nom).includes(q)) : list;
  }, [parPile, pile, search]);

  const nbSelection = decisions.size;
  const nbLignesSelection = React.useMemo(() => {
    let n = 0;
    groups.forEach(g => { if (decisions.has(g.key)) n += g.nbOccurrences; });
    return n;
  }, [groups, decisions]);
  const nbRecettesSelection = React.useMemo(() => {
    const s = new Set();
    groups.forEach(g => {
      if (!decisions.has(g.key)) return;
      g.occurrences.forEach(o => s.add(o.recetteId));
    });
    return s.size;
  }, [groups, decisions]);

  const setDecision = (key, product) => {
    setDecisions(prev => {
      const next = new Map(prev);
      if (product) next.set(key, product); else next.delete(key);
      return next;
    });
  };

  const toutCocher = (valeur) => {
    setDecisions(prev => {
      const next = new Map(prev);
      visibles.forEach(g => {
        if (!valeur) { next.delete(g.key); return; }
        const cible = g.product || (g.suggestions || [])[0]?.product;
        // Même exception qu'au pré-cochage : « Tout cocher » ne coche pas ce qui
        // ferait tomber un coût à zéro. Ces lignes restent à cocher une par une,
        // en connaissance de cause.
        if (cible && !detectPerteDePrix(g, cible)) next.set(g.key, cible);
      });
      return next;
    });
  };

  // ── Création d'un produit depuis un ingrédient sans correspondance ──
  const creerProduit = async (g) => {
    if (!legacySB) return;
    const uniteRef = uniteDominante(g, 'g');
    // Le prix déjà saisi dans les recettes remonte au catalogue : sans ça, lier
    // sur une fiche à zéro ferait tomber le coût des recettes concernées.
    const prixUnitaire = prixSeedPourNouveauProduit(g, uniteRef);
    try {
      const row = await legacySB.db.upsertProduit({
        etablissementId: etabId,
        nom: g.nom,
        categorie: 'Autres',
        uniteRef,
        prixUnitaire: prixUnitaire || null,
        actif: true,
      });
      const produit = {
        id: row?.id, nom: g.nom, uniteRef,
        prixUnitaire: prixUnitaire || 0, prixUnitaireManuel: prixUnitaire || 0,
        categorie: 'Autres', fournisseurs: [], allergenes: [],
      };
      setExtraProduits(prev => [...prev, produit]);
      setGroups(prev => prev.map(x => (x.key === g.key
        ? { ...x, statut: 'auto', product: produit, confidence: 100 }
        : x)));
      setDecision(g.key, produit);
      notify(`« ${g.nom} » créé au catalogue${prixUnitaire ? ` à ${prixUnitaire.toFixed(3)}/${uniteRef}` : ''}.`, 'success');
    } catch (err) {
      notify('Création impossible : ' + (err.message || err), 'error');
    }
  };

  // ── Application : un upsert par recette, séquentiel, annulable ──
  const appliquer = async () => {
    if (!legacySB || !decisions.size) return;
    const writes = planLinkWrites(recettes, groups, decisions);
    if (!writes.length) { notify('Rien à appliquer.', 'info'); return; }

    abortRef.current = false;
    setProgress({ done: 0, total: writes.length, lignes: 0, echecs: 0 });

    let done = 0, lignes = 0, echecs = 0;
    for (const w of writes) {
      if (abortRef.current) break;
      try {
        await legacySB.db.upsertRecette({ ...w.recette, ingredients: w.ingredients });
        lignes += w.nbLignes;
      } catch (err) {
        echecs += 1;
        console.error('[BulkProductLinker]', w.recette?.id, err);
      }
      done += 1;
      setProgress({ done, total: writes.length, lignes, echecs });
    }

    const interrompu = abortRef.current;
    setProgress(null);
    if (echecs) {
      notify(`${lignes} ligne(s) liée(s), ${echecs} recette(s) en échec.`, 'warning');
    } else if (interrompu) {
      notify(`Interrompu : ${lignes} ligne(s) liée(s) sur ${writes.length} recettes prévues.`, 'info');
    } else {
      notify(`${lignes} ligne(s) liée(s) dans ${done} recette(s).`, 'success');
    }
    if (onDone) await onDone();
    if (!interrompu && !echecs) onClose();
  };

  const enCalcul = scan.phase === 'calcul';
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 0;

  return (
    <div
      className="modal-full-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget && !progress) onClose(); }}
    >
      <div
        className="modal-full"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(920px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}
      >
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
              Lier les ingrédients au catalogue
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {enCalcul
                ? `Rapprochement en cours… ${scan.done}/${scan.total}`
                : `${scan.totalIng} ingrédient(s), ${scan.dejaLies} déjà lié(s), ${groups.length} nom(s) distinct(s) à traiter`}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={!!progress}
            title="Fermer"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: progress ? 'not-allowed' : 'pointer', color: 'var(--text2)', flexShrink: 0 }}
          >✕</button>
        </div>

        {enCalcul ? (
          <div style={{ padding: 28 }}>
            <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .12s linear' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10, textAlign: 'center' }}>
              Comparaison de chaque nom avec les {(catalogue || []).length} produits du catalogue.
            </div>
          </div>
        ) : (
          <>
            {/* Piles */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 18px 0', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {PILES.map(p => {
                const n = (parPile[p.id] || []).length;
                const actif = pile === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPile(p.id)}
                    style={{
                      padding: '7px 12px', fontSize: 12, fontWeight: actif ? 800 : 600, whiteSpace: 'nowrap',
                      background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
                      color: actif ? 'var(--accent)' : 'var(--text2)',
                      borderBottom: `2px solid ${actif ? 'var(--accent)' : 'transparent'}`,
                    }}
                  >{p.label} ({n})</button>
                );
              })}
            </div>

            {/* Barre d'outils de la pile */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filtrer…"
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 12, minWidth: 0, flex: '1 1 140px' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text3)', flex: '1 1 auto', minWidth: 0 }}>
                {PILES.find(p => p.id === pile)?.hint}
              </span>
              {pile !== 'aucun' && (
                <>
                  <Btn small variant="ghost" onClick={() => toutCocher(true)}>Tout cocher</Btn>
                  <Btn small variant="ghost" onClick={() => toutCocher(false)}>Tout décocher</Btn>
                </>
              )}
            </div>

            <datalist id="bulk-linker-produits">
              {nomsCatalogue.map(n => <option key={n} value={n} />)}
            </datalist>

            {/* Liste */}
            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {visibles.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text2)', fontSize: 13 }}>
                  {search ? 'Aucun nom ne correspond au filtre.' : '✓ Rien dans cette pile.'}
                </div>
              )}
              {visibles.map(g => {
                const choisi = decisions.get(g.key) || null;
                const perteDePrix = detectPerteDePrix(g, choisi);
                return (
                  <div
                    key={g.key}
                    style={{
                      border: `1px solid ${choisi ? 'var(--success-bd)' : 'var(--border)'}`,
                      background: choisi ? 'var(--success-bg)' : 'var(--bg)',
                      borderRadius: 8, padding: '9px 12px', marginBottom: 7,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {g.statut !== 'aucun' && (
                        // 44x44 : une case nue de 18 px se rate au doigt sur iPad.
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, margin: -12, cursor: 'pointer', flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={!!choisi}
                            onChange={e => setDecision(g.key, e.target.checked
                              ? (g.product || (g.suggestions || [])[0]?.product || null)
                              : null)}
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                          />
                        </label>
                      )}
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{g.nom}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                          {g.nbOccurrences} ligne{g.nbOccurrences > 1 ? 's' : ''} · {g.nbRecettes} recette{g.nbRecettes > 1 ? 's' : ''}
                        </div>
                      </div>
                      {choisi && (
                        <div style={{ fontSize: 11, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 }}>
                          → <strong style={{ color: 'var(--text)' }}>{choisi.nom}</strong>
                          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-serif)', marginLeft: 6 }}>
                            {resolvePrixProduit(choisi).toFixed(3)}/{choisi.uniteRef}
                          </span>
                        </div>
                      )}
                    </div>

                    {perteDePrix && (
                      <div style={{ marginTop: 7, padding: '5px 8px', borderRadius: 6, background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)', fontSize: 11 }}>
                        Ce produit est à 0 au catalogue alors que les recettes portent un prix saisi. Lier ferait tomber leur coût à zéro : renseignez d'abord le prix du produit.
                      </div>
                    )}

                    {/* Candidats à trancher */}
                    {g.statut === 'ambigu' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        {(g.suggestions || []).map(s => {
                          const actif = choisi && s.product && choisi.id === s.product.id;
                          return (
                            <button
                              key={s.product?.id || s.nom}
                              onClick={() => setDecision(g.key, actif ? null : s.product)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                                padding: '5px 10px', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)',
                                background: actif ? 'var(--accent)' : 'var(--surface)',
                                color: actif ? '#fff' : 'var(--text)',
                                border: `1px solid ${actif ? 'var(--accent)' : 'var(--border)'}`,
                              }}
                            >
                              {s.product?.nom || s.nom}
                              <span style={chipStyle(s.confidence)}>{s.confidence}%</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Choix manuel : le rapprochement automatique n'est pas infaillible
                        (« Crème » face à « Crème entière 35% » lui échappe), il faut
                        toujours pouvoir désigner le produit soi-même. */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                      <input
                        list="bulk-linker-produits"
                        defaultValue=""
                        placeholder="Choisir un produit…"
                        onChange={e => {
                          const p = produitParNom.get(e.target.value);
                          if (p) setDecision(g.key, p);
                        }}
                        style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 12, flex: '1 1 180px', minWidth: 0 }}
                      />
                      {g.statut === 'aucun' && (
                        <>
                          <Btn small variant="ghost" onClick={() => creerProduit(g)}>
                            + Créer au catalogue ({uniteDominante(g, 'g')})
                          </Btn>
                          <span style={{ fontSize: 11, color: 'var(--text3)', flex: '1 1 auto', minWidth: 0 }}>
                            {prixSeedPourNouveauProduit(g, uniteDominante(g, 'g')) > 0
                              ? `Prix repris des recettes : ${prixSeedPourNouveauProduit(g, uniteDominante(g, 'g')).toFixed(3)}/${uniteDominante(g, 'g')}.`
                              : 'Fiche créée sans prix, à compléter au catalogue.'}
                          </span>
                        </>
                      )}
                    </div>

                    {g.statut === 'auto' && g.confidence < 100 && (
                      <div style={{ marginTop: 6 }}>
                        <span style={chipStyle(g.confidence)}>correspondance {g.confidence}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pied : récapitulatif et application */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', flex: '1 1 200px', minWidth: 0 }}>
                {nbSelection === 0
                  ? 'Aucune liaison sélectionnée.'
                  : <>
                      <strong style={{ color: 'var(--text)' }}>{nbSelection}</strong> nom(s) ·{' '}
                      <strong style={{ color: 'var(--text)' }}>{nbLignesSelection}</strong> ligne(s) dans{' '}
                      <strong style={{ color: 'var(--text)' }}>{nbRecettesSelection}</strong> recette(s)
                    </>}
              </div>
              <Btn variant="ghost" onClick={onClose} disabled={!!progress}>Annuler</Btn>
              <Btn variant="primary" onClick={appliquer} disabled={!nbSelection || !!progress}>
                Lier {nbSelection || ''}
              </Btn>
            </div>
          </>
        )}
      </div>

      {/* Progression de l'écriture */}
      {progress && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(20,16,12,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(420px,94vw)', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)', marginBottom: 4 }}>
              Liaison en cours
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {progress.done}/{progress.total} recette(s) · {progress.lignes} ligne(s) liée(s)
              {progress.echecs ? ` · ${progress.echecs} échec(s)` : ''}
            </div>
            <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--border)', margin: '12px 0' }}>
              <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: '100%', background: 'var(--accent)', transition: 'width .15s linear' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn small variant="danger" onClick={() => { abortRef.current = true; }}>
                Interrompre
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
