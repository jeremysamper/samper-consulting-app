import React from 'react';
import { Check, ChevronDown, ConciergeBell, FlaskConical, Hourglass, Megaphone, Plus, Send } from 'lucide-react';
import { Btn, Input, SegmentedTabs } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import FicheLigne from './FicheLigne.jsx';
import BoutonFiche from './BoutonFiche.jsx';
import CorrigerClient from './CorrigerClient.jsx';
import { allergiesDe } from './clients.js';
import { libelleOption } from './options.js';
import { nomCourtDefaut, pictoDefaut, pictoParId } from './boutons.js';
import { ID_TOUT, rangerArticles, sousGroupesAutres } from './categories.js';
import { REGLAGES_DEFAUT, SUITE_MAX, libelleMode, peutOuvrirMode, suitesVisibles } from './reglages.js';
import { useHauteurRestante, useLargeur, useRetraitBas } from './mesures.js';
import { estPret } from './PlanTables.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// L'écran du ticket : à gauche la saisie (mode, catégories, produits), à
// droite la lecture de la table (ticket en blocs par mode, total, action).
// Gros boutons, cibles 44 px : c'est l'écran du service, au doigt, sur iPad.
//
// Modes (v4) : « En direct », « À suivre », « À suivre 2 »... sont les suites
// 1, 2, 3 de caisse_lignes, sans changement de schéma. On choisit le mode,
// puis chaque tap sur un produit l'ajoute dans ce mode ; le regroupement
// « même plat = +1 » se fait dans le mode actif. Le mode revient à « En
// direct » à chaque ouverture de ticket (le composant est remonté).
//
// Action principale, une seule à la fois : Envoyer (le direct), puis Réclamer
// la suite (le mode suivant en attente), puis Encaisser. Le moteur d'envoi est
// celui de la v1 : caisse_envoyer_bon sur la plus basse suite en attente,
// idempotent au double tap.
//
// Sur un écran large, l'écran est cadré : la grille et le ticket défilent
// chacun chez soi, le total et l'action ne quittent jamais l'écran.
// Les noms de produits, de catégories, de modes et de tables sont des
// données : data-no-translate. Chaque nombre vit dans son propre noeud
// (traduction du DOM).
//
// v5 : le ticket d'une table sait qui est assis. Un bandeau en tête dit le
// nom, les couverts et les allergies du client ; « Corriger » ouvre la feuille
// des corrections du service (nom, couverts, arrivé, no-show, autre
// réservation), toutes par la RPC caisse_corriger_reservation. Une vente
// directe reste anonyme : pas de bandeau.
// Quand la maison vend plus d'une carte, un sélecteur discret restreint la
// grille à une seule ; il s'ouvre sur « Toutes les cartes » (aucun geste de
// plus pour qui ne s'en sert pas) et le choix tient le temps du ticket. Un
// produit porté par deux cartes n'apparaît qu'une fois.
//
// v6 : la cuisine voit ce qui arrive, la salle voit ce qui est prêt.
// Au premier envoi, les lignes des modes suivants sont annoncées en cuisine,
// tenues : elles s'affichent « annoncé » et restent modifiables (la base met
// l'item de la cuisine à jour). « Réclamer la suite » les libère par la RPC
// caisse_reclamer_suite : même tap unique qu'avant. Quand la cuisine marque un
// plat fait, la ligne porte « Prêt » (caisse_lignes.pret_at, posé par la
// base : le service ne lit jamais les tables du KDS).
// En mode test (modeTest), le ticket n'a ni client ni réservation : le
// bandeau le dit et « Corriger » n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const LARGEUR_DEUX_COLONNES = 700;
const ID_PLUS = '_plus';
const LIBELLES_QUI = { reservation: 'Réservation', passage: 'Client de passage', compte: 'Compte client' };

