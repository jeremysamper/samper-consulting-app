import React from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, ConciergeBell, FlaskConical, Hourglass, LayoutGrid, Megaphone,
  Minus, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, TriangleAlert, X,
} from 'lucide-react';
import { Btn, Input, SegmentedTabs } from '../../components/ui/index.jsx';
import { BoutonActions, Fenetre, st as fen } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { zurichDateHeure, zurichToday } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import FicheLigne from './FicheLigne.jsx';
import BoutonFiche from './BoutonFiche.jsx';
import CorrigerClient from './CorrigerClient.jsx';
import Encaissement from './Encaissement.jsx';
import { allergenesEnConflit, allergenesIdsDe, allergiesDe } from './clients.js';
import { libelleOption } from './options.js';
import { pictoCategorieDefaut, pictoDefaut, pictoParId } from './boutons.js';
import { ID_TOUT, rangerArticles, sousGroupesAutres } from './categories.js';
import { libelleSupplement, supplementsPourLigne } from './supplements.js';
import { REGLAGES_DEFAUT, SUITE_MAX, libelleMode, peutOuvrirMode, suitesVisibles } from './reglages.js';
import { comptesCommande, photoDuBouton, quantitesParPlat } from './commande.js';
import { useLargeur } from './mesures.js';
import { enRupture, libelleCompteRupture, produitsEnRupture } from './rupture.js';
import { peutMettreEnRupture } from './gardesCaisse.js';
import { estPret } from './PlanTables.jsx';
import { libelleAvecFormat, ligneNueDuFormat, optionFormat, prixAffiche } from '../../utils/formatsBoisson.js';

// ─────────────────────────────────────────────────────────────────────────────
// L'écran de prise de commande d'un ticket, en plein écran (21.11.2026, à la
// manière des caisses en grille) :
//   en haut   : retour au plan, les modes (En direct, À suivre...), la loupe et
//               le menu des actions du ticket ;
//   à gauche  : les catégories en pictos ;
//   au centre : les cases des produits en grille, avec leur photo (celle posée
//               dans la caisse, sinon celle de la fiche), sinon leur couleur et
//               leur picto ; une pastille dit combien la table en a ;
//   téléphone : en bas, le résumé (total, entrées, plats, desserts) et
//               l'action principale ; le résumé fait monter la commande dans
//               une feuille, pour vérifier, modifier ou retirer d'un toucher ;
//   tablette  : la commande dans un panneau à droite, même contenu.
// L'écran est rendu dans body (portail) : la coque et ses conteneurs ne le
// cadrent pas. Les fenêtres partagées (Fenetre, z-index 1000) et les feuilles
// de la caisse (1200) passent au-dessus de lui (900).
//
// Modes (v4) : « En direct », « À suivre », « À suivre 2 »... sont les suites
// 1, 2, 3 de caisse_lignes, sans changement de schéma. On choisit le mode,
// puis chaque tap sur un produit l'ajoute dans ce mode ; le regroupement
// « même plat = +1 » se fait dans le mode actif. Le mode revient à « En
// direct » à chaque ouverture de ticket (le composant est remonté).
//
// Action principale, une seule à la fois : Envoyer en cuisine (le direct),
// puis Réclamer la suite (le mode suivant en attente), puis Encaisser. Le
// moteur d'envoi est celui de la v1 : caisse_envoyer_bon sur la plus basse
// suite en attente, idempotent au double tap.
//
// Les noms de produits, de catégories, de modes et de tables sont des
// données : data-no-translate. Chaque nombre vit dans son propre noeud
// (traduction du DOM).
//
// v5 : le ticket d'une table sait qui est assis. Un bandeau en tête de la
// commande dit le nom, les couverts et les allergies du client ; « Corriger »
// ouvre la feuille des corrections du service (nom, couverts, arrivé,
// no-show, autre réservation), toutes par la RPC caisse_corriger_reservation.
// Une vente directe reste anonyme : pas de bandeau.
// Quand la maison vend plus d'une carte, le menu propose la carte affichée ;
// il s'ouvre sur « Toutes les cartes » et le choix tient le temps du ticket.
//
// L2 (22.11.2026) : rupture d'un produit pour la journée (rupture.js). Un appui
// long sur une case, ou la fiche de la case, propose « Mettre en rupture » ou
// « Remettre en vente » (consultant, patron, resp_cuisine et serveur, par la
// RPC caisse_poser_rupture ; « Modifier la case » reste aux trois premiers).
// La case en rupture est grisée, porte le mot « Rupture » et
// ne s'ajoute plus : un toucher le rappelle. Un compteur au-dessus de la
// grille les retrouve et les remet en vente. Les autres postes suivent par le
// temps réel de caisse_boutons (Caisse.jsx), et le jour se relit à chaque
// rendu (l'horloge de Caisse.jsx en donne un toutes les 30 s).
//
// v6 : la cuisine voit ce qui arrive, la salle voit ce qui est prêt. Au
// premier envoi, les lignes des modes suivants sont annoncées en cuisine,
// tenues : elles s'affichent « annoncé » et restent modifiables. « Réclamer la
// suite » les libère par la RPC caisse_reclamer_suite. Quand la cuisine marque
// un plat fait, la ligne porte « Prêt ». En mode test, le ticket n'a ni client
// ni réservation : le bandeau le dit et « Corriger » n'existe pas.
//
// Carte des boissons (22.11.2026) : une boisson vendue en plusieurs formats
// (1 dl, 50 cl, 75 cl) garde une seule case ; le toucher ouvre « Choisir le
// format », puis la ligne s'écrit au prix du format, avec l'option format et le
// libellé « Nom, 1 dl » (la base relit le prix du format). Une boisson à un
// seul format part sans question. La règle « même plat = +1 » compte le format.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const LARGEUR_TABLETTE = 760;
const ID_PLUS = '_plus';
const LIBELLES_QUI = { reservation: 'Réservation', passage: 'Client de passage', compte: 'Compte client' };
const SERVICES = [['entrees', 'Entrée', 'Entrées'], ['plats', 'Plat', 'Plats'], ['desserts', 'Dessert', 'Desserts']];
const DUREE_SORTIE_FEUILLE = 180;

