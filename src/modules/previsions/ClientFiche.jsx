import { useEffect, useRef, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { useResaClients, nomClient } from '../../hooks/useResaClients.js';
import { metaStatut, SERVICE_META, serviceAffiche } from './statutsReservation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Fiche client d'un restaurant : coordonnées, accord pour les actualités et
// bons cadeaux, et l'historique de ses réservations avec les tables occupées.
//
// Ouverte depuis l'onglet Clients ou depuis une réservation. Même contrat que
// les autres modales du module : pendant un enregistrement, « Enregistrer »
// est bloqué, jamais la fermeture ; une écriture finie après fermeture se
// signale en toast sans toucher à l'écran.
// ═══════════════════════════════════════════════════════════════════════════

const pad = (n) => String(n).padStart(2, '0');
// « 30.09.2026 » : l'historique traverse les années, le jour de la semaine
// importe moins que l'année.
const dateCh = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
const dateHeureCh = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

const FORM_VIDE = {
  prenom: '', nom: '', email: '', telephone: '', dateNaissance: '',
  allergies: '', preferences: '', notes: '',
};

function Champ({ label, children, aide }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      {children}
      {aide && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{aide}</span>}
    </label>
  );
}

const champ = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', minHeight: 44,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8,
  background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font)',
};

