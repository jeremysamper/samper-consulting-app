/**
 * ConsoIngredients — Vue 3 : Consommation théorique des ingrédients
 *
 * Calcule la conso = qty_vendue × (grammage_recette / portions_recette)
 * agrégée par ingrédient sur la période sélectionnée.
 * Utile pour passer commande fournisseur.
 *
 * Normalisation Option B :
 *   g  → kg  si total ≥ 500g
 *   ml → L   si total ≥ 500ml
 *
 * Permissions :
 *   Lecture + export : consultant, patron, resp_cuisine, cuisinier
 */

import { useState, useMemo } from 'react';
import { useConsoIngredients } from '../hooks/useConsoIngredients.js';
import { PosEmptyState }       from '../components/PosEmptyState.jsx';
import { PosExportButton }     from '../components/PosExportButton.jsx';
import { todayInTz, addDays, formatShortDate, formatRangeLabel } from '../lib/date-utils.js';

const PRINT_ID = 'pos-print-conso';

// ── Calcul des plages de dates pour chaque option ────────────────

function buildPeriodOptions(today) {
  // Lundi de la semaine courante
  const date = new Date(today + 'T00:00:00');
  const dayOfWeek = date.getDay(); // 0=dim
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const thisMonday    = addDays(today, diffToMonday);
  const lastMonday    = addDays(thisMonday, -7);
  const lastSunday    = addDays(thisMonday, -1);

  // 1er du mois courant
  const [y, m] = today.split('-').map(Number);
  const firstThisMonth  = `${y}-${String(m).padStart(2, '0')}-01`;
  const firstLastMonth  = m === 1
    ? `${y - 1}-12-01`
    : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  const lastDayOfLastMonth = addDays(firstThisMonth, -1);

  return [
    {
      id: 'today',
      label: "Aujourd'hui",
      from: today,
      to: today,
    },
    {
      id: 'this_week',
      label: 'Cette semaine',
      from: thisMonday,
      to: today,
    },
    {
      id: 'last_week',
      label: 'Semaine dernière',
      from: lastMonday,
      to: lastSunday,
    },
    {
      id: 'this_month',
      label: 'Ce mois',
      from: firstThisMonth,
      to: today,
    },
    {
      id: 'last_month',
      label: 'Mois dernier',
      from: firstLastMonth,
      to: lastDayOfLastMonth,
    },
    {
      id: 'custom',
      label: 'Personnalisé',
      from: null,
      to: null,
    },
  ];
}

// ── Composant principal ───────────────────────────────────────────

