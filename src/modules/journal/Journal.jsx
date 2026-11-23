import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { supabase } from '../../services/supabase.js';
import { roles } from '../moduleConfig.js';
import { zurichAjouterJours, zurichDateHeure, zurichLundi, zurichMinuitIso } from '../../utils/zurichTime.js';
import { Btn, ChoixFiltre, Panneau, SectionHeader } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import BoutonRegler from '../../components/ui/BoutonRegler.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { useUserSettings } from '../../hooks/useUserSettings.js';
import { MODULES_JOURNAL, OPERATIONS_JOURNAL } from './serieJournal.js';
import {
  CLE_FILTRES_JOURNAL, FILTRES_VIDES, TOUS, champsChanges, filtrerJournal, filtresPoses, libelleActeur,
  lireFiltres, modulesDuJournal, motAction, personnesDuJournal, regrouperJournal,
} from './journalLogique.js';

// Journal d'activité : qui a créé, modifié ou supprimé quoi dans les recettes,
// produits, pertes et inventaires d'un établissement, semaine par semaine.
// Alimenté par le déclencheur journal_activite_log (migration 20261015) ;
// lecture réservée au consultant et au patron par la RLS.
// La semaine en cours d'office ; semaine précédente, suivante et « Exporter »
// en gros boutons ; l'établissement se change par la coque, comme partout
// (le sélecteur de la barre du haut), le journal le suit.
//
// Plan 15, lot 5 : une recherche par mots et trois filtres (personne, module,
// action), gardés pour chaque personne (user_settings, journal_filtres) ; les
// lignes identiques qui se suivent sont regroupées (« 7 modifications ») et
// se déplient ; chaque ligne dit ce qui a changé. La vue (regroupée ou ligne
// par ligne) et le format de l'export se règlent dans Réglages > Journal.

const ACTIONS = OPERATIONS_JOURNAL;
const COULEUR_ACTION = { INSERT: 'var(--success-text)', UPDATE: 'var(--accent)', DELETE: 'var(--danger-text)' };
// caisse : corrections d'une réservation par le service (RPC
// caisse_corriger_reservation, migration 20261110_caisse_v5).
const MODULES = MODULES_JOURNAL;
const COLONNES = 'id, created_at, acteur_id, acteur_nom, acteur_role, module, operation, libelle, colonnes_modifiees';
const PAGE = 1000;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const libelleRole = (role) => (role ? roles[role]?.label || role : '');

