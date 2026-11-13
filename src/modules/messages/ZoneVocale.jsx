import { Btn } from '../../components/ui/index.jsx';
import { DUREE_MAX_S, formatDuree } from './vocal.js';
import { fullName } from './conversations.js';
import BulleVocale from './BulleVocale.jsx';
import { sm } from './messagerie.styles.js';

// Zone d'un message vocal, à la place de la ligne de saisie du fil (page et
// panneau) dès que l'enregistreur n'est plus au repos : demande du micro,
// enregistrement, réécoute avant l'envoi, envoi, refus du micro. Le texte
// d'état puis les boutons ; les boutons passent à la ligne quand la largeur
// manque (téléphone de 360 px).
export default function ZoneVocale({ enregistreur, destinataire, onEnvoyer, cible = 44 }) {
  const { etat, ecoule, enreg, arreter, abandonner } = enregistreur;
  const prenom = destinataire?.prenom || fullName(destinataire);
  const bouton = { minHeight: cible, flexShrink: 0 };

  let etatTexte;
  let actions;
  if (etat === 'demande') {
    etatTexte = <span style={sm.vocalTexte}>Autorisation du micro…</span>;
    actions = <Btn variant="ghost" onClick={abandonner} style={bouton}>Abandonner</Btn>;
  } else if (etat === 'enregistre') {
    etatTexte = (
      <span style={sm.vocalEtat}>
        <span style={sm.vocalPoint} aria-hidden="true" />
        <span style={sm.vocalTexte}>Enregistrement en cours</span>
        <span style={sm.vocalTemps} data-no-translate>{formatDuree(ecoule)} / {formatDuree(DUREE_MAX_S)}</span>
      </span>
    );
    actions = (
      <>
        <Btn variant="ghost" onClick={abandonner} style={bouton}>Abandonner</Btn>
        <Btn variant="primary" onClick={arreter} style={bouton}>Arrêter</Btn>
      </>
    );
  } else if (etat === 'reecoute' || etat === 'envoi') {
    etatTexte = (
      <span style={sm.vocalColonne}>
        <BulleVocale src={enreg?.url} duree={enreg?.duree} cible={cible} />
        <span style={sm.vocalAide}>
          Seuls vous et <span data-no-translate>{prenom}</span> pourrez l'écouter.
        </span>
      </span>
    );
    actions = (
      <>
        <Btn variant="ghost" onClick={abandonner} disabled={etat === 'envoi'} style={bouton}>Abandonner</Btn>
        <Btn variant="primary" onClick={onEnvoyer} disabled={etat === 'envoi'} style={bouton}>
          {etat === 'envoi' ? 'Envoi…' : 'Envoyer'}
        </Btn>
      </>
    );
  } else if (etat === 'refus') {
    etatTexte = (
      <span style={sm.vocalTexte}>
        Micro refusé. Autorisez le micro pour cette app dans les réglages du navigateur, puis réessayez.
      </span>
    );
    actions = <Btn variant="ghost" onClick={abandonner} style={bouton}>Fermer</Btn>;
  } else {
    etatTexte = <span style={sm.vocalTexte}>Enregistrement impossible sur cet appareil.</span>;
    actions = <Btn variant="ghost" onClick={abandonner} style={bouton}>Fermer</Btn>;
  }

  return (
    <div style={sm.saisie} data-zone-vocale={etat}>
      <div style={sm.vocalLigne}>
        <div style={sm.vocalCorps} role="status">{etatTexte}</div>
        <div style={sm.vocalActions}>{actions}</div>
      </div>
    </div>
  );
}
