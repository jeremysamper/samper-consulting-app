import React from 'react';
import { MessageSquareText, Pencil } from 'lucide-react';
import { Carte, t } from './tableauUi.jsx';
import { userDisplayName } from '../../utils/userDisplay.js';

// ─────────────────────────────────────────────────────────────────────────────
// Le mot du consultant : une note à toute l'équipe de l'établissement.
//
// Le consultant l'écrit et la modifie ici ; les autres la lisent. Sans message,
// la carte disparaît pour l'équipe (rien à lire) et reste une invitation à
// écrire pour le consultant.
// ─────────────────────────────────────────────────────────────────────────────

const dateCourte = (iso) => (iso
  ? new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'long' }).format(new Date(iso))
  : '');

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
    <Carte
      icone={MessageSquareText}
      titre="Le mot du consultant"
      sousTitre={texte && !edition ? `${auteur}${message?.updatedAt ? `, le ${dateCourte(message.updatedAt)}` : ''}` : "Visible par toute l'équipe de l'établissement"}
      action={consultant && !edition ? (
        <button type="button" onClick={ouvrir} style={s.modifier}>
          <Pencil size={15} strokeWidth={1.9} aria-hidden="true" /> {texte ? 'Modifier' : 'Écrire'}
        </button>
      ) : null}
      style={{ background: 'var(--grad-accent-wash)', borderColor: 'var(--accent-bd)' }}
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
        <p style={s.corps}>{texte}</p>
      ) : (
        <div style={t.vide}>Aucun message pour l'instant. Écris un mot : il s'affichera ici pour toute l'équipe.</div>
      )}
    </Carte>
  );
}

const s = {
  corps: { margin: 0, fontSize: 15.5, lineHeight: 1.65, color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  zone: {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, resize: 'vertical',
    fontFamily: 'var(--font)', fontSize: 15, lineHeight: 1.55, color: 'var(--text)', background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  modifier: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--accent)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent-bd)', flexShrink: 0,
  },
  bouton: {
    minHeight: 44, padding: '10px 18px', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600, borderWidth: 1, borderStyle: 'solid',
  },
  principal: { background: 'var(--accent)', color: 'var(--tdb-on-stop)', borderColor: 'var(--accent)' },
  secondaire: { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border)' },
  discret: { background: 'transparent', color: 'var(--danger-text)', borderColor: 'transparent' },
};
