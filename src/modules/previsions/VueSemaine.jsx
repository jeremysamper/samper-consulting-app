import { useState, useEffect } from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { usePrevisionsSemaine } from '../../hooks/usePrevisionsSemaine.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import {
  getLundiSemaine, addDays, formatJourSemaine,
  formatDateCourte, isAujourdhui,
} from '../../utils/dateHelpers.js';
import { SERVICE_META, SERVICES_AFFICHES } from './statutsReservation.js';
import BandeauNonActualise from './BandeauNonActualise.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Planning de la semaine : les réservations par NOM, service par service.
//
// Il affichait « Midi 24 · Soir 40 » : juste pour la cuisine, muet pour la
// salle qui veut savoir QUI vient. Chaque jour montre désormais ses
// réservations dans la colonne de leur service, avec le code couleur des
// services (midi orange, soir bleu). Le brunch est dans la colonne du midi :
// c'est le midi du dimanche. Un nom ouvre sa fiche, le jour ouvre la vue
// jour. Le total de couverts reste en petit, pour la cuisine.
// ═══════════════════════════════════════════════════════════════════════════

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
      <div style={{ flex: 1, height: 13, borderRadius: 4, background: 'var(--border)', animation: 'skeletonPulse 1.4s ease-in-out infinite 0.2s' }} />
    </div>
  );
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// ── Une réservation dans le planning ─────────────────────────────────────
function ResaPuce({ resa, svc, onOpen }) {
  const meta      = SERVICE_META[svc];
  const demande   = resa.statut === 'demande';
  const noShow    = resa.statut === 'no_show';
  const passeport = !!resa.passeport_gourmand;
  const allergies = (Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [])
    .filter((t) => t.type_tag === 'allergene' && t.valeur)
    .map((t) => t.valeur);
  const heure = (resa.heure_arrivee || '').slice(0, 5);
  const titre = [
    `${heure} ${resa.nom}, ${pluriel(resa.nb_couverts || 0, 'couvert')}`,
    resa.service === 'brunch' ? 'brunch' : null,
    demande ? 'demande en ligne à confirmer' : null,
    passeport ? 'Passeport gourmand' : null,
    noShow ? 'no-show' : null,
    allergies.length ? `allergies : ${allergies.join(', ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      onClick={(e) => { e.stopPropagation(); onOpen?.(resa); }}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 5,
        maxWidth: '100%', minWidth: 0, minHeight: 30,
        padding: '4px 8px', borderRadius: 6,
        // Une demande venue du site n'est pas encore une réservation : trait
        // pointillé ambre, le même « à confirmer » que dans la vue jour.
        // Passeport gourmand : cadre vert, plus épais que le liseré d'un
        // statut pour ne pas se confondre avec « à table ».
        borderWidth: passeport ? 2 : 1, borderStyle: demande ? 'dashed' : 'solid',
        borderColor: passeport ? 'var(--success-text)' : demande ? 'var(--warning-bd)' : meta.bordure,
        background: passeport ? 'var(--success-bg-soft)' : meta.fond, color: 'var(--text)',
        fontFamily: 'var(--font)', fontSize: 12, lineHeight: 1.3,
        cursor: 'pointer', textAlign: 'left',
        opacity: noShow ? 0.55 : 1,
      }}
    >
      <span style={{ fontSize: 11, color: meta.couleur, fontFamily: 'var(--font-num)', flexShrink: 0 }}>
        {heure}
      </span>
      {allergies.length > 0 && (
        <span aria-hidden="true" style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: 'var(--danger-text)', alignSelf: 'center',
        }} />
      )}
      <span style={{
        fontWeight: resa.est_groupe ? 700 : 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        textDecoration: noShow ? 'line-through' : 'none',
      }}>
        {resa.nom}
      </span>
      <span style={{ fontWeight: 700, color: meta.couleur, fontFamily: 'var(--font-num)', flexShrink: 0 }}>
        {resa.nb_couverts}
      </span>
    </button>
  );
}

// Les réservations d'un service pour un jour, à la suite, dans l'ordre des
// heures. Elles passent à la ligne : un samedi à trente tables reste lisible
// sans faire défiler la cellule.
function ListeService({ resas, svc, onOpen, vide = true }) {
  if (!resas.length) {
    return vide
      ? <span style={{ fontSize: 12, color: 'var(--text3)' }}>-</span>
      : null;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
      {resas.map((r) => <ResaPuce key={r.id} resa={r} svc={svc} onOpen={onOpen} />)}
    </div>
  );
}

// Couverts d'un service ce jour-là, en petit : la cuisine s'en sert encore.
function couvertsService(jour, svc) {
  return jour[`couverts_${svc}`] || 0;
}

function Allergenes({ tags, max = 3 }) {
  if (!tags.length) return null;
  return (
    <div style={{ fontSize: 10, color: 'var(--danger-text)', marginTop: 4, lineHeight: 1.35, fontWeight: 600 }}>
      {tags.slice(0, max).join(', ')}{tags.length > max ? ` +${tags.length - max}` : ''}
    </div>
  );
}

// ── Desktop / tablette : une ligne par jour, une colonne par service ─────
function LigneJour({ jour, services, auj, onDayClick, onOpen, colonnes }) {
  const [survol, setSurvol] = useState(false);
  const total = jour.total_couverts || 0;
  const tags  = Array.isArray(jour.tags_critiques) ? jour.tags_critiques : [];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: colonnes,
      borderBottom: '1px solid var(--border)',
      background: auj ? 'var(--accent-light)' : 'var(--surface)',
    }}>
      <button
        type="button"
        onClick={() => onDayClick(jour.date_service)}
        onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
        title="Ouvrir la journée"
        style={{
          textAlign: 'left', padding: '10px 12px', border: 'none',
          borderLeft: `3px solid ${auj ? 'var(--accent)' : 'transparent'}`,
          background: survol ? 'var(--bg)' : 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font)', minWidth: 0,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: auj ? 'var(--accent)' : 'var(--text)' }}>
          {formatJourSemaine(jour.date_service)}
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', marginLeft: 6 }}>
            {formatDateCourte(jour.date_service)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
          {total > 0 ? pluriel(total, 'couvert') : 'Libre'}
        </div>
        <Allergenes tags={tags} />
      </button>
      {services.map((svc) => {
        const resas = jour.resas[svc] || [];
        const n = couvertsService(jour, svc);
        return (
          <div
            key={svc}
            onClick={() => onDayClick(jour.date_service)}
            style={{
              padding: '8px 10px', minWidth: 0, cursor: 'pointer',
              borderLeft: `3px solid ${SERVICE_META[svc].bordure}`,
              display: 'flex', flexDirection: 'column', gap: 5,
            }}
          >
            <ListeService resas={resas} svc={svc} onOpen={onOpen} />
            {n > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{pluriel(n, 'couvert')}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Mobile : une carte par jour, les services l'un sous l'autre ──────────
function CarteJour({ jour, services, auj, onDayClick, onOpen }) {
  const total = jour.total_couverts || 0;
  const tags  = Array.isArray(jour.tags_critiques) ? jour.tags_critiques : [];
  const avecResas = services.filter((svc) => (jour.resas[svc] || []).length > 0);
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${auj ? 'var(--accent)' : 'transparent'}`,
      background: auj ? 'var(--accent-light)' : 'var(--surface)',
    }}>
      <button
        type="button"
        onClick={() => onDayClick(jour.date_service)}
        style={{
          width: '100%', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 8, padding: '12px 14px 6px', border: 'none', background: 'transparent',
          cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
        }}
      >
        <span>
          <span style={{ fontWeight: 800, fontSize: 14, color: auj ? 'var(--accent)' : 'var(--text)' }}>
            {formatJourSemaine(jour.date_service)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 7 }}>
            {formatDateCourte(jour.date_service)}
          </span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {total > 0 ? pluriel(total, 'couvert') : 'Libre'} ›
        </span>
      </button>
      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {avecResas.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Aucune réservation</div>
        )}
        {avecResas.map((svc) => (
          <div key={svc}>
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
              color: SERVICE_META[svc].couleur, marginBottom: 4,
            }}>
              {SERVICE_META[svc].label} · {pluriel(couvertsService(jour, svc), 'couvert')}
            </div>
            <ListeService resas={jour.resas[svc]} svc={svc} onOpen={onOpen} vide={false} />
          </div>
        ))}
        {tags.length > 0 && <Allergenes tags={tags} max={6} />}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────
