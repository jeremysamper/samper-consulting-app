import React from 'react';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { zurichToday } from '../../../utils/zurichTime.js';
import { trouverBonCadeau } from '../../../services/caisseBonsCadeauxService.js';
import { dateCH, etatBon, montantUtilisable } from './codeBon.js';
import { PastilleEtat } from './FicheBonCadeau.jsx';
import LecteurBon from './LecteurBon.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Payer avec un bon cadeau, depuis l'encaissement : lire le bon (QR ou code),
// voir à qui il est et ce qu'il reste dessus, puis régler tout ou partie de la
// part en cours. Rien n'est débité ici : la base débite le bon quand le ticket
// s'encaisse (caisse_encaisser), et refuse un bon épuisé, échu, annulé ou
// d'une autre maison même si l'écran l'a laissé passer.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const nombre = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

export default function FeuilleBonCadeau({ etablissementId, part, test = false, dejaPoses = [], onRegler, onClose }) {
  const [bon, setBon] = React.useState(null);
  const [erreur, setErreur] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);
  const [montant, setMontant] = React.useState('');
  const [lecteurCle, setLecteurCle] = React.useState(0);
  const aujourdhui = zurichToday();

  async function codeLu(code) {
    setEnCours(true);
    setErreur(null);
    try {
      const { data, error } = await trouverBonCadeau(etablissementId, code);
      if (error) { setErreur(error); return; }
      if (!data) { setErreur(`Aucun bon ${code} dans cet établissement. Vérifiez le code.`); setLecteurCle((k) => k + 1); return; }
      setBon(data);
      setMontant('');
    } finally {
      setEnCours(false);
    }
  }

  function autreBon() {
    setBon(null);
    setErreur(null);
    setLecteurCle((k) => k + 1);
  }

  const etat = bon ? etatBon(bon, aujourdhui) : null;
  const deja = bon && dejaPoses.includes(bon.code);
  const propose = bon ? montantUtilisable(bon, part) : 0;
  const saisi = montant === '' ? propose : nombre(montant);
  const valable = bon && etat === 'actif' && !deja && saisi != null && saisi > 0 && saisi <= Number(bon.solde) && saisi <= part;

  return (
    <Fenetre id="caisse-bon-payer" titre="Payer avec un bon cadeau" onClose={onClose} largeur={480} zIndex={1300}>
      {!bon && (
        <>
          <LecteurBon key={lecteurCle} onCode={codeLu} enCours={enCours} />
          {erreur && <p style={s.erreur} role="alert">{erreur}</p>}
        </>
      )}
      {bon && (
        <>
          <div style={s.carte} data-cadre="" data-bon-lu={bon.code}>
            <span style={s.ligneHaut}>
              <span style={s.code} data-no-translate>{bon.code}</span>
              <PastilleEtat etat={etat} />
            </span>
            <span style={s.nom} data-no-translate>{bon.nom}</span>
            <span style={s.libelle}>Solde</span>
            <span style={s.solde}><span>{chf(bon.solde)}</span> <span style={s.devise}>CHF</span></span>
            {bon.valable_jusqu_au && (
              <span style={s.detail}><span>Valable jusqu'au</span> <span style={s.num}>{dateCH(bon.valable_jusqu_au)}</span></span>
            )}
          </div>
          {etat === 'echu' && <p style={s.erreur}>Ce bon est échu. Le patron peut prolonger sa validité depuis Bons cadeaux.</p>}
          {etat === 'epuise' && <p style={s.erreur}>Ce bon est épuisé.</p>}
          {etat === 'annule' && <p style={s.erreur}>Ce bon est annulé.</p>}
          {deja && <p style={s.erreur}>Ce bon est déjà posé sur ce ticket.</p>}
          {etat === 'actif' && !deja && (
            <>
              <label style={s.champLabel}>
                <span style={fst.label}>Montant réglé avec le bon</span>
                <Input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={chf(propose)} inputMode="decimal" style={s.champ} />
              </label>
              {Number(bon.solde) < part && montant === '' && (
                <p style={s.aide}><span>Le bon couvre</span> <span style={s.num}>{chf(propose)}</span> <span>CHF ; le reste se paie par un autre moyen.</span></p>
              )}
              {test && <p style={s.aide}>Mode test : le bon n'est pas débité.</p>}
            </>
          )}
          <div style={s.pied}>
            <Btn variant="ghost" onClick={autreBon} style={s.btn}>Lire un autre bon</Btn>
            {etat === 'actif' && !deja && (
              <Btn variant="primary" disabled={!valable} onClick={() => onRegler(bon.code, saisi)} style={s.btn}>
                <span>Régler</span> <span style={s.num}>{chf(saisi || 0)}</span> <span>CHF avec le bon</span>
              </Btn>
            )}
          </div>
        </>
      )}
    </Fenetre>
  );
}

const s = {
  carte: { display: 'flex', flexDirection: 'column', gap: 3, padding: 16, borderRadius: 'var(--r-lg)', background: 'var(--piste)' },
  ligneHaut: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  code: { fontFamily: 'var(--font-num)', fontSize: 'var(--t4)', letterSpacing: '0.06em', color: 'var(--text)' },
  nom: { fontSize: 'var(--t3)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  libelle: { fontSize: 'var(--t1)', color: 'var(--text3)', marginTop: 6 },
  solde: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t6)', color: 'var(--text)', lineHeight: 1.1 },
  devise: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  detail: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4 },
  champ: { width: '100%', boxSizing: 'border-box' },
  aide: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  erreur: { margin: 0, fontSize: 'var(--t2)', color: 'var(--danger-text)', lineHeight: 1.45 },
  pied: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { minHeight: 44 },
};
