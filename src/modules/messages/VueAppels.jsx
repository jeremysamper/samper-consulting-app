import React from 'react';
import { Phone } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { dbService } from '../../services/dbService.js';
import { surChangementAppels } from '../../hooks/useAppels.js';
import { fullName, formatListDate, initialsOf } from './conversations.js';
import { lireJournal } from './appels.js';
import { sm } from './messagerie.styles.js';

// Vue Appels de la page Messages (lot C4) : le journal des appels de la
// personne, lu par ses deux participants seulement (RLS de la table appels),
// du plus récent au plus ancien, purgé à 90 jours par la base (D7). Une ligne
// ouvre la fiche de l'autre personne ; le bouton à droite la rappelle.
// Aucun canal ici : le journal se relit sur les changements vus par le canal
// de la coque (surChangementAppels).
const COLONNES = 'id,appelant_id,appele_id,etat,cree_a,duree_s,duree_approx';

export default function VueAppels({ userId, profileById, actifId, onOuvrir, onAppeler, peutAppeler = false, occupe = false, cible = 44 }) {
  const [lignes, setLignes] = React.useState(null);
  const [echec, setEchec] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    const lire = async () => {
      const c = dbService.getClient();
      if (!c) return;
      const { data, error } = await c.from('appels').select(COLONNES).order('cree_a', { ascending: false }).limit(100);
      if (!vivant) return;
      // Échec de lecture : la liste d'avant reste, une phrase le dit.
      if (error) { setEchec(true); return; }
      setEchec(false);
      setLignes(data || []);
    };
    lire();
    const off = surChangementAppels(lire);
    return () => { vivant = false; off(); };
  }, [userId]);

  if (lignes === null) {
    return <div style={sm.vide}>{echec ? 'Journal des appels indisponible.' : 'Chargement…'}</div>;
  }
  if (lignes.length === 0) {
    return <div style={sm.vide}>Aucun appel pour le moment.</div>;
  }
  return (
    <>
      {echec ? <div style={sm.vide}>Journal des appels indisponible.</div> : null}
      {lignes.map((l) => {
        const j = lireJournal(l, userId);
        const profil = profileById.get(j.autreId) || null;
        return (
          <div key={l.id} style={sv.rang}>
            <button
              type="button"
              style={{ ...sm.ligne, flex: 1, minWidth: 0, ...(actifId === j.autreId ? sm.ligneActive : null) }}
              onClick={() => onOuvrir(j.autreId)}
              aria-current={actifId === j.autreId ? 'true' : undefined}
            >
              <span style={sm.pastille} data-no-translate>{initialsOf(profil)}</span>
              <span style={sm.corps}>
                <span style={sm.haut}>
                  <span style={sm.nom} data-no-translate>{fullName(profil)}</span>
                  <span style={sm.date}>{formatListDate(l.cree_a)}</span>
                </span>
                <span style={sm.bas}>
                  <span style={{ ...sm.apercu, color: j.manque ? 'var(--danger-text)' : 'var(--text2)' }}>
                    <span>{j.sens === 'emis' ? 'Émis' : 'Reçu'}</span>
                    {', '}
                    <span>{j.issue}</span>
                    {j.environ ? <>{' '}<span>environ</span></> : null}
                    {j.duree ? <>{' '}<span data-no-translate>{j.duree}</span></> : null}
                  </span>
                </span>
              </span>
            </button>
            {peutAppeler && profil && profil.actif !== false ? (
              <Btn
                variant="ghost"
                onClick={() => onAppeler(j.autreId)}
                disabled={occupe}
                ariaLabel="Appeler"
                title="Appeler"
                style={{ width: cible, minHeight: cible, padding: 0, flexShrink: 0 }}
              >
                <Phone size={18} strokeWidth={1.75} aria-hidden="true" />
              </Btn>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

const sv = {
  // Ligne du journal et bouton d'appel, 8 px entre eux ; flexShrink 0 : la
  // colonne défile (règle des lignes de la messagerie).
  rang: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 0 },
};