export default function VueSemaine({ etablissementId, onDayClick, onOpenResa, refreshKey }) {
  const isMobile = useIsMobile();
  const [dateDebut, setDateDebut] = useState(() => getLundiSemaine(new Date()));
  const { semaine, loading, error, nonActualise, fetchSemaine } = usePrevisionsSemaine(etablissementId);

  useEffect(() => { ensureSkeletonStyle(); }, []);

  useEffect(() => {
    fetchSemaine(dateDebut);
  }, [dateDebut, refreshKey, fetchSemaine]);

  const totalSemaine = (semaine || []).reduce((s, j) => s + (j.total_couverts || 0), 0);
  const semaineVide  = semaine !== null && semaine.every((j) => !Object.values(j.resas).some((l) => l.length));
  const services   = SERVICES_AFFICHES;
  const colonnes   = `104px repeat(${services.length}, minmax(0, 1fr))`;

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
            fontFamily: 'var(--font-num)', minWidth: 110, textAlign: 'center',
          }}>
            {formatDateCourte(dateDebut)} – {formatDateCourte(addDays(dateDebut, 6))}
          </span>
          <Btn small onClick={() => setDateDebut((d) => addDays(d, 7))}>→</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn small onClick={() => setDateDebut(getLundiSemaine(new Date()))}>Cette semaine</Btn>
          {/* Masqué pendant un changement de semaine : ce total-là, sans date
              à côté, serait encore celui de la semaine précédente. */}
          {totalSemaine > 0 && !loading && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {totalSemaine} couvert{totalSemaine > 1 ? 's' : ''} / sem.
            </span>
          )}
        </div>
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg-soft)',
          border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', fontSize: 13,
          marginBottom: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
        }}>
          <span>{error}</span>
          <Btn small variant="danger" onClick={() => fetchSemaine(dateDebut)}>Réessayer</Btn>
        </div>
      )}

      {/* ── Relecture en échec : la semaine affichée reste en place ── */}
      {nonActualise && <BandeauNonActualise onRetry={() => fetchSemaine(dateDebut)} />}

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

      {/* ── Planning 7 jours ── */}
      {semaine !== null && !semaineVide && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10,
          overflow: 'hidden', background: 'var(--surface)',
        }}>
          {!isMobile && (
            <div style={{
              display: 'grid', gridTemplateColumns: colonnes,
              borderBottom: '1px solid var(--border)', background: 'var(--bg)',
            }}>
              <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Jour
              </div>
              {services.map((svc) => (
                <div key={svc} style={{
                  padding: '8px 10px', fontSize: 11, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  color: SERVICE_META[svc].couleur,
                  borderLeft: `3px solid ${SERVICE_META[svc].bordure}`,
                  background: SERVICE_META[svc].fond,
                }}>
                  {SERVICE_META[svc].label}
                </div>
              ))}
            </div>
          )}
          {semaine.map((jour) => (isMobile ? (
            <CarteJour
              key={jour.date_service}
              jour={jour}
              services={services}
              auj={isAujourdhui(jour.date_service)}
              onDayClick={onDayClick}
              onOpen={onOpenResa}
            />
          ) : (
            <LigneJour
              key={jour.date_service}
              jour={jour}
              services={services}
              colonnes={colonnes}
              auj={isAujourdhui(jour.date_service)}
              onDayClick={onDayClick}
              onOpen={onOpenResa}
            />
          )))}
        </div>
      )}

      {/* ── Légende ── */}
      {semaine !== null && !semaineVide && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>
          <span>Touche un nom pour ouvrir la réservation, le jour pour la journée.</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger-text)' }} />
            allergie signalée
          </span>
          <span>pointillés : demande à confirmer</span>
        </div>
      )}
    </div>
  );
}
