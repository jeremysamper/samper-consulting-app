import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { getPermissionsForRole } from '../../data/demoData.js';
import { confirmLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { ouvrirCompte } from '../../services/navigationService.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { etabToggleableModules, isModuleActiveForEtab, isPageActiveForEtab, navItems } from '../moduleConfig.js';
import { EVENEMENT_DEMARRAGE } from './CarteDemarrage.jsx';
import { lireMiseEnRoute, marquerEtapes } from './demarrageService.js';
import { chargerExemple, effacerExemple, telechargerModele } from './exempleService.js';

// L'importeur de recettes lit aussi les photos par l'IA : réservé au
// consultant, comme dans les Outils consultant où il vit.
const ImportLauncher = React.lazy(() => import('../recettes/import/ImportLauncher.jsx'));

// ─────────────────────────────────────────────────────────────────────────────
// Page « Mise en route » (hors menu, consultant et patron) : cinq étapes, une
// action en deux gestes au plus pour chacune. On y arrive par la carte du
// tableau de bord. Les étapes 2 à 4 se constatent dans les données
// (demarrageService) ; l'étape 1 se confirme ; « Terminer la mise en route »
// écrit la ligne « termine » à tout moment.
//
// Le type d'établissement, les modules et l'équipe restent dans les mains du
// consultant (Compte, Paramètres) tant que le patron n'y a pas accès.
// ─────────────────────────────────────────────────────────────────────────────

export default function Demarrage({ user, etablissement, setPage }) {
  const etabId = etablissement?.id || null;
  const consultant = user?.role === 'consultant';
  const perms = getPermissionsForRole(user?.role);
  const [etat, setEtat] = React.useState({ status: 'loading' });
  const [enCours, setEnCours] = React.useState(null);
  const [importOuvert, setImportOuvert] = React.useState(false);

  const relire = React.useCallback(async () => {
    if (!etabId) return;
    try {
      const e = await lireMiseEnRoute(etabId);
      setEtat({ status: 'ready', etabId, ...e });
    } catch (err) {
      setEtat((prec) => ({ ...prec, status: 'error', erreur: messageErreur(err, 'mise en route', "La mise en route n'a pas pu être lue.") }));
    }
  }, [etabId]);

  React.useEffect(() => { setEtat({ status: 'loading' }); relire(); }, [relire]);

  const signaler = () => window.dispatchEvent(new CustomEvent(EVENEMENT_DEMARRAGE));

  const agir = async (cle, action) => {
    setEnCours(cle);
    try {
      await action();
      await relire();
      signaler();
    } catch (err) {
      notify(messageErreur(err, 'mise en route'), 'error');
    } finally {
      setEnCours(null);
    }
  };

  const peutOuvrir = (page) => {
    if (typeof setPage !== 'function' || !isPageActiveForEtab(etablissement, page)) return false;
    const permKey = navItems.find((item) => item.id === page)?.permKey || page;
    return perms[permKey] !== false;
  };

  const terminer = () => {
    if (etat.registre?.length && !confirmLegacy("L'exemple restera chargé et la mise en route ne sera plus proposée. Terminer quand même ?")) return;
    agir('termine', async () => {
      await marquerEtapes(etabId, ['termine']);
      if (typeof setPage === 'function') setPage('dashboard');
    });
  };

  const modele = (nom) => {
    telechargerModele(nom).catch((err) => notify(messageErreur(err, 'modèle Excel'), 'error'));
  };

  const charger = () => agir('exemple', async () => {
    const { echecs } = await chargerExemple(etabId);
    notify(echecs ? "Une partie de l'exemple n'a pas été chargée. Réessayez." : "L'exemple est chargé.", echecs ? 'warning' : 'success');
  });

  const effacer = () => {
    if (!confirmLegacy("Effacer les recettes, la carte et les produits d'exemple ? Ce que vous avez saisi reste en place.")) return;
    agir('exemple', async () => {
      const { restes } = await effacerExemple(etabId);
      notify(restes ? "Une partie de l'exemple est utilisée ailleurs et reste en place." : "L'exemple est effacé.", restes ? 'warning' : 'success');
    });
  };

  const pret = etat.status === 'ready' || (etat.status === 'error' && etat.faites);
  const faites = etat.faites || new Set();
  const modules = etabToggleableModules.filter((item) => isModuleActiveForEtab(etablissement, item.permKey));

  return (
    <div style={s.page}>
      <header>
        <div style={s.numero} data-no-translate>{etablissement?.nom || ''}</div>
        <h2 style={s.titre}>Mise en route</h2>
        <p style={s.intro}>Cinq étapes pour que l'équipe trouve l'app prête. Chacune se fait en un ou deux gestes.</p>
      </header>

      {etat.status === 'loading' && <p style={s.info} aria-live="polite">Chargement de la mise en route…</p>}
      {etat.status === 'error' && (
        <div style={s.erreur} role="alert">
          <span>{etat.erreur}</span>
          <Btn small onClick={relire}>Réessayer</Btn>
        </div>
      )}

      {pret && etat.termine && (
        <div style={s.termine}>
          <span>La mise en route de cet établissement est terminée.</span>
          {typeof setPage === 'function' && <Btn small onClick={() => setPage('dashboard')}>Tableau de bord</Btn>}
        </div>
      )}

      {pret && (
        <ol style={s.liste}>
          <Etape numero={1} titre="Établissement" fait={faites.has('etablissement')}>
            <p style={s.texte}>
              Type : <span>{etablissement?.type || 'non renseigné'}</span>.
              {' '}Modules actifs :{' '}
              {modules.map((item, i) => (
                <React.Fragment key={item.id}>{i ? ', ' : ''}<span>{item.label}</span></React.Fragment>
              ))}
              .
            </p>
            {!consultant && <p style={s.texte}>Réglé par votre consultant.</p>}
            <div style={s.actions}>
              {consultant && <Btn onClick={() => ouvrirCompte('parametres')}>Ouvrir les paramètres</Btn>}
              {!faites.has('etablissement') && (
                <Btn variant="primary" disabled={enCours === 'etablissement'} onClick={() => agir('etablissement', () => marquerEtapes(etabId, ['etablissement']))}>
                  C'est bon
                </Btn>
              )}
            </div>
          </Etape>

          <Etape numero={2} titre="Recettes" fait={faites.has('recettes')}>
            <p style={s.texte}>Une fiche suffit pour cocher l'étape.</p>
            <p style={s.texte}>
              {consultant
                ? 'Le modèle Excel se réimporte tel quel par « Importer des recettes ».'
                : 'Remplissez le modèle Excel et confiez-le à votre consultant pour l\'import, ou écrivez vos fiches dans Cartes & Recettes.'}
            </p>
            <div style={s.actions}>
              {consultant && <Btn variant="primary" onClick={() => setImportOuvert(true)}>Importer des recettes</Btn>}
              {peutOuvrir('cartes') && <Btn onClick={() => setPage('cartes')}>Ouvrir Cartes & Recettes</Btn>}
              <Btn onClick={() => modele('modele-recettes.xlsx')}>Modèle Excel des recettes</Btn>
            </div>
          </Etape>

          <Etape numero={3} titre="Catalogue" fait={faites.has('catalogue')}>
            <p style={s.texte}>Un produit suffit. Dans le catalogue : Importer, puis Fichier Excel, une ligne par produit.</p>
            <div style={s.actions}>
              {peutOuvrir('catalogue')
                ? <Btn onClick={() => setPage('catalogue')}>Ouvrir le catalogue</Btn>
                : <span style={s.texte}>Le catalogue n'est pas activé pour cet établissement.</span>}
              <Btn onClick={() => modele('modele-catalogue.xlsx')}>Modèle Excel du catalogue</Btn>
            </div>
          </Etape>

          <Etape numero={4} titre="Planning" fait={faites.has('planning')}>
            <p style={s.texte}>Un horaire suffit. Dans le planning : Faire le planning, puis la semaine suivante.</p>
            <div style={s.actions}>
              {peutOuvrir('planning')
                ? <Btn onClick={() => setPage('planning')}>Ouvrir le planning</Btn>
                : <span style={s.texte}>Le planning n'est pas activé pour cet établissement.</span>}
            </div>
          </Etape>

          <Etape numero={5} titre="Données d'exemple" fait={faites.has('exemple')} dernier>
            <p style={s.texte}>Douze recettes de bistrot, une carte et trente produits, pour voir l'app remplie. Un geste les efface, sans toucher à ce que vous avez saisi.</p>
            <div style={s.actions}>
              {etat.registre?.length
                ? <Btn variant="danger" disabled={enCours === 'exemple'} onClick={effacer}>Effacer l'exemple</Btn>
                : <Btn variant="primary" disabled={enCours === 'exemple'} onClick={charger}>Charger l'exemple</Btn>}
              {enCours === 'exemple' && <span style={s.texte} aria-live="polite">Un instant…</span>}
            </div>
          </Etape>
        </ol>
      )}

      {pret && !etat.termine && (
        <footer style={s.pied}>
          <Btn disabled={enCours === 'termine'} onClick={terminer}>Terminer la mise en route</Btn>
          <span style={s.texte}>La carte du tableau de bord disparaît. Elle disparaît aussi d'elle-même quand les étapes 1 à 4 sont faites.</span>
        </footer>
      )}

      {importOuvert && consultant && (
        <React.Suspense fallback={null}>
          <ImportLauncher
            etabId={etabId}
            legacySB={dbService.getBridge()}
            user={user}
            onClose={() => setImportOuvert(false)}
            onImported={() => { relire(); signaler(); }}
          />
        </React.Suspense>
      )}
    </div>
  );
}

function Etape({ numero, titre, fait, dernier, children }) {
  return (
    <li style={dernier ? { ...s.etape, borderBottom: 'none' } : s.etape}>
      <div style={s.etapeTete}>
        <div style={{ minWidth: 0 }}>
          <div style={s.numero}>Étape <span>{numero}</span></div>
          <h3 style={s.etapeTitre}>{titre}</h3>
        </div>
        <span style={fait ? s.fait : s.aFaire}>{fait ? 'Fait' : 'À faire'}</span>
      </div>
      {children}
    </li>
  );
}

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880, margin: '0 auto', width: '100%', minWidth: 0 },
  titre: { margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 28, lineHeight: 1.2, color: 'var(--text)' },
  intro: { margin: '6px 0 0', fontSize: 15, lineHeight: 1.55, color: 'var(--text2)' },
  info: { margin: 0, fontSize: 14, color: 'var(--text2)' },
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', fontSize: 14 },
  termine: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 'var(--r-sm)', background: 'var(--success-bg-soft)', color: 'var(--success-text)', fontSize: 14 },
  liste: {
    listStyle: 'none', margin: 0, padding: 0, background: 'var(--surface)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  etape: { padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  etapeTete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  numero: { fontSize: 12, color: 'var(--text3)' },
  etapeTitre: { margin: '2px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 19, lineHeight: 1.25, color: 'var(--text)' },
  fait: { fontSize: 13, fontWeight: 600, color: 'var(--success-text)', whiteSpace: 'nowrap' },
  aFaire: { fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' },
  texte: { margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--text2)', overflowWrap: 'anywhere' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  pied: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
};
