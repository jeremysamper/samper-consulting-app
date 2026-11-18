import React from 'react';
import { Panneau } from '../../components/ui/index.jsx';
import { Fenetre, st } from './planningUi.jsx';
import { REGLES } from './conformiteCcnt.js';

// ─────────────────────────────────────────────────────────────────────────────
// Affichage de la conformité CCNT (règles : conformiteCcnt.js) : la marque
// d'une case de la grille, le panneau de la période affichée, la fenêtre de
// confirmation avant d'enregistrer un horaire qui crée une infraction.
//
// Traduction : les phrases sont un petit jeu fixe ; noms, dates, durées et
// articles de loi vivent dans des nœuds data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

const COULEURS = {
  infraction: { point: 'var(--danger-strong)', texte: 'var(--danger-text)' },
  attention: { point: 'var(--warning-strong)', texte: 'var(--warning-text)' },
};

// Libellé court d'une marque de case.
const COURTS = {
  reposQuotidien: 'Repos court',
  joursConsecutifs: 'Jours d\'affilée',
  pauses: 'Pause',
  amplitude: 'Amplitude',
};

const dateCourte = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const Point = ({ niveau }) => (
  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--r-full)', background: COULEURS[niveau].point, flexShrink: 0 }} />
);

// Marque posée dans une case : la règle la plus grave du jour, en clair.
export function MarqueCcnt({ constats }) {
  if (!constats?.length) return null;
  const premier = constats.find(c => c.niveau === 'infraction') || constats[0];
  const autres = constats.length - 1;
  return (
    <div
      className="no-print"
      data-ccnt-marque={premier.niveau}
      title={constats.map(c => REGLES[c.regle].titre).join(', ')}
      style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: COULEURS[premier.niveau].texte, lineHeight: 1.3 }}
    >
      <Point niveau={premier.niveau} />
      <span>{COURTS[premier.regle] || REGLES[premier.regle].titre}</span>
      {autres > 0 && <span data-no-translate>+{autres}</span>}
    </div>
  );
}

// Une ligne de constat : quand (jour ou semaine), la règle, la valeur, la
// phrase, l'article.
function LigneConstat({ c, nom = null, derniere = false }) {
  const regle = REGLES[c.regle];
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottomWidth: derniere ? 0 : 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }}>
      <span style={{ paddingTop: 6, display: 'flex' }}><Point niveau={c.niveau} /></span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 'var(--t2)', color: 'var(--text)', display: 'flex', flexWrap: 'wrap', gap: '0 6px' }}>
          <span style={{ fontWeight: 'var(--g3)', color: COULEURS[c.niveau].texte }}>{regle.titre}</span>
          {c.valeur && <span data-no-translate style={{ fontFamily: 'var(--font-num)' }}>{c.valeur}</span>}
        </div>
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: '0 6px' }}>
          {nom && <span data-no-translate style={{ color: 'var(--text)' }}>{nom}</span>}
          {c.portee === 'semaine' && <span>Semaine du</span>}
          <span data-no-translate>{dateCourte(c.date)}</span>
        </div>
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 }}>{c.texte}</div>
        <div data-no-translate style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>{regle.article}</div>
      </div>
    </div>
  );
}

const Compte = ({ n, un, plusieurs, niveau }) => (n > 0 ? (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t2)', color: 'var(--text)' }}>
    <Point niveau={niveau} />
    <span data-no-translate style={{ fontFamily: 'var(--font-num)' }}>{n}</span>
    <span>{n > 1 ? plusieurs : un}</span>
  </span>
) : null);

// Panneau « Conformité CCNT » de la période affichée, par personne.
export function PanneauCcnt({ constats, personnes, nomDe }) {
  // Les personnes affichées (filtre de groupe) : leurs constats seulement.
  const ids = new Set((personnes || []).map(p => p.id));
  const visibles = (constats || []).filter(c => ids.has(c.userId));
  const parPersonne = new Map();
  for (const c of visibles) {
    if (!parPersonne.has(c.userId)) parPersonne.set(c.userId, []);
    parPersonne.get(c.userId).push(c);
  }
  const lignes = (personnes || []).filter(p => parPersonne.has(p.id));
  const infractions = visibles.filter(c => c.niveau === 'infraction').length;
  const attentions = visibles.length - infractions;
  return (
    <Panneau style={{ padding: 16, marginTop: 24 }}>
      <div data-ccnt-panneau="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 16px' }}>
          <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>Conformité CCNT</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Compte n={infractions} un="infraction" plusieurs="infractions" niveau="infraction" />
            <Compte n={attentions} un="point d'attention" plusieurs="points d'attention" niveau="attention" />
          </div>
        </div>
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 }}>
          Ces repères se calculent sur les horaires prévus de la période affichée : repos, jours de repos, jours d'affilée, pauses et durée de la journée.
        </div>
        {lignes.length === 0 ? (
          <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', padding: '8px 0' }}>Aucun point à signaler sur la période affichée.</div>
        ) : lignes.map(p => {
          const siens = parPersonne.get(p.id);
          return (
            <div key={p.id} style={{ paddingTop: 8 }}>
              <div data-no-translate style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' }}>{nomDe(p.id)}</div>
              {siens.map((c, i) => <LigneConstat key={c.cle} c={c} derniere={i === siens.length - 1} />)}
            </div>
          );
        })}
      </div>
    </Panneau>
  );
}

// Fenêtre de confirmation : nomme chaque règle que l'écriture enfreint.
// Fermer (croix, Échap, voile) vaut « Revenir sans enregistrer ».
const MAX_LIGNES = 6;
export function ConfirmationCcnt({ infractions, nomDe, onRepondre }) {
  const montrees = infractions.slice(0, MAX_LIGNES);
  const reste = infractions.length - montrees.length;
  const non = React.useCallback(() => onRepondre(false), [onRepondre]);
  return (
    <Fenetre
      id="planning-confirmation-ccnt"
      titre="Règles de la CCNT"
      onClose={non}
      largeur={520}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={non}>Revenir sans enregistrer</button>
          <button type="button" style={st.primaire} onClick={() => onRepondre(true)}>Enregistrer quand même</button>
        </>
      )}
    >
      <div style={{ fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.5 }}>
        {infractions.length > 1
          ? 'Cet enregistrement ne respecte pas les règles suivantes. Vous pouvez revenir pour corriger l\'horaire, ou enregistrer quand même.'
          : 'Cet enregistrement ne respecte pas la règle suivante. Vous pouvez revenir pour corriger l\'horaire, ou enregistrer quand même.'}
      </div>
      <div data-ccnt-confirmation="">
        {montrees.map((c, i) => <LigneConstat key={c.cle} c={c} nom={nomDe(c.userId)} derniere={i === montrees.length - 1 && reste === 0} />)}
      </div>
      {reste > 0 && (
        <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)' }}>
          <span>Autres points :</span> <span data-no-translate>{reste}</span>
        </div>
      )}
    </Fenetre>
  );
}
