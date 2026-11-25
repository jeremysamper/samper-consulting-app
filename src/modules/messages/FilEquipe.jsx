import React from 'react';
import { ArrowLeft, Moon, Users } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { formatDay, formatTime, fullName } from './conversations.js';
import { MAX_MESSAGE_EQUIPE } from './filsEquipe.js';
import { sm } from './messagerie.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fils d'équipe de Messages (plan 15, D5) : la ligne d'un fil dans la liste
// des discussions, et le fil lui-même (messages du plus ancien au plus
// récent, nom de l'auteur sur chaque bulle reçue, zone de saisie).
//
// Un message peut nommer des personnes (mentions) : « Écrire à l'équipe du
// soir » pose d'office celles qui travaillent ce soir, dans le fil Toute
// l'équipe. La base vérifie que chaque nom est une personne de la maison.
// ─────────────────────────────────────────────────────────────────────────────

const ICONES = { soir: Moon };

// Ligne d'un fil : picto du groupe dans sa pastille, nom du fil, dernier
// message, compteur de non-lus. Même pas que la ligne d'une personne.
export function LigneFil({ libelle, apercu, apercuDonnee = false, date, nonLus = 0, actif = false, onClick, icone = 'equipe' }) {
  const Icone = ICONES[icone] || Users;
  return (
    <button type="button" style={{ ...sm.ligne, ...(actif ? sm.ligneActive : null) }} onClick={onClick} aria-current={actif ? 'true' : undefined} data-fil-equipe="">
      <span style={sm.pastille} aria-hidden="true"><Icone size={18} strokeWidth={1.75} /></span>
      <span style={sm.corps}>
        <span style={sm.haut}>
          <span style={sm.nom}>{libelle}</span>
          {date ? <span style={sm.date}>{date}</span> : null}
        </span>
        <span style={sm.bas}>
          <span style={{ ...sm.apercu, color: nonLus ? 'var(--text)' : 'var(--text2)' }} data-no-translate={apercuDonnee ? '' : undefined}>{apercu}</span>
          {nonLus > 0 && (
            <span style={sm.nonLus} aria-label={`${nonLus} message${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}`}>{nonLus}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function FilEquipe({
  libelle, detail, messages, profileById, userId, filRef, composerRef, draft, onDraft, onSend, sending,
  mentions = [], onRetirerMentions, onRetour, cible = 44, aide = false,
}) {
  const nom = (id) => fullName(profileById.get(id)) || 'Ancien compte';
  const nomsMentions = mentions.map(nom);
  let lastDay = null;
  return (
    <>
      <div style={sm.filTete}>
        {onRetour && (
          <Btn variant="ghost" onClick={onRetour} style={sm.retour}>
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Retour</span>
          </Btn>
        )}
        <span style={sm.pastille} aria-hidden="true"><Users size={18} strokeWidth={1.75} /></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={sm.filNom}>{libelle}</span>
          {detail && <span style={sm.filRole}>{detail}</span>}
        </span>
      </div>

      <div style={sm.messages} ref={filRef} role="log" aria-live="polite" aria-label={libelle}>
        {messages.length === 0 && <div style={sm.vide}>Aucun message pour l'instant. Écrivez le premier.</div>}
        {messages.map((m) => {
          const mine = m.createdBy === userId;
          const day = formatDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const pour = (m.mentions || []).map(nom);
          return (
            <React.Fragment key={m.id}>
              {showDay && <div style={sm.jour}>{day}</div>}
              <div style={{ ...sm.bulleRang, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div data-cadre="" style={{ ...sm.bulle, ...(mine ? sm.bulleMoi : sm.bulleAutre), maxWidth: 'min(78%, 560px)' }}>
                  {!mine && <div style={st.auteur} data-no-translate>{nom(m.createdBy)}</div>}
                  {pour.length > 0 && (
                    <div style={st.pour}><span>Pour</span>{' '}<span data-no-translate>{pour.join(', ')}</span></div>
                  )}
                  <div style={sm.bulleTexte} data-no-translate>{m.contenu}</div>
                  <div style={{ ...sm.bulleMeta, textAlign: mine ? 'right' : 'left' }}>{formatTime(m.createdAt)}</div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={sm.saisie}>
        {nomsMentions.length > 0 && (
          <div style={st.mentions} data-mentions="">
            <span style={{ minWidth: 0, flex: 1 }}>
              <span>Pour l'équipe du soir :</span>{' '}<span data-no-translate>{nomsMentions.join(', ')}</span>
            </span>
            {onRetirerMentions && (
              <Btn variant="ghost" onClick={onRetirerMentions} style={{ minHeight: cible, flexShrink: 0 }}>Retirer les noms</Btn>
            )}
          </div>
        )}
        <div style={sm.saisieLigne}>
          <textarea
            ref={composerRef}
            style={sm.champ}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); }
            }}
            data-no-translate
            placeholder={`Écrire au fil ${libelle}…`}
            aria-label={`Message pour le fil ${libelle}`}
            maxLength={MAX_MESSAGE_EQUIPE}
            rows={2}
          />
          <Btn variant="primary" onClick={onSend} disabled={!draft.trim() || sending} style={{ flexShrink: 0, minHeight: cible }}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Btn>
        </div>
        {aide && <span style={sm.aide}>Ctrl/⌘ + Entrée pour envoyer</span>}
      </div>
    </>
  );
}

const st = {
  auteur: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', marginBottom: 2 },
  pour: { fontSize: 'var(--t1)', color: 'var(--text2)', marginBottom: 2 },
  mentions: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'var(--t1)', color: 'var(--text2)', minWidth: 0 },
};
