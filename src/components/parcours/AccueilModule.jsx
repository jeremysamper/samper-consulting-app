import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil d'un module : une tuile par tâche, dans l'ordre où l'équipe s'en
// sert. Même tuile que la page d'accueil tactile de l'app (AccueilTactile.jsx :
// bouton data-cadre, 72 px au moins, pictogramme au trait, libellé court),
// même grille (.accueil-grille : 2, 3 ou 4 colonnes par CSS), sur les trois
// coques : un module ne lit ni useShellMode ni useIsMobile pour son accueil.
// La ligne d'état vit dans la tuile, sous le libellé : une seule cible au
// doigt. Une tuile hors droit n'est pas rendue, jamais grisée.
//
//   tuiles = [{ id, libelle, Icone, etat, visible, onClick, brut }]
//
// visible : absent, la tuile est toujours rendue ; présent, toute valeur
// fausse la masque (false, mais aussi undefined ou null d'un droit qu'on n'a
// pas pu lire : un droit absent ferme la tuile, il ne l'ouvre jamais).
//
// brut : le libellé est une donnée (nom de périmètre, de personne), il porte
// data-no-translate et ne part jamais au traducteur. Dans `etat`, nombres,
// dates et noms vont dans leurs propres nœuds : la phrase autour reste une
// entrée du glossaire au lieu de partir à l'IA à chaque valeur.
// data-tuile : crochet du banc (une tuile rendue = un droit effectif).
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilModule({ tuiles }) {
  return (
    <div className="accueil-grille">
      {tuiles.filter(t => t && (!('visible' in t) || Boolean(t.visible))).map(t => (
        <button key={t.id} type="button" className="accueil-tuile" data-cadre="" data-tuile={t.id} style={st.tuile} onClick={t.onClick}>
          <t.Icone size={28} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={st.libelle} data-no-translate={t.brut ? true : undefined}>{t.libelle}</span>
            {t.etat != null && <span style={st.etat}>{t.etat}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

const st = {
  // Tuile de la page d'accueil tactile (AccueilTactile.jsx) : hauteur minimale
  // en inline, fond et rayon, aucune couleur en dur, aucun filter ni transform
  // (l'affordance au tap est globale).
  tuile: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 12, minHeight: 72, width: '100%',
    padding: '22px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--accent)',
    border: 'none', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 500, lineHeight: 1.2, textAlign: 'left', cursor: 'pointer',
  },
  libelle: { display: 'block' },
  etat: { display: 'block', marginTop: 4, fontSize: 12, fontWeight: 400, color: 'var(--text2)', lineHeight: 1.35 },
};
