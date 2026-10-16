import React from 'react';
import { etablissementService, supabase } from '../../services/supabase.js';
import { roles } from '../moduleConfig.js';
import { zurichAjouterJours, zurichDateHeure, zurichLundi, zurichMinuitIso } from '../../utils/zurichTime.js';
import { Btn, SectionHeader } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';

// Journal d'activité : qui a créé, modifié ou supprimé quoi dans les recettes,
// produits, pertes et inventaires d'un établissement, semaine par semaine.
// Alimenté par le déclencheur journal_activite_log (migration 20261015) ;
// lecture réservée au consultant et au patron par la RLS.

const ACTIONS = { INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };
const COULEUR_ACTION = { INSERT: 'var(--success-text)', UPDATE: 'var(--accent)', DELETE: 'var(--danger-text)' };
const MODULES = { recettes: 'Recettes', produits: 'Produits', pertes: 'Pertes', inventaires: 'Inventaires' };
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

const selectStyle = {
  height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13,
  maxWidth: '100%', minWidth: 0,
};

export default function Journal({ user, etablissement }) {
  const lundiCourant = zurichLundi();
  const [etabs, setEtabs] = React.useState([]);
  const [etabId, setEtabId] = React.useState(etablissement?.id || '');
  const [lundi, setLundi] = React.useState(lundiCourant);
  const [lignes, setLignes] = React.useState([]);
  const [etat, setEtat] = React.useState('chargement');
  const [essai, setEssai] = React.useState(0);
  const [enExport, setEnExport] = React.useState(false);
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      <SectionHeader
        sub="Créations, modifications et suppressions dans les recettes, produits, pertes et inventaires."
        style={{ marginBottom: 0 }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <select
          value={etabId}
          onChange={(e) => setEtabId(e.target.value)}
          aria-label="Établissement"
          disabled={etabs.length < 2}
          style={selectStyle}
        >
          {!etabs.some((e) => e.id === etabId) && etabId ? <option value={etabId}>{nomEtab}</option> : null}
          {etabs.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
          <Btn small onClick={() => setLundi(zurichAjouterJours(lundi, -7))} ariaLabel="Semaine précédente" title="Semaine précédente">‹</Btn>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-num)' }}>{libelleSemaine(lundi)}</span>
          <Btn small disabled={estCourante} onClick={() => setLundi(zurichAjouterJours(lundi, 7))} ariaLabel="Semaine suivante" title="Semaine suivante">›</Btn>
          {!estCourante && <Btn small onClick={() => setLundi(lundiCourant)}>Cette semaine</Btn>}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <Btn variant="primary" small onClick={exporter} disabled={enExport || etat !== 'pret'}>
            {enExport ? 'Export en cours…' : 'Export CSV'}
          </Btn>
        </div>
      </div>

      {etat === 'chargement' && <div style={{ fontSize: 13, color: 'var(--text2)' }}>Chargement…</div>}

      {etat === 'erreur' && (
        <div className="form-alert error" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          Le journal n'a pas pu être chargé.
          <Btn variant="primary" small onClick={() => setEssai((n) => n + 1)}>Réessayer</Btn>
        </div>
      )}

      {etat === 'pret' && lignes.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text2)' }}>Aucune activité enregistrée cette semaine.</div>
      )}

      {etat === 'pret' && parJour.map((g) => (
        <div key={g.jour} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            {libelleJour(g.jour)}
          </div>
          {g.items.map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-num)', fontSize: 13, color: 'var(--text2)', flexShrink: 0, width: 44 }}>{l.heure}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                  <span style={{ fontWeight: 500 }}>{l.libelle || 'Sans nom'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{MODULES[l.module] || l.module}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, overflowWrap: 'anywhere' }}>
                  <span style={{ color: COULEUR_ACTION[l.operation], fontWeight: 500 }}>{ACTIONS[l.operation] || l.operation}</span>
                  {' par '}{libelleActeur(l)}
                  {l.acteur_role ? ` (${libelleRole(l.acteur_role)})` : ''}
                  {libelleChamps(l) ? <>, champs : {libelleChamps(l)}</> : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
