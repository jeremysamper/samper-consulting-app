import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { pdfUtils } from '../../services/pdf.js';
import {
  REGLAGES_DEMANDES_QR_DEFAUT, ecrireReglagesDemandesQr, lireJetonsChambres, lireReglagesDemandesQr, preparerJetons, renouvelerJeton,
} from '../../services/demandesQrService.js';
import { trierChambres, useChambres } from '../hebergement/hotelData.js';
import QrLien from '../caisse/commandeQr/QrLien.jsx';
import { ChoixPilules, Ligne } from '../compte/sections/reglagesUi.jsx';

// Demande par le QR de la chambre (lot 17 du panel), bloc de Réglages,
// Demandes. La direction (consultant, patron : la base refuse les autres
// rôles) allume le service, choisit les demandes courantes ouvertes aux hôtes
// et imprime un QR par chambre. « Refaire le QR » remplace le jeton d'une
// chambre : l'ancien QR ne mène plus nulle part.
//
// Chaque geste écrit tout de suite ; une écriture refusée remet l'écran dans
// l'état d'avant et passe par notify. Numéros de chambre, nom de la maison et
// libellés sont des données : data-no-translate.

const ETATS = [{ id: 'on', label: 'Active' }, { id: 'off', label: 'Éteinte' }];
const cle = (t) => String(t ?? '').trim().toLowerCase();