export default function TicketEcran({
  ticket, articles, allergenesFiches = null, boutons = {}, categories = [], reglages = REGLAGES_DEFAUT,
  peutHabiller = false, onBoutonsChange,
  ticketsMemeTable, onDeplacer, onFusionne, onClos, onEncaissementEnvoye, reload,
  cartes = [], reservation = null, reservations = [], onReservationsChange,
  modeTest = false, onQuittance,
  terminaux = [], role = null,
  titre = null, onRetour, bandeau = null,
}) {
  const [recherche, setRecherche] = React.useState('');
  const [rechercheOuverte, setRechercheOuverte] = React.useState(false);
  // Carte choisie pour ce ticket ; null = toutes les cartes en vente.
  const [carteChoisie, setCarteChoisie] = React.useState(null);
  const [cartesOuvert, setCartesOuvert] = React.useState(false);
  // Feuille « Corriger » du bandeau client.
  const [corrigerOuvert, setCorrigerOuvert] = React.useState(false);
  const [correctionEnCours, setCorrectionEnCours] = React.useState(false);
  // Mode de saisie : la suite où tombent les prochains produits.
  const [modeActif, setModeActif] = React.useState(1);
  // Modes ouverts par le « + » pendant ce ticket, au-delà de ceux réglés.
  const [modesOuverts, setModesOuverts] = React.useState(0);
  // Catégorie choisie dans le rail ; null = celle par défaut (voir plus bas).
  const [ongletChoisi, setOngletChoisi] = React.useState(null);
  // Fiche d'édition d'une ligne (v2) : identifiant de la ligne ouverte.
  const [ficheLigneId, setFicheLigneId] = React.useState(null);
  const [sansRecents, setSansRecents] = React.useState([]);
  const [libreOuvert, setLibreOuvert] = React.useState(false);
  const [libreNom, setLibreNom] = React.useState('');
  const [librePrix, setLibrePrix] = React.useState('');
  const [paiementOuvert, setPaiementOuvert] = React.useState(false);
  const [envoiEnCours, setEnvoiEnCours] = React.useState(false);
  // Feuille de la commande au téléphone : fermée, ouverte, ou en train de
  // redescendre (le temps de son animation).
  const [feuille, setFeuille] = React.useState('fermee');
  // Photos qui n'ont pas pu se charger : la case reprend sa couleur et son picto.
  const [photosEnEchec, setPhotosEnEchec] = React.useState(() => new Set());
  // Verrous immédiats (une ref, pas un état) : deux taps dans la même image
  // ne lancent pas deux envois ni deux retraits de la même ligne.
  const verrou = React.useRef({ envoi: false });
  const verrouRetrait = React.useRef(new Set());
  // Habillage des cases (v3) : mode édition (consultant, patron,
  // resp_cuisine) et fiche de la case ouverte ; l'appui long ouvre aussi la
  // fiche, hors mode, pour les mêmes rôles.
  const [editionBoutons, setEditionBoutons] = React.useState(false);
  const [boutonPlat, setBoutonPlat] = React.useState(null);
  // Plat touché qui contient un allergène signalé par la table : { plat,
  // allergenes } ; la fenêtre « Attention allergène » demande de confirmer.
  const [alerteAllergene, setAlerteAllergene] = React.useState(null);
  // Boisson touchée qui se vend en plusieurs formats : la fenêtre « Choisir le
  // format » est ouverte pour elle.
  const [choixFormat, setChoixFormat] = React.useState(null);
  // Rupture (L2) : produit dont la feuille de l'appui long est ouverte, liste
  // des produits en rupture, et écriture en cours (verrou immédiat en ref).
  const [produitAppui, setProduitAppui] = React.useState(null);
  const [rupturesOuvert, setRupturesOuvert] = React.useState(false);
  const [ruptureEnCours, setRuptureEnCours] = React.useState(false);
  const verrouRupture = React.useRef(false);
  const appuiLong = React.useRef({ timer: null, declenche: false });
  const minuterieFeuille = React.useRef(null);

  const racineRef = React.useRef(null);
  const largeur = useLargeur(racineRef);
  const tablette = largeur >= LARGEUR_TABLETTE;

  const ouvrirFeuille = React.useCallback(() => {
    clearTimeout(minuterieFeuille.current);
    setFeuille('ouverte');
  }, []);
  const fermerFeuille = React.useCallback(() => {
    setFeuille((f) => (f === 'ouverte' ? 'fermeture' : f));
    clearTimeout(minuterieFeuille.current);
    minuterieFeuille.current = setTimeout(() => setFeuille('fermee'), DUREE_SORTIE_FEUILLE);
  }, []);
  React.useEffect(() => () => clearTimeout(minuterieFeuille.current), []);
  // Passage en tablette (rotation de l'iPad) : la commande est déjà à droite.
  React.useEffect(() => { if (tablette) setFeuille('fermee'); }, [tablette]);
  // Le geste retour et Échap referment la feuille avant de quitter l'écran.
  useBackLayer(feuille === 'ouverte' && !tablette, fermerFeuille, 'caisse-commande');
  React.useEffect(() => {
    if (feuille !== 'ouverte') return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      if (document.querySelector('[data-fenetre]')) return;
      e.preventDefault();
      fermerFeuille();
    };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [feuille, fermerFeuille]);

  // Rupture (L2) : l'habillage, plus le serveur (RPC caisse_poser_rupture).
  const peutRupture = peutMettreEnRupture(role);
  function debutAppuiLong(plat) {
    if (!peutRupture) return;
    appuiLong.current.declenche = false;
    appuiLong.current.timer = setTimeout(() => {
      appuiLong.current.declenche = true;
      setProduitAppui(plat);
    }, 550);
  }
  function finAppuiLong() {
    if (appuiLong.current.timer) { clearTimeout(appuiLong.current.timer); appuiLong.current.timer = null; }
  }

  const lignes = React.useMemo(() => ticket?.lignes || [], [ticket]);
  const total = lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);
  const enAttente = lignes.filter((l) => l.statut === 'en_attente');
  // La suite a envoyer : la plus basse qui porte encore des lignes en attente.
  const suiteAEnvoyer = enAttente.length ? Math.min(...enAttente.map((l) => l.suite)) : null;

  const suites = suitesVisibles(reglages, lignes, modesOuverts);
  const plusPossible = peutOuvrirMode(reglages, suites);

  // La fiche suit la ligne vivante (realtime, rechargements) ; elle se ferme
  // seule si la ligne part en cuisine ou disparaît.
  const ficheLigne = lignes.find((l) => l.id === ficheLigneId && l.statut === 'en_attente') || null;
  React.useEffect(() => {
    if (ficheLigneId && !ficheLigne) setFicheLigneId(null);
  }, [ficheLigneId, ficheLigne]);

  // Derniers « sans ... » de la maison, relus à chaque ouverture de fiche.
  const etabId = ticket?.etablissement_id;
  React.useEffect(() => {
    if (!etabId || !ficheLigneId) return undefined;
    let vivant = true;
    caisse.listSansRecents(etabId).then(({ data }) => { if (vivant) setSansRecents(data || []); });
    return () => { vivant = false; };
  }, [etabId, ficheLigneId]);

  // ── Carte choisie : une carte décochée ou archivée pendant le ticket
  // retombe sur « Toutes les cartes ». ──
  const carte = cartes.find((c) => c.id === carteChoisie) || null;
  const articlesCarte = React.useMemo(
    () => (carte ? articles.filter((a) => (a.carteIds || []).includes(carte.id)) : articles),
    [articles, carte],
  );

  // ── Rangement des produits dans les catégories de caisse ──
  const rangement = React.useMemo(
    () => rangerArticles({ articles: articlesCarte, boutons, categoriesMaison: categories }),
    [articlesCarte, boutons, categories],
  );
  // Suppléments de la fiche ouverte et comptes de la commande : selon les
  // catégories de caisse de tous les articles en vente, quelle que soit la
  // carte affichée.
  const rangementComplet = React.useMemo(
    () => rangerArticles({ articles, boutons, categoriesMaison: categories }),
    [articles, boutons, categories],
  );
  const supplementsFiche = React.useMemo(
    () => supplementsPourLigne({ ligne: ficheLigne, supplements: reglages.supplements, rangement: rangementComplet, articles }),
    [ficheLigne, reglages.supplements, rangementComplet, articles],
  );
  const articlesParId = React.useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const comptes = React.useMemo(
    () => comptesCommande(lignes, { parArticle: rangementComplet.parArticle, articlesParId }),
    [lignes, rangementComplet, articlesParId],
  );
  const quantites = React.useMemo(() => quantitesParPlat(lignes), [lignes]);
  // « Tout » par défaut : chaque produit reste à un tap, comme avant les
  // onglets. Une maison peut régler l'ouverture sur sa première catégorie.
  const ongletDefaut = reglages.ouverture === 'categorie' ? (rangement.onglets[0]?.id || ID_TOUT) : ID_TOUT;
  const onglet = ongletChoisi === ID_TOUT || rangement.onglets.some((c) => c.id === ongletChoisi)
    ? ongletChoisi
    : ongletDefaut;
  const match = makeSearchMatcher(recherche);
  const enRecherche = recherche.trim() !== '';
  // La recherche traverse toutes les catégories, masquées comprises.
  const trouves = enRecherche
    ? rangement.categories.flatMap((c) => c.articles.filter((a) => match(a.nom, c.nom, boutons[a.id]?.nom_court)).map((a) => ({ a, c })))
    : [];
  const sections = onglet === ID_TOUT ? rangement.onglets : rangement.onglets.filter((c) => c.id === onglet);

  const erreur = (e) => { if (e) notify(e, 'error'); return Boolean(e); };

  // Touchers rapides sur les cases : les ajouts passent un par un (file), et
  // chacun lit les lignes connues, celles du serveur complétées par celles que
  // ce poste vient d'écrire et que la relecture n'a pas encore rendues. Deux
  // touchers sur la même case donnent une ligne à 2, jamais deux lignes à 1.
  const lignesRef = React.useRef(lignes);
  lignesRef.current = lignes;
  const ecrites = React.useRef(new Map());
  const fileAjouts = React.useRef(Promise.resolve());
  function retenirEcrite(ligne) {
    if (ligne?.id) ecrites.current.set(ligne.id, { ligne, t: Date.now() });
  }
  function lignesConnues() {
    const serveur = new Map(lignesRef.current.map((l) => [l.id, l]));
    const maintenant = Date.now();
    ecrites.current.forEach(({ ligne, t }, id) => {
      const vue = serveur.get(id);
      // Absente du serveur depuis plus de 10 s : retirée ailleurs.
      if (!vue) { if (maintenant - t < 10000) serveur.set(id, ligne); else ecrites.current.delete(id); return; }
      // Partie en cuisine : le serveur fait foi.
      if (vue.statut !== 'en_attente') { ecrites.current.delete(id); return; }
      if (maintenant - t < 10000) serveur.set(id, { ...vue, quantite: ligne.quantite });
      else ecrites.current.delete(id);
    });
    return [...serveur.values()];
  }

  // format : celui choisi pour une boisson, ou null (plat sans format).
  function ajouterArticle(plat, format = null) {
    const mode = modeActif;
    const tache = fileAjouts.current.then(() => ajouterUn(plat, mode, format));
    fileAjouts.current = tache.catch(() => {});
    return tache;
  }

  // Une boisson à plusieurs formats demande le format ; à un seul, elle part
  // dans ce format ; sans format, comme tout plat.
  function poserArticle(plat) {
    const formats = plat.formats || [];
    if (formats.length > 1) { setChoixFormat(plat); return; }
    ajouterArticle(plat, formats[0] || null);
  }

  async function ajouterUn(plat, mode, format) {
    // Même plat, même mode, même format, sans note ni paramètre, pas encore
    // envoyé : +1 (une ligne paramétrée reste la sienne, on n'y empile pas un
    // couvert). Le libellé compte aussi : un supplément choisi (« Supplément
    // alcool (Kirsch) ») ne reçoit pas le supplément nu touché dans la grille.
    const libelle = libelleAvecFormat(plat.nom, format?.libelle);
    const existante = lignesConnues().find((l) =>
      l.statut === 'en_attente' && l.plat_id === plat.id && l.suite === mode
      && l.libelle === libelle && ligneNueDuFormat(l, format));
    const { data, error } = existante
      ? await caisse.majLigne(existante.id, { quantite: Number(existante.quantite) + 1 })
      : await caisse.ajouterLigne({
        ticketId: ticket.id, platId: plat.id, libelle,
        // Le prix affiché tout de suite ; la base pose celui du format, lu chez elle.
        prixUnitaire: format ? format.prix : (plat.prixVente ?? 0), suite: mode,
        options: format ? [optionFormat(format)] : null,
      });
    if (erreur(error)) return;
    retenirEcrite(data);
    reload();
  }

  async function ajouterLibre() {
    const nom = libreNom.trim();
    if (!nom) return;
    const { error } = await caisse.ajouterLigne({
      ticketId: ticket.id, libelle: nom,
      prixUnitaire: Number(String(librePrix).replace(',', '.')) || 0, suite: modeActif,
    });
    if (erreur(error)) return;
    setLibreNom(''); setLibrePrix(''); setLibreOuvert(false);
    reload();
  }

  function choisirMode(id) {
    if (id !== ID_PLUS) { setModeActif(id); return; }
    // Le « + » ouvre le mode suivant et s'y place.
    const suivant = Math.min(SUITE_MAX, suites[suites.length - 1] + 1);
    setModesOuverts(suivant - 1);
    setModeActif(suivant);
  }

  // Écritures de la fiche de ligne : immédiates, l'écran suit par reload.
  async function majFicheLigne(partial) {
    if (!ficheLigne) return;
    const { data, error } = await caisse.majLigne(ficheLigne.id, partial);
    if (erreur(error)) return;
    retenirEcrite(data);
    reload();
  }

  // Un supplément est une ligne à lui, dans le mode de la ligne d'origine :
  // son prix vient de son plat (imposé par la base), son libellé dit le choix.
  async function ajouterSupplement(s, choix) {
    if (!ficheLigne) return;
    const libelle = libelleSupplement(s.nom, choix);
    const existante = lignes.find((l) =>
      l.statut === 'en_attente' && l.plat_id === s.platId && l.suite === ficheLigne.suite
      && l.libelle === libelle && !l.note && !(l.options || []).length);
    const { error } = existante
      ? await caisse.majLigne(existante.id, { quantite: Number(existante.quantite) + 1 })
      : await caisse.ajouterLigne({
        ticketId: ticket.id, platId: s.platId, libelle, prixUnitaire: s.prix, suite: ficheLigne.suite,
      });
    if (erreur(error)) return;
    notify('Supplément ajouté au ticket.', 'success');
    reload();
  }

  async function supprimerFicheLigne() {
    if (!ficheLigne) return;
    const { error } = await caisse.supprimerLigne(ficheLigne.id);
    if (erreur(error)) return;
    ecrites.current.delete(ficheLigne.id);
    setFicheLigneId(null);
    reload();
  }

  // Retrait rapide depuis la commande : un de moins, ou la ligne entière quand
  // il n'en reste qu'un. Seulement sur une ligne pas encore partie en cuisine
  // (une ligne annoncée reste modifiable, la base met son item à jour).
  async function retirerUn(l) {
    if (l.statut !== 'en_attente' || verrouRetrait.current.has(l.id)) return;
    verrouRetrait.current.add(l.id);
    try {
      const q = Number(l.quantite);
      const { data, error } = q > 1
        ? await caisse.majLigne(l.id, { quantite: q - 1 })
        : await caisse.supprimerLigne(l.id);
      if (erreur(error)) return;
      if (q > 1) retenirEcrite(data); else ecrites.current.delete(l.id);
      await reload();
    } finally {
      verrouRetrait.current.delete(l.id);
    }
  }

  async function basculerServi(l) {
    const { error } = await caisse.majLigne(l.id, { statut: l.statut === 'servi' ? 'envoye' : 'servi' });
    if (!erreur(error)) reload();
  }

  // Envoi du bon (Envoyer, Réclamer la suite) : les deux RPC sont idempotentes
  // (un double tap ne crée pas deux bons), le verrou local évite le second
  // appel. Le direct part par caisse_envoyer_bon, qui annonce aussi les modes
  // suivants en cuisine ; une suite se réclame par caisse_reclamer_suite, qui
  // libère les plats annoncés. Un seul tap dans les deux cas.
  async function envoyer() {
    if (verrou.current.envoi || suiteAEnvoyer == null) return;
    verrou.current.envoi = true;
    setEnvoiEnCours(true);
    try {
      const reclamation = suiteAEnvoyer > 1;
      const { data, error } = reclamation
        ? await caisse.reclamerSuite(ticket.id, suiteAEnvoyer)
        : await caisse.envoyerBon(ticket.id, suiteAEnvoyer);
      if (erreur(error)) return;
      if (data?.lignes > 0) {
        // Ticket de test sans le réglage « Envoyer les tests en cuisine » :
        // la base n'a créé aucun bon, l'écran ne prétend pas le contraire.
        if (modeTest && !data.bon_id) notify("Ticket de test : rien n'est parti en cuisine", 'info');
        else notify(reclamation ? 'Suite réclamée en cuisine' : 'Bon envoyé en cuisine', 'success');
      }
      reload();
    } finally {
      verrou.current.envoi = false;
      setEnvoiEnCours(false);
    }
  }

  // Décale les lignes en attente du mode à envoyer vers le mode suivant.
  async function passerASuivre() {
    if (suiteAEnvoyer == null) return;
    const { error } = await caisse.passerSuiteSuivante(ticket.id, suiteAEnvoyer);
    if (!erreur(error)) reload();
  }

  // Corrections du service sur la réservation du ticket. Une RPC par geste ;
  // l'écran relit le ticket et les réservations, jamais un état supposé.
  const verrouCorrection = React.useRef(false);
  async function corriger(payload, message) {
    if (verrouCorrection.current) return;
    verrouCorrection.current = true;
    setCorrectionEnCours(true);
    try {
      const { error } = await caisse.corrigerReservation({
        etablissementId: ticket.etablissement_id,
        ticketId: ticket.id,
        reservationId: payload.reservationId,
        nom: payload.nom ?? null,
        couverts: payload.couverts ?? null,
        statut: payload.statut ?? null,
      });
      if (erreur(error)) return;
      notify(message, 'success');
      await Promise.all([reload(), onReservationsChange?.()]);
      if (payload.rattacher) setCorrigerOuvert(false);
    } finally {
      verrouCorrection.current = false;
      setCorrectionEnCours(false);
    }
  }

  async function fusionner() {
    const autre = ticketsMemeTable[0];
    if (!autre) return;
    if (!window.confirm('Réunir les deux tickets de cette table en un seul ?')) return;
    const { error } = await caisse.fusionnerTickets(autre.id, ticket.id);
    if (erreur(error)) return;
    onFusionne();
  }

  async function annuler() {
    if (!window.confirm('Annuler ce ticket ? Les lignes déjà envoyées restent en cuisine.')) return;
    const { error } = await caisse.majTicket(ticket.id, { statut: 'annule', closed_at: new Date().toISOString() });
    if (erreur(error)) return;
    notify('Ticket annulé', 'info');
    onClos();
  }

  // Rupture (L2) : met en rupture ou remet en vente un ou plusieurs produits.
  // Une écriture à la fois (verrou en ref, deux touchers dans la même image
  // n'écrivent pas deux fois) ; la grille suit par le rechargement des
  // boutons, ici tout de suite et sur les autres postes par le temps réel.
  // Rend vrai si toutes les écritures ont passé.
  async function changerRupture(plats, mettre) {
    if (verrouRupture.current || !plats.length) return false;
    verrouRupture.current = true;
    setRuptureEnCours(true);
    try {
      // Le jour de Zurich est pris par la base (RPC caisse_poser_rupture).
      const resultats = await Promise.all(plats.map((p) => caisse.poserRupture({
        etablissementId: ticket.etablissement_id, platId: p.id, mettre,
      })));
      await onBoutonsChange?.();
      const rate = resultats.find((r) => r.error);
      if (rate) { notify(rate.error, 'error'); return false; }
      if (mettre) notify("Produit en rupture jusqu'à demain matin.", 'success');
      else notify(plats.length > 1 ? 'Produits remis en vente.' : 'Produit remis en vente.', 'success');
      return true;
    } finally {
      verrouRupture.current = false;
      setRuptureEnCours(false);
    }
  }

  if (!ticket) return null;

  const allergies = allergiesDe(reservation);
  // Allergènes signalés par la table (réservation et fiche client), croisés
  // avec les fiches de chaque plat : contour sur la case, confirmation au toucher.
  const allergenesTable = allergenesIdsDe(reservation);
  const conflitsDe = (plat) => allergenesEnConflit(plat, allergenesTable, allergenesFiches);
  // Jour de Zurich relu à chaque rendu : une rupture d'hier tombe d'elle-même.
  const jour = zurichToday();
  const estEnRupture = (plat) => enRupture(boutons[plat.id], jour);
  // Produits en rupture parmi tous ceux en vente, quelle que soit la carte affichée.
  const ruptures = produitsEnRupture(articles, boutons, jour);
  function toucherArticle(plat) {
    if (estEnRupture(plat)) {
      notify(peutRupture
        ? 'Ce produit est en rupture aujourd\'hui. Appuyez longuement sur la case pour le remettre en vente.'
        : 'Ce produit est en rupture aujourd\'hui. Il revient en vente demain matin.', 'info');
      return;
    }
    const conflits = conflitsDe(plat);
    if (conflits.length) { setAlerteAllergene({ plat, allergenes: conflits }); return; }
    poserArticle(plat);
  }
  const dense = reglages.grille === 'dense';
  const minCase = tablette ? (dense ? 112 : 136) : (dense ? 84 : 104);
  const styleGrille = { ...st.grille, gridTemplateColumns: `repeat(auto-fill, minmax(${minCase}px, 1fr))` };
  const heureOuverture = zurichDateHeure(ticket.created_at).heure;

  // Prix d'une case : celui du plat, le prix de son format unique, ou « dès »
  // le plus petit prix de ses formats (chaque nombre dans son nœud).
  function prixCase(a) {
    const { prix, des } = prixAffiche(a);
    return (
      <span style={st.casePrix} data-caisse-prix="">
        {des && <><span>dès</span>{' '}</>}
        <span data-no-translate>{chf(prix)}</span>
      </span>
    );
  }

  // ── Une case de la grille ──
  function caseProduit(a, categorie) {
    const hab = boutons[a.id];
    const couleur = hab?.couleur || categorie?.couleur || null;
    const picto = pictoParId(hab?.picto || categorie?.picto || pictoDefaut(a.categorie) || pictoCategorieDefaut(categorie?.nom));
    const photo = photoDuBouton(a, hab);
    const avecPhoto = Boolean(photo) && !photosEnEchec.has(photo);
    const conflits = conflitsDe(a);
    const n = quantites.get(a.id) || 0;
    const rupture = estEnRupture(a);
    return (
      <button
        key={a.id}
        type="button"
        className="caisse-case"
        data-cadre=""
        data-produit={a.id}
        data-photo={avecPhoto ? '' : undefined}
        data-allergene={conflits.length ? '' : undefined}
        data-rupture={rupture ? '' : undefined}
        aria-disabled={rupture || undefined}
        title={rupture ? 'En rupture aujourd\'hui' : (conflits.length ? `Attention : contient ${conflits.join(', ')}` : undefined)}
        style={{ ...st.case, ...(conflits.length ? st.caseAllergene : null), ...(rupture ? st.caseRupture : null) }}
        onClick={() => {
          if (appuiLong.current.declenche) { appuiLong.current.declenche = false; return; }
          if (editionBoutons && peutHabiller) { setBoutonPlat(a); return; }
          toucherArticle(a);
        }}
        onPointerDown={() => debutAppuiLong(a)}
        onPointerUp={finAppuiLong}
        onPointerLeave={finAppuiLong}
        onPointerCancel={finAppuiLong}
        onContextMenu={(e) => { if (peutRupture) e.preventDefault(); }}
      >
        <span style={{ ...st.caseVisuel, background: couleur ? `var(--caisse-${couleur})` : 'var(--piste)', ...(rupture ? st.caseVisuelRupture : null) }}>
          {avecPhoto ? (
            <img
              src={photo}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              style={st.casePhoto}
              onError={() => setPhotosEnEchec((s) => new Set(s).add(photo))}
            />
          ) : picto && (
            <picto.Icone size={dense ? 24 : 30} strokeWidth={1.5} aria-hidden="true" />
          )}
          {n > 0 && <span style={st.casePastille} data-caisse-quantite="">{n}</span>}
          {editionBoutons && peutHabiller && (
            <span style={st.caseCrayon}><Pencil size={14} strokeWidth={2} aria-hidden="true" /></span>
          )}
        </span>
        <span style={st.caseTexte}>
          {/* Nom complet sur deux lignes au plus (la case coupe le reste). */}
          <span style={{ ...st.caseNom, ...(rupture ? st.caseNomRupture : null) }} data-no-translate>{hab?.nom_court || a.nom}</span>
          {conflits.length > 0 && !rupture && (
            <span style={st.caseAlerte}>
              <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{conflits.join(', ')}</span>
            </span>
          )}
          {rupture
            ? <span style={st.caseRuptureMot} data-cadre="" data-caisse-rupture-mot="">Rupture</span>
            : prixCase(a)}
        </span>
      </button>
    );
  }

  // ── Modes, en tête de l'écran ──
  const ongletsModes = suites.map((s) => {
    const n = enAttente.filter((l) => l.suite === s).length;
    return {
      id: s,
      label: (
        <>
          <span data-no-translate>{libelleMode(reglages, s)}</span>
          {n > 0 && <span style={st.modeCompte} data-cadre="">{n}</span>}
        </>
      ),
    };
  });
  if (plusPossible) {
    ongletsModes.push({
      id: ID_PLUS,
      label: <><Plus size={18} strokeWidth={2} aria-hidden="true" /><span style={st.horsEcran}>Ajouter un mode</span></>,
    });
  }

  // ── L'action principale : une seule à la fois ──
  let actionPrincipale;
  if (suiteAEnvoyer === 1) {
    actionPrincipale = (
      <Btn variant="primary" onClick={envoyer} disabled={envoiEnCours} style={st.btnPrincipal} data-caisse-action="envoyer">
        <Send size={20} strokeWidth={1.75} aria-hidden="true" />
        <span>Envoyer en cuisine</span>
      </Btn>
    );
  } else if (suiteAEnvoyer != null) {
    actionPrincipale = (
      <Btn variant="primary" onClick={envoyer} disabled={envoiEnCours} style={st.btnPrincipal} data-caisse-action="reclamer">
        <Send size={20} strokeWidth={1.75} aria-hidden="true" />
        <span style={st.principalTexte}>
          <span>Réclamer la suite</span>
          <span style={st.principalDetail} data-no-translate>{libelleMode(reglages, suiteAEnvoyer)}</span>
        </span>
      </Btn>
    );
  } else if (lignes.length > 0) {
    actionPrincipale = (
      <Btn variant="primary" onClick={() => setPaiementOuvert(true)} style={st.btnPrincipal} data-caisse-action="encaisser">
        <span>Encaisser</span>
      </Btn>
    );
  } else {
    actionPrincipale = (
      <Btn variant="primary" disabled style={st.btnPrincipal} data-caisse-action="vide">
        <Send size={20} strokeWidth={1.75} aria-hidden="true" />
        <span>Envoyer en cuisine</span>
      </Btn>
    );
  }
  // Encaisser reste à un toucher pendant qu'il reste quelque chose à envoyer.
  const encaisserSecondaire = suiteAEnvoyer != null && lignes.length > 0 ? (
    <Btn variant="ghost" onClick={() => setPaiementOuvert(true)} style={st.btnSecondaire}>Encaisser</Btn>
  ) : null;

  // Entrées, plats et desserts de la table : un chiffre et son mot.
  const repereServices = (
    <span style={st.services} data-caisse-services="">
      {SERVICES.map(([cle, un, plusieurs]) => (
        <span key={cle} style={st.service} data-service={cle}>
          <span style={st.serviceChiffre}>{comptes[cle]}</span>
          <span style={st.serviceLibelle}>{comptes[cle] === 1 ? un : plusieurs}</span>
        </span>
      ))}
    </span>
  );

  // ── Menu des actions du ticket (en-tête) ──
  const menuActions = (
    <BoutonActions
      id="caisse-commande-plus"
      label={<><MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" /><span style={st.horsEcran}>Actions du ticket</span></>}
      style={st.rond}
      titre="Actions du ticket"
      sections={[
        { titre: 'Saisie', items: [
          { titre: 'Article libre', detail: 'Un libellé et un prix', onClick: () => setLibreOuvert(true) },
          cartes.length > 1 && {
            titre: 'Carte affichée',
            detail: carte ? <span data-no-translate>{carte.nom}</span> : 'Toutes les cartes',
            onClick: () => setCartesOuvert(true),
          },
          peutHabiller && {
            titre: editionBoutons ? 'Terminer la modification des cases' : 'Modifier les cases',
            detail: 'Nom court, couleur, picto et photo',
            onClick: () => setEditionBoutons((v) => !v),
          },
        ] },
        { titre: 'Ticket', items: [
          suiteAEnvoyer != null && suiteAEnvoyer < SUITE_MAX && {
            titre: 'Passer à suivre', detail: 'Les articles en attente passent au mode suivant', onClick: passerASuivre,
          },
          { titre: 'Déplacer vers une autre table', onClick: onDeplacer },
          ticketsMemeTable.length > 0 && { titre: 'Fusionner les tickets de la table', onClick: fusionner },
          { titre: 'Annuler le ticket', detail: 'Les articles déjà envoyés restent en cuisine', danger: true, onClick: annuler },
        ] },
      ]}
    />
  );

  // ── La commande : en feuille au téléphone, en panneau à la tablette ──
  function contenuCommande(enFeuille) {
    return (
      <>
        <div style={st.commandeEntete}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={st.commandeTitre}>Commande</div>
            <div style={st.commandeDetail}>
              <span style={st.commandeTable}>{titre}</span>{' '}
              <span>ouvert à</span> <span style={st.num}>{heureOuverture}</span>
            </div>
          </div>
          {enFeuille && (
            <button type="button" style={st.rond} onClick={fermerFeuille}>
              <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" />
              <span style={st.horsEcran}>Fermer le résumé</span>
            </button>
          )}
        </div>

        {/* Ticket de test (v6) : ni client ni réservation, rien à corriger. */}
        {modeTest && (
          <div style={st.bandeauClient} data-caisse-client="test">
            <FlaskConical size={18} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
            <div style={st.bandeauCorps}>
              <span style={st.bandeauNom}>Ticket de test</span>
              <span style={st.bandeauDetail}>
                {ticket.couverts && (
                  <span><span style={st.num}>{ticket.couverts}</span> <span>couverts</span></span>
                )}
                <span>Aucune réservation ni fiche client n'est touchée</span>
              </span>
            </div>
          </div>
        )}
        {/* Qui est à la table (v5). Vente directe : anonyme, pas de bandeau. */}
        {!modeTest && ticket.table_id && (
          <div style={st.bandeauClient} data-caisse-client={ticket.qui || 'inconnu'}>
            <div style={st.bandeauCorps}>
              {reservation ? (
                <span style={st.bandeauNom} data-no-translate>{reservation.nom}</span>
              ) : (
                <span style={st.bandeauNom}>{ticket.reservation_id ? 'Réservation' : 'Client non renseigné'}</span>
              )}
              <span style={st.bandeauDetail}>
                {(ticket.couverts || reservation?.nb_couverts) && (
                  <span><span style={st.num}>{ticket.couverts || reservation.nb_couverts}</span> <span>couverts</span></span>
                )}
                {ticket.qui && <span>{LIBELLES_QUI[ticket.qui]}</span>}
                {reservation?.statut === 'no_show' && <span>No-show</span>}
              </span>
              {allergies.length > 0 && (
                <span style={st.bandeauAllergies}>
                  <span>Allergies :</span> <span data-no-translate>{allergies.join(', ')}</span>
                </span>
              )}
            </div>
            <Btn variant="ghost" onClick={() => setCorrigerOuvert(true)} style={st.btn44}>Corriger</Btn>
          </div>
        )}

        <div style={st.lignesZone} data-caisse-lignes="">
          {lignes.length === 0 && <p style={st.vide}>Touchez une case pour ajouter un article.</p>}
          {Array.from({ length: SUITE_MAX }, (_, i) => i + 1).filter((s) => lignes.some((l) => l.suite === s)).map((s) => {
            const duBloc = lignes.filter((l) => l.suite === s);
            const attente = duBloc.filter((l) => l.statut === 'en_attente');
            const enCours = attente.length > 0;
            // Un mode tenu dont toutes les lignes en attente sont déjà en
            // cuisine (tenues) est « annoncé » ; il reste à le réclamer.
            const annonce = enCours && attente.every((l) => l.annonce_at);
            return (
              <div key={s} style={st.bloc} className="caisse-bloc" data-mode={s} data-mode-etat={annonce ? 'annonce' : (enCours ? 'en_attente' : 'envoye')}>
                <div style={st.blocTitre}>
                  <span style={st.blocNomRang}>
                    {s === modeActif && <span style={st.blocPoint} aria-hidden="true" />}
                    <span style={st.blocNom} data-no-translate>{libelleMode(reglages, s)}</span>
                  </span>
                  <span style={st.blocEtat}>{annonce ? 'annoncé' : (enCours ? 'en attente' : 'envoyé')}</span>
                </div>
                {duBloc.map((l) => {
                  const q = Number(l.quantite);
                  const params = [...(l.options || []).map(libelleOption), l.note].filter(Boolean).join(', ');
                  const attenteLigne = l.statut === 'en_attente';
                  return (
                    <div key={l.id} style={st.ligneRang} data-ligne={l.statut}>
                      <button
                        type="button"
                        style={st.ligneBouton}
                        title={attenteLigne ? undefined : (l.statut === 'servi' ? 'Toucher pour remettre en envoyé' : 'Toucher pour marquer servi')}
                        onClick={() => (attenteLigne ? setFicheLigneId(l.id) : basculerServi(l))}
                      >
                        <span style={st.ligneQte}>{q}</span>
                        <span style={st.ligneCorps}>
                          <span style={st.ligneNom} data-no-translate>{l.libelle}</span>
                          {params && <span style={st.ligneNote} data-no-translate>{params}</span>}
                          {/* Remise ou offert posés par un responsable (v7). */}
                          {l.offert && <span style={st.ligneNote} data-ligne-offerte="">Offert</span>}
                          {!l.offert && l.prix_origine != null && (
                            <span style={st.ligneNote} data-ligne-remisee="">
                              <span>Remise</span> <span style={st.num}>{chf(l.remise_montant)}</span>
                            </span>
                          )}
                          {attenteLigne && !l.annonce_at && (
                            <span style={st.etat}><Hourglass size={13} strokeWidth={1.75} aria-hidden="true" /><span>En attente</span></span>
                          )}
                          {attenteLigne && l.annonce_at && (
                            <span style={st.etat} data-ligne-annoncee="">
                              <Megaphone size={13} strokeWidth={1.75} aria-hidden="true" /><span>Annoncé en cuisine, à réclamer</span>
                            </span>
                          )}
                          {l.statut === 'envoye' && (
                            <span style={st.etat}>
                              <Send size={13} strokeWidth={1.75} aria-hidden="true" />
                              <span>Envoyé à</span>
                              <span style={st.num}>{l.envoye_at ? zurichDateHeure(l.envoye_at).heure : ''}</span>
                            </span>
                          )}
                          {l.statut === 'servi' && (
                            <span style={{ ...st.etat, ...st.etatServi }}><Check size={14} strokeWidth={2.25} aria-hidden="true" /><span>Servi</span></span>
                          )}
                          {/* La cuisine a marqué le plat fait : à emporter en salle. */}
                          {estPret(l) && (
                            <span style={st.pret} data-cadre="" data-ligne-prete="">
                              <ConciergeBell size={14} strokeWidth={2.25} aria-hidden="true" /><span>Prêt</span>
                            </span>
                          )}
                        </span>
                        <span style={st.lignePrix}>{chf(q * Number(l.prix_unitaire))}</span>
                      </button>
                      {attenteLigne && (
                        <button
                          type="button"
                          style={{ ...st.ligneRetrait, ...(q > 1 ? null : st.ligneRetraitSupprimer) }}
                          onClick={() => retirerUn(l)}
                          aria-label={q > 1 ? 'Retirer un' : 'Supprimer la ligne'}
                          title={q > 1 ? 'Retirer un' : 'Supprimer la ligne'}
                          data-ligne-retrait=""
                        >
                          {q > 1
                            ? <Minus size={18} strokeWidth={2} aria-hidden="true" />
                            : <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={st.commandePied} data-caisse-pied="">
          <div style={st.totalRang}>
            <span style={st.totalBloc}>
              <span style={st.totalLibelle}>Total</span>
              <span style={st.totalValeur}><span>{chf(total)}</span> <span style={st.devise}>CHF</span></span>
            </span>
            {repereServices}
          </div>
          {actionPrincipale}
          {encaisserSecondaire}
        </div>
      </>
    );
  }

  // ── Le rail des catégories ──
  const ongletsRail = rangement.onglets.length > 1 ? [
    { id: ID_TOUT, nom: 'Tout', Icone: LayoutGrid, donnee: false },
    ...rangement.onglets.map((c) => ({
      id: c.id, nom: c.nom, donnee: true,
      Icone: (pictoParId(c.picto) || pictoParId(pictoCategorieDefaut(c.nom)))?.Icone || LayoutGrid,
    })),
  ] : [];
  const rail = ongletsRail.length > 0 && (
    <nav style={{ ...st.rail, width: tablette ? 92 : 74 }} className="caisse-rail" aria-label="Catégories" data-caisse-rail="">
      {ongletsRail.map((o) => {
        const actif = !enRecherche && onglet === o.id;
        return (
          <button
            key={o.id}
            type="button"
            style={st.railBouton}
            aria-pressed={actif}
            data-categorie={o.id}
            onClick={() => { setRecherche(''); setOngletChoisi(o.id); }}
          >
            <span style={{ ...st.railCercle, ...(actif ? st.railCercleActif : null) }}>
              <o.Icone size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span style={{ ...st.railLibelle, ...(actif ? st.railLibelleActif : null) }} data-no-translate={o.donnee ? '' : undefined}>
              {o.nom}
            </span>
          </button>
        );
      })}
    </nav>
  );

  // ── La grille ──
  const grille = (
    <main style={st.zoneGrille} data-caisse-grille="">
      {/* Compteur discret des ruptures du jour : il ouvre leur liste. */}
      {ruptures.length > 0 && (
        <button type="button" style={st.compteRupture} onClick={() => setRupturesOuvert(true)} data-caisse-ruptures="">
          <span style={st.compteRupturePilule} data-cadre="">
            <span style={st.num}>{ruptures.length}</span> <span>{libelleCompteRupture(ruptures.length)}</span>
          </span>
        </button>
      )}
      {enRecherche ? (
        <div style={styleGrille}>{trouves.map(({ a, c }) => caseProduit(a, c))}</div>
      ) : sections.map((c) => {
        const sous = sousGroupesAutres(c);
        return (
          <section key={c.id} style={st.sectionGrille}>
            {onglet === ID_TOUT && <div style={st.categorie} data-no-translate>{c.nom}</div>}
            {sous ? sous.map((g) => (
              <div key={g.titre}>
                <div style={st.sousCategorie} data-no-translate>{g.titre}</div>
                <div style={styleGrille}>{g.articles.map((a) => caseProduit(a, c))}</div>
              </div>
            )) : (
              <div style={styleGrille}>{c.articles.map((a) => caseProduit(a, c))}</div>
            )}
          </section>
        );
      })}
      {(enRecherche ? !trouves.length : !rangement.onglets.length) && (
        <p style={st.vide}>
          {enRecherche ? 'Aucun article ne correspond.' : 'Aucun article sur les cartes en vente.'}
        </p>
      )}
    </main>
  );

  const sortieFeuille = feuille === 'fermeture';

  return createPortal(
    <div ref={racineRef} style={st.plein} className="caisse-plein no-print" data-caisse-ecran={tablette ? 'tablette' : 'telephone'}>
      {bandeau}

      {/* ── En-tête : retour, modes, loupe, actions ── */}
      <header style={st.entete} data-caisse-entete="">
        <button type="button" style={st.rond} onClick={onRetour}>
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          <span style={st.horsEcran}>Retour au plan de salle</span>
        </button>
        {(tablette || ongletsModes.length < 2) && (
          <div style={st.enteteTitre}>
            <span style={st.enteteTable}>{titre}</span>
            <span style={st.enteteDetail}><span>Ouvert à</span> <span style={st.num}>{heureOuverture}</span></span>
          </div>
        )}
        {ongletsModes.length > 1 && (
          <div style={st.modesZone} data-caisse-modes="">
            <SegmentedTabs className="caisse-modes" tabs={ongletsModes} active={modeActif} onChange={choisirMode} />
          </div>
        )}
        <button
          type="button"
          style={{ ...st.rond, ...(rechercheOuverte ? st.rondActif : null) }}
          aria-pressed={rechercheOuverte}
          onClick={() => { if (rechercheOuverte) setRecherche(''); setRechercheOuverte((v) => !v); }}
        >
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          <span style={st.horsEcran}>Chercher un article</span>
        </button>
        {menuActions}
      </header>

      {rechercheOuverte && (
        <div style={st.rechercheRang} data-caisse-recherche="">
          <Input
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setRecherche(''); setRechercheOuverte(false); } }}
            placeholder="Chercher un article"
            style={{ minHeight: 44, flex: 1, minWidth: 0 }}
          />
          {recherche && (
            <button type="button" style={st.rond} onClick={() => setRecherche('')}>
              <X size={18} strokeWidth={2} aria-hidden="true" />
              <span style={st.horsEcran}>Effacer la recherche</span>
            </button>
          )}
        </div>
      )}
      {editionBoutons && peutHabiller && (
        <div style={st.editionRang} data-caisse-edition="">
          <span style={st.editionTexte}>Touchez une case pour changer son nom court, sa couleur, son picto ou sa photo.</span>
          <Btn variant="ghost" onClick={() => setEditionBoutons(false)} style={st.btn44}>Terminer</Btn>
        </div>
      )}

      {/* ── Corps : rail, grille, et la commande à droite sur tablette ── */}
      <div
        style={{
          ...st.corps,
          gridTemplateColumns: [rail ? 'auto' : null, 'minmax(0, 1fr)', tablette ? `${largeur >= 1100 ? 380 : 340}px` : null]
            .filter(Boolean).join(' '),
        }}
      >
        {rail}
        {grille}
        {tablette && (
          <aside style={st.panneau} data-caisse-ticket="" aria-label="Commande">
            {contenuCommande(false)}
          </aside>
        )}
      </div>

      {/* ── Téléphone : le résumé et l'action, collés en bas ── */}
      {!tablette && (
        <footer style={st.barre} data-caisse-barre="">
          <button
            type="button"
            style={st.resume}
            onClick={ouvrirFeuille}
            aria-expanded={feuille === 'ouverte'}
            data-caisse-resume=""
          >
            <span style={st.resumeHaut}>
              <span style={st.resumeTable}>{titre}</span>
              <span style={st.resumeOuvrir}>
                <span>Résumé de la commande</span>
                <ChevronUp size={16} strokeWidth={2} aria-hidden="true" />
              </span>
            </span>
            <span style={st.resumeBas}>
              <span style={st.resumeMontant}><span>{chf(total)}</span> <span style={st.devise}>CHF</span></span>
              {repereServices}
            </span>
          </button>
          {actionPrincipale}
        </footer>
      )}

      {!tablette && feuille !== 'fermee' && (
        <div
          className={sortieFeuille ? 'caisse-voile caisse-voile--sortie' : 'caisse-voile'}
          style={st.voile}
          onClick={(e) => { if (e.target === e.currentTarget) fermerFeuille(); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Résumé de la commande"
            className={sortieFeuille ? 'caisse-feuille caisse-feuille--sortie' : 'caisse-feuille'}
            style={st.feuille}
            data-caisse-feuille=""
            data-caisse-ticket=""
          >
            <button type="button" style={st.poignee} onClick={fermerFeuille}>
              <span style={st.poigneeTrait} />
              <span style={st.horsEcran}>Fermer le résumé</span>
            </button>
            {contenuCommande(true)}
          </section>
        </div>
      )}

      {/* ── Fenêtres et feuilles : hors de la feuille qui glisse (une
          transformation en cours cadrerait leur position fixe). ── */}
      {/* Appui long sur une case (L2) : la rupture d'abord, l'habillage ensuite. */}
      {produitAppui && (() => {
        const rupture = estEnRupture(produitAppui);
        return (
          <Fenetre
            id="caisse-produit-appui"
            titre="Produit de la caisse"
            titreMasque
            onClose={() => setProduitAppui(null)}
            largeur={420}
            pied={(
              <>
                {/* L'habillage reste aux rôles qui habillent la caisse (RLS). */}
                {peutHabiller ? (
                  <button
                    type="button"
                    style={fen.secondaire}
                    onClick={() => { const p = produitAppui; setProduitAppui(null); setBoutonPlat(p); }}
                  >
                    Modifier la case
                  </button>
                ) : (
                  <button type="button" style={fen.secondaire} onClick={() => setProduitAppui(null)}>Fermer</button>
                )}
                <button
                  type="button"
                  style={fen.primaire}
                  disabled={ruptureEnCours}
                  data-caisse-rupture-action={rupture ? 'remettre' : 'mettre'}
                  onClick={async () => { if (await changerRupture([produitAppui], !rupture)) setProduitAppui(null); }}
                >
                  {rupture ? 'Remettre en vente' : 'Mettre en rupture'}
                </button>
              </>
            )}
          >
            <div style={fen.titre} data-no-translate>{boutons[produitAppui.id]?.nom_court || produitAppui.nom}</div>
            <p style={st.appuiTexte}>
              {rupture
                ? 'Ce produit est en rupture jusqu\'à demain matin. Remis en vente, il se commande de nouveau sur toutes les caisses.'
                : 'En rupture, la case est grisée sur toutes les caisses et le produit ne se commande plus. Il revient en vente tout seul demain matin.'}
            </p>
          </Fenetre>
        );
      })()}
      {/* Liste des produits en rupture (compteur au-dessus de la grille). */}
      {rupturesOuvert && (
        <Fenetre
          id="caisse-ruptures"
          titre="Produits en rupture"
          onClose={() => setRupturesOuvert(false)}
          largeur={460}
          pied={(
            <>
              <button type="button" style={fen.secondaire} onClick={() => setRupturesOuvert(false)}>Fermer</button>
              {peutRupture && ruptures.length > 1 && (
                <button
                  type="button"
                  style={fen.primaire}
                  disabled={ruptureEnCours}
                  onClick={async () => { if (await changerRupture(ruptures, false)) setRupturesOuvert(false); }}
                >
                  Tout remettre en vente
                </button>
              )}
            </>
          )}
        >
          {!ruptures.length && <p style={st.appuiTexte}>Aucun produit en rupture.</p>}
          {ruptures.length > 0 && (
            <>
              <p style={st.appuiTexte}>
                {peutRupture
                  ? 'Ils reviennent en vente tout seuls demain matin. Vous pouvez les remettre en vente avant.'
                  : 'Ils reviennent en vente demain matin, ou quand un responsable les remet en vente.'}
              </p>
              <div style={st.rupturesListe} data-caisse-ruptures-liste="">
                {ruptures.map((a) => (
                  <div key={a.id} style={st.ruptureRang} data-rupture-produit={a.id}>
                    <span style={st.ruptureNom} data-no-translate>{boutons[a.id]?.nom_court || a.nom}</span>
                    {peutRupture && (
                      <Btn variant="ghost" disabled={ruptureEnCours} onClick={() => changerRupture([a], false)} style={st.btn44}>
                        Remettre en vente
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </Fenetre>
      )}
      {boutonPlat && (
        <BoutonFiche
          plat={boutonPlat}
          bouton={boutons[boutonPlat.id]}
          enRupture={estEnRupture(boutonPlat)}
          ruptureEnCours={ruptureEnCours}
          onRupture={(mettre) => changerRupture([boutonPlat], mettre)}
          etablissementId={ticket.etablissement_id}
          onEnregistrer={async (valeurs) => {
            const { error } = await caisse.upsertBouton({
              etablissementId: ticket.etablissement_id,
              platId: boutonPlat.id,
              ...valeurs,
            });
            if (error) { notify(error, 'error'); return; }
            setBoutonPlat(null);
            onBoutonsChange?.();
          }}
          onClose={() => setBoutonPlat(null)}
        />
      )}
      {ficheLigne && (
        <FicheLigne
          ligne={ficheLigne}
          sansRecents={sansRecents}
          reglages={reglages}
          suites={suitesVisibles(reglages, lignes, Math.max(modesOuverts, reglages.modes.max))}
          supplements={supplementsFiche}
          onSupplement={ajouterSupplement}
          onChange={majFicheLigne}
          onSupprimer={supprimerFicheLigne}
          onClose={() => setFicheLigneId(null)}
        />
      )}
      {/* Encaissement (v7) : la feuille prépare, la base encaisse et numérote. */}
      {paiementOuvert && (
        <Encaissement
          ticket={ticket}
          reglages={reglages}
          peutRemiser={peutHabiller}
          modeTest={modeTest}
          onQuittance={onQuittance}
          onEncaisse={() => { setPaiementOuvert(false); onClos(); }}
          onEnvoi={onEncaissementEnvoye}
          onClose={() => setPaiementOuvert(false)}
          reload={reload}
          terminaux={terminaux}
          role={role}
          boutons={boutons}
          categories={categories}
          articles={articles}
        />
      )}
      {libreOuvert && (
        <Fenetre
          id="caisse-article-libre"
          titre="Article libre"
          onClose={() => setLibreOuvert(false)}
          largeur={420}
          pied={(
            <>
              <button type="button" style={fen.secondaire} onClick={() => setLibreOuvert(false)}>Fermer</button>
              <button type="button" style={fen.primaire} disabled={!libreNom.trim()} onClick={ajouterLibre}>Ajouter</button>
            </>
          )}
        >
          <div style={st.libreForm}>
            <label style={st.libreChamp}>
              <span style={fen.label}>Libellé</span>
              <Input value={libreNom} onChange={(e) => setLibreNom(e.target.value)} style={{ minHeight: 44, width: '100%' }} />
            </label>
            <label style={st.libreChamp}>
              <span style={fen.label}>Prix</span>
              <Input value={librePrix} onChange={(e) => setLibrePrix(e.target.value)} type="text" inputMode="decimal" style={{ minHeight: 44, width: '100%' }} />
            </label>
          </div>
        </Fenetre>
      )}
      {cartesOuvert && (
        <Fenetre id="caisse-carte-affichee" titre="Carte affichée" onClose={() => setCartesOuvert(false)} largeur={420}>
          <div style={st.carteListe}>
            <Btn variant={carte ? 'ghost' : 'primary'} onClick={() => { setCarteChoisie(null); setCartesOuvert(false); }} style={st.btn44}>Toutes les cartes</Btn>
            {cartes.map((c) => (
              <Btn key={c.id} variant={carte?.id === c.id ? 'primary' : 'ghost'} onClick={() => { setCarteChoisie(c.id); setCartesOuvert(false); }} style={st.btn44}>
                <span data-no-translate>{c.nom}</span>
              </Btn>
            ))}
          </div>
        </Fenetre>
      )}
      {alerteAllergene && (
        <Fenetre
          id="caisse-alerte-allergene"
          titre="Attention allergène"
          onClose={() => setAlerteAllergene(null)}
          largeur={420}
          pied={(
            <>
              <button type="button" style={fen.secondaire} onClick={() => setAlerteAllergene(null)}>Annuler</button>
              <button
                type="button"
                style={fen.primaire}
                onClick={() => { const { plat } = alerteAllergene; setAlerteAllergene(null); poserArticle(plat); }}
              >
                Ajouter quand même
              </button>
            </>
          )}
        >
          <div style={st.alerteCorps}>
            <TriangleAlert size={22} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--danger-text)' }} />
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              <span data-no-translate>{alerteAllergene.plat.nom}</span>
              {' '}<span>contient</span>{' '}
              <strong>{alerteAllergene.allergenes.join(', ')}</strong>
              <span>.</span>{' '}
              <span>{alerteAllergene.allergenes.length > 1 ? 'La table a signalé ces allergènes.' : 'La table a signalé cet allergène.'}</span>{' '}
              <span>Vérifiez avec le client avant d'envoyer.</span>
            </p>
          </div>
        </Fenetre>
      )}
      {/* Boisson à plusieurs formats : un toucher par format, la ligne part
          dans le mode actif. */}
      {choixFormat && (
        <Fenetre
          id="caisse-choix-format"
          titre="Choisir le format"
          onClose={() => setChoixFormat(null)}
          largeur={420}
        >
          <div style={fen.titre} data-no-translate>{boutons[choixFormat.id]?.nom_court || choixFormat.nom}</div>
          <div style={st.formatsListe} data-caisse-formats="">
            {(choixFormat.formats || []).map((f) => (
              <button
                key={f.id}
                type="button"
                style={st.formatChoix}
                data-caisse-format={f.libelle}
                onClick={() => { const plat = choixFormat; setChoixFormat(null); ajouterArticle(plat, f); }}
              >
                <span style={st.formatLibelle} data-no-translate>{f.libelle}</span>
                <span style={st.formatPrix} data-no-translate>{chf(f.prix)}</span>
              </button>
            ))}
          </div>
        </Fenetre>
      )}
      {corrigerOuvert && (
        <CorrigerClient
          reservation={reservation}
          reservations={reservations}
          tableId={ticket.table_id}
          enCours={correctionEnCours}
          onCorriger={corriger}
          onClose={() => setCorrigerOuvert(false)}
        />
      )}
    </div>,
    document.body,
  );
}

const st = {
  // Fenêtre « Choisir le format » : une ligne par format, au doigt.
  formatsListe: { display: 'flex', flexDirection: 'column' },
  formatChoix: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 56,
    padding: '10px 4px', background: 'transparent', borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid',
    borderColor: 'var(--rule-soft)', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)', textAlign: 'left',
  },
  formatLibelle: { fontSize: 'var(--t3)', fontWeight: 'var(--g2)' },
  formatPrix: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t3)' },
  // L'écran entier, posé sur la coque (portail dans body).
  plein: {
    position: 'fixed', inset: 0, zIndex: 900, display: 'flex', flexDirection: 'column', minWidth: 0,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)',
    paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
  },
  entete: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0, boxSizing: 'border-box',
    padding: 'calc(8px + env(safe-area-inset-top)) 10px 8px', background: 'var(--surface)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  // Bouton à picto seul : un cercle de 40 px dans une cible de 44 px.
  rond: {
    width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, cursor: 'pointer', color: 'var(--text)', background: 'var(--piste)',
    borderRadius: 'var(--r-full)', borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--surface)',
    boxSizing: 'border-box', fontFamily: 'var(--font)',
  },
  rondActif: { background: 'var(--accent)', color: 'var(--on-accent)' },
  enteteTitre: { display: 'flex', flexDirection: 'column', minWidth: 0, flexShrink: 1, marginRight: 4 },
  enteteTable: {
    fontSize: 'var(--t3)', fontWeight: 'var(--g2)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  enteteDetail: { fontSize: 'var(--t1)', color: 'var(--text3)', whiteSpace: 'nowrap' },
  modesZone: { flex: '1 1 auto', minWidth: 0, display: 'flex' },
  modeCompte: {
    fontFamily: 'var(--font-num)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', minWidth: 22, height: 22, padding: '0 6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text)', marginLeft: 8,
  },
  horsEcran: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  rechercheRang: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '8px 10px', background: 'var(--surface)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  editionRang: {
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, padding: '8px 12px', flexWrap: 'wrap',
    background: 'var(--carte-ciel)', color: 'var(--carte-ciel-texte)',
  },
  editionTexte: { flex: '1 1 220px', fontSize: 'var(--t2)', lineHeight: 1.35, minWidth: 0 },
  corps: { flex: '1 1 auto', minHeight: 0, display: 'grid', minWidth: 0 },
  // Rail des catégories : pictos dans leur cercle, nom dessous.
  rail: {
    display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 4px', overflowY: 'auto', overscrollBehavior: 'contain',
    background: 'var(--surface)', boxSizing: 'border-box', minHeight: 0,
    borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: 'var(--rule-soft)',
  },
  railBouton: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%', minHeight: 64, padding: '6px 2px',
    background: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', borderRadius: 'var(--r)',
    cursor: 'pointer', color: 'var(--text2)', fontFamily: 'var(--font)', flexShrink: 0,
  },
  railCercle: {
    width: 44, height: 44, borderRadius: 'var(--r-full)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--piste)', color: 'var(--text)', flexShrink: 0,
  },
  railCercleActif: { background: 'var(--accent)', color: 'var(--on-accent)' },
  railLibelle: {
    fontSize: 'var(--t1)', lineHeight: 1.2, textAlign: 'center', maxWidth: '100%', overflowWrap: 'anywhere',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  railLibelleActif: { color: 'var(--text)', fontWeight: 'var(--g2)' },
  zoneGrille: {
    minWidth: 0, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box',
    padding: '12px 12px 20px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  sectionGrille: { minWidth: 0 },
  categorie: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text2)', margin: '8px 2px 8px' },
  sousCategorie: { fontSize: 'var(--t1)', color: 'var(--text3)', margin: '8px 2px 6px' },
  grille: { display: 'grid', gap: 10 },
  // Une case : la photo (ou la couleur et le picto) en haut, le nom et le prix
  // dessous. Bloc en bouton : rayon --r, carte blanche à filet doux.
  case: {
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: 0, minWidth: 0, overflow: 'hidden',
    background: 'var(--zone)', color: 'var(--text)', borderRadius: 'var(--r)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', boxSizing: 'border-box',
    WebkitTouchCallout: 'none', userSelect: 'none',
  },
  caseAllergene: { borderWidth: 2, borderColor: 'var(--danger-text)' },
  caseVisuel: {
    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
    aspectRatio: '4 / 3', color: 'var(--text)', flexShrink: 0, overflow: 'hidden',
  },
  casePhoto: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' },
  casePastille: {
    position: 'absolute', top: 6, right: 6, minWidth: 26, height: 26, padding: '0 7px', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--r-full)',
    background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)',
    fontWeight: 'var(--g3)', boxShadow: 'var(--sh)',
  },
  caseCrayon: {
    position: 'absolute', top: 6, left: 6, width: 28, height: 28, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--sh)',
  },
  caseTexte: { display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 10px 10px', minWidth: 0, flex: '1 1 auto' },
  caseNom: {
    fontSize: 'var(--t2)', fontWeight: 'var(--g2)', lineHeight: 1.25, minHeight: '2.5em', overflowWrap: 'anywhere',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  caseAlerte: {
    display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0,
    fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--danger-text)', lineHeight: 1.2, overflowWrap: 'anywhere',
  },
  casePrix: { fontSize: 'var(--t1)', color: 'var(--text2)', fontFamily: 'var(--font-num)' },
  // Case en rupture (L2) : fond gris, sans ombre, visuel en gris à 0,65 (le
  // plancher d'un élément éteint), nom et mot « Rupture » à pleine encre.
  caseRupture: { background: 'var(--piste)', boxShadow: 'none', borderWidth: 1, borderColor: 'var(--rule-soft)', cursor: 'default' },
  caseVisuelRupture: { opacity: 0.65, filter: 'grayscale(1)' },
  caseNomRupture: { color: 'var(--text2)' },
  caseRuptureMot: {
    alignSelf: 'flex-start', padding: '1px 9px', borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', lineHeight: 1.4,
  },
  // Compteur des ruptures : une petite pilule dans une cible de 44 px.
  compteRupture: {
    alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, flexShrink: 0,
    background: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', cursor: 'pointer',
    color: 'var(--text)', fontFamily: 'var(--font)',
  },
  compteRupturePilule: {
    display: 'inline-flex', alignItems: 'center', gap: '0.3em', minHeight: 32, padding: '0 12px', boxSizing: 'border-box',
    borderRadius: 'var(--r-full)', background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text)', whiteSpace: 'nowrap',
  },
  appuiTexte: { margin: '6px 0 0', fontSize: 'var(--t2)', lineHeight: 1.45, color: 'var(--text2)' },
  rupturesListe: { display: 'flex', flexDirection: 'column', marginTop: 10, minWidth: 0 },
  ruptureRang: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 52, padding: '4px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  ruptureNom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere', minWidth: 0 },
  vide: { color: 'var(--text2)', fontSize: 'var(--t2)', margin: '12px 2px' },
  // Panneau de la commande, à droite sur tablette.
  panneau: {
    display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--surface)',
    borderLeftWidth: 1, borderLeftStyle: 'solid', borderLeftColor: 'var(--rule-soft)',
  },
  commandeEntete: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 8px', flexShrink: 0, minWidth: 0 },
  commandeTitre: { fontSize: 'var(--t4)', fontWeight: 'var(--g2)', lineHeight: 1.2 },
  commandeDetail: { fontSize: 'var(--t1)', color: 'var(--text3)', marginTop: 2 },
  commandeTable: { color: 'var(--text2)', fontWeight: 'var(--g2)' },
  bandeauClient: {
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, margin: '0 12px 6px', padding: '10px 12px', minWidth: 0,
    background: 'var(--piste)', borderRadius: 'var(--r)',
  },
  bandeauCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  bandeauNom: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', lineHeight: 1.2, overflowWrap: 'anywhere' },
  bandeauDetail: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 'var(--t1)', color: 'var(--text2)' },
  bandeauAllergies: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--warning-text)', lineHeight: 1.3, overflowWrap: 'anywhere' },
  lignesZone: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 16px', minWidth: 0 },
  bloc: { paddingBottom: 6 },
  blocTitre: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '12px 0 2px' },
  blocNomRang: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 },
  blocPoint: { width: 8, height: 8, borderRadius: 'var(--r-full)', background: 'var(--accent)', flexShrink: 0 },
  blocNom: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  blocEtat: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  // Une ligne : son toucher ouvre sa fiche (ou bascule servi), le cercle à
  // droite retire d'un toucher.
  ligneRang: {
    display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  ligneBouton: {
    display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0, minHeight: 52, padding: '10px 0',
    textAlign: 'left', background: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent',
    borderRadius: 0, cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
  ligneQte: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t4)', lineHeight: 1.05, minWidth: 26, flexShrink: 0, textAlign: 'right' },
  ligneCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  ligneNom: { fontWeight: 'var(--g2)', lineHeight: 1.25, overflowWrap: 'anywhere' },
  ligneNote: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.3 },
  etat: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t1)', color: 'var(--text3)' },
  etatServi: { color: 'var(--success-text)', fontWeight: 'var(--g3)' },
  pret: {
    display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '2px 9px',
    borderRadius: 'var(--r-full)', background: 'var(--success-bg-soft)', color: 'var(--success-text)',
    fontSize: 'var(--t1)', fontWeight: 'var(--g3)',
  },
  lignePrix: { fontFamily: 'var(--font-num)', flexShrink: 0, paddingTop: 2 },
  ligneRetrait: {
    width: 44, height: 44, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, cursor: 'pointer', color: 'var(--text)', background: 'var(--piste)',
    borderRadius: 'var(--r-full)', borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--surface)', boxSizing: 'border-box',
  },
  ligneRetraitSupprimer: { color: 'var(--danger-text)' },
  commandePied: {
    display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)',
  },
  totalRang: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  totalBloc: { display: 'flex', flexDirection: 'column', gap: 2 },
  totalLibelle: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  totalValeur: { fontSize: 'var(--t6)', fontWeight: 'var(--g-chiffre)', fontFamily: 'var(--font-num)', lineHeight: 1.05 },
  devise: { fontSize: 'var(--t2)', fontWeight: 'var(--g1)', color: 'var(--text3)', fontFamily: 'var(--font)' },
  services: { display: 'inline-flex', gap: 14, alignItems: 'flex-end' },
  service: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 },
  serviceChiffre: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t4)', lineHeight: 1.1, color: 'var(--text)' },
  serviceLibelle: { fontSize: 'var(--t1)', color: 'var(--text3)', lineHeight: 1.2 },
  btnPrincipal: { minHeight: 56, fontSize: 'var(--t3)', width: '100%', gap: 10, whiteSpace: 'normal', flexShrink: 0 },
  btnSecondaire: { minHeight: 44, width: '100%', flexShrink: 0 },
  principalTexte: { display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 },
  principalDetail: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)' },
  // Téléphone : barre du bas, le résumé en tuile, l'action dessous.
  barre: {
    display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
    padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', background: 'var(--surface)', boxShadow: 'var(--sh-lg)',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--rule-soft)',
  },
  resume: {
    display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '8px 14px 10px', boxSizing: 'border-box',
    background: 'var(--piste)', color: 'var(--text)', borderRadius: 'var(--r)', cursor: 'pointer', textAlign: 'left',
    borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', fontFamily: 'var(--font)',
  },
  resumeHaut: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 },
  resumeTable: {
    fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
  },
  resumeOuvrir: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--t1)', color: 'var(--text2)', flexShrink: 0 },
  resumeBas: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, minWidth: 0 },
  resumeMontant: { fontSize: 'var(--t5)', fontWeight: 'var(--g-chiffre)', fontFamily: 'var(--font-num)', lineHeight: 1.05, whiteSpace: 'nowrap' },
  // Feuille de la commande : monte du bas, la grille reste devinée dessus.
  voile: {
    position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(0,0,0,0.45)',
    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
  },
  feuille: {
    display: 'flex', flexDirection: 'column', maxHeight: '90%', minHeight: '55%', minWidth: 0,
    background: 'var(--surface)', borderRadius: 'var(--r-xl) var(--r-xl) 0 0', boxShadow: 'var(--sh-lg)',
  },
  poignee: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 24, flexShrink: 0,
    padding: 0, background: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', cursor: 'pointer',
  },
  poigneeTrait: { width: 44, height: 5, borderRadius: 'var(--r-full)', background: 'var(--border)' },
  libreForm: { display: 'flex', flexDirection: 'column', gap: 12 },
  libreChamp: { display: 'flex', flexDirection: 'column', gap: 6 },
  carteListe: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  alerteCorps: { display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 'var(--t2)', color: 'var(--text)' },
  num: { fontFamily: 'var(--font-num)' },
  btn44: { minHeight: 44, flexShrink: 0 },
};
