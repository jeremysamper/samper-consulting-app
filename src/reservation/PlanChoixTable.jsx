import { useEffect, useMemo, useRef, useState } from 'react';
import { chaises } from '../modules/salle/planVue.js';
import { cadragePlan, libelleTable } from './choixTable.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan des salles ouvertes au choix, sur la page /table/<adresse> (lot L9).
// Données : réponse de la RPC anonyme table_en_ligne_plan (géométrie et
// « libre », rien sur les clients). Une table libre est un bouton qui porte
// son numéro ; une table prise est grisée, sans numéro, et ne réagit pas.
//
// Au téléphone, la salle tient dans la largeur tant que ses tables restent
// touchables (44 px) ; sinon elle garde une taille lisible et glisse sous le
// doigt (cadragePlan). Le décor (murs, baies, bar) aide à se repérer : il est
// dessiné sous les tables, sans son libellé.
// ─────────────────────────────────────────────────────────────────────────────

const NOM_DECOR = { bar: 'Bar', accueil: 'Accueil' };

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
  const libres = (s) => s.tables.filter((t) => t.libre).length;

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
              const nom = NOM_DECOR[d.type];
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
                  {nom && w > 40 && h > 18 ? nom : null}
                </div>
              );
            })}
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
              return (
                <button
                  key={t.id}
                  type="button"
                  className="rt-table"
                  data-etat={actif ? 'choisie' : 'libre'}
                  aria-pressed={actif}
                  aria-label={`${libelleTable(t.nom)}, ${t.places} places`}
                  style={{ ...style, fontSize: Math.max(12, Math.min(17, Math.round(Math.min(w, h) * 0.32))) }}
                  onClick={() => onChoisir({ id: t.id, nom: t.nom, places: t.places })}
                >
                  {sieges}
                  <span className="rt-table-nom" data-no-translate>{t.nom}</span>
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
      </div>
    </div>
  );
}
