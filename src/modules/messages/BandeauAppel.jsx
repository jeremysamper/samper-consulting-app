import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { dbService } from '../../services/dbService.js';
import { fullName } from './conversations.js';
import { formatDuree } from './vocal.js';
import { basculerMicro, fermer, nommer, raccrocher, refuser, repondre, useMoteurAppel } from './moteurAppel.js';
import { cibleDe } from './messagerie.styles.js';

// Bandeau d'appel de la coque (lot C4) : appel entrant, appel qui sonne chez
// l'autre, appel en cours, message de fin. Monté une fois par AppLayout, dans
// le flux, sous les bandeaux d'état et au-dessus de la scène : il ne se pose
// jamais par-dessus un contenu, donc ne masque ni ne bloque la caisse, le KDS
// ni le pointage (A6). La zone qui défile rétrécit de sa hauteur.
// Bandeau sombre de la direction Office (--toast-fond, --toast-texte).

// Nom de l'autre personne : lu dans les profils que la personne voit déjà
// (lecture partagée et dédoublonnée du bridge), puis donné au moteur pour
// ses messages.
function useNom(id) {
  const [nom, setNom] = React.useState('');
  React.useEffect(() => {
    setNom('');
    if (!id) return undefined;
    let vivant = true;
    const db = dbService.getDb();
    Promise.resolve(db?.listProfiles ? db.listProfiles() : []).then((rows) => {
      if (!vivant) return;
      const p = (rows || []).find((r) => r.id === id);
      const n = p ? fullName(p) : '';
      setNom(n);
      nommer(n);
    }, () => {});
    return () => { vivant = false; };
  }, [id]);
  return nom;
}

function useSecondes(actif, depuis) {
  const [, setTic] = React.useState(0);
  React.useEffect(() => {
    if (!actif) return undefined;
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [actif]);
  return depuis ? Math.max(0, Math.round((Date.now() - depuis) / 1000)) : 0;
}

const NOTE_DIRECTE = "Entre deux réseaux différents (Wi-Fi et 4G par exemple), l'appel peut ne pas aboutir.";

export default function BandeauAppel({ tactile = false }) {
  const e = useMoteurAppel();
  const nom = useNom(e.phase === 'repos' ? null : e.autreId);
  const secondes = useSecondes(e.phase === 'en_cours', e.debut);
  if (e.phase === 'repos') return null;

  const cible = cibleDe(tactile);
  const bouton = { minHeight: cible, flexShrink: 0 };
  // Le nom ne passe jamais par la traduction ; le repli, si.
  const qui = nom ? <span data-no-translate>{nom}</span> : <span>un collègue</span>;
  let titre;
  let detail = null;
  let actions;
  switch (e.phase) {
    case 'entrant':
      titre = <>Appel de {qui}</>;
      detail = e.sonMuet ? "Touchez l'écran pour entendre la sonnerie." : "Appel audio dans l'app";
      actions = (
        <>
          <Btn variant="danger" onClick={refuser} style={bouton}>Refuser</Btn>
          {/* Variante succès et non l'aplat d'accent : en thème clair, le
              pétrole se perdait sur le fond sombre du bandeau. */}
          <Btn variant="success" onClick={repondre} style={bouton}>Décrocher</Btn>
        </>
      );
      break;
    case 'preparation':
      titre = <>Appel vers {qui}</>;
      detail = 'Préparation du micro…';
      actions = <Btn variant="danger" onClick={raccrocher} style={bouton}>Annuler</Btn>;
      break;
    case 'sortant':
      titre = <>Appel vers {qui}</>;
      detail = 'Ça sonne…';
      actions = <Btn variant="danger" onClick={raccrocher} style={bouton}>Raccrocher</Btn>;
      break;
    case 'connexion':
    case 'en_cours':
      titre = qui;
      if (e.phase === 'connexion') detail = "Connexion de l'appel…";
      else detail = e.instable ? 'Reconnexion…' : <span style={sb.temps} data-no-translate>{formatDuree(secondes)}</span>;
      actions = (
        <>
          <Btn variant="ghost" onClick={basculerMicro} disabled={e.phase !== 'en_cours'} style={bouton}>
            {e.micCoupe ? 'Rétablir le micro' : 'Couper le micro'}
          </Btn>
          <Btn variant="danger" onClick={raccrocher} style={bouton}>Raccrocher</Btn>
        </>
      );
      break;
    default:
      titre = e.message;
      if (e.duree) detail = <span style={sb.temps} data-no-translate>{e.duree}</span>;
      actions = <Btn variant="ghost" onClick={fermer} style={bouton}>Fermer</Btn>;
  }
  const noteDirecte = e.relais === false && ['sortant', 'connexion', 'en_cours'].includes(e.phase);

  return (
    <section role="region" aria-label="Appel" style={{ ...sb.racine, padding: tactile ? '8px 12px' : '8px 16px' }}>
      <div style={sb.corps}>
        <div style={sb.titre} aria-live={e.phase === 'entrant' ? 'assertive' : 'polite'}>{titre}</div>
        {detail ? <div style={sb.detail}>{detail}</div> : null}
        {noteDirecte ? <div style={sb.detail}>{NOTE_DIRECTE}</div> : null}
      </div>
      <div style={sb.actions}>{actions}</div>
    </section>
  );
}

const sb = {
  // Pleine largeur de la coque, hauteur de son contenu ; les boutons passent
  // sous le texte quand la largeur manque (téléphone).
  racine: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0, background: 'var(--toast-fond)', color: 'var(--toast-texte)', fontFamily: 'var(--font)', boxSizing: 'border-box', width: '100%' },
  corps: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 200px', minWidth: 0 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detail: { fontSize: 'var(--t1)', minWidth: 0, overflowWrap: 'break-word' },
  temps: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
  actions: { display: 'flex', gap: 8, flexShrink: 0, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' },
};
