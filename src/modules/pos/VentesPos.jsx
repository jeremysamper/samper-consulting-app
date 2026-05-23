import { useState } from 'react';
import { SectionHeader, TabBar } from '../../components/ui/index.jsx';
import MappingPlats from './MappingPlats.jsx';

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

      {/* ── Mapping plats POS ↔ Recettes (J3) ── */}
      {tab === 'mapping' && (
        <MappingPlats user={user} etablissement={etablissement} />
      )}

      {/* ── Vues cuisine — placeholder J4 ── */}
      {tab !== 'mapping' && (
        <PlaceholderJ4 tab={tab} />
      )}
    </div>
  );
}

function PlaceholderJ4({ tab }) {
  const labels = {
    mise_en_place: { icon: '◷', label: 'Mise en place J+1', desc: 'Quantités à préparer pour demain, basées sur les ventes Lightspeed + le mapping plats.' },
    top_flop:      { icon: '↑↓', label: 'Top / Flop',       desc: 'Classement des plats par chiffre d\'affaires et volume sur la période sélectionnée.' },
    conso:         { icon: '◈',  label: 'Conso ingrédients', desc: 'Consommation théorique des ingrédients déduite des ventes POS et des fiches techniques.' },
  };
  const { icon, label, desc } = labels[tab] ?? labels.mise_en_place;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '48px 32px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 14, textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
        {label} — J4
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 420, lineHeight: 1.6 }}>
        {desc}
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text3)', fontStyle: 'italic',
        borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4,
      }}>
        Disponible après J4 — commencez par mapper vos plats dans l'onglet <strong>Mapping plats</strong>.
      </div>
    </div>
  );
}
