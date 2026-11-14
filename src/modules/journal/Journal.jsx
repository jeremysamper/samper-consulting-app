import React from 'react';
import { Building2, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { etablissementService, supabase } from '../../services/supabase.js';
import { roles } from '../moduleConfig.js';
import { zurichAjouterJours, zurichDateHeure, zurichLundi, zurichMinuitIso } from '../../utils/zurichTime.js';
import { Btn, Panneau, SectionHeader } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';

// Journal d'activité : qui a créé, modifié ou supprimé quoi dans les recettes,
// produits, pertes et inventaires d'un établissement, semaine par semaine.
// Alimenté par le déclencheur journal_activite_log (migration 20261015) ;
// lecture réservée au consultant et au patron par la RLS.
// La semaine en cours d'office ; semaine précédente, suivante et « Exporter »
// en gros boutons ; un autre établissement, s'il y en a plusieurs, derrière
// un bouton nommé puis une tuile (le cas rare ne pousse pas la liste).

const ACTIONS = { INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };
const COULEUR_ACTION = { INSERT: 'var(--success-text)', UPDATE: 'var(--accent)', DELETE: 'var(--danger-text)' };
// caisse : corrections d'une réservation par le service (RPC
// caisse_corriger_reservation, migration 20261110_caisse_v5).
const MODULES = { recettes: 'Recettes', produits: 'Produits', pertes: 'Pertes', inventaires: 'Inventaires', caisse: 'Caisse' };
const COLONNES = 'id, created_at, acteur_id, acteur_nom, acteur_role, module, operation, libelle, colonnes_modifiees';
const PAGE = 1000;

const libelleRole = (role) => (role ? roles[role]?.label || role : '');
const libelleActeur = (l) => l.acteur_nom || (l.acteur_id ? 'Compte inconnu' : 'Système');
// Colonnes de la base, telles que le déclencheur les relève, en mots lisibles.
// Une colonne absente de la table se lit « autre champ » ; les colonnes de
// service (date de mise à jour, auteur) ne disent rien au lecteur du journal.
const LIBELLES_CHAMPS = {
  nom: 'nom', categorie: 'catégorie', sous_categorie: 'sous-catégorie', statut: 'statut',
  portions: 'portions', prix_vente: 'prix de vente', temps_preparation: 'temps de préparation',
  temps_cuisson: 'temps de cuisson', temps_total: 'temps total', version: 'version',
  allergenes_ids: 'allergènes', allergenes: 'allergènes', notes_consultant: 'notes du consultant',
  dressage: 'dressage', conservation: 'conservation', etapes: 'étapes', ingredients: 'ingrédients',
  photo_url: 'photo', congelable: 'congelable', masquee: 'visibilité', archive: 'archivage',
  duree_vie_jours: 'durée de vie', duree_vie_congele_jours: 'durée de vie congelé',
  duree_vie_decongele_jours: 'durée de vie décongelé', date: 'date', valide_par: 'validation',
  valide: 'validation', valeur_totale: 'valeur totale', lignes: 'lignes comptées', produit: 'produit',
  quantite: 'quantité', unite: 'unité', unite_ref: 'unité', valeur_unit: 'valeur unitaire',
  motif: 'motif', declare_par: 'déclarant', commentaire: 'commentaire', prix_unitaire: 'prix unitaire',
  fournisseur_id: 'fournisseur', fournisseurs: 'fournisseurs', reference_fourn: 'référence fournisseur',
  conditionnement: 'conditionnement', actif: 'actif', notes: 'notes', strategie_prix: 'stratégie de prix',
  prix_verrouille: 'prix verrouillé', prix_maj_le: 'mise à jour du prix', zone: 'zone',
};
const CHAMPS_DE_SERVICE = new Set(['id', 'etablissement_id', 'created_at', 'updated_at', 'modifie_par']);
const libelleChamps = (l) => [...new Set((l.colonnes_modifiees || [])
  .filter((c) => !CHAMPS_DE_SERVICE.has(c))
  .map((c) => LIBELLES_CHAMPS[c] || 'autre champ'))].join(', ');

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

// Champ CSV : guillemets si besoin, et une apostrophe devant ce qu'un tableur
// prendrait pour une formule (libellés saisis par les équipes).
function champCsv(valeur) {
  let s = String(valeur ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function telechargerCsv(lignes, nomFichier) {
  const entete = ['Date', 'Heure', 'Acteur', 'Rôle', 'Module', 'Action', 'Élément', 'Champs modifiés'];
  const corps = lignes.map((l) => {
    const { date, heure } = zurichDateHeure(l.created_at);
    return [date, heure, libelleActeur(l), libelleRole(l.acteur_role), MODULES[l.module] || l.module,
      ACTIONS[l.operation] || l.operation, l.libelle || '', libelleChamps(l)];
  });
  const texte = '﻿' + [entete, ...corps].map((r) => r.map(champCsv).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Gros boutons : 48 px au doigt, texte lisible ; des pilules (Btn).
const gros = { minHeight: 48, padding: '10px 16px', fontSize: 'var(--t2)' };

export default function Journal({ user, etablissement }) {
  const lundiCourant = zurichLundi();
  const [etabs, setEtabs] = React.useState([]);
  const [etabId, setEtabId] = React.useState(etablissement?.id || '');
  const [lundi, setLundi] = React.useState(lundiCourant);
  const [lignes, setLignes] = React.useState([]);
  const [etat, setEtat] = React.useState('chargement');
  const [essai, setEssai] = React.useState(0);
  const [enExport, setEnExport] = React.useState(false);
  const [choixEtab, setChoixEtab] = React.useState(false);
  const estCourante = lundi === lundiCourant;

  React.useEffect(() => {
    if (etablissement?.id) setEtabId(etablissement.id);
  }, [etablissement?.id]);

  React.useEffect(() => {
    let actif = true;
    etablissementService.listForUser(user)
      .then((rows) => { if (actif) setEtabs(rows || []); })
      .catch(() => {});
    return () => { actif = false; };
  }, [user]);

  React.useEffect(() => {
    if (!etabId) return undefined;
    let actif = true;
    setEtat('chargement');
    chargerSemaine(etabId, lundi, estCourante)
      .then((rows) => { if (actif) { setLignes(rows); setEtat('pret'); } })
      .catch(() => { if (actif) setEtat('erreur'); });
    return () => { actif = false; };
  }, [etabId, lundi, estCourante, essai]);

  const parJour = React.useMemo(() => {
    const groupes = [];
    for (const l of lignes) {
      const { jour, heure } = zurichDateHeure(l.created_at);
      if (groupes[groupes.length - 1]?.jour !== jour) groupes.push({ jour, items: [] });
      groupes[groupes.length - 1].items.push({ ...l, heure });
    }
    return groupes;
  }, [lignes]);

  const nomEtab = etabs.find((e) => e.id === etabId)?.nom || etablissement?.nom || etabId;

  const exporter = async () => {
    if (!etabId || enExport) return;
    setEnExport(true);
    try {
      const rows = await chargerSemaine(etabId, lundi, estCourante);
      if (!rows.length) {
        notify('Aucune activité à exporter pour cette semaine.', 'info');
        return;
      }
      telechargerCsv(rows.slice().reverse(), `journal-${slug(nomEtab)}-${lundi}.csv`);
    } catch {
      notify("L'export du journal a échoué. Réessayez.", 'error');
    } finally {
      setEnExport(false);
    }
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
        {etabs.length > 1 && (
          <Btn onClick={() => setChoixEtab((v) => !v)} style={gros}>
            <Building2 size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Un autre établissement</span>
          </Btn>
        )}
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
      {choixEtab && etabs.length > 1 && (
        <AccueilModule tuiles={etabs.map((e) => ({
          id: e.id, libelle: e.nom, brut: true, Icone: Building2, etat: e.id === etabId ? 'Affiché' : null,
          onClick: () => { setEtabId(e.id); setChoixEtab(false); },
        }))} />
      )}

      {etat === 'chargement' && <Panneau><div style={js.note}>Chargement…</div></Panneau>}

      {etat === 'erreur' && (
        <Panneau>
          <div className="form-alert error" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            Le journal n'a pas pu être chargé.
            <Btn variant="primary" small onClick={() => setEssai((n) => n + 1)}>Réessayer</Btn>
          </div>
        </Panneau>
      )}

      {etat === 'pret' && lignes.length === 0 && (
        <Panneau><div style={js.note}>Aucune activité enregistrée cette semaine.</div></Panneau>
      )}

      {etat === 'pret' && parJour.length > 0 && (
        <Panneau style={js.registre}>
          {parJour.map((g, i) => (
            <div key={g.jour} style={js.jour}>
              <div style={{ ...js.jourTitre, ...(i === 0 ? { paddingTop: 4 } : null) }}>
                {libelleJour(g.jour)}
              </div>
              {g.items.map((l, j) => (
                <div key={l.id} style={{ ...js.ligne, ...(i === parJour.length - 1 && j === g.items.length - 1 ? js.derniere : null) }}>
                  <div style={js.heure}>{l.heure}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={js.titreLigne}>
                      <span style={{ fontWeight: 'var(--g2)' }}>{l.libelle || 'Sans nom'}</span>
                      <span style={js.module}>{MODULES[l.module] || l.module}</span>
                    </div>
                    <div style={js.detail}>
                      <span style={{ color: COULEUR_ACTION[l.operation], fontWeight: 'var(--g2)' }}>{ACTIONS[l.operation] || l.operation}</span>
                      {' par '}{libelleActeur(l)}
                      {l.acteur_role ? ` (${libelleRole(l.acteur_role)})` : ''}
                      {libelleChamps(l) ? <>, champs : {libelleChamps(l)}</> : ''}
                    </div>
                  </div>
                </div>
              ))}
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
  registre: { padding: '8px 20px 4px' },
  jour: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  jourTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '16px 0 6px' },
  ligne: {
    display: 'flex', gap: 12, padding: '10px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  derniere: { borderBottomWidth: 0 },
  heure: { fontFamily: 'var(--font-num)', fontSize: 'var(--t2)', color: 'var(--text2)', flexShrink: 0, width: 48 },
  titreLigne: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 8px', fontSize: 'var(--t2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  module: { fontSize: 'var(--t1)', color: 'var(--text2)', background: 'var(--piste)', borderRadius: 'var(--r-full)', padding: '2px 10px', whiteSpace: 'nowrap' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 4, overflowWrap: 'anywhere', lineHeight: 1.45 },
};
