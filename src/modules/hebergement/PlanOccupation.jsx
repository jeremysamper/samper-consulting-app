import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { zurichAjouterJours } from '../../utils/zurichTime.js';
import { STATUTS_SEJOUR, dateCourte, libelleDe } from './hotelData.js';
import { LigneSejour, Liste, Vide, h } from './hotelUi.jsx';
import { NB_NUITS, PAS, libresParNuit, lignesDuPlan, nuitsDuPlan, sansChambre } from './planOccupation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan d'occupation (lot 16 du panel) : les chambres en lignes, quatorze nuits
// en colonnes, chaque séjour une barre sur ses nuits. Rien n'est lu en plus :
// les chambres et les séjours viennent de l'écran Hébergement, qui ne monte le
// plan que sur une lecture réussie des deux. Une barre ouvre la fiche ; une
// case libre ouvre « Nouveau séjour » rempli, pour qui a le droit Modifier.
// Styles d'état (tête collée, survol, focus) : hotel.css.
// ─────────────────────────────────────────────────────────────────────────────

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const jourDe = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

const TEINTES = {
  en_maison: { background: 'var(--success-bg)', color: 'var(--success-text)' },
  prevu: { background: 'var(--info-bg)', color: 'var(--info-text)' },
  parti: { background: 'var(--piste)', color: 'var(--text3)' },
};

