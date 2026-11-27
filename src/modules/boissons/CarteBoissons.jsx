import React from 'react';
import { CircleDollarSign, GlassWater, Ruler } from 'lucide-react';
import { Btn, CarteRepere, Panneau, SegmentedTabs } from '../../components/ui/index.jsx';
import { BoutonActions, Fenetre, st as fst } from '../../components/ui/Fenetres.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import EnTeteSection from '../../components/parcours/EnTeteSection.jsx';
import { canManageModule } from '../../data/demoData.js';
import { dbService } from '../../services/dbService.js';
import { listFormats } from '../../services/formatsService.js';
import { useCartes } from '../../hooks/useCartes.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { confirmLegacy } from '../../legacy/legacyApi.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { grouperParRubrique } from '../../utils/categoriesBoisson.js';
import { colonnesFormats, formatDeLibelle, formatsParPlat, prixAffiche } from '../../utils/formatsBoisson.js';
import BoissonFenetre from './BoissonFenetre.jsx';
import './boissons.css';

// ─────────────────────────────────────────────────────────────────────────────
// Carte des boissons (22.11.2026) : les cartes de boissons de l'établissement
// (cartes.genre = 'boissons'), leurs boissons rangées par rubrique, leurs
// formats et leurs prix, en colonnes comme sur la carte papier. Les boissons
// sont des lignes de plats : la Caisse, la commande par QR, le KDS et les
// rapports les lisent comme avant, par plat_id.
//
// Droits : qui ouvre le module voit les prix (décision du 22.11.2026) ; ajouter,
// modifier, retirer une boisson et gérer les cartes demandent « Modifier » du
// module et le droit d'action carte_boissons (garde de présentation : la base
// ne vérifie que l'établissement). Cartes & Recettes ne montre ni ces cartes
// ni ces prix (useCartes, genre 'mets').
//
// Les noms de boissons et de cartes sont des données (data-no-translate) ;
// chaque prix vit dans son propre nœud.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function CarteBoissons({ user, etablissement, legacyVersion }) {
  const etabId = etablissement?.id;
  const legacySB = dbService.getBridge();
  const peutModifier = canManageModule(user?.role, 'boissons') && canManageModule(user?.role, 'carte_boissons');
  const { cartes, archivedCartes, idsBoissons, status, addCarte, renameCarte, archiveCarte } = useCartes(etabId, { role: user?.role, genre: 'boissons' });

  const [plats, setPlats] = React.useState(null);
  const [formats, setFormats] = React.useState(() => new Map());
  const [erreur, setErreur] = React.useState(null);
  const [carteChoisie, setCarteChoisie] = React.useState(null);
  const [recherche, setRecherche] = React.useState('');
  // Fenêtre d'une boisson : { boisson } (null = nouvelle).
  const [fiche, setFiche] = React.useState(null);
  // Fenêtre du nom d'une carte : { carte } (null = nouvelle).
  const [nomCarte, setNomCarte] = React.useState(null);

  const charger = React.useCallback(async () => {
    if (!etabId || !legacySB) return;
    try {
      const [p, f] = await Promise.all([legacySB.db.listPlats(etabId, { strict: true }), listFormats(etabId)]);
      setPlats(p || []);
      if (f.error) setErreur(f.error);
      else { setFormats(formatsParPlat(f.data)); setErreur(null); }
    } catch {
      // Les listes à l'écran restent : une lecture ratée au réveil ne vide rien.
      setErreur('La carte des boissons ne s\'est pas chargée.');
    }
  }, [etabId, legacySB]);

  React.useEffect(() => { charger(); }, [charger, legacyVersion]);
  React.useEffect(() => {
    if (!legacySB?.realtime?.subscribeReload || !etabId) return undefined;
    return legacySB.realtime.subscribeReload(['plats', 'carte_plats', 'plat_formats'], charger);
  }, [legacySB, etabId, charger]);
  useResumeRefresh(charger);

  const carte = cartes.find((c) => c.id === carteChoisie) || cartes[0] || null;
  const boissons = React.useMemo(() => {
    if (!carte || !plats) return [];
    return plats
      .filter((p) => p.actif !== false && (p.carteIds || []).includes(carte.id))
      .map((p) => ({ ...p, formats: formats.get(p.id) || [] }));
  }, [carte, plats, formats]);
  const match = makeSearchMatcher(recherche);
  const visibles = match.active ? boissons.filter((b) => match(b.nom, b.description, b.categorie)) : boissons;
  const rubriques = grouperParRubrique(visibles);

  const nbFormats = boissons.reduce((s, b) => s + b.formats.length, 0);
  const sansPrix = boissons.filter((b) => prixAffiche(b).prix == null || prixAffiche(b).prix <= 0).length;

  const actions = peutModifier ? (
    <>
      {carte && <Btn variant="primary" onClick={() => setFiche({ boisson: null })} style={s.btn44}>Ajouter une boisson</Btn>}
      <BoutonActions
        id="boissons-gerer"
        label="Gérer"
        style={fst.secondaire}
        titre="Gérer les cartes des boissons"
        sections={[
          {
            items: [
              { titre: 'Nouvelle carte des boissons', detail: 'Une carte de plus, avec ses boissons et ses prix.', onClick: () => setNomCarte({ carte: null }) },
              carte && { titre: 'Renommer la carte', detail: carte.nom, onClick: () => setNomCarte({ carte }) },
              carte && {
                titre: 'Archiver la carte',
                detail: 'Elle sort des onglets et de la caisse. Ses boissons restent.',
                onClick: async () => {
                  if (!confirmLegacy(`Archiver « ${carte.nom} » ? Elle sort des onglets et de la caisse. Ses boissons restent et la carte se restaure quand vous voulez.`)) return;
                  if (await archiveCarte(carte.id, true)) setCarteChoisie(null);
                },
              },
            ],
          },
          {
            titre: 'Restaurer une carte archivée',
            items: archivedCartes.map((c) => ({ titre: c.nom, detail: 'Elle revient dans les onglets.', onClick: () => archiveCarte(c.id, false) })),
          },
        ]}
      />
    </>
  ) : null;

  const etat = carte
    ? (peutModifier ? 'Touchez une boisson pour la modifier.' : 'Les prix de vente de la carte, par format.')
    : null;

  return (
    <div className="boissons-page" data-carte-boissons="">
      <div className="boissons-grille">
        <EnTeteSection etat={etat} actions={actions} />

        {erreur && (
          <Panneau style={s.alerte}>
            <span>{erreur}</span>
            <Btn onClick={charger} style={s.btn44}>Réessayer</Btn>
          </Panneau>
        )}

        {status === 'ready' && cartes.length === 0 && (
          <Panneau style={s.vide}>
            <p style={s.videTitre}>Aucune carte des boissons</p>
            <p style={s.videTexte}>
              {peutModifier
                ? 'Créez une carte des vins, des cocktails ou des softs. Cochez-la ensuite dans les réglages de la caisse pour vendre ses boissons.'
                : 'La direction n\'a pas encore créé de carte des boissons.'}
            </p>
            {peutModifier && <Btn variant="primary" onClick={() => setNomCarte({ carte: null })} style={s.btn44}>Nouvelle carte des boissons</Btn>}
          </Panneau>
        )}

        {carte && (
          <>
            <div className="boissons-reperes">
              <CarteRepere Icone={GlassWater} valeur={<span data-no-translate>{boissons.length}</span>} libelle={boissons.length > 1 ? 'boissons sur la carte' : 'boisson sur la carte'} />
              <CarteRepere Icone={Ruler} valeur={<span data-no-translate>{nbFormats}</span>} libelle={nbFormats > 1 ? 'formats de vente' : 'format de vente'} detail="au verre, en carafe, en bouteille" />
              <CarteRepere Icone={CircleDollarSign} valeur={<span data-no-translate>{sansPrix}</span>} libelle={sansPrix > 1 ? 'boissons sans prix' : 'boisson sans prix'} detail={sansPrix ? 'elles partent sans prix à la caisse' : 'toutes ont un prix'} />
            </div>

            <div style={s.barre}>
              {cartes.length > 1
                ? <SegmentedTabs tabs={cartes.map((c) => ({ id: c.id, label: <span data-no-translate>{c.nom}</span> }))} active={carte.id} onChange={setCarteChoisie} deroulant titre="Cartes" />
                : <span style={s.nomCarte} data-no-translate>{carte.nom}</span>}
              <SearchToggle value={recherche} onChange={setRecherche} placeholder="Rechercher une boisson…" />
            </div>

            {plats == null && !erreur && <p style={s.lecture}>Lecture de la carte.</p>}
            {plats && boissons.length === 0 && (
              <Panneau style={s.vide}>
                <p style={s.videTexte}>{peutModifier ? 'Cette carte n\'a pas encore de boisson. Touchez « Ajouter une boisson » pour en poser une, avec ses formats et ses prix.' : 'Cette carte n\'a pas encore de boisson.'}</p>
              </Panneau>
            )}
            {boissons.length > 0 && visibles.length === 0 && <p style={s.lecture}>Aucune boisson ne correspond à cette recherche.</p>}

            {rubriques.map(([rubrique, liste]) => (
              <Rubrique key={rubrique} rubrique={rubrique} boissons={liste} peutModifier={peutModifier} onOuvrir={(boisson) => setFiche({ boisson })} />
            ))}
          </>
        )}
      </div>

      {fiche && (
        <BoissonFenetre
          boisson={fiche.boisson}
          carteIdDefaut={carte?.id || null}
          etabId={etabId}
          cartes={cartes}
          idsBoissons={idsBoissons}
          onClose={() => setFiche(null)}
          onEnregistre={charger}
        />
      )}
      {nomCarte && (
        <FenetreNomCarte
          carte={nomCarte.carte}
          onClose={() => setNomCarte(null)}
          onValider={async (nom) => {
            if (nomCarte.carte) {
              await renameCarte(nomCarte.carte.id, { nom });
            } else {
              const creee = await addCarte(nom);
              if (creee) setCarteChoisie(creee.id);
            }
            setNomCarte(null);
          }}
        />
      )}
    </div>
  );
}

