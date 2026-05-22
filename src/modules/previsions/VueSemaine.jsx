import { useState, useEffect } from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { usePrevisionsSemaine } from '../../hooks/usePrevisionsSemaine.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import {
  getLundiSemaine, addDays, formatJourSemaine,
  formatDateCourte, isAujourdhui,
} from '../../utils/dateHelpers.js';

const SEUIL_ALERTE = 40;

const SERVICES = [
  { key: 'couverts_midi',   label: 'Midi',   color: '#ea580c', bg: '#fff7ed' },
  { key: 'couverts_soir',   label: 'Soir',   color: '#1d4ed8', bg: '#eff6ff' },
  { key: 'couverts_brunch', label: 'Brunch', color: '#059669', bg: '#f0fdf4' },
];

// Injection de l'animation skeleton une seule fois dans le DOM
let skeletonStyleInjected = false;
function ensureSkeletonStyle() {
  if (skeletonStyleInjected) return;
  const s = document.createElement('style');
  s.textContent = '@keyframes skeletonPulse{0%,100%{opacity:.35}50%{opacity:.75}}';
  document.head.appendChild(s);
  skeletonStyleInjected = true;
}

function SkeletonRow() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ width: 52, height: 32, borderRadius: 6, background: 'var(--border)', animation: 'skeletonPulse 1.4s ease-in-out infinite' }} />
      <div style={{ flex: 1, height: 13, borderRadius: 4, background: 'var(--border)', animation: 'skeletonPulse 1.4s ease-in-out infinite 0.1s' }} />
      <div style={{ width: 36, height: 20, borderRadius: 4, background: 'var(--border)', animation: 'skeletonPulse 1.4s ease-in-out infinite 0.2s' }} />
    </div>
  );
}