export default function PlanOccupation({ chambres, sejours, aujourdhui, peutGerer, onOuvrirSejour, onCaseLibre }) {
  const [debut, setDebut] = React.useState(aujourdhui);
  const uid = React.useId().replace(/:/g, '');
  const n = NB_NUITS;
  const nuits = nuitsDuPlan(debut, n);
  const actives = chambres.filter((c) => c.actif);

  if (!actives.length) {
    return <Vide>Aucune chambre n'est encore créée. Les chambres se règlent dans les réglages.</Vide>;
  }

  const lignes = lignesDuPlan({ chambres, sejours, debut, n, aujourdhui });
  const libres = libresParNuit({ chambres, sejours, debut, n, aujourdhui });
  const orphelins = sansChambre({ chambres, sejours, debut, n });
  const idNuit = (iso) => `${uid}-nuit-${iso}`;

  return (
    <div className="hotel-plan" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, maxWidth: '100%' }}>
      <div style={s.periode}>
        <button type="button" className="hotel-plan-fleche" aria-label="Semaine précédente" onClick={() => setDebut((d) => zurichAjouterJours(d, -PAS))}>
          <span className="hotel-plan-fleche-rond"><ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" /></span>
        </button>
        <div style={s.periodeTexte}>
          <span>Du</span> <span data-no-translate>{dateCourte(nuits[0])}</span> <span>au</span> <span data-no-translate>{dateCourte(nuits[n - 1])}</span>
        </div>
        <button type="button" className="hotel-plan-fleche" aria-label="Semaine suivante" onClick={() => setDebut((d) => zurichAjouterJours(d, PAS))}>
          <span className="hotel-plan-fleche-rond"><ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" /></span>
        </button>
        {debut !== aujourdhui && (
          <Btn variant="ghost" onClick={() => setDebut(aujourdhui)} style={{ minHeight: 44 }}>Aujourd'hui</Btn>
        )}
      </div>

      <div data-cadre="" style={{ ...h.carte, padding: '8px 0' }}>
        {/* Nœuds des noms accessibles composés (aria-labelledby), masqués à la vue. */}
        <span id={`${uid}-creer`} className="hotel-plan-masque">Créer un séjour, chambre</span>
        {nuits.map((iso) => <span key={iso} id={idNuit(iso)} className="hotel-plan-masque" data-no-translate>{dateCourte(iso)}</span>)}

        <div className="hotel-plan-defile" data-defilement-natif="">
          <table>
            <thead>
              <tr>
                <th scope="col" className="hotel-plan-tete">Chambre</th>
                {nuits.map((iso) => {
                  const j = jourDe(iso);
                  return (
                    <th key={iso} scope="col" className="hotel-plan-nuit" data-weekend={j === 0 || j === 6 ? '' : undefined} data-aujourdhui={iso === aujourdhui ? '' : undefined}>
                      <span style={s.jour}>{JOURS[j]}</span>
                      <span style={s.quantieme} data-no-translate>{iso.slice(8, 10)}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne) => {
                const c = ligne.chambre;
                const idNumero = `${uid}-ch-${c.id}`;
                let k = 0;
                return (
                  <tr key={c.id} data-chambre={c.numero} data-hors-service={ligne.horsService ? '' : undefined}>
                    <th scope="row" className="hotel-plan-tete" title={ligne.horsService && c.horsServiceMotif ? c.horsServiceMotif : undefined}>
                      <span id={idNumero} style={s.numero} data-no-translate>{c.numero}</span>
                      {c.categorie && <span style={s.categorie} data-no-translate>{c.categorie}</span>}
                      {ligne.horsService && <span style={s.categorie}>Hors service</span>}
                    </th>
                    {ligne.cellules.map((cel) => {
                      const i = k;
                      k += cel.type === 'libre' ? 1 : cel.largeur;
                      if (cel.type === 'libre') {
                        const j = jourDe(cel.nuit);
                        const weekend = j === 0 || j === 6 ? '' : undefined;
                        const touchable = peutGerer && !ligne.horsService && !cel.passee;
                        return (
                          <td key={`l-${i}`} className="hotel-plan-libre" data-weekend={weekend}>
                            {touchable && (
                              <button
                                type="button"
                                className="hotel-plan-case"
                                aria-labelledby={`${uid}-creer ${idNumero} ${idNuit(cel.nuit)}`}
                                onClick={() => onCaseLibre({ chambreId: c.id, arrivee: cel.nuit, depart: zurichAjouterJours(cel.nuit, 1) })}
                              />
                            )}
                          </td>
                        );
                      }
                      const sej = cel.sejour;
                      const teinte = TEINTES[sej.statut] || TEINTES.parti;
                      return (
                        <td key={`s-${sej.id}`} colSpan={cel.largeur} className="hotel-plan-cellule-sejour">
                          <button
                            type="button"
                            className="hotel-plan-barre"
                            data-sejour={sej.id}
                            data-statut={sej.statut}
                            data-coupe-avant={cel.coupeAvant ? '' : undefined}
                            data-coupe-apres={cel.coupeApres ? '' : undefined}
                            style={teinte}
                            onClick={() => onOuvrirSejour(sej)}
                          >
                            <span style={s.nomBarre} data-no-translate>{sej.nomHote}</span>
                            <span className="hotel-plan-masque"> </span>
                            <span className="hotel-plan-masque" data-no-translate>{dateCourte(sej.arrivee)}</span>
                            <span className="hotel-plan-masque"> </span>
                            <span className="hotel-plan-masque" data-no-translate>{dateCourte(sej.depart)}</span>
                            <span className="hotel-plan-masque"> </span>
                            <span className="hotel-plan-masque">{libelleDe(STATUTS_SEJOUR, sej.statut)}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="hotel-plan-tete">Libres</th>
                {libres.map((nb, i) => (
                  <td key={nuits[i]} className="hotel-plan-libres">
                    <span data-no-translate style={{ ...s.libre, ...(nb === 0 ? { color: 'var(--danger-text)' } : null) }}>{nb}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={s.legende}>
        {['en_maison', 'prevu', 'parti'].map((st) => (
          <span key={st} style={s.legendeItem}>
            <span aria-hidden="true" style={{ ...s.point, background: TEINTES[st].color }} />
            <span>{libelleDe(STATUTS_SEJOUR, st)}</span>
          </span>
        ))}
        <span style={s.legendeItem}>
          <span aria-hidden="true" style={{ ...s.point, borderRadius: 0, background: 'var(--piste)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)' }} />
          <span>Hors service</span>
        </span>
      </div>

      {orphelins.length > 0 && (
        <>
          <div style={h.sousTitre}>Séjours sans chambre sur la période</div>
          <Liste>
            {orphelins.map((x) => <LigneSejour key={x.id} sejour={x} chambre={null} aujourdhui={aujourdhui} onClick={() => onOuvrirSejour(x)} />)}
          </Liste>
        </>
      )}
    </div>
  );
}

const s = {
  periode: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  periodeTexte: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  jour: { display: 'block', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  quantieme: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  numero: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontVariantNumeric: 'tabular-nums' },
  categorie: { display: 'block', fontSize: 'var(--t1)', fontWeight: 'var(--g1)', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nomBarre: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  libre: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t2)', fontVariantNumeric: 'tabular-nums' },
  legende: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 'var(--t1)', color: 'var(--text2)' },
  legendeItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  point: { display: 'inline-block', width: 10, height: 10, borderRadius: 'var(--r-full)' },
};
