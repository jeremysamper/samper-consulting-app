/**
 * MappingFilters — Onglets de filtre + barre de recherche
 */

import SearchToggle from '../../../components/ui/SearchToggle.jsx';

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
      {/* Onglets + loupe (la recherche dépliée prend l'espace restant) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
        <SearchToggle value={search} onChange={onSearch} placeholder="Rechercher un plat POS…" />
      </div>
    </div>
  );
}
