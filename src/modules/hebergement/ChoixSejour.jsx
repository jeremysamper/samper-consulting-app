import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { Fenetre, st as fst } from '../../components/ui/Fenetres.jsx';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { JOURS_RATTRAPAGE, sejoursPourChoix } from '../caisse/noteChambre.js';
import { dateCourte, useChambres, useSejours } from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lot 05 du panel : choisir le séjour qui reçoit un ticket de caisse.
// Ouverte depuis l'encaissement (séjours en maison) ou depuis « Tickets à
// porter » d'Hébergement (avecPartis : aussi les départs des 14 derniers
// jours). N'affiche que le numéro de chambre, le nom de l'hôte et le départ.
// Les séjours ne se lisent que fenêtre ouverte (le parent ne la monte qu'à
// l'ouverture). La fermeture reste possible pendant l'écriture.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function ChoixSejour({ etablissementId, montant, avecPartis = false, zIndex = null, onChoisir, onClose }) {
  const [texte, setTexte] = React.useState('');
  const [vise, setVise] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);
  const montes = React.useRef(true);
  React.useEffect(() => () => { montes.current = false; }, []);

  const aujourdhui = zurichToday();
  const filtres = React.useMemo(() => (avecPartis
    ? [['statut', 'in', ['en_maison', 'parti']], ['depart', 'gte', zurichAjouterJours(aujourdhui, -JOURS_RATTRAPAGE)]]
    : [['statut', 'in', ['en_maison']]]), [avecPartis, aujourdhui]);
  const sej = useSejours(etablissementId, { actif: true, filtres, cle: avecPartis ? `partis-${aujourdhui}` : 'en-maison' });
  const ch = useChambres(etablissementId, { actif: true });

  const liste = React.useMemo(
    () => sejoursPourChoix(sej.rows, ch.rows, texte, { avecPartis, aujourdhui }),
    [sej.rows, ch.rows, texte, avecPartis, aujourdhui],
  );
  const echec = [sej.status, ch.status].some((x) => x === 'error' || x === 'absent');
  const pret = sej.status === 'ready' && ch.status === 'ready';

  async function confirmer() {
    if (!vise || enCours) return;
    setEnCours(true);
    try {
      await onChoisir(vise.sejour, vise.chambre);
    } finally {
      if (montes.current) setEnCours(false);
    }
  }

  return (
    <Fenetre id="hotel-choix-sejour" titre="Porter sur la note d'une chambre" onClose={onClose} largeur={480} zIndex={zIndex}>
      {!vise && (
        <>
          <label style={s.champLabel}>
            <span style={fst.label}>Numéro de chambre ou nom</span>
            <Input value={texte} onChange={(e) => setTexte(e.target.value)} style={s.champ} autoFocus />
          </label>
          {echec && <p style={s.erreur} role="alert">Les séjours ne se lisent pas. Réessayez.</p>}
          {!echec && !pret && <p style={s.aide}>Chargement…</p>}
          {!echec && pret && liste.length === 0 && (
            <p style={s.aide}>{texte.trim() ? 'Aucun séjour ne correspond.' : 'Aucun séjour en maison.'}</p>
          )}
          {!echec && pret && liste.length > 0 && (
            <div style={s.liste} data-cadre="" data-choix-sejours="">
              {liste.map(({ sejour, chambre }) => (
                <button key={sejour.id} type="button" style={s.ligne} onClick={() => setVise({ sejour, chambre })} data-sejour-id={sejour.id}>
                  <span style={s.numero}>
                    <span style={s.petit}>Chambre</span>
                    <span style={s.num} data-no-translate>{chambre?.numero || '?'}</span>
                  </span>
                  <span style={s.corps}>
                    <span style={s.nom} data-no-translate>{sejour.nomHote}</span>
                    <span style={s.detail}>
                      <span>{sejour.statut === 'parti' ? 'Parti le' : 'Départ le'}</span>{' '}
                      <span style={s.num} data-no-translate>{dateCourte(sejour.depart)}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {vise && (
        <>
          <p style={s.question}>
            <span>Porter</span> <span style={s.num} data-no-translate>{chf(montant)}</span>{' '}
            <span>CHF sur la chambre</span> <span style={s.num} data-no-translate>{vise.chambre?.numero || '?'}</span>{' '}
            <span>?</span>
          </p>
          <p style={s.aide}><span data-no-translate>{vise.sejour.nomHote}</span></p>
          <div style={s.pied}>
            <Btn variant="ghost" onClick={() => setVise(null)} disabled={enCours} style={s.btn}>Choisir un autre séjour</Btn>
            <Btn variant="primary" onClick={confirmer} disabled={enCours} style={s.btn} data-confirmer-chambre="">
              {enCours ? 'Envoi…' : 'Porter sur la note'}
            </Btn>
          </div>
        </>
      )}
    </Fenetre>
  );
}

const s = {
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4 },
  champ: { width: '100%', boxSizing: 'border-box' },
  liste: {
    display: 'flex', flexDirection: 'column', maxHeight: '50vh', overflowY: 'auto', overflowX: 'hidden',
    borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', background: 'var(--surface)',
  },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 'var(--ligne-aeree)', padding: '8px 14px',
    background: 'transparent', borderWidth: '0 0 1px 0', borderStyle: 'solid', borderColor: 'var(--rule-soft)', borderRadius: 0,
    textAlign: 'left', cursor: 'pointer', color: 'var(--text)', font: 'inherit', boxSizing: 'border-box', minWidth: 0,
  },
  numero: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56, flexShrink: 0 },
  petit: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  corps: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
  question: { margin: 0, fontSize: 'var(--t3)', color: 'var(--text)', lineHeight: 1.4 },
  aide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  erreur: { margin: 0, fontSize: 'var(--t2)', color: 'var(--danger-text)', lineHeight: 1.45 },
  pied: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { minHeight: 44 },
};