export default function ClientFiche({ etablissementId, clientId = null, canEdit = false, onClose, onSaved }) {
  const isMobile = useIsMobile();
  const clients = useResaClients(etablissementId);
  const [client, setClient] = useState(null);
  const [form, setForm] = useState(FORM_VIDE);
  const [historique, setHistorique] = useState(null);
  const [chargement, setChargement] = useState(Boolean(clientId));
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const nouveau = !clientId;

  const ouvertRef = useRef(true);
  useEffect(() => {
    ouvertRef.current = true;
    return () => { ouvertRef.current = false; };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let vivant = true;
    (async () => {
      const [fiche, histo] = await Promise.all([clients.get(clientId), clients.historique(clientId)]);
      if (!vivant) return;
      if (fiche.error || !fiche.data) { setErreur(fiche.error || 'Fiche introuvable.'); setChargement(false); return; }
      setClient(fiche.data);
      setForm({ ...FORM_VIDE, ...Object.fromEntries(Object.keys(FORM_VIDE).map((k) => [k, fiche.data[k] || ''])) });
      // Plus récentes d'abord, quel que soit l'ordre rendu par la lecture.
      const cle = (r) => `${r.date_service || ''} ${r.heure_arrivee || ''}`;
      setHistorique(histo.error ? [] : [...histo.data].sort((a, b) => cle(b).localeCompare(cle(a))));
      setChargement(false);
    })();
    return () => { vivant = false; };
  }, [clientId, clients]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function enregistrer() {
    if (!form.prenom.trim() && !form.nom.trim()) { notify('Indique au moins un nom.', 'error'); return; }
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) { notify('L\'e-mail semble incorrect.', 'error'); return; }
    setEnCours(true);
    const res = nouveau ? await clients.create(form) : await clients.update(clientId, form);
    setEnCours(false);
    if (res.error) {
      notify(ouvertRef.current ? res.error : `Fiche ${nomClient(form)} non enregistrée : ${res.error}`, 'error');
      return;
    }
    notify(`Fiche ${nomClient(res.data)} enregistrée`, 'success');
    onSaved?.(res.data);
    if (ouvertRef.current) onClose();
  }

  async function basculerConsentement() {
    if (!client) return;
    const accord = !client.consentementMarketing;
    setEnCours(true);
    const res = await clients.setConsentement(client.id, accord, 'equipe');
    setEnCours(false);
    if (res.error) { notify(res.error, 'error'); return; }
    if (ouvertRef.current) setClient(res.data);
    notify(accord ? `${nomClient(res.data)} accepte les actualités et bons cadeaux` : `${nomClient(res.data)} ne recevra plus d'actualités`, 'success');
    onSaved?.(res.data);
  }

  async function basculerArchive() {
    if (!client) return;
    const archive = !client.archive;
    if (archive && !window.confirm(`Archiver la fiche de ${nomClient(client)} ? Ses réservations restent, la fiche sort de la liste.`)) return;
    setEnCours(true);
    const res = await clients.setArchive(client.id, archive);
    setEnCours(false);
    if (res.error) { notify(res.error, 'error'); return; }
    notify(archive ? 'Fiche archivée' : 'Fiche sortie des archives', 'success');
    onSaved?.(res.data);
    if (ouvertRef.current) onClose();
  }

  // Chiffres calculés sur l'historique chargé (même règle que la vue
  // resa_clients_stats : une venue est une réservation passée, honorée).
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const venues = (historique || []).filter((r) => ['confirme', 'arrive', 'parti'].includes(r.statut) && r.date_service <= aujourdhui);
  const noShows = (historique || []).filter((r) => r.statut === 'no_show').length;
  const aVenir = (historique || []).filter((r) => ['confirme', 'demande'].includes(r.statut) && r.date_service >= aujourdhui);
  const derniere = venues.map((r) => r.date_service).sort().pop();
  const prochaine = aVenir.map((r) => r.date_service).sort()[0];

  const lecture = !canEdit;

  return (
    <div
      className="modal-full-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-full"
        role="dialog"
        aria-modal="true"
        aria-label={nouveau ? 'Nouveau client' : `Fiche de ${nomClient(client || form)}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: isMobile ? 0 : 14,
          width: 640, maxWidth: '100%', maxHeight: isMobile ? '100%' : '90vh', height: isMobile ? '100%' : 'auto',
          display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* En-tête */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '14px 18px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
              {nouveau ? 'Nouveau client' : nomClient(client || form)}
              {client?.archive && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>archivée</span>}
            </div>
            {!nouveau && historique && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {pluriel(venues.length, 'venue')}
                {derniere ? `, dernière le ${dateCh(derniere)}` : ''}
                {prochaine ? `, prochaine le ${dateCh(prochaine)}` : ''}
                {noShows ? `, ${pluriel(noShows, 'no-show')}` : ''}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)',
            minWidth: 44, minHeight: 44, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Corps */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {chargement && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Chargement…</div>}
          {erreur && <div style={{ padding: 12, color: 'var(--danger-text)', fontSize: 13 }}>{erreur}</div>}

          {!chargement && !erreur && (
            <>
              {/* Accord pour les actualités */}
              {!nouveau && client && (
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  borderWidth: 1, borderStyle: 'solid',
                  borderColor: client.consentementMarketing ? 'var(--success-bd)' : 'var(--border)',
                  background: client.consentementMarketing ? 'var(--success-bg-soft)' : 'var(--bg)',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: canEdit && client.email ? 'pointer' : 'default', minHeight: 44 }}>
                    <input
                      type="checkbox"
                      checked={client.consentementMarketing}
                      disabled={!canEdit || enCours || (!client.email && !client.consentementMarketing)}
                      onChange={basculerConsentement}
                      style={{ width: 20, height: 20, accentColor: 'var(--accent)', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                      Accepte de recevoir les actualités et les bons cadeaux par e-mail
                    </span>
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 30 }}>
                    {client.consentementMarketing && client.consentementAt
                      ? `Accord donné ${client.consentementSource === 'en_ligne' ? 'en ligne' : 'à l\'équipe'} le ${dateHeureCh(client.consentementAt)}`
                      : client.desinscritAt
                        ? `Désinscrit le ${dateHeureCh(client.desinscritAt)}`
                        : client.email
                          ? 'Pas d\'accord : aucun envoi d\'actualités.'
                          : 'Ajoute un e-mail pour pouvoir lui écrire.'}
                  </div>
                </div>
              )}

              {/* Coordonnées */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <Champ label="Prénom"><input style={champ} value={form.prenom} readOnly={lecture} onChange={(e) => set('prenom', e.target.value)} autoComplete="off" /></Champ>
                <Champ label="Nom"><input style={champ} value={form.nom} readOnly={lecture} onChange={(e) => set('nom', e.target.value)} autoComplete="off" /></Champ>
                <Champ label="E-mail"><input style={champ} type="email" inputMode="email" value={form.email} readOnly={lecture} onChange={(e) => set('email', e.target.value)} autoComplete="off" /></Champ>
                <Champ label="Téléphone"><input style={champ} type="tel" inputMode="tel" value={form.telephone} readOnly={lecture} onChange={(e) => set('telephone', e.target.value)} autoComplete="off" /></Champ>
                <Champ label="Date de naissance"><input style={champ} type="date" value={form.dateNaissance} readOnly={lecture} onChange={(e) => set('dateNaissance', e.target.value)} /></Champ>
                <Champ label="Allergies, régime"><input style={champ} value={form.allergies} readOnly={lecture} placeholder="Gluten, végétarien…" onChange={(e) => set('allergies', e.target.value)} /></Champ>
              </div>
              <Champ label="Préférences" aide="Table préférée, vins, habitudes : ce que la salle doit savoir en l'accueillant.">
                <textarea style={{ ...champ, minHeight: 64, resize: 'vertical' }} value={form.preferences} readOnly={lecture} onChange={(e) => set('preferences', e.target.value)} />
              </Champ>
              <Champ label="Notes">
                <textarea style={{ ...champ, minHeight: 64, resize: 'vertical' }} value={form.notes} readOnly={lecture} onChange={(e) => set('notes', e.target.value)} />
              </Champ>

              {/* Historique */}
              {!nouveau && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text2)', marginBottom: 8 }}>
                    Historique ({pluriel((historique || []).length, 'réservation')})
                  </div>
                  {(historique || []).length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>Aucune réservation rattachée.</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(historique || []).map((r) => {
                      const meta = metaStatut(r.statut);
                      const svc = SERVICE_META[serviceAffiche(r.service)];
                      const tags = (r.reservation_tags || []).map((t) => t.valeur).filter(Boolean);
                      return (
                        <div key={r.id} style={{
                          padding: '8px 10px', borderRadius: 8,
                          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                          borderLeftWidth: 3, borderLeftColor: svc?.bordure || 'var(--border)',
                          opacity: r.statut === 'annule' ? 0.55 : 1,
                        }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-num)' }}>
                              {dateCh(r.date_service)}
                            </span>
                            <span style={{ fontSize: 12, color: svc?.couleur || 'var(--text2)', fontWeight: 600 }}>
                              {svc?.label || r.service} {(r.heure_arrivee || '').slice(0, 5)}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{pluriel(r.nb_couverts || 0, 'couvert')}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: r.tables.length ? 'var(--success-text)' : 'var(--text3)' }}>
                              {r.tables.length ? `Table ${r.tables.join(' + ')}` : 'Table non notée'}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: r.statut === 'annule' ? 'var(--text3)' : meta.texte }}>
                              {r.statut === 'annule' ? 'Annulée'
                                : r.statut === 'confirme' && r.date_service < aujourdhui ? 'Confirmée'
                                  : meta.label}
                            </span>
                            {r.origine === 'en_ligne' && <span style={{ fontSize: 11, color: 'var(--text3)' }}>en ligne</span>}
                          </div>
                          {(tags.length > 0 || r.notes_libres) && (
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3 }}>
                              {tags.join(', ')}{tags.length && r.notes_libres ? '. ' : ''}{r.notes_libres || ''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pied */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '12px 18px', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
        }}>
          {canEdit && !nouveau && client && (
            <button type="button" onClick={basculerArchive} disabled={enCours} style={{
              minHeight: 44, padding: '8px 12px', borderRadius: 8,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, fontFamily: 'var(--font)', cursor: 'pointer',
            }}>
              {client.archive ? 'Sortir des archives' : 'Archiver'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{
            minHeight: 44, padding: '8px 16px', borderRadius: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
          }}>
            {enCours ? 'Fermer' : canEdit ? 'Annuler' : 'Fermer'}
          </button>
          {canEdit && !chargement && !erreur && (
            <button type="button" onClick={enregistrer} disabled={enCours} style={{
              minHeight: 44, padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700,
              fontFamily: 'var(--font)', cursor: enCours ? 'wait' : 'pointer', opacity: enCours ? 0.7 : 1,
            }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
