import React from 'react';
import { Btn, Input, SegmentedTabs } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import { libellePoste } from './modeTest.js';
import ListeTriable from './ListeTriable.jsx';
import SectionTerminal from './tpe/SectionTerminal.jsx';
import { COULEURS, LIBELLES_COULEURS, PICTOS, pictoParId } from './boutons.js';
import { CATEGORIES_DEFAUT, ID_A_TRIER, estCategorieDefaut, estCategorieVirtuelle, rangerArticles } from './categories.js';
import {
  DELAIS_NO_SHOW, FAMILLES_PAIEMENT, FORMAT_NUMERO_TVA, HEURES_BASCULE, HEURES_FIN_JOURNEE, LIBELLES_FAMILLES,
  MODES_SUIVRE_MAX, REGLAGES_DEFAUT, fusionnerReglages, libelleModeDefaut,
} from './reglages.js';

// Taux proposés pour une catégorie de caisse : normal, réduit, hors TVA (bons
// cadeaux). Le taux d'hébergement (3,8 %) ne concerne pas la restauration.
const TAUX_CATEGORIE = [8.1, 2.6, 0];

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la caisse (consultant, patron, resp_cuisine : la base refuse les
// autres rôles, l'écran ne leur montre pas le bouton). Depuis le 12.11.2026,
// c'est une section de la page des réglages (SectionReglagesCaisse.jsx la
// monte et lui lit ses données) : plus de feuille ni de voile, le même contenu
// posé dans la page. Dans la Caisse, « Réglages de la caisse » y mène.
//
//   Catégories : créer, renommer, ordonner au glisser, couleur, picto, masquer.
//   Produits   : en choisir plusieurs puis leur catégorie (le tri rapide des
//                boissons) ; dans une catégorie, les ordonner au glisser.
//   Modes, cuissons, « sans » rapides, moyens de paiement, grille.
//   Cartes en vente et délai avant de proposer un no-show (v5).
//   Mode test (v6) : envoyer ou non les tests en cuisine, vider les tickets
//   de test, journal du mode test (consultant et patron).
//
// Chaque geste écrit tout de suite, rien à enregistrer en sortant. Une
// écriture refusée remet l'écran dans l'état d'avant AVANT toute relecture.
// La caisse n'écrit jamais plats.categorie : le rangement vit dans
// caisse_boutons.categorie_id. Tant que la maison n'a aucune catégorie, celles
// du code sont proposées ; elles sont créées en base au premier geste qui les
// touche (la migration ne sème rien).
// Les noms saisis sont des données : data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'categories', label: 'Catégories' },
  { id: 'produits', label: 'Produits' },
  { id: 'modes', label: 'Modes' },
  { id: 'cuissons', label: 'Cuissons' },
  { id: 'sans', label: 'Sans' },
  { id: 'paiement', label: 'Paiement' },
  { id: 'terminal', label: 'Terminal de paiement' },
  { id: 'tva', label: 'TVA et clôture' },
  { id: 'grille', label: 'Grille' },
  { id: 'cartes', label: 'Cartes en vente' },
  { id: 'no_show', label: 'No-show' },
  { id: 'test', label: 'Mode test' },
];

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