export default function ConsoIngredients({ etablissement, onNavigateToMapping }) {
  const tz    = etablissement?.timezone ?? 'Europe/Zurich';
  const today = useMemo(() => todayInTz(tz), [tz]);

  const periodOptions = useMemo(() => buildPeriodOptions(today), [today]);

  const [selectedPeriod, setSelectedPeriod] = useState('this_week');
  const [customFrom, setCustomFrom]         = useState(addDays(today, -6));
  const [customTo,   setCustomTo]           = useState(today);

  // Résout les dates effectives selon la période
  const dateRange = useMemo(() => {
    if (selectedPeriod === 'custom') {
      return { from: customFrom, to: customTo };
    }
    const opt = periodOptions.find((p) => p.id === selectedPeriod);
    return { from: opt?.from ?? today, to: opt?.to ?? today };
  }, [selectedPeriod, customFrom, customTo, periodOptions, today]);

  const periodLabel = useMemo(() => {
    if (selectedPeriod === 'today') return formatShortDate(today);
    if (dateRange.from === dateRange.to) return formatShortDate(dateRange.from);
    return formatRangeLabel(dateRange.from, dateRange.to);
  }, [selectedPeriod, dateRange, today]);

  const {
    items, mappedWithSalesCount, totalMappedCount,
    excludedNoPortions, loading, error, reload,
  } = useConsoIngredients(etablissement, dateRange);

  const etabNom = etablissement?.nom ?? '';

  // ── États vides ───────────────────────────────────────────────
  if (loading) return <PosEmptyState type="loading" />;
  if (error)   return <PosEmptyState type="error" message={error} onRetry={reload} />;
  if (totalMappedCount === 0) {
    return <PosEmptyState type="no_mapping" onNavigateToMapping={onNavigateToMapping} />;
  }

  const hasData = items.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Sélecteur de période */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {periodOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelectedPeriod(opt.id)}
              style={{
                padding:    '5px 14px',
                borderRadius: 20,
                fontSize:   12,
                fontWeight: selectedPeriod === opt.id ? 700 : 500,
                fontFamily: 'var(--font)',
                cursor:     'pointer',
                border:     `1px solid ${selectedPeriod === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                background: selectedPeriod === opt.id ? 'var(--accent)' : 'var(--surface)',
                color:      selectedPeriod === opt.id ? '#fff' : 'var(--text2)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Inputs custom */}
        {selectedPeriod === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Du</span>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                padding: '5px 10px', border: '1px solid var(--border)',
                borderRadius: 7, fontSize: 12, color: 'var(--text)',
                background: 'var(--surface)', fontFamily: 'var(--font)',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>au</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={today}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                padding: '5px 10px', border: '1px solid var(--border)',
                borderRadius: 7, fontSize: 12, color: 'var(--text)',
                background: 'var(--surface)', fontFamily: 'var(--font)',
              }}
            />
          </div>
        )}
      </div>

      {/* Barre d'actions (hors impression) */}
      <div className="no-print" style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Basé sur {mappedWithSalesCount} / {totalMappedCount} plat{totalMappedCount !== 1 ? 's' : ''} mappé{totalMappedCount !== 1 ? 's' : ''}
          {excludedNoPortions > 0 && (
            <span style={{ color: 'var(--warning-text)', marginLeft: 6 }}>
              · {excludedNoPortions} exclu{excludedNoPortions !== 1 ? 's' : ''} (sans portions définies)
            </span>
          )}
        </div>
        {hasData && (
          <PosExportButton
            printId={PRINT_ID}
            title={`Conso ingrédients - ${periodLabel}`}
            etablissement={etablissement}
            label="📥 Exporter PDF"
          />
        )}
      </div>

      {/* Zone imprimable */}
      <div id={PRINT_ID} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* En-tête contextuel à l'écran — retiré du PDF (l'en-tête branded Samper le remplace) */}
        <div className="no-print" style={{
          paddingBottom: 10,
          borderBottom:  '1px solid var(--border)',
        }}>
          <div style={{
            fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)',
          }}>
            Conso ingrédients - {periodLabel}
          </div>
          {etabNom && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{etabNom}</div>
          )}
        </div>

        {/* Tableau ou empty state */}
        {!hasData ? (
          <PosEmptyState
            type="no_sales"
            message="Aucune vente sur cette période pour les plats mappés."
          />
        ) : (
          <>
            {/* En-tête tableau */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 60px',
              gap: 8,
              padding: '6px 14px',
              fontSize: 11, fontWeight: 700,
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}>
              <div>Ingrédient</div>
              <div style={{ textAlign: 'right' }}>Quantité</div>
              <div style={{ textAlign: 'left', paddingLeft: 8 }}>Unité</div>
            </div>

            {/* Lignes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {items.map((ing, idx) => (
                <div
                  key={`${ing.nom}|${ing.unite}|${idx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 60px',
                    gap: 8,
                    padding: '9px 14px',
                    background: idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    alignItems: 'center',
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ing.nom}
                  </div>
                  <div style={{
                    textAlign: 'right',
                    fontSize: 14, fontWeight: 700,
                    color: 'var(--text)', fontFamily: 'var(--font-serif)',
                  }}>
                    {ing.quantite}
                  </div>
                  <div style={{
                    paddingLeft: 8,
                    fontSize: 12, color: 'var(--text2)', fontWeight: 600,
                  }}>
                    {ing.unite}
                  </div>
                </div>
              ))}
            </div>

            {/* Pied */}
            <div style={{
              marginTop: 4, paddingTop: 10,
              borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text3)',
            }}>
              Consommation théorique basée sur {mappedWithSalesCount} plat{mappedWithSalesCount !== 1 ? 's' : ''} sur {totalMappedCount} mappé{totalMappedCount !== 1 ? 's' : ''}.
              {excludedNoPortions > 0 && (
                <> {excludedNoPortions} recette{excludedNoPortions !== 1 ? 's' : ''} sans portions définies exclue{excludedNoPortions !== 1 ? 's' : ''}.</>
              )}
              {(totalMappedCount < (mappedWithSalesCount + (totalMappedCount - mappedWithSalesCount)) || onNavigateToMapping) && (
                onNavigateToMapping && (
                  <> <button
                    onClick={onNavigateToMapping}
                    className="no-print"
                    style={{
                      background: 'none', border: 'none', color: 'var(--accent)',
                      cursor: 'pointer', fontSize: 12, padding: 0,
                      fontFamily: 'var(--font)', textDecoration: 'underline',
                    }}
                  >
                    Mapping →
                  </button></>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