// ── Ligne desktop / carte mobile ──────────────────────────
function DayRow({ jour, auj, tags, isMobile, onClick }) {
  const [hovered, setHovered] = useState(false);
  const total  = jour.total_couverts || 0;
  const alerte = total >= SEUIL_ALERTE;

  if (isMobile) {
    return (
      <div
        role="button" tabIndex={0}
        onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
        style={{
          padding: '13px 16px', borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          borderLeft: auj ? '3px solid var(--accent)' : '3px solid transparent',
          background: auj ? 'rgba(99,102,241,0.05)' : 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: 13, color: auj ? 'var(--accent)' : 'var(--text)' }}>
              {formatJourSemaine(jour.date_service)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 7 }}>
              {formatDateCourte(jour.date_service)}
            </span>
          </div>
          <span style={{
            fontSize: 15, fontWeight: 800,
            color: alerte ? '#b91c1c' : total > 0 ? 'var(--text)' : 'var(--text3)',
            fontFamily: 'var(--font-serif)',
          }}>
            {total > 0 ? `${total} pax` : '—'}
          </span>
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {SERVICES.map(({ key, label, color, bg }) => {
              const n = jour[key] || 0;
              if (!n) return null;
              return (
                <span key={key} style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: bg, color, fontFamily: 'var(--font)',
                }}>
                  {label} {n}
                </span>
              );
            })}
            {tags.slice(0, 3).map((t) => (
              <span key={t} style={{
                padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
                fontFamily: 'var(--font)',
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop ──
  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid', gridTemplateColumns: '88px 1fr 44px',
        alignItems: 'center', gap: 12,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', transition: 'background 0.1s',
        borderLeft: auj ? '3px solid var(--accent)' : '3px solid transparent',
        background: auj
          ? 'rgba(99,102,241,0.06)'
          : hovered ? 'var(--bg)' : 'var(--surface)',
      }}
    >
      {/* Colonne 1 : Jour + date */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: auj ? 'var(--accent)' : 'var(--text)', fontFamily: 'var(--font)' }}>
          {formatJourSemaine(jour.date_service)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
          {formatDateCourte(jour.date_service)}
        </div>
      </div>

      {/* Colonne 2 : Badges services + tags critiques */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
        {SERVICES.map(({ key, label, color, bg }) => {
          const n = jour[key] || 0;
          if (!n) return null;
          const enAlerte = n >= SEUIL_ALERTE;
          return (
            <span key={key} style={{
              padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: enAlerte ? '#fee2e2' : bg,
              color:      enAlerte ? '#b91c1c' : color,
              border: `1px solid ${enAlerte ? '#fca5a5' : 'transparent'}`,
              fontFamily: 'var(--font)',
            }}>
              {label} {n}
            </span>
          );
        })}
        {jour.nb_groupes > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            👥 {jour.nb_groupes}
          </span>
        )}
        {tags.slice(0, 4).map((t) => (
          <span key={t} style={{
            padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
            fontFamily: 'var(--font)',
          }}>
            {t}
          </span>
        ))}
        {tags.length > 4 && (
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>+{tags.length - 4}</span>
        )}
      </div>

      {/* Colonne 3 : Total */}
      <div style={{
        textAlign: 'right', fontSize: 16, fontWeight: 800,
        fontFamily: 'var(--font-serif)',
        color: alerte ? '#b91c1c' : total > 0 ? 'var(--text)' : 'var(--text3)',
      }}>
        {total > 0 ? total : '—'}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────
export default function VueSemaine({ etablissementId, onDayClick, refreshKey }) {
  const isMobile = useIsMobile();
  const [dateDebut, setDateDebut] = useState(() => getLundiSemaine(new Date()));
  const { semaine, loading, error, fetchSemaine } = usePrevisionsSemaine(etablissementId);

  useEffect(() => { ensureSkeletonStyle(); }, []);

  useEffect(() => {
    fetchSemaine(dateDebut);
  }, [dateDebut, refreshKey, fetchSemaine]);

  const totalSemaine = (semaine || []).reduce((s, j) => s + (j.total_couverts || 0), 0);
  const semaineVide  = semaine !== null && semaine.every((j) => !j.total_couverts);

  return (
    <div style={{ marginTop: 16 }}>

      {/* ── Navigation semaine ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8, marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn small onClick={() => setDateDebut((d) => addDays(d, -7))}>←</Btn>
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text)',
            fontFamily: 'var(--font-serif)', minWidth: 110, textAlign: 'center',
          }}>
            {formatDateCourte(dateDebut)} – {formatDateCourte(addDays(dateDebut, 6))}
          </span>
          <Btn small onClick={() => setDateDebut((d) => addDays(d, 7))}>→</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn small onClick={() => setDateDebut(getLundiSemaine(new Date()))}>Cette semaine</Btn>
          {totalSemaine > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {totalSemaine} couvert{totalSemaine > 1 ? 's' : ''} / sem.
            </span>
          )}
        </div>
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: '#fef2f2',
          border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13,
          marginBottom: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
        }}>
          <span>{error}</span>
          <Btn small variant="danger" onClick={() => fetchSemaine(dateDebut)}>Réessayer</Btn>
        </div>
      )}

      {/* ── Skeleton (premier chargement uniquement) ── */}
      {loading && semaine === null && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10,
          overflow: 'hidden', background: 'var(--surface)',
        }}>
          {[...Array(7)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* ── État vide ── */}
      {!loading && semaineVide && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, opacity: 0.18, marginBottom: 10 }}>◐</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 6 }}>
            Aucune réservation cette semaine
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Saisis ta première résa avec le bouton +
          </div>
        </div>
      )}

      {/* ── Tableau 7 jours ── */}
      {semaine !== null && !semaineVide && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10,
          overflow: 'hidden', background: 'var(--surface)',
        }}>
          {semaine.map((jour) => (
            <DayRow
              key={jour.date_service}
              jour={jour}
              auj={isAujourdhui(jour.date_service)}
              tags={Array.isArray(jour.tags_critiques) ? jour.tags_critiques : []}
              isMobile={isMobile}
              onClick={() => onDayClick(jour.date_service)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
