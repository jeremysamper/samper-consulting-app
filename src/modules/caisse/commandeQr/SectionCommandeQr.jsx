import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';
import { pdfUtils } from '../../../services/pdf.js';
import { REGLAGES_QR_DEFAUT, ecrireReglagesQr, lireReglagesQr } from '../../../services/commandeQrService.js';
import { PLAGES_MAX, aleaSlug, estAdresseDemo, plageValide, slugDepuisNom } from '../../../commande/regles.js';
import { estDirection } from '../../comptabilite/gardesCompta.js';
import QrLien from './QrLien.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la caisse, onglet « Commande par QR » (lot L3, 22.11.2026).
//
// La direction (consultant, patron : la base refuse les autres rôles) y règle
// la commande de boissons par QR : active ou non, les catégories de caisse
// ouvertes au QR, les plages horaires (heure de Zurich, tous les jours), et le
// QR fixe de l'établissement, à afficher ou imprimer. Les autres rôles qui
// ouvrent les réglages de la caisse voient l'état sans pouvoir le changer.
//
// Chaque geste écrit tout de suite ; une écriture refusée remet l'écran dans
// l'état d'avant. L'adresse /commande/<adresse> se crée à la première mise en
// route, tirée du nom de la maison et d'un suffixe au hasard. « Changer
// l'adresse » en tire une autre : les QR déjà imprimés ne marchent plus.
// Les noms de catégories et l'adresse sont des données : data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

// « 17 h 00 » : l'heure d'une plage, dans son propre nœud.
const heureLisible = (hhmm) => `${Number(String(hhmm).slice(0, 2))} h ${String(hhmm).slice(3, 5)}`;

