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
// ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'mise_en_place', label: 'Mise en place J+1', icon: '◷' },
  { id: 'top_flop',      label: 'Top / Flop',        icon: '↑↓' },
  { id: 'conso',         label: 'Conso ingrédients', icon: '◈' },
  { id: 'mapping',       label: 'Mapping plats',     icon: '⇄' },
];

export default function VentesPos({ user, etablissement }) {
  const [tab, setTab] = useState('mise_en_place');

  const etabNom = etablissement?.nom || 'Établissement sélectionné';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHeader
        title="Ventes POS"
        subtitle={`Synchronisation Lightspeed · ${etabNom}`}
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Mise en place J+1 ── */}
      {tab === 'mise_en_place' && (
        <MiseEnPlace
          etablissement={etablissement}
          onNavigateToMapping={() => setTab('mapping')}
        />
      )}

      {/* ── Top / Flop ── */}
      {tab === 'top_flop' && (
        <TopFlop
          etablissement={etablissement}
          onNavigateToMapping={() => setTab('mapping')}
        />
      )}

      {/* ── Conso ingrédients ── */}
      {tab === 'conso' && (
        <ConsoIngredients
          etablissement={etablissement}
          onNavigateToMapping={() => setTab('mapping')}
        />
      )}

      {/* ── Mapping plats POS ↔ Recettes (J3) ── */}
      {tab === 'mapping' && (
        <MappingPlats user={user} etablissement={etablissement} />
      )}
    </div>
  );
}

