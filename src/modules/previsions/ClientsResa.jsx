import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dbService } from '../../services/dbService.js';
import { useResaClients, nomClient } from '../../hooks/useResaClients.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import BandeauNonActualise from './BandeauNonActualise.jsx';
import ClientFiche from './ClientFiche.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Onglet Clients du module Réservations : le fichier clients de
// l'établissement.
//
// Il se remplit seul (chaque réservation avec un e-mail ou un téléphone est
// rattachée à sa fiche, en base) ; on y corrige une fiche, on note une
// préférence, on recueille l'accord pour les actualités. Les clients venus
// par la caisse (Lightspeed) s'y ajouteront plus tard.
// ═══════════════════════════════════════════════════════════════════════════

const dateCh = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

const FILTRES = [
  { id: 'tous', label: 'Tous' },
  { id: 'habitues', label: 'Habitués' },
  { id: 'emails', label: 'Acceptent les e-mails' },
  { id: 'archives', label: 'Archivés' },
];

// Habitué : trois venues ou plus.
const HABITUE = 3;

export default function ClientsResa({ etablissementId, canEdit, refreshKey }) {
  const clients = useResaClients(etablissementId);
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [nonActualise, setNonActualise] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [ouverte, setOuverte] = useState(null); // id, 'nouveau' ou null
  const lectures = useOrdreLectures();
  const afficheRef = useRef(false);

  const charger = useCallback(async () => {
    if (!etablissementId) return;
    const lecture = lectures.lancer(etablissementId);
    const res = await clients.list().catch(() => ({ data: null, error: 'Erreur technique. Réessaie.' }));
    if (res.error) {
      if (!lecture.signalerEchec()) return;
      if (afficheRef.current) setNonActualise(true); else setErreur(res.error);
      return;
    }
    if (!lecture.appliquer()) return;
    afficheRef.current = true;
    setListe(res.data);
    setErreur(null);
    setNonActualise(false);
  }, [etablissementId, clients, lectures]);

  useEffect(() => { charger(); }, [charger, refreshKey]);

  // Temps réel : une réservation en ligne crée ou complète une fiche pendant
  // qu'on regarde la liste. subscribeReload rejoue aussi la lecture au réveil.
  useEffect(() => {
    const realtime = dbService.getBridge()?.realtime;
    if (!realtime?.subscribeReload) return undefined;
    const unsub = realtime.subscribeReload(['resa_clients', 'reservations'], charger);
    return () => { unsub && unsub(); };
  }, [charger]);

  const compte = useMemo(() => {
    const l = liste || [];
    return {
      tous: l.filter((c) => !c.archive).length,
      habitues: l.filter((c) => !c.archive && c.nbVenues >= HABITUE).length,
      emails: l.filter((c) => !c.archive && c.consentementMarketing && c.email).length,
      archives: l.filter((c) => c.archive).length,
    };
  }, [liste]);

  const visibles = useMemo(() => {
    const correspond = makeSearchMatcher(recherche);
    let l = (liste || []).filter((c) => correspond(`${c.prenom} ${c.nom} ${c.email} ${c.telephone}`));
    l = filtre === 'archives' ? l.filter((c) => c.archive) : l.filter((c) => !c.archive);
    if (filtre === 'habitues') l = l.filter((c) => c.nbVenues >= HABITUE);
    if (filtre === 'emails') l = l.filter((c) => c.consentementMarketing && c.email);
    // Les plus fidèles d'abord pour « Habitués », sinon par nom.
    return filtre === 'habitues'
      ? l.sort((a, b) => b.nbVenues - a.nbVenues)
      : l.sort((a, b) => nomClient(a).localeCompare(nomClient(b), 'fr'));
  }, [liste, recherche, filtre]);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Nom, e-mail ou téléphone…"
          aria-label="Chercher un client"
          autoComplete="off"
          style={{
            flex: '1 1 240px', minWidth: 0, minHeight: 44, padding: '10px 14px', boxSizing: 'border-box',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 999,
            background: 'var(--surface)', color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font)',
          }}
        />
        {canEdit && (
          <button type="button" onClick={() => setOuverte('nouveau')} style={{
            minHeight: 44, padding: '9px 16px', borderRadius: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)',
            background: 'var(--surface)', color: 'var(--accent)', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font)', cursor: 'pointer',
          }}>
            + Nouveau client
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {FILTRES.map((f) => {
          const actif = filtre === f.id;
          return (
            <button key={f.id} type="button" aria-pressed={actif} onClick={() => setFiltre(f.id)} style={{
              flexShrink: 0, minHeight: 36, padding: '6px 12px', borderRadius: 999,
              borderWidth: 1, borderStyle: 'solid', borderColor: actif ? 'var(--accent)' : 'var(--border)',
              background: actif ? 'var(--accent-light)' : 'var(--surface)',
              color: actif ? 'var(--accent)' : 'var(--text2)', fontSize: 12, fontWeight: 600,
              fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {f.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>{compte[f.id]}</span>
            </button>
          );
        })}
      </div>

      {nonActualise && <BandeauNonActualise onRetry={charger} />}
      {erreur && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', fontSize: 13, marginBottom: 12 }}>
          {erreur}
        </div>
      )}
      {liste === null && !erreur && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Chargement des clients…</div>
      )}

      {liste !== null && visibles.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 6 }}>
            {(liste || []).length === 0 ? 'Le fichier clients est encore vide' : 'Aucun client trouvé'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 380, margin: '0 auto' }}>
            {(liste || []).length === 0
              ? 'Chaque réservation avec un e-mail ou un téléphone crée ou complète une fiche, automatiquement.'
              : 'Essaie un autre mot ou un autre filtre.'}
          </div>
        </div>
      )}

      {visibles.length > 0 && (
        <div style={{
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10,
          overflow: 'hidden', background: 'var(--surface)',
        }}>
          {visibles.map((c) => (
            <button key={c.id} type="button" onClick={() => setOuverte(c.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
              padding: '10px 14px', minHeight: 56, background: 'transparent', cursor: 'pointer',
              borderWidth: 0, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
              fontFamily: 'var(--font)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nomClient(c)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[c.telephone, c.email].filter(Boolean).join(' · ') || 'Pas de contact'}
                </div>
                {(c.allergies || c.preferences) && (
                  <div style={{ fontSize: 11, color: c.allergies ? 'var(--danger-text)' : 'var(--text3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[c.allergies, c.preferences].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.nbVenues >= HABITUE ? 'var(--accent)' : 'var(--text)' }}>
                  {pluriel(c.nbVenues, 'venue')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {c.prochaine ? `prochaine ${dateCh(c.prochaine)}` : c.derniereVenue ? `dernière ${dateCh(c.derniereVenue)}` : ''}
                  {c.nbNoShow ? ` · ${pluriel(c.nbNoShow, 'no-show')}` : ''}
                </div>
                {c.consentementMarketing && c.email && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success-text)' }}>accepte les e-mails</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {ouverte && (
        <ClientFiche
          key={ouverte}
          etablissementId={etablissementId}
          clientId={ouverte === 'nouveau' ? null : ouverte}
          canEdit={canEdit}
          onClose={() => setOuverte(null)}
          onSaved={() => charger()}
        />
      )}
    </div>
  );
}
