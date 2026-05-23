/**
 * MappingFilters — Onglets de filtre + barre de recherche
 */

import { Input } from '../../../components/ui/index.jsx';

/**
 * @param {{
 *   filter:   'all'|'auto'|'suggested'|'manual',
 *   onFilter: (f: string) => void,
 *   search:   string,
 *   onSearch: (s: string) => void,
 *   counts:   { all: number, auto: number, suggested: number, manual: number }
 * }} props
 */
export function MappingFilters({ filter, onFilter, search, onSearch, counts }) {
  const tabs = [
    { id: 'all',       label: `Tous (${counts.all})` },
    { id: 'auto',      label: `Auto (${counts.auto})` },
    { id: 'suggested', label: `Suggestions (${counts.suggested})` },
    { id: 'manual',    label: `À mapper (${counts.manual})` },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onFilter(tab.id)}
              style={{
                padding:      '6px 14px',
                borderRadius: 20,
                fontSize:     12,
                fontWeight:   active ? 700 : 500,
                fontFamily:   'var(--font)',
                cursor:       'pointer',
                border:       `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background:   active ? 'var(--accent)' : 'var(--surface)',
                color:        active ? '#fff' : 'var(--text2)',
                transition:   'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Recherche */}
      <div style={{ position: 'relative' }}>
        <span style={{
          position:  'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize:  14, color: 'var(--text3)', pointerEvents: 'none',
        }}>🔍</span>
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Rechercher un plat POS…"
          style={{ paddingLeft: 36 }}
        />
      </div>
    </div>
  );
}
