import React from 'react';
import { st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Pour des chiffres justes : 1 jour sans chiffre d'affaires, 1 facture sans
// montant hors TVA, ... » : chaque manque est un lien vers l'écran qui le
// corrige. Rien à signaler : la ligne n'est pas rendue. Lot 3 (tablette) :
// une liste, un manque par ligne, chacun une cible de 44 px au doigt.
// Le nombre vit dans son propre nœud, la phrase reste une clé du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

const TEXTES = {
  jours: ['jour sans chiffre d\'affaires', 'jours sans chiffre d\'affaires'],
  sansHt: ['facture sans montant hors TVA', 'factures sans montant hors TVA'],
  sansTaux: ['facture sans taux de TVA', 'factures sans taux de TVA'],
  sansCout: ['personne sans salaire ni coût moyen', 'personnes sans salaire ni coût moyen'],
  nonPointees: ['heure prévue non pointée', 'heures prévues non pointées'],
  apresMinuit: ['horaire après minuit non compté', 'horaires après minuit non comptés'],
  doublons: ['possible doublon avec une charge fixe', 'possibles doublons avec une charge fixe'],
  aucuneCharge: 'aucune charge fixe saisie',
  inventaire: 'pas d\'inventaire au début ou à la fin',
};

export function TexteManque({ m }) {
  const t = TEXTES[m.id];
  if (!t) return <span>{m.texte}</span>;
  if (typeof t === 'string') return <span>{t}</span>;
  return <><span>{m.n}</span> <span>{m.n > 1 ? t[1] : t[0]}</span></>;
}

export default function LigneManques({ manques, onOuvrir }) {
  if (!manques?.length) return null;
  return (
    <div style={st.bloc} data-manques="">
      <p style={st.titre}>Pour des chiffres justes</p>
      <ul style={st.liste}>
        {manques.map((m) => (
          <li key={m.id}>
            <button type="button" className="touch-target" style={{ ...ui.lien, ...st.entree }} onClick={() => onOuvrir(m.ecran)} data-manque={m.id}>
              <span><TexteManque m={m} /></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  titre: { margin: 0, fontSize: 'var(--t2)', color: 'var(--warning-text)', fontWeight: 'var(--g2)' },
  liste: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', fontSize: 'var(--t2)' },
  entree: { textAlign: 'left' },
};
