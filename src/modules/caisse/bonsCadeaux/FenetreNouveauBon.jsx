import React from 'react';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { zurichToday } from '../../../utils/zurichTime.js';
import { emettreBonCadeau } from '../../../services/caisseBonsCadeauxService.js';
import {
  MONTANTS_RAPIDES, VALIDITES, VALIDITE_DEFAUT, dateCH, montantValide, telephoneValide, validiteDepuis,
} from './codeBon.js';
import QrBon from './QrBon.jsx';
import { envoyerSms, imprimerBon, partagerBon, peutPartagerFichier } from './actionsBon.js';

// ─────────────────────────────────────────────────────────────────────────────
// Vendre un bon cadeau sur mesure : le montant (raccourcis ou montant libre),
// le nom et le téléphone de la personne, un mot facultatif, la validité. Un
// tap sur le moyen de paiement encaisse et crée le bon (RPC
// caisse_bon_cadeau_emettre) ; l'écran montre alors le QR et le code, prêts à
// imprimer, partager ou envoyer par SMS.
// La vente d'un bon n'est pas une vente de la carte : pas de ticket numéroté,
// pas de TVA. Elle compte dans la clôture du jour, à part.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function FenetreNouveauBon({ etablissementId, reglages, maison, onClose, onCree }) {
  const [rapide, setRapide] = React.useState(50);
  const [libre, setLibre] = React.useState('');
  const [nom, setNom] = React.useState('');
  const [tel, setTel] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [validite, setValidite] = React.useState(VALIDITE_DEFAUT);
  const [essai, setEssai] = React.useState(false); // les erreurs ne s'affichent qu'après un premier essai
  const [enCours, setEnCours] = React.useState(false);
  const [cree, setCree] = React.useState(null);
  const verrou = React.useRef(false);

  const montant = libre !== '' ? montantValide(libre) : rapide;
  const nomOk = nom.trim().length > 0 && nom.trim().length <= 80;
  const telOk = telephoneValide(tel);
  const pret = montant != null && nomOk && telOk && message.length <= 160;
  const aujourdhui = zurichToday();
  const jusquau = validiteDepuis(aujourdhui, validite);
  const moyens = reglages?.moyens_paiement || [];
  const perso = Boolean(reglages?.perso?.moyens_paiement);

  async function encaisser(m) {
    setEssai(true);
    if (!pret || verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    try {
      const { data, error } = await emettreBonCadeau({
        etablissementId,
        montant,
        nom: nom.trim(),
        telephone: tel.trim(),
        moyen: m.cle,
        libelle: perso ? m.libelle : null,
        valableJusquAu: jusquau,
        message: message.trim() || null,
      });
      if (error) { notify(error, 'error'); return; }
      setCree(data);
      onCree?.(data);
      notify('Bon cadeau créé', 'success');
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  if (cree) {
    return (
      <Fenetre id="caisse-bon-cree" titre="Bon cadeau créé" onClose={onClose} largeur={460}
        pied={(
          <>
            <Btn variant="ghost" onClick={onClose} style={s.btn}>Terminer</Btn>
            <Btn variant="primary" onClick={() => imprimerBon(cree, maison)} style={s.btn}>Imprimer le bon</Btn>
          </>
        )}
      >
        <div style={s.carteBon} data-cadre="" data-bon-cree={cree.code}>
          <QrBon code={cree.code} taille={156} />
          <div style={s.infosBon}>
            <span style={s.libelle}>Code du bon</span>
            <span style={s.code} data-no-translate>{cree.code}</span>
            <span style={s.montant}><span>{chf(cree.montant_initial)}</span> <span style={s.devise}>CHF</span></span>
            <span style={s.detail}><span>pour</span> <span data-no-translate>{cree.nom}</span></span>
            <span style={s.detail}>{cree.valable_jusqu_au
              ? <><span>Valable jusqu'au</span> <span style={s.num}>{dateCH(cree.valable_jusqu_au)}</span></>
              : <span>Sans limite de validité</span>}</span>
          </div>
        </div>
        <div style={s.rang}>
          <Btn variant="ghost" onClick={() => envoyerSms(cree, maison)} style={s.btn}>Envoyer le code par SMS</Btn>
          {peutPartagerFichier() && <Btn variant="ghost" onClick={() => partagerBon(cree, maison)} style={s.btn}>Partager le PDF</Btn>}
        </div>
      </Fenetre>
    );
  }

  return (
    <Fenetre id="caisse-bon-nouveau" titre="Nouveau bon cadeau" onClose={onClose} largeur={520}>
      <div style={fst.section}>
        <span style={fst.sectionTitre}>Montant</span>
        <div style={s.pilules} role="group" aria-label="Montant du bon">
          {MONTANTS_RAPIDES.map((m) => (
            <Btn key={m} variant={libre === '' && rapide === m ? 'primary' : 'ghost'} onClick={() => { setRapide(m); setLibre(''); }} style={s.pilule}>
              <span style={s.num}>{m}</span>
            </Btn>
          ))}
        </div>
        <label style={s.champLabel}>
          <span style={fst.label}>Autre montant, en francs</span>
          <Input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="Par exemple 75" inputMode="decimal" style={s.champ} />
        </label>
        {essai && montant == null && <p style={s.erreur}>Montant de 0.05 à 5000 francs, au multiple de 5 centimes.</p>}
      </div>

      <div style={fst.section}>
        <span style={fst.sectionTitre}>Pour qui</span>
        <label style={s.champLabel}>
          <span style={fst.label}>Nom et prénom</span>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Marie Dupont" autoComplete="off" maxLength={80} style={s.champ} />
        </label>
        {essai && !nomOk && <p style={s.erreur}>Le nom est obligatoire.</p>}
        <label style={s.champLabel}>
          <span style={fst.label}>Téléphone</span>
          <Input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="079 123 45 67" type="tel" inputMode="tel" autoComplete="off" style={s.champ} />
        </label>
        {essai && !telOk && <p style={s.erreur}>Numéro de téléphone invalide.</p>}
        <p style={s.aide}>Le téléphone permet de retrouver le bon s'il est perdu. Il n'est pas imprimé.</p>
        <label style={s.champLabel}>
          <span style={fst.label}>Mot sur le bon, facultatif</span>
          <Input value={message} onChange={(e) => setMessage(e.target.value.slice(0, 160))} placeholder="Joyeux anniversaire" style={s.champ} />
        </label>
      </div>

      <div style={fst.section}>
        <span style={fst.sectionTitre}>Validité</span>
        <div style={s.pilules} role="group" aria-label="Validité du bon">
          {VALIDITES.map((v) => (
            <Btn key={v.id} variant={validite === v.id ? 'primary' : 'ghost'} onClick={() => setValidite(v.id)} style={s.pilule}>{v.label}</Btn>
          ))}
        </div>
        <p style={s.aide}>{jusquau
          ? <><span>Valable jusqu'au</span> <span style={s.num}>{dateCH(jusquau)}</span><span>.</span></>
          : <span>Le bon ne périme pas.</span>}</p>
      </div>

      <div style={fst.section} data-bon-moyens="">
        <span style={fst.sectionTitre}>Encaisser</span>
        <p style={s.aide}>
          {montant != null
            ? <><span>Le bon de</span> <span style={s.num}>{chf(montant)}</span> <span>CHF est créé dès que vous touchez le moyen de paiement.</span></>
            : <span>Choisissez d'abord le montant.</span>}
        </p>
        <div style={s.moyens}>
          {moyens.map((m, i) => (
            <Btn key={m.cle + i} variant="primary" disabled={enCours} onClick={() => encaisser(m)} style={s.moyen}>
              {perso ? <span data-no-translate>{m.libelle}</span> : m.libelle}
            </Btn>
          ))}
        </div>
      </div>
    </Fenetre>
  );
}

const s = {
  pilules: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pilule: { minHeight: 44, minWidth: 64 },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champ: { width: '100%', boxSizing: 'border-box' },
  aide: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  erreur: { margin: 0, fontSize: 'var(--t1)', color: 'var(--danger-text)', lineHeight: 1.45 },
  moyens: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 },
  moyen: { minHeight: 52, justifyContent: 'center' },
  btn: { minHeight: 44 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
  carteBon: { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderRadius: 'var(--r-lg)', background: 'var(--piste)' },
  infosBon: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 160px' },
  libelle: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  code: { fontFamily: 'var(--font-num)', fontSize: 'var(--t5)', letterSpacing: '0.06em', color: 'var(--text)' },
  montant: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t4)', color: 'var(--text)', marginTop: 6 },
  devise: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  detail: { fontSize: 'var(--t2)', color: 'var(--text2)' },
};
