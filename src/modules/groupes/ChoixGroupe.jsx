import { useEffect, useMemo, useRef, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import EmpruntPlat from './EmpruntPlat.jsx';
import {
  convives, estVege, etatRubrique, exigeVersionVege, formatChf, formuleChoisie, labelRegime, libelleFenetre,
  metaSaison, normaliserChoix, phraseRegle, rubriquesDuChoix, saisonDeDate,
  selectionRubrique, tarif, versionVege,
} from './choixMenu.js';

// ─────────────────────────────────────────────────────────────────────────────
// Choix du client : la fiche de choix de la maison, cochée dans l'app.
//
// La date du groupe fixe la saison : on ne voit que les plats servis ce
// jour-là, ceux d'une fenêtre plus courte (« de mai à juin ») sont grisés hors
// de leurs mois. Chaque rubrique applique sa règle (une entrée pour toute la
// table, trois entrées retenues dont une végétarienne, quatre pièces dont une
// chaude...) et dit ce qui manque, sans jamais bloquer l'enregistrement : un
// choix partiel se garde, la fiche et la liste de courses le signalent.
//
// À titre exceptionnel, un plat peut être pris dans un autre menu, avec un
// supplément par personne saisi à la main (voir EmpruntPlat).
//
// Écriture : bouton « Enregistrer les choix », désactivé pendant l'envoi ; la
// fiche, elle, se ferme toujours. Si elle a été fermée entre-temps, l'issue
// arrive en toast, au nom du groupe.
// ─────────────────────────────────────────────────────────────────────────────

const enTexte = (v) => (v == null ? '' : String(v));
const entierOuNull = (v) => (v === '' || v == null ? null : Math.max(0, Math.round(Number(v) || 0)));

function brouillonDe(groupe) {
  return {
    choix: normaliserChoix(groupe.choix),
    nbVegetariens: enTexte(groupe.nbVegetariens),
    nbEnfants: enTexte(groupe.nbEnfants),
  };
}

// Lignes d'une rubrique par sous-titre (« Entrées froides », « Canapés »),
// dans l'ordre du menu.
function parRubrique(lignes) {
  const groupes = [];
  (lignes || []).forEach((l) => {
    const titre = l.rubrique || '';
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.titre === titre) dernier.lignes.push(l);
    else groupes.push({ titre, lignes: [l] });
  });
  return groupes;
}