export default function SectionCommandeQr({ etablissementId, nomEtablissement, categories = [], role }) {
  const peutEcrire = estDirection(role);
  const [etat, setEtat] = React.useState('lecture'); // lecture | lue | echec
  const [reglages, setReglages] = React.useState(REGLAGES_QR_DEFAUT);
  const [occupe, setOccupe] = React.useState(false);
  const [changerAdresse, setChangerAdresse] = React.useState(false);

  const lire = React.useCallback(async () => {
    if (!etablissementId) return;
    setEtat('lecture');
    const { data, error } = await lireReglagesQr(etablissementId);
    if (error) { setEtat('echec'); return; }
    setReglages(data);
    setEtat('lue');
  }, [etablissementId]);
  React.useEffect(() => { lire(); }, [lire]);

  const maison = React.useMemo(
    () => [...(categories || [])].sort((a, b) => (a.ordre - b.ordre) || String(a.nom).localeCompare(String(b.nom))),
    [categories],
  );

  async function ecrire(partiel, { tentatives = 2 } = {}) {
    if (!peutEcrire || occupe) return false;
    const avant = reglages;
    const apres = { ...avant, ...partiel };
    setReglages(apres);
    setOccupe(true);
    try {
      const { data, error, code } = await ecrireReglagesQr(etablissementId, apres);
      if (error) {
        // Adresse déjà prise (très rare) : on en tire une autre.
        if (code === '23505' && partiel.slug && tentatives > 0) {
          setOccupe(false);
          return ecrire({ ...partiel, slug: slugDepuisNom(nomEtablissement, aleaSlug()) }, { tentatives: tentatives - 1 });
        }
        setReglages(avant);
        notify(error, 'error');
        return false;
      }
      setReglages({ ...REGLAGES_QR_DEFAUT, ...data });
      return true;
    } finally {
      setOccupe(false);
    }
  }

  function basculerActif(actif) {
    if (actif && !reglages.slug) return ecrire({ actif, slug: slugDepuisNom(nomEtablissement, aleaSlug()) });
    return ecrire({ actif });
  }

  function basculerCategorie(id) {
    const liste = reglages.categories || [];
    ecrire({ categories: liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id] });
  }

  const [nouvelle, setNouvelle] = React.useState({ de: '17:00', a: '23:00' });
  function ajouterPlage() {
    if (!plageValide(nouvelle)) { notify("Le début et la fin d'une plage doivent différer.", 'warning'); return; }
    ecrire({ plages: [...(reglages.plages || []), { ...nouvelle }] });
  }
  function retirerPlage(i) {
    ecrire({ plages: (reglages.plages || []).filter((_, j) => j !== i) });
  }

  const adresse = reglages.slug ? `${window.location.origin}/commande/${reglages.slug}` : null;
  // Démo publique : l'adresse « demo » mène à la carte de la démo, sans base ;
  // elle ne se change pas.
  const adresseDemo = estAdresseDemo(reglages.slug);

  async function copier() {
    try {
      await navigator.clipboard.writeText(adresse);
      notify('Adresse copiée', 'success');
    } catch {
      notify("La copie n'a pas abouti : sélectionnez l'adresse à la main.", 'warning');
    }
  }

  function imprimer() {
    pdfUtils.printElement('commande-qr-affiche', 'QR de commande', { noHeader: true });
  }

  if (etat === 'lecture') return <p style={s.aide}>Chargement des réglages du QR...</p>;
  if (etat === 'echec') {
    return (
      <div style={s.bloc}>
        <p style={s.aide}>Les réglages du QR ne se lisent pas.</p>
        <Btn onClick={lire} style={s.btn}>Réessayer</Btn>
      </div>
    );
  }

  const ouvertes = new Set(reglages.categories || []);
  return (
    <div style={s.bloc} data-reglages-commande-qr="">
      <p style={s.intro}>
        Les clients scannent le QR de l'établissement, choisissent leurs boissons et envoient la commande depuis leur téléphone. Elle arrive en caisse à valider : le bar l'accepte, ou la refuse avec un motif. Le client paie à table ou au comptoir.
      </p>
      {!peutEcrire && <p style={s.note}>Seule la direction modifie ces réglages.</p>}

      <div style={s.sousTitre}>Commande par QR</div>
      <div style={s.rang}>
        <Btn variant={reglages.actif ? 'primary' : 'ghost'} onClick={() => basculerActif(true)} disabled={!peutEcrire || occupe} style={s.btn}>Active</Btn>
        <Btn variant={!reglages.actif ? 'primary' : 'ghost'} onClick={() => basculerActif(false)} disabled={!peutEcrire || occupe} style={s.btn}>Éteinte</Btn>
      </div>

      <div style={s.sousTitre}>Catégories ouvertes au QR</div>
      {maison.length === 0 ? (
        <p style={s.aide}>Créez d'abord les catégories de la caisse (onglet Catégories), puis ouvrez ici les boissons.</p>
      ) : (
        <>
          <div style={s.rang} role="group" aria-label="Catégories ouvertes au QR">
            {maison.map((c) => (
              <Btn
                key={c.id}
                variant={ouvertes.has(c.id) ? 'primary' : 'ghost'}
                onClick={() => basculerCategorie(c.id)}
                disabled={!peutEcrire || occupe}
                style={s.btn}
              >
                <span data-no-translate="">{c.nom}</span>
              </Btn>
            ))}
          </div>
          <p style={s.aide}>Les produits en rupture du jour et les produits épuisés ne sont pas proposés. Ouvrez les boissons et les alcools, jamais les plats.</p>
        </>
      )}

      <div style={s.sousTitre}>Heures d'ouverture</div>
      {(reglages.plages || []).length === 0 ? (
        <p style={s.aide}>À toute heure, tant que la commande par QR est active.</p>
      ) : (
        <ul style={s.plages}>
          {reglages.plages.map((p, i) => (
            <li key={`${p.de}-${p.a}-${i}`} style={s.plage}>
              <span>
                <span>de</span> <span style={s.num} data-no-translate="">{heureLisible(p.de)}</span>{' '}
                <span>à</span> <span style={s.num} data-no-translate="">{heureLisible(p.a)}</span>
              </span>
              {peutEcrire && <Btn onClick={() => retirerPlage(i)} disabled={occupe} style={s.btn}>Retirer</Btn>}
            </li>
          ))}
        </ul>
      )}
      {peutEcrire && (reglages.plages || []).length < PLAGES_MAX && (
        <div style={s.rang}>
          <label style={s.heure}>
            <span>De</span>
            <input type="time" value={nouvelle.de} onChange={(e) => setNouvelle((n) => ({ ...n, de: e.target.value }))} style={s.champ} />
          </label>
          <label style={s.heure}>
            <span>à</span>
            <input type="time" value={nouvelle.a} onChange={(e) => setNouvelle((n) => ({ ...n, a: e.target.value }))} style={s.champ} />
          </label>
          <Btn onClick={ajouterPlage} disabled={occupe} style={s.btn}>Ajouter une plage</Btn>
        </div>
      )}
      <p style={s.aide}>Chaque jour, heure de Zurich. Une plage peut passer minuit, de 18 h à 1 h par exemple.</p>

      <div style={s.sousTitre}>QR de l'établissement</div>
      {adresse ? (
        <>
          <section id="commande-qr-affiche" data-cadre="" style={s.affiche}>
            <p style={s.afficheNom} data-no-translate="">{nomEtablissement}</p>
            <QrLien texte={adresse} label="QR de commande" />
            <p style={s.afficheTexte}>Scannez pour commander vos boissons</p>
            <p style={s.adresse} data-no-translate="">{adresse}</p>
          </section>
          <div style={s.rang}>
            <Btn onClick={imprimer} style={s.btn}>Imprimer le QR</Btn>
            <Btn onClick={copier} style={s.btn}>Copier l'adresse</Btn>
            {peutEcrire && !adresseDemo && (
              changerAdresse ? (
                <>
                  <Btn
                    variant="danger"
                    onClick={async () => { setChangerAdresse(false); await ecrire({ slug: slugDepuisNom(nomEtablissement, aleaSlug()) }); }}
                    disabled={occupe}
                    style={s.btn}
                  >
                    Confirmer le changement
                  </Btn>
                  <Btn onClick={() => setChangerAdresse(false)} style={s.btn}>Garder l'adresse</Btn>
                </>
              ) : (
                <Btn onClick={() => setChangerAdresse(true)} disabled={occupe} style={s.btn}>Changer l'adresse</Btn>
              )
            )}
          </div>
          {changerAdresse && <p style={s.note}>Les QR déjà imprimés ne marcheront plus : il faudra les remplacer.</p>}
          {!reglages.actif && <p style={s.aide}>Tant que la commande est éteinte, le QR mène à une page qui invite à commander auprès du personnel.</p>}
        </>
      ) : (
        <p style={s.aide}>Le QR apparaît à la première mise en route de la commande.</p>
      )}
    </div>
  );
}

const s = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  intro: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', maxWidth: 720 },
  note: {
    margin: 0, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--warning-bg-soft)',
    color: 'var(--warning-text)', fontSize: 'var(--t2)',
  },
  sousTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginTop: 12 },
  rang: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  btn: { minHeight: 44, flexShrink: 0 },
  aide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  plages: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  plage: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 'var(--ligne)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', maxWidth: 480,
  },
  num: { fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' },
  heure: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--t2)', color: 'var(--text2)' },
  champ: {
    minHeight: 44, minWidth: 120, padding: '0 10px', borderRadius: 'var(--r)', boxSizing: 'border-box',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', background: 'var(--surface)',
    color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)',
  },
  affiche: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 24px',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', width: 'fit-content', maxWidth: '100%', boxSizing: 'border-box',
  },
  afficheNom: { margin: 0, fontSize: 'var(--t4)', fontWeight: 'var(--g2)', color: 'var(--text)', textAlign: 'center' },
  afficheTexte: { margin: 0, fontSize: 'var(--t3)', color: 'var(--text)', textAlign: 'center' },
  adresse: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', textAlign: 'center', overflowWrap: 'anywhere' },
};
