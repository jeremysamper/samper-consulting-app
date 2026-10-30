import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Données de la Comptabilité : les six tables neuves de la migration
// 20261030_comptabilite (ventes_jour, charges_fixes, salaires_estimes,
// compta_reglages, releves_bancaires, releve_lignes), lues et écrites par le
// client Supabase (legacySupabase.js n'en sait rien), sur le modèle de
// planning/contratsService.js.
//
// Statut d'une lecture : 'loading' | 'ready' | 'error' | 'absente' |
// 'inactif'. 'absente' tant que la migration n'est pas appliquée : l'écran
// le dit, il n'affiche jamais une liste vide à la place. Une relecture en
// échec garde la liste précédente et lève `enEchec` (BandeauNonActualise) ;
// 'error' seulement avant la première lecture réussie. Nouvel essai après 4 s,
// puis de plus en plus espacé jusqu'à 30 s.
//
// Écritures : chacune rend { error } en clair (null si tout va bien). Les
// droits de colonnes de la migration ne laissent modifier ni l'établissement,
// ni la date, ni le taux d'une vente : le chiffre du jour et les réglages
// s'écrivent par une mise à jour puis, s'il n'y avait rien, une création
// (un upsert PostgREST remettrait aussi la clé dans son « DO UPDATE SET »,
// refusé par ces droits).
// ─────────────────────────────────────────────────────────────────────────────

export const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const PAGE = 1000;
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

export const MESSAGE_ABSENTE = 'La comptabilité n\'est pas encore activée sur la base de données.';

export function messageCompta(error, { salaires = false } = {}) {
  console.error('[comptabilité] erreur Supabase', error);
  const code = String(error?.code || '');
  if (RELATION_ABSENTE.has(code)) return MESSAGE_ABSENTE;
  if (code === '42501') {
    return salaires
      ? 'Seuls le patron et le consultant peuvent saisir les salaires.'
      : 'Seule une personne qui règle les factures peut enregistrer ces chiffres.';
  }
  if (code === '23505' && salaires) return 'Cette personne a déjà un salaire sans date de fin : indiquez d\'abord la fin de l\'ancien.';
  if (code === '23514') return 'Valeur refusée : un montant positif et des dates dans l\'ordre.';
  return 'Erreur technique. Réessayez ou contactez le support.';
}

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const texte = (v) => (v == null ? null : String(v).trim() || null);

// ── Correspondances base / écran ──
export const MAPPERS = {
  ventes_jour: (r) => ({
    id: r.id, etablissementId: r.etablissement_id, jour: r.jour, taux: Number(r.taux),
    montantTtc: Number(r.montant_ttc), source: r.source || 'manuel', note: r.note || '',
  }),
  charges_fixes: (r) => ({
    id: r.id, etablissementId: r.etablissement_id, libelle: r.libelle || '', categorie: r.categorie || 'autre',
    montant: Number(r.montant), tvaTaux: nombre(r.tva_taux), periodicite: r.periodicite || 'mensuelle',
    jourEcheance: nombre(r.jour_echeance), debut: r.debut, fin: r.fin || null,
    fournisseur: r.fournisseur || '', note: r.note || '',
  }),
  salaires_estimes: (r) => ({
    id: r.id, etablissementId: r.etablissement_id, profileId: r.profile_id, mode: r.mode,
    montant: Number(r.montant), treizieme: r.treizieme !== false, debut: r.debut, fin: r.fin || null, note: r.note || '',
  }),
  compta_reglages: (r) => ({
    etablissementId: r.etablissement_id, methodeTva: r.methode_tva || 'effective', tauxTdfn: nombre(r.taux_tdfn),
    chargesSocialesPct: nombre(r.charges_sociales_pct) ?? 16, coutHoraireMoyen: nombre(r.cout_horaire_moyen),
  }),
  releves_bancaires: (r) => ({
    id: r.id, etablissementId: r.etablissement_id, format: r.format, nomFichier: r.nom_fichier || '', iban: r.iban || '',
    dateDebut: r.date_debut || null, dateFin: r.date_fin || null, soldeDebut: nombre(r.solde_debut), soldeFin: nombre(r.solde_fin),
    nbLignes: Number(r.nb_lignes) || 0, createdAt: r.created_at,
  }),
  releve_lignes: (r) => ({
    id: r.id, etablissementId: r.etablissement_id, releveId: r.releve_id, cle: r.cle,
    dateOperation: r.date_operation, dateValeur: r.date_valeur || null, montant: Number(r.montant), devise: r.devise || 'CHF',
    libelle: r.libelle || '', contrepartie: r.contrepartie || '', reference: r.reference || '',
    documentId: r.document_id || null, rapprochement: r.rapprochement || null, rapprocheLe: r.rapproche_le || null,
    rapprochePar: r.rapproche_par || null, ignoree: !!r.ignoree, note: r.note || '',
  }),
};

