import { useMemo, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { SegmentedTabs } from '../../components/ui/index.jsx';
import { pdfUtils } from '../../services/pdf.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  MODES, NOMS_MOIS, REGIMES, SAISONS, cleLibelle, labelRegime, libelleFenetre, ligneDeSaison,
  ligneReliee, metaSaison, propagerLiaison, regleSection, saisonDeDate,
} from './choixMenu.js';
import { payloadMenuSeul } from './pdfGroupe.js';
import PlatsARelier from './PlatsARelier.jsx';
import SelecteurFiche, { liaisonDeValeur, valeurLiaison } from './SelecteurFiche.jsx';
import {
  NUMERO_COMPLEMENTS, NUMERO_MAX, SECTIONS_MENU, TYPES_GROUPE, metaType, plurielSection,
  rangSection, sectionParDefaut,
} from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Menus des groupes : un menu par palier de prix, en deux saisons.
//
// Les cartes montrent la saison choisie (été par défaut de mai à septembre,
// hiver d'octobre à avril) : chaque ligne porte sa saison, et une fenêtre plus
// courte quand le plat ne tient que quelques mois (« de mai à juin »). Le n°0
// d'un type est sa carte des compléments (apéritif, stations, gâteau,
// mignardises), commune à tous ses menus.
//
// Un menu se compose à partir des plats de la carte ou des fiches techniques :
// c'est ce lien qui permet de calculer la liste de courses d'un groupe. Un
// plat relié dans un menu l'est dans tous les menus qui portent le même
// libellé (vue « Plats à relier », et à l'enregistrement d'un menu).
//
// Chaque rubrique a sa règle de choix (servi à tous, un choix pour la table,
// carte dont chaque convive choisit, quantités) : voir choixMenu.js.
// ─────────────────────────────────────────────────────────────────────────────

