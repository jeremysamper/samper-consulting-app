import React from 'react';
import { History, Package, Shirt } from 'lucide-react';
import { BoutonActions, Choix, Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { Btn } from '../../components/ui/index.jsx';
import { LigneRegler } from '../../components/ui/BoutonRegler.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { lingeDepart, tempsMenage } from '../../utils/reglagesModules.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { dureeLisible, etapeSuivante, natureMenage, ordreTournee } from './tournee.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import {
  STATUTS_MENAGE, STATUTS_OBJET, TYPES_LINGE, dateCourte, dateHeureZurich, equipeDe, libelleDe, nomPersonne,
  sejourDeLaChambre, tonDe, totauxLinge, trierChambres, useChambres, useJournalChambres, useLinge, useMinibar,
  useObjetsTrouves, useSejours, useTurndown,
} from '../hebergement/hotelData.js';
import { Champ, Liste, Vide, h } from '../hebergement/hotelUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Étages (branche Hôtel, lots H0 et H1) : les chambres par étage avec leur
// statut de ménage, qui s'en occupe et ce qui s'y passe aujourd'hui. Les
// chambres qui attendent une arrivée sont en tête. Changer le statut est un
// geste : un bouton par statut sur la carte de la chambre. iPad et téléphone
// d'abord : des cartes, jamais un tableau large ; boutons de 44 px.
//
// Lot H1 : « Ma tournée » (les chambres qui me sont attribuées, à faire
// d'abord), inspection réservée au droit « Inspecter les chambres », minibar
// et linge relevés depuis la carte, couverture du soir (turndown), objets
// trouvés. Toutes ces écritures demandent la case « Modifier » d'Étages, que
// la base vérifie de même (RLS, migration 20261028_hotel_h1).
// ─────────────────────────────────────────────────────────────────────────────

const ONGLETS = [
  { id: 'chambres', label: 'Les chambres' },
  { id: 'tournee', label: 'Ma tournée' },
  { id: 'objets', label: 'Objets trouvés' },
  { id: 'linge', label: 'Linge du jour' },
];
const ORDRE_MENAGE = { a_faire: 0, en_cours: 1, hors_service: 2, propre: 3, inspectee: 4 };