export default function TicketEcran({
  ticket, articles, boutons = {}, categories = [], reglages = REGLAGES_DEFAUT,
  peutHabiller = false, onBoutonsChange, onOuvrirReglages,
  ticketsMemeTable, onDeplacer, onFusionne, onClos, reload,
  cartes = [], reservation = null, reservations = [], onReservationsChange,
  modeTest = false,
}) {
  const [recherche, setRecherche] = React.useState('');
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
  // Onglet de catégorie choisi ; null = celui par défaut (voir plus bas).
  const [ongletChoisi, setOngletChoisi] = React.useState(null);
  // Fiche d'édition d'une ligne (v2) : identifiant de la ligne ouverte.
  const [ficheLigneId, setFicheLigneId] = React.useState(null);
  const [sansRecents, setSansRecents] = React.useState([]);
  const [libreOuvert, setLibreOuvert] = React.useState(false);
  const [libreNom, setLibreNom] = React.useState('');
  const [librePrix, setLibrePrix] = React.useState('');
  const [paiementOuvert, setPaiementOuvert] = React.useState(false);
  const [envoiEnCours, setEnvoiEnCours] = React.useState(false);
  // Verrous immédiats (une ref, pas un état) : deux taps dans la même image
  // ne lancent ni deux envois ni deux encaissements.
  const verrou = React.useRef({ envoi: false, paiement: false });
  // Habillage des boutons (v3) : mode édition (consultant, patron,
  // resp_cuisine) et fiche du bouton ouvert ; l'appui long ouvre aussi la
  // fiche, hors mode, pour les mêmes rôles.
  const [editionBoutons, setEditionBoutons] = React.useState(false);
  const [boutonPlat, setBoutonPlat] = React.useState(null);
  const appuiLong = React.useRef({ timer: null, declenche: false });

  const racineRef = React.useRef(null);
  const largeur = useLargeur(racineRef);
  const deuxColonnes = largeur >= LARGEUR_DEUX_COLONNES;
  const hauteur = useHauteurRestante(racineRef, deuxColonnes);
  const retraitBas = useRetraitBas(racineRef, !deuxColonnes && largeur > 0);

  function debutAppuiLong(plat) {
    if (!peutHabiller) return;
    appuiLong.current.declenche = false;
    appuiLong.current.timer = setTimeout(() => {
      appuiLong.current.declenche = true;
      setBoutonPlat(plat);
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

  async function ajouterArticle(plat) {
    // Même plat, même mode, sans note ni paramètre, pas encore envoyé : +1
    // (une ligne paramétrée reste la sienne, on n'y empile pas un couvert).
    const existante = lignes.find((l) =>
      l.statut === 'en_attente' && l.plat_id === plat.id && l.suite === modeActif
      && !l.note && !(l.options || []).length);
    if (existante) {
      const { error } = await caisse.majLigne(existante.id, { quantite: Number(existante.quantite) + 1 });
      if (erreur(error)) return;
    } else {
      const { error } = await caisse.ajouterLigne({
        ticketId: ticket.id, platId: plat.id, libelle: plat.nom,
        prixUnitaire: plat.prixVente ?? 0, suite: modeActif,
      });
      if (erreur(error)) return;
    }
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
    const { error } = await caisse.majLigne(ficheLigne.id, partial);
    if (!erreur(error)) reload();
  }

  async function supprimerFicheLigne() {
    if (!ficheLigne) return;
    const { error } = await caisse.supprimerLigne(ficheLigne.id);
    if (erreur(error)) return;
    setFicheLigneId(null);
    reload();
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

  async function payer(moyen) {
    if (verrou.current.paiement) return;
    verrou.current.paiement = true;
    try {
      const { error } = await caisse.encaisser(
        ticket.id, moyen.cle, Math.round(total * 100) / 100,
        reglages.perso?.moyens_paiement ? moyen.libelle : null,
      );
      if (erreur(error)) return;
      notify('Ticket encaissé', 'success');
      onClos();
    } finally {
      verrou.current.paiement = false;
    }
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

  if (!ticket) return null;

  const allergies = allergiesDe(reservation);
  const dense = reglages.grille === 'dense';
  const styleGrille = { ...st.grille, gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 112 : 140}px, 1fr))` };

  function boutonProduit(a, categorie) {
    const hab = boutons[a.id];
    const couleur = hab?.couleur || categorie?.couleur || null;
    const picto = pictoParId(hab?.picto || categorie?.picto || pictoDefaut(a.categorie));
    return (
      <button
        key={a.id}
        type="button"
        data-cadre=""
        data-produit={a.id}
        style={{
          ...st.article,
          ...(dense ? st.articleDense : null),
          ...(couleur ? { background: `var(--caisse-${couleur})` } : null),
        }}
        onClick={() => {
          if (appuiLong.current.declenche) { appuiLong.current.declenche = false; return; }
          if (editionBoutons && peutHabiller) { setBoutonPlat(a); return; }
          ajouterArticle(a);
        }}
        onPointerDown={() => debutAppuiLong(a)}
        onPointerUp={finAppuiLong}
        onPointerLeave={finAppuiLong}
        onPointerCancel={finAppuiLong}
        onContextMenu={(e) => { if (peutHabiller) e.preventDefault(); }}
      >
        <span style={st.articleNomRang}>
          {picto && <picto.Icone size={18} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />}
          <span style={st.articleNom} data-no-translate>{hab?.nom_court || nomCourtDefaut(a.nom)}</span>
        </span>
        <span style={st.articlePrix}>{chf(a.prixVente)}</span>
      </button>
    );
  }

  // ── Barre de modes ──
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

  const ongletsCategories = [
    { id: ID_TOUT, label: 'Tout' },
    ...rangement.onglets.map((c) => {
      const picto = pictoParId(c.picto);
      return {
        id: c.id,
        icon: picto ? <picto.Icone size={16} strokeWidth={1.75} aria-hidden="true" /> : null,
        label: <span data-no-translate>{c.nom}</span>,
      };
    }),
  ];

  // ── L'action principale : une seule, large, en bas du ticket ──
  let actionPrincipale = null;
  if (suiteAEnvoyer === 1) {
    actionPrincipale = (
      <Btn variant="primary" onClick={envoyer} disabled={envoiEnCours} style={st.btnPrincipal}>
        <Send size={20} strokeWidth={1.75} aria-hidden="true" />
        <span>Envoyer</span>
      </Btn>
    );
  } else if (suiteAEnvoyer != null) {
    actionPrincipale = (
      <Btn variant="primary" onClick={envoyer} disabled={envoiEnCours} style={st.btnPrincipal}>
        <Send size={20} strokeWidth={1.75} aria-hidden="true" />
        <span style={st.principalTexte}>
          <span>Réclamer la suite</span>
          <span style={st.principalDetail} data-no-translate>{libelleMode(reglages, suiteAEnvoyer)}</span>
        </span>
      </Btn>
    );
  } else if (lignes.length > 0 && !paiementOuvert) {
    actionPrincipale = (
      <Btn variant="primary" onClick={() => setPaiementOuvert(true)} style={st.btnPrincipal}>
        <span>Encaisser</span>
      </Btn>
    );
  }

  // Le total et l'action : dans le pied du ticket quand l'écran est cadré,
  // dans une barre collée en bas quand il s'empile.
  const blocTotalAction = (
    <>
      <div style={st.totalLigne}>
        <span style={st.totalLibelle}>Total</span>
        <span style={st.totalValeur}><span>{chf(total)}</span> <span style={st.devise}>CHF</span></span>
      </div>
      {paiementOuvert ? (
        <div style={st.paiement}>
          {enAttente.length > 0 && (
            <p style={st.avertissement}>
              <span>{enAttente.length}</span> <span>lignes pas encore envoyées en cuisine.</span>
            </p>
          )}
          <div style={st.moyens}>
            {reglages.moyens_paiement.map((m, i) => (
              <Btn key={m.cle + i} variant={m.cle === 'autre' && !reglages.perso?.moyens_paiement ? 'ghost' : 'primary'} onClick={() => payer(m)} style={st.btnMoyen}>
                {reglages.perso?.moyens_paiement ? <span data-no-translate>{m.libelle}</span> : m.libelle}
              </Btn>
            ))}
          </div>
          <Btn variant="ghost" onClick={() => setPaiementOuvert(false)} style={st.btn44}>Revenir au ticket</Btn>
        </div>
      ) : actionPrincipale}
    </>
  );

  const cadree = Boolean(deuxColonnes && hauteur);
  const cadre = cadree ? { ...st.cadre, height: hauteur } : st.empile;
  const colonne = cadree ? st.colonneCadree : null;
  const defilant = cadree ? st.defilant : null;

  return (
    <div ref={racineRef} style={cadre} data-caisse-ecran={deuxColonnes ? 'cadre' : 'empile'}>
      {/* ── La saisie : mode, catégories, produits ── */}
      <section style={{ ...st.colArticles, ...colonne }}>
        {ongletsModes.length > 1 && (
          <SegmentedTabs className="caisse-modes" tabs={ongletsModes} active={modeActif} onChange={choisirMode} />
        )}
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un article"
          style={{ minHeight: 44, flexShrink: 0 }}
        />
        {!enRecherche && cartes.length > 1 && (
          <div style={st.cartes} data-caisse-cartes="">
            <button
              type="button"
              style={st.carteBouton}
              aria-expanded={cartesOuvert}
              onClick={() => setCartesOuvert((v) => !v)}
            >
              <span style={st.carteLibelle}>Carte :</span>
              {carte ? <span data-no-translate>{carte.nom}</span> : <span>Toutes les cartes</span>}
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
            </button>
            {cartesOuvert && (
              <div style={st.carteListe}>
                <Btn variant={carte ? 'ghost' : 'primary'} onClick={() => { setCarteChoisie(null); setCartesOuvert(false); }} style={st.btn44}>Toutes les cartes</Btn>
                {cartes.map((c) => (
                  <Btn key={c.id} variant={carte?.id === c.id ? 'primary' : 'ghost'} onClick={() => { setCarteChoisie(c.id); setCartesOuvert(false); }} style={st.btn44}>
                    <span data-no-translate>{c.nom}</span>
                  </Btn>
                ))}
              </div>
            )}
          </div>
        )}
        {!enRecherche && rangement.onglets.length > 1 && (
          <SegmentedTabs className="caisse-onglets" tabs={ongletsCategories} active={onglet} onChange={setOngletChoisi} />
        )}

        <div style={{ ...st.zoneGrille, ...defilant }} data-caisse-grille="">
          {enRecherche ? (
            <div style={styleGrille}>{trouves.map(({ a, c }) => boutonProduit(a, c))}</div>
          ) : sections.map((c) => {
            const sous = sousGroupesAutres(c);
            return (
              <div key={c.id}>
                {onglet === ID_TOUT && <div style={st.categorie} data-no-translate>{c.nom}</div>}
                {sous ? sous.map((g) => (
                  <div key={g.titre}>
                    <div style={st.sousCategorie} data-no-translate>{g.titre}</div>
                    <div style={styleGrille}>{g.articles.map((a) => boutonProduit(a, c))}</div>
                  </div>
                )) : (
                  <div style={styleGrille}>{c.articles.map((a) => boutonProduit(a, c))}</div>
                )}
              </div>
            );
          })}
          {(enRecherche ? !trouves.length : !rangement.onglets.length) && (
            <p style={st.vide}>
              {enRecherche ? 'Aucun article ne correspond.' : 'Aucun article sur les cartes en vente.'}
            </p>
          )}
        </div>

        {libreOuvert ? (
          <div style={st.libreForm}>
            <Input value={libreNom} onChange={(e) => setLibreNom(e.target.value)} placeholder="Libellé" style={{ flex: 2, minWidth: 140, minHeight: 44 }} />
            <Input value={librePrix} onChange={(e) => setLibrePrix(e.target.value)} placeholder="Prix" type="text" inputMode="decimal" style={{ flex: 1, minWidth: 80, minHeight: 44 }} />
            <Btn variant="primary" onClick={ajouterLibre} style={st.btn44}>Ajouter</Btn>
            <Btn variant="ghost" onClick={() => setLibreOuvert(false)} style={st.btn44}>Fermer</Btn>
          </div>
        ) : (
          <div style={st.piedSaisie}>
            <Btn variant="ghost" onClick={() => setLibreOuvert(true)} style={{ ...st.btn44, flex: '1 1 auto' }}>Article libre</Btn>
            {peutHabiller && (
              <Btn variant={editionBoutons ? 'primary' : 'ghost'} onClick={() => setEditionBoutons((v) => !v)} style={st.btn44}>
                Modifier les boutons
              </Btn>
            )}
            {peutHabiller && onOuvrirReglages && (
              <Btn variant="ghost" onClick={onOuvrirReglages} style={st.btn44}>Réglages de la caisse</Btn>
            )}
          </div>
        )}
        {editionBoutons && peutHabiller && (
          <p style={{ ...st.vide, margin: 0 }}>Touchez un produit pour changer son nom court, sa couleur ou son picto.</p>
        )}
        {boutonPlat && (
          <BoutonFiche
            plat={boutonPlat}
            bouton={boutons[boutonPlat.id]}
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
      </section>

      {/* ── La lecture de la table : le ticket en blocs par mode ── */}
      <section style={{ ...st.colTicket, ...colonne }} data-cadre="" data-caisse-ticket="">
        {/* ── Ticket de test (v6) : ni client ni réservation, rien à corriger. ── */}
        {modeTest && (
          <div style={st.bandeau} data-caisse-client="test">
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
        {/* ── Qui est à la table (v5). Vente directe : anonyme, pas de bandeau. ── */}
        {!modeTest && ticket.table_id && (
          <div style={st.bandeau} data-caisse-client={ticket.qui || 'inconnu'}>
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
        <div style={{ ...st.zoneLignes, ...defilant }}>
          {lignes.length === 0 && <p style={st.vide}>Touchez un article pour l'ajouter.</p>}
          {Array.from({ length: SUITE_MAX }, (_, i) => i + 1).filter((s) => lignes.some((l) => l.suite === s)).map((s) => {
            const duBloc = lignes.filter((l) => l.suite === s);
            const attente = duBloc.filter((l) => l.statut === 'en_attente');
            const enCours = attente.length > 0;
            // Un mode tenu dont toutes les lignes en attente sont déjà en
            // cuisine (tenues) est « annoncé » ; il reste à le réclamer.
            const annonce = enCours && attente.every((l) => l.annonce_at);
            return (
              <div key={s} style={st.bloc} data-mode={s} data-mode-etat={annonce ? 'annonce' : (enCours ? 'en_attente' : 'envoye')}>
                <div style={st.blocTitre}>
                  <span style={{ ...st.blocNom, ...(s === modeActif ? st.blocNomActif : null) }} data-no-translate>{libelleMode(reglages, s)}</span>
                  <span style={st.blocEtat}>{annonce ? 'annoncé' : (enCours ? 'en attente' : 'envoyé')}</span>
                </div>
                {duBloc.map((l) => {
                  const params = [...(l.options || []).map(libelleOption), l.note].filter(Boolean).join(', ');
                  const contenu = (
                    <span style={st.ligneRang}>
                      <span style={st.ligneQte}>{Number(l.quantite)}</span>
                      <span style={st.ligneCorps}>
                        <span style={st.ligneNom} data-no-translate>{l.libelle}</span>
                        {params && <span style={st.ligneNote} data-no-translate>{params}</span>}
                        {l.statut === 'en_attente' && !l.annonce_at && (
                          <span style={st.etat}><Hourglass size={13} strokeWidth={1.75} aria-hidden="true" /><span>En attente</span></span>
                        )}
                        {l.statut === 'en_attente' && l.annonce_at && (
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
                      <span style={st.lignePrix}>{chf(Number(l.quantite) * Number(l.prix_unitaire))}</span>
                    </span>
                  );
                  // Ligne en attente : tout le rang est la cible, un tap ouvre sa
                  // fiche (quantité, mode, paramètres, suppression).
                  if (l.statut === 'en_attente') {
                    return (
                      <button key={l.id} type="button" style={st.ligneBouton} data-ligne={l.statut} onClick={() => setFicheLigneId(l.id)}>
                        {contenu}
                      </button>
                    );
                  }
                  // Ligne partie en cuisine : figée ; un tap bascule servi / envoyé.
                  return (
                    <button
                      key={l.id}
                      type="button"
                      style={st.ligneBouton}
                      data-ligne={l.statut}
                      title={l.statut === 'servi' ? 'Toucher pour remettre en envoyé' : 'Toucher pour marquer servi'}
                      onClick={() => basculerServi(l)}
                    >
                      {contenu}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={st.pied} data-caisse-pied="">
          {cadree && blocTotalAction}

          <div style={st.gestion}>
            {suiteAEnvoyer != null && suiteAEnvoyer < SUITE_MAX && (
              <Btn variant="ghost" onClick={passerASuivre} style={st.btn44}>Passer à suivre</Btn>
            )}
            {suiteAEnvoyer != null && lignes.length > 0 && !paiementOuvert && (
              <Btn variant="ghost" onClick={() => setPaiementOuvert(true)} style={st.btn44}>Encaisser</Btn>
            )}
            <Btn variant="ghost" onClick={onDeplacer} style={st.btn44}>Déplacer</Btn>
            {ticketsMemeTable.length > 0 && (
              <Btn variant="ghost" onClick={fusionner} style={st.btn44}>Fusionner</Btn>
            )}
            <Btn variant="danger" onClick={annuler} style={st.btn44}>Annuler le ticket</Btn>
          </div>
        </div>

        {ficheLigne && (
          <FicheLigne
            ligne={ficheLigne}
            sansRecents={sansRecents}
            reglages={reglages}
            suites={suitesVisibles(reglages, lignes, Math.max(modesOuverts, reglages.modes.max))}
            onChange={majFicheLigne}
            onSupprimer={supprimerFicheLigne}
            onClose={() => setFicheLigneId(null)}
          />
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
      </section>

      {/* Écran étroit : la page défile, le total et l'action restent collés en
          bas de l'écran pendant qu'on parcourt la grille. */}
      {!cadree && (
        <div style={{ ...st.barreBas, bottom: -retraitBas }} data-caisse-barre="">{blocTotalAction}</div>
      )}
    </div>
  );
}

const st = {
  // Écran large : deux colonnes cadrées à la hauteur qui reste, chacune défile
  // chez soi. Écran étroit : les deux blocs s'empilent et la page défile.
  cadre: { display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(300px, 2fr)', gap: 16, minWidth: 0, marginTop: 10 },
  empile: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, marginTop: 10 },
  colonneCadree: { minHeight: 0, height: '100%', overflow: 'hidden' },
  defilant: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' },
  colArticles: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  colTicket: {
    minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface)',
    borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-sm)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  // Sélecteur de carte : une ligne discrète, qui se déplie sur place.
  cartes: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, minWidth: 0 },
  carteBouton: {
    display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, maxWidth: '100%',
    padding: '0 4px', background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 500, textAlign: 'left',
  },
  carteLibelle: { color: 'var(--text2)', fontWeight: 400 },
  carteListe: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  // Bandeau du client en tête du ticket : ne défile pas.
  bandeau: {
    display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, padding: '10px 12px 10px 16px', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  bandeauCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  bandeauNom: { fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2, overflowWrap: 'anywhere' },
  bandeauDetail: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 13, color: 'var(--text2)' },
  bandeauAllergies: { fontSize: 13, fontWeight: 600, color: 'var(--warning-text)', lineHeight: 1.3, overflowWrap: 'anywhere' },
  zoneGrille: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, paddingBottom: 4 },
  zoneLignes: { padding: '6px 16px 0', minWidth: 0 },
  modeCompte: {
    fontFamily: 'var(--font-num)', fontSize: 13, fontWeight: 600, minWidth: 22, height: 22, padding: '0 6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
    borderRadius: 'var(--r-full)', background: 'var(--surface)', color: 'var(--text)', marginLeft: 8,
  },
  horsEcran: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  categorie: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '10px 0 6px' },
  sousCategorie: { fontSize: 12, color: 'var(--text2)', margin: '8px 0 4px' },
  grille: { display: 'grid', gap: 8 },
  article: {
    minHeight: 68, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
    gap: 4, padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)',
    border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, textAlign: 'left', minWidth: 0,
  },
  articleDense: { minHeight: 56, padding: '8px 10px', fontSize: 13 },
  articleNomRang: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' },
  articleNom: { fontWeight: 500, lineHeight: 1.2, overflowWrap: 'anywhere' },
  articlePrix: { fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-num)' },
  piedSaisie: { display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 },
  libreForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 },
  vide: { color: 'var(--text2)', fontSize: 14 },
  // Un bloc par mode : son nom en clair, puis ses lignes.
  bloc: { paddingBottom: 6 },
  blocTitre: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '12px 0 2px' },
  blocNom: { fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  blocNomActif: { color: 'var(--accent)' },
  blocEtat: { fontSize: 12, color: 'var(--text2)' },
  // Rang tappable d'une ligne : filet bas, cible de 44 px au moins.
  ligneBouton: {
    display: 'block', width: '100%', minHeight: 48, padding: '9px 0', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 15,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  ligneRang: { display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 },
  ligneQte: { fontFamily: 'var(--font-num)', fontWeight: 600, fontSize: 22, lineHeight: 1.05, minWidth: 28, flexShrink: 0, textAlign: 'right' },
  ligneCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  ligneNom: { fontWeight: 500, lineHeight: 1.25, overflowWrap: 'anywhere' },
  ligneNote: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.3 },
  etat: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)' },
  etatServi: { color: 'var(--success-text)', fontWeight: 600 },
  // Pastille « Prêt » : un picto et le mot, sur fond doux (lisible sans la
  // couleur seule).
  pret: {
    display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', padding: '2px 9px',
    borderRadius: 'var(--r-full)', background: 'var(--success-bg-soft)', color: 'var(--success-text)',
    fontSize: 13, fontWeight: 700,
  },
  num: { fontFamily: 'var(--font-num)' },
  lignePrix: { fontFamily: 'var(--font-num)', flexShrink: 0, paddingTop: 2 },
  btn44: { minHeight: 44, flexShrink: 0 },
  // Le pied du ticket ne défile pas : total et action toujours à l'écran.
  pied: {
    display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, padding: '12px 16px 14px',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
  },
  barreBas: {
    position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 8,
    padding: '10px 14px 12px', background: 'var(--surface)', borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
    boxShadow: 'var(--sh-lg)',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
  },
  totalLigne: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLibelle: { fontSize: 14, color: 'var(--text2)' },
  totalValeur: { fontSize: 28, fontWeight: 600, fontFamily: 'var(--font-num)', lineHeight: 1.1 },
  devise: { fontSize: 14, fontWeight: 500, color: 'var(--text2)' },
  btnPrincipal: { minHeight: 60, fontSize: 18, width: '100%', gap: 10, whiteSpace: 'normal' },
  principalTexte: { display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 },
  principalDetail: { fontSize: 13, fontWeight: 500 },
  paiement: { display: 'flex', flexDirection: 'column', gap: 8 },
  moyens: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnMoyen: { minHeight: 56, fontSize: 16, flex: '1 1 120px' },
  avertissement: { fontSize: 13, color: 'var(--text2)', margin: 0 },
  gestion: { display: 'flex', gap: 6, flexWrap: 'wrap' },
};