export default function MenusGroupe({
  menus = [], menuDe, menusStatus = 'ready', enregistrer, enregistrerPlusieurs, supprimer,
  plats, recettes, platsStatus, etablissement, canEditMenus = false, voirPrix = false,
}) {
  const [typeActif, setTypeActif] = useState(TYPES_GROUPE[0].id);
  const [saison, setSaison] = useState(() => saisonDeDate(zurichToday()) || 'ete');
  const [vue, setVue] = useState('menus');
  const [enEdition, setEnEdition] = useState(null); // { typeGroupe, numero }

  const duType = useMemo(
    () => menus.filter((m) => m.typeGroupe === typeActif).sort((a, b) => (a.numero || 99) - (b.numero || 99)),
    [menus, typeActif]
  );
  const menusNumerotes = duType.filter((m) => m.numero !== NUMERO_COMPLEMENTS);
  const complements = duType.find((m) => m.numero === NUMERO_COMPLEMENTS) || null;
  const prochainNumero = (() => {
    for (let n = 1; n <= NUMERO_MAX; n += 1) if (!menusNumerotes.some((m) => m.numero === n)) return n;
    return null;
  })();

  function imprimer(menu) {
    const { payload, filename } = payloadMenuSeul({ typeGroupe: menu.typeGroupe, numero: menu.numero, menu, saison });
    pdfUtils.exportGroupeMenuPdf(payload, { etablissement, filename }).catch(() => {});
  }

  // Enregistre un menu, puis reporte ses nouvelles liaisons sur les autres
  // menus qui servent le même plat.
  async function enregistrerMenu(menu, avant) {
    const res = await enregistrer(menu);
    if (res.error) return res;
    const anciennes = new Map((avant?.lignes || []).map((l) => [l.id, valeurLiaison(l)]));
    const changees = (menu.lignes || []).filter((l) => ligneReliee(l) && anciennes.get(l.id) !== valeurLiaison(l));
    if (changees.length) {
      const autres = menus.filter((m) => m.id !== res.data?.id);
      let aEnregistrer = autres;
      const modifies = new Map();
      changees.forEach((l) => {
        propagerLiaison(aEnregistrer, cleLibelle(l.libelle), { platId: l.platId, recetteIds: l.recetteIds }).forEach((m) => {
          modifies.set(m.id, m);
        });
        aEnregistrer = aEnregistrer.map((m) => modifies.get(m.id) || m);
      });
      if (modifies.size) {
        const { faits, error } = await enregistrerPlusieurs([...modifies.values()]);
        if (error) notify(`Menu enregistré, mais report des liaisons incomplet : ${error}`, 'warning');
        else notify(`Liaison reportée dans ${faits} autre${faits > 1 ? 's' : ''} menu${faits > 1 ? 's' : ''} servant le même plat.`, 'info');
      }
    }
    return res;
  }

  const cartes = [...menusNumerotes, ...(complements ? [complements] : [])];

  return (
    <div>
      <SegmentedTabs
        tabs={TYPES_GROUPE.map((t) => ({ id: t.id, label: t.label }))}
        active={typeActif}
        onChange={setTypeActif}
        style={{ marginBottom: 10 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <SegmentedTabs
          tabs={SAISONS.map((s) => ({ id: s.id, label: `${s.label}, ${s.detail}` }))}
          active={saison}
          onChange={setSaison}
        />
        {canEditMenus && (
          <SegmentedTabs
            tabs={[{ id: 'menus', label: 'Menus' }, { id: 'relier', label: 'Plats à relier' }]}
            active={vue}
            onChange={setVue}
          />
        )}
      </div>

      <div style={{ ...st.aide, marginBottom: 12 }}>
        Ici se composent les menus. Les choix d'un client se cochent dans la fiche de son groupe :
        Calendrier, puis le groupe, onglet « Choix du client ».
      </div>

      {/* Tant que les menus ne sont pas LUS, on n'affiche ni « À composer » ni
          bouton « Composer » : l'enregistrement est un upsert, ouvrir un éditeur
          vide sur un menu qui existe en base l'écraserait. */}
      {menusStatus !== 'ready' && (
        <div style={st.vide}>
          {menusStatus === 'error' ? 'Menus indisponibles pour le moment (connexion ?).' : 'Chargement des menus…'}
        </div>
      )}

      {menusStatus === 'ready' && vue === 'relier' && canEditMenus && (
        <PlatsARelier menus={menus} plats={plats} recettes={recettes} enregistrerPlusieurs={enregistrerPlusieurs} />
      )}

      {menusStatus === 'ready' && vue === 'menus' && (
        <div style={st.grille}>
          {!cartes.length && !canEditMenus && <div style={st.vide}>Aucun menu composé pour ce type de groupe.</div>}
          {cartes.map((menu) => (
            <CarteMenu
              key={menu.id} menu={menu} saison={saison} voirPrix={voirPrix} canEditMenus={canEditMenus}
              onModifier={() => setEnEdition({ typeGroupe: menu.typeGroupe, numero: menu.numero })}
              onImprimer={() => imprimer(menu)}
            />
          ))}
          {canEditMenus && (
            <div style={{ ...st.carte, justifyContent: 'center', gap: 8, padding: 14 }}>
              {prochainNumero && (
                <button
                  type="button" style={st.bouton}
                  onClick={() => setEnEdition({ typeGroupe: typeActif, numero: prochainNumero })}
                >
                  Nouveau menu n°{prochainNumero}
                </button>
              )}
              {!complements && (
                <button
                  type="button" style={st.bouton}
                  onClick={() => setEnEdition({ typeGroupe: typeActif, numero: NUMERO_COMPLEMENTS })}
                >
                  Carte des compléments
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {enEdition && menusStatus === 'ready' && (
        <EditeurMenu
          typeGroupe={enEdition.typeGroupe}
          numero={enEdition.numero}
          menu={menuDe(enEdition.typeGroupe, enEdition.numero)}
          complements={menuDe(enEdition.typeGroupe, NUMERO_COMPLEMENTS)}
          saisonInitiale={saison}
          plats={plats}
          recettes={recettes}
          platsStatus={platsStatus}
          voirPrix={voirPrix}
          onSave={enregistrerMenu}
          onSupprimer={supprimer}
          onClose={() => setEnEdition(null)}
        />
      )}
    </div>
  );
}

// Lignes d'une saison regroupées par rubrique puis par sous-titre.
function blocsDeSaison(lignes, saison) {
  const parSection = new Map();
  (lignes || []).filter((l) => ligneDeSaison(l, saison)).forEach((l) => {
    if (!parSection.has(l.section)) parSection.set(l.section, []);
    parSection.get(l.section).push(l);
  });
  return [...parSection.entries()]
    .sort((a, b) => rangSection(a[0]) - rangSection(b[0]))
    .map(([id, ls]) => ({ id, label: plurielSection(id), lignes: ls }));
}

function CarteMenu({ menu, saison, voirPrix, canEditMenus, onModifier, onImprimer }) {
  const blocs = blocsDeSaison(menu.lignes, saison);
  const nonReliees = (menu.lignes || []).filter((l) => ligneDeSaison(l, saison) && !ligneReliee(l)).length;
  const complements = menu.numero === NUMERO_COMPLEMENTS;
  return (
    <div style={st.carte}>
      <div style={st.carteEntete}>
        <div style={{ minWidth: 0 }}>
          <div style={st.carteTitre}>{complements ? 'Compléments' : `Menu n°${menu.numero}`}</div>
          {menu.nom && <div style={st.carteNom}>{menu.nom}</div>}
        </div>
        {voirPrix && menu.prixPax != null && (
          <div style={st.prix}>{menu.prixPax} CHF<span style={st.prixUnite}> / pers.</span></div>
        )}
      </div>

      <div style={st.carteCorps}>
        {!blocs.length && <div style={st.vide}>Rien en {metaSaison(saison).label.toLowerCase()}.</div>}
        {blocs.map((b) => (
          <div key={b.id}>
            <div style={st.section}>{b.label}</div>
            {b.lignes.map((l) => (
              <div key={l.id} style={st.plat}>
                {l.libelle}
                {(l.regime || libelleFenetre(l)) && (
                  <span style={st.platDetail}>
                    {[labelRegime(l.regime).toLowerCase(), libelleFenetre(l)].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
        {nonReliees > 0 && (
          <div style={st.avis}>{nonReliees} plat{nonReliees > 1 ? 's' : ''} sans fiche : hors liste de courses.</div>
        )}
      </div>

      <div style={st.carteActions}>
        {canEditMenus && (
          <button type="button" onClick={onModifier} style={{ ...st.bouton, ...st.boutonPrincipal }}>Modifier</button>
        )}
        {blocs.length > 0 && <button type="button" onClick={onImprimer} style={st.bouton}>PDF</button>}
      </div>
    </div>
  );
}

let compteurLigne = 0;
const nouvelleLigne = (typeGroupe, section, saison) => ({
  id: `l-${Date.now()}-${compteurLigne++}`,
  section: section || sectionParDefaut(typeGroupe),
  rubrique: '',
  platId: '',
  recetteIds: [],
  libelle: '',
  description: '',
  parPersonne: '1',
  regime: '',
  saison: saison === 'ete' || saison === 'hiver' ? saison : '',
  moisDebut: '',
  moisFin: '',
});

const FILTRES_SAISON = [
  { id: 'ete', label: 'Été' },
  { id: 'hiver', label: 'Hiver' },
  { id: 'annee', label: "Toute l'année" },
  { id: 'tout', label: 'Tout' },
];

function EditeurMenu({
  typeGroupe, numero, menu, complements, saisonInitiale, plats, recettes, platsStatus, voirPrix,
  onSave, onSupprimer, onClose,
}) {
  const estComplements = numero === NUMERO_COMPLEMENTS;
  const [nom, setNom] = useState(menu?.nom || (estComplements ? 'Compléments' : ''));
  const [prixPax, setPrixPax] = useState(menu?.prixPax != null ? String(menu.prixPax) : '');
  const [description, setDescription] = useState(menu?.description || '');
  const [filtre, setFiltre] = useState(saisonInitiale || 'ete');
  const [lignes, setLignes] = useState(() => (
    (menu?.lignes || []).length
      ? menu.lignes.map((l) => ({
        ...l,
        platId: l.platId || '',
        recetteIds: Array.isArray(l.recetteIds) ? l.recetteIds : [],
        parPersonne: String(l.parPersonne ?? 1),
        moisDebut: l.moisDebut ? String(l.moisDebut) : '',
        moisFin: l.moisFin ? String(l.moisFin) : '',
      }))
      : [nouvelleLigne(typeGroupe, null, saisonInitiale)]
  ));
  const [regles, setRegles] = useState(() => menu?.regles || {});
  const [ouvertes, setOuvertes] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);

  const platById = useMemo(() => new Map((plats || []).map((p) => [p.id, p])), [plats]);
  const recetteById = useMemo(() => new Map((recettes || []).map((r) => [r.id, r])), [recettes]);

  const visible = (l) => (filtre === 'tout' ? true
    : filtre === 'annee' ? !l.saison
      : ligneDeSaison(l, filtre));

  const majLigne = (id, patch) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const basculerDetails = (id) => setOuvertes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function choisirLiaison(ligne, valeur) {
    const liaison = liaisonDeValeur(valeur);
    const ancienNom = ligne.platId ? platById.get(ligne.platId)?.nom : '';
    const nouveauNom = liaison.platId ? platById.get(liaison.platId)?.nom : '';
    // Le libellé suit le plat de la carte tant qu'il n'a pas été réécrit.
    const libelleLibre = ligne.libelle && ligne.libelle !== ancienNom;
    majLigne(ligne.id, {
      platId: liaison.platId || '',
      recetteIds: liaison.recetteIds,
      libelle: libelleLibre ? ligne.libelle : (nouveauNom || ligne.libelle),
    });
  }

  function deplacer(id, delta) {
    setLignes((ls) => {
      const index = ls.findIndex((l) => l.id === id);
      // On saute les lignes masquées par le filtre : on échange avec la
      // voisine VISIBLE.
      let cible = index + delta;
      while (cible >= 0 && cible < ls.length && !visible(ls[cible])) cible += delta;
      if (index < 0 || cible < 0 || cible >= ls.length) return ls;
      const copie = ls.slice();
      [copie[index], copie[cible]] = [copie[cible], copie[index]];
      return copie;
    });
  }

  const sectionsPresentes = useMemo(() => [...new Set(lignes.map((l) => l.section))]
    .sort((a, b) => rangSection(a) - rangSection(b)), [lignes]);

  const regleDe = (sid) => regleSection(sid, { menu: { regles }, complements: estComplements ? null : complements, typeGroupe });
  const majRegle = (sid, patch) => setRegles((r) => ({
    ...r,
    sections: { ...(r.sections || {}), [sid]: { ...regleDe(sid), ...(r.sections?.[sid] || {}), ...patch } },
  }));

  // Apéritif conseillé : des pièces de la carte des compléments, par saison.
  const piecesComplements = (complements?.lignes || []).filter((l) => l.section === 'aperitif');
  const conseille = regles.aperitifConseille || {};
  function basculerConseille(saison, id) {
    const actuels = new Set(conseille[saison] || []);
    if (actuels.has(id)) actuels.delete(id); else actuels.add(id);
    setRegles((r) => ({ ...r, aperitifConseille: { ...(r.aperitifConseille || {}), [saison]: [...actuels] } }));
  }

  async function enregistrer() {
    const utiles = lignes.filter((l) => String(l.libelle || '').trim() || l.platId);
    setEnCours(true);
    try {
      const { error } = await onSave({
        typeGroupe, numero, nom, description, regles,
        prixPax: prixPax === '' ? null : Number(String(prixPax).replace(',', '.')),
        lignes: utiles.map((l) => ({
          ...l,
          libelle: String(l.libelle || '').trim() || platById.get(l.platId)?.nom || '',
          parPersonne: Number(String(l.parPersonne).replace(',', '.')) || 1,
          moisDebut: l.moisDebut ? Number(l.moisDebut) : null,
          moisFin: l.moisFin ? Number(l.moisFin) : null,
        })),
      }, menu);
      if (error) { notify(error, 'error'); return; }
      notify(estComplements
        ? `Compléments ${metaType(typeGroupe).label.toLowerCase()} enregistrés.`
        : `Menu ${metaType(typeGroupe).label.toLowerCase()} n°${numero} enregistré.`, 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerMenu() {
    if (!menu) { onClose(); return; }
    const ok = window.confirm(`Supprimer ${estComplements ? 'la carte des compléments' : `le menu n°${numero}`} (${metaType(typeGroupe).label.toLowerCase()}) ?\n\nLes groupes qui l'ont réservé garderont leur numéro de menu, sans contenu.`);
    if (!ok) return;
    const { error } = await onSupprimer(menu);
    if (error) { notify(error, 'error'); return; }
    notify('Menu supprimé.', 'success');
    onClose();
  }

  const lignesVisibles = lignes.filter(visible);

  return (
    <div
      className="modal-full-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-full"
        style={{
          background: 'var(--surface)', width: 760, maxWidth: '100%', maxHeight: '92vh',
          borderRadius: 14, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={st.entete}>
          <div style={st.titre}>
            {metaType(typeGroupe).label}, {estComplements ? 'carte des compléments' : `menu n°${numero}`}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="ui-fermer" style={st.fermer}>×</button>
        </div>

        <div style={st.corps}>
        <div style={st.colonne}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '2 1 240px', minWidth: 0 }}>
              <label style={st.label} htmlFor="menu-nom">Intitulé du menu</label>
              <input
                id="menu-nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)}
                placeholder="Facultatif : Prestige, Déjeuner de travail"
                style={{ ...st.champ, minHeight: 44 }}
              />
            </div>
            {voirPrix && !estComplements && (
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <label style={st.label} htmlFor="menu-prix">Prix par personne (CHF)</label>
                <input
                  id="menu-prix" type="text" inputMode="decimal" value={prixPax}
                  onChange={(e) => setPrixPax(e.target.value.replace(/[^0-9.,]/g, ''))}
                  placeholder="Facultatif"
                  style={{ ...st.champ, minHeight: 44 }}
                />
              </div>
            )}
          </div>

          <div>
            <label style={st.label} htmlFor="menu-description">Présentation</label>
            <textarea
              id="menu-description" value={description} rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Facultatif : une ligne d'accroche, imprimée sous l'intitulé."
              style={{ ...st.champ, resize: 'vertical' }}
            />
          </div>

          {/* ── Règles de choix ── */}
          <div>
            <span style={st.label}>Règles de choix</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sectionsPresentes.map((sid) => {
                const r = regleDe(sid);
                return (
                  <div key={sid} style={st.regle}>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 120 }}>{plurielSection(sid)}</span>
                    <select
                      value={r.mode} aria-label={`Règle de ${plurielSection(sid)}`}
                      onChange={(e) => majRegle(sid, { mode: e.target.value })}
                      style={{ ...st.champ, flex: '1 1 200px', width: 'auto', minHeight: 44 }}
                    >
                      {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    {r.mode === 'table' && (
                      <>
                        <ChampNombre label="nombre" valeur={r.nombre || 1} onChange={(v) => majRegle(sid, { nombre: v })} />
                        <label style={st.coche}>
                          <input
                            type="checkbox" checked={!!r.versionVege} style={st.case}
                            onChange={(e) => majRegle(sid, { versionVege: e.target.checked })}
                          />
                          <span>version végétarienne</span>
                        </label>
                      </>
                    )}
                    {r.mode === 'carte' && (
                      <>
                        <ChampNombre label="à retenir" valeur={r.retenir || 3} onChange={(v) => majRegle(sid, { retenir: v })} />
                        <ChampNombre label="dont végé." valeur={r.dontVege ?? 1} min={0} onChange={(v) => majRegle(sid, { dontVege: v })} />
                      </>
                    )}
                    {(r.mode === 'table' || r.mode === 'carte' || r.mode === 'servi') && (
                      <ChampNombre
                        label="pièces / pers." valeur={r.parPersonne || ''} vide
                        onChange={(v) => majRegle(sid, { parPersonne: v || undefined })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!estComplements && piecesComplements.length > 0 && (
            <div>
              <span style={st.label}>
                Apéritif conseillé{filtre === 'ete' || filtre === 'hiver' ? `, ${metaSaison(filtre).label.toLowerCase()}` : ''}
              </span>
              {(filtre === 'ete' || filtre === 'hiver') ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 14px' }}>
                  {piecesComplements.filter((l) => ligneDeSaison(l, filtre)).map((l) => (
                    <label key={l.id} style={{ ...st.coche, flex: '1 1 260px' }}>
                      <input
                        type="checkbox" style={st.case}
                        checked={(conseille[filtre] || []).includes(l.id)}
                        onChange={() => basculerConseille(filtre, l.id)}
                      />
                      <span>{l.libelle}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div style={st.aide}>Choisissez la saison Été ou Hiver pour cocher l'apéritif conseillé.</div>
              )}
            </div>
          )}

          {/* ── Composition ── */}
          <div>
            <span style={st.label}>Composition</span>
            <SegmentedTabs tabs={FILTRES_SAISON} active={filtre} onChange={setFiltre} style={{ marginBottom: 10 }} />
            {platsStatus === 'loading' && <div style={st.vide}>Chargement des plats…</div>}
            {!lignesVisibles.length && <div style={st.vide}>Aucune ligne pour ce filtre.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lignesVisibles.map((l) => {
                const reliee = ligneReliee({ platId: l.platId, recetteIds: l.recetteIds });
                const sansFiche = reliee && l.platId && !(platById.get(l.platId)?.recettes || []).length;
                const ficheAbsente = reliee && !l.platId && !l.recetteIds.some((id) => recetteById.has(id));
                const details = ouvertes.has(l.id);
                return (
                  <div key={l.id} style={st.ligne}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <select
                        value={l.section} aria-label="Rubrique"
                        onChange={(e) => majLigne(l.id, { section: e.target.value })}
                        style={{ ...st.champ, flex: '1 1 150px', minHeight: 44 }}
                      >
                        {SECTIONS_MENU.map((sec) => <option key={sec.id} value={sec.id}>{sec.pluriel}</option>)}
                      </select>
                      <select
                        value={l.regime || ''} aria-label="Régime"
                        onChange={(e) => majLigne(l.id, { regime: e.target.value })}
                        style={{ ...st.champ, flex: '1 1 130px', minHeight: 44 }}
                      >
                        <option value="">Régime non précisé</option>
                        {REGIMES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                      <select
                        value={l.saison || ''} aria-label="Saison"
                        onChange={(e) => majLigne(l.id, { saison: e.target.value })}
                        style={{ ...st.champ, flex: '1 1 130px', minHeight: 44 }}
                      >
                        <option value="">Toute l'année</option>
                        {SAISONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>

                    <input
                      type="text" value={l.libelle} aria-label="Intitulé sur le menu"
                      onChange={(e) => majLigne(l.id, { libelle: e.target.value })}
                      placeholder="Intitulé imprimé sur le menu"
                      style={{ ...st.champ, minHeight: 44 }}
                    />
                    <SelecteurFiche
                      valeur={valeurLiaison(l)} plats={plats} recettes={recettes}
                      onChange={(v) => choisirLiaison(l, v)}
                      style={{ ...st.champ, minHeight: 44 }}
                    />

                    {details && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <input
                            type="text" value={l.rubrique || ''} aria-label="Sous-titre"
                            onChange={(e) => majLigne(l.id, { rubrique: e.target.value })}
                            placeholder="Sous-titre : Entrées froides, Canapés"
                            style={{ ...st.champ, flex: '1 1 200px', minHeight: 44 }}
                          />
                          <label style={st.fenetre}>
                            <span>Servi de</span>
                            <select
                              value={l.moisDebut || ''} aria-label="Premier mois"
                              onChange={(e) => majLigne(l.id, { moisDebut: e.target.value })}
                              style={{ ...st.champ, width: 'auto', minHeight: 44 }}
                            >
                              <option value="">toute la saison</option>
                              {NOMS_MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                            <span>à</span>
                            <select
                              value={l.moisFin || ''} aria-label="Dernier mois"
                              onChange={(e) => majLigne(l.id, { moisFin: e.target.value })}
                              style={{ ...st.champ, width: 'auto', minHeight: 44 }}
                            >
                              <option value="">fin</option>
                              {NOMS_MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                            </select>
                          </label>
                        </div>
                        <input
                          type="text" value={l.description || ''} aria-label="Précision"
                          onChange={(e) => majLigne(l.id, { description: e.target.value })}
                          placeholder="Précision imprimée : garniture, origine"
                          style={{ ...st.champ, minHeight: 44 }}
                        />
                        <input
                          type="text" value={l.note || ''} aria-label="Note pour la cuisine"
                          onChange={(e) => majLigne(l.id, { note: e.target.value })}
                          placeholder="Note pour la cuisine : même base qu'au mariage à 95"
                          style={{ ...st.champ, minHeight: 44 }}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center' }}>
                          <label style={st.coche}>
                            <input type="checkbox" checked={!!l.chaud} style={st.case} onChange={(e) => majLigne(l.id, { chaud: e.target.checked })} />
                            <span>chaud</span>
                          </label>
                          <label style={st.coche}>
                            <input type="checkbox" checked={!!l.premium} style={st.case} onChange={(e) => majLigne(l.id, { premium: e.target.checked })} />
                            <span>premium</span>
                          </label>
                          <label style={st.coche}>
                            <input
                              type="text" inputMode="decimal" value={l.parPersonne}
                              aria-label="Quantité par personne"
                              onChange={(e) => majLigne(l.id, { parPersonne: e.target.value.replace(/[^0-9.,]/g, '') })}
                              style={{ ...st.champ, width: 64, minHeight: 44, textAlign: 'center' }}
                            />
                            <span>par personne</span>
                          </label>
                        </div>
                        {l.section === 'stations' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <input
                              type="text" value={l.prix || ''} aria-label="Prix affiché"
                              onChange={(e) => majLigne(l.id, { prix: e.target.value })}
                              placeholder="60 CHF la douzaine, dès 10 douzaines"
                              style={{ ...st.champ, flex: '2 1 240px', minHeight: 44 }}
                            />
                            <input
                              type="text" value={l.unite || ''} aria-label="Unité"
                              onChange={(e) => majLigne(l.id, { unite: e.target.value })}
                              placeholder="douzaine"
                              style={{ ...st.champ, flex: '1 1 110px', minHeight: 44 }}
                            />
                            <input
                              type="text" inputMode="decimal" value={l.portionsParUnite || ''} aria-label="Portions par unité"
                              onChange={(e) => majLigne(l.id, { portionsParUnite: e.target.value.replace(/[^0-9.,]/g, '') })}
                              placeholder="portions par unité"
                              style={{ ...st.champ, flex: '1 1 140px', minHeight: 44 }}
                            />
                            <input
                              type="text" inputMode="decimal" value={l.minimum || ''} aria-label="Minimum"
                              onChange={(e) => majLigne(l.id, { minimum: e.target.value.replace(/[^0-9.,]/g, '') })}
                              placeholder="minimum"
                              style={{ ...st.champ, flex: '1 1 100px', minHeight: 44 }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div style={st.ligneBas}>
                      <button type="button" onClick={() => basculerDetails(l.id)} style={st.lien}>
                        {details ? 'Moins de détails' : 'Détails : fenêtre, sous-titre, chaud, premium'}
                      </button>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => deplacer(l.id, -1)} aria-label="Monter" style={st.icone}>↑</button>
                        <button type="button" onClick={() => deplacer(l.id, 1)} aria-label="Descendre" style={st.icone}>↓</button>
                        <button
                          type="button" aria-label="Retirer la ligne"
                          onClick={() => setLignes((ls) => ls.filter((x) => x.id !== l.id))}
                          style={{ ...st.icone, color: 'var(--danger-text)' }}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {(l.libelle || reliee) && (!reliee || sansFiche || ficheAbsente) && (
                      <div style={st.avis}>
                        {!reliee
                          ? 'Pas encore relié : imprimé sur le menu, mais pas compté dans la liste de courses.'
                          : "Ce plat de la carte n'a pas de fiche technique : il ne sera pas compté dans la liste de courses."}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setLignes((ls) => [...ls, nouvelleLigne(typeGroupe, lignesVisibles[lignesVisibles.length - 1]?.section, filtre)])}
              style={{ ...st.bouton, marginTop: 10, width: '100%' }}
            >
              Ajouter un plat
            </button>
          </div>
        </div>
        </div>

        <div style={st.pied}>
          {menu && (
            <button type="button" onClick={supprimerMenu} disabled={enCours} style={{ ...st.bouton, ...st.boutonDanger, marginRight: 'auto' }}>
              Supprimer
            </button>
          )}
          <button type="button" onClick={onClose} style={st.bouton}>{enCours ? 'Fermer' : 'Annuler'}</button>
          <button
            type="button" onClick={enregistrer} disabled={enCours}
            style={{ ...st.bouton, ...st.boutonPrincipal, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer le menu'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChampNombre({ label, valeur, onChange, min = 1, vide = false }) {
  return (
    <label style={st.coche}>
      <input
        type="text" inputMode="numeric" value={valeur}
        onChange={(e) => {
          const brut = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
          if (brut === '') { onChange(vide ? '' : min); return; }
          onChange(Math.max(min, Number(brut)));
        }}
        aria-label={label}
        style={{ ...st.champ, width: 56, minHeight: 44, textAlign: 'center' }}
      />
      <span>{label}</span>
    </label>
  );
}

const st = {
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  carte: {
    display: 'flex', flexDirection: 'column', minWidth: 0,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden',
  },
  carteEntete: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
    padding: '12px 14px', borderBottom: '1px solid var(--border)',
  },
  carteTitre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  carteNom: { fontSize: 12, color: 'var(--text2)', marginTop: 2, overflowWrap: 'anywhere' },
  prix: { flexShrink: 0, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--accent)', whiteSpace: 'nowrap' },
  prixUnite: { fontSize: 11, fontWeight: 500, fontFamily: 'var(--font)', color: 'var(--text2)' },
  carteCorps: { flex: '1 1 auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  carteActions: { display: 'flex', gap: 8, padding: '0 14px 14px' },
  section: { fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 2 },
  plat: { fontSize: 13, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.4, overflowWrap: 'anywhere', marginBottom: 3 },
  platDetail: { display: 'block', fontSize: 11, fontFamily: 'var(--font)', color: 'var(--text2)' },
  vide: { fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
  aide: { fontSize: 12, color: 'var(--text2)' },
  entete: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  titre: { fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  fermer: {
    background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', flexShrink: 0,
    color: 'var(--text2)', padding: 4, lineHeight: 1, minWidth: 44,
  },
  // Bloc scrollable ; la colonne flex vit à l'intérieur (st.colonne). Poser le
  // flex ici ferait rétrécir les enfants à overflow non visible (onglets,
  // tableaux arrondis) dès que la modale atteint sa hauteur maximale.
  corps: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '18px 20px' },
  colonne: { display: 'flex', flexDirection: 'column', gap: 18 },
  pied: {
    display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
    padding: '14px 20px', borderTop: '1px solid var(--border)',
  },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 },
  champ: {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14,
  },
  regle: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px' },
  coche: { display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' },
  case: { width: 20, height: 20, margin: 0, flexShrink: 0, accentColor: 'var(--accent)' },
  fenetre: { display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)' },
  ligne: {
    display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
    padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)',
  },
  ligneBas: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  lien: {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 44, textAlign: 'left',
    color: 'var(--accent)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
  },
  icone: {
    width: 44, minHeight: 44, flexShrink: 0, borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
    fontSize: 17, fontFamily: 'var(--font)', lineHeight: 1,
  },
  avis: { fontSize: 12, color: 'var(--warning-text)', lineHeight: 1.45 },
  bouton: {
    flex: '1 1 auto', minHeight: 44, padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  boutonPrincipal: { background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' },
  boutonDanger: { background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)' },
};
