import { useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, HeartPulse, LayoutGrid, List, Plus, Waves,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { formatJourSemaine, getLundiSemaine, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import {
  Avatar, EtatVide, decalerJour, dureeLisible, heureFin, hhmm, jourComplet,
  metaStatutRdv, minutes, nomClient, st,
} from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Agenda du spa.
//
// Grand écran : planning de la journée, UNE COLONNE PAR PRATICIEN. Chaque
// rendez-vous est un bloc aussi haut que sa durée ; un créneau libre se
// réserve d'un clic, avec l'heure et le praticien déjà remplis. Une ligne
// marque l'heure qu'il est.
//
// Téléphone (ou vue « Liste ») : le fil de la journée, avec les fenêtres
// libres entre deux soins, ce que la réception cherche au téléphone.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIF = (r) => !['annulee', 'absent'].includes(r.statut);
const PX_MIN = 1.2;           // 1 minute = 1,2 px → 1 heure = 72 px
const PAS_CRENEAU = 30;       // créneaux cliquables toutes les 30 min
const SANS_PRATICIEN = '__sans__';

export default function AgendaSpa({
  date, setDate, aujourdhui, maintenant, reservations, clientsParId, praticiens: praticiensConnus,
  status, peutCreer, onNouveau, onOuvrir,
}) {
  const mobile = useIsMobile();
  const [vue, setVue] = useState('planning');
  const [voirAnnules, setVoirAnnules] = useState(false);
  const planning = !mobile && vue === 'planning';

  const semaine = useMemo(() => {
    const lundi = getLundiSemaine(parseLocalDate(date));
    return Array.from({ length: 7 }, (_, i) => isoDate(new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i)));
  }, [date]);

  const parJour = useMemo(() => {
    const m = new Map();
    for (const r of reservations) if (ACTIF(r)) m.set(r.dateRdv, (m.get(r.dateRdv) || 0) + 1);
    return m;
  }, [reservations]);

  const duJour = useMemo(
    () => reservations
      .filter((r) => r.dateRdv === date)
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut) || (a.praticien || '').localeCompare(b.praticien || '')),
    [reservations, date]
  );
  const actifs = duJour.filter(ACTIF);
  const annules = duJour.filter((r) => !ACTIF(r));
  const minutesSoins = actifs.reduce((sum, r) => sum + r.dureeMin, 0);
  const estAujourdhui = date === aujourdhui;

  return (
    <div>
      {/* ── Navigation dans les jours : une seule pilule compacte. La date
             elle-même ouvre le calendrier (champ natif posé par-dessus). ── */}
      <div style={s.barre}>
        <div style={s.navJour}>
          <button type="button" onClick={() => setDate(decalerJour(date, -1))} aria-label="Jour précédent" style={s.fleche}>
            <ChevronLeft size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <label style={s.dateBouton}>
            <CalendarDays size={15} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--spa-mizu)', flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>{capitaliser(jourComplet(date))}</span>
            <input
              type="date"
              aria-label="Choisir une date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* navigateur sans showPicker */ } }}
              style={s.dateCachee}
            />
          </label>
          <button type="button" onClick={() => setDate(decalerJour(date, 1))} aria-label="Jour suivant" style={s.fleche}>
            <ChevronRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
        {!estAujourdhui && (
          <button type="button" onClick={() => setDate(aujourdhui)} style={{ ...st.lien, minHeight: 36 }}>Aujourd'hui</button>
        )}
        <span style={s.resume}>
          {status === 'loading' && !reservations.length ? 'Chargement…'
            : actifs.length
              ? `${actifs.length} soin${actifs.length > 1 ? 's' : ''}, ${dureeLisible(minutesSoins)} en cabine`
              : 'Aucun soin prévu'}
        </span>
        <div style={s.outils}>
          {!mobile && (
            <div role="group" aria-label="Affichage" style={s.bascule}>
              <button type="button" aria-pressed={vue === 'planning'} onClick={() => setVue('planning')} style={{ ...s.basculeBtn, ...(vue === 'planning' ? s.basculeActif : null) }}>
                <LayoutGrid size={16} strokeWidth={1.8} aria-hidden="true" /> Planning
              </button>
              <button type="button" aria-pressed={vue === 'liste'} onClick={() => setVue('liste')} style={{ ...s.basculeBtn, ...(vue === 'liste' ? s.basculeActif : null) }}>
                <List size={16} strokeWidth={1.8} aria-hidden="true" /> Liste
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── La semaine ── */}
      <div style={{ ...s.semaine, ...(mobile ? { gap: 4, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' } : null) }} className="spa-defile" role="tablist" aria-label="Jours de la semaine">
        {semaine.map((iso) => {
          const actif = iso === date;
          const n = parJour.get(iso) || 0;
          return (
            <button
              key={iso}
              type="button"
              role="tab"
              aria-selected={actif}
              aria-label={`${jourComplet(iso)}, ${n} soin${n > 1 ? 's' : ''}`}
              onClick={() => setDate(iso)}
              style={{ ...s.jour, ...(actif ? s.jourActif : null), ...(iso === aujourdhui && !actif ? s.jourAujourdhui : null) }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{formatJourSemaine(iso)}</span>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }} data-no-translate>{Number(iso.slice(8))}</span>
              <span aria-hidden="true" style={{ ...s.point, background: n ? (actif ? 'var(--spa-on-mizu)' : 'var(--spa-mizu)') : 'transparent' }} />
            </button>
          );
        })}
      </div>

      {status === 'error' && (
        <div style={{ ...st.encartDanger, marginBottom: 12 }}>L'agenda ne s'est pas chargé. Vérifiez la connexion internet : l'app réessaie toute seule.</div>
      )}

      {planning ? (
        <Planning
          date={date}
          estAujourdhui={estAujourdhui}
          maintenant={maintenant}
          actifs={actifs}
          praticiensConnus={praticiensConnus}
          clientsParId={clientsParId}
          peutCreer={peutCreer}
          onNouveau={onNouveau}
          onOuvrir={onOuvrir}
        />
      ) : (
        <FilDuJour
          date={date}
          estAujourdhui={estAujourdhui}
          maintenant={maintenant}
          actifs={actifs}
          status={status}
          clientsParId={clientsParId}
          peutCreer={peutCreer}
          onNouveau={onNouveau}
          onOuvrir={onOuvrir}
        />
      )}

      {annules.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => setVoirAnnules((v) => !v)} style={st.lien}>
            {voirAnnules ? 'Masquer' : 'Voir'} les annulés et absents ({annules.length})
          </button>
          {voirAnnules && (
            <div style={{ ...st.liste, marginTop: 8 }}>
              {annules.map((r) => <CarteRdv key={r.id} r={r} client={clientsParId.get(r.clientId)} onClick={() => onOuvrir(r)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Planning par praticien ─────────────────────────────────────────────────
function Planning({ date, estAujourdhui, maintenant, actifs, praticiensConnus, clientsParId, peutCreer, onNouveau, onOuvrir }) {
  // Colonnes : les praticiens du jour, sinon ceux qu'on connaît ; une colonne
  // « À attribuer » pour les rendez-vous sans praticien.
  const colonnes = useMemo(() => {
    const duJour = [...new Set(actifs.map((r) => r.praticien).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const base = duJour.length ? duJour : praticiensConnus.slice(0, 4);
    const liste = base.length ? [...base] : [SANS_PRATICIEN];
    if (base.length && actifs.some((r) => !r.praticien)) liste.push(SANS_PRATICIEN);
    return liste;
  }, [actifs, praticiensConnus]);

  // Amplitude : 9 h - 20 h au minimum, élargie aux soins qui débordent.
  const debut = Math.min(9 * 60, ...actifs.map((r) => Math.floor(minutes(r.heureDebut) / 60) * 60));
  const fin = Math.max(20 * 60, ...actifs.map((r) => Math.ceil((minutes(r.heureDebut) + r.dureeMin) / 60) * 60));
  const hauteur = (fin - debut) * PX_MIN;
  const heures = [];
  for (let m = debut; m <= fin; m += 60) heures.push(m);
  const creneaux = [];
  for (let m = debut; m < fin; m += PAS_CRENEAU) creneaux.push(m);
  const ligneMaintenant = estAujourdhui && maintenant >= debut && maintenant <= fin ? (maintenant - debut) * PX_MIN : null;

  return (
    <div style={s.planning}>
      <div className="spa-defile" style={{ overflowY: 'hidden' }}>
        <div style={{ display: 'flex', minWidth: 72 + colonnes.length * 200 }}>
          {/* Gouttière des heures */}
          <div style={{ width: 64, flexShrink: 0 }}>
            <div style={s.enteteColonne} />
            <div style={{ position: 'relative', height: hauteur }}>
              {heures.map((m) => (
                <span key={m} style={{ ...s.heure, top: (m - debut) * PX_MIN - 8 }}>{hhmm(m)}</span>
              ))}
              {ligneMaintenant !== null && (
                <span style={{ ...s.heureMaintenant, top: ligneMaintenant - 9 }}>{hhmm(maintenant)}</span>
              )}
            </div>
          </div>

          {colonnes.map((p) => {
            const nomP = p === SANS_PRATICIEN ? '' : p;
            const siens = actifs.filter((r) => (p === SANS_PRATICIEN ? !r.praticien : r.praticien === p));
            const occupe = siens.reduce((sum, r) => sum + r.dureeMin, 0);
            return (
              <div key={p} style={{ flex: '1 1 200px', minWidth: 200, borderLeft: '1px solid var(--spa-line)' }}>
                <div style={s.enteteColonne}>
                  <Avatar client={{ id: p, prenom: nomP || '?', nom: '' }} taille={32} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-no-translate={nomP ? '' : undefined}>
                      {nomP || (colonnes.length === 1 ? 'Planning du jour' : 'À attribuer')}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--spa-ink2)' }}>
                      {siens.length ? `${siens.length} soin${siens.length > 1 ? 's' : ''}, ${dureeLisible(occupe)}` : 'Disponible'}
                    </span>
                  </span>
                </div>
                <div className="spa-grille-heures" style={{ position: 'relative', height: hauteur, '--spa-pas-heure': `${60 * PX_MIN}px` }}>
                  {/* Créneaux libres : un bouton par demi-heure, sous les blocs */}
                  {peutCreer && creneaux.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="spa-creneau-libre"
                      aria-label={`Réserver à ${hhmm(m)}${nomP ? ` avec ${nomP}` : ''}`}
                      onClick={() => onNouveau({ date, heure: hhmm(m), praticien: nomP })}
                      style={{ ...s.creneau, top: (m - debut) * PX_MIN, height: PAS_CRENEAU * PX_MIN }}
                    >
                      <span className="spa-creneau-plus" style={s.creneauPlus}>
                        <Plus size={14} strokeWidth={2} aria-hidden="true" /> {hhmm(m)}
                      </span>
                    </button>
                  ))}
                  {siens.map((r) => (
                    <BlocRdv
                      key={r.id}
                      r={r}
                      client={clientsParId.get(r.clientId)}
                      top={(minutes(r.heureDebut) - debut) * PX_MIN}
                      hauteur={Math.max(r.dureeMin * PX_MIN, 30)}
                      onClick={() => onOuvrir(r)}
                    />
                  ))}
                  {ligneMaintenant !== null && <span aria-hidden="true" style={{ ...s.ligneMaintenant, top: ligneMaintenant }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!actifs.length && (
        <div style={{ padding: '4px 16px 16px', fontSize: 13, color: 'var(--spa-ink2)', textAlign: 'center' }}>
          {peutCreer ? 'Journée libre : clique sur un créneau pour réserver.' : 'Journée libre.'}
        </div>
      )}
    </div>
  );
}

function BlocRdv({ r, client, top, hauteur, onClick }) {
  const m = metaStatutRdv(r.statut);
  const compact = hauteur < 60;
  return (
    <button
      type="button"
      onClick={onClick}
      className="spa-carte-action"
      aria-label={`${r.heureDebut} à ${heureFin(r.heureDebut, r.dureeMin)}, ${nomClient(client)}, ${r.soinLibelle || 'soin'}, ${m.label}`}
      style={{
        ...s.bloc, top: top + 2, height: hauteur - 4,
        background: m.fond, borderLeftColor: m.barre,
        opacity: r.statut === 'terminee' ? 0.75 : 1,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--spa-ink2)', fontWeight: 600 }}>
        {r.heureDebut}-{heureFin(r.heureDebut, r.dureeMin)}
        {client?.notesSante && <HeartPulse size={13} strokeWidth={2} color="var(--spa-sakura)" aria-label="Note santé" />}
      </span>
      <span style={s.blocNom} data-no-translate>{nomClient(client)}</span>
      {!compact && (
        <span style={s.blocDetail}>{[r.soinLibelle, r.cabine].filter(Boolean).join(', ') || 'Soin à préciser'}</span>
      )}
    </button>
  );
}

// ── Fil du jour (téléphone, vue liste) ─────────────────────────────────────
function FilDuJour({ date, estAujourdhui, maintenant, actifs, status, clientsParId, peutCreer, onNouveau, onOuvrir }) {
  if (!actifs.length && status === 'ready') {
    return (
      <EtatVide
        icone={Waves}
        titre="Journée calme"
        texte={`Aucun soin prévu ${estAujourdhui ? 'aujourd\'hui' : `le ${jourComplet(date)}`}.`}
        action={peutCreer && (
          <button type="button" onClick={() => onNouveau({ date })} style={{ ...st.principal, marginTop: 6 }}>
            <Plus size={18} strokeWidth={2} aria-hidden="true" /> Réserver un soin
          </button>
        )}
      />
    );
  }

  // Les fenêtres libres d'au moins 30 min entre deux soins (tous praticiens
  // confondus : c'est la disponibilité de l'accueil).
  const elements = [];
  let finPrecedente = null;
  for (const r of actifs) {
    const d = minutes(r.heureDebut);
    if (finPrecedente !== null && d - finPrecedente >= 30) {
      elements.push({ type: 'libre', de: finPrecedente, a: d });
    }
    elements.push({ type: 'rdv', r });
    finPrecedente = Math.max(finPrecedente ?? 0, d + r.dureeMin);
  }

  return (
    <div style={s.fil}>
      <span aria-hidden="true" style={s.filLigne} />
      {elements.map((e) => {
        if (e.type === 'libre') {
          return (
            <div key={`libre-${e.de}`} style={s.filLibre}>
              <span style={s.filHeure} />
              <span aria-hidden="true" style={{ ...s.filPoint, background: 'var(--spa-bg)', borderColor: 'var(--spa-line2)' }} />
              <span style={s.libre}>
                <span>Libre de {hhmm(e.de)} à {hhmm(e.a)} <span style={{ color: 'var(--spa-ink3)' }}>({dureeLisible(e.a - e.de)})</span></span>
                {peutCreer && (
                  <button type="button" onClick={() => onNouveau({ date, heure: hhmm(e.de) })} style={{ ...st.lien, minHeight: 32 }}>
                    <Plus size={14} strokeWidth={2} aria-hidden="true" /> Réserver
                  </button>
                )}
              </span>
            </div>
          );
        }
        const { r } = e;
        const m = metaStatutRdv(r.statut);
        const enCours = estAujourdhui && minutes(r.heureDebut) <= maintenant && maintenant < minutes(r.heureDebut) + r.dureeMin;
        return (
          <div key={r.id} style={s.filItem}>
            <span style={s.filHeure}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--spa-ink)' }}>{r.heureDebut}</span>
              <span style={{ fontSize: 12, color: 'var(--spa-ink3)' }}>{heureFin(r.heureDebut, r.dureeMin)}</span>
            </span>
            <span aria-hidden="true" style={{ ...s.filPoint, background: m.barre, borderColor: m.barre, boxShadow: enCours ? '0 0 0 4px var(--spa-mizu-soft)' : 'none' }} />
            <CarteRdv r={r} client={clientsParId.get(r.clientId)} enCours={enCours} onClick={() => onOuvrir(r)} />
          </div>
        );
      })}
    </div>
  );
}

// Le statut s'écrit en tête de la ligne de détail (et pas en pastille à
// droite) : sur un téléphone, la pastille mangeait la place du nom.
function CarteRdv({ r, client, enCours = false, onClick }) {
  const m = metaStatutRdv(r.statut);
  const mobile = useIsMobile();
  return (
    <button
      type="button"
      onClick={onClick}
      className="spa-carte-action"
      style={{ ...st.ligne, flex: '1 1 auto', gap: 12, padding: '10px 12px', opacity: ACTIF(r) ? 1 : 0.6 }}
    >
      {!mobile && <Avatar client={client} taille={40} />}
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ ...s.blocNom, fontSize: 15, textDecoration: r.statut === 'annulee' ? 'line-through' : 'none' }} data-no-translate>
            {nomClient(client)}
          </span>
          {client?.notesSante && <HeartPulse size={15} strokeWidth={2} color="var(--spa-sakura)" aria-label="Note santé" style={{ flexShrink: 0 }} />}
        </span>
        <span style={s.blocDetail}>
          <span style={{ color: enCours ? 'var(--spa-mizu)' : m.texte, fontWeight: 600 }}>{enCours ? 'En cabine' : m.label}</span>
          {', '}
          {[r.soinLibelle || 'Soin à préciser', r.praticien, r.cabine].filter(Boolean).join(', ')}
        </span>
      </span>
    </button>
  );
}

const capitaliser = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const s = {
  barre: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', marginBottom: 12 },
  // Pilule : flèche | date | flèche, 38 px de haut (44 sur tactile via la
  // règle globale des boutons).
  navJour: {
    display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%',
    borderRadius: 999, background: 'var(--spa-surface)', border: '1px solid var(--spa-line)',
  },
  fleche: {
    width: 38, height: 38, flexShrink: 0, borderRadius: 19, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', background: 'transparent', color: 'var(--spa-ink2)',
  },
  dateBouton: {
    position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0,
    padding: '0 6px', minHeight: 38, cursor: 'pointer', overflow: 'hidden',
    fontSize: 14, fontWeight: 600, color: 'var(--spa-ink)', borderRadius: 8,
  },
  dateCachee: {
    position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 0, margin: 0, padding: 0,
    opacity: 0, border: 'none', cursor: 'pointer', fontSize: 16,
  },
  resume: { flex: '1 1 auto', minWidth: 0, fontSize: 13, color: 'var(--spa-ink2)' },
  outils: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  bascule: {
    display: 'inline-flex', padding: 3, gap: 2, borderRadius: 999,
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)',
  },
  basculeBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '6px 12px',
    borderRadius: 999, border: 'none', cursor: 'pointer', background: 'transparent',
    color: 'var(--spa-ink2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
  },
  basculeActif: { background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)' },
  semaine: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(40px, 1fr))', gap: 6, marginBottom: 16 },
  jour: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0,
    padding: '5px 2px 4px', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent',
    background: 'transparent', color: 'var(--spa-ink2)',
  },
  jourActif: { borderColor: 'var(--spa-mizu)', background: 'var(--spa-mizu)', color: 'var(--spa-on-mizu)' },
  jourAujourdhui: { borderColor: 'var(--spa-line2)', color: 'var(--spa-ink)' },
  point: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },

  planning: {
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)', borderRadius: 'var(--spa-r-lg)',
    boxShadow: 'var(--spa-shadow)', overflow: 'hidden', paddingBottom: 12,
  },
  enteteColonne: {
    display: 'flex', alignItems: 'center', gap: 10, height: 64, padding: '0 12px',
    borderBottom: '1px solid var(--spa-line)', background: 'var(--spa-surface2)', minWidth: 0,
  },
  heure: {
    position: 'absolute', right: 10, fontSize: 12, color: 'var(--spa-ink3)',
    fontVariantNumeric: 'tabular-nums',
  },
  heureMaintenant: {
    position: 'absolute', right: 6, fontSize: 11, fontWeight: 700, color: 'var(--spa-on-mizu)',
    background: 'var(--spa-sakura)', padding: '2px 6px', borderRadius: 999, zIndex: 3,
  },
  ligneMaintenant: {
    position: 'absolute', left: 0, right: 0, height: 2, background: 'var(--spa-sakura)', zIndex: 3, pointerEvents: 'none',
  },
  creneau: {
    position: 'absolute', left: 0, right: 0, padding: '0 8px', border: 'none', borderRadius: 0,
    background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center',
    fontFamily: 'var(--font)', color: 'var(--spa-mizu)', minHeight: 0,
  },
  creneauPlus: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 },
  bloc: {
    position: 'absolute', left: 6, right: 6, zIndex: 2, overflow: 'hidden', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, textAlign: 'left',
    padding: '6px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--spa-ink)',
    borderTop: 'none', borderRight: 'none', borderBottom: 'none',
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--spa-mizu)',
    minHeight: 0,
  },
  blocNom: {
    display: 'block', maxWidth: '100%', fontSize: 14, fontWeight: 600,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  blocDetail: {
    display: 'block', maxWidth: '100%', fontSize: 12, color: 'var(--spa-ink2)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },

  fil: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 },
  filLigne: {
    position: 'absolute', left: 67, top: 12, bottom: 12, width: 2, borderRadius: 1, background: 'var(--spa-line)',
  },
  filItem: { position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  filLibre: { position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  filHeure: {
    width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
  },
  filPoint: {
    width: 12, height: 12, borderRadius: 6, flexShrink: 0, zIndex: 1, boxSizing: 'border-box',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--spa-mizu)',
  },
  libre: {
    flex: '1 1 auto', minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, padding: '8px 14px', borderRadius: 'var(--spa-r)', border: '1px dashed var(--spa-line2)',
    fontSize: 13, color: 'var(--spa-ink2)',
  },
};