// Terminal de paiement (v9) : la section vit dans son fichier, avec ce qui
// touche la clé du prestataire.
export default function ReglagesCaisse({
  etablissementId, articles, boutons, categories, cartes = [], config, onChange,
  poste = null, peutLireJournalTests = false, onTestsVides,
  role = null, terminaux = [], lectureTerminaux = 'lue', onTerminauxChange,
}) {
  const [section, setSection] = React.useState('categories');
  // Copie locale de la config : l'écran suit le geste sans attendre la base.
  const [brouillon, setBrouillon] = React.useState(config || {});
  React.useEffect(() => { setBrouillon(config || {}); }, [config]);
  const reglages = React.useMemo(() => fusionnerReglages(brouillon), [brouillon]);
  const occupe = React.useRef(false);

  const rangement = React.useMemo(
    () => rangerArticles({ articles, boutons, categoriesMaison: categories }),
    [articles, boutons, categories],
  );
  const aucuneMaison = !(categories || []).length;

  // ── Réglages (config jsonb) : une clé à la fois, la base ne garde que ce
  // que la maison a changé (null retire la clé : retour au défaut). ──
  async function regler(partiel) {
    const avant = brouillon;
    const apres = { ...avant, ...partiel };
    Object.keys(partiel).forEach((k) => { if (partiel[k] == null) delete apres[k]; });
    setBrouillon(apres);
    const { error } = await caisse.saveReglages(etablissementId, apres);
    if (error) { setBrouillon(avant); notify(error, 'error'); return false; }
    onChange?.();
    return true;
  }

  // ── Catégories : la première écriture pose celles du code en base. ──
  async function categoriesReelles() {
    if (!aucuneMaison) return categories;
    const { data, error } = await caisse.creerCategories(
      etablissementId,
      CATEGORIES_DEFAUT.map((c, i) => ({ nom: c.nom, ordre: i, picto: c.picto })),
    );
    if (error) { notify(error, 'error'); return null; }
    await onChange?.();
    return data;
  }
  // L'identifiant en base d'une catégorie affichée (créée au besoin).
  async function idReel(categorie) {
    if (!estCategorieDefaut(categorie.id)) return categorie.id;
    const reelles = await categoriesReelles();
    return reelles?.find((c) => c.nom === categorie.nom)?.id || null;
  }
  async function ecrire(action) {
    if (occupe.current) return;
    occupe.current = true;
    try {
      const { error } = (await action()) || {};
      if (error) notify(error, 'error');
      await onChange?.();
    } finally {
      occupe.current = false;
    }
  }

  return (
      <div role="region" aria-label="Réglages de la caisse" data-reglages-caisse="" style={st.section}>
        <SegmentedTabs className="caisse-onglets" tabs={SECTIONS} active={section} onChange={setSection} retourLigne />

        <div style={st.corps}>
          {section === 'categories' && (
            <SectionCategories
              rangement={rangement}
              aucuneMaison={aucuneMaison}
              ecrire={ecrire}
              idReel={idReel}
              categoriesReelles={categoriesReelles}
              etablissementId={etablissementId}
            />
          )}
          {section === 'produits' && (
            <SectionProduits
              rangement={rangement}
              boutons={boutons}
              ecrire={ecrire}
              idReel={idReel}
              etablissementId={etablissementId}
            />
          )}
          {section === 'modes' && <SectionModes reglages={reglages} regler={regler} />}
          {section === 'cuissons' && (
            <SectionListe
              titre="Cuissons proposées sur la fiche d'une ligne"
              valeurs={reglages.cuissons}
              perso={reglages.perso.cuissons}
              placeholder="Nouvelle cuisson"
              onChange={(liste) => regler({ cuissons: liste })}
              onDefaut={() => regler({ cuissons: null })}
            />
          )}
          {section === 'sans' && (
            <SectionListe
              titre="« Sans » toujours proposés (gluten, lactose, oignon...)"
              aide="Les derniers « sans » saisis en service restent proposés à la suite."
              valeurs={reglages.sans_rapides}
              perso
              videPermis
              placeholder="Sans quoi ?"
              onChange={(liste) => regler({ sans_rapides: liste })}
            />
          )}
          {section === 'paiement' && <SectionPaiement reglages={reglages} regler={regler} />}
          {section === 'terminal' && (
            <SectionTerminal
              etablissementId={etablissementId}
              role={role}
              config={brouillon}
              regler={regler}
              terminaux={terminaux}
              lecture={lectureTerminaux}
              onChange={onTerminauxChange}
            />
          )}
          {section === 'tva' && (
            <SectionTva rangement={rangement} reglages={reglages} regler={regler} ecrire={ecrire} idReel={idReel} />
          )}
          {section === 'grille' && (
            <div style={st.bloc}>
              <div style={st.sousTitre}>Taille des boutons produits</div>
              <div style={st.rang}>
                <Btn variant={reglages.grille === 'large' ? 'primary' : 'ghost'} onClick={() => regler({ grille: null })} style={st.btnChoix}>Grands boutons</Btn>
                <Btn variant={reglages.grille === 'dense' ? 'primary' : 'ghost'} onClick={() => regler({ grille: 'dense' })} style={st.btnChoix}>Grille dense</Btn>
              </div>
              <p style={st.aide}>La grille dense montre plus de produits par écran. Les boutons restent à 44 px au moins.</p>
              <div style={st.sousTitre}>À l'ouverture d'un ticket, la grille montre</div>
              <div style={st.rang}>
                <Btn variant={reglages.ouverture === 'tout' ? 'primary' : 'ghost'} onClick={() => regler({ ouverture: null })} style={st.btnChoix}>Tous les produits</Btn>
                <Btn variant={reglages.ouverture === 'categorie' ? 'primary' : 'ghost'} onClick={() => regler({ ouverture: 'categorie' })} style={st.btnChoix}>La première catégorie</Btn>
              </div>
              <p style={st.aide}>Avec une grande carte, ouvrir sur la première catégorie évite de faire défiler toute la liste.</p>
            </div>
          )}
          {section === 'cartes' && <SectionCartes cartes={cartes} reglages={reglages} regler={regler} />}
          {section === 'no_show' && (
            <div style={st.bloc}>
              <div style={st.sousTitre}>Proposer une réservation en no-show après</div>
              <div style={st.rang}>
                {DELAIS_NO_SHOW.map((d) => (
                  <Btn
                    key={d}
                    variant={reglages.delai_no_show_min === d ? 'primary' : 'ghost'}
                    onClick={() => regler({ delai_no_show_min: d === REGLAGES_DEFAUT.delai_no_show_min ? null : d })}
                    style={st.btnChoix}
                  >
                    <span style={st.num}>{d}</span> <span>min</span>
                  </Btn>
                ))}
              </div>
              <p style={st.aide}>
                Passé ce délai après l'heure réservée, une réservation confirmée sans table ouverte apparaît dans « Réservations sans ticket ». La caisse ne marque jamais un no-show seule : un tap le confirme.
              </p>
            </div>
          )}
          {section === 'test' && (
            <SectionTest
              etablissementId={etablissementId}
              reglages={reglages}
              regler={regler}
              poste={poste}
              peutLireJournal={peutLireJournalTests}
              onTestsVides={onTestsVides}
            />
          )}
        </div>
      </div>
  );
}