// Réglages par défaut tant qu'aucune ligne n'est enregistrée (D14, D16).
export const REGLAGES_DEFAUT = { methodeTva: 'effective', tauxTdfn: null, chargesSocialesPct: 16, coutHoraireMoyen: null };

// ─── Lecture générique ───────────────────────────────────────────────────────
// `cle` : la lecture repart de zéro quand elle change (établissement, période).
// `lire` : async () => données ; lève l'erreur Supabase en cas d'échec.
// `tables` : relecture sur changement realtime et au réveil de l'appareil.
export function useLecture(cle, lire, { actif = true, tables = [] } = {}) {
  const [etat, setEtat] = useState({ data: null, status: actif ? 'loading' : 'inactif', enEchec: false });
  const lireRef = useRef(lire);
  lireRef.current = lire;
  const reloadRef = useRef(() => Promise.resolve());
  const tablesCle = tables.join(',');

  useEffect(() => {
    if (!actif) {
      setEtat({ data: null, status: 'inactif', enEchec: false });
      reloadRef.current = () => Promise.resolve();
      return undefined;
    }
    let vivant = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let luUneFois = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      try {
        const data = await lireRef.current();
        if (!vivant) return;
        luUneFois = true;
        retryDelay = RETRY_MIN_MS;
        setEtat({ data, status: 'ready', enEchec: false });
      } catch (error) {
        if (!vivant) return;
        if (RELATION_ABSENTE.has(String(error?.code || ''))) {
          setEtat({ data: null, status: 'absente', enEchec: false });
          return;
        }
        console.error('[comptabilité] lecture', cle, error);
        setEtat(prev => (luUneFois ? { ...prev, enEchec: true } : { data: null, status: 'error', enEchec: false }));
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      }
    };

    reloadRef.current = reload;
    setEtat({ data: null, status: 'loading', enEchec: false });
    reload();

    const realtime = dbService.getRealtime();
    const unsub = tablesCle && realtime?.subscribeReload
      ? realtime.subscribeReload(tablesCle.split(','), () => { if (vivant) reload(); })
      : null;
    return () => {
      vivant = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [cle, actif, tablesCle]);

  const reload = useCallback(() => reloadRef.current(), []);
  return { ...etat, reload };
}

// Toutes les lignes d'une requête, par pages de 1 000 (PostgREST n'en rend
// pas plus d'un coup). `requete(de, a)` construit la requête d'une page.
export async function lireToutesLesPages(requete) {
  const out = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await requete(de, de + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Une table de la Comptabilité pour un établissement, bornée par dates si
// `colonneDate` est donnée.
//   → { lignes, status, enEchec, reload }
export function useTableCompta(table, etabId, { debut = null, fin = null, colonneDate = null, actif = true, ordre = ['id'] } = {}) {
  const ordreCle = ordre.join(',');
  const lire = useCallback(() => lireToutesLesPages((de, a) => {
    let q = supabase.from(table).select('*').eq('etablissement_id', etabId);
    if (colonneDate && debut) q = q.gte(colonneDate, debut);
    if (colonneDate && fin) q = q.lte(colonneDate, fin);
    ordreCle.split(',').forEach((col) => { q = q.order(col); });
    return q.range(de, a);
  }), [table, etabId, debut, fin, colonneDate, ordreCle]);
  const { data, status, enEchec, reload } = useLecture(
    `${table}|${etabId}|${debut}|${fin}`,
    lire,
    { actif: actif && !!etabId, tables: [table] },
  );
  const lignes = useMemo(() => (data || []).map(MAPPERS[table] || ((r) => r)), [data, table]);
  return { lignes, status, enEchec, reload };
}

// ─── Écritures ───────────────────────────────────────────────────────────────

// Chiffre d'affaires d'un jour, TVA comprise, par taux : { '8.1': 2650,
// '2.6': 190, '3.8': '' }. Un taux vidé est retiré pour ce jour.
export async function enregistrerChiffreJour(etabId, jour, valeurs) {
  for (const [cle, valeur] of Object.entries(valeurs || {})) {
    const taux = Number(cle);
    const montant = nombre(valeur);
    const filtre = (q) => q.eq('etablissement_id', etabId).eq('jour', jour).eq('taux', taux);
    if (montant == null) {
      const { error } = await filtre(supabase.from('ventes_jour').delete());
      if (error) return { error: messageCompta(error) };
      continue;
    }
    const maj = () => filtre(supabase.from('ventes_jour').update({ montant_ttc: montant })).select('id');
    let { data, error } = await maj();
    if (error) return { error: messageCompta(error) };
    if (!data || !data.length) {
      const ins = await supabase.from('ventes_jour').insert({ etablissement_id: etabId, jour, taux, montant_ttc: montant, source: 'manuel' });
      // Saisi au même moment sur un autre appareil : on met à jour sa ligne.
      if (ins.error && String(ins.error.code) === '23505') ({ error } = await maj());
      else error = ins.error;
      if (error) return { error: messageCompta(error) };
    }
  }
  return { error: null };
}

// Colonnes modifiables d'une charge (droits de colonnes en base).
const colonnesCharge = (c) => ({
  libelle: String(c.libelle || '').trim(),
  categorie: c.categorie || 'autre',
  montant: Number(c.montant),
  tva_taux: nombre(c.tvaTaux),
  periodicite: c.periodicite || 'mensuelle',
  jour_echeance: nombre(c.jourEcheance),
  debut: c.debut,
  fin: c.fin || null,
  fournisseur: texte(c.fournisseur),
  note: texte(c.note),
});

// Crée (sans id) ou modifie une charge fixe.
export async function enregistrerCharge(etabId, charge) {
  const { error } = charge.id
    ? await supabase.from('charges_fixes').update(colonnesCharge(charge)).eq('id', charge.id)
    : await supabase.from('charges_fixes').insert({ etablissement_id: etabId, ...colonnesCharge(charge) });
  return { error: error ? messageCompta(error) : null };
}

export async function cloreCharge(id, fin) {
  const { error } = await supabase.from('charges_fixes').update({ fin }).eq('id', id);
  return { error: error ? messageCompta(error) : null };
}

export async function supprimerCharge(id) {
  const { error } = await supabase.from('charges_fixes').delete().eq('id', id);
  return { error: error ? messageCompta(error) : null };
}

const colonnesSalaire = (s) => ({
  mode: s.mode === 'horaire' ? 'horaire' : 'mensuel',
  montant: Number(s.montant),
  treizieme: s.mode === 'horaire' ? false : s.treizieme !== false,
  debut: s.debut,
  fin: s.fin || null,
  note: texte(s.note),
});

// Crée (sans id) ou modifie le salaire estimé d'une personne.
export async function enregistrerSalaire(etabId, salaire) {
  const { error } = salaire.id
    ? await supabase.from('salaires_estimes').update(colonnesSalaire(salaire)).eq('id', salaire.id)
    : await supabase.from('salaires_estimes').insert({ etablissement_id: etabId, profile_id: salaire.profileId, ...colonnesSalaire(salaire) });
  return { error: error ? messageCompta(error, { salaires: true }) : null };
}

export async function cloreSalaire(id, fin) {
  const { error } = await supabase.from('salaires_estimes').update({ fin }).eq('id', id);
  return { error: error ? messageCompta(error, { salaires: true }) : null };
}

// Réglages de l'établissement, au nom de qui les enregistre (updated_by).
export async function enregistrerReglages(etabId, reglages, userId) {
  const colonnes = {
    methode_tva: reglages.methodeTva === 'tdfn' ? 'tdfn' : 'effective',
    taux_tdfn: reglages.methodeTva === 'tdfn' ? nombre(reglages.tauxTdfn) : null,
    charges_sociales_pct: nombre(reglages.chargesSocialesPct) ?? 16,
    cout_horaire_moyen: nombre(reglages.coutHoraireMoyen),
    updated_by: userId,
  };
  const maj = () => supabase.from('compta_reglages').update(colonnes).eq('etablissement_id', etabId).select('etablissement_id');
  let { data, error } = await maj();
  if (error) return { error: messageCompta(error) };
  if (!data || !data.length) {
    const ins = await supabase.from('compta_reglages').insert({ etablissement_id: etabId, ...colonnes });
    if (ins.error && String(ins.error.code) === '23505') ({ error } = await maj());
    else error = ins.error;
    if (error) return { error: messageCompta(error) };
  }
  return { error: null };
}

// Relevé bancaire : le relevé, puis ses lignes ; une ligne déjà importée (même
// clé) est ignorée. Un relevé dont toutes les lignes étaient déjà là n'est pas
// gardé. → { releveId, ajoutees, dejaLa, error }
export async function importerReleve(etabId, entete, lignes) {
  const { data: releve, error } = await supabase.from('releves_bancaires').insert({
    etablissement_id: etabId,
    format: entete.format === 'csv' ? 'csv' : 'camt053',
    nom_fichier: texte(entete.nomFichier),
    iban: texte(entete.iban),
    date_debut: entete.dateDebut || null,
    date_fin: entete.dateFin || null,
    solde_debut: nombre(entete.soldeDebut),
    solde_fin: nombre(entete.soldeFin),
    nb_lignes: (lignes || []).length,
  }).select('id').single();
  if (error) return { releveId: null, ajoutees: 0, dejaLa: 0, error: messageCompta(error) };
  const rows = (lignes || []).map(l => ({
    etablissement_id: etabId,
    releve_id: releve.id,
    cle: l.cle,
    date_operation: l.dateOperation,
    date_valeur: l.dateValeur || null,
    montant: Number(l.montant),
    devise: l.devise || 'CHF',
    libelle: texte(l.libelle),
    contrepartie: texte(l.contrepartie),
    reference: texte(l.reference),
  }));
  let ajoutees = 0;
  for (let i = 0; i < rows.length; i += PAGE) {
    const { data, error: errLignes } = await supabase.from('releve_lignes')
      .upsert(rows.slice(i, i + PAGE), { onConflict: 'etablissement_id,cle', ignoreDuplicates: true })
      .select('id');
    if (errLignes) return { releveId: releve.id, ajoutees, dejaLa: 0, error: messageCompta(errLignes) };
    ajoutees += (data || []).length;
  }
  if (!ajoutees) await supabase.from('releves_bancaires').delete().eq('id', releve.id);
  return { releveId: ajoutees ? releve.id : null, ajoutees, dejaLa: rows.length - ajoutees, error: null };
}

// Rapproche une ligne de relevé d'une pièce d'achat ('auto' | 'manuel').
export async function lierLigne(ligneId, documentId, mode, userId) {
  const { error } = await supabase.from('releve_lignes').update({
    document_id: documentId,
    rapprochement: mode === 'auto' ? 'auto' : 'manuel',
    rapproche_le: new Date().toISOString(),
    rapproche_par: userId || null,
  }).eq('id', ligneId);
  // Index unique sur document_id : la facture a été liée ailleurs entre-temps.
  if (error && String(error.code) === '23505') return { error: 'Cette facture est déjà rapprochée d\'une autre ligne du relevé.' };
  return { error: error ? messageCompta(error) : null };
}

// Rapproche des lignes de relevé de leurs factures, après un geste explicite
// (« Valider les rapprochements », « Confirmer », « Choisir la facture »).
// Une facture encore à régler est d'abord marquée réglée à la date de la
// ligne, par virement, note « Relevé bancaire », par le même appel que
// Factures & achats ; option `nouveau` : un règlement posé entre-temps sur un
// autre appareil n'est pas écrasé. Aucune autre colonne de la facture n'est
// écrite. Puis chaque ligne reçoit sa facture.
//   paires : [{ ligne, facture }] → { liees, reglees, error }
export async function rapprocher(paires, mode, userId) {
  const legacySB = dbService.getBridge();
  const parDate = new Map();
  (paires || []).filter(p => !p.facture.regleLe).forEach((p) => {
    const date = p.ligne.dateOperation;
    if (!parDate.has(date)) parDate.set(date, []);
    if (!parDate.get(date).includes(p.facture.id)) parDate.get(date).push(p.facture.id);
  });
  let reglees = 0;
  try {
    for (const [date, ids] of parDate) {
      const faites = await legacySB.db.reglerFacturesAchat(ids, { regleLe: date, regleMode: 'virement', regleNote: 'Relevé bancaire' }, { nouveau: true });
      reglees += (faites || []).length;
    }
  } catch (error) {
    return { liees: 0, reglees, error: messageCompta(error) };
  }
  let liees = 0;
  for (const p of paires || []) {
    const { error } = await lierLigne(p.ligne.id, p.facture.id, mode, userId);
    if (error) return { liees, reglees, error };
    liees += 1;
  }
  return { liees, reglees, error: null };
}

export async function delierLigne(ligneId) {
  const { error } = await supabase.from('releve_lignes')
    .update({ document_id: null, rapprochement: null, rapproche_le: null, rapproche_par: null })
    .eq('id', ligneId);
  return { error: error ? messageCompta(error) : null };
}

export async function ignorerLigne(ligneId, oui) {
  const { error } = await supabase.from('releve_lignes').update({ ignoree: !!oui }).eq('id', ligneId);
  return { error: error ? messageCompta(error) : null };
}
