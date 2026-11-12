import { fullName, initialsOf } from './conversations.js';
import { sm } from './messagerie.styles.js';

// Ligne d'une personne, partagée par la page Messages (Discussions, Contacts)
// et le panneau de la barre du haut : initiales, nom, date éventuelle, une
// ligne d'aperçu (dernier message ou rôle) et le compteur de non-lus.
// apercuDonnee : l'aperçu est un message saisi (jamais traduit), pas un
// libellé de rôle.
export default function LignePersonne({ profile, date, apercu, apercuDonnee = false, nonLus = 0, actif = false, onClick }) {
  return (
    <button
      type="button"
      style={{ ...sm.ligne, ...(actif ? sm.ligneActive : null) }}
      onClick={onClick}
      aria-current={actif ? 'true' : undefined}
    >
      <span style={sm.pastille} data-no-translate>{initialsOf(profile)}</span>
      <span style={sm.corps}>
        <span style={sm.haut}>
          <span style={sm.nom} data-no-translate>{fullName(profile)}</span>
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
