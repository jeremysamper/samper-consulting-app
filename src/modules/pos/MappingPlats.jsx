/**
 * MappingPlats - Écran principal du mapping POS ↔ Recettes
 *
 * Orchestrateur J3 :
 *   1. Charge pos_items + recettes + mappings existants via usePosItemsMapping
 *   2. Calcule les suggestions Dice client-side via useMatchSuggestions
 *   3. Affiche MappingStats + MappingFilters + liste de PosItemRow
 *   4. Gère les 3 empty states (no_pos, no_recettes, all_mapped)
 *
 * Permissions :
 *   Lecture  : consultant + patron + resp_cuisine
 *   Écriture : consultant + patron + resp_cuisine
 *   (le module est déjà masqué pour cuisinier/serveur via moduleConfig.js)
 */

import { useMemo, useState } from 'react';
import { SectionHeader, Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { usePosItemsMapping } from './hooks/usePosItemsMapping.js';
import { useMatchSuggestions } from './hooks/useMatchSuggestions.js';
import { getMatchStatus, THRESHOLD_AUTO } from './lib/dice-coefficient.js';
import { loteEnSerie, regleQuiCorrespond } from './lib/reglesCorrespondance.js';
import ReglesPos, { useReglesPos } from './components/ReglesPos.jsx';
import { dbService } from '../../services/dbService.js';
import { MappingStats }   from './components/MappingStats.jsx';
import { MappingFilters } from './components/MappingFilters.jsx';
import { PosItemRow }     from './components/PosItemRow.jsx';
import { canManageModule } from '../../data/demoData.js';
import { normalizeSearch } from '../../utils/searchText.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { navigateToPage } from '../../services/navigationService.js';

// ── Helpers ──────────────────────────────────────────────────────

/** Dérive le statut affiché d'un pos_item */
function deriveStatus(mapping, suggestion) {
  if (mapping) {
    return mapping.manually_validated ? 'auto' : getMatchStatus(mapping.confidence);
  }
  return suggestion ? getMatchStatus(suggestion.score) : 'manual';
}

// ── Sous-composants ───────────────────────────────────────────────

// État vide : une phrase et, quand ce rôle a une action pour en sortir, le
// bouton qui y mène (pas de glyphe décoratif).
function EmptyState({ type, onNavigate }) {
  const config = {
    no_pos: {
      title: 'Aucune caisse connectée',
      desc: 'Connectez votre caisse Lightspeed dans Paramètres, rubrique Intégrations POS, puis lancez une synchronisation.',
      actionLabel: 'Ouvrir les paramètres',
    },
    no_recettes: {
      title: 'Aucune recette disponible',
      desc: "Créez d'abord vos fiches techniques dans le module Recettes pour pouvoir lier vos plats POS.",
      actionLabel: null,
    },
  }[type];

  if (!config) return null;

  return (
    <div style={{
      background:    'var(--surface)',
      border:        '1px solid var(--border)',
      borderRadius:  'var(--r)', boxShadow: 'var(--sh-xs)',
      padding:       '48px 32px',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           12,
      textAlign:     'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
        {config.title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 400, lineHeight: 1.6 }}>
        {config.desc}
      </div>
      {config.actionLabel && onNavigate && (
        <Btn onClick={onNavigate} style={{ marginTop: 4 }}>{config.actionLabel}</Btn>
      )}
    </div>
  );
}

function AllMappedState({ total }) {
  return (
    // Posé sur la page, sans encadré : la couleur du titre porte la réussite.
    <div style={{
      padding:       '32px 0',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           10,
      textAlign:     'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--success-text)' }}>
        Tous les plats ont leur correspondance !
      </div>
      <div style={{ fontSize: 13, color: 'var(--success-text)', lineHeight: 1.6 }}>
        {total} {total > 1 ? 'plats reliés' : 'plat relié'} à une recette.
      </div>
    </div>
  );
}

function EmptyFilter({ onReset }) {
  return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
      Aucun plat ne correspond à ce filtre.{' '}
      <button onClick={onReset} style={{
        background: 'none', border: 'none', color: 'var(--accent)',
        cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline',
      }}>Voir tous les plats</button>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
      Chargement du catalogue…
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{ 
      borderLeft: '2px solid var(--danger-bd)', 
      padding: '20px 0 20px 12px',
      display:       'flex',
      alignItems:    'center',
      justifyContent:'space-between',
      gap:           12,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger-text)', marginBottom: 2 }}>
          Erreur de chargement
        </div>
        <div style={{ fontSize: 12, color: 'var(--danger-strong)' }}>{message}</div>
      </div>
      <Btn variant="ghost" onClick={onRetry} style={{ fontSize: 12 }}>Réessayer</Btn>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────

export default function MappingPlats({ user, etablissement }) {
  const {
    posItems, recettes, mappings,
    loading, error, reload,
    validateMapping, changeMapping, unlinkMapping,
  } = usePosItemsMapping(etablissement, user);

  const suggestionsBrutes = useMatchSuggestions(posItems, recettes, mappings);
  // Règles de la maison (plan 15, lot 4) : un article « ignoré » sort de la
  // liste à relier ; un article « relié » par une règle la prend pour
  // suggestion sûre, tant qu'il n'a pas de correspondance.
  const { regles, relire: relireRegles } = useReglesPos(etablissement?.id || null);
  const itemsVisibles = useMemo(
    () => posItems.filter((i) => regleQuiCorrespond(i.name, regles)?.action !== 'ignorer'),
    [posItems, regles],
  );
  const ignores = posItems.length - itemsVisibles.length;
  const suggestions = useMemo(() => {
    const r = { ...suggestionsBrutes };
    posItems.forEach((i) => {
      const rg = regleQuiCorrespond(i.name, regles);
      if (rg?.action === 'relier' && rg.recette_id && !mappings[i.id]) {
        r[i.id] = { recipeId: rg.recette_id, recipeName: recettes.find((x) => x.id === rg.recette_id)?.nom || '', score: 100, regleId: rg.id };
      }
    });
    return r;
  }, [suggestionsBrutes, posItems, regles, mappings, recettes]);
  const [serieEnCours, setSerieEnCours] = useState(false);
  const [filter, setFilter]   = useState('all');
  const [search, setSearch]   = useState('');

  // Modifier les mappings : droit « gérer » du module pos (Rôles & accès).
  const canEdit = canManageModule(user?.role, 'pos');

  // ── Statuts calculés pour tous les items ────────────────────────
  const itemStatuses = useMemo(() => {
    const result = {};
    for (const item of itemsVisibles) {
      result[item.id] = deriveStatus(mappings[item.id] ?? null, suggestions[item.id] ?? null);
    }
    return result;
  }, [itemsVisibles, mappings, suggestions]);

  // ── Compteurs ──────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { auto: 0, suggested: 0, manual: 0 };
    for (const s of Object.values(itemStatuses)) c[s]++;
    return { ...c, all: itemsVisibles.length };
  }, [itemStatuses, itemsVisibles.length]);

  const mappedCount = itemsVisibles.filter((i) => mappings[i.id]).length;
  const lot = canEdit ? loteEnSerie({ posItems: itemsVisibles, mappings, suggestions, regles, seuil: THRESHOLD_AUTO }) : [];

  // ── Items filtrés ──────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let items = itemsVisibles;
    if (search.trim()) {
      const q = normalizeSearch(search);
      items = items.filter((i) => normalizeSearch(i.name).includes(q));
    }
    if (filter !== 'all') {
      items = items.filter((i) => itemStatuses[i.id] === filter);
    }
    return items;
  }, [itemsVisibles, search, filter, itemStatuses]);

  // ── Handlers ───────────────────────────────────────────────────
  async function handleValidate(posItemId) {
    try {
      const mapping    = mappings[posItemId];
      const suggestion = suggestions[posItemId];
      if (mapping) {
        await validateMapping(posItemId);
      } else if (suggestion) {
        await changeMapping(posItemId, suggestion.recipeId, suggestion.score);
      }
      notify('Correspondance validée', 'success');
    } catch (e) {
      notify(messageErreur(e, 'ventes caisse', 'Validation impossible.'), 'error');
    }
  }

  // Valider en série : toutes les suggestions sûres et les articles reliés
  // par une règle, en une seule écriture.
  async function validerEnSerie() {
    if (!lot.length || serieEnCours) return;
    setSerieEnCours(true);
    const maintenant = new Date().toISOString();
    const { error: err } = await dbService.getClient().from('pos_item_recipe_mapping').upsert(
      lot.map((l) => ({
        pos_item_id: l.posItemId, recipe_id: l.recipeId, confidence: l.confidence, manually_validated: true,
        matched_at: maintenant, matched_by: user?.id ?? null, regle_id: l.regleId,
      })),
      { onConflict: 'pos_item_id' },
    );
    setSerieEnCours(false);
    if (err) { notify(messageErreur(err, 'ventes caisse', 'Validation impossible.'), 'error'); return; }
    notify(`${lot.length} ${lot.length > 1 ? 'correspondances validées' : 'correspondance validée'}.`, 'success');
    reload();
  }

  async function handleChange(posItemId, recipeId, score) {
    try {
      await changeMapping(posItemId, recipeId, score);
      notify('Recette modifiée', 'success');
    } catch (e) {
      notify(messageErreur(e, 'ventes caisse', 'Modification impossible.'), 'error');
    }
  }

  async function handleUnlink(posItemId) {
    try {
      await unlinkMapping(posItemId);
      notify('Lien supprimé', 'info');
    } catch (e) {
      notify(messageErreur(e, 'ventes caisse', 'Opération impossible.'), 'error');
    }
  }

  // ── Empty states prioritaires ──────────────────────────────────
  const etabNom = etablissement?.nom ?? '';

  if (!loading && posItems.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Correspondance des plats POS et des recettes" subtitle={etabNom} />
        {/* Paramètres est réservé au consultant : lui seul y est envoyé. */}
        <EmptyState type="no_pos" onNavigate={user?.role === 'consultant' ? () => navigateToPage('parametres') : null} />
      </div>
    );
  }

  if (!loading && recettes.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Correspondance des plats POS et des recettes" subtitle={etabNom} />
        <EmptyState type="no_recettes" />
      </div>
    );
  }

  if (!loading && !error && itemsVisibles.length > 0 && mappedCount === itemsVisibles.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Correspondance des plats POS et des recettes" subtitle={etabNom} />
        <MappingStats
          total={posItems.length} mapped={mappedCount}
          auto={counts.auto} suggested={counts.suggested} manual={counts.manual}
        />
        <AllMappedState total={itemsVisibles.length} />
        <ReglesPos etabId={etablissement?.id} regles={regles} recettes={recettes} canEdit={canEdit} onChange={relireRegles} />
      </div>
    );
  }

  // ── Rendu principal ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader
        title="Correspondance des plats POS et des recettes"
        subtitle={etabNom ? `${etabNom}, Lightspeed` : 'Lightspeed'}
      />

      {/* Stats */}
      {!loading && !error && (
        <MappingStats
          total={posItems.length} mapped={mappedCount}
          auto={counts.auto} suggested={counts.suggested} manual={counts.manual}
        />
      )}

      {/* En série (plan 15, lot 4) : les suggestions sûres et les règles. */}
      {!loading && !error && (lot.length > 0 || ignores > 0) && (
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {lot.length > 0 && (
            <Btn variant="primary" disabled={serieEnCours} onClick={validerEnSerie}>
              Valider <span data-no-translate="">{lot.length}</span> {lot.length > 1 ? 'suggestions sûres' : 'suggestion sûre'}
            </Btn>
          )}
          {ignores > 0 && <span style={{ fontSize: 'var(--t2)', color: 'var(--text2)' }}><span data-no-translate="">{ignores}</span> {ignores > 1 ? 'articles écartés par une règle' : 'article écarté par une règle'}</span>}
        </div>
      )}

      {/* Filtres */}
      {!loading && !error && posItems.length > 0 && (
        <MappingFilters
          filter={filter}
          onFilter={setFilter}
          search={search}
          onSearch={setSearch}
          counts={counts}
        />
      )}

      {/* Corps */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filteredItems.length === 0 ? (
        <EmptyFilter onReset={() => { setFilter('all'); setSearch(''); }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredItems.map((item) => (
            <PosItemRow
              key={item.id}
              item={item}
              mapping={mappings[item.id] ?? null}
              suggestion={suggestions[item.id] ?? null}
              recettes={recettes}
              canEdit={canEdit}
              onValidate={() => handleValidate(item.id)}
              onChange={(recipeId, score) => handleChange(item.id, recipeId, score)}
              onUnlink={() => handleUnlink(item.id)}
            />
          ))}
        </div>
      )}

      {!loading && !error && <ReglesPos etabId={etablissement?.id} regles={regles} recettes={recettes} canEdit={canEdit} onChange={relireRegles} />}
    </div>
  );
}