export default function Etages({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutGerer = canManageModule(role, 'etages') || canManageModule(role, 'hebergement');
  const peutInspecter = peutGerer && canManageModule(role, 'inspection');
  const [aujourdhui, setAujourdhui] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setAujourdhui(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);

  const chambres = useChambres(etabId);
  const sejours = useSejours(etabId);
  const journal = useJournalChambres(etabId);
  const minibar = useMinibar(etabId);
  const objets = useObjetsTrouves(etabId);
  const linge = useLinge(etabId);
  const turndown = useTurndown(etabId);
  const equipe = React.useMemo(() => equipeDe(etabId), [etabId]);

  const [onglet, setOnglet] = React.useState('chambres');
  const [motifPour, setMotifPour] = React.useState(null);
  const [historiquePour, setHistoriquePour] = React.useState(null);
  const [minibarPour, setMinibarPour] = React.useState(null);
  const [lingePour, setLingePour] = React.useState(null);
  const [attribuerPour, setAttribuerPour] = React.useState(null);
  const [objetForm, setObjetForm] = React.useState(null); // { objet: null | objet }
  const [enCours, setEnCours] = React.useState('');
  // Lot 6b : temps de ménage et linge par type de chambre (Réglages, Étages).
  const { reglages: reglagesEtages } = useReglagesModule(etabId, 'etages');

  const actives = trierChambres(chambres.rows.filter((c) => c.actif));
  const sejourDe = (c) => sejourDeLaChambre(sejours.rows, c.id, aujourdhui);
  const arriveAujourdhui = (c) => sejours.rows.some((s) => s.chambreId === c.id && s.statut === 'prevu' && s.arrivee === aujourdhui);
  const enTete = actives.filter(arriveAujourdhui);
  // Une chambre d'arrivée est dite une fois, en tête : elle ne revient pas dans son étage.
  const parEtage = actives.filter((c) => !arriveAujourdhui(c));
  const etages = [...new Set(parEtage.map((c) => c.etage || ''))];
  const turndownDe = (c) => turndown.rows.find((t) => t.chambreId === c.id && t.jour === aujourdhui) || null;
  const natureDe = (c) => natureMenage(c, sejours.rows, aujourdhui);
  const minutesDe = (c) => tempsMenage(reglagesEtages, c.categorie, natureDe(c) === 'recouche' ? 'recouche' : 'depart');
  const totalMinutes = (liste) => liste.filter((c) => c.statutMenage === 'a_faire' || c.statutMenage === 'en_cours').reduce((n, c) => n + minutesDe(c), 0);
  // Ma tournée : mes chambres, les arrivées du jour puis les « à faire » d'abord.
  const maTournee = actives.filter((c) => c.attribueeA === user?.id)
    .sort((a, b) => (Number(arriveAujourdhui(b)) - Number(arriveAujourdhui(a))) || (ORDRE_MENAGE[a.statutMenage] - ORDRE_MENAGE[b.statutMenage]));
  // Lot 6b : la tournée du jour, préparée depuis les arrivées, les départs et
  // les recouches : les chambres à faire que personne n'a encore prises.
  const tourneeDuJour = ordreTournee(actives.filter((c) => !c.attribueeA), sejours.rows, aujourdhui);
  const prendreTournee = async () => {
    setEnCours('tournee');
    let erreur = null;
    for (const c of tourneeDuJour) {
      // Une chambre à la fois : la base vérifie chaque écriture (RLS).
      const res = await chambres.modifier(c.id, { attribuee_a: user?.id || null });
      if (res.error) { erreur = res.error; break; }
    }
    setEnCours('');
    if (erreur) notify(erreur, 'error');
    else notify(tourneeDuJour.length > 1 ? `${tourneeDuJour.length} chambres prises.` : 'Chambre prise.', 'success');
  };

  const changer = async (c, valeurs, message) => {
    setEnCours(c.id);
    const res = await chambres.modifier(c.id, valeurs);
    setEnCours('');
    if (res.error) notify(res.error, 'error');
    else {
      if (message) notify(message, 'success');
      // Le journal est écrit par déclencheur : on le relit sans attendre le
      // realtime, pour que l'historique montre tout de suite le changement.
      journal.reload();
    }
    return res;
  };
  const changerStatut = (c, statut) => {
    if (statut === c.statutMenage) return;
    if (statut === 'hors_service') { setMotifPour(c); return; }
    changer(c, { statut_menage: statut, hors_service_motif: null }, `Chambre ${c.numero} : ${libelleDe(STATUTS_MENAGE, statut).toLowerCase()}.`);
  };
  const attribuer = (c, userId) => changer(c, { attribuee_a: userId || null }, userId ? `Chambre ${c.numero} attribuée.` : `Chambre ${c.numero} : attribution retirée.`);
  const basculerTurndown = async (c) => {
    const fait = turndownDe(c);
    setEnCours(c.id);
    const res = fait
      ? await turndown.supprimer(fait.id)
      : await turndown.inserer({ chambre_id: c.id, jour: aujourdhui, fait_par: user?.id || null });
    setEnCours('');
    if (res.error) notify(res.error, 'error');
    else notify(fait ? `Chambre ${c.numero} : couverture annulée.` : `Chambre ${c.numero} : couverture faite.`, 'success');
  };

  const nbParStatut = STATUTS_MENAGE.map((s) => ({ ...s, n: actives.filter((c) => c.statutMenage === s.id).length }));
  const props = (c) => ({
    chambre: c, sejour: sejourDe(c), aujourdhui, peutGerer, peutInspecter, enCours: enCours === c.id || enCours === 'tournee', turndownFait: !!turndownDe(c),
    onStatut: changerStatut, onAttribuer: setAttribuerPour, onHistorique: setHistoriquePour, onMinibar: setMinibarPour, onLinge: setLingePour, onTurndown: basculerTurndown,
    arrivee: arriveAujourdhui(c), minutes: minutesDe(c), nature: natureDe(c),
  });

  const etatLecture = chambres.status === 'absent' ? 'Le socle hôtel n\'est pas encore activé sur la base de données.'
    : chambres.status === 'error' ? 'Les chambres n\'ont pas pu être lues. Nouvel essai en cours…' : null;

  return (
    <section className="etages" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      {!etabId && <Vide>Aucun établissement sélectionné.</Vide>}
      {etabId && (
        <>
          <div className="module-actions">
            <SegmentedTabs tabs={ONGLETS} active={onglet} onChange={setOnglet} />
            <LigneRegler section="etages" user={user} etablissement={etablissement} className="" style={{ marginLeft: 'auto' }} />
          </div>
          {etatLecture && <Vide>{etatLecture}</Vide>}
        </>
      )}

      {etabId && (onglet === 'chambres' || onglet === 'tournee') && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Chambres par statut">
          {nbParStatut.map((s) => (
            <Puce key={s.id} ton={s.ton} style={{ fontSize: 13, padding: '4px 10px' }}>
              <span>{s.n}</span><span aria-hidden="true"> </span><span>{s.label}</span>
            </Puce>
          ))}
        </div>
      )}

      {etabId && onglet === 'chambres' && (
        <>
          {chambres.status === 'ready' && !actives.length && <Vide>Aucune chambre active. Les chambres se créent dans Hébergement.</Vide>}
          {enTete.length > 0 && (
            <Groupe titre={<span>Arrivées du jour</span>}>
              {enTete.map((c) => <CarteChambre key={c.id} {...props(c)} />)}
            </Groupe>
          )}
          {etages.map((etage) => (
            <Groupe key={etage || 'sans'} titre={!etage ? <span>Sans étage</span> : /\p{L}/u.test(etage) ? <span data-no-translate>{etage}</span> : <><span>Étage</span> <span data-no-translate>{etage}</span></>}>
              {parEtage.filter((c) => (c.etage || '') === etage).map((c) => <CarteChambre key={c.id} {...props(c)} />)}
            </Groupe>
          ))}
        </>
      )}

      {etabId && onglet === 'tournee' && maTournee.length > 0 && (
        <Groupe titre={<>
          <span>{maTournee.length}</span> <span>{maTournee.length > 1 ? 'chambres attribuées' : 'chambre attribuée'}</span>
          {totalMinutes(maTournee) > 0 && <>, <span>environ</span> <span data-no-translate>{dureeLisible(totalMinutes(maTournee))}</span> <span>de ménage</span></>}
        </>}>
          {maTournee.map((c) => <CarteChambre key={c.id} {...props(c)} />)}
        </Groupe>
      )}
      {etabId && onglet === 'tournee' && !maTournee.length && peutGerer && tourneeDuJour.length > 0 && (
        <>
          <div style={e.tournee} data-cadre="">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 240px' }}>
              <span style={e.tourneeTitre}>La tournée du jour</span>
              <span style={h.detail}>
                <span>{tourneeDuJour.length}</span> <span>{tourneeDuJour.length > 1 ? 'chambres à faire' : 'chambre à faire'}</span>, <span>environ</span> <span data-no-translate>{dureeLisible(totalMinutes(tourneeDuJour))}</span>.
                {' '}<span>Les arrivées d'abord, puis les départs, puis les recouches.</span>
              </span>
            </div>
            <Btn variant="primary" onClick={prendreTournee} disabled={!!enCours} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
              {tourneeDuJour.length > 1
                ? <><span>Prendre ces</span><span data-no-translate>{tourneeDuJour.length}</span><span>chambres</span></>
                : <span>Prendre cette chambre</span>}
            </Btn>
          </div>
          <div style={e.grille}>{tourneeDuJour.map((c) => <CarteChambre key={c.id} {...props(c)} />)}</div>
        </>
      )}
      {etabId && onglet === 'tournee' && !maTournee.length && (!peutGerer || !tourneeDuJour.length) && (
        <Vide>{peutGerer ? 'Toutes les chambres sont faites ou déjà prises.' : 'Aucune chambre ne vous est attribuée aujourd\'hui.'}</Vide>
      )}

      {etabId && onglet === 'objets' && (
        <ObjetsTrouves
          objets={objets} chambres={actives} sejours={sejours.rows} peutGerer={peutGerer} aujourdhui={aujourdhui}
          onDeclarer={() => setObjetForm({ objet: null })} onOuvrir={(o) => setObjetForm({ objet: o })}
        />
      )}

      {etabId && onglet === 'linge' && (
        <LingeDuJour linge={linge} chambres={actives} aujourdhui={aujourdhui} peutGerer={peutGerer} onAjouter={() => setLingePour({ sansChambre: true })} />
      )}

      {motifPour && (
        <MotifHorsService
          chambre={motifPour}
          onClose={() => setMotifPour(null)}
          onValider={async (motif) => {
            const res = await changer(motifPour, { statut_menage: 'hors_service', hors_service_motif: motif || null }, `Chambre ${motifPour.numero} hors service.`);
            if (!res.error) setMotifPour(null);
          }}
        />
      )}
      {historiquePour && <Historique chambre={historiquePour} journal={journal} onClose={() => setHistoriquePour(null)} />}
      {minibarPour && (
        <MinibarChambre
          chambre={minibarPour} sejour={sejourDe(minibarPour)} minibar={minibar} peutGerer={peutGerer} user={user}
          onClose={() => setMinibarPour(null)}
        />
      )}
      {lingePour && (
        <LingeForm
          chambre={lingePour.sansChambre ? null : lingePour} chambres={actives} linge={linge} user={user} aujourdhui={aujourdhui}
          jeu={lingePour.sansChambre || natureDe(lingePour) === 'recouche' ? {} : lingeDepart(reglagesEtages, lingePour.categorie)}
          onClose={() => setLingePour(null)}
        />
      )}
      {attribuerPour && (
        <AttribuerChambre
          chambre={attribuerPour} equipe={equipe}
          onClose={() => setAttribuerPour(null)}
          onChoisir={async (userId) => { const res = await attribuer(attribuerPour, userId); if (!res.error) setAttribuerPour(null); }}
        />
      )}
      {objetForm && (
        <ObjetForm
          objet={objetForm.objet} chambres={actives} sejours={sejours.rows} objets={objets} peutGerer={peutGerer} user={user} aujourdhui={aujourdhui}
          onClose={() => setObjetForm(null)}
        />
      )}
    </section>
  );
}