// Une rubrique : une carte blanche, ses colonnes de formats, une ligne par boisson.
function Rubrique({ rubrique, boissons, peutModifier, onOuvrir }) {
  const colonnes = colonnesFormats(boissons);
  const avecPrixSeul = boissons.some((b) => !b.formats.length);
  const nbColonnes = colonnes.length + (avecPrixSeul ? 1 : 0);
  return (
    <Panneau style={s.panneau}>
      <div className="boissons-entete" style={{ '--boissons-colonnes': nbColonnes }}>
        <span style={s.rubrique}>{rubrique}</span>
        {colonnes.map((c) => <span key={c} className="boissons-colonne" style={s.colonne} data-no-translate>{c}</span>)}
        {avecPrixSeul && <span className="boissons-colonne" style={s.colonne}>Prix</span>}
      </div>
      <div className="boissons-liste">
        {boissons.map((b) => {
          const contenu = (
            <>
              <span style={s.texte}>
                <span style={s.nom} data-no-translate>{b.nom}</span>
                {b.description && <span style={s.description} data-no-translate>{b.description}</span>}
              </span>
              {colonnes.map((c) => {
                const f = formatDeLibelle(b, c);
                return (
                  <span key={c} className="boissons-prix" data-vide={f ? undefined : ''} style={s.prix}>
                    <span className="boissons-prix-format" data-no-translate>{c}</span>
                    <span data-no-translate>{f ? chf(f.prix) : ''}</span>
                  </span>
                );
              })}
              {avecPrixSeul && (
                <span className="boissons-prix" data-vide={b.formats.length || b.prixVente == null ? '' : undefined} style={s.prix}>
                  <span data-no-translate>{!b.formats.length && b.prixVente != null ? chf(b.prixVente) : ''}</span>
                </span>
              )}
            </>
          );
          // Une ligne ne porte que des données (nom, description, formats,
          // prix) : rien n'y part à la traduction.
          const style = { ...s.ligne, '--boissons-colonnes': nbColonnes };
          return peutModifier
            ? <button key={b.id} type="button" className="boissons-ligne" data-boisson={b.id} data-no-translate style={{ ...style, ...s.ligneBouton }} onClick={() => onOuvrir(b)}>{contenu}</button>
            : <div key={b.id} className="boissons-ligne" data-boisson={b.id} data-no-translate style={style}>{contenu}</div>;
        })}
      </div>
    </Panneau>
  );
}

