import { useState } from 'react';
import { canManageModule } from '../../data/demoData.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import PosConnectionBar   from './components/PosConnectionBar.jsx';
import MappingPlats       from './MappingPlats.jsx';
import MiseEnPlace        from './views/MiseEnPlace.jsx';
import TopFlop            from './views/TopFlop.jsx';
import ConsoIngredients   from './views/ConsoIngredients.jsx';

// ─────────────────────────────────────────────────────────────────
// VentesPos - Module Ventes POS
//
// J2 : Sync automatique Lightspeed (cron 04:00 UTC).
// J3 : ✅ Mapping plats POS ↔ Recettes (onglet Mapping).
// J4 : Vues cuisine (Mise en place J+1, Top/Flop, Conso).
// J5 : Permissions cuisinier - lecture seule, onglet Mapping masqué.
// ─────────────────────────────────────────────────────────────────

const ALL_TABS = [
  { id: 'mise_en_place', label: 'Mise en place J+1', icon: '◷' },
  { id: 'top_flop',      label: 'Meilleures et moins bonnes ventes', icon: '↑↓' },
  { id: 'conso',         label: 'Conso ingrédients', icon: '◈' },
  { id: 'mapping',       label: 'Correspondance des plats', icon: '⇄' },
];

export default function VentesPos({ user, etablissement }) {
  const [tab, setTab] = useState('mise_en_place');
  // Incremente apres une synchro pour forcer le rechargement des vues (refetch).
  const [dataVersion, setDataVersion] = useState(0);

  // canEdit : accès à l'onglet Mapping + actions d'écriture (connexion, mapping).
  // Droit « gérer » du module pos (Rôles & accès, case « Modifier »).
  const canEdit = canManageModule(user?.role, 'pos');

  // Onglets visibles selon le rôle - cuisinier ne voit pas Mapping
  const TABS = canEdit ? ALL_TABS : ALL_TABS.filter(t => t.id !== 'mapping');

  // Guard : si l'onglet actif est 'mapping' alors que le rôle ne l'autorise pas
  // (ex. changement de rôle en cours de session), on revient sur la vue par défaut.
  const effectiveTab = (!canEdit && tab === 'mapping') ? 'mise_en_place' : tab;

  // onNavigateToMapping : proposé uniquement aux rôles canEdit
  const handleNavigateToMapping = canEdit ? () => setTab('mapping') : undefined;

  // Pas de titre interne : « Ventes POS » est déjà le titre de la barre du haut.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Barre connexion / synchro (couplage + sync manuelle) ── */}
      <PosConnectionBar
        etablissement={etablissement}
        user={user}
        onSynced={() => setDataVersion((v) => v + 1)}
      />

      {/* Libellés seuls : pas de glyphe devant un onglet. */}
      <SegmentedTabs tabs={TABS.map(({ id, label }) => ({ id, label }))} active={effectiveTab} onChange={setTab} />

      {/* ── Mise en place J+1 ── */}
      {effectiveTab === 'mise_en_place' && (
        <MiseEnPlace
          key={dataVersion}
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Top / Flop ── */}
      {effectiveTab === 'top_flop' && (
        <TopFlop
          key={dataVersion}
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Conso ingrédients ── */}
      {effectiveTab === 'conso' && (
        <ConsoIngredients
          key={dataVersion}
          etablissement={etablissement}
          onNavigateToMapping={handleNavigateToMapping}
        />
      )}

      {/* ── Mapping plats POS ↔ Recettes (J3) - canEdit uniquement ── */}
      {effectiveTab === 'mapping' && canEdit && (
        <MappingPlats key={dataVersion} user={user} etablissement={etablissement} />
      )}
    </div>
  );
}
