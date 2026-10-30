import React from 'react';
import { userDisplayName } from '../../utils/userDisplay.js';
import { Section } from './tableauBriques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Le mot du consultant : une note à toute l'équipe de l'établissement, posée
// comme une citation (filet pétrole à gauche, serif, signature dessous).
//
// Le consultant l'écrit et la modifie ici ; les autres la lisent. Sans message,
// la section disparaît pour l'équipe (rien à lire) et reste une invitation à
// écrire pour le consultant.
// ─────────────────────────────────────────────────────────────────────────────

const jourDuMois = (iso) => new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: 'numeric' }).format(new Date(iso));
const moisLong = (iso) => new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', month: 'long' }).format(new Date(iso));

export default function MotConsultant({ message, consultant, onPublier }) {
  const [edition, setEdition] = React.useState(false);
  const [brouillon, setBrouillon] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const texte = message?.message || '';

  if (!texte && !consultant) return null;

  const ouvrir = () => { setBrouillon(texte); setEdition(true); };
  async function publier(valeur) {
    setEnCours(true);
    try {
      const ok = await onPublier(valeur.trim());
      if (ok) setEdition(false);
    } finally {
      setEnCours(false);
    }
  }

  const auteur = message?.updatedBy ? userDisplayName(message.updatedBy, { fallback: 'Jérémy Samper' }) : 'Jérémy Samper';

  return (
    <Section
      id="tdb-mot"
      titre="Le mot du consultant"
      sousTitre={texte && !edition ? null : "Visible par toute l'équipe de l'établissement"}
      action={consultant && !edition ? (
        <button type="button" className="tdb-lien" onClick={ouvrir} style={s.modifier}>
          {texte ? 'Modifier' : 'Écrire'}
        </button>
      ) : null}
    >
      {edition ? (
        <div>
          <textarea
            aria-label="Message à l'équipe"
            value={brouillon}
            onChange={(e) => setBrouillon(e.target.value)}
            placeholder="Un mot pour toute l'équipe : priorités de la semaine, rappel, félicitations…"
            rows={5}
            autoFocus
            style={s.zone}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
            {texte && (
              <button type="button" onClick={() => publier('')} disabled={enCours} style={{ ...s.bouton, ...s.discret, marginRight: 'auto' }}>
                Retirer le message
              </button>
            )}
            <button type="button" onClick={() => setEdition(false)} style={{ ...s.bouton, ...s.secondaire }}>Annuler</button>
            <button type="button" onClick={() => publier(brouillon)} disabled={enCours || !brouillon.trim()} style={{ ...s.bouton, ...s.principal, opacity: enCours || !brouillon.trim() ? 0.6 : 1 }}>
              {enCours ? 'Publication…' : 'Publier'}
            </button>
          </div>
        </div>
      ) : texte ? (
        <figure style={s.figure}>
          <blockquote className="tdb-citation" style={s.citation}>{texte}</blockquote>
          <figcaption style={s.signature}>
            <span data-no-translate>{auteur}</span>
            {message?.updatedAt ? (
              <>, le <span data-no-translate>{jourDuMois(message.updatedAt)}</span>{' '}<span>{moisLong(message.updatedAt)}</span></>
            ) : null}
          </figcaption>
        </figure>
      ) : (
        <p style={s.vide}>Aucun message pour l&apos;instant. Écrivez un mot : il s&apos;affichera ici pour toute l&apos;équipe.</p>
      )}
    </Section>
  );
}

const s = {
  figure: { margin: 0, minWidth: 0 },
  // Filet gauche en longhands : jamais le raccourci border (lint:borders).
  citation: {
    margin: 0, padding: '2px 0 2px 18px', fontFamily: 'var(--font-serif)', lineHeight: 1.55, color: 'var(--text)',
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '68ch',
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--accent-bd)',
  },
  signature: { margin: '10px 0 0 21px', fontSize: 14, lineHeight: 1.4, color: 'var(--text2)' },
  vide: { margin: 0, padding: '4px 0', fontSize: 15, lineHeight: 1.5, color: 'var(--text2)', maxWidth: '68ch' },
  modifier: {
    display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 6px', flexShrink: 0, cursor: 'pointer',
    background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, color: 'var(--accent)',
  },
  zone: {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 'var(--r-sm)', resize: 'vertical',
    fontFamily: 'var(--font)', fontSize: 15, lineHeight: 1.55, color: 'var(--text)', background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  bouton: {
    minHeight: 44, padding: '10px 18px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 500, borderWidth: 1, borderStyle: 'solid',
  },
  principal: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  secondaire: { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
  discret: { background: 'transparent', color: 'var(--danger-text)', borderColor: 'transparent' },
};