function Groupe({ titre, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={h.sousTitre}>{titre}</div>
      <div style={e.grille}>{children}</div>
    </div>
  );
}

function CarteChambre({ chambre: c, sejour: s, aujourdhui, peutGerer, peutInspecter, enCours, turndownFait, onStatut, onAttribuer, onHistorique, onMinibar, onLinge, onTurndown, arrivee, minutes, nature }) {
  const occupant = s ? (
    <span style={h.detail}>
      {s.statut === 'en_maison'
        ? <>{s.depart === aujourdhui ? <span>Part aujourd'hui</span> : <><span>En maison jusqu'au</span> <span>{dateCourte(s.depart)}</span></>}</>
        : <span>Arrive aujourd'hui</span>}
      <span aria-hidden="true"> </span>
      <span data-no-translate>{s.nomHote}</span>
    </span>
  ) : <span style={h.detail}>Libre</span>;
  // Lot 6b : une seule action visible, l'étape suivante du ménage ; le reste
  // (autre statut, attribution, minibar, linge, couverture, historique) passe
  // dans « Gérer ». Avant : cinq statuts, une liste et quatre boutons par carte.
  const etape = peutGerer ? etapeSuivante(c.statutMenage, peutInspecter) : null;
  const aFaire = c.statutMenage === 'a_faire' || c.statutMenage === 'en_cours';
  const autresStatuts = STATUTS_MENAGE.filter((x) => x.id !== c.statutMenage && x.id !== etape?.statut && (x.id !== 'inspectee' || peutInspecter));

  return (
    <div style={{ ...h.carte, ...(arrivee ? e.carteArrivee : null) }} data-cadre="" data-chambre={c.numero} data-statut={c.statutMenage}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={e.numero} data-no-translate>{c.numero}</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {turndownFait && <Puce ton="info">Couverture faite</Puce>}
          <Puce ton={tonDe(STATUTS_MENAGE, c.statutMenage)}>{libelleDe(STATUTS_MENAGE, c.statutMenage)}</Puce>
        </span>
      </div>
      {(c.categorie || aFaire) && (
        <span style={h.detail}>
          {c.categorie && <span data-no-translate>{c.categorie}</span>}
          {c.categorie && aFaire && <span>, </span>}
          {aFaire && <><span>{nature === 'recouche' ? 'recouche' : 'ménage complet'}</span> <span data-no-translate>{dureeLisible(minutes)}</span></>}
        </span>
      )}
      {occupant}
      {c.statutMenage === 'hors_service' && c.horsServiceMotif && (
        <span style={h.detail}><span>Motif :</span> <span data-no-translate>{c.horsServiceMotif}</span></span>
      )}
      <span style={h.detail}>
        {c.attribueeA ? <><span>Attribuée à</span> <span data-no-translate>{nomPersonne(c.attribueeA)}</span></> : <span>Pas attribuée</span>}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
        {etape && (
          <button type="button" className="ui-btn" style={e.etape} disabled={enCours} onClick={() => onStatut(c, etape.statut)}>
            {etape.label}
          </button>
        )}
        {peutGerer ? (
          <BoutonActions
            id={`chambre-gerer-${c.id}`}
            label="Gérer"
            style={e.gerer}
            disabled={enCours}
            titre={<><span>Chambre</span> <span data-no-translate>{c.numero}</span></>}
            sections={[
              { titre: 'Statut', items: autresStatuts.map((x) => ({ titre: x.label, onClick: () => onStatut(c, x.id) })) },
              { titre: 'La chambre', items: [
                { titre: c.attribueeA ? 'Changer la personne' : 'Attribuer la chambre', onClick: () => onAttribuer(c) },
                { titre: 'Linge', onClick: () => onLinge(c) },
                { titre: 'Minibar', onClick: () => onMinibar(c) },
                { titre: turndownFait ? 'Annuler la couverture du soir' : 'Couverture du soir faite', onClick: () => onTurndown(c) },
                { titre: 'Historique', onClick: () => onHistorique(c) },
              ] },
            ]}
          />
        ) : (
          <Btn onClick={() => onHistorique(c)}>
            <History size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Historique</span>
          </Btn>
        )}
      </div>
    </div>
  );
}

// Lot 6b : attribuer une chambre, en un toucher sur la personne.
function AttribuerChambre({ chambre, equipe, onChoisir, onClose }) {
  return (
    <Fenetre id="chambre-attribuer" titre={<><span>Attribuer la chambre</span> <span data-no-translate>{chambre.numero}</span></>} onClose={onClose} largeur={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {equipe.map((p) => (
          <Choix key={p.id} titre={<span data-no-translate>{p.nom}</span>} actif={chambre.attribueeA === p.id} onClick={() => onChoisir(p.id)} />
        ))}
        {chambre.attribueeA && <Choix titre="Personne" detail="La chambre n'est plus attribuée." onClick={() => onChoisir(null)} />}
      </div>
    </Fenetre>
  );
}

function MotifHorsService({ chambre, onClose, onValider }) {
  const [motif, setMotif] = React.useState(chambre.horsServiceMotif || '');
  return (
    <Fenetre
      id="chambre-hors-service"
      titre={<><span>Chambre</span> <span data-no-translate>{chambre.numero}</span> <span>hors service</span></>}
      sousTitre="Le motif est visible par toute l'équipe."
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={() => onValider(motif.trim())}>Mettre hors service</button>
        </>
      )}
    >
      <Champ label="Motif">
        <input style={h.saisie} value={motif} onChange={(ev) => setMotif(ev.target.value)} placeholder="Fuite, travaux, chauffage…" autoFocus />
      </Champ>
    </Fenetre>
  );
}