function libelleJour(jour) {
  const [y, m, d] = jour.split('-').map(Number);
  const s = new Intl.DateTimeFormat('fr-CH', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(Date.UTC(y, m - 1, d)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function libelleSemaine(lundi) {
  const [y1, m1, d1] = lundi.split('-');
  const [y2, m2, d2] = zurichAjouterJours(lundi, 6).split('-');
  return `Semaine du ${d1}.${m1}${y1 !== y2 ? `.${y1}` : ''} au ${d2}.${m2}.${y2}`;
}

// Toute la semaine, par pages de 1000. La semaine en cours passe par la vue
// journal_activite_semaine ; les autres par la table, bornées du lundi minuit
// au lundi suivant, heure de Zurich.
async function chargerSemaine(etabId, lundi, estCourante) {
  const lignes = [];
  for (let debut = 0; ; debut += PAGE) {
    let requete = supabase
      .from(estCourante ? 'journal_activite_semaine' : 'journal_activite')
      .select(COLONNES)
      .eq('etablissement_id', etabId);
    if (!estCourante) {
      requete = requete
        .gte('created_at', zurichMinuitIso(lundi))
        .lt('created_at', zurichMinuitIso(zurichAjouterJours(lundi, 7)));
    }
    const { data, error } = await requete
      .order('created_at', { ascending: false })
      .order('id')
      .range(debut, debut + PAGE - 1);
    if (error) throw error;
    lignes.push(...(data || []));
    if (!data || data.length < PAGE) return lignes;
  }
}

const ENTETE_EXPORT = ['Date', 'Heure', 'Acteur', 'Rôle', 'Module', 'Action', 'Élément', 'Champs modifiés'];
const rangExport = (l) => {
  const { date, heure } = zurichDateHeure(l.created_at);
  return [date, heure, libelleActeur(l), libelleRole(l.acteur_role), MODULES[l.module] || l.module,
    ACTIONS[l.operation] || l.operation, l.libelle || '', champsChanges(l).join(', ')];
};

// Champ CSV : guillemets si besoin, et une apostrophe devant ce qu'un tableur
// prendrait pour une formule (libellés saisis par les équipes).
function champCsv(valeur) {
  let s = String(valeur ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function telecharger(contenu, nomFichier, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function exporterCsv(lignes, nomFichier) {
  const texte = '﻿' + [ENTETE_EXPORT, ...lignes.map(rangExport)].map((r) => r.map(champCsv).join(';')).join('\r\n');
  telecharger(texte, `${nomFichier}.csv`, 'text/csv;charset=utf-8');
}

// Classeur Excel : la feuille de la Comptabilité (en-têtes figés), chargée à
// la demande pour ne pas alourdir le module.
async function exporterXlsx(lignes, nomFichier, titre) {
  const { classeurXlsx, feuilleXml } = await import('../comptabilite/exportCompta.js');
  const largeurs = [12, 8, 22, 18, 14, 14, 32, 40];
  const feuille = {
    nom: 'Journal',
    colonnes: ENTETE_EXPORT.map((t, i) => ({ titre: t, largeur: largeurs[i] })),
    rangs: lignes.map((l) => ({ cellules: rangExport(l) })),
  };
  const octets = classeurXlsx({ xml: [feuilleXml(feuille, titre, true)], noms: ['Journal'], titre });
  telecharger(octets, `${nomFichier}.xlsx`, MIME_XLSX);
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Gros boutons : 48 px au doigt, texte lisible ; des pilules (Btn).
const gros = { minHeight: 48, padding: '10px 16px', fontSize: 'var(--t2)' };

// Le filtre de chaque personne : lu une fois de user_settings, puis écrit à
// chaque changement (une demi-seconde après le dernier geste). Une écriture
// en échec ne bloque rien : le filtre reste à l'écran.
function useFiltresGardes() {
  const { settings, loading, setSetting } = useUserSettings([CLE_FILTRES_JOURNAL]);
  const [filtres, setFiltres] = React.useState(FILTRES_VIDES);
  const lu = React.useRef(false);
  const minuterie = React.useRef(null);
  React.useEffect(() => {
    if (loading || lu.current) return;
    lu.current = true;
    setFiltres(lireFiltres(settings[CLE_FILTRES_JOURNAL]));
  }, [loading, settings]);
  React.useEffect(() => () => clearTimeout(minuterie.current), []);
  const changer = React.useCallback((maj) => {
    setFiltres((avant) => {
      const suivant = { ...avant, ...maj };
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => {
        Promise.resolve(setSetting(CLE_FILTRES_JOURNAL, suivant)).catch((e) => console.warn('[journal] filtre non gardé', e));
      }, 500);
      return suivant;
    });
  }, [setSetting]);
  return [filtres, changer];
}

export default function Journal({ etablissement, user }) {
  const lundiCourant = zurichLundi();
  // L'établissement est celui de la coque : son sélecteur, dans la barre du
  // haut, change aussi le journal affiché.
  const etabId = etablissement?.id || '';
  const [lundi, setLundi] = React.useState(lundiCourant);
  const [lignes, setLignes] = React.useState([]);
  const [etat, setEtat] = React.useState('chargement');
  const [essai, setEssai] = React.useState(0);
  const [enExport, setEnExport] = React.useState(false);
  const [recherche, setRecherche] = React.useState('');
  const [ouverts, setOuverts] = React.useState(() => new Set());
  const [filtres, changerFiltres] = useFiltresGardes();
  const { reglages } = useReglagesModule(etabId, 'journal');
  const estCourante = lundi === lundiCourant;

  React.useEffect(() => {
    if (!etabId) return undefined;
    let actif = true;
    setEtat('chargement');
    chargerSemaine(etabId, lundi, estCourante)
      .then((rows) => { if (actif) { setLignes(rows); setEtat('pret'); } })
      .catch(() => { if (actif) setEtat('erreur'); });
    return () => { actif = false; };
  }, [etabId, lundi, estCourante, essai]);

  const personnes = React.useMemo(() => personnesDuJournal(lignes), [lignes]);
  const modules = React.useMemo(() => modulesDuJournal(lignes), [lignes]);
  // Un filtre gardé sur une personne ou un module absent de la semaine reste
  // posé (il vaut pour les autres semaines) : il apparaît dans sa liste.
  const optionsPersonnes = [{ id: TOUS, label: 'Toutes les personnes' }, ...personnes,
    ...(filtres.personne !== TOUS && !personnes.some((p) => p.id === filtres.personne) ? [{ id: filtres.personne, label: 'Personne choisie' }] : [])];
  const optionsModules = [{ id: TOUS, label: 'Tous les modules' }, ...modules,
    ...(filtres.module !== TOUS && !modules.some((m) => m.id === filtres.module) ? [{ id: filtres.module, label: MODULES[filtres.module] || filtres.module }] : [])];
  const optionsActions = [{ id: TOUS, label: 'Toutes les actions' }, ...Object.entries(ACTIONS).map(([id, label]) => ({ id, label }))];

  const visibles = React.useMemo(() => filtrerJournal(lignes, { recherche, ...filtres }), [lignes, recherche, filtres]);
  const jours = React.useMemo(() => regrouperJournal(
    visibles.map((l) => ({ ...l, ...zurichDateHeure(l.created_at) })),
    { regrouper: reglages.vue !== 'detail' },
  ), [visibles, reglages.vue]);
  const filtre = filtresPoses(filtres) || recherche.trim() !== '';

  const nomEtab = etablissement?.nom || etabId;

  // L'export reprend la semaine entière, ou les lignes filtrées quand un
  // filtre est posé, dans le format réglé par la maison.
  const exporter = async () => {
    if (!etabId || enExport) return;
    setEnExport(true);
    try {
      const rows = filtre ? visibles : await chargerSemaine(etabId, lundi, estCourante);
      if (!rows.length) {
        notify(filtre ? 'Aucune ligne à exporter pour ces filtres.' : 'Aucune activité à exporter pour cette semaine.', 'info');
        return;
      }
      const nom = `journal-${slug(nomEtab)}-${lundi}`;
      const ordre = rows.slice().reverse();
      if (reglages.export === 'xlsx') await exporterXlsx(ordre, nom, `${nomEtab}, ${libelleSemaine(lundi)}`);
      else exporterCsv(ordre, nom);
    } catch {
      notify("L'export du journal a échoué. Réessayez.", 'error');
    } finally {
      setEnExport(false);
    }
  };

  const basculer = (id) => setOuverts((avant) => {
    const s = new Set(avant);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  // « nom et prix de vente changés » : chaque mot dans son nœud, pour que le
  // glossaire le traduise (les noms de champs sont une liste fermée).
  const motsChanges = (operation, lot) => {
    if (operation !== 'UPDATE') return null;
    const mots = champsChanges(lot);
    if (!mots.length) return null;
    return (
      <>
        {mots.map((m, k) => (
          <React.Fragment key={m}>
            {k > 0 && (k === mots.length - 1 ? <>{' '}<span>et</span>{' '}</> : ', ')}
            <span>{m}</span>
          </React.Fragment>
        ))}
        {' '}<span>{mots.length > 1 ? 'changés' : 'changé'}</span>
      </>
    );
  };

  const detailLigne = (l, n = 1, lot = [l]) => {
    const changement = motsChanges(l.operation, lot);
    return (
      <>
        <span style={{ color: COULEUR_ACTION[l.operation], fontWeight: 'var(--g2)' }}>
          {n > 1 ? <><span data-no-translate>{n}</span>{' '}<span>{motAction(l.operation, n)}</span></> : <span>{motAction(l.operation, 1)}</span>}
        </span>
        {' '}<span>par</span>{' '}<span data-no-translate>{libelleActeur(l)}</span>
        {l.acteur_role ? <>{' ('}<span>{libelleRole(l.acteur_role)}</span>{')'}</> : null}
        {changement ? <>{' : '}{changement}</> : null}
      </>
    );
  };

  return (
    <section style={js.page}>
      <SectionHeader
        sub="Créations, modifications et suppressions dans les recettes, produits, pertes et inventaires, et corrections de réservation faites depuis la caisse."
        style={{ marginBottom: 0 }}
      />

      {/* Direction Galet : la semaine et l'établissement en pilules posées sur
          la page, « Exporter » en pilule sombre à droite ; le registre dans
          une carte. Une seule rangée qui passe à la ligne : la liste commence
          à la même hauteur qu'avant, aucun défilement de plus. */}
      <div style={js.rangee}>
        <span style={js.contexte} data-no-translate>{nomEtab}</span>
        <span style={{ ...js.contexte, fontFamily: 'var(--font-num)' }}>{libelleSemaine(lundi)}</span>
        <Btn onClick={() => setLundi(zurichAjouterJours(lundi, -7))} ariaLabel="Semaine précédente" style={gros}>
          <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Semaine précédente</span>
        </Btn>
        {!estCourante && (
          <Btn onClick={() => setLundi(zurichAjouterJours(lundi, 7))} ariaLabel="Semaine suivante" style={gros}>
            <span>Semaine suivante</span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </Btn>
        )}
        {!estCourante && <Btn onClick={() => setLundi(lundiCourant)} style={gros}>Cette semaine</Btn>}
        <div style={{ marginLeft: 'auto' }}>
          <Btn variant="primary" onClick={exporter} disabled={enExport || etat !== 'pret'} style={gros}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{enExport ? 'Export en cours…' : 'Exporter'}</span>
          </Btn>
        </div>
      </div>

      {/* Trouver une ligne : la recherche par mots et trois filtres, une liste
          par dimension (S5). Le filtre est gardé pour la personne. */}
      <div style={js.rangee} data-journal-filtres="">
        <SearchToggle value={recherche} onChange={setRecherche} placeholder="Rechercher une ligne…" style={{ minWidth: 44, minHeight: 44 }} />
        <ChoixFiltre libelle="Personne" valeur={filtres.personne} defaut={TOUS} options={optionsPersonnes} onChange={(personne) => changerFiltres({ personne })} />
        <ChoixFiltre libelle="Module" valeur={filtres.module} defaut={TOUS} options={optionsModules} onChange={(module) => changerFiltres({ module })} />
        <ChoixFiltre libelle="Action" valeur={filtres.action} defaut={TOUS} options={optionsActions} onChange={(action) => changerFiltres({ action })} />
        {filtresPoses(filtres) && (
          <Btn variant="ghost" onClick={() => changerFiltres(FILTRES_VIDES)} style={{ minHeight: 44 }}>Effacer les filtres</Btn>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <BoutonRegler section="journal" user={user} etablissement={etablissement} />
        </div>
      </div>

      {etat === 'chargement' && <Panneau><div style={js.note}>Chargement…</div></Panneau>}

      {etat === 'erreur' && (
        <Panneau>
          <div className="form-alert error" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            Le journal n'a pas pu être chargé.
            <Btn small onClick={() => setEssai((n) => n + 1)}>Réessayer</Btn>
          </div>
        </Panneau>
      )}

      {etat === 'pret' && lignes.length === 0 && (
        <Panneau><div style={js.note}>Aucune activité enregistrée cette semaine.</div></Panneau>
      )}

      {etat === 'pret' && lignes.length > 0 && visibles.length === 0 && (
        <Panneau><div style={js.note}>Aucune ligne pour ces filtres cette semaine.</div></Panneau>
      )}

      {etat === 'pret' && filtre && visibles.length > 0 && (
        <p style={js.compte}>
          <span data-no-translate>{visibles.length}</span>{' '}<span>{visibles.length > 1 ? 'lignes' : 'ligne'}</span>{' '}
          <span>sur</span>{' '}<span data-no-translate>{lignes.length}</span>{' '}<span>cette semaine</span>
        </p>
      )}

      {etat === 'pret' && jours.length > 0 && (
        <Panneau style={js.registre}>
          {jours.map((g, i) => (
            <div key={g.jour} style={js.jour}>
              <div style={{ ...js.jourTitre, ...(i === 0 ? { paddingTop: 4 } : null) }}>
                {libelleJour(g.jour)}
              </div>
              {g.entrees.map((e, j) => {
                const l = e.lignes[0];
                const derniere = i === jours.length - 1 && j === g.entrees.length - 1;
                const ouvert = e.n > 1 && ouverts.has(e.id);
                const corps = (
                  <>
                    <div style={js.heure}>{e.n > 1 ? <>{e.heureDebut}<br />{e.heureFin}</> : e.heureFin}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={js.titreLigne}>
                        <span style={{ fontWeight: 'var(--g2)' }} data-no-translate>{l.libelle || 'Sans nom'}</span>
                        <span style={js.module}>{MODULES[l.module] || l.module}</span>
                      </div>
                      <div style={js.detail}>{detailLigne(l, e.n, e.lignes)}</div>
                    </div>
                    {e.n > 1 && (
                      <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true"
                        style={{ flexShrink: 0, color: 'var(--text2)', transform: ouvert ? 'rotate(180deg)' : undefined }} />
                    )}
                  </>
                );
                return (
                  <div key={e.id} style={{ ...js.entree, ...(derniere ? js.derniere : null) }}>
                    {e.n > 1 ? (
                      <button type="button" style={{ ...js.ligne, ...js.ligneBouton }} aria-expanded={ouvert} onClick={() => basculer(e.id)}>
                        {corps}
                      </button>
                    ) : <div style={js.ligne}>{corps}</div>}
                    {ouvert && (
                      <div style={js.sousListe}>
                        {e.lignes.map((x) => (
                          <div key={x.id} style={js.sousLigne}>
                            <span style={js.heure}>{x.heure}</span>
                            <span style={{ minWidth: 0 }}>{motsChanges(x.operation, [x]) || <span>{ACTIONS[x.operation] || x.operation}</span>}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </Panneau>
      )}
    </section>
  );
}

// Direction Galet : le registre est une carte blanche (Panneau), un titre par
// jour en --g3, les lignes séparées par un filet --rule-soft ; le module de
// chaque ligne en étiquette sur la piste.
const js = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' },
  rangee: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, minWidth: 0 },
  contexte: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  note: { fontSize: 'var(--t2)', color: 'var(--text3)' },
  compte: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  registre: { padding: '8px 20px 4px' },
  jour: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  jourTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '16px 0 6px' },
  entree: {
    display: 'flex', flexDirection: 'column', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', minWidth: 0, minHeight: 44 },
  // Une ligne regroupée se déplie : bouton transparent, sans rayon, pleine largeur.
  ligneBouton: {
    width: '100%', textAlign: 'left', background: 'transparent', borderWidth: 0, borderRadius: 0,
    fontFamily: 'var(--font)', color: 'inherit', cursor: 'pointer',
  },
  derniere: { borderBottomWidth: 0 },
  heure: { fontFamily: 'var(--font-num)', fontSize: 'var(--t2)', color: 'var(--text2)', flexShrink: 0, width: 48, lineHeight: 1.35 },
  titreLigne: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 8px', fontSize: 'var(--t2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  module: { fontSize: 'var(--t1)', color: 'var(--text2)', background: 'var(--piste)', borderRadius: 'var(--r-full)', padding: '2px 10px', whiteSpace: 'nowrap' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 4, overflowWrap: 'anywhere', lineHeight: 1.45 },
  sousListe: { display: 'flex', flexDirection: 'column', gap: 6, padding: '0 0 12px 60px', minWidth: 0 },
  sousLigne: { display: 'flex', gap: 12, fontSize: 'var(--t1)', color: 'var(--text2)', minWidth: 0, overflowWrap: 'anywhere' },
};
