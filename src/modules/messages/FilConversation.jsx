import React from 'react';
import { ArrowLeft, Mic } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { roles as roleConfig } from '../moduleConfig.js';
import { MAX_LENGTH, formatDay, formatTime, fullName, initialsOf } from './conversations.js';
import { estVocal } from './vocal.js';
import { useUrlsVocales } from './useUrlsVocales.js';
import BulleVocale from './BulleVocale.jsx';
import ZoneVocale from './ZoneVocale.jsx';
import { sm } from './messagerie.styles.js';

// Fil d'une conversation, partagé par la page Messages et le panneau de la
// barre du haut : en-tête, messages (le plus ancien en haut) qui défilent dans
// leur zone, zone de saisie (le champ, « Envoyer » à sa droite). Le parent
// fournit la colonne flex qui le contient et garde l'état (brouillon, envoi).
//
//   variante  'page' (bulle à 78 %) ou 'panneau' (82 %, marges plus serrées)
//   onRemove  la page seule propose de supprimer ses propres messages
//   onRetour  « Retour » en toutes lettres (téléphone, panneau)
//   cible     hauteur d'une cible d'action (cibleDe)
//   enregistreur, onVocal  messages vocaux (lot C3) : le micro de la ligne
//             de saisie lance onVocal ; hors repos, la zone vocale prend la
//             place de la ligne de saisie
//
// Un message vocal se lit dans sa bulle (BulleVocale) ; son texte (« Message
// vocal ») reste pour les sessions ouvertes sur l'ancien front.
export default function FilConversation({
  userId, selected, thread, filRef, composerRef, draft, onDraft, onSend, sending,
  onRemove, onRetour, rows = 2, aide = false, cible = 44, variante = 'page',
  enregistreur, onVocal,
}) {
  const panneau = variante === 'panneau';
  const role = roleConfig[selected?.role] || { label: selected?.role || '' };
  const largeur = panneau ? 'min(82%, 560px)' : 'min(78%, 560px)';
  const { urlDe, charger } = useUrlsVocales(thread);
  const vocalEnCours = Boolean(enregistreur && enregistreur.etat !== 'repos');
  const micro = Boolean(enregistreur?.disponible && onVocal);
  let lastDay = null;
  return (
    <>
      <div style={panneau ? sm.filTetePanneau : sm.filTete}>
        {onRetour && (
          <Btn variant="ghost" onClick={onRetour} style={sm.retour}>
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Retour</span>
          </Btn>
        )}
        <span style={sm.pastille} data-no-translate>{initialsOf(selected)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={sm.filNom} data-no-translate>{fullName(selected)}</span>
          <span style={sm.filRole}>{role.label}</span>
        </span>
      </div>

      <div style={panneau ? sm.messagesPanneau : sm.messages} ref={filRef} role="log" aria-live="polite" aria-label="Conversation">
        {thread.length === 0 && <div style={sm.vide}>Aucun message pour l'instant. Écrivez le premier.</div>}
        {thread.map((m) => {
          const mine = m.senderId === userId;
          const day = formatDay(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {showDay && <div style={sm.jour}>{day}</div>}
              <div style={{ ...sm.bulleRang, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                {mine && onRemove && (
                  <button type="button" className="mini" style={{ ...sm.supprimer, width: cible, height: cible }} onClick={() => onRemove(m)} title="Supprimer" aria-label="Supprimer le message">
                    <span aria-hidden="true">×</span>
                  </button>
                )}
                <div data-cadre="" style={{ ...sm.bulle, ...(mine ? sm.bulleMoi : sm.bulleAutre), maxWidth: largeur }}>
                  {estVocal(m) ? (
                    <BulleVocale
                      src={urlDe(m.audioPath)}
                      duree={m.audioDureeS}
                      onCharger={() => charger(m.audioPath)}
                      cible={cible}
                    />
                  ) : (
                    <div style={sm.bulleTexte} data-no-translate>{m.message}</div>
                  )}
                  <div style={{ ...sm.bulleMeta, textAlign: mine ? 'right' : 'left' }}>
                    {formatTime(m.createdAt)}
                    {mine && (
                      <span style={{ color: m.readAt ? 'var(--success-text)' : 'var(--text3)', fontWeight: 'var(--g3)' }}>
                        {m.readAt ? ', lu' : ', envoyé'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {vocalEnCours ? (
        <ZoneVocale enregistreur={enregistreur} destinataire={selected} cible={cible} />
      ) : (
      <div style={sm.saisie}>
        <div style={sm.saisieLigne}>
          <textarea
            ref={composerRef}
            style={sm.champ}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/⌘ + Entrée envoie ; Entrée seule garde le retour à la ligne.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); }
            }}
            data-no-translate
            placeholder={`Écrire à ${selected?.prenom || fullName(selected)}…`}
            aria-label={`Message pour ${fullName(selected)}`}
            maxLength={MAX_LENGTH}
            rows={rows}
          />
          {micro && (
            <Btn
              variant="ghost"
              onClick={onVocal}
              ariaLabel="Enregistrer un message vocal"
              title="Message vocal"
              style={{ ...sm.micro, width: cible, minWidth: cible, height: cible, minHeight: cible }}
            >
              <Mic size={18} strokeWidth={1.75} aria-hidden="true" />
            </Btn>
          )}
          <Btn variant="primary" onClick={onSend} disabled={!draft.trim() || sending} style={{ flexShrink: 0, minHeight: cible }}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Btn>
        </div>
        {aide && <span style={sm.aide}>Ctrl/⌘ + Entrée pour envoyer</span>}
      </div>
      )}
    </>
  );
}
