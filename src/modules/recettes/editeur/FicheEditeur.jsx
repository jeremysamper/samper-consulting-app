import React from 'react';
import { AlertTriangle, Link2, Loader2, Search } from 'lucide-react';
import EcranTache from '../../../components/parcours/EcranTache.jsx';
import DebouncedField from '../../../components/ui/DebouncedField.jsx';
import { BoutonActions, Fenetre, st as fst } from '../../../components/ui/Fenetres.jsx';
import { Encadre, encadreStyle, encadreTitreStyle } from '../../../components/ui/index.jsx';
import { ListeAncree } from '../../../components/ui/ListeAncree.jsx';
import { getBrowserWindow, notifyLegacy } from '../../../legacy/legacyApi.js';
import { dbService } from '../../../services/dbService.js';
import { quandRetoursArrives } from '../../../services/historyNav.js';
import { matchIngredient } from '../../../services/recipeProductMatching.js';
import { applyProductToIngredient } from '../../../services/prixResolution.js';
import { estSurCarteActive, publierSurCarteActive } from '../../../services/carteActive.js';
import { useIsMobile } from '../../../hooks/useIsMobile.js';
import { partitionAllergenes, normalizeAllergenes, labelAllergene } from '../../../utils/allergenes.js';
import { normalizeSearch } from '../../../utils/searchText.js';
import { messageErreur } from '../../../utils/messageErreur.js';
import {
  effacerBrouillon, ecrireBrouillon, empreinteRecette, fusionnerChampsExternes, lireBrouillon,
} from '../../../utils/brouillonRecette.js';
import PhotoUploader from '../../consultant-tools/PhotoUploader.jsx';
import { ALLERGENES_OPTIONS, CATEGORIES_REC, UNITES_REC, convertFactor } from '../../consultant-tools/ConsultantTools.constants.js';
import CataloguePicker from './CataloguePicker.jsx';
import ColleListe from './ColleListe.jsx';
import PlatPicker from './PlatPicker.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Éditeur d'une fiche (recette), dans Cartes & Recettes. Venu des Outils
// consultant le 27.10.2026 sans le chiffrage : aucun prix ni coût ici, ils se
// tiennent dans l'onglet Chiffrage des Outils consultant.
//
// Ordre : nom, ingrédients, étapes (ce qu'on change le plus), puis les
// paramètres, les allergènes, le dressage et les notes. Entrée dans le nom
// d'une ligne passe à sa quantité, dans la quantité à la ligne suivante
// (créée au besoin).
//
// Sauvegarde automatique reprise telle quelle : état local immédiat, brouillon
// local anti-crash, écriture différée de 600 ms, reprise au retour du réseau,
// avertissement si la fiche change ailleurs pendant une saisie (la saisie
// locale garde la main, sauf sur les champs tenus ailleurs : prix, masquage,
// congélation, durées de vie, cf. fusionnerChampsExternes).
//
// Produit du catalogue choisi sur une ligne : il remplit le lien, l'unité, le
// prix de repli (non affiché, lu par le Chiffrage) et ajoute ses allergènes à
// la fiche. Délier la ligne ou retaper son nom remet le prix de repli d'avant
// le choix ; l'unité reste (visible) et les allergènes ajoutés restent : un
// allergène ne se retire que d'un geste explicite.
//
// IA (allergènes, analyse HACCP, suggestions) : consultant seul.
// ─────────────────────────────────────────────────────────────────────────────

const DELAI_SAUVEGARDE = 600;

