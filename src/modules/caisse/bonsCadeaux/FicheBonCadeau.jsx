import React from 'react';
import { Btn, Input, ligneStyle } from '../../../components/ui/index.jsx';
import { BoutonActions, Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { notify } from '../../../components/toast/index.js';
import { zurichDateHeure, zurichToday } from '../../../utils/zurichTime.js';
import { annulerBonCadeau, listMouvementsBon, prolongerBonCadeau } from '../../../services/caisseBonsCadeauxService.js';
import { LIBELLES_ETAT, LIBELLES_MOUVEMENT, VALIDITES, dateCH, etatBon, validiteDepuis } from './codeBon.js';
import { numeroTicket } from '../tva.js';
import QrBon from './QrBon.jsx';
import { envoyerSms, imprimerBon, partagerBon, peutPartagerFichier } from './actionsBon.js';

// ─────────────────────────────────────────────────────────────────────────────
// La fiche d'un bon : QR et code, solde, la personne, la validité, et tout son
// registre (vendu, dépensé sur tel ticket, rendu au bon, validité changée).
// Imprimer et envoyer le code : tout rôle qui a la caisse. Changer la validité
// et annuler un bon jamais utilisé (l'argent rendu s'inscrit à la clôture) :
// consultant et patron, comme la base.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const TONS = {
  actif: { fond: 'var(--success-bg-soft)', encre: 'var(--success-text)' },
  epuise: { fond: 'var(--piste)', encre: 'var(--text2)' },
  annule: { fond: 'var(--danger-bg-soft)', encre: 'var(--danger-text)' },
  echu: { fond: 'var(--warning-bg-soft)', encre: 'var(--warning-text)' },
};

export function PastilleEtat({ etat }) {
  const t = TONS[etat] || TONS.epuise;
  return <span style={{ ...s.pastille, background: t.fond, color: t.encre }} data-etat-bon={etat}>{LIBELLES_ETAT[etat]}</span>;
}

