import React from 'react';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { ChampEntier, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';
import { TYPES_LINGE, useChambres } from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Étages » de la page des réglages (plan 15, lot 6b) :
//   - temps de ménage par défaut, d'un départ et d'une recouche ;
//   - par catégorie de chambre (catégories lues dans les chambres) : ses temps
//     et le linge d'un départ, qui pré-remplit « Linge » sur la carte d'une
//     chambre qui se libère.
// reglages_modules, module 'etages'. Écriture : direction de la maison (RLS) ;
// la section n'est proposée qu'à la direction de l'hôtel.
// ─────────────────────────────────────────────────────────────────────────────

const LINGE_REGLE = TYPES_LINGE.filter((t) => t.id !== 'autre');

export default function SectionReglagesEtages({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'etages');
  const chambres = useChambres(etabId);
  const [enCours, setEnCours] = React.useState(false);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (changes) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer(changes);
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };

  const temps = reglages.temps_defaut;
  const parCategorie = new Map();
  chambres.rows.filter((c) => c.actif && c.categorie).forEach((c) => {
    parCategorie.set(c.categorie, (parCategorie.get(c.categorie) || 0) + 1);
  });
  const categories = [...parCategorie.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
  const typeDe = (categorie) => reglages.types.find((t) => t.categorie.toLowerCase() === categorie.toLowerCase())
    || { categorie, depart: temps.depart, recouche: temps.recouche, linge: {} };
  const ecrireType = (categorie, changes) => {
    const autres = reglages.types.filter((t) => t.categorie.toLowerCase() !== categorie.toLowerCase());
    const actuel = typeDe(categorie);
    return ecrire({ types: [...autres, { ...actuel, ...changes, linge: { ...actuel.linge, ...(changes.linge || {}) } }] });
  };

  return (
    <div style={ui.liste} data-section-reglages="etages">
      <Ligne colonne titre="Temps de ménage par défaut" aide="Il sert aux chambres dont la catégorie n'a pas de temps propre. La tournée du jour additionne ces temps.">
        <div style={st.champs}>
          <label style={st.champBloc}>
            <span style={st.champLabel}>Départ</span>
            <ChampEntier label="Temps d'un départ, en minutes" valeur={temps.depart} min={5} max={240} unite="min" desactive={enCours}
              onValider={(n) => ecrire({ temps_defaut: { ...temps, depart: n } })} />
          </label>
          <label style={st.champBloc}>
            <span style={st.champLabel}>Recouche</span>
            <ChampEntier label="Temps d'une recouche, en minutes" valeur={temps.recouche} min={5} max={240} unite="min" desactive={enCours}
              onValider={(n) => ecrire({ temps_defaut: { ...temps, recouche: n } })} />
          </label>
        </div>
      </Ligne>
      {chambres.status === 'ready' && !categories.length && (
        <Ligne colonne derniere titre="Par type de chambre" aide="Les types viennent des catégories des chambres. Donnez une catégorie à vos chambres dans Hébergement : chambres.">
          <span />
        </Ligne>
      )}
      {categories.map((categorie, i) => {
        const t = typeDe(categorie);
        const n = parCategorie.get(categorie);
        return (
          <Ligne
            key={categorie}
            colonne
            derniere={i === categories.length - 1}
            titre={<span data-no-translate>{categorie}</span>}
            aide={<><span>{n}</span> <span>{n > 1 ? 'chambres. Le linge est proposé au départ d\'un hôte.' : 'chambre. Le linge est proposé au départ d\'un hôte.'}</span></>}
          >
            <div style={st.champs}>
              <label style={st.champBloc}>
                <span style={st.champLabel}>Départ</span>
                <ChampEntier label="Temps d'un départ, en minutes" valeur={t.depart} min={5} max={240} unite="min" desactive={enCours}
                  onValider={(v) => ecrireType(categorie, { depart: v })} />
              </label>
              <label style={st.champBloc}>
                <span style={st.champLabel}>Recouche</span>
                <ChampEntier label="Temps d'une recouche, en minutes" valeur={t.recouche} min={5} max={240} unite="min" desactive={enCours}
                  onValider={(v) => ecrireType(categorie, { recouche: v })} />
              </label>
              {LINGE_REGLE.map((l) => (
                <label key={l.id} style={st.champBloc}>
                  <span style={st.champLabel}>{l.label}</span>
                  <ChampEntier label={l.label} valeur={t.linge[l.id] || 0} min={0} max={50} largeur={72} desactive={enCours}
                    onValider={(v) => ecrireType(categorie, { linge: { [l.id]: v } })} />
                </label>
              ))}
            </div>
          </Ligne>
        );
      })}
    </div>
  );
}

const st = {
  champs: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 },
  champBloc: { display: 'flex', flexDirection: 'column', gap: 6 },
  champLabel: { fontSize: 'var(--t1)', color: 'var(--text2)' },
};
