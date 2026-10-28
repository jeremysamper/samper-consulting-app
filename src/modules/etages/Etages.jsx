import React from 'react';
import { History, Moon, Package, Shirt } from 'lucide-react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { zurichToday } from '../../utils/zurichTime.js';
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
  const [objetForm, setObjetForm] = React.useState(null); // { objet: null | objet }
  const [enCours, setEnCours] = React.useState('');

  const actives = trierChambres(chambres.rows.filter((c) => c.actif));
  const sejourDe = (c) => sejourDeLaChambre(sejours.rows, c.id, aujourdhui);
  const arriveAujourdhui = (c) => sejours.rows.some((s) => s.chambreId === c.id && s.statut === 'prevu' && s.arrivee === aujourdhui);
  const enTete = actives.filter(arriveAujourdhui);
  const etages = [...new Set(actives.map((c) => c.etage || ''))];
  const turndownDe = (c) => turndown.rows.find((t) => t.chambreId === c.id && t.jour === aujourdhui) || null;
  // Ma tournée : mes chambres, les arrivées du jour puis les « à faire » d'abord.
  const maTournee = actives.filter((c) => c.attribueeA === user?.id)
    .sort((a, b) => (Number(arriveAujourdhui(b)) - Number(arriveAujourdhui(a))) || (ORDRE_MENAGE[a.statutMenage] - ORDRE_MENAGE[b.statutMenage]));

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
    chambre: c, sejour: sejourDe(c), aujourdhui, equipe, peutGerer, peutInspecter, enCours: enCours === c.id, turndownFait: !!turndownDe(c),
    onStatut: changerStatut, onAttribuer: attribuer, onHistorique: setHistoriquePour, onMinibar: setMinibarPour, onLinge: setLingePour, onTurndown: basculerTurndown,
    arrivee: arriveAujourdhui(c),
  });

  const etatLecture = chambres.status === 'absent' ? 'Le socle hôtel n\'est pas encore activé sur la base de données.'
    : chambres.status === 'error' ? 'Les chambres n\'ont pas pu être lues. Nouvel essai en cours…' : null;

  return (
    <section className="etages" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      {!etabId && <Vide>Aucun établissement sélectionné.</Vide>}
      {etabId && (
        <>
          <SegmentedTabs tabs={ONGLETS} active={onglet} onChange={setOnglet} />
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
            <Groupe key={etage || 'sans'} titre={etage ? <><span>Étage</span> <span data-no-translate>{etage}</span></> : <span>Sans étage</span>}>
              {actives.filter((c) => (c.etage || '') === etage).map((c) => <CarteChambre key={c.id} {...props(c)} />)}
            </Groupe>
          ))}
        </>
      )}

      {etabId && onglet === 'tournee' && (
        maTournee.length
          ? <Groupe titre={<><span>{maTournee.length}</span> <span>{maTournee.length > 1 ? 'chambres attribuées, les arrivées puis les « à faire » d\'abord' : 'chambre attribuée'}</span></>}>
            {maTournee.map((c) => <CarteChambre key={c.id} {...props(c)} />)}
          </Groupe>
          : <Vide>Aucune chambre ne t'est attribuée aujourd'hui.</Vide>
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
          onClose={() => setLingePour(null)}
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

function CarteChambre({ chambre: c, sejour: s, aujourdhui, equipe, peutGerer, peutInspecter, enCours, turndownFait, onStatut, onAttribuer, onHistorique, onMinibar, onLinge, onTurndown, arrivee }) {
  const occupant = s ? (
    <span style={h.detail}>
      {s.statut === 'en_maison'
        ? <>{s.depart === aujourdhui ? <span>Part aujourd'hui</span> : <><span>En maison jusqu'au</span> <span>{dateCourte(s.depart)}</span></>}</>
        : <span>Arrive aujourd'hui</span>}
      <span aria-hidden="true"> </span>
      <span data-no-translate>{s.nomHote}</span>
    </span>
  ) : <span style={h.detail}>Libre</span>;

  return (
    <div style={{ ...e.carte, ...(arrivee ? e.carteArrivee : null) }} data-chambre={c.numero} data-statut={c.statutMenage}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={e.numero} data-no-translate>{c.numero}</span>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {turndownFait && <Puce ton="info">Couverture faite</Puce>}
          <Puce ton={tonDe(STATUTS_MENAGE, c.statutMenage)}>{libelleDe(STATUTS_MENAGE, c.statutMenage)}</Puce>
        </span>
      </div>
      {c.categorie && <span style={h.detail} data-no-translate>{c.categorie}</span>}
      {occupant}
      {c.statutMenage === 'hors_service' && c.horsServiceMotif && (
        <span style={h.detail}><span>Motif :</span> <span data-no-translate>{c.horsServiceMotif}</span></span>
      )}
      {c.attribueeA && !peutGerer && (
        <span style={h.detail}><span>Attribuée à</span> <span data-no-translate>{nomPersonne(c.attribueeA)}</span></span>
      )}
      {peutGerer && (
        <div style={e.statuts} role="group" aria-label={`Statut de la chambre ${c.numero}`}>
          {STATUTS_MENAGE.map((st_) => {
            const actif = st_.id === c.statutMenage;
            const interdit = st_.id === 'inspectee' && !peutInspecter;
            return (
              <button
                key={st_.id}
                type="button"
                className="ui-btn"
                aria-pressed={actif}
                disabled={enCours || interdit}
                title={interdit ? 'Demande le droit Inspecter les chambres' : undefined}
                onClick={() => onStatut(c, st_.id)}
                style={{ ...e.bouton, ...(actif ? e.boutonActif : null), ...(interdit ? { opacity: 0.5, cursor: 'default' } : null) }}
              >
                {st_.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {peutGerer && (
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <Champ label="Attribuée à">
              <select style={h.saisie} value={c.attribueeA || ''} onChange={(ev) => onAttribuer(c, ev.target.value)} disabled={enCours}>
                <option value="">Pas attribuée</option>
                {equipe.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                {c.attribueeA && !equipe.some((p) => p.id === c.attribueeA) && <option value={c.attribueeA}>{nomPersonne(c.attribueeA)}</option>}
              </select>
            </Champ>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {peutGerer && (
          <>
            <button type="button" className="ui-btn ui-btn--ghost" style={e.action} onClick={() => onMinibar(c)} disabled={enCours}>
              <Package size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Minibar</span>
            </button>
            <button type="button" className="ui-btn ui-btn--ghost" style={e.action} onClick={() => onLinge(c)} disabled={enCours}>
              <Shirt size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Linge</span>
            </button>
            <button type="button" className="ui-btn ui-btn--ghost" style={{ ...e.action, ...(turndownFait ? e.actionActive : null) }} onClick={() => onTurndown(c)} disabled={enCours} aria-pressed={turndownFait}>
              <Moon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{turndownFait ? 'Couverture faite' : 'Couverture du soir'}</span>
            </button>
          </>
        )}
        <button type="button" className="ui-btn ui-btn--ghost" style={e.action} onClick={() => onHistorique(c)} aria-label={`Historique de la chambre ${c.numero}`}>
          <History size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Historique</span>
        </button>
      </div>
    </div>
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
                <button type="button" className="ui-btn ui-btn--ghost" style={{ ...e.action, minHeight: 36 }} onClick={async () => { const r = await minibar.supprimer(m.id); if (r.error) notify(r.error, 'error'); }}>
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Fenetre>
  );
}

// Un mouvement de linge : sale sorti ou propre entré, par type et quantité.
function LingeForm({ chambre, chambres, linge, user, aujourdhui, onClose }) {
  const [chambreId, setChambreId] = React.useState(chambre?.id || '');
  const [sens, setSens] = React.useState('sale');
  const [type, setType] = React.useState('draps');
  const [quantite, setQuantite] = React.useState(1);
  const [erreur, setErreur] = React.useState('');
  const enregistrer = async () => {
    setErreur('');
    const res = await linge.inserer({ chambre_id: chambreId || null, jour: aujourdhui, sens, type, quantite: Math.max(1, quantite), par: user?.id || null });
    if (res.error) { setErreur(res.error); return; }
    notify('Linge noté.', 'success');
    onClose();
  };
  return (
    <Fenetre
      id="linge-form"
      titre={chambre ? <><span>Linge de la chambre</span> <span data-no-translate>{chambre.numero}</span></> : 'Linge'}
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer}>Enregistrer</button>
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
        <Champ label="Sens">
          <select style={h.saisie} value={sens} onChange={(ev) => setSens(ev.target.value)}>
            <option value="sale">Sale sorti</option>
            <option value="propre">Propre entré</option>
          </select>
        </Champ>
        <Champ label="Type">
          <select style={h.saisie} value={type} onChange={(ev) => setType(ev.target.value)}>
            {TYPES_LINGE.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Champ>
        <Champ label="Quantité">
          <input type="number" min="1" inputMode="numeric" style={h.saisie} value={quantite} onChange={(ev) => setQuantite(parseInt(ev.target.value, 10) || 1)} />
        </Champ>
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
          <button type="button" className="ui-btn ui-btn--primary" style={{ ...e.action, minHeight: 48, padding: '10px 16px', fontSize: 14 }} onClick={onAjouter}>
            <Shirt size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Noter du linge</span>
          </button>
        </div>
      )}
      <div style={e.grille}>
        {TYPES_LINGE.map((t) => (
          <div key={t.id} style={e.carte} data-linge={t.id}>
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
                  <button type="button" className="ui-btn ui-btn--ghost" style={{ ...e.action, minHeight: 36 }} onClick={async () => { const r = await linge.supprimer(m.id); if (r.error) notify(r.error, 'error'); }}>
                    Retirer
                  </button>
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
          <button type="button" className="ui-btn ui-btn--primary" style={{ ...e.action, minHeight: 48, padding: '10px 16px', fontSize: 14 }} onClick={onDeclarer}>
            <Package size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Déclarer un objet</span>
          </button>
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
  carte: {
    display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '14px 16px', boxSizing: 'border-box',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  carteArrivee: { borderColor: 'var(--accent)' },
  numero: { fontFamily: 'var(--font-num)', fontSize: 26, lineHeight: 1.05, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  nombre: { fontFamily: 'var(--font-num)', fontSize: 20, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  statuts: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  bouton: {
    minHeight: 44, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)', fontWeight: 500, cursor: 'pointer',
    background: 'var(--surface2)', color: 'var(--text)', borderRadius: 'var(--r-sm)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', flex: '1 1 auto',
  },
  boutonActif: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)', fontWeight: 700 },
  action: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', flexShrink: 0,
  },
  actionActive: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  ligneJournal: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--border)' },
};
