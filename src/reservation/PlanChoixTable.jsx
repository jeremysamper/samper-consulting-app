import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, DoorOpen, Star } from 'lucide-react';
import { chaises } from '../modules/salle/planVue.js';
import { PHRASES_REPERE, cadragePlan, entreeDe, reperesTable } from './choixTable.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan des salles ouvertes au choix, sur la page /table/<adresse> (lot L9).
// Données : réponse de la RPC anonyme table_en_ligne_plan (géométrie,
// « libre » et « demandee », rien sur les clients). Une table libre est un
// bouton ; une table prise est grisée et ne réagit pas.
//
// Aucun numéro de table à l'écran (Jérémy, 22.11.2026 : les clients s'en
// moquent). Le visiteur se repère à l'entrée (pastille à la porte), aux
// baies vitrées (trait bleuté), à la terrasse (salle ou zone nommée), au bar
// et à l'accueil ; une étoile marque les tables les plus demandées. La table
// touchée se décrit sous le plan par ses places et ses repères.
//
// Au téléphone, la salle tient dans la largeur tant que ses tables restent
// touchables (44 px) ; sinon elle garde une taille lisible et glisse sous le
// doigt (cadragePlan). Le décor est dessiné sous les tables.
// ─────────────────────────────────────────────────────────────────────────────

const NOM_DECOR = { bar: 'Bar', accueil: 'Accueil' };

// Phrases d'une table : ses places, ses repères, sa demande. Chaque phrase est
// son propre nœud de texte (traduit seul, sans chaîne assemblée).
function phrasesDe(t, salle) {
  return [
    ...reperesTable(t, salle).map((k) => PHRASES_REPERE[k]),
    ...(t.demandee ? ['Très demandée'] : []),
  ];
}

