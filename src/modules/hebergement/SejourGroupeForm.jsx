import React from 'react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { SegmentedTabs } from '../../components/ui/index.jsx';
import { zurichAjouterJours } from '../../utils/zurichTime.js';
import { Champ, h } from './hotelUi.jsx';
import { PENSIONS, chf, dateCourte, libelleGroupe, tarifsApplicables } from './hotelData.js';
import {
  MAX_CHAMBRES, MIN_CHAMBRES, ajusterLignes, chambresLibres, nomDeLigne, prixDeCommun, proposerLignes, proposerManquantes,
  reproposerLignes, sejourQuiGene, valeursSejours, verifierLignes,
} from './sejoursGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plusieurs chambres d'un coup (lot 14 du panel) : un groupe, un séminaire.
// Une saisie commune et une ligne par chambre ; un seul « Enregistrer » crée
// tous les séjours en une requête, puis les relie au groupe choisi.
//
// Tant que les chambres et les séjours ne sont pas lus (lectureComplete), rien
// n'est proposé : une liste vide après une lecture en échec ne doit jamais
// faire croire que tout est libre. La base refuse de toute façon une chambre
// prise, et l'insertion échoue alors en entier.
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [{ id: 'une', label: 'Une chambre' }, { id: 'plusieurs', label: 'Plusieurs chambres' }];