// ── Catégories ───────────────────────────────────────────────────────────────
function SectionCategories({ rangement, aucuneMaison, ecrire, idReel, categoriesReelles, etablissementId }) {
  const [nouveau, setNouveau] = React.useState('');
  const [editee, setEditee] = React.useState(null); // id de la catégorie ouverte
  const liste = rangement.categories.filter((c) => !estCategorieVirtuelle(c.id));

  async function ajouter() {
    const nom = nouveau.trim().slice(0, 40);
    if (!nom) return;
    await ecrire(async () => {
      const reelles = await categoriesReelles();
      if (!reelles) return {};
      const ordre = reelles.reduce((m, c) => Math.max(m, c.ordre), -1) + 1;
      const r = await caisse.creerCategories(etablissementId, [{ nom, ordre }]);
      if (!r.error) setNouveau('');
      return r;
    });
  }

  async function ordonner(ids) {
    await ecrire(async () => {
      const reelles = await categoriesReelles();
      if (!reelles) return {};
      // Les ids affichés peuvent être ceux des défauts du code : passer par le nom.
      const parAffiche = new Map(liste.map((c) => [String(c.id), c.nom]));
      const reels = ids.map((id) => reelles.find((c) => c.id === id || c.nom === parAffiche.get(String(id)))?.id).filter(Boolean);
      return caisse.ordonnerCategories(reels);
    });
  }

  return (
    <div style={st.bloc}>
      {aucuneMaison && (
        <p style={st.aide}>La caisse utilise les catégories proposées. Elles deviennent les vôtres au premier changement.</p>
      )}
      <ListeTriable
        items={liste}
        cle={(c) => c.id}
        onOrdonner={ordonner}
        rendu={(c) => {
          const picto = pictoParId(c.picto);
          return editee === c.id ? (
            <EditeurCategorie
              categorie={c}
              vide={c.articles.length === 0}
              onEnregistrer={(valeurs) => ecrire(async () => {
                const id = await idReel(c);
                if (!id) return {};
                const r = await caisse.majCategorie(id, valeurs);
                if (!r.error) setEditee(null);
                return r;
              })}
              onSupprimer={() => ecrire(async () => {
                const id = await idReel(c);
                if (!id) return {};
                setEditee(null);
                return caisse.supprimerCategorie(id);
              })}
              onFermer={() => setEditee(null)}
            />
          ) : (
            <div style={st.ligneCat}>
              <span style={{ ...st.pastilleCat, ...(c.couleur ? { background: `var(--caisse-${c.couleur})` } : null) }} data-cadre="" aria-hidden="true">
                {picto && <picto.Icone size={16} strokeWidth={1.75} />}
              </span>
              <span style={st.nomCat}>
                <span data-no-translate style={c.actif === false ? st.masquee : null}>{c.nom}</span>
                <span style={st.compte}>
                  <span style={st.num}>{c.articles.length}</span> <span>{c.articles.length > 1 ? 'produits' : 'produit'}</span>
                  {c.actif === false && <>{', '}<span>masquée</span></>}
                </span>
              </span>
              <Btn variant="ghost" onClick={() => setEditee(c.id)} style={st.btn44}>Modifier</Btn>
              <Btn
                variant="ghost"
                onClick={() => ecrire(async () => {
                  const id = await idReel(c);
                  return id ? caisse.majCategorie(id, { actif: c.actif === false }) : {};
                })}
                style={st.btn44}
              >
                {c.actif === false ? 'Afficher' : 'Masquer'}
              </Btn>
            </div>
          );
        }}
      />
      <div style={st.rang}>
        <Input value={nouveau} onChange={(e) => setNouveau(e.target.value.slice(0, 40))} placeholder="Nouvelle catégorie" style={st.champ} />
        <Btn variant="primary" onClick={ajouter} style={st.btn44}>Ajouter</Btn>
      </div>
      <p style={st.aide}>Une catégorie masquée disparaît des onglets ; ses produits restent trouvables par la recherche.</p>
    </div>
  );
}

function EditeurCategorie({ categorie, vide, onEnregistrer, onSupprimer, onFermer }) {
  const [nom, setNom] = React.useState(categorie.nom);
  const [couleur, setCouleur] = React.useState(categorie.couleur || null);
  const [picto, setPicto] = React.useState(categorie.picto || null);
  return (
    <div style={st.editeur}>
      <Input value={nom} onChange={(e) => setNom(e.target.value.slice(0, 40))} placeholder="Nom de la catégorie" style={st.champ} />
      <div style={st.sousTitre}>Couleur des boutons de la catégorie</div>
      <div style={st.rang}>
        <Btn variant={couleur == null ? 'primary' : 'ghost'} onClick={() => setCouleur(null)} style={st.btn44}>Aucune</Btn>
        {COULEURS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={LIBELLES_COULEURS[c]}
            onClick={() => setCouleur(c)}
            style={{
              ...st.pastille,
              background: `var(--caisse-${c})`,
              borderColor: couleur === c ? 'var(--accent)' : 'var(--border)',
              borderWidth: couleur === c ? 3 : 1,
            }}
          />
        ))}
      </div>
      <div style={st.sousTitre}>Pictogramme</div>
      <div style={st.rang}>
        <Btn variant={picto == null ? 'primary' : 'ghost'} onClick={() => setPicto(null)} style={st.btn44}>Aucun</Btn>
        {PICTOS.map((p) => (
          <Btn key={p.id} variant={picto === p.id ? 'primary' : 'ghost'} onClick={() => setPicto(p.id)} style={st.btn44} ariaLabel={p.libelle}>
            <p.Icone size={20} strokeWidth={1.75} aria-hidden="true" />
          </Btn>
        ))}
      </div>
      <div style={{ ...st.rang, justifyContent: 'space-between', marginTop: 6 }}>
        {vide
          ? <Btn variant="danger" onClick={onSupprimer} style={st.btn44}>Supprimer</Btn>
          : <span style={st.aide}>Une catégorie se supprime une fois vidée de ses produits.</span>}
        <span style={st.rang}>
          <Btn variant="ghost" onClick={onFermer} style={st.btn44}>Annuler</Btn>
          <Btn
            variant="primary"
            onClick={() => { const n = nom.trim(); if (n) onEnregistrer({ nom: n, couleur, picto }); }}
            style={st.btn44}
          >
            Enregistrer
          </Btn>
        </span>
      </div>
    </div>
  );
}

