import SamperMark from '../components/brand/SamperMark.jsx';
import AccountButton from '../components/nav/AccountButton.jsx';
import CompteButton from '../components/nav/CompteButton.jsx';
import NavBadge from '../components/nav/NavBadge.jsx';
import { getModuleIcon } from '../modules/moduleIcons.js';
import { zurichNowMinutes } from '../utils/zurichTime.js';
import { useShell } from './ShellContext.js';

// ─────────────────────────────────────────────────────────────────────────────
// Page d'accueil de la coque tactile (tablette, téléphone) : un gros bouton par
// module visible, rangés par rubrique dans l'ordre du menu (useVisibleNav :
// mêmes règles de rôle, d'établissement et d'ordre que la barre latérale de
// l'ordinateur). En tête : l'établissement, le bonjour, le compte.
//
// Un bouton : pictogramme au trait (moduleIcons), libellé court
// (module_labels, sinon mobileLabel, sinon label), badge dans le coin. Hauteur
// minimale 72 px posée en inline : la règle tactile globale (44 px) ne peut pas
// la rabaisser. Les colonnes (2, 3, 4 selon la largeur) sont dans app.css
// (.accueil-grille). data-cadre : le bouton garde son fond (règle « Plus de
// carrés »). Aucun filter ni transform inline : l'affordance au tap est globale.
//
// Sur ordinateur, la page « accueil » affiche le tableau de bord
// (LegacyModuleHost) : ce composant n'y est jamais monté.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilTactile() {
  const shell = useShell();
  if (!shell) return null;
  const { mode, groupedNav, badges, getLabelForModule, setPage, etablissement, accountUser, openAccount, openCompte, compteActif } = shell;
  const salutation = zurichNowMinutes() >= 18 * 60 ? 'Bonsoir' : 'Bonjour';
  const logo = etablissement?.logo_url || null;
  const prenom = accountUser?.prenom || '';

  return (
    <div style={s.page}>
      <header style={s.entete}>
        <div style={s.logo} aria-hidden="true">
          {logo
            ? <img src={logo} alt="" style={s.logoImg} />
            : <SamperMark size={48} radius={0} title="Samper Consulting" style={{ width: '100%', height: '100%', display: 'block' }} />}
        </div>
        <div style={s.qui}>
          <h2 style={s.nomEtab} data-no-translate="">{etablissement?.nom || ''}</h2>
          {/* Salutation et prénom dans deux nœuds : le traducteur du DOM
              trouve « Bonjour » au glossaire, le prénom ne part jamais à l'IA. */}
          <p style={s.bonjour}>
            <span>{salutation}</span>
            {prenom && <>{' '}<span data-no-translate="">{prenom}</span></>}
          </p>
        </div>
        {openCompte ? (
          // Espace Compte sur la ligne de « Mon compte » : aucune tuile de
          // plus, rien ne descend sous le pli.
          <div style={{ ...s.ligneCompte, ...(mode === 'telephone' ? { width: '100%' } : null) }}>
            <AccountButton user={accountUser} variant="accueil" onOpen={openAccount} style={s.compteFlexible} />
            <CompteButton variant="accueil" onOpen={openCompte} actif={compteActif} />
          </div>
        ) : (
          <AccountButton
            user={accountUser}
            variant="accueil"
            onOpen={openAccount}
            style={mode === 'telephone' ? { width: '100%' } : undefined}
          />
        )}
      </header>

      {groupedNav.map((group) => (
        <section key={group.label} role="group" aria-label={group.label}>
          <h3 style={s.rubriqueTitre}>{group.label}</h3>
          <div className="accueil-grille">
            {group.items.map((item) => {
              const Icone = getModuleIcon(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="accueil-tuile"
                  data-cadre=""
                  data-module-id={item.id}
                  style={s.tuile}
                  onClick={() => setPage(item.id)}
                >
                  <Icone size={28} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span style={s.libelle}>{getLabelForModule(item.id, item.mobileLabel || item.label)}</span>
                  <NavBadge itemId={item.id} badges={badges} style={s.badge} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 900, margin: '0 auto', width: '100%', minWidth: 0 },
  entete: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '4px 2px 2px' },
  logo: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0 },
  logoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  qui: { flex: '1 1 200px', minWidth: 0 },
  nomEtab: {
    margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, lineHeight: 1.15, color: 'var(--text)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  bonjour: { margin: '3px 0 0', fontSize: 15, lineHeight: 1.4, color: 'var(--text2)' },
  ligneCompte: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  compteFlexible: { flex: '1 1 auto', minWidth: 0 },
  rubriqueTitre: { margin: '0 0 8px 2px', fontSize: 12, fontWeight: 500, color: 'var(--text3)', letterSpacing: 0.2 },
  tuile: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minHeight: 72, width: '100%',
    padding: '22px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--accent)',
    border: 'none', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 500, lineHeight: 1.2, textAlign: 'left', cursor: 'pointer',
  },
  libelle: { flex: 1, minWidth: 0 },
  badge: { position: 'absolute', top: 8, right: 8 },
};