function FenetreNomCarte({ carte, onClose, onValider }) {
  const [nom, setNom] = React.useState(carte?.nom || '');
  const [enCours, setEnCours] = React.useState(false);
  const valider = async () => {
    if (!nom.trim() || enCours) return;
    setEnCours(true);
    await onValider(nom.trim());
    setEnCours(false);
  };
  return (
    <Fenetre
      id="boissons-nom-carte"
      titre={carte ? 'Renommer la carte' : 'Nouvelle carte des boissons'}
      onClose={onClose}
      largeur={420}
      pied={(
        <>
          <button type="button" style={fst.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={fst.primaire} disabled={!nom.trim() || enCours} onClick={valider}>{carte ? 'Renommer' : 'Créer la carte'}</button>
        </>
      )}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fst.label}>Nom de la carte</span>
        <input
          autoFocus
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } }}
          placeholder="Ex : Carte des vins"
          style={fst.champ}
        />
      </label>
    </Fenetre>
  );
}

const s = {
  btn44: { minHeight: 44 },
  alerte: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: 'var(--danger-text)' },
  vide: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 },
  videTitre: { margin: 0, fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  videTexte: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.5 },
  lecture: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  barre: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  nomCarte: { fontSize: 'var(--t4)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  panneau: { padding: '14px 18px 6px', display: 'flex', flexDirection: 'column', minWidth: 0 },
  rubrique: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  colonne: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text3)', textAlign: 'right' },
  ligne: {
    width: '100%', minHeight: 'var(--ligne-aeree)', padding: '8px 0', boxSizing: 'border-box',
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    color: 'var(--text)', fontFamily: 'var(--font)', textAlign: 'left',
  },
  ligneBouton: { background: 'transparent', borderRadius: 0, cursor: 'pointer' },
  texte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)' },
  description: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  prix: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t2)', textAlign: 'right' },
};
