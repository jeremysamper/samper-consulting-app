import { useState, useEffect } from 'react';
import { useReservations } from '../../hooks/useReservations.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { metaStatut } from './statutsReservation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Recherche d'une réservation par nom ou téléphone, toutes dates confondues.
//
// Sans elle, retrouver quelqu'un supposait de connaître sa date - or quand il
// rappelle pour décaler ou ajouter deux couverts, c'est précisément
// l'information qui manque. La recherche balaie donc tout l'établissement, et
// range les résultats à venir avant les passés : on cherche presque toujours
// une réservation future.
// ═══════════════════════════════════════════════════════════════════════════

const DEBOUNCE_MS = 300;

function LigneResultat({ resa, onOuvrir, onAllerAuJour }) {
  const meta   = metaStatut(resa.statut || 'confirme');
  const traite = (resa.statut || 'confirme') !== 'confirme';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
      borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
    }}>
      <button
        type="button" onClick={() => onOuvrir(resa)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
          border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            {resa.nom}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            · {resa.nb_couverts} pax
          </span>
          {traite && (
            <span style={{
              padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              borderWidth: 1, borderStyle: 'solid', borderColor: meta.bordure,
              background: meta.bg, color: meta.texte,
            }}>
              {meta.court}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {formatDateLongue(resa.date_service)} · {(resa.heure_arrivee || '').slice(0, 5)}
          {resa.telephone ? ` · ${resa.telephone}` : ''}
        </div>
      </button>
      <button
        type="button" onClick={() => onAllerAuJour(resa.date_service)}
        title="Ouvrir cette journée"
        style={{
          flexShrink: 0, minHeight: 40, padding: '8px 12px', borderRadius: 8,
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
          background: 'var(--surface)', color: 'var(--text2)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
        }}>
        Voir le jour
      </button>
    </div>
  );
}

export default function RechercheResas({
  etablissementId, terme, refreshKey = 0, onOuvrir, onAllerAuJour,
}) {
  const reservations = useReservations(etablissementId);
  const [resultats, setResultats] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    const t = String(terme || '').trim();
    if (t.length < 2) { setResultats(null); setError(null); return undefined; }

    // Annulé à chaque frappe : sans ça, taper « Dupont » lance six requêtes
    // dont les réponses peuvent revenir dans le désordre.
    let vivant = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await reservations.search(t);
      if (!vivant) return;
      setLoading(false);
      if (err) { setError(err); setResultats(null); return; }
      setResultats(data);
    }, DEBOUNCE_MS);

    return () => { vivant = false; clearTimeout(timer); };
  }, [terme, reservations, refreshKey]);

  const t = String(terme || '').trim();
  if (t.length < 2) {
    return (
      <div style={{
        marginTop: 12, padding: '14px 16px', borderRadius: 10,
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
        background: 'var(--surface)', fontSize: 13, color: 'var(--text3)',
      }}>
        Tape au moins deux caractères : nom ou téléphone.
      </div>
    );
  }

  const auj     = zurichToday();
  const aVenir  = (resultats || []).filter((r) => r.date_service >= auj)
    .sort((a, b) => a.date_service.localeCompare(b.date_service));
  const passees = (resultats || []).filter((r) => r.date_service < auj);

  return (
    <div style={{ marginTop: 12 }}>
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg-soft)',
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)',
          color: 'var(--danger-text)', fontSize: 13, marginBottom: 10,
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
          Recherche…
        </div>
      )}

      {!loading && resultats !== null && resultats.length === 0 && (
        <div style={{
          padding: '20px 16px', textAlign: 'center', borderRadius: 10,
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
          background: 'var(--surface)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            Aucune réservation pour « {t} »
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            La recherche porte sur le nom et le téléphone, hors résas annulées.
          </div>
        </div>
      )}

      {!loading && resultats !== null && resultats.length > 0 && (
        <div style={{
          borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
          borderRadius: 10, overflow: 'hidden', background: 'var(--surface)',
        }}>
          {[
            { titre: 'À venir', liste: aVenir },
            { titre: 'Passées', liste: passees },
          ].map(({ titre, liste }) => liste.length === 0 ? null : (
            <div key={titre}>
              <div style={{
                padding: '7px 12px', background: 'var(--bg)',
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: 0.5, color: 'var(--text3)',
              }}>
                {titre} · {liste.length}
              </div>
              {liste.map((r) => (
                <LigneResultat
                  key={r.id} resa={r}
                  onOuvrir={onOuvrir} onAllerAuJour={onAllerAuJour}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