function Historique({ chambre, journal, onClose }) {
  const lignes = journal.rows.filter((l) => l.chambreId === chambre.id);
  return (
    <Fenetre id="chambre-historique" titre={<><span>Historique de la chambre</span> <span data-no-translate>{chambre.numero}</span></>} onClose={onClose} largeur={520}>
      {journal.status === 'loading' && <Vide>Chargement…</Vide>}
      {journal.status !== 'loading' && !lignes.length && <Vide>Aucun changement de statut pour l'instant.</Vide>}
      {lignes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lignes.map((l) => (
            <div key={l.id} style={e.ligneJournal}>
              <span style={{ ...h.detail, fontVariantNumeric: 'tabular-nums' }} data-no-translate>{dateHeureZurich(l.at)}</span>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>
                {l.ancien ? <><span>{libelleDe(STATUTS_MENAGE, l.ancien)}</span> <span>vers</span> <span>{libelleDe(STATUTS_MENAGE, l.nouveau)}</span></> : <><span>Créée</span> <span>{libelleDe(STATUTS_MENAGE, l.nouveau).toLowerCase()}</span></>}
              </span>
              <span style={h.detail}>{l.par ? <span data-no-translate>{nomPersonne(l.par)}</span> : <span>Système</span>}</span>
            </div>
          ))}
        </div>
      )}
    </Fenetre>
  );
}