export default function PlanChoixTable({ salles, choisie, onChoisir }) {
  const salleDeChoisie = salles.find((s) => s.tables.some((t) => t.id && t.id === choisie))?.id;
  const premiereLibre = salles.find((s) => s.tables.some((t) => t.libre))?.id;
  const [salleId, setSalleId] = useState(salleDeChoisie || premiereLibre || salles[0]?.id);
  const salle = salles.find((s) => s.id === salleId) || salles[0];

  const boite = useRef(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    setLargeur(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const c = useMemo(() => (largeur && salle ? cadragePlan(salle, largeur) : null), [salle, largeur]);
  const entree = useMemo(() => entreeDe(salle?.decor), [salle]);
  const libres = (s) => s.tables.filter((t) => t.libre).length;
  const aDesBaies = (salle?.decor || []).some((d) => d.type === 'baie');
  const aDesDemandees = (salle?.tables || []).some((t) => t.libre && t.demandee);

  const choix = useMemo(() => {
    for (const s of salles) {
      const t = s.tables.find((x) => x.id && x.id === choisie);
      if (t) return { t, phrases: phrasesDe(t, s) };
    }
    return null;
  }, [salles, choisie]);

  return (
    <div>
      {salles.length > 1 && (
        <div className="rt-salles" role="tablist" aria-label="Salle">
          {salles.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === salle?.id}
              data-actif={s.id === salle?.id ? '1' : undefined}
              className="rt-choix rt-salle"
              onClick={() => setSalleId(s.id)}
            >
              <span data-no-translate>{s.nom}</span>
              <span className="rt-salle-compte"><span data-no-translate>{libres(s)}</span> {libres(s) > 1 ? 'libres' : 'libre'}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={boite} className="rt-plan-cadre" data-defile={c?.defile ? '1' : undefined}>
        {c && (
          <div className="rt-plan" style={{ width: c.largeur, height: c.hauteur }}>
            {(salle.decor || []).map((d, i) => {
              const w = d.largeur * c.k;
              const h = d.hauteur * c.k;
              const nom = d.type === 'zone' ? d.libelle : NOM_DECOR[d.type];
              // Le libellé tient s'il loge son plus long mot, sur deux lignes au plus.
              const mot = nom ? Math.max(...nom.split(/s+/).map((x) => x.length)) : 0;
              const lignes = nom && nom.length * 7 + 8 > w ? 2 : 1;
              return (
                <div
                  key={`d${i}`}
                  className="rt-decor"
                  data-type={d.type}
                  aria-hidden="true"
                  style={{
                    left: (d.x - c.x0) * c.k, top: (d.y - c.y0) * c.k, width: w, height: h,
                    // Largeur et hauteur portent déjà le quart de tour (planDecor.jsx,
                    // apresQuartDeTour) ; seule la porte tourne son dessin, carré.
                    transform: d.type === 'porte' && d.rotation ? `rotate(${d.rotation}deg)` : undefined,
                  }}
                >
                  {nom && w > mot * 7 + 8 && h > lignes * 15 + 4 ? (d.type === 'zone' ? <span data-no-translate>{nom}</span> : nom) : null}
                </div>
              );
            })}
            {entree && (
              <span
                className="rt-repere-entree"
                aria-hidden="true"
                style={{
                  left: (entree.x + entree.largeur / 2 - c.x0) * c.k,
                  top: (entree.y + entree.hauteur / 2 - c.y0) * c.k,
                }}
              >
                <DoorOpen size={15} strokeWidth={2} />
              </span>
            )}
            {salle.tables.map((t, i) => {
              const w = t.largeur * c.k;
              const h = t.hauteur * c.k;
              const rond = t.forme === 'ronde' || t.forme === 'tabouret';
              const style = {
                left: (t.x - c.x0) * c.k, top: (t.y - c.y0) * c.k, width: w, height: h,
                borderRadius: rond ? '50%' : Math.max(4, Math.round(10 * c.k)),
              };
              const sieges = chaises({ nb_places: t.places, forme: t.forme }, w, h, c.k).map((p, j) => (
                <span
                  key={j}
                  className="rt-chaise"
                  style={{ left: p.left, top: p.top, width: p.width, height: p.height, transform: p.rot ? `rotate(${p.rot}deg)` : undefined }}
                />
              ));
              if (!t.libre || !t.id) {
                return <div key={`p${i}`} className="rt-table" data-etat="prise" aria-hidden="true" style={style}>{sieges}</div>;
              }
              const actif = t.id === choisie;
              const phrases = phrasesDe(t, salle);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="rt-table"
                  data-etat={actif ? 'choisie' : 'libre'}
                  aria-pressed={actif}
                  style={style}
                  onClick={() => onChoisir({ id: t.id, nom: t.nom, places: t.places, reperes: reperesTable(t, salle).map((k) => PHRASES_REPERE[k]) })}
                >
                  {sieges}
                  {/* Nom accessible : places, puis repères, chacun traduit seul. */}
                  <span className="rt-vh"><span data-no-translate>{t.places}</span> places</span>
                  {phrases.map((p) => <span key={p} className="rt-vh">, {p}</span>)}
                  {actif && <Check className="rt-table-coche" size={Math.max(14, Math.min(22, Math.round(Math.min(w, h) * 0.4)))} strokeWidth={2.4} aria-hidden="true" />}
                  {t.demandee && (
                    <span className="rt-demandee" aria-hidden="true"><Star size={10} strokeWidth={2} fill="currentColor" /></span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {c?.defile && <p className="rt-plan-aide">Faites glisser le plan pour voir toute la salle.</p>}

      <div className="rt-legende" aria-hidden="true">
        <span><i data-etat="libre" />Libre</span>
        <span><i data-etat="choisie" />Votre table</span>
        <span><i data-etat="prise" />Indisponible</span>
        {aDesDemandees && <span><b className="rt-demandee rt-demandee-legende"><Star size={10} strokeWidth={2} fill="currentColor" /></b>Très demandée</span>}
        {aDesBaies && <span><i data-etat="vitre" />Baie vitrée</span>}
        {entree && <span><b className="rt-repere-entree rt-repere-legende"><DoorOpen size={12} strokeWidth={2} /></b>Entrée principale</span>}
      </div>

      {choix && (
        <div className="rt-plan-choix rt-apparait">
          <span className="rt-plan-choix-titre">Votre table</span>
          <span className="rt-repere-puce"><span data-no-translate>{choix.t.places}</span> places</span>
          {choix.phrases.map((p) => (
            <span key={p} className="rt-repere-puce" data-ton={p === 'Très demandée' ? 'demandee' : undefined}>{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}
