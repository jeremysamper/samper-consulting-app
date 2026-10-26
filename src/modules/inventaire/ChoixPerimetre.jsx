import React from 'react';
import { Package, PackageOpen } from 'lucide-react';
import EnTeteEcran from './EnTeteEcran.jsx';
import { estCompte } from './inventaireLignes.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Quel périmètre ? » : quand l'établissement compte plusieurs périmètres, ou
// qu'aucun inventaire n'est en cours, « Je compte » passe par ici. Une tuile
// par périmètre avec l'état de sa pile :
//   - un inventaire en cours : la tuile l'ouvre ;
//   - le dernier est validé (ou la pile est vide) : la tuile crée l'inventaire
//     du jour, repris du dernier, et ouvre le comptage, sans fenêtre.
// En dernier, « Autre inventaire » ouvre la fenêtre « Nouvel inventaire »
// (autre date, départ vierge ou catalogue, nouveau périmètre).
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');

export default function ChoixPerimetre({ perimetres, pilesParPerimetre, onRetour, onOuvrir, onAutre }) {
  return (
    <>
      <EnTeteEcran titre="Quel périmètre ?" onRetour={onRetour} />
      <div className="accueil-grille">
        {perimetres.map((nom) => {
          const dernier = (pilesParPerimetre.get(nom) || [])[0];
          const enCours = dernier && dernier.statut !== 'validé';
          const lignes = dernier?.lignes || [];
          const etat = !dernier
            ? <>aucun inventaire, commencer</>
            : enCours
              ? <>en cours, <span>{lignes.filter(estCompte).length}</span> / <span>{lignes.length}</span> comptés</>
              : <>dernier validé le <span>{dateCH(dernier.date)}</span>, commencer un nouveau comptage</>;
          return (
            <Tuile key={nom} id={nom} Icone={Package} onClick={() => onOuvrir(nom)}>
              <span style={st.libelle} data-no-translate>{nom}</span>
              <span style={st.etat}>{etat}</span>
            </Tuile>
          );
        })}
        <Tuile id="__autre__" Icone={PackageOpen} onClick={onAutre}>
          <span style={st.libelle}>Autre inventaire</span>
          <span style={st.etat}>autre date, départ vierge ou catalogue, nouveau périmètre</span>
        </Tuile>
      </div>
    </>
  );
}

// Même tuile que l'accueil du module (et que la page d'accueil tactile).
function Tuile({ id, Icone, onClick, children }) {
  return (
    <button type="button" className="accueil-tuile" data-cadre="" data-tuile-perimetre={id} style={st.tuile} onClick={onClick}>
      <Icone size={28} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </button>
  );
}

const st = {
  tuile: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minHeight: 72, width: '100%',
    padding: '22px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--accent)',
    border: 'none', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 500, lineHeight: 1.2, textAlign: 'left', cursor: 'pointer',
  },
  libelle: { display: 'block' },
  etat: { display: 'block', marginTop: 4, fontSize: 12, fontWeight: 400, color: 'var(--text2)', lineHeight: 1.35 },
};
