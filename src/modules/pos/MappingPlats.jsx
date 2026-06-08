/**
 * MappingPlats — Écran principal du mapping POS ↔ Recettes
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
import { getMatchStatus } from './lib/dice-coefficient.js';
import { MappingStats }   from './components/MappingStats.jsx';
import { MappingFilters } from './components/MappingFilters.jsx';
import { PosItemRow }     from './components/PosItemRow.jsx';

/** Rôles autorisés à modifier les mappings */
const EDIT_ROLES = new Set(['consultant', 'patron', 'resp_cuisine']);

// ── Helpers ──────────────────────────────────────────────────────

/** Dérive le statut affiché d'un pos_item */
function deriveStatus(mapping, suggestion) {
  if (mapping) {
    return mapping.manually_validated ? 'auto' : getMatchStatus(mapping.confidence);
  }
  return suggestion ? getMatchStatus(suggestion.score) : 'manual';
}

// ── Sous-composants ───────────────────────────────────────────────

function EmptyState({ type, onNavigate }) {
  const config = {
    no_pos: {
      icon: '◑',
      title: 'Aucune caisse connectée',
      desc: 'Connectez votre caisse Lightspeed dans Paramètres → Intégrations POS, puis lancez une synchronisation.',
      action: null,
    },
    no_recettes: {
      icon: '◈',
      title: 'Aucune recette disponible',
      desc: "Créez d'abord vos fiches techniques dans le module Recettes pour pouvoir lier vos plats POS.",
      action: null,
    },
  }[type];

  if (!config) return null;

  return (
    <div style={{
      background:    'var(--surface)',
      border:        '1px solid var(--border)',
      borderRadius:  12,
      padding:       '48px 32px',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           12,
      textAlign:     'center',
    }}>
      <div style={{ fontSize: 40, opacity: 0.15 }}>{config.icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
        {config.title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 400, lineHeight: 1.6 }}>
        {config.desc}
      </div>
    </div>
  );
}

function AllMappedState({ total }) {
  return (
    <div style={{
      background:    'var(--success-bg-soft)',
      border:        '1px solid var(--success-bd)',
      borderRadius:  12,
      padding:       '40px 32px',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           10,
      textAlign:     'center',
    }}>
      <div style={{ fontSize: 36 }}>🎉</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--success-text)' }}>
        Tous les plats sont mappés !
      </div>
      <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
        {total} plat{total > 1 ? 's' : ''} relié{total > 1 ? 's' : ''} à une recette.
        Les vues Mise en place et Top/Flop sont prêtes pour J4.
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
      background:    'var(--danger-bg-soft)',
      border:        '1px solid #fecaca',
      borderRadius:  10,
      padding:       '20px 24px',
      display:       'flex',
      alignItems:    'center',
      justifyContent:'space-between',
      gap:           12,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 2 }}>
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

  const suggestions   = useMatchSuggestions(posItems, recettes, mappings);
  const [filter, setFilter]   = useState('all');
  const [search, setSearch]   = useState('');

  const canEdit = EDIT_ROLES.has(user?.role ?? '');

  // ── Statuts calculés pour tous les items ────────────────────────
  const itemStatuses = useMemo(() => {
    const result = {};
    for (const item of posItems) {
      result[item.id] = deriveStatus(mappings[item.id] ?? null, suggestions[item.id] ?? null);
    }
    return result;
  }, [posItems, mappings, suggestions]);

  // ── Compteurs ──────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { auto: 0, suggested: 0, manual: 0 };
    for (const s of Object.values(itemStatuses)) c[s]++;
    return { ...c, all: posItems.length };
  }, [itemStatuses, posItems.length]);

  const mappedCount = Object.keys(mappings).length;

  // ── Items filtrés ──────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let items = posItems;
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (filter !== 'all') {
      items = items.filter((i) => itemStatuses[i.id] === filter);
    }
    return items;
  }, [posItems, search, filter, itemStatuses]);

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
      notify('Mapping validé ✓', 'success');
    } catch (e) {
      notify(e?.message ?? 'Erreur de validation', 'error');
    }
  }

  async function handleChange(posItemId, recipeId, score) {
    try {
      await changeMapping(posItemId, recipeId, score);
      notify('Recette modifiée ✓', 'success');
    } catch (e) {
      notify(e?.message ?? 'Erreur de modification', 'error');
    }
  }

  async function handleUnlink(posItemId) {
    try {
      await unlinkMapping(posItemId);
      notify('Lien supprimé', 'info');
    } catch (e) {
      notify(e?.message ?? 'Erreur', 'error');
    }
  }

  // ── Empty states prioritaires ──────────────────────────────────
  const etabNom = etablissement?.nom ?? '';

  if (!loading && posItems.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Mapping plats POS ↔ Recettes" subtitle={etabNom} />
        <EmptyState type="no_pos" />
      </div>
    );
  }

  if (!loading && recettes.length === 0 && !error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Mapping plats POS ↔ Recettes" subtitle={etabNom} />
        <EmptyState type="no_recettes" />
      </div>
    );
  }

  if (!loading && !error && posItems.length > 0 && mappedCount === posItems.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SectionHeader title="Mapping plats POS ↔ Recettes" subtitle={etabNom} />
        <MappingStats
          total={posItems.length} mapped={mappedCount}
          auto={counts.auto} suggested={counts.suggested} manual={counts.manual}
        />
        <AllMappedState total={posItems.length} />
      </div>
    );
  }

  // ── Rendu principal ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionHeader
        title="Mapping plats POS ↔ Recettes"
        subtitle={etabNom ? `${etabNom} · Lightspeed` : 'Lightspeed'}
      />

      {/* Stats */}
      {!loading && !error && (
        <MappingStats
          total={posItems.length} mapped={mappedCount}
          auto={counts.auto} suggested={counts.suggested} manual={counts.manual}
        />
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
    </div>
  );
}