export default function SejourGroupeForm({
  chambres, sejours, tarifs = [], groupes = [], groupesLisibles = false, lectureComplete = false, aujourdhui,
  onEnregistrer, onUneSeule, onClose,
}) {
  const [c, setC] = React.useState(() => ({
    nomGroupe: '', arrivee: aujourdhui, depart: zurichAjouterJours(aujourdhui, 1), pension: 'petit_dejeuner',
    tarifId: '', prixNuit: '', origine: '', demandesSpeciales: '', notes: '', groupeId: '',
  }));
  const dispo = lectureComplete ? chambres : [];
  const occupes = lectureComplete ? sejours : [];
  const tarif = tarifs.find((t) => t.id === c.tarifId) || null;
  const [lignes, setLignes] = React.useState(() => proposerLignes(dispo, occupes, c, MIN_CHAMBRES, null));
  const [nombreTexte, setNombreTexte] = React.useState(String(MIN_CHAMBRES));
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  // D13 : verrou synchrone, posé avant le premier await. L'état React seul
  // arrive trop tard pour deux touchers dans le même instant.
  const verrou = React.useRef(false);

  // Les lectures arrivent après l'ouverture : on propose alors une fois les
  // chambres des lignes encore vides.
  const dejaLu = React.useRef(lectureComplete);
  React.useEffect(() => {
    if (!lectureComplete || dejaLu.current) return;
    dejaLu.current = true;
    setLignes((ls) => proposerManquantes(ls, chambres, sejours, c, tarif));
  }, [lectureComplete]);

  const champ = (k) => (e) => setC((p) => ({ ...p, [k]: e.target.value }));
  const changerDate = (k) => (e) => {
    const suite = { ...c, [k]: e.target.value };
    setC(suite);
    setLignes((ls) => reproposerLignes(ls, dispo, occupes, suite, tarif));
  };
  const choisirTarif = (e) => {
    const t = tarifs.find((x) => x.id === e.target.value) || null;
    setC((p) => ({ ...p, tarifId: e.target.value, pension: t ? t.pension : p.pension }));
  };
  const changerNombre = (e) => {
    setNombreTexte(e.target.value);
    const n = parseInt(e.target.value, 10);
    if (n >= MIN_CHAMBRES && n <= MAX_CHAMBRES) setLignes((ls) => ajusterLignes(ls, n, dispo, occupes, c, tarif));
  };
  const finirNombre = () => setNombreTexte(String(lignes.length));
  const changerLigne = (cle, k, valeur) => setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [k]: valeur } : l)));
  const proposer = () => setLignes((ls) => proposerManquantes(ls, dispo, occupes, c, tarif));

  const datesValides = !!c.arrivee && !!c.depart && c.depart > c.arrivee;
  const tarifsPossibles = tarifsApplicables(tarifs, { ...c, tarifId: c.tarifId || null }, null);
  const groupesPossibles = groupesLisibles && datesValides
    ? groupes.filter((g) => !g.annule && g.dateEvenement >= c.arrivee && g.dateEvenement <= c.depart).slice(0, 100)
    : [];
  const groupeId = groupesPossibles.some((g) => g.id === c.groupeId) ? c.groupeId : '';
  const { erreurs, genes } = datesValides ? verifierLignes(lignes, chambres, occupes, c) : { erreurs: {}, genes: {} };
  const libres = lectureComplete && datesValides ? chambresLibres(chambres, sejours, c) : 0;
  const manque = Math.max(0, lignes.length - libres);
  const chambresTriees = dispo.filter((x) => x.actif !== false || lignes.some((l) => l.chambreId === x.id));

  const enregistrer = async () => {
    if (verrou.current) return;
    setErreur('');
    if (!c.nomGroupe.trim()) { setErreur('Le nom du groupe est obligatoire.'); return; }
    if (!datesValides) { setErreur('Le départ doit suivre l\'arrivée d\'au moins une nuit.'); return; }
    const prix = prixDeCommun(c);
    if (prix != null && !(prix >= 0)) { setErreur('Le prix par nuit convenu doit être un montant positif.'); return; }
    if (lignes.length < MIN_CHAMBRES || lignes.length > MAX_CHAMBRES) { setErreur('Choisissez entre 2 et 20 chambres.'); return; }
    if (Object.keys(erreurs).length) { setErreur('Corrigez les lignes signalées avant d\'enregistrer.'); return; }
    verrou.current = true;
    setEnCours(true);
    let res;
    try {
      res = await onEnregistrer({ sejours: valeursSejours(c, lignes), groupeId: groupeId || null });
    } catch (e) {
      res = { error: String(e?.message || e) };
    }
    setEnCours(false);
    if (res?.error) { verrou.current = false; setErreur(res.error); return; }
    onClose();
  };

  const n = lignes.length;
  return (
    <Fenetre
      id="sejour-groupe-form"
      titre="Nouveau séjour"
      onClose={onClose}
      largeur={720}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours} data-enregistrer-groupe="">
            {enCours ? 'Enregistrement…' : <><span>Enregistrer</span> <span data-no-translate>{n}</span> <span>séjours</span></>}
          </button>
        </>
      )}
    >
      <SegmentedTabs tabs={MODES} active="plusieurs" onChange={(id) => { if (id === 'une') onUneSeule(); }} />
      <div style={h.grille}>
        <Champ label="Nom du groupe" large>
          <input style={h.saisie} value={c.nomGroupe} onChange={champ('nomGroupe')} autoFocus />
        </Champ>
        <Champ label="Arrivée">
          <input type="date" style={h.saisie} value={c.arrivee} onChange={changerDate('arrivee')} />
        </Champ>
        <Champ label="Départ">
          <input type="date" style={h.saisie} value={c.depart} min={zurichAjouterJours(c.arrivee || aujourdhui, 1)} onChange={changerDate('depart')} />
        </Champ>
        <Champ label="Pension">
          <select style={h.saisie} value={c.pension} onChange={champ('pension')}>
            {PENSIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Champ>
        <Champ label="Tarif">
          <select style={h.saisie} value={c.tarifId} onChange={choisirTarif} data-no-translate>
            <option value="">{tarifs.length ? 'Aucun tarif' : 'Aucun tarif défini'}</option>
            {tarifsPossibles.map((t) => <option key={t.id} value={t.id}>{t.nom} (CHF {chf(t.prixNuit)})</option>)}
          </select>
        </Champ>
        <Champ label="Prix par nuit convenu (CHF)">
          <input type="number" min="0" step="0.05" inputMode="decimal" style={h.saisie} value={c.prixNuit} onChange={champ('prixNuit')} placeholder={c.tarifId ? 'Prix du tarif' : ''} />
        </Champ>
        <Champ label="Origine">
          <input style={h.saisie} value={c.origine} onChange={champ('origine')} placeholder="Site, téléphone, agence…" />
        </Champ>
        {groupesPossibles.length > 0 && (
          <Champ label="Groupe à relier">
            <select style={h.saisie} value={groupeId} onChange={champ('groupeId')} data-no-translate>
              <option value="">{'Aucun groupe'}</option>
              {groupesPossibles.map((g) => <option key={g.id} value={g.id}>{libelleGroupe(g)}</option>)}
            </select>
          </Champ>
        )}
        <Champ label="Nombre de chambres">
          <input
            type="number" min={MIN_CHAMBRES} max={MAX_CHAMBRES} inputMode="numeric" style={h.saisie}
            value={nombreTexte} onChange={changerNombre} onBlur={finirNombre}
          />
        </Champ>
      </div>

      <div style={g.liste} data-lignes-groupe="">
        {lignes.map((l, i) => {
          const gene = genes[l.cle];
          const err = erreurs[l.cle];
          return (
            <div key={l.cle} style={{ ...g.ligne, ...(i === lignes.length - 1 ? g.derniere : null) }} data-ligne-groupe={l.cle}>
              <div style={g.champs}>
                <Champ label="Chambre">
                  <select
                    style={{ ...h.saisie, ...g.haut, ...(err ? g.bordErreur : null) }}
                    value={l.chambreId} onChange={(e) => changerLigne(l.cle, 'chambreId', e.target.value)}
                  >
                    <option value="">Pas encore affectée</option>
                    {datesValides && chambresTriees.map((x) => {
                      const prise = !!sejourQuiGene(occupes, x.id, c);
                      const ailleurs = lignes.some((o) => o.cle !== l.cle && o.chambreId === x.id);
                      return (
                        <option key={x.id} value={x.id} disabled={(prise || ailleurs) && x.id !== l.chambreId} data-no-translate>
                          {x.numero}{x.categorie ? ` (${x.categorie})` : ''}{prise ? ' : prise' : ''}
                        </option>
                      );
                    })}
                  </select>
                </Champ>
                <Champ label="Nom">
                  <input
                    style={{ ...h.saisie, ...g.haut }} value={l.nom} onChange={(e) => changerLigne(l.cle, 'nom', e.target.value)}
                    placeholder={c.nomGroupe.trim() ? nomDeLigne(c, { nom: '' }, i + 1) : ''} data-no-translate
                  />
                </Champ>
                <Champ label="Adultes">
                  <input
                    type="number" min="1" inputMode="numeric" style={{ ...h.saisie, ...g.haut }} value={l.nbAdultes}
                    onChange={(e) => changerLigne(l.cle, 'nbAdultes', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                </Champ>
              </div>
              {err && (
                <div style={h.erreur} role="alert">
                  {gene
                    ? <><span>Chambre déjà prise du</span> <span data-no-translate>{dateCourte(gene.arrivee)}</span> <span>au</span> <span data-no-translate>{dateCourte(gene.depart)}</span> <span>par</span> <span data-no-translate>{gene.nomHote}</span>.</>
                    : err}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={st.secondaire} onClick={proposer} disabled={!lectureComplete || !datesValides}>Proposer les chambres</button>
        <div style={h.detail} data-etat-chambres="">
          {!lectureComplete
            ? <span>Les chambres libres n'ont pas pu être lues. Affectez les chambres depuis chaque fiche.</span>
            : (
              <>
                <span data-no-translate>{libres}</span> <span>{libres === 1 ? 'chambre libre sur ces nuits.' : 'chambres libres sur ces nuits.'}</span>
                {manque > 0 && (
                  <>
                    {' '}<span>Il manque</span> <span data-no-translate>{manque}</span> <span>{manque === 1 ? 'chambre : la ligne sans chambre s\'affectera depuis la fiche.' : 'chambres : les lignes sans chambre s\'affecteront depuis la fiche.'}</span>
                  </>
                )}
              </>
            )}
        </div>
      </div>

      <div style={h.grille}>
        <Champ label="Demandes spéciales" large>
          <textarea style={{ ...h.saisie, minHeight: 64 }} value={c.demandesSpeciales} onChange={champ('demandesSpeciales')} />
        </Champ>
        <Champ label="Notes" large>
          <textarea style={{ ...h.saisie, minHeight: 64 }} value={c.notes} onChange={champ('notes')} />
        </Champ>
      </div>
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}

const g = {
  liste: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  ligne: {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  derniere: { borderBottomWidth: 0 },
  champs: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, minWidth: 0 },
  haut: { minHeight: 44 },
  bordErreur: { borderColor: 'var(--danger-text)' },
};
