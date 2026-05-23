import { useState } from 'react';
import { SectionHeader, TabBar } from '../../components/ui/index.jsx';
import MappingPlats       from './MappingPlats.jsx';
import MiseEnPlace        from './views/MiseEnPlace.jsx';
import TopFlop            from './views/TopFlop.jsx';
import ConsoIngredients   from './views/ConsoIngredients.jsx';

// ─────────────────────────────────────────────────────────────────
// VentesPos — Module Ventes POS
//
// J2 : Sync automatique Lightspeed (cron 04:00 UTC).
// J3 : ✅ Mapping plats POS ↔ Recettes (onglet Mapping).
// J4 : Vues cuisine (Mise en place J+1, Top/Flop, Conso).
// J5 : Permissions cuisinier — lecture seule, onglet Mapping masqué.
// ─────────────────────────────────────────────────────────────────

// Rôles autorisés à accéder à l'onglet Mapping et à modifier les connexions POS
const EDIT_ROLES = ['consultant', 'patron', 'resp_cuisine'];

const ALL_TABS = [
  { id: 'mise_en_place', label: 'Mise en place J+1', icon: '◷' },
  { id: 'top_flop',      label: 'Top / Flop',        icon: '↑↓' },
  { id: 'conso',         label: 'Conso ingrédients', icon: '◈' },
  { id: 'mapping',       label: 'Mapping plats',     icon: '⇄' },
];

export default function VentesPos({ user, etablissement }) {
  const [tab, setTab] = useState('mise_en_place');

  // canEdit : accès à l'onglet Mapping + actions d'écriture (connexion, mapping)
  const canEdit = EDIT_ROLES.includes(user?.role);

  // Onglets visibles selon le rôle — cuisinier ne voit pas Mapping
  const TABS = canEdit ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'mapping');

  // Guard : si l'onglet actif est 'mapping' alors que le rôle ne l'autorise pas
  // (ex. changement de rôle en cours de session), on revient sur la vue par défaut.
  const effectiveTab = (!canEdit && tab === 'mapping') ? 'mise_en_place' : tab;

  const etabNom = etablissement?.nom || 'Établissement sélectionné';

  // onNavigateToMapping : proposé uniquement aux rôles canEdit
  const handleNavigateToMapping = canEdit ? () => setTab('mapping') : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Ventes POS"
        subtitle={`Synchronisation Lightspeed · ${etabNom}`}
      />

      <TabBar tabs={TABS} active={effectiveTab} onChange={setTab} />

      {/* ── Mise en place J+1 ── */}
      {effectiveTab === 'mise_en_place' && (
        <MiseEnPlace
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Top / Flop ── */}
      {effectiveTab === 'top_flop' && (
        <TopFlop
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Conso ingrédients ── */}
      {effectiveTab === 'conso' && (
        <ConsoIngredients
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Mapping plats POS ↔ Recettes (J3) — canEdit uniquement ── */}
      {effectiveTab === 'mapping' && canEdit && (
        <MappingPlats user={user} etablissement={etablissement} />
      )}
    </div>
  );
}