export default function FicheEditeur({
  recette, user, etablissement, plats = [], cartes = [], reloadCartes,
  nomEnMain = false, onChange, onFermer, onSupprimee, onRecharger,
}) {
  const legacySB = dbService.getBridge();
  const etabId = etablissement?.id || 'etab-1';
  const isConsultant = user?.role === 'consultant';
  const isMobile = useIsMobile();

  const [fiche, setFiche] = React.useState(recette || null);
  const ficheRef = React.useRef(fiche);
  const [saveStatus, setSaveStatus] = React.useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = React.useState('');
  const timerRef = React.useRef(null);
  const dirtyRef = React.useRef(false);
  const dernierEnregistreRef = React.useRef(empreinteRecette(recette));
  const avertiRef = React.useRef('');
  // Brouillon local plus récent que la base, trouvé à l'ouverture.
  const [brouillon, setBrouillon] = React.useState(() => {
    const d = recette ? lireBrouillon(recette.id) : null;
    if (!d?.recipe) return null;
    if (empreinteRecette(d.recipe) === empreinteRecette(recette)) { effacerBrouillon(recette.id); return null; }
    return d;
  });

  // ─── Sauvegarde ───────────────────────────────────────────────────────────
  const enregistrer = React.useCallback(async () => {
    const courante = ficheRef.current;
    if (!legacySB || !courante) return;
    setSaveStatus('saving');
    const empreinte = empreinteRecette(courante);
    try {
      await legacySB.db.upsertRecette(courante);
      if (empreinteRecette(ficheRef.current) === empreinte) dirtyRef.current = false;
      dernierEnregistreRef.current = empreinte;
      effacerBrouillon(courante.id);
      setSaveStatus('saved');
      setSaveError('');
      setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (err) {
      console.error('[FicheEditeur upsertRecette]', err);
      setSaveStatus('error');
      setSaveError(messageErreur(err, 'recettes', 'Synchronisation impossible.'));
      // Le brouillon local reste : nouvel essai au retour du réseau.
    }
  }, [legacySB]);

  const maj = (patch) => {
    const actuelle = ficheRef.current;
    if (!actuelle) return;
    const next = { ...actuelle, ...patch, modifie: new Date().toISOString().slice(0, 10), modifiePar: user?.id || actuelle.modifiePar || null };
    ficheRef.current = next;
    setFiche(next);
    onChange?.(next);
    if (!legacySB) return;
    dirtyRef.current = true;
    ecrireBrouillon(next.id, next);
    setSaveStatus('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; enregistrer(); }, DELAI_SAUVEGARDE);
  };

  // Écriture en attente partie tout de suite à la fermeture de l'éditeur.
  React.useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; enregistrer(); }
  }, [enregistrer]);

  React.useEffect(() => {
    const w = getBrowserWindow();
    if (!w || !legacySB) return undefined;
    const enLigne = () => { if (dirtyRef.current) enregistrer(); };
    w.addEventListener('online', enLigne);
    return () => w.removeEventListener('online', enLigne);
  }, [legacySB, enregistrer]);

  // La fiche de la liste du module change (relecture realtime, Chiffrage,
  // autre appareil) : adoptée si rien n'est en cours, sinon la saisie locale
  // garde la main et seuls les champs tenus ailleurs suivent.
  React.useEffect(() => {
    const locale = ficheRef.current;
    if (!recette || !locale || recette.id !== locale.id) return;
    const serveur = empreinteRecette(recette);
    if (serveur === empreinteRecette(locale) && recette === locale) return;
    if (!dirtyRef.current) {
      ficheRef.current = recette;
      setFiche(recette);
      return;
    }
    const fusion = fusionnerChampsExternes(locale, recette);
    ficheRef.current = fusion;
    setFiche(fusion);
    if (serveur !== dernierEnregistreRef.current && serveur !== empreinteRecette(locale) && avertiRef.current !== serveur) {
      avertiRef.current = serveur;
      notifyLegacy('Fiche modifiée depuis un autre appareil. Vos modifications en cours sont conservées.', 'warning');
    }
  }, [recette]);

  // ─── Catalogue (liaison des lignes, suggestions) ──────────────────────────
  const [catalogue, setCatalogue] = React.useState([]);
  React.useEffect(() => {
    if (!legacySB) return undefined;
    let monte = true;
    const lire = () => legacySB.db.listProduits(etabId).then(ps => { if (monte) setCatalogue(Array.isArray(ps) ? ps : []); }).catch(() => {});
    lire();
    const fin = legacySB.realtime.subscribeReload('produits', lire);
    return () => { monte = false; fin && fin(); };
  }, [legacySB, etabId]);

  // Prix de repli d'une ligne avant qu'un produit lui soit choisi : rendu si
  // le choix est abandonné dans la même séance d'édition.
  const prixAvantLienRef = React.useRef(new Map());
  const [ligneFocus, setLigneFocus] = React.useState(null);
  const [aFocaliser, setAFocaliser] = React.useState(null); // { id, champ: 'nom' | 'qte' }
  const [picker, setPicker] = React.useState(null); // null | 'multi' | id de ligne
  const [rechercheCatalogue, setRechercheCatalogue] = React.useState('');
  const [coller, setColler] = React.useState(false);
  const [rattacher, setRattacher] = React.useState(false);
  const [supprimer, setSupprimer] = React.useState(false);
  const [occupe, setOccupe] = React.useState(false);
  const [iaAllergenes, setIaAllergenes] = React.useState(false);
  const [iaHaccp, setIaHaccp] = React.useState(false);
  const [haccp, setHaccp] = React.useState(null);
  const [iaSuggestions, setIaSuggestions] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState(null);

  React.useEffect(() => {
    if (!aFocaliser) return;
    const el = document.querySelector(`[data-ing-${aFocaliser.champ}="${aFocaliser.id}"]`);
    if (el) { el.focus(); if (typeof el.select === 'function') el.select(); }
    setAFocaliser(null);
  }, [aFocaliser, fiche?.ingredients?.length]);

  React.useEffect(() => {
    if (!nomEnMain) return;
    const el = document.querySelector('[data-fiche-nom]');
    if (el) { el.focus(); el.select(); }
  }, [nomEnMain]);

  if (!fiche) {
    return (
      <EcranTache titre="Fiche introuvable" etat={<>supprimée ou déplacée</>} onRetour={onFermer} />
    );
  }

  const ingredients = fiche.ingredients || [];
  const etapes = fiche.etapes || [];
  // Les gestes lisent la fiche courante, pas celle du dernier rendu : toucher
  // un bouton fait d'abord partir le champ qu'on quitte (blur), et sa valeur
  // doit être dans la liste que le bouton complète.
  const lignesCourantes = () => ficheRef.current.ingredients || [];
  const etapesCourantes = () => ficheRef.current.etapes || [];
  const nouvelId = (k = 0) => 'i' + Date.now() + '_' + k + Math.floor(Math.random() * 1000);

  // ─── Lignes ───────────────────────────────────────────────────────────────
  const fusionAllergenes = (ids) => {
    const actuels = ficheRef.current.allergenesIds || [];
    const fusion = [...new Set([...actuels, ...(ids || [])])];
    return fusion.length > actuels.length ? { allergenesIds: fusion } : {};
  };

  const ajouterLigne = () => {
    const ligne = { id: nouvelId(), nom: '', quantite: 0, unite: 'g', prixUnit: 0, categorie: 'Autres' };
    maj({ ingredients: [...lignesCourantes(), ligne] });
    setAFocaliser({ id: ligne.id, champ: 'nom' });
  };

  const majLigne = (idx, patch) => {
    const lignes = [...(ficheRef.current.ingredients || [])];
    lignes[idx] = { ...lignes[idx], ...patch };
    maj({ ingredients: lignes });
  };

  const retirerLigne = (idx) => {
    const lignes = (ficheRef.current.ingredients || []).filter((_, i) => i !== idx);
    maj({ ingredients: lignes });
  };

  // Le prix d'avant le lien, si la ligne a été liée dans cette séance.
  const prixRendu = (ligne) => {
    const m = prixAvantLienRef.current;
    if (!m.has(ligne.id)) return {};
    const prix = m.get(ligne.id);
    m.delete(ligne.id);
    return { prixUnit: prix };
  };

  const lierProduit = (idx, produit) => {
    const lignes = [...(ficheRef.current.ingredients || [])];
    const avant = lignes[idx];
    if (!avant) return;
    if (!prixAvantLienRef.current.has(avant.id)) prixAvantLienRef.current.set(avant.id, Number(avant.prixUnit) || 0);
    lignes[idx] = applyProductToIngredient(avant, produit);
    maj({ ingredients: lignes, ...fusionAllergenes(produit.allergenes) });
    setLigneFocus(null);
  };

  const delier = (idx) => {
    const ligne = (ficheRef.current.ingredients || [])[idx];
    if (!ligne) return;
    majLigne(idx, { produitId: null, ...prixRendu(ligne) });
  };

  // Nom validé : rapprochement automatique au catalogue, comme avant.
  const validerNom = (idx, nom) => {
    const lignes = [...(ficheRef.current.ingredients || [])];
    const avant = lignes[idx];
    if (!avant || avant.nom === nom) return;
    let next = { ...avant, nom, produitId: null, ...(avant.produitId ? prixRendu(avant) : {}) };
    delete next.needsReview;
    delete next.matchSuggestions;
    const r = matchIngredient(nom, catalogue);
    let allergenes = [];
    if (r.status === 'matched' && r.product) {
      if (!prixAvantLienRef.current.has(next.id)) prixAvantLienRef.current.set(next.id, Number(next.prixUnit) || 0);
      next = applyProductToIngredient(next, r.product);
      allergenes = r.product.allergenes || [];
    } else if (r.status === 'ambiguous') {
      next.needsReview = true;
      next.matchSuggestions = (r.suggestions || []).filter(s => s.product).map(s => ({ produitId: s.product.id, nom: s.product.nom, confidence: s.confidence }));
    }
    lignes[idx] = next;
    maj({ ingredients: lignes, ...fusionAllergenes(allergenes) });
  };

  // Changer d'unité convertit la quantité, et le prix de repli en sens
  // inverse (grandeur par unité), sans l'afficher.
  const changerUnite = (idx, unite) => {
    const ligne = (ficheRef.current.ingredients || [])[idx];
    if (!ligne) return;
    const f = convertFactor(ligne.unite, unite);
    if (f !== null && f !== 1) {
      majLigne(idx, {
        unite,
        quantite: Math.round((Number(ligne.quantite) || 0) * f * 10000) / 10000,
        prixUnit: Math.round(((Number(ligne.prixUnit) || 0) / f) * 100000) / 100000,
      });
    } else {
      majLigne(idx, { unite });
    }
  };

  const ajouterProduits = (produits) => {
    const lignes = [...lignesCourantes()];
    const allergenes = [];
    produits.forEach((p, k) => {
      lignes.push(applyProductToIngredient({ id: nouvelId(k), nom: p.nom, quantite: 0, unite: p.uniteRef || 'g', prixUnit: 0, categorie: 'Autres' }, p));
      (p.allergenes || []).forEach(a => allergenes.push(a));
    });
    maj({ ingredients: lignes, ...fusionAllergenes(allergenes) });
    setPicker(null);
  };

  // Liste collée : chaque ligne passe par le même rapprochement que le nom.
  const ajouterListe = (lues) => {
    const lignes = [...lignesCourantes()];
    const allergenes = [];
    lues.forEach((l, k) => {
      let ligne = { id: nouvelId(k), nom: l.nom, quantite: l.quantite, unite: l.unite, prixUnit: 0, categorie: 'Autres' };
      const r = matchIngredient(l.nom, catalogue);
      if (r.status === 'matched' && r.product) {
        ligne = applyProductToIngredient(ligne, r.product);
        (r.product.allergenes || []).forEach(a => allergenes.push(a));
      } else if (r.status === 'ambiguous') {
        ligne.needsReview = true;
        ligne.matchSuggestions = (r.suggestions || []).filter(s => s.product).map(s => ({ produitId: s.product.id, nom: s.product.nom, confidence: s.confidence }));
      }
      lignes.push(ligne);
    });
    maj({ ingredients: lignes, ...fusionAllergenes(allergenes) });
    setColler(false);
    notifyLegacy(`${lues.length} ingrédient${lues.length > 1 ? 's' : ''} ajouté${lues.length > 1 ? 's' : ''}.`, 'success');
  };

  const entreeNom = (e, ligne) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    setAFocaliser({ id: ligne.id, champ: 'qte' });
  };
  const entreeQte = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const suivante = lignesCourantes()[idx + 1];
    if (suivante) setAFocaliser({ id: suivante.id, champ: 'nom' });
    else { e.target.blur(); ajouterLigne(); }
  };

  // ─── Étapes ───────────────────────────────────────────────────────────────
  const majEtape = (idx, v) => { const l = [...etapesCourantes()]; l[idx] = v; maj({ etapes: l }); };
  const deplacerEtape = (idx, sens) => {
    const l = [...etapesCourantes()];
    const j = idx + sens;
    if (j < 0 || j >= l.length) return;
    [l[idx], l[j]] = [l[j], l[idx]];
    maj({ etapes: l });
  };

  // ─── Allergènes ───────────────────────────────────────────────────────────
  const basculerAllergene = (id) => {
    const a = ficheRef.current.allergenesIds || [];
    maj({ allergenesIds: a.includes(id) ? a.filter(x => x !== id) : [...a, id] });
  };
  const inconnus = partitionAllergenes(fiche.allergenesIds).inconnus;

  const detecterAllergenes = async () => {
    const noms = ingredients.map(i => i.nom).filter(Boolean);
    if (!noms.length) { notifyLegacy('Ajoutez des ingrédients avant la détection.', 'info'); return; }
    setIaAllergenes(true);
    try {
      const { detectAllergens } = await import('../../../services/aiService.js');
      const res = await detectAllergens(noms, fiche.nom);
      const valides = new Set(ALLERGENES_OPTIONS.map(a => a.id));
      const libelle = (id) => (ALLERGENES_OPTIONS.find(a => a.id === id) || {}).label || id;
      const trouves = (res.allergenes || []).filter(id => valides.has(id));
      const douteux = (res.incertains || []).filter(id => valides.has(id));
      const actuels = ficheRef.current.allergenesIds || [];
      const ajoutes = trouves.filter(id => !actuels.includes(id));
      if (ajoutes.length) maj({ allergenesIds: [...new Set([...actuels, ...trouves])] });
      let msg = ajoutes.length ? `${ajoutes.length} allergène(s) ajouté(s) : ${ajoutes.map(libelle).join(', ')}.` : 'Aucun nouvel allergène détecté.';
      if (douteux.length) msg += ` À vérifier : ${douteux.map(libelle).join(', ')}.`;
      notifyLegacy(msg, ajoutes.length ? 'success' : 'info');
    } catch (err) {
      notifyLegacy('Détection impossible. ' + messageErreur(err, 'recettes'), 'error');
    } finally {
      setIaAllergenes(false);
    }
  };

  const genererHaccp = async () => {
    if (!ingredients.length) { notifyLegacy('Ajoutez des ingrédients avant de générer l\'analyse HACCP.', 'info'); return; }
    setIaHaccp(true);
    try {
      const { generateHaccp } = await import('../../../services/aiService.js');
      const res = await generateHaccp(ficheRef.current);
      if (!res.points.length && !res.conservation && !res.remarques) notifyLegacy('Aucune analyse HACCP produite. Réessayez.', 'info');
      else setHaccp(res);
    } catch (err) {
      notifyLegacy('Génération HACCP impossible. ' + messageErreur(err, 'recettes'), 'error');
    } finally {
      setIaHaccp(false);
    }
  };

  const insererHaccp = () => {
    if (!haccp) return;
    const lignes = ['Analyse HACCP (générée automatiquement, à valider par un responsable)'];
    (haccp.points || []).forEach(p => {
      lignes.push(`${p.etape || '-'} : ${p.danger || '-'} [${p.type || '-'}]${p.ccp ? ' (CCP)' : ''}`);
      if (p.mesure) lignes.push(`  Maîtrise : ${p.mesure}`);
      if (p.limiteCritique) lignes.push(`  Limite critique : ${p.limiteCritique}`);
      if (p.surveillance) lignes.push(`  Surveillance : ${p.surveillance}`);
    });
    if (haccp.conservation) lignes.push(`Conservation : ${haccp.conservation}`);
    if (haccp.remarques) lignes.push(`Remarques : ${haccp.remarques}`);
    const bloc = lignes.join('\n');
    const notes = ficheRef.current.notesConsultant || '';
    maj({ notesConsultant: notes ? `${notes}\n\n${bloc}` : bloc });
    notifyLegacy('Analyse HACCP insérée dans les notes du consultant.', 'success');
    setHaccp(null);
  };

  const suggerer = async () => {
    if (!String(fiche.nom || '').trim()) { notifyLegacy('Donnez d\'abord un nom à la fiche.', 'info'); return; }
    setIaSuggestions(true);
    try {
      const { suggestRecipe } = await import('../../../services/aiService.js');
      const res = await suggestRecipe(ficheRef.current, catalogue.map(p => p.nom));
      if (!res.ingredients.length && !res.etapes.length) notifyLegacy('Aucune suggestion : la fiche semble complète.', 'info');
      else setSuggestions(res);
    } catch (err) {
      notifyLegacy('Suggestions impossibles. ' + messageErreur(err, 'recettes'), 'error');
    } finally {
      setIaSuggestions(false);
    }
  };
  const ajouterIngredientsSuggeres = (liste) => {
    const nouvelles = liste.map((ing, k) => ({ id: nouvelId(k), nom: ing.nom, quantite: ing.quantite || 0, unite: ing.unite || 'g', prixUnit: 0, categorie: 'Autres' }));
    maj({ ingredients: [...(ficheRef.current.ingredients || []), ...nouvelles] });
    setSuggestions(prev => (prev ? { ...prev, ingredients: prev.ingredients.filter(i => !liste.includes(i)) } : prev));
  };
  const ajouterEtapesSuggerees = (liste) => {
    maj({ etapes: [...(ficheRef.current.etapes || []), ...liste] });
    setSuggestions(prev => (prev ? { ...prev, etapes: prev.etapes.filter(e => !liste.includes(e)) } : prev));
  };

  // ─── Carte active, plats, suppression ─────────────────────────────────────
  const surCarte = estSurCarteActive(fiche, cartes, etabId);
  const basculerCarte = async (actif) => {
    try {
      const statut = await publierSurCarteActive(ficheRef.current, actif, cartes, etabId);
      maj({ statut });
      reloadCartes?.();
    } catch (err) {
      notifyLegacy('Synchronisation de la carte impossible. ' + messageErreur(err, 'recettes'), 'error');
    }
  };

  const platsDeLaFiche = plats.filter(p => (p.recettes || []).some(pr => pr.recetteId === fiche.id));
  const appliquerPlats = async (platIds) => {
    if (!legacySB) return;
    const avant = new Set(platsDeLaFiche.map(p => p.id));
    const cible = new Set(platIds);
    const aLier = platIds.filter(id => !avant.has(id));
    const aDelier = [...avant].filter(id => !cible.has(id));
    setOccupe(true);
    let ko = 0;
    for (const id of aLier) { try { await legacySB.db.linkRecetteToPlat(id, fiche.id, 'composant', 0); } catch (e) { console.error('[linkRecetteToPlat]', e); ko += 1; } }
    for (const id of aDelier) { try { await legacySB.db.unlinkRecetteFromPlat(id, fiche.id); } catch (e) { console.error('[unlinkRecetteFromPlat]', e); ko += 1; } }
    setOccupe(false);
    setRattacher(false);
    onRecharger?.();
    const parts = [];
    if (aLier.length) parts.push(`${aLier.length} plat${aLier.length > 1 ? 's' : ''} rattaché${aLier.length > 1 ? 's' : ''}`);
    if (aDelier.length) parts.push(`${aDelier.length} lien${aDelier.length > 1 ? 's' : ''} retiré${aDelier.length > 1 ? 's' : ''}`);
    if (ko) parts.push(`${ko} en erreur`);
    if (parts.length) notifyLegacy(parts.join(', '), ko ? 'warning' : 'success');
  };

  const confirmerSuppression = async () => {
    setOccupe(true);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    try {
      if (legacySB) await legacySB.db.deleteRecette(fiche.id);
      effacerBrouillon(fiche.id);
      dirtyRef.current = false;
      notifyLegacy(`« ${fiche.nom} » supprimée.`, 'success');
      // La fenêtre se referme d'abord ; l'éditeur ne part qu'une fois son
      // retour arrivé (deux calques refermés d'un coup laisseraient une
      // entrée d'historique orpheline).
      setSupprimer(false);
      const id = fiche.id;
      setTimeout(() => quandRetoursArrives(() => onSupprimee?.(id)), 0);
    } catch (err) {
      setOccupe(false);
      notifyLegacy('Suppression impossible. ' + messageErreur(err, 'recettes'), 'error');
    }
  };

  const archivee = fiche.statut === 'archivée';
  const etatSauvegarde = saveStatus === 'saving'
    ? <span style={es.etat}><Loader2 size={12} aria-hidden="true" /> Sauvegarde…</span>
    : saveStatus === 'saved'
      ? <span style={{ ...es.etat, color: 'var(--success-text)' }}>Sauvegardé</span>
      : saveStatus === 'error'
        ? <span style={{ ...es.etat, color: 'var(--danger-strong)' }} title={saveError}>Enregistrement échoué</span>
        : null;

  const colonnes = isMobile ? 'minmax(0,1fr) 72px 70px 40px' : 'minmax(0,1fr) 110px 96px 40px';

  return (
    <>
      <EcranTache
        titre={fiche.nom || 'Nouvelle fiche'}
        etat={archivee ? <>fiche archivée</> : <>modifications enregistrées au fil de la saisie</>}
        onRetour={onFermer}
        actions={(
          <>
            {etatSauvegarde}
            {(iaHaccp || iaSuggestions) && <span style={es.etat}><Loader2 size={12} aria-hidden="true" /> {iaHaccp ? 'Analyse HACCP…' : 'Suggestions…'}</span>}
            <BoutonActions
              id="fiche-actions"
              label="Actions"
              style={es.bouton}
              titre="Actions sur la fiche"
              sousTitre={fiche.nom}
              sections={[
                { items: [
                  { titre: platsDeLaFiche.length ? `Rattacher à un plat (déjà dans ${platsDeLaFiche.length})` : 'Rattacher à un plat', detail: 'La fiche entre dans la composition d\'un plat.', onClick: () => setRattacher(true) },
                  archivee
                    ? { titre: 'Désarchiver', detail: 'La fiche repasse en brouillon.', onClick: () => maj({ statut: 'brouillon' }) }
                    : { titre: 'Archiver', detail: 'Sort la fiche de la bibliothèque et des plats, sans la supprimer.', onClick: () => maj({ statut: 'archivée' }) },
                ] },
                isConsultant && { titre: 'Aide à la rédaction', items: [
                  !iaHaccp && { titre: 'Analyse HACCP', detail: 'Points de contrôle proposés, à valider par un responsable.', onClick: genererHaccp },
                  !iaSuggestions && { titre: 'Suggestions', detail: 'Ce qui manque à la fiche pour être complète.', onClick: suggerer },
                ] },
                { items: [
                  { titre: 'Supprimer la recette', danger: true, onClick: () => setSupprimer(true) },
                ] },
              ].filter(Boolean)}
            />
          </>
        )}
      />

      {brouillon && (
        <div className="no-print" style={{ ...encadreStyle('alerte'), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, ...encadreTitreStyle('alerte'), flex: 1, minWidth: 200 }}>
            Des modifications de cette fiche faites sur cet appareil n'ont pas été enregistrées.
          </span>
          <button type="button" style={es.bouton} onClick={() => { maj({ ...brouillon.recipe, id: fiche.id, masquee: fiche.masquee }); setBrouillon(null); }}>Restaurer</button>
          <button type="button" style={es.bouton} onClick={() => { effacerBrouillon(fiche.id); setBrouillon(null); }}>Ignorer</button>
        </div>
      )}
      {fiche.masquee === true && (
        <div className="no-print" style={{ fontSize: 12, lineHeight: 1.4, ...encadreStyle('alerte') }}>
          Recette cachée : invisible dans Cartes & Recettes, pour tous les rôles. Elle reste utilisée par la mise en place, la commande et les étiquettes.
        </div>
      )}

      <div style={es.colonne}>
        {/* Nom et photo */}
        <div style={{ ...es.carte, display: 'flex', gap: 14, alignItems: 'center', padding: 14 }}>
          <PhotoUploader
            photoUrl={fiche.photoUrl}
            onUpload={async (file) => {
              try {
                const { url } = await legacySB.db.uploadRecettePhoto({ etabId, type: 'recette', id: fiche.id, file });
                maj({ photoUrl: url });
              } catch (err) { notifyLegacy('Envoi du fichier impossible. ' + messageErreur(err, 'recettes'), 'error'); }
            }}
            onRemove={() => maj({ photoUrl: null })}
          />
          <DebouncedField
            data-fiche-nom=""
            type="text"
            value={fiche.nom || ''}
            onCommit={v => { if (v !== ficheRef.current.nom) maj({ nom: v }); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }}
            enterKeyHint="done"
            placeholder="Nom de la recette"
            aria-label="Nom de la recette"
            style={es.nom}
          />
        </div>

        {/* Ingrédients */}
        <div style={es.carte}>
          <div style={es.titreCarte}>
            <span>Ingrédients (<span data-no-translate>{ingredients.length}</span>)</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" style={es.bouton} onClick={() => setColler(true)}>Coller une liste</button>
              {catalogue.length > 0 && <button type="button" style={es.bouton} onClick={() => { setRechercheCatalogue(''); setPicker('multi'); }}>Depuis le catalogue</button>}
              <button type="button" style={es.boutonPrincipal} onClick={ajouterLigne}>Ajouter un ingrédient</button>
            </div>
          </div>
          <div style={{ padding: '4px 14px 14px' }}>
            {ingredients.length === 0 ? (
              <div style={es.vide}>Aucun ingrédient. Ajoutez-en un, ou collez une liste.</div>
            ) : (
              <>
                <div style={{ ...es.ligneTete, gridTemplateColumns: colonnes }}>
                  <span>Nom</span><span>Quantité</span><span>Unité</span><span />
                </div>
                {ingredients.map((ing, idx) => {
                  const lie = !!ing.produitId;
                  const montrerSugg = ligneFocus === ing.id && (ing.nom || '').length >= 3 && catalogue.length > 0 && !lie;
                  const sugg = montrerSugg
                    ? catalogue.filter(p => normalizeSearch(p.nom).includes(normalizeSearch(ing.nom))).slice(0, 5)
                    : [];
                  return (
                    <div key={ing.id} className="grid-table-row" style={{ ...es.ligne, gridTemplateColumns: colonnes }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 4, minWidth: 0 }}>
                        {lie && (
                          <button type="button" style={{ ...es.pastille, background: 'var(--success-bg)', color: 'var(--success-text)' }} title="Lié au catalogue : toucher pour délier" aria-label={`Délier ${ing.nom || 'la ligne'} du catalogue`} onClick={() => delier(idx)}>
                            <Link2 size={13} aria-hidden="true" />
                          </button>
                        )}
                        {!lie && ing.needsReview && (
                          <button type="button" style={{ ...es.pastille, background: 'var(--warning-bg)', color: 'var(--warning-text)' }} title="Correspondance incertaine : choisir le produit" aria-label={`Choisir le produit de ${ing.nom || 'la ligne'}`} onClick={() => { setRechercheCatalogue(ing.nom || ''); setPicker(ing.id); }}>
                            <AlertTriangle size={13} aria-hidden="true" />
                          </button>
                        )}
                        <DebouncedField
                          key={`${ing.id}:${ing.produitId || ''}:${ing.needsReview ? 'r' : ''}`}
                          data-ing-nom={ing.id}
                          type="text"
                          value={ing.nom || ''}
                          onCommit={v => validerNom(idx, v)}
                          onKeyDown={e => entreeNom(e, ing)}
                          onFocus={() => setLigneFocus(ing.id)}
                          onBlur={() => setLigneFocus(cur => (cur === ing.id ? null : cur))}
                          enterKeyHint="next"
                          autoComplete="off"
                          placeholder="Ingrédient"
                          aria-label="Nom de l'ingrédient"
                          style={{ ...es.champ, flex: 1, minWidth: 0 }}
                        />
                        <button type="button" style={es.pastille} title="Choisir dans le catalogue" aria-label="Choisir dans le catalogue" onClick={() => { setRechercheCatalogue(ing.nom || ''); setPicker(ing.id); }}>
                          <Search size={13} aria-hidden="true" />
                        </button>
                        {sugg.length > 0 && (
                          <ListeAncree style={es.suggestions}>
                            {sugg.map(p => (
                              <div key={p.id} style={es.suggestion} onMouseDown={() => lierProduit(idx, p)}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                                {p.uniteRef && <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{p.uniteRef}</span>}
                              </div>
                            ))}
                          </ListeAncree>
                        )}
                      </div>
                      <DebouncedField
                        data-ing-qte={ing.id}
                        type="number" min="0" step="any" inputMode="decimal"
                        value={ing.quantite}
                        onCommit={v => { if (Number(v) !== Number(ing.quantite)) majLigne(idx, { quantite: Number(v) }); }}
                        onKeyDown={e => entreeQte(e, idx)}
                        onWheel={e => e.target.blur()}
                        enterKeyHint="next"
                        aria-label={`Quantité de ${ing.nom || 'l’ingrédient'}`}
                        style={es.champ}
                      />
                      <select value={ing.unite} onChange={e => changerUnite(idx, e.target.value)} style={es.champ} aria-label={`Unité de ${ing.nom || 'l’ingrédient'}`}>
                        {UNITES_REC.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <button type="button" onClick={() => retirerLigne(idx)} style={es.retirer} aria-label={`Retirer ${ing.nom || 'l’ingrédient'}`}>×</button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Étapes */}
        <div style={es.carte}>
          <div style={es.titreCarte}>
            <span>Étapes (<span data-no-translate>{etapes.length}</span>)</span>
            <button type="button" style={es.bouton} onClick={() => maj({ etapes: [...etapesCourantes(), ''] })}>Ajouter une étape</button>
          </div>
          <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {etapes.length === 0 && <div style={es.vide}>Aucune étape.</div>}
            {etapes.map((etape, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={es.numero} data-no-translate>{idx + 1}</span>
                <DebouncedField as="textarea" value={etape || ''} onCommit={v => { if (v !== etape) majEtape(idx, v); }} placeholder="Décrire l'étape…" rows={2} aria-label={`Étape ${idx + 1}`} style={{ ...es.champ, flex: 1, minHeight: 56, resize: 'vertical' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button type="button" onClick={() => deplacerEtape(idx, -1)} disabled={idx === 0} style={es.petit} aria-label="Monter l'étape">▲</button>
                  <button type="button" onClick={() => deplacerEtape(idx, 1)} disabled={idx === etapes.length - 1} style={es.petit} aria-label="Descendre l'étape">▼</button>
                </div>
                <button type="button" onClick={() => maj({ etapes: etapesCourantes().filter((_, i) => i !== idx) })} style={es.retirer} aria-label={`Retirer l'étape ${idx + 1}`}>×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Paramètres */}
        <div style={es.carte}>
          <div style={es.titreCarte}><span>Paramètres</span></div>
          <div style={es.grille}>
            <label style={es.champLibelle}><span style={es.libelle}>Catégorie</span>
              <select value={fiche.categorie || 'Plats'} onChange={e => maj({ categorie: e.target.value })} style={es.champ}>
                {[...new Set([...CATEGORIES_REC, fiche.categorie].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={es.champLibelle}><span style={es.libelle}>Statut</span>
              <select value={fiche.statut || 'brouillon'} onChange={e => maj({ statut: e.target.value })} style={es.champ}>
                <option value="brouillon">Brouillon</option>
                <option value="active">Active</option>
                <option value="archivée">Archivée</option>
                {fiche.statut && !['brouillon', 'active', 'archivée'].includes(fiche.statut) && <option value={fiche.statut}>{fiche.statut}</option>}
              </select>
            </label>
            <label style={es.champLibelle}><span style={es.libelle}>Portions</span>
              <DebouncedField type="number" min="1" inputMode="decimal" value={fiche.portions || 1} onCommit={v => { if (Number(v) !== Number(fiche.portions)) maj({ portions: Number(v) }); }} style={es.champ} />
            </label>
            <label style={es.champLibelle}><span style={es.libelle}>Version</span>
              <DebouncedField type="number" min="1" inputMode="numeric" value={fiche.version || 1} onCommit={v => { if ((Number(v) || 1) !== Number(fiche.version || 1)) maj({ version: Number(v) || 1 }); }} style={es.champ} />
            </label>
            <label style={es.champLibelle}><span style={es.libelle}>Préparation (min)</span>
              <DebouncedField type="number" min="0" inputMode="numeric" value={fiche.tempsPreparation || 0} onCommit={v => { if (Number(v) !== Number(ficheRef.current.tempsPreparation || 0)) maj({ tempsPreparation: Number(v), tempsTotal: Number(v) + (Number(ficheRef.current.tempsCuisson) || 0) }); }} style={es.champ} />
            </label>
            <label style={es.champLibelle}><span style={es.libelle}>Cuisson (min)</span>
              <DebouncedField type="number" min="0" inputMode="numeric" value={fiche.tempsCuisson || 0} onCommit={v => { if (Number(v) !== Number(ficheRef.current.tempsCuisson || 0)) maj({ tempsCuisson: Number(v), tempsTotal: (Number(ficheRef.current.tempsPreparation) || 0) + Number(v) }); }} style={es.champ} />
            </label>
          </div>
          <div style={{ padding: '0 14px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={es.libelle}>Temps total : <strong style={{ color: 'var(--text)' }} data-no-translate>{(Number(fiche.tempsPreparation) || 0) + (Number(fiche.tempsCuisson) || 0)}</strong> min</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 44, marginLeft: 'auto' }}>
              <input type="checkbox" checked={surCarte} onChange={e => basculerCarte(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--success-text)' }} />
              <span style={{ fontSize: 13, color: surCarte ? 'var(--success-text)' : 'var(--text2)' }}>{surCarte ? 'Publiée sur la carte active' : 'Publier sur la carte active'}</span>
            </label>
          </div>
        </div>

        {/* Allergènes */}
        <div style={es.carte}>
          <div style={es.titreCarte}>
            <span>Allergènes</span>
            {isConsultant && (
              <button type="button" style={{ ...es.bouton, opacity: iaAllergenes ? 0.6 : 1 }} onClick={detecterAllergenes} disabled={iaAllergenes} title="Détecter les allergènes à partir des ingrédients">
                {iaAllergenes ? 'Analyse…' : 'Détecter'}
              </button>
            )}
          </div>
          <div style={{ padding: '4px 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALLERGENES_OPTIONS.map(a => {
              const actif = (fiche.allergenesIds || []).includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => basculerAllergene(a.id)}
                  aria-pressed={actif}
                  style={{
                    padding: '6px 12px', minHeight: 36, borderRadius: 20, borderWidth: 1, borderStyle: 'solid',
                    borderColor: actif ? 'var(--warning-strong)' : 'var(--border)',
                    background: actif ? 'var(--warning-bg)' : 'var(--surface)',
                    color: actif ? 'var(--warning-text)' : 'var(--text2)',
                    fontSize: 13, fontWeight: actif ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >{a.label}</button>
              );
            })}
          </div>
          {inconnus.length > 0 && (
            <div style={{ margin: '0 14px 14px', ...encadreStyle('alerte') }}>
              <div style={{ fontSize: 12, ...encadreTitreStyle('alerte'), marginBottom: 6 }}>
                Valeurs hors liste (import ancien), à convertir ou à retirer
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {inconnus.map(v => {
                  const { ids } = normalizeAllergenes([v]);
                  const restant = (fiche.allergenesIds || []).filter(a => a !== v);
                  return (
                    <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', border: '1.5px dashed var(--warning-bd)', borderRadius: 20, background: 'var(--surface)', fontSize: 12, color: 'var(--warning-text)' }}>
                      {v}
                      {ids.length > 0 && (
                        <button type="button" className="touch-target" onClick={() => maj({ allergenesIds: [...new Set([...restant, ...ids])] })} style={es.lien}>
                          Remplacer par {ids.map(labelAllergene).join(', ')}
                        </button>
                      )}
                      <button type="button" className="touch-target" onClick={() => maj({ allergenesIds: restant })} aria-label={`Retirer ${v}`} style={{ ...es.lien, color: 'var(--text2)' }}>×</button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dressage, conservation, notes */}
        <div style={es.carte}>
          <div style={es.titreCarte}><span>Dressage et conservation</span></div>
          <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={es.champLibelle}><span style={es.libelle}>Dressage</span>
              <DebouncedField as="textarea" value={fiche.dressage || ''} onCommit={v => { if (v !== (fiche.dressage || '')) maj({ dressage: v }); }} placeholder="Présentation de l'assiette…" rows={2} style={{ ...es.champ, resize: 'vertical' }} />
            </label>
            <label style={es.champLibelle}><span style={es.libelle}>Conservation</span>
              <DebouncedField as="textarea" value={fiche.conservation || ''} onCommit={v => { if (v !== (fiche.conservation || '')) maj({ conservation: v }); }} placeholder="Durée, température, conditionnement…" rows={2} style={{ ...es.champ, resize: 'vertical' }} />
            </label>
          </div>
        </div>
        {(isConsultant || fiche.notesConsultant) && (
          <div style={es.carte}>
            <div style={es.titreCarte}><span>Notes du consultant</span></div>
            <div style={{ padding: '4px 14px 14px' }}>
              {isConsultant ? (
                <DebouncedField as="textarea" value={fiche.notesConsultant || ''} onCommit={v => { if (v !== (fiche.notesConsultant || '')) maj({ notesConsultant: v }); }} placeholder="Conseils techniques, points d'attention, tours de main…" rows={4} aria-label="Notes du consultant" style={{ ...es.champ, resize: 'vertical' }} />
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{fiche.notesConsultant}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {picker !== null && (
        <CataloguePicker
          catalogue={catalogue}
          mode={picker === 'multi' ? 'multi' : 'ligne'}
          rechercheInitiale={rechercheCatalogue}
          onClose={() => setPicker(null)}
          onAjouter={ajouterProduits}
          onChoisir={(p) => {
            const idx = ingredients.findIndex(i => i.id === picker);
            if (idx !== -1) lierProduit(idx, p);
            setPicker(null);
          }}
        />
      )}
      {coller && <ColleListe onAjouter={ajouterListe} onClose={() => setColler(false)} />}
      {rattacher && (
        <PlatPicker
          key={fiche.id}
          title="Rattacher à un plat"
          subtitle={`« ${fiche.nom} » peut appartenir à plusieurs plats : cochez-les, puis enregistrez. Décocher retire le lien.`}
          plats={plats}
          cartes={cartes}
          initialSelected={platsDeLaFiche.map(p => p.id)}
          confirmLabel={(n) => `Enregistrer (${n})`}
          emptyHint="Aucun plat. « Ajouter un plat » sur une carte en crée un."
          busy={occupe}
          onConfirm={appliquerPlats}
          onClose={() => setRattacher(false)}
        />
      )}
      {supprimer && (
        <Fenetre
          id="fiche-supprimer"
          titre="Supprimer cette recette ?"
          sousTitre={fiche.nom}
          onClose={() => { if (!occupe) setSupprimer(false); }}
          pied={(
            <>
              <button type="button" style={fst.secondaire} onClick={() => setSupprimer(false)} disabled={occupe}>Annuler</button>
              <button type="button" style={{ ...fst.primaire, background: 'var(--danger-strong)' }} onClick={confirmerSuppression} disabled={occupe}>
                {platsDeLaFiche.length ? 'Supprimer quand même' : 'Supprimer'}
              </button>
            </>
          )}
        >
          <div style={fst.apercu}>La suppression est définitive.</div>
          {platsDeLaFiche.length > 0 && (
            <Encadre ton="alerte">
              Utilisée dans <span data-no-translate>{platsDeLaFiche.length}</span> plat{platsDeLaFiche.length > 1 ? 's' : ''} : {platsDeLaFiche.slice(0, 8).map(p => p.nom).join(', ')}{platsDeLaFiche.length > 8 ? '…' : ''}. Ces plats perdront ce composant ; leurs autres recettes restent.
            </Encadre>
          )}
        </Fenetre>
      )}
      {haccp && (
        <Fenetre
          id="fiche-haccp"
          titre="Analyse HACCP"
          sousTitre={fiche.nom}
          onClose={() => setHaccp(null)}
          largeur={720}
          pied={(
            <>
              <button type="button" style={fst.secondaire} onClick={() => setHaccp(null)}>Fermer</button>
              <button type="button" style={fst.primaire} onClick={insererHaccp}>Insérer dans les notes</button>
            </>
          )}
        >
          <Encadre ton="alerte">Généré automatiquement, à valider par un responsable avant utilisation.</Encadre>
          {(haccp.points || []).length === 0 && <div style={fst.remarque}>Aucun point de maîtrise identifié.</div>}
          {(haccp.points || []).map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.etape || '-'}{p.type ? `, ${p.type}` : ''}{p.ccp ? ' (CCP)' : ''}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>{p.danger || '-'}</div>
              {p.mesure && <div style={fst.remarque}>Maîtrise : {p.mesure}</div>}
              {p.limiteCritique && <div style={fst.remarque}>Limite critique : {p.limiteCritique}</div>}
              {p.surveillance && <div style={fst.remarque}>Surveillance : {p.surveillance}</div>}
            </div>
          ))}
          {haccp.conservation && <div style={fst.apercu}>Conservation : {haccp.conservation}</div>}
          {haccp.remarques && <div style={fst.remarque}>Remarques : {haccp.remarques}</div>}
        </Fenetre>
      )}
      {suggestions && (
        <Fenetre id="fiche-suggestions" titre="Suggestions" sousTitre={fiche.nom} onClose={() => setSuggestions(null)} largeur={640} pied={<button type="button" style={fst.secondaire} onClick={() => setSuggestions(null)}>Fermer</button>}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={fst.label}>Ingrédients suggérés (<span data-no-translate>{suggestions.ingredients.length}</span>)</span>
            {suggestions.ingredients.length > 0 && <button type="button" style={es.bouton} onClick={() => ajouterIngredientsSuggeres(suggestions.ingredients)}>Tout ajouter</button>}
          </div>
          {suggestions.ingredients.map((ing, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{ing.nom}</span>
              <span style={fst.remarque}>{ing.quantite || ''} {ing.unite}</span>
              <button type="button" style={es.bouton} onClick={() => ajouterIngredientsSuggeres([ing])}>Ajouter</button>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={fst.label}>Étapes suggérées (<span data-no-translate>{suggestions.etapes.length}</span>)</span>
            {suggestions.etapes.length > 0 && <button type="button" style={es.bouton} onClick={() => ajouterEtapesSuggerees(suggestions.etapes)}>Tout ajouter</button>}
          </div>
          {suggestions.etapes.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid var(--border)', padding: '4px 0' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{e}</span>
              <button type="button" style={es.bouton} onClick={() => ajouterEtapesSuggerees([e])}>Ajouter</button>
            </div>
          ))}
        </Fenetre>
      )}
    </>
  );
}

const es = {
  colonne: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14, minWidth: 0 },
  carte: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', minWidth: 0 },
  titreCarte: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 14px', fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  nom: { flex: 1, minWidth: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', outline: 'none', padding: '6px 0', minHeight: 44 },
  ligneTete: { display: 'grid', gap: 8, fontSize: 12, color: 'var(--text2)', padding: '6px 0' },
  ligne: { display: 'grid', gap: 8, alignItems: 'center', padding: '4px 0' },
  champ: { width: '100%', minWidth: 0, padding: '9px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 7, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', minHeight: 44 },
  champLibelle: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  libelle: { fontSize: 12, color: 'var(--text2)' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, padding: '4px 14px 14px' },
  pastille: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, minHeight: 44, padding: 0, background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 7, color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 },
  suggestions: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', zIndex: 900 },
  suggestion: { display: 'flex', alignItems: 'center', padding: '10px 12px', minHeight: 40, fontSize: 13, color: 'var(--text)', cursor: 'pointer', borderBottom: '1px solid var(--border)' },
  retirer: { width: 40, minHeight: 44, border: 'none', background: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', flexShrink: 0 },
  petit: { width: 32, height: 28, minHeight: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text2)', fontSize: 10, cursor: 'pointer', flexShrink: 0 },
  numero: { width: 28, height: 28, flexShrink: 0, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, marginTop: 8 },
  bouton: { padding: '9px 14px', minHeight: 44, background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  boutonPrincipal: { padding: '9px 14px', minHeight: 44, background: 'var(--accent)', border: 'none', color: 'var(--on-accent)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  lien: { border: 'none', background: 'none', color: 'var(--warning-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '0 4px' },
  etat: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text2)' },
  vide: { padding: '10px 0', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' },
};