export default function BlocDemandesQr({ etablissement, categories, categoriesReglees, enregistrerCategories }) {
  const etabId = etablissement?.id || null;
  const { rows: chambresBrutes, status: statutChambres } = useChambres(etabId);
  const chambres = React.useMemo(() => trierChambres(chambresBrutes.filter((c) => c.actif)), [chambresBrutes]);
  const [etat, setEtat] = React.useState('lecture'); // lecture | lue | echec
  const [reglages, setReglages] = React.useState(REGLAGES_DEMANDES_QR_DEFAUT);
  const [jetons, setJetons] = React.useState({});
  const [occupe, setOccupe] = React.useState(false);
  const [confirmer, setConfirmer] = React.useState(null);
  const preparation = React.useRef(false);

  const lire = React.useCallback(async () => {
    if (!etabId) return;
    setEtat('lecture');
    const [r, j] = await Promise.all([lireReglagesDemandesQr(etabId), lireJetonsChambres(etabId)]);
    if (r.error || j.error) { setEtat('echec'); return; }
    setReglages(r.data);
    setJetons(j.data);
    setEtat('lue');
  }, [etabId]);
  React.useEffect(() => { lire(); }, [lire]);

  // Une chambre active sans jeton en reçoit un (une fois par ouverture du bloc).
  const manquants = chambres.filter((c) => !jetons[c.id]).length;
  React.useEffect(() => {
    if (etat !== 'lue' || statutChambres !== 'ready' || manquants === 0 || preparation.current) return;
    preparation.current = true;
    (async () => {
      const { error } = await preparerJetons(etabId);
      if (error) { notify(error, 'error'); return; }
      const j = await lireJetonsChambres(etabId);
      if (!j.error) setJetons(j.data);
    })();
  }, [etat, statutChambres, manquants, etabId]);

  async function ecrire(partiel) {
    if (occupe) return false;
    const avant = reglages;
    const apres = { ...avant, ...partiel };
    setReglages(apres);
    setOccupe(true);
    try {
      const { data, error } = await ecrireReglagesDemandesQr(etabId, apres);
      if (error) { setReglages(avant); notify(error, 'error'); return false; }
      setReglages(data);
      return true;
    } finally {
      setOccupe(false);
    }
  }

  async function basculerLibelle(libelle) {
    if (occupe) return;
    // D7 : une maison qui n'a jamais réglé ses demandes courantes les écrit
    // d'abord telles qu'affichées ; le serveur ne lit que la base.
    if (!categoriesReglees) {
      const ok = await enregistrerCategories(categories);
      if (!ok) return;
    }
    const liste = reglages.libelles || [];
    const ouvert = liste.some((l) => cle(l) === cle(libelle));
    ecrire({ libelles: ouvert ? liste.filter((l) => cle(l) !== cle(libelle)) : [...liste, libelle] });
  }

  async function refaire(chambreId) {
    setConfirmer(null);
    setOccupe(true);
    const { error } = await renouvelerJeton(chambreId);
    if (error) { setOccupe(false); notify(error, 'error'); return; }
    const j = await lireJetonsChambres(etabId);
    setOccupe(false);
    if (j.error) { notify(j.error, 'error'); return; }
    setJetons(j.data);
    notify('Nouveau QR prêt. Imprimez-le pour remplacer l\'ancien.', 'success');
  }

  function imprimer() {
    pdfUtils.printElement('demandes-qr-affiches', 'QR des chambres', { noHeader: true });
  }

  if (!etabId) return null;
  if (etat === 'lecture') return <Ligne titre="Demandes par QR dans la chambre" aide="Chargement des réglages" />;
  if (etat === 'echec') {
    return (
      <Ligne titre="Demandes par QR dans la chambre" aide="Les réglages des QR ne se lisent pas.">
        <Btn variant="ghost" style={s.btn} onClick={lire}>Réessayer</Btn>
      </Ligne>
    );
  }

  const ouverts = new Set((reglages.libelles || []).map(cle));
  const origine = window.location.origin;
  const aImprimer = chambres.filter((c) => jetons[c.id]);

  return (
    <>
      <Ligne titre="Demandes par QR dans la chambre" aide="Les hôtes scannent le QR de leur chambre et envoient une demande sans compte. Elle arrive ici, au bon pôle, avec sa priorité et son échéance.">
        <ChoixPilules
          label="Demandes par QR dans la chambre"
          valeur={reglages.actif ? 'on' : 'off'}
          options={ETATS}
          onChange={(v) => ecrire({ actif: v === 'on' })}
        />
      </Ligne>
      <Ligne colonne titre="Demandes ouvertes aux hôtes" aide="Touchez une demande courante pour l'ouvrir aux hôtes, ou pour la fermer. Les autres restent réservées à l'équipe.">
        <div style={s.pilules} role="group" aria-label="Demandes ouvertes aux hôtes">
          {categories.map((c) => {
            const choisie = ouverts.has(cle(c.libelle));
            return (
              <button
                key={c.libelle}
                type="button"
                aria-pressed={choisie}
                disabled={occupe}
                onClick={() => basculerLibelle(c.libelle)}
                style={{ ...s.pilule, ...(choisie ? s.piluleChoisie : null) }}
                data-no-translate=""
              >
                {c.libelle}
              </button>
            );
          })}
        </div>
        {reglages.actif && ouverts.size === 0 && (
          <p style={s.note}>Aucune demande n'est encore ouverte : les QR invitent à appeler la réception.</p>
        )}
        {!reglages.actif && <p style={s.aide}>Tant que le service est éteint, les QR invitent à appeler la réception.</p>}
      </Ligne>
      <Ligne colonne titre="QR des chambres" aide="Un QR par chambre active, à poser dans la chambre.">
        {chambres.length === 0 ? (
          <p style={s.aide}>Aucune chambre active. Les chambres se règlent dans Hébergement.</p>
        ) : (
          <>
            <div>
              <Btn variant="primary" style={s.btn} disabled={aImprimer.length === 0} onClick={imprimer}>Imprimer les QR</Btn>
            </div>
            <div style={s.liste}>
              {chambres.map((c) => (
                <div key={c.id} style={s.ligne}>
                  <span style={s.numero}><span>Chambre</span> <span data-no-translate="">{c.numero}</span></span>
                  {confirmer === c.id ? (
                    <span style={s.rang}>
                      <Btn variant="danger" style={s.btn} disabled={occupe} onClick={() => refaire(c.id)}>Confirmer</Btn>
                      <Btn variant="ghost" style={s.btn} onClick={() => setConfirmer(null)}>Garder ce QR</Btn>
                    </span>
                  ) : (
                    <Btn variant="ghost" style={s.btn} disabled={occupe || !jetons[c.id]} onClick={() => setConfirmer(c.id)}>Refaire le QR</Btn>
                  )}
                </div>
              ))}
            </div>
            {confirmer && <p style={s.note}>L'ancien QR de cette chambre ne marchera plus : il faudra le remplacer.</p>}
            <div id="demandes-qr-affiches" style={s.grille}>
              {aImprimer.map((c) => (
                <section key={c.id} data-cadre="" style={s.carte} data-chambre-qr={c.numero}>
                  <p style={s.carteNom} data-no-translate="">{etablissement?.nom}</p>
                  <p style={s.carteChambre}><span>Chambre</span> <span data-no-translate="">{c.numero}</span></p>
                  <QrLien texte={`${origine}/chambre/${jetons[c.id]}`} taille={150} label="QR de la chambre" />
                  <p style={s.carteTexte}>Scannez pour demander quelque chose à l'équipe.</p>
                  <p style={s.carteAutre} lang="en" data-no-translate="">Scan to ask the team for anything.</p>
                  <p style={s.carteAutre} lang="de" data-no-translate="">Scannen Sie, um das Team um etwas zu bitten.</p>
                </section>
              ))}
            </div>
          </>
        )}
      </Ligne>
    </>
  );
}

const s = {
  btn: { minHeight: 44, flexShrink: 0 },
  aide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  note: {
    margin: 0, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--warning-bg-soft)',
    color: 'var(--warning-text)', fontSize: 'var(--t2)',
  },
  pilules: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  pilule: {
    minHeight: 44, padding: '0 16px', borderRadius: 'var(--r-full)', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)',
    fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)',
  },
  piluleChoisie: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  liste: { display: 'flex', flexDirection: 'column' },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minHeight: 'var(--ligne)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', padding: '4px 0',
  },
  numero: { fontSize: 'var(--t2)', color: 'var(--text)', fontWeight: 'var(--g2)' },
  rang: { display: 'inline-flex', flexWrap: 'wrap', gap: 8 },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 8 },
  carte: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 14px',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', breakInside: 'avoid', pageBreakInside: 'avoid', minWidth: 0,
  },
  carteNom: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', textAlign: 'center', overflowWrap: 'anywhere' },
  carteChambre: { margin: 0, fontSize: 'var(--t4)', fontWeight: 'var(--g2)', color: 'var(--text)', textAlign: 'center' },
  carteTexte: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text)', textAlign: 'center' },
  carteAutre: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', textAlign: 'center' },
};