// ── Produits : ranger et ordonner ────────────────────────────────────────────
function SectionProduits({ rangement, boutons, ecrire, idReel, etablissementId }) {
  const [filtre, setFiltre] = React.useState(null);
  const [recherche, setRecherche] = React.useState('');
  const [choisis, setChoisis] = React.useState([]);

  const avecProduits = rangement.categories.filter((c) => c.articles.length > 0);
  // On ouvre sur les boissons à trier quand il y en a : c'est le tri attendu.
  const defaut = avecProduits.find((c) => c.id === ID_A_TRIER)?.id || avecProduits[0]?.id || null;
  const actif = avecProduits.some((c) => c.id === filtre) ? filtre : defaut;
  const categorie = rangement.categories.find((c) => c.id === actif) || null;
  const match = makeSearchMatcher(recherche);
  const produits = (categorie?.articles || []).filter((a) => match(a.nom, boutons?.[a.id]?.nom_court));
  const cibles = rangement.categories.filter((c) => !estCategorieVirtuelle(c.id) && c.id !== actif);
  const tousChoisis = produits.length > 0 && produits.every((a) => choisis.includes(a.id));
  const triable = Boolean(categorie) && !estCategorieVirtuelle(categorie.id) && !recherche.trim();

  const basculer = (id) => setChoisis((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  async function ranger(cible) {
    const ids = choisis.filter((id) => produits.some((a) => a.id === id));
    if (!ids.length) return;
    await ecrire(async () => {
      const id = await idReel(cible);
      if (!id) return {};
      const r = await caisse.rangerProduits(etablissementId, ids, id);
      if (!r.error) { setChoisis([]); notify('Produits rangés', 'success'); }
      return r;
    });
  }

  const rang = (a) => (
    <label style={st.produit}>
      <input type="checkbox" checked={choisis.includes(a.id)} onChange={() => basculer(a.id)} style={st.case} />
      <span data-no-translate style={st.produitNom}>{a.nom}</span>
    </label>
  );

  return (
    <div style={st.bloc}>
      <SegmentedTabs
        className="caisse-onglets"
        tabs={avecProduits.map((c) => ({
          id: c.id,
          label: <><span data-no-translate>{c.nom}</span> <span style={st.num}>{c.articles.length}</span></>,
        }))}
        active={actif}
        onChange={(id) => { setFiltre(id); setChoisis([]); }}
        retourLigne
      />
      <div style={st.rang}>
        <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un produit" style={st.champ} />
        <Btn
          variant="ghost"
          onClick={() => setChoisis(tousChoisis ? [] : produits.map((a) => a.id))}
          style={st.btn44}
        >
          {tousChoisis ? 'Tout décocher' : 'Tout cocher'}
        </Btn>
      </div>

      {choisis.length > 0 && (
        <div style={st.barreRanger} data-cadre="">
          <div style={st.sousTitre}><span style={st.num}>{choisis.length}</span> <span>{choisis.length > 1 ? 'produits choisis, à ranger dans :' : 'produit choisi, à ranger dans :'}</span></div>
          <div style={st.rang}>
            {cibles.map((c) => (
              <Btn key={c.id} variant="primary" onClick={() => ranger(c)} style={st.btn44}>
                <span data-no-translate>{c.nom}</span>
              </Btn>
            ))}
          </div>
        </div>
      )}

      {!produits.length && <p style={st.aide}>Aucun produit ici.</p>}
      {triable ? (
        <ListeTriable
          items={produits}
          cle={(a) => a.id}
          onOrdonner={(ids) => ecrire(() => caisse.ordonnerProduits(etablissementId, ids))}
          rendu={rang}
        />
      ) : (
        <div style={st.listeSimple}>{produits.map((a) => <div key={a.id} style={st.rangSimple}>{rang(a)}</div>)}</div>
      )}
      {triable && produits.length > 1 && (
        <p style={st.aide}>Glissez la poignée pour changer l'ordre des produits dans cette catégorie.</p>
      )}
    </div>
  );
}

// ── Modes ────────────────────────────────────────────────────────────────────
function SectionModes({ reglages, regler }) {
  const { visibles, max, libelles } = reglages.modes;
  const [noms, setNoms] = React.useState(libelles);
  React.useEffect(() => { setNoms(libelles); }, [libelles]);
  const ecrireModes = (partiel) => regler({ modes: { visibles, max, libelles, ...partiel } });
  const rangs = Array.from({ length: 1 + max }, (_, i) => i + 1);

  return (
    <div style={st.bloc}>
      <div style={st.sousTitre}>Modes « à suivre » toujours affichés</div>
      <div style={st.rang}>
        <Btn variant="ghost" onClick={() => ecrireModes({ visibles: Math.max(0, visibles - 1) })} style={st.btn44} ariaLabel="Un mode de moins">-1</Btn>
        <span style={st.grandNombre}>{visibles}</span>
        <Btn variant="ghost" onClick={() => ecrireModes({ visibles: Math.min(MODES_SUIVRE_MAX, visibles + 1), max: Math.max(max, Math.min(MODES_SUIVRE_MAX, visibles + 1)) })} style={st.btn44} ariaLabel="Un mode de plus">+1</Btn>
      </div>
      <div style={st.sousTitre}>Jusqu'où le « + » peut ouvrir des modes en service</div>
      <div style={st.rang}>
        <Btn variant="ghost" onClick={() => ecrireModes({ max: Math.max(visibles, max - 1) })} style={st.btn44} ariaLabel="Un mode de moins au plus">-1</Btn>
        <span style={st.grandNombre}>{max}</span>
        <Btn variant="ghost" onClick={() => ecrireModes({ max: Math.min(MODES_SUIVRE_MAX, max + 1) })} style={st.btn44} ariaLabel="Un mode de plus au plus">+1</Btn>
      </div>
      <p style={st.aide}>
        {max > visibles
          ? 'Le « + » de la barre de modes ouvre les modes suivants, un par un.'
          : 'Sans « + » : la barre montre toujours les mêmes modes.'}
      </p>
      <div style={st.sousTitre}>Nom de chaque mode</div>
      {rangs.map((s) => {
        const valeur = noms[s - 1] || '';
        const change = valeur.trim() !== (libelles[s - 1] || '');
        return (
          <div key={s} style={st.rang}>
            <Input
              value={valeur}
              onChange={(e) => { const suite = [...noms]; while (suite.length < s) suite.push(''); suite[s - 1] = e.target.value.slice(0, 24); setNoms(suite); }}
              placeholder={libelleModeDefaut(s)}
              style={st.champ}
            />
            <Btn
              variant={change ? 'primary' : 'ghost'}
              disabled={!change}
              onClick={() => { const suite = rangs.map((r) => (noms[r - 1] || '').trim()); ecrireModes({ libelles: suite }); }}
              style={st.btn44}
            >
              Renommer
            </Btn>
          </div>
        );
      })}
      <p style={st.aide}>Un nom vide reprend le nom proposé. Les modes ne changent rien en cuisine : le bon part quand on l'envoie ou qu'on réclame la suite.</p>
    </div>
  );
}

// ── Liste de textes (cuissons, « sans » rapides) ─────────────────────────────
function SectionListe({ titre, aide, valeurs, perso, videPermis = false, placeholder, onChange, onDefaut }) {
  const [nouveau, setNouveau] = React.useState('');
  function ajouter() {
    const v = nouveau.trim().slice(0, 30);
    if (!v || valeurs.includes(v)) { setNouveau(''); return; }
    onChange([...valeurs, v]);
    setNouveau('');
  }
  return (
    <div style={st.bloc}>
      <div style={st.sousTitre}>{titre}</div>
      {!valeurs.length && <p style={st.aide}>Aucun pour l'instant.</p>}
      <div style={st.listeSimple}>
        {valeurs.map((v) => (
          <div key={v} style={st.rangSimple}>
            <span style={st.produitNom}>{perso ? <span data-no-translate>{v}</span> : v}</span>
            <Btn
              variant="ghost"
              disabled={!videPermis && valeurs.length <= 1}
              onClick={() => onChange(valeurs.filter((x) => x !== v))}
              style={st.btn44}
            >
              Retirer
            </Btn>
          </div>
        ))}
      </div>
      <div style={st.rang}>
        <Input value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder={placeholder} style={st.champ} />
        <Btn variant="primary" onClick={ajouter} style={st.btn44}>Ajouter</Btn>
      </div>
      {aide && <p style={st.aide}>{aide}</p>}
      {onDefaut && perso && (
        <div><Btn variant="ghost" onClick={onDefaut} style={st.btn44}>Revenir à la liste proposée</Btn></div>
      )}
    </div>
  );
}

// ── Cartes en vente (v5) ─────────────────────────────────────────────────────
// La maison choisit quelles cartes alimentent la caisse. Sans choix
// (cartes_ids absente), toutes les cartes actives vendent, celles créées plus
// tard comprises. Seules les cartes actives sont listées : une carte archivée
// ou cachée ne vend jamais, et son nom ne s'affiche pas ici. Tout cocher
// revient au réglage par défaut ; la dernière carte ne se décoche pas (une
// liste vide voudrait dire « toutes »).
function SectionCartes({ cartes, reglages, regler }) {
  const ids = cartes.map((c) => c.id);
  const choisies = reglages.cartes_ids.filter((id) => ids.includes(id));
  const restreint = reglages.cartes_ids.length > 0;
  const cochee = (id) => !restreint || choisies.includes(id);

  function basculer(id) {
    const avant = restreint ? choisies : ids;
    const apres = avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id];
    if (!apres.length) { notify('Gardez au moins une carte en vente.', 'warning'); return; }
    const toutes = ids.every((x) => apres.includes(x));
    regler({ cartes_ids: toutes ? null : ids.filter((x) => apres.includes(x)) });
  }

  return (
    <div style={st.bloc}>
      <div style={st.sousTitre}>Cartes qui alimentent la caisse</div>
      {!cartes.length && <p style={st.aide}>Aucune carte active dans cette maison : tous les plats actifs sont en vente.</p>}
      <div style={st.listeSimple}>
        {cartes.map((c) => (
          <div key={c.id} style={st.rangSimple}>
            <label style={st.produit}>
              <input type="checkbox" checked={cochee(c.id)} onChange={() => basculer(c.id)} style={st.case} />
              <span style={st.produitNom} data-no-translate>{c.nom}</span>
            </label>
          </div>
        ))}
      </div>
      {restreint && !choisies.length && cartes.length > 0 && (
        <p style={st.aide}>Les cartes choisies ne sont plus actives : rien n'est en vente tant qu'aucune carte n'est cochée.</p>
      )}
      <p style={st.aide}>
        {restreint
          ? 'Une carte créée plus tard ne vendra qu\'une fois cochée ici. Les tickets ouverts gardent leurs lignes.'
          : 'Toutes les cartes actives vendent, celles créées plus tard aussi. Décochez une carte pour la retirer de la caisse.'}
      </p>
      <p style={st.aide}>Une carte archivée ou cachée ne vend jamais.</p>
      {restreint && (
        <div><Btn variant="ghost" onClick={() => regler({ cartes_ids: null })} style={st.btn44}>Remettre toutes les cartes en vente</Btn></div>
      )}
    </div>
  );
}

// ── Mode test (v6) ───────────────────────────────────────────────────────────
// Le réglage « Envoyer les tests en cuisine », la purge des tickets de test
// et, pour consultant et patron (la base ne le rend qu'à eux), le journal du
// mode test : qui est entré, sorti, a vidé, sur quel poste, combien de tickets
// et pour quel montant.
const ACTIONS_JOURNAL = {
  entree: 'Entrée en mode test',
  sortie: 'Sortie du mode test',
  purge: 'Tickets de test vidés',
};

function SectionTest({ etablissementId, reglages, regler, poste, peutLireJournal, onTestsVides }) {
  const [journal, setJournal] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);

  const lireJournal = React.useCallback(async () => {
    if (!peutLireJournal) return;
    const { data, error } = await caisse.listJournalTests(etablissementId);
    if (!error) setJournal(data);
  }, [etablissementId, peutLireJournal]);
  React.useEffect(() => { lireJournal(); }, [lireJournal]);

  async function vider() {
    if (enCours) return;
    if (!window.confirm('Supprimer tous les tickets de test de la maison, sur tous les postes ? Les vrais tickets ne sont pas touchés.')) return;
    setEnCours(true);
    try {
      const { error } = await caisse.viderTests(etablissementId, poste);
      if (error) { notify(error, 'error'); return; }
      notify('Tickets de test vidés', 'success');
      onTestsVides?.();
      lireJournal();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={st.bloc}>
      <div style={st.sousTitre}>Envoyer les tests en cuisine</div>
      <div style={st.rang}>
        <Btn variant={reglages.tests_en_cuisine ? 'ghost' : 'primary'} onClick={() => regler({ tests_en_cuisine: null })} style={st.btnChoix}>Non, rien en cuisine</Btn>
        <Btn variant={reglages.tests_en_cuisine ? 'primary' : 'ghost'} onClick={() => regler({ tests_en_cuisine: true })} style={st.btnChoix}>Oui, avec TEST en tête du bon</Btn>
      </div>
      <p style={st.aide}>
        Par défaut, un ticket de test ne part pas en cuisine. Activez l'envoi pour former aussi la cuisine : chaque bon porte alors TEST devant le nom de la table.
      </p>

      <div style={st.sousTitre}>Tickets de test</div>
      <p style={st.aide}>
        Les tickets de test ne comptent dans aucun chiffre et s'effacent seuls au bout de 24 heures. Les vider ici supprime ceux de toute la maison, sur tous les postes ; les vrais tickets ne sont jamais touchés.
      </p>
      <div><Btn variant="danger" disabled={enCours} onClick={vider} style={st.btn44}>Vider les tickets de test</Btn></div>

      {peutLireJournal && (
        <>
          <div style={st.sousTitre}>Journal du mode test</div>
          {journal && !journal.length && <p style={st.aide}>Le mode test n'a pas encore servi dans cette maison.</p>}
          <div style={st.listeSimple} data-caisse-journal-tests="">
            {(journal || []).map((j) => {
              const quand = zurichDateHeure(j.created_at);
              const nomPoste = libellePoste(j.poste);
              return (
                <div key={j.id} style={st.rangJournal}>
                  <span style={st.journalQuand}><span style={st.num}>{quand.date}</span> <span style={st.num}>{quand.heure}</span></span>
                  <span style={st.journalCorps}>
                    <span style={st.journalAction}>{ACTIONS_JOURNAL[j.action] || j.action}</span>
                    <span style={st.journalDetail}>
                      {j.auteur_nom ? <span data-no-translate>{j.auteur_nom}</span> : <span>Purge automatique</span>}
                      {nomPoste && <span><span>poste</span> <span style={st.num} data-no-translate>{nomPoste}</span></span>}
                      <span><span style={st.num}>{j.nombre}</span> <span>{Number(j.nombre) > 1 ? 'tickets de test' : 'ticket de test'}</span></span>
                      <span><span style={st.num}>{chf(j.montant)}</span> <span>CHF</span></span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Moyens de paiement ───────────────────────────────────────────────────────
function SectionPaiement({ reglages, regler }) {
  const moyens = reglages.moyens_paiement;
  const perso = reglages.perso.moyens_paiement;
  const [libelle, setLibelle] = React.useState('');
  const [famille, setFamille] = React.useState('autre');
  const ecrireMoyens = (liste) => regler({ moyens_paiement: liste });

  function ajouter() {
    const l = libelle.trim().slice(0, 40);
    if (!l || moyens.some((m) => m.libelle === l)) return;
    ecrireMoyens([...moyens, { cle: famille, libelle: l }]);
    setLibelle('');
  }

  return (
    <div style={st.bloc}>
      <div style={st.sousTitre}>Boutons proposés à l'encaissement, dans cet ordre</div>
      <ListeTriable
        items={moyens}
        cle={(m) => m.libelle}
        onOrdonner={(libelles) => ecrireMoyens(libelles.map((l) => moyens.find((m) => m.libelle === l)).filter(Boolean))}
        rendu={(m) => (
          <div style={st.ligneCat}>
            <span style={st.nomCat}>
              {perso ? <span data-no-translate>{m.libelle}</span> : <span>{m.libelle}</span>}
              <span style={st.compte}><span>Compté en :</span> <span>{LIBELLES_FAMILLES[m.cle]}</span></span>
            </span>
            <Btn
              variant="ghost"
              disabled={moyens.length <= 1}
              onClick={() => ecrireMoyens(moyens.filter((x) => x.libelle !== m.libelle))}
              style={st.btn44}
            >
              Retirer
            </Btn>
          </div>
        )}
      />
      <div style={st.sousTitre}>Ajouter un moyen</div>
      <div style={st.rang}>
        <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="TWINT, bon cadeau, chambre..." style={st.champ} />
      </div>
      <div style={st.rang}>
        <span style={st.aide}>Compté en :</span>
        {FAMILLES_PAIEMENT.map((f) => (
          <Btn key={f} variant={famille === f ? 'primary' : 'ghost'} onClick={() => setFamille(f)} style={st.btn44}>{LIBELLES_FAMILLES[f]}</Btn>
        ))}
        <Btn variant="primary" onClick={ajouter} style={st.btn44}>Ajouter</Btn>
      </div>
      {perso && (
        <div><Btn variant="ghost" onClick={() => regler({ moyens_paiement: null })} style={st.btn44}>Revenir à la liste proposée</Btn></div>
      )}
      <p style={st.aide}>{`Liste proposée : ${REGLAGES_DEFAUT.moyens_paiement.map((m) => m.libelle).join(', ')}.`}</p>
    </div>
  );
}

// ── TVA et clôture (v7) ──────────────────────────────────────────────────────
// Taux par catégorie et taux réduit à l'emporter (colonnes de
// caisse_categories ; la base les lit à l'encaissement et fige le taux sur
// chaque ligne), arrondi des espèces, fin de la journée, bascule midi et
// soir, coordonnées imprimées sur la quittance. Rien n'est inventé : un champ
// vide n'est pas imprimé.
function SectionTva({ rangement, reglages, regler, ecrire, idReel }) {
  const categories = rangement.categories.filter((c) => !estCategorieVirtuelle(c.id));
  const [legal, setLegal] = React.useState(reglages.legal);
  React.useEffect(() => { setLegal(reglages.legal); }, [reglages.legal]);
  const modifie = JSON.stringify(legal) !== JSON.stringify(reglages.legal);
  const numeroDouteux = legal.numero_tva.trim() !== '' && !FORMAT_NUMERO_TVA.test(legal.numero_tva.trim());

  const majCategorie = (c, partiel) => ecrire(async () => {
    const id = await idReel(c);
    if (!id) return { error: null };
    return caisse.majTvaCategorie(id, partiel);
  });

  return (
    <div style={st.bloc} data-reglages-tva="">
      <div style={st.sousTitre}>Taux de TVA par catégorie</div>
      <p style={st.aide}>
        Sur place, le taux de la catégorie s'applique. Quand un ticket est marqué à emporter, seules les catégories cochées passent au taux réduit ; l'alcool reste toujours au taux normal. Le taux est figé sur chaque ligne à l'encaissement.
      </p>
      <div style={st.listeSimple}>
        {categories.map((c) => (
          <div key={c.id} style={st.rangTva} data-tva-categorie="">
            <span style={st.produitNom} data-no-translate>{c.nom}</span>
            <span style={st.rang}>
              {TAUX_CATEGORIE.map((t) => (
                <Btn
                  key={t}
                  variant={Number(c.taux_tva ?? 8.1) === t ? 'primary' : 'ghost'}
                  onClick={() => majCategorie(c, { tauxTva: t })}
                  style={st.btn44}
                >
                  <span style={st.num}>{String(t).replace('.', ',')}</span> <span>%</span>
                </Btn>
              ))}
              <label style={st.produit}>
                <input
                  type="checkbox"
                  checked={Boolean(c.emporter_reduit)}
                  onChange={(e) => majCategorie(c, { emporterReduit: e.target.checked })}
                  style={st.case}
                />
                <span style={st.aide}>Taux réduit à emporter</span>
              </label>
            </span>
          </div>
        ))}
      </div>
      <p style={st.aide}>Un article libre, ou un produit hors de ces catégories, reste au taux normal, à emporter compris.</p>

      <div style={st.sousTitre}>Espèces</div>
      <div style={st.rang}>
        <Btn variant={reglages.arrondi_especes ? 'primary' : 'ghost'} onClick={() => regler({ arrondi_especes: null })} style={st.btnChoix}>Arrondir aux 5 centimes</Btn>
        <Btn variant={reglages.arrondi_especes ? 'ghost' : 'primary'} onClick={() => regler({ arrondi_especes: false })} style={st.btnChoix}>Au centime</Btn>
      </div>
      <p style={st.aide}>L'arrondi ne porte que sur la part payée en espèces. L'écart est enregistré à part sur chaque ticket et repris dans la clôture.</p>

      <div style={st.sousTitre}>La journée de caisse finit à</div>
      <div style={st.rang}>
        {HEURES_FIN_JOURNEE.map((h) => (
          <Btn key={h} variant={reglages.fin_journee === h ? 'primary' : 'ghost'} onClick={() => regler({ fin_journee: h === REGLAGES_DEFAUT.fin_journee ? null : h })} style={st.btn44}>
            <span style={st.num}>{h}</span>
          </Btn>
        ))}
      </div>
      <p style={st.aide}>Un ticket encaissé après minuit reste sur le jour du service, jusqu'à cette heure.</p>

      <div style={st.sousTitre}>Le service passe de midi à soir à</div>
      <div style={st.rang}>
        {HEURES_BASCULE.map((h) => (
          <Btn key={h} variant={reglages.bascule_service === h ? 'primary' : 'ghost'} onClick={() => regler({ bascule_service: h === REGLAGES_DEFAUT.bascule_service ? null : h })} style={st.btn44}>
            <span style={st.num}>{h}</span>
          </Btn>
        ))}
      </div>

      <div style={st.sousTitre}>Coordonnées imprimées sur la quittance</div>
      <Input value={legal.raison_sociale} onChange={(e) => setLegal({ ...legal, raison_sociale: e.target.value })} placeholder="Raison sociale" style={st.champ} />
      <Input value={legal.adresse} onChange={(e) => setLegal({ ...legal, adresse: e.target.value })} placeholder="Rue et numéro" style={st.champ} />
      <Input value={legal.localite} onChange={(e) => setLegal({ ...legal, localite: e.target.value })} placeholder="Code postal et localité" style={st.champ} />
      <Input value={legal.numero_tva} onChange={(e) => setLegal({ ...legal, numero_tva: e.target.value })} placeholder="CHE-123.456.789 TVA" style={st.champ} />
      {numeroDouteux && <p style={st.aide}>Le numéro de TVA s'écrit CHE-123.456.789 TVA. Recopiez-le depuis le registre des assujettis ou une facture de la maison.</p>}
      {!reglages.legal.numero_tva && <p style={st.aide}>Sans numéro de TVA, la quittance ne porte pas la mention exigée d'un assujetti. La caisse ne l'invente jamais.</p>}
      <div>
        <Btn
          variant="primary"
          disabled={!modifie}
          onClick={() => regler({ legal: Object.values(legal).some((v) => String(v).trim()) ? Object.fromEntries(Object.entries(legal).map(([k, v]) => [k, String(v).trim()])) : null })}
          style={st.btn44}
        >
          Enregistrer les coordonnées
        </Btn>
      </div>
    </div>
  );
}

const st = {
  rangTva: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minHeight: 56, padding: '6px 0',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  // La colonne de l'ancienne feuille (même écart entre les onglets et le
  // corps), sans son cadre : la page des réglages porte le titre.
  section: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 760, minWidth: 0 },
  corps: { minWidth: 0, paddingBottom: 8 },
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 6 },
  aide: { fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  champ: { flex: 1, minWidth: 160, minHeight: 44 },
  btn44: { minHeight: 44, flexShrink: 0 },
  btnChoix: { minHeight: 56, flex: '1 1 160px', fontSize: 15 },
  grandNombre: { fontFamily: 'var(--font-num)', fontSize: 22, fontWeight: 600, minWidth: 40, textAlign: 'center' },
  num: { fontFamily: 'var(--font-num)' },
  // Journal du mode test : une ligne par geste, l'heure à gauche.
  rangJournal: {
    display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 12px', padding: '8px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  journalQuand: { fontSize: 13, color: 'var(--text2)', flexShrink: 0, minWidth: 124 },
  journalCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 220px', minWidth: 0 },
  journalAction: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  journalDetail: { display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 13, color: 'var(--text2)' },
  ligneCat: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '4px 0' },
  pastilleCat: {
    width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface2)', color: 'var(--text)',
  },
  nomCat: { display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)' },
  masquee: { color: 'var(--text2)', textDecoration: 'line-through' },
  compte: { fontSize: 12, fontWeight: 400, color: 'var(--text2)' },
  editeur: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0 12px', minWidth: 0 },
  // Pastille de couleur : cible 44 px, anneau accent quand elle est choisie.
  pastille: { width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', padding: 0, borderStyle: 'solid' },
  barreRanger: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 'var(--r-lg)',
    background: 'var(--surface2)', position: 'sticky', top: 0, zIndex: 3,
  },
  listeSimple: { display: 'flex', flexDirection: 'column' },
  rangSimple: {
    display: 'flex', alignItems: 'center', gap: 8, minHeight: 52,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  produit: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, flex: 1, minWidth: 0, cursor: 'pointer' },
  case: { width: 24, height: 24, flexShrink: 0, accentColor: 'var(--accent)' },
  produitNom: { flex: 1, minWidth: 0, fontSize: 15, color: 'var(--text)', overflowWrap: 'anywhere' },
};
