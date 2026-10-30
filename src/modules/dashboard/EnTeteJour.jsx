import React from 'react';
import { Clock } from 'lucide-react';
import { getModuleIcon } from '../moduleIcons.js';
import { heureParlee } from './tableauLogique.js';
import { Duree, Mots, Parties, Repere } from './tableauBriques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// En-tête du jour : le seul aplat de la page (pétrole pâle, data-cadre).
//   la date, « Bonjour Karim. », la ligne d'état du service (« Service du
//   midi dans 1 h 10. 42 couverts réservés. »), puis trois repères :
//   couverts, groupes, équipe du jour, chacun menant à son module.
// Pendant le chargement, seuls la date et le bonjour s'affichent : aucun
// zéro qui clignote avant les données.
// ─────────────────────────────────────────────────────────────────────────────

const ICONES = { couverts: getModuleIcon('previsions'), groupes: getModuleIcon('groupes'), equipe: getModuleIcon('planning') };

export function EnTete({ date, salutation, prenom, pret, service, reperes, peutOuvrir, ouvrir, onAssistant }) {
  const avecReperes = pret && reperes && reperes.length > 0;
  return (
    <header className="tdb-hero" data-cadre="" style={s.hero}>
      <div style={{ minWidth: 0 }}>
        <div style={s.ligneHaut}>
          <p style={s.date}><Mots texte={date} /></p>
          {onAssistant && (
            <button type="button" onClick={onAssistant} style={s.assistant}>Assistant</button>
          )}
        </div>
        <h2 className="tdb-hero-salut" style={s.salut}>
          <span>{salutation}</span>
          {prenom ? <>{' '}<span data-no-translate>{prenom}</span></> : null}
          .
        </h2>
        {pret && service && (
          <p style={s.service}>
            <Clock size={20} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <span style={{ minWidth: 0 }}><LigneService service={service} /></span>
          </p>
        )}
      </div>
      {avecReperes && (
        <div className="tdb-reperes">
          {reperes.map((r) => (
            <Repere
              key={r.id}
              repere={r}
              icone={ICONES[r.id]}
              onClick={peutOuvrir(r.page) ? () => ouvrir(r.page) : null}
            />
          ))}
        </div>
      )}
    </header>
  );
}

// Débuts de phrase, un par service : chacun est une entrée du glossaire.
const DEBUT = {
  brunch: { dans: 'Brunch dans', a: 'Brunch à', enCours: 'Brunch en cours.', sansHeure: 'Au brunch :' },
  midi: { dans: 'Service du midi dans', a: 'Service du midi à', enCours: 'Service du midi en cours.', sansHeure: 'Ce midi :' },
  soir: { dans: 'Service du soir dans', a: 'Service du soir à', enCours: 'Service du soir en cours.', sansHeure: 'Ce soir :' },
};
// Au-delà de trois heures, l'heure du service plutôt qu'un compte à rebours.
const COMPTE_A_REBOURS_MAX = 180;

function Couverts({ n }) {
  if (!n) return <span>Aucune réservation pour l&apos;instant.</span>;
  return <><span data-no-translate>{n}</span>{' '}<span>{n === 1 ? 'couvert réservé.' : 'couverts réservés.'}</span></>;
}

// La ligne d'état du service (etatDuService, tableauLogique.js), en nœuds.
export function LigneService({ service }) {
  const { etat, dans, heure, couverts, demain } = service;
  const debut = DEBUT[service.service] || DEBUT.midi;
  switch (etat) {
    case 'a_venir':
      return (
        <>
          {dans <= COMPTE_A_REBOURS_MAX
            ? <><span>{debut.dans}</span>{' '}<Duree minutes={dans} />.</>
            : <><span>{debut.a}</span>{' '}<span data-no-translate>{heureParlee(heure)}</span>.</>}
          {' '}<Couverts n={couverts} />
        </>
      );
    case 'en_cours':
      return <><span>{debut.enCours}</span>{' '}<Couverts n={couverts} /></>;
    case 'sans_heure':
      return <><span>{debut.sansHeure}</span>{' '}<Couverts n={couverts} /></>;
    case 'termine': {
      const parts = [];
      [['brunch', 'au brunch'], ['midi', 'à midi'], ['soir', 'le soir']].forEach(([id, mot]) => {
        if (!demain?.[id]) return;
        if (parts.length) parts.push({ t: ',' });
        parts.push({ n: demain[id] }, { t: mot });
      });
      return (
        <>
          <span>Les services du jour sont terminés.</span>
          {parts.length > 0 && <>{' '}<span>Demain :</span>{' '}<Parties parties={parts} /></>}
        </>
      );
    }
    case 'ferme':
      return <span>Le restaurant est fermé aujourd&apos;hui.</span>;
    default:
      return <span>Aucune réservation aujourd&apos;hui.</span>;
  }
}

const s = {
  // Grille, espacements et retraits dans tableau.css (suivent la largeur).
  hero: {
    minWidth: 0, boxSizing: 'border-box',
    background: 'var(--accent-light)', borderRadius: 'var(--r-lg)', color: 'var(--text)',
  },
  ligneHaut: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  date: { margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4, color: 'var(--text2)' },
  salut: { margin: '4px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 400, lineHeight: 1.15, color: 'var(--text)', overflowWrap: 'anywhere' },
  service: { display: 'flex', alignItems: 'flex-start', gap: 10, margin: '8px 0 0', fontSize: 16, lineHeight: 1.45, color: 'var(--text)', maxWidth: 640 },
  assistant: {
    display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', flexShrink: 0, cursor: 'pointer',
    borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--surface)', color: 'var(--accent)',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 600,
  },
};