export default function FicheBonCadeau({ bon: bonInitial, reglages, maison, peutGerer = false, onClose, onChange }) {
  const [bon, setBon] = React.useState(bonInitial);
  const [mouvements, setMouvements] = React.useState(null);
  const [erreurLecture, setErreurLecture] = React.useState(null);
  const [mode, setMode] = React.useState('fiche'); // fiche | annuler | validite
  const [motif, setMotif] = React.useState('');
  const [moyenRendu, setMoyenRendu] = React.useState(null);
  const [validite, setValidite] = React.useState('24');
  const [enCours, setEnCours] = React.useState(false);
  const aujourdhui = zurichToday();
  const etat = etatBon(bon, aujourdhui);

  const charger = React.useCallback(async () => {
    const { data, error } = await listMouvementsBon(bon.id);
    if (error) { setErreurLecture(error); return; }
    setErreurLecture(null);
    setMouvements(data);
  }, [bon.id]);
  React.useEffect(() => { charger(); }, [charger]);

  const vente = (mouvements || []).find((m) => m.genre === 'emission');
  const jamaisUtilise = mouvements != null && !mouvements.some((m) => m.genre === 'utilisation')
    && Number(bon.solde) === Number(bon.montant_initial);
  const peutAnnuler = peutGerer && bon.statut === 'actif' && jamaisUtilise;
  const peutProlonger = peutGerer && bon.statut === 'actif';
  const moyens = reglages?.moyens_paiement || [];
  const perso = Boolean(reglages?.perso?.moyens_paiement);

  function majBon(data) {
    setBon(data);
    onChange?.(data);
    setMode('fiche');
    charger();
  }

  async function annuler() {
    if (motif.trim().length < 3 || enCours) return;
    setEnCours(true);
    try {
      const m = moyenRendu;
      const { data, error } = await annulerBonCadeau({
        bonId: bon.id, motif: motif.trim(), moyen: m ? m.cle : null, libelle: m && perso ? m.libelle : null,
      });
      if (error) { notify(error, 'error'); return; }
      notify("Bon annulé : l'argent rendu compte dans la clôture du jour", 'success');
      majBon(data);
    } finally {
      setEnCours(false);
    }
  }

  async function changerValidite() {
    if (enCours) return;
    setEnCours(true);
    try {
      const { data, error } = await prolongerBonCadeau(bon.id, validiteDepuis(aujourdhui, validite));
      if (error) { notify(error, 'error'); return; }
      notify('Validité changée', 'success');
      majBon(data);
    } finally {
      setEnCours(false);
    }
  }

  const actionsPlus = [
    bon.statut === 'actif' && peutPartagerFichier() && { titre: 'Partager le PDF', detail: 'Messages, WhatsApp, e-mail', onClick: () => partagerBon(bon, maison) },
    peutProlonger && { titre: 'Changer la validité', onClick: () => setMode('validite') },
    peutAnnuler && { titre: "Annuler le bon et rendre l'argent", detail: "Seulement un bon qui n'a jamais servi", danger: true, onClick: () => setMode('annuler') },
  ].filter(Boolean);

  return (
    <Fenetre
      id="caisse-bon-fiche"
      titre="Bon cadeau"
      onClose={onClose}
      largeur={520}
      pied={mode === 'fiche' ? (
        <>
          {actionsPlus.length > 0 && <BoutonActions id="caisse-bon-plus" label="Plus" style={fst.secondaire} titre="Bon cadeau" sections={[{ items: actionsPlus }]} />}
          {/* Un bon annulé ou épuisé ne se réimprime pas et ne s'envoie plus :
              il ne vaut plus rien à la caisse. */}
          {bon.statut === 'actif' && <Btn variant="ghost" onClick={() => envoyerSms(bon, maison)} style={s.btn}>Envoyer le code par SMS</Btn>}
          {bon.statut === 'actif' && <Btn variant="primary" onClick={() => imprimerBon(bon, maison)} style={s.btn}>Imprimer le bon</Btn>}
        </>
      ) : null}
    >
      <div style={s.carteBon} data-cadre="" data-fiche-bon={bon.code}>
        <QrBon code={bon.code} taille={132} />
        <div style={s.infos}>
          <span style={s.codeLigne}><span style={s.code} data-no-translate>{bon.code}</span> <PastilleEtat etat={etat} /></span>
          <span style={s.libelle}>Solde</span>
          <span style={s.solde}><span>{chf(bon.solde)}</span> <span style={s.devise}>CHF</span></span>
          <span style={s.detail}><span>sur</span> <span style={s.num}>{chf(bon.montant_initial)}</span> <span>CHF au départ</span></span>
        </div>
      </div>

      <div style={s.grille}>
        <span style={s.cle}>Pour</span><span data-no-translate>{bon.nom}</span>
        <span style={s.cle}>Téléphone</span>
        <a href={`tel:${String(bon.telephone).replace(/[^0-9+]/g, '')}`} style={s.lien} data-no-translate>{bon.telephone}</a>
        {bon.message && <><span style={s.cle}>Mot</span><span data-no-translate>{bon.message}</span></>}
        <span style={s.cle}>Validité</span>
        <span>{bon.valable_jusqu_au
          ? <><span>jusqu'au</span> <span style={s.num}>{dateCH(bon.valable_jusqu_au)}</span></>
          : <span>sans limite</span>}</span>
        <span style={s.cle}>Vendu le</span>
        <span>
          <span style={s.num}>{zurichDateHeure(bon.emis_at).date}</span>
          {vente && <>{' '}<span>en</span> <span data-no-translate={vente.libelle ? '' : undefined}>{vente.libelle || libelleMoyen(vente.moyen)}</span></>}
        </span>
        {bon.statut === 'annule' && <><span style={s.cle}>Motif</span><span data-no-translate>{bon.annule_motif}</span></>}
      </div>

      {mode === 'annuler' && (
        <div style={s.sousBloc} data-cadre="" data-bon-annuler="">
          <span style={fst.sectionTitre}>Annuler et rendre l'argent</span>
          <p style={s.aide}><span>La personne récupère</span> <span style={s.num}>{chf(bon.montant_initial)}</span> <span>CHF. Le rendu compte dans la clôture du jour.</span></p>
          <label style={s.champLabel}>
            <span style={fst.label}>Motif</span>
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Erreur de saisie" style={s.champ} />
          </label>
          <span style={fst.label}>Rendu en</span>
          <div style={s.pilules}>
            <Btn variant={moyenRendu == null ? 'primary' : 'ghost'} onClick={() => setMoyenRendu(null)} style={s.pilule}>Comme la vente</Btn>
            {moyens.map((m, i) => (
              <Btn key={m.cle + i} variant={moyenRendu === m ? 'primary' : 'ghost'} onClick={() => setMoyenRendu(m)} style={s.pilule}>
                {perso ? <span data-no-translate>{m.libelle}</span> : m.libelle}
              </Btn>
            ))}
          </div>
          <div style={s.rang}>
            <Btn variant="ghost" onClick={() => setMode('fiche')} style={s.btn}>Revenir</Btn>
            <Btn variant="danger" disabled={enCours || motif.trim().length < 3} onClick={annuler} style={s.btn}>Annuler le bon</Btn>
          </div>
        </div>
      )}

      {mode === 'validite' && (
        <div style={s.sousBloc} data-cadre="" data-bon-validite="">
          <span style={fst.sectionTitre}>Nouvelle validité, à partir d'aujourd'hui</span>
          <div style={s.pilules}>
            {VALIDITES.map((v) => (
              <Btn key={v.id} variant={validite === v.id ? 'primary' : 'ghost'} onClick={() => setValidite(v.id)} style={s.pilule}>{v.label}</Btn>
            ))}
          </div>
          <div style={s.rang}>
            <Btn variant="ghost" onClick={() => setMode('fiche')} style={s.btn}>Revenir</Btn>
            <Btn variant="primary" disabled={enCours} onClick={changerValidite} style={s.btn}>Enregistrer</Btn>
          </div>
        </div>
      )}

      <div style={fst.section}>
        <span style={fst.sectionTitre}>Registre du bon</span>
        {erreurLecture && <p style={s.erreur}>{erreurLecture}</p>}
        {mouvements == null && !erreurLecture && <p style={s.aide}>Lecture du registre.</p>}
        {mouvements != null && (
          <div>
            {mouvements.map((m, i) => (
              <div key={m.id} style={{ ...ligneStyle({ serree: true, derniere: i === mouvements.length - 1 }), justifyContent: 'space-between' }} data-mouvement-bon={m.genre}>
                <span style={s.mvtTexte}>
                  <span>{LIBELLES_MOUVEMENT[m.genre] || m.genre}</span>
                  <span style={s.mvtDetail}>
                    <span style={s.num}>{zurichDateHeure(m.created_at).date}</span>
                    {m.ticket?.numero != null && <>{', '}<span>ticket n°</span> <span style={s.num} data-no-translate>{numeroTicket(m.ticket)}</span></>}
                    {m.genre === 'prolongation' && m.detail && <>{', '}<span data-no-translate>{m.detail}</span></>}
                  </span>
                </span>
                {Number(m.montant) > 0 && (
                  <span style={s.num}>{m.genre === 'utilisation' ? '-' : ''}{chf(m.montant)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Fenetre>
  );
}

function libelleMoyen(moyen) {
  return { especes: 'espèces', carte: 'carte', autre: 'autre moyen' }[moyen] || moyen;
}

const s = {
  btn: { minHeight: 44 },
  carteBon: { display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', padding: 16, borderRadius: 'var(--r-lg)', background: 'var(--piste)' },
  infos: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 160px' },
  codeLigne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  code: { fontFamily: 'var(--font-num)', fontSize: 'var(--t4)', letterSpacing: '0.06em', color: 'var(--text)' },
  libelle: { fontSize: 'var(--t1)', color: 'var(--text3)', marginTop: 6 },
  solde: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t6)', color: 'var(--text)', lineHeight: 1.1 },
  devise: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  detail: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  pastille: { display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 10px', borderRadius: 'var(--r-full)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)' },
  grille: { display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr', columnGap: 14, rowGap: 8, fontSize: 'var(--t2)', color: 'var(--text)', alignItems: 'baseline' },
  cle: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  lien: { color: 'var(--lien)', textDecoration: 'none', fontWeight: 'var(--g1)', fontFamily: 'var(--font-num)' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
  sousBloc: { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', background: 'var(--surface)' },
  aide: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  erreur: { margin: 0, fontSize: 'var(--t1)', color: 'var(--danger-text)', lineHeight: 1.45 },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champ: { width: '100%', boxSizing: 'border-box' },
  pilules: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pilule: { minHeight: 44 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  mvtTexte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, padding: '6px 0' },
  mvtDetail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
};