export default function ChoixGroupe({
  groupe, menu, complements, menus, canEdit = false, voirPrix = false, onSave,
}) {
  const [brouillon, setBrouillon] = useState(() => brouillonDe(groupe));
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [emprunt, setEmprunt] = useState(null); // id de rubrique
  const ouvertRef = useRef(true);
  const groupeRef = useRef(groupe);
  groupeRef.current = groupe;
  useEffect(() => () => { ouvertRef.current = false; }, []);

  // Une relecture venue d'une autre tablette remplace le brouillon tant
  // qu'on n'a rien modifié ici.
  const empreinte = JSON.stringify([groupe.choix, groupe.nbVegetariens, groupe.nbEnfants]);
  useEffect(() => {
    if (!modifie) setBrouillon(brouillonDe(groupeRef.current));
  }, [empreinte, modifie]);

  const rubriques = useMemo(() => rubriquesDuChoix({
    menu, complements, typeGroupe: groupe.typeGroupe, dateISO: groupe.dateEvenement,
  }), [menu, complements, groupe.typeGroupe, groupe.dateEvenement]);

  const choix = brouillon.choix;
  const ctx = convives({
    nbPax: groupe.nbPax,
    nbVegetariens: Number(brouillon.nbVegetariens) || 0,
    nbEnfants: Number(brouillon.nbEnfants) || 0,
  });
  const saison = saisonDeDate(groupe.dateEvenement);
  const conseille = menu?.regles?.aperitifConseille || null;
  const prix = voirPrix ? tarif({ menu, rubriques, choix, menus }) : null;

  // ── Écritures dans le brouillon ──────────────────────────────────────────
  const appliquer = (nouveau) => { setBrouillon((b) => ({ ...b, choix: nouveau })); setModifie(true); };
  const sectionDe = (sid) => choix.sections[sid] || { items: [], vege: null };
  const avecSection = (sid, s) => ({ ...choix, sections: { ...choix.sections, [sid]: s } });

  function basculer(rub, ligne) {
    const s = sectionDe(rub.id);
    if (s.items.some((i) => i.id === ligne.id)) {
      appliquer(avecSection(rub.id, { ...s, items: s.items.filter((i) => i.id !== ligne.id) }));
      return;
    }
    const r = rub.regle;
    const item = { id: ligne.id, libelle: ligne.libelle, quantite: null };
    const max = r.mode === 'carte' ? (Number(r.retenir) || 3) : (Number(r.nombre) || 1);
    if (r.mode === 'table' && max === 1) {
      // Un seul choix pour la table : le nouveau remplace l'ancien, emprunt compris.
      appliquer({
        ...avecSection(rub.id, { items: [item], vege: exigeVersionVege(ligne) ? s.vege : null }),
        emprunts: choix.emprunts.filter((e) => e.section !== rub.id),
      });
      return;
    }
    const pris = s.items.length + choix.emprunts.filter((e) => e.section === rub.id).length;
    if (pris >= max) {
      notify(`Déjà ${max} retenu${max > 1 ? 's' : ''} dans « ${rub.label} » : retirez-en un d'abord.`, 'info');
      return;
    }
    appliquer(avecSection(rub.id, { ...s, items: [...s.items, item] }));
  }

  function changerQuantite(rub, ligne, valeur) {
    const q = valeur === '' ? null : Math.max(0, Math.round(Number(valeur) || 0));
    if (ligne.emprunt) {
      appliquer({ ...choix, emprunts: choix.emprunts.map((e) => (e.id === ligne.id ? { ...e, quantite: q } : e)) });
      return;
    }
    const s = sectionDe(rub.id);
    const existe = s.items.some((i) => i.id === ligne.id);
    if (rub.regle.mode === 'quantites') {
      // Une station se retient en saisissant sa quantité, se retire à zéro.
      const items = !q
        ? s.items.filter((i) => i.id !== ligne.id)
        : existe
          ? s.items.map((i) => (i.id === ligne.id ? { ...i, quantite: q } : i))
          : [...s.items, { id: ligne.id, libelle: ligne.libelle, quantite: q }];
      appliquer(avecSection(rub.id, { ...s, items }));
      return;
    }
    appliquer(avecSection(rub.id, { ...s, items: s.items.map((i) => (i.id === ligne.id ? { ...i, quantite: q } : i)) }));
  }

  function choisirFormule(rub, formule) {
    const s = sectionDe(rub.id);
    const formules = { ...choix.formules, [rub.id]: formule.id };
    appliquer({
      ...choix,
      formules,
      sections: formule.aucunChoix ? { ...choix.sections, [rub.id]: { ...s, items: [] } } : choix.sections,
    });
  }

  function choisirVege(rub, ligneId) {
    const s = sectionDe(rub.id);
    const ligne = [...rub.lignes, ...rub.puisees].find((l) => l.id === ligneId);
    appliquer(avecSection(rub.id, { ...s, vege: ligne ? { id: ligne.id, libelle: ligne.libelle } : null }));
  }

  function reprendreConseille(rub) {
    const ids = (conseille?.[saison] || []).filter((id) => rub.lignes.some((l) => l.id === id));
    if (!ids.length) return;
    const formule = conseille?.formule?.[saison];
    appliquer({
      ...avecSection(rub.id, {
        items: ids.map((id) => ({ id, libelle: rub.lignes.find((l) => l.id === id)?.libelle || '', quantite: null })),
        vege: null,
      }),
      formules: formule ? { ...choix.formules, [rub.id]: formule } : choix.formules,
    });
  }

  function ajouterEmprunt(rub, { source, ligne, supplement }) {
    const e = {
      id: `emp-${Date.now()}`,
      section: rub.id,
      source,
      libelle: ligne.libelle,
      platId: ligne.platId || null,
      recetteIds: Array.isArray(ligne.recetteIds) ? ligne.recetteIds : [],
      regime: ligne.regime || '',
      supplement,
      quantite: null,
    };
    const unSeul = rub.regle.mode === 'table' && (Number(rub.regle.nombre) || 1) === 1;
    const pris = sectionDe(rub.id).items.length + choix.emprunts.filter((x) => x.section === rub.id).length;
    const max = rub.regle.mode === 'carte' ? (Number(rub.regle.retenir) || 3) : (Number(rub.regle.nombre) || 1);
    if (!unSeul && pris >= max) {
      notify(`Déjà ${max} retenu${max > 1 ? 's' : ''} dans « ${rub.label} » : retirez-en un d'abord.`, 'info');
      return;
    }
    appliquer({
      ...(unSeul ? avecSection(rub.id, { items: [], vege: sectionDe(rub.id).vege }) : choix),
      emprunts: [...(unSeul ? choix.emprunts.filter((x) => x.section !== rub.id) : choix.emprunts), e],
    });
    setEmprunt(null);
  }

  const retirerEmprunt = (id) => appliquer({ ...choix, emprunts: choix.emprunts.filter((e) => e.id !== id) });
  const changerSupplement = (id, valeur) => {
    const n = Number(String(valeur).replace(',', '.'));
    appliquer({ ...choix, emprunts: choix.emprunts.map((e) => (e.id === id ? { ...e, supplement: Number.isFinite(n) ? n : 0 } : e)) });
  };

  function changerConvives(cle, valeur) {
    setBrouillon((b) => ({ ...b, [cle]: valeur.replace(/[^0-9]/g, '').slice(0, 4) }));
    setModifie(true);
  }

  function annulerModifications() {
    setBrouillon(brouillonDe(groupe));
    setModifie(false);
  }

  async function enregistrer() {
    const v = entierOuNull(brouillon.nbVegetariens);
    const e = entierOuNull(brouillon.nbEnfants);
    if ((v || 0) > groupe.nbPax || (e || 0) > groupe.nbPax) {
      notify(`Végétariens et enfants sont comptés parmi les ${groupe.nbPax} convives.`, 'error');
      return;
    }
    setEnCours(true);
    const nom = groupe.nom;
    try {
      const { error } = await onSave(groupe.id, { choix, nbVegetariens: v, nbEnfants: e });
      if (!ouvertRef.current) {
        notify(error ? `Choix de « ${nom} » non enregistrés : ${error}` : `Choix de « ${nom} » enregistrés.`, error ? 'error' : 'success');
        return;
      }
      if (error) { notify(error, 'error'); return; }
      setModifie(false);
      notify('Choix enregistrés. Le groupe repasse « à lire » pour la brigade.', 'success');
    } finally {
      if (ouvertRef.current) setEnCours(false);
    }
  }

  if (!menu) {
    return (
      <div style={st.vide}>
        Choisissez d'abord un menu pour ce groupe (bouton Modifier), puis revenez cocher les choix du client.
      </div>
    );
  }

  const rubEmprunt = emprunt ? rubriques.find((r) => r.id === emprunt) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Saison et convives ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {saison && (
          <div style={st.saison} data-cadre>
            {metaSaison(saison).label}, {metaSaison(saison).detail} : carte de saison d'après la date du groupe.
          </div>
        )}
        <div style={st.convives}>
          <span style={{ fontSize: 14, color: 'var(--text)' }}>
            <strong style={{ fontWeight: 700, fontFamily: 'var(--font-num)' }}>{groupe.nbPax}</strong> convives, dont
          </span>
          <label style={st.champConvives}>
            <input
              type="text" inputMode="numeric" value={brouillon.nbVegetariens} disabled={!canEdit}
              onChange={(e) => changerConvives('nbVegetariens', e.target.value)}
              placeholder="0" aria-label="Nombre de végétariens"
              style={{ ...st.champ, width: 64, textAlign: 'center', minHeight: 44 }}
            />
            <span>végétariens</span>
          </label>
          <label style={st.champConvives}>
            <input
              type="text" inputMode="numeric" value={brouillon.nbEnfants} disabled={!canEdit}
              onChange={(e) => changerConvives('nbEnfants', e.target.value)}
              placeholder="0" aria-label="Nombre d'enfants"
              style={{ ...st.champ, width: 64, textAlign: 'center', minHeight: 44 }}
            />
            <span>enfants</span>
          </label>
        </div>
        {ctx.enfants > 0 && (
          <div style={st.aide}>
            Les {ctx.enfants} enfants ont leur menu à part : les quantités ci-dessous portent sur {ctx.adultes} adultes.
          </div>
        )}
      </div>

      {/* ── Rubriques ── */}
      {rubriques.map((rub) => (
        <Rubrique
          key={rub.id}
          rub={rub}
          choix={choix}
          menus={menus}
          ctx={ctx}
          canEdit={canEdit}
          voirPrix={voirPrix}
          dateISO={groupe.dateEvenement}
          conseille={rub.id === 'aperitif' && (conseille?.[saison] || []).length ? conseille : null}
          onBasculer={(l) => basculer(rub, l)}
          onQuantite={(l, v) => changerQuantite(rub, l, v)}
          onFormule={(f) => choisirFormule(rub, f)}
          onVege={(id) => choisirVege(rub, id)}
          onConseille={() => reprendreConseille(rub)}
          onEmprunter={() => setEmprunt(rub.id)}
          onRetirerEmprunt={retirerEmprunt}
          onSupplement={changerSupplement}
        />
      ))}

      {/* ── Tarif ── */}
      {prix && prix.lignes.length > 0 && (
        <div>
          <div style={st.rubriqueTitre}>Tarif par personne</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {prix.lignes.map((l, i) => (
              <div key={i} style={st.ligneTarif}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{l.label}</span>
                <span style={st.montant}>{formatChf(l.prix)}</span>
              </div>
            ))}
            <div style={{ ...st.ligneTarif, fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
              <span>Total par personne</span>
              <span style={st.montant}>{formatChf(prix.parPersonne)}</span>
            </div>
            {prix.stations > 0 && (
              <div style={st.ligneTarif}>
                <span>Stations, au total</span>
                <span style={st.montant}>{formatChf(prix.stations)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {canEdit && (
        <div style={st.barreEnregistrer}>
          {modifie && (
            <button type="button" onClick={annulerModifications} disabled={enCours} style={st.bouton}>
              Annuler les modifications
            </button>
          )}
          <button
            type="button" onClick={enregistrer} disabled={enCours || !modifie}
            style={{ ...st.bouton, ...st.boutonPrincipal, opacity: enCours || !modifie ? 0.55 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer les choix'}
          </button>
        </div>
      )}

      {rubEmprunt && (
        <EmpruntPlat
          menus={menus}
          exclure={{ typeGroupe: groupe.typeGroupe, numero: groupe.menuNumero }}
          section={rubEmprunt.id}
          dateISO={groupe.dateEvenement}
          voirPrix={voirPrix}
          onChoisir={(e) => ajouterEmprunt(rubEmprunt, e)}
          onClose={() => setEmprunt(null)}
        />
      )}
    </div>
  );
}

function Rubrique({
  rub, choix, menus, ctx, canEdit, voirPrix, dateISO, conseille,
  onBasculer, onQuantite, onFormule, onVege, onConseille, onEmprunter, onRetirerEmprunt, onSupplement,
}) {
  const r = rub.regle;
  const etat = etatRubrique(rub, choix, menus, ctx);
  const selection = selectionRubrique(rub, choix, menus);
  const retenus = new Set(selection.map((s) => s.cle));
  const formules = Array.isArray(r.formules) ? r.formules : [];
  const formule = formuleChoisie(rub, choix);
  const sansChoix = formule?.aucunChoix;
  const vege = versionVege(rub, choix);
  const seul = selection.filter((s) => !s.horsSaison);
  const besoinVege = r.mode === 'table' && r.versionVege && seul.length === 1 && exigeVersionVege(seul[0].ligne) && ctx.vegetariens > 0;
  const optionsVege = [...rub.lignes, ...rub.puisees].filter((l) => estVege(l));
  const emprunts = selection.filter((s) => s.emprunt);
  const anciens = selection.filter((s) => s.horsSaison);
  const pris = (l) => retenus.has(l.id);
  const quantiteDe = (l) => selection.find((s) => s.cle === l.id)?.quantite ?? '';

  return (
    <section>
      <div style={st.rubriqueEntete}>
        <div style={st.rubriqueTitre}>{rub.label}</div>
        {r.mode !== 'servi' && (
          <span style={{ ...st.etat, color: etat.complet ? 'var(--success-text)' : 'var(--warning-text)' }}>
            {etat.resume}
          </span>
        )}
      </div>
      <div style={st.regle}>{phraseRegle(r)}</div>

      {formules.length > 0 && (
        <div style={st.rangee}>
          {formules.map((f) => {
            const actif = formule?.id === f.id;
            return (
              <button
                key={f.id} type="button" aria-pressed={actif} disabled={!canEdit}
                onClick={() => onFormule(f)}
                style={{ ...st.choixFormule, ...(actif ? st.choixFormuleActif : null) }}
              >
                {f.label}{voirPrix && Number(f.prix) > 0 ? `, ${formatChf(f.prix)} par personne` : ''}
              </button>
            );
          })}
        </div>
      )}

      {conseille && canEdit && !sansChoix && (
        <button type="button" onClick={onConseille} style={{ ...st.bouton, marginTop: 8 }}>
          Reprendre l'apéritif conseillé
        </button>
      )}

      {!sansChoix && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {parRubrique(rub.lignes).map((g) => (
            <div key={g.titre || 'sans-titre'}>
              {g.titre && <div style={st.sousTitre}>{g.titre}</div>}
              {g.lignes.map((l) => (
                <LigneOption
                  key={l.id} ligne={l} mode={r.mode} actif={pris(l)} canEdit={canEdit}
                  quantite={quantiteDe(l)}
                  premiumBloque={formules.length > 0 && formule && !formule.premium && l.premium}
                  onBasculer={() => onBasculer(l)}
                  onQuantite={(v) => onQuantite(l, v)}
                />
              ))}
            </div>
          ))}

          {rub.puisees.length > 0 && r.mode !== 'servi' && (
            <div>
              <div style={st.sousTitre}>Ou une deuxième entrée, la même pour toute la table</div>
              {rub.puisees.map((l) => (
                <LigneOption
                  key={l.id} ligne={l} mode={r.mode} actif={pris(l)} canEdit={canEdit}
                  quantite="" onBasculer={() => onBasculer(l)} onQuantite={() => {}}
                />
              ))}
            </div>
          )}

          {rub.horsFenetre.map((l) => (
            <div key={l.id} style={{ ...st.option, opacity: 0.5 }}>
              <span style={st.caseVide} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <span style={st.libelle}>{l.libelle}</span>
                <span style={st.detail}>{libelleFenetre(l)} : pas servi à cette date</span>
              </span>
            </div>
          ))}

          {emprunts.map((s) => (
            <div key={s.cle} style={{ ...st.option, ...st.optionEmprunt }} data-cadre>
              <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                <span style={st.libelle}>{s.ligne.libelle}</span>
                <span style={st.detail}>
                  Pris dans un autre menu{labelRegime(s.ligne.regime) ? `, ${labelRegime(s.ligne.regime).toLowerCase()}` : ''}
                </span>
              </span>
              {r.mode === 'carte' && (
                <input
                  type="text" inputMode="numeric" value={s.quantite ?? ''} disabled={!canEdit}
                  onChange={(e) => onQuantite(s.ligne, e.target.value)}
                  placeholder="nb" aria-label={`Nombre de ${s.ligne.libelle}`}
                  style={{ ...st.champ, width: 64, minHeight: 44, textAlign: 'center', flexShrink: 0 }}
                />
              )}
              {voirPrix && (
                <label style={st.supplement}>
                  <span>+</span>
                  <input
                    type="text" inputMode="decimal"
                    defaultValue={String((choix.emprunts.find((e) => e.id === s.cle)?.supplement) ?? 0)}
                    disabled={!canEdit}
                    onBlur={(e) => onSupplement(s.cle, e.target.value)}
                    aria-label="Supplément par personne en CHF"
                    style={{ ...st.champ, width: 64, minHeight: 44, textAlign: 'center' }}
                  />
                  <span>CHF / pers.</span>
                </label>
              )}
              {canEdit && (
                <button type="button" onClick={() => onRetirerEmprunt(s.cle)} style={st.retirer} aria-label={`Retirer ${s.ligne.libelle}`}>
                  Retirer
                </button>
              )}
            </div>
          ))}

          {anciens.filter((s) => !s.emprunt).map((s) => (
            <div key={s.cle} style={{ ...st.option, ...st.optionAncienne }} data-cadre>
              <span style={{ minWidth: 0, flex: '1 1 auto' }}>
                <span style={st.libelle}>{s.ligne.libelle}</span>
                <span style={st.detail}>Choisi plus tôt, pas servi à cette date : à remplacer</span>
              </span>
              {canEdit && (
                <button type="button" onClick={() => onBasculer(s.ligne)} style={st.retirer}>Retirer</button>
              )}
            </div>
          ))}
        </div>
      )}

      {besoinVege && (
        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={st.label}>Version végétarienne pour les {ctx.vegetariens} végétariens</span>
          {optionsVege.length ? (
            <select
              value={vege?.id || ''} disabled={!canEdit}
              onChange={(e) => onVege(e.target.value)}
              style={{ ...st.champ, minHeight: 44 }}
            >
              <option value="">À choisir</option>
              {optionsVege.map((l) => <option key={l.id} value={l.id}>{l.libelle}</option>)}
            </select>
          ) : (
            <span style={st.detail}>Aucune option végétarienne dans cette rubrique : à préciser dans les modifications.</span>
          )}
        </label>
      )}

      {canEdit && !sansChoix && (r.mode === 'table' || r.mode === 'carte') && (
        <button type="button" onClick={onEmprunter} style={st.lien}>
          Prendre dans un autre menu
        </button>
      )}

      {etat.messages.length > 0 && (
        <div style={st.messages}>{etat.messages.join('. ')}.</div>
      )}
      {etat.quantitesASaisir && (
        <div style={st.aide}>
          Quantités par plat à saisir avec le plan de table. En attendant, la liste de courses répartit les convives à parts égales.
        </div>
      )}
    </section>
  );
}

function LigneOption({ ligne, mode, actif, canEdit, quantite, premiumBloque, onBasculer, onQuantite }) {
  const details = [
    labelRegime(ligne.regime).toLowerCase(),
    libelleFenetre(ligne),
    ligne.chaud ? 'chaud' : '',
    ligne.premium ? 'premium' : '',
    ligne.prix || '',
  ].filter(Boolean).join(', ');

  if (mode === 'servi') {
    return (
      <div style={st.option}>
        <span style={{ minWidth: 0 }}>
          <span style={st.libelle}>{ligne.libelle}</span>
          {details && <span style={st.detail}>{details}</span>}
        </span>
      </div>
    );
  }

  if (mode === 'quantites') {
    return (
      <div style={st.option}>
        <span style={{ minWidth: 0, flex: '1 1 auto' }}>
          <span style={st.libelle}>{ligne.libelle}</span>
          {details && <span style={st.detail}>{details}</span>}
        </span>
        <input
          type="text" inputMode="numeric" value={quantite ?? ''} disabled={!canEdit}
          onChange={(e) => onQuantite(e.target.value)}
          placeholder="0" aria-label={`Quantité de ${ligne.libelle}`}
          style={{ ...st.champ, width: 72, minHeight: 44, textAlign: 'center', flexShrink: 0 }}
        />
      </div>
    );
  }

  return (
    <div style={st.option}>
      {/* Case dessinée à 20 px dans une cible de 44 : sur iPad, un tap raté
          passe pour un bug. */}
      <label style={st.cible}>
        <input
          type="checkbox" checked={actif} disabled={!canEdit}
          onChange={onBasculer}
          aria-label={ligne.libelle}
          style={st.case}
        />
      </label>
      <span style={{ minWidth: 0, flex: '1 1 auto', cursor: canEdit ? 'pointer' : 'default' }} onClick={canEdit ? onBasculer : undefined}>
        <span style={st.libelle}>{ligne.libelle}</span>
        {details && <span style={st.detail}>{details}</span>}
        {ligne.note && <span style={st.note}>{ligne.note}</span>}
        {actif && premiumBloque && <span style={{ ...st.detail, color: 'var(--warning-text)' }}>Pièce premium : formule premium nécessaire</span>}
      </span>
      {mode === 'carte' && actif && (
        <input
          type="text" inputMode="numeric" value={quantite ?? ''} disabled={!canEdit}
          onChange={(e) => onQuantite(e.target.value)}
          placeholder="nb" aria-label={`Nombre de ${ligne.libelle}`}
          style={{ ...st.champ, width: 64, minHeight: 44, textAlign: 'center', flexShrink: 0 }}
        />
      )}
    </div>
  );
}

const st = {
  vide: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  saison: {
    padding: '8px 0 8px 12px',  fontSize: 13, lineHeight: 1.45,  color: 'var(--success-text)', borderLeft: '2px solid var(--success-bd)',
  },
  convives: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' },
  champConvives: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)' },
  aide: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45, marginTop: 6 },
  rubriqueEntete: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  rubriqueTitre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  etat: { fontSize: 12, fontWeight: 500 },
  regle: { fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  sousTitre: { fontSize: 12, fontWeight: 700, color: 'var(--text2)', margin: '8px 0 2px' },
  rangee: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  // Base en borderWidth / borderStyle / borderColor : l'état actif surcharge
  // borderColor, React avertirait à chaque bascule sur un raccourci `border`.
  choixFormule: {
    flex: '1 1 auto', minHeight: 44, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--bg)', color: 'var(--text)',
  },
  choixFormuleActif: { borderColor: 'var(--accent)', background: 'var(--accent)', color: 'var(--on-accent)' },
  option: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '4px 0',
    borderBottom: '1px solid var(--border)',
  },
  optionEmprunt: {
    flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, marginTop: 6,
    background: 'var(--surface2)', border: '1px solid var(--accent-bd)',
  },
  optionAncienne: {
    flexWrap: 'wrap', padding: '8px 0 8px 12px',  marginTop: 6,  borderLeft: '2px solid var(--warning-bd)',
  },
  cible: {
    width: 44, height: 44, flexShrink: 0, margin: '-4px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  case: { width: 20, height: 20, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer' },
  caseVide: { width: 44, flexShrink: 0 },
  libelle: { display: 'block', fontSize: 14, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.35, overflowWrap: 'anywhere' },
  detail: { display: 'block', fontSize: 12, color: 'var(--text2)', marginTop: 1 },
  note: { display: 'block', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 1 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 },
  champ: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
  supplement: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' },
  retirer: {
    minHeight: 44, padding: '0 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
    fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--danger-text)', border: '1px solid var(--border)',
  },
  lien: {
    background: 'none', border: 'none', padding: '10px 0 0', cursor: 'pointer', minHeight: 44,
    color: 'var(--accent)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)', textAlign: 'left',
  },
  messages: { fontSize: 12, color: 'var(--warning-text)', marginTop: 6, lineHeight: 1.45 },
  ligneTarif: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: 'var(--text)' },
  montant: { flexShrink: 0, fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' },
  barreEnregistrer: {
    position: 'sticky', bottom: -16, zIndex: 1, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8,
    padding: '10px 0 14px', background: 'var(--surface)', borderTop: '1px solid var(--border)',
  },
  bouton: {
    minHeight: 44, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  boutonPrincipal: { background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' },
};