// Minibar d'une chambre : les consommations du séjour en maison, et un ajout
// en deux champs. Sans prix (lot H4).
function MinibarChambre({ chambre, sejour, minibar, peutGerer, user, onClose }) {
  const [article, setArticle] = React.useState('');
  const [quantite, setQuantite] = React.useState(1);
  const [erreur, setErreur] = React.useState('');
  const lignes = minibar.rows.filter((m) => m.chambreId === chambre.id && (!sejour || m.sejourId === sejour.id || !m.sejourId)).slice(0, 50);
  const ajouter = async () => {
    setErreur('');
    if (!article.trim()) { setErreur('Indique l\'article.'); return; }
    const res = await minibar.inserer({ chambre_id: chambre.id, sejour_id: sejour?.id || null, article: article.trim(), quantite: Math.max(1, quantite), par: user?.id || null });
    if (res.error) { setErreur(res.error); return; }
    setArticle('');
    setQuantite(1);
    notify('Consommation notée.', 'success');
  };
  return (
    <Fenetre
      id="chambre-minibar"
      titre={<><span>Minibar de la chambre</span> <span data-no-translate>{chambre.numero}</span></>}
      sousTitre={sejour ? <span data-no-translate>{sejour.nomHote}</span> : 'Chambre libre'}
      onClose={onClose}
      largeur={520}
    >
      {peutGerer && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <Champ label="Article"><input style={h.saisie} value={article} onChange={(ev) => setArticle(ev.target.value)} placeholder="Eau, bière, chocolat…" autoFocus /></Champ>
          </div>
          <div style={{ flex: '0 0 90px' }}>
            <Champ label="Quantité"><input type="number" min="1" inputMode="numeric" style={h.saisie} value={quantite} onChange={(ev) => setQuantite(parseInt(ev.target.value, 10) || 1)} /></Champ>
          </div>
          <button type="button" style={st.primaire} onClick={ajouter}>Noter</button>
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
      {!lignes.length && <Vide>Rien de consommé pour l'instant.</Vide>}
      {lignes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lignes.map((m) => (
            <div key={m.id} style={e.ligneJournal}>
              <span style={{ fontSize: 14, color: 'var(--text)' }}><span>{m.quantite}</span><span aria-hidden="true"> </span><span data-no-translate>{m.article}</span></span>
              <span style={{ ...h.detail, fontVariantNumeric: 'tabular-nums' }} data-no-translate>{dateHeureZurich(m.createdAt)}</span>
              <span style={h.detail}><span data-no-translate>{nomPersonne(m.par)}</span></span>
              {peutGerer && (
                <Btn small onClick={async () => { const r = await minibar.supprimer(m.id); if (r.error) notify(r.error, 'error'); }}>
                  Retirer
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}
    </Fenetre>
  );
}

// Un mouvement de linge : sale sorti ou propre entré, une quantité par type.
// Lot 6b : au départ d'un hôte, les quantités viennent du linge réglé pour la
// catégorie de la chambre (Réglages, Étages) : un toucher les enregistre.
function LingeForm({ chambre, chambres, linge, user, aujourdhui, jeu = {}, onClose }) {
  const [chambreId, setChambreId] = React.useState(chambre?.id || '');
  const [sens, setSens] = React.useState('sale');
  const [quantites, setQuantites] = React.useState(() => Object.fromEntries(TYPES_LINGE.map((t) => [t.id, jeu[t.id] || 0])));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const prerempli = Object.values(jeu).some((n) => n > 0);
  const enregistrer = async () => {
    setErreur('');
    const lignes = TYPES_LINGE.filter((t) => (quantites[t.id] || 0) > 0);
    if (!lignes.length) { setErreur('Indiquez au moins une quantité.'); return; }
    setEnCours(true);
    for (const t of lignes) {
      const res = await linge.inserer({ chambre_id: chambreId || null, jour: aujourdhui, sens, type: t.id, quantite: quantites[t.id], par: user?.id || null });
      if (res.error) { setEnCours(false); setErreur(res.error); return; }
    }
    setEnCours(false);
    notify('Linge noté.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="linge-form"
      titre={chambre ? <><span>Linge de la chambre</span> <span data-no-translate>{chambre.numero}</span></> : 'Linge'}
      sousTitre={prerempli ? "Le linge d'un départ pour cette catégorie de chambre. Corrigez si besoin." : undefined}
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      <div style={h.grille}>
        {!chambre && (
          <Champ label="Chambre" large>
            <select style={h.saisie} value={chambreId} onChange={(ev) => setChambreId(ev.target.value)}>
              <option value="">Parties communes</option>
              {chambres.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
            </select>
          </Champ>
        )}
        <Champ label="Sens" large>
          <select style={h.saisie} value={sens} onChange={(ev) => setSens(ev.target.value)}>
            <option value="sale">Sale sorti</option>
            <option value="propre">Propre entré</option>
          </select>
        </Champ>
        {TYPES_LINGE.map((t) => (
          <Champ key={t.id} label={t.label}>
            <input type="number" min="0" max="99" inputMode="numeric" style={h.saisie} value={quantites[t.id]}
              onChange={(ev) => setQuantites((p) => ({ ...p, [t.id]: Math.max(0, parseInt(ev.target.value, 10) || 0) }))} />
          </Champ>
        ))}
      </div>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

function LingeDuJour({ linge, chambres, aujourdhui, peutGerer, onAjouter }) {
  const totaux = totauxLinge(linge.rows, aujourdhui);
  const duJour = linge.rows.filter((m) => m.jour === aujourdhui);
  const numero = (id) => chambres.find((c) => c.id === id)?.numero || '';
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {peutGerer && (
        <div className="module-actions">
          <Btn variant="primary" onClick={onAjouter} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
            <Shirt size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Noter du linge</span>
          </Btn>
        </div>
      )}
      <div style={e.grille}>
        {TYPES_LINGE.map((t) => (
          <div key={t.id} style={h.carte} data-cadre="" data-linge={t.id}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text2)' }}>{t.label}</span>
            <span style={h.detail}><span>Sale sorti</span> <span style={e.nombre}>{totaux[t.id]?.sale || 0}</span></span>
            <span style={h.detail}><span>Propre entré</span> <span style={e.nombre}>{totaux[t.id]?.propre || 0}</span></span>
          </div>
        ))}
      </div>
      {!duJour.length && <Vide>Aucun mouvement de linge aujourd'hui.</Vide>}
      {duJour.length > 0 && (
        <Liste>
          {duJour.map((m) => (
            <div key={m.id} style={{ ...h.ligne, cursor: 'default' }}>
              <span style={h.ligneGauche}>
                <span style={h.nomHote}>
                  <span>{m.quantite}</span><span aria-hidden="true"> </span><span>{libelleDe(TYPES_LINGE, m.type)}</span><span aria-hidden="true"> </span>
                  <span>{m.sens === 'sale' ? 'sale sorti' : 'propre entré'}</span>
                </span>
                <span style={h.detail}>{m.chambreId ? <><span>Chambre</span> <span data-no-translate>{numero(m.chambreId)}</span></> : <span>Parties communes</span>}</span>
              </span>
              <span style={h.ligneDroite}>
                <span style={h.detail} data-no-translate>{nomPersonne(m.par)}</span>
                {peutGerer && (
                  <Btn small onClick={async () => { const r = await linge.supprimer(m.id); if (r.error) notify(r.error, 'error'); }}>
                    Retirer
                  </Btn>
                )}
              </span>
            </div>
          ))}
        </Liste>
      )}
    </section>
  );
}

function ObjetsTrouves({ objets, chambres, sejours, peutGerer, onDeclarer, onOuvrir }) {
  const [filtre, setFiltre] = React.useState('trouve');
  const numero = (id) => chambres.find((c) => c.id === id)?.numero || '';
  const hote = (id) => sejours.find((s) => s.id === id)?.nomHote || '';
  const liste = objets.rows.filter((o) => filtre === 'tous' || o.statut === filtre);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="module-actions">
        {peutGerer && (
          <Btn variant="primary" onClick={onDeclarer} style={{ minHeight: 48, padding: '10px 16px', fontSize: 14 }}>
            <Package size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Déclarer un objet</span>
          </Btn>
        )}
        <SegmentedTabs size="sm" tabs={[{ id: 'trouve', label: 'À rendre' }, { id: 'rendu', label: 'Rendus' }, { id: 'tous', label: 'Tous' }]} active={filtre} onChange={setFiltre} />
      </div>
      {objets.status === 'ready' && !liste.length && <Vide>Aucun objet dans cette liste.</Vide>}
      {liste.length > 0 && (
        <Liste>
          {liste.map((o) => (
            <button key={o.id} type="button" className="tdb-lien" style={h.ligne} onClick={() => onOuvrir(o)} data-objet={o.id}>
              <span style={h.ligneGauche}>
                <span style={h.nomHote} data-no-translate>{o.description}</span>
                <span style={h.detail}>
                  <span>{dateCourte(o.trouveLe)}</span>
                  {o.chambreId && <><span aria-hidden="true"> </span><span>Chambre</span> <span data-no-translate>{numero(o.chambreId)}</span></>}
                  {o.lieu && <><span aria-hidden="true"> </span><span data-no-translate>{o.lieu}</span></>}
                  {o.sejourId && hote(o.sejourId) && <><span aria-hidden="true"> </span><span data-no-translate>{hote(o.sejourId)}</span></>}
                </span>
              </span>
              <span style={h.ligneDroite}>
                <Puce ton={tonDe(STATUTS_OBJET, o.statut)}>{libelleDe(STATUTS_OBJET, o.statut)}</Puce>
              </span>
            </button>
          ))}
        </Liste>
      )}
    </section>
  );
}

function ObjetForm({ objet, chambres, sejours, objets, peutGerer, user, aujourdhui, onClose }) {
  const [f, setF] = React.useState(() => objet
    ? { ...objet }
    : { description: '', lieu: '', chambreId: '', sejourId: '', trouveLe: aujourdhui, statut: 'trouve', renduA: '', renduLe: '', note: '' });
  const [erreur, setErreur] = React.useState('');
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const sejoursDeLaChambre = f.chambreId ? sejours.filter((s) => s.chambreId === f.chambreId && s.statut !== 'annule' && s.statut !== 'no_show').slice(0, 20) : [];
  const enregistrer = async (statut = f.statut) => {
    setErreur('');
    if (!f.description.trim()) { setErreur('Décris l\'objet.'); return; }
    const valeurs = {
      description: f.description.trim(), lieu: f.lieu.trim() || null, chambre_id: f.chambreId || null, sejour_id: f.sejourId || null,
      trouve_le: f.trouveLe || aujourdhui, statut, rendu_a: statut === 'rendu' ? (f.renduA.trim() || null) : null,
      rendu_le: statut === 'rendu' ? (f.renduLe || aujourdhui) : null, note: f.note.trim() || null,
    };
    const res = objet ? await objets.modifier(objet.id, valeurs) : await objets.inserer({ ...valeurs, par: user?.id || null });
    if (res.error) { setErreur(res.error); return; }
    notify(statut === 'rendu' ? 'Objet rendu.' : statut === 'jete' ? 'Objet noté jeté.' : objet ? 'Objet modifié.' : 'Objet déclaré.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="objet-form"
      titre={objet ? 'Objet trouvé' : 'Déclarer un objet trouvé'}
      onClose={onClose}
      largeur={560}
      pied={peutGerer ? (
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          {objet && objet.statut === 'trouve' && <button type="button" style={st.secondaire} onClick={() => enregistrer('jete')}>Jeté</button>}
          {objet && objet.statut === 'trouve' && <button type="button" style={st.secondaire} onClick={() => enregistrer('rendu')}>Rendu</button>}
          <button type="button" style={st.primaire} onClick={() => enregistrer()}>Enregistrer</button>
        </>
      ) : null}
    >
      <div style={h.grille}>
        <Champ label="Description" large>
          <input style={h.saisie} value={f.description} onChange={champ('description')} autoFocus placeholder="Chargeur, lunettes, doudou…" />
        </Champ>
        <Champ label="Chambre">
          <select style={h.saisie} value={f.chambreId} onChange={(ev) => setF((p) => ({ ...p, chambreId: ev.target.value, sejourId: '' }))}>
            <option value="">Parties communes</option>
            {chambres.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </Champ>
        <Champ label="Séjour">
          <select style={h.saisie} value={f.sejourId} onChange={champ('sejourId')} disabled={!f.chambreId}>
            <option value="">Aucun séjour</option>
            {sejoursDeLaChambre.map((s) => <option key={s.id} value={s.id}>{s.nomHote} ({dateCourte(s.arrivee)})</option>)}
          </select>
        </Champ>
        <Champ label="Lieu">
          <input style={h.saisie} value={f.lieu} onChange={champ('lieu')} placeholder="Salle de bain, restaurant, piscine…" />
        </Champ>
        <Champ label="Trouvé le">
          <input type="date" style={h.saisie} value={f.trouveLe} onChange={champ('trouveLe')} />
        </Champ>
        {(f.statut === 'rendu' || objet?.statut === 'trouve') && (
          <>
            <Champ label="Rendu à">
              <input style={h.saisie} value={f.renduA} onChange={champ('renduA')} placeholder="Nom de la personne" />
            </Champ>
            <Champ label="Rendu le">
              <input type="date" style={h.saisie} value={f.renduLe || ''} onChange={champ('renduLe')} />
            </Champ>
          </>
        )}
        <Champ label="Notes" large>
          <textarea style={{ ...h.saisie, minHeight: 56 }} value={f.note} onChange={champ('note')} />
        </Champ>
      </div>
      {objet && <div style={h.detail}><span>Déclaré par</span> <span data-no-translate>{nomPersonne(objet.par)}</span></div>}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

const e = {
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 },
  // La carte de la chambre est h.carte (hotelUi.jsx) ; une arrivée du jour
  // garde son bord d'accent.
  carteArrivee: { borderColor: 'var(--accent)' },
  numero: { fontFamily: 'var(--font-num)', fontSize: 'var(--t5)', fontWeight: 'var(--g-chiffre)', lineHeight: 1.05, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  nombre: { fontFamily: 'var(--font-num)', fontSize: 'var(--t4)', fontWeight: 'var(--g-chiffre)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  // Lot 6b : l'étape suivante et « Gérer », deux pilules secondaires (une
  // seule pilule sombre par écran : « Prendre ces chambres »).
  etape: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '8px 18px', fontSize: 'var(--t2)', fontFamily: 'var(--font)', fontWeight: 'var(--g3)',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderRadius: 'var(--r-full)', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', flex: '1 1 auto', whiteSpace: 'nowrap',
  },
  gerer: { ...st.secondaire, minHeight: 44, flex: '0 0 auto' },
  tournee: { ...h.carte, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  tourneeTitre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' },
  ligneJournal: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' },
};
