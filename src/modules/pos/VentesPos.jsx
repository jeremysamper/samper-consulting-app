import { useState } from 'react';
import { Btn, SectionHeader, TabBar } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────
// VentesPos — Module Ventes POS (J2-J4)
//
// J1 : Placeholder — wiring navigation + accès POS confirmé.
// J2 : Cron Vercel sync items + ventes (pos_items, pos_sales).
// J3 : Algorithme matching + UI Mapping plats POS ↔ Recettes.
// J4 : 3 vues cuisine (Mise en place J+1, Top/Flop, Conso ingrédients).
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

      <TabBar
        tabs={TABS}
        active={tab}
        onChange={setTab}
      />

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '48px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, opacity: 0.15 }}>◑</div>
        <div style={{
          fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)',
          color: 'var(--text)',
        }}>
          Module Ventes POS — En cours de développement
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 440, lineHeight: 1.6 }}>
          Connectez d'abord votre caisse Lightspeed dans <strong>Paramètres → Intégrations POS</strong>,
          puis lancez une synchronisation pour accéder aux données de ventes.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          <div style={chipStyle('#f0fdf4', '#15803d', '#86efac')}>J2 — Sync automatique</div>
          <div style={chipStyle('#eff6ff', '#1d4ed8', '#bfdbfe')}>J3 — Mapping plats</div>
          <div style={chipStyle('#faf5ff', '#7c3aed', '#c4b5fd')}>J4 — 3 vues cuisine</div>
        </div>
      </div>
    </div>
  );
}

function chipStyle(bg, color, border) {
  return {
    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: bg, color, border: `1px solid ${border}`,
    fontFamily: 'var(--font)',
  };
}
