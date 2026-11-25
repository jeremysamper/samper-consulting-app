import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { toutesLesPages } from '../utils/lirePages.js';
import { dbService } from '../services/dbService.js';
import { lignesEnregistrables } from '../modules/groupes/facturation/calculs.js';

// ─────────────────────────────────────────────────────────────────────────────
// useFacturationGroupes : devis, factures et paiements des groupes d'un
// établissement, et son identité de facturation (migration 20261123).
//
// `status` dit ce qu'on détient réellement, comme useGroupes :
//   'loading' aucune lecture n'a encore abouti
//   'ready'   données fiables (les listes peuvent être vides)
//   'error'   la première lecture a échoué, rien à afficher
//   'absent'  tables absentes (migration non appliquée)
// Une lecture en échec ne vide jamais ce qui est affiché : elle réessaie. Une
// liste vide rendue par une erreur se lirait « aucune facture » à tort.
//
// Les numéros, totaux, montants, horodatages et auteurs sont posés par la
// base : chaque écriture relit la ligne rendue et la remplace dans l'état.
// ─────────────────────────────────────────────────────────────────────────────

const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;
const TABLES = ['groupe_devis', 'groupe_factures', 'groupe_paiements'];

const MESSAGES_ERREUR = {
  '23503': 'Ce document est encore lié à des factures ou à des paiements.',
  '23505': 'Ce numéro existe déjà.',
  '23514': 'Une des valeurs saisies est refusée.',
};

function messageErreur(error) {
  if (!error) return null;
  console.error('[useFacturationGroupes] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return "Les devis et factures ne sont pas encore activés sur la base de données.";
  // Les gardes de la base disent en clair ce qu'elles refusent (42501 + message
  // en français) ; une policy RLS refusée ne dit que « row-level security ».
  if (String(error.code) === '42501') {
    const m = String(error.message || '');
    return /row-level security|permission denied/i.test(m) ? "Vous n'avez pas les droits pour cette action." : m;
  }
  return MESSAGES_ERREUR[String(error.code || '')] || 'Erreur technique. Réessayez ou contactez le support.';
}

const texte = (v) => { const t = String(v ?? '').trim(); return t || null; };
const date = (v) => (v ? String(v).slice(0, 10) : null);

// ── Correspondances base ↔ app ───────────────────────────────────────────────
export function mapDevisFromDB(r) {
  if (!r) return null;
  return {
    id: r.id,
    etablissementId: r.etablissement_id,
    numero: r.numero || '',
    groupeEvenementId: r.groupe_evenement_id || null,
    statut: r.statut || 'brouillon',
    titre: r.titre || '',
    clientNom: r.client_nom || '',
    clientContact: r.client_contact || '',
    clientEmail: r.client_email || '',
    clientTelephone: r.client_telephone || '',
    clientAdresse: r.client_adresse || '',
    typeGroupe: r.type_groupe || '',
    dateEvenement: r.date_evenement || '',
    heure: r.heure ? String(r.heure).slice(0, 5) : '',
    nbPax: r.nb_pax ?? null,
    menuNumero: r.menu_numero ?? null,
    lignes: Array.isArray(r.lignes) ? r.lignes : [],
    total: Number(r.total) || 0,
    dateDevis: r.date_devis || '',
    valideJusqu: r.valide_jusqu || '',
    conditions: r.conditions || '',
    notes: r.notes || '',
    envoyeLe: r.envoye_le || null,
    accepteLe: r.accepte_le || null,
    refuseLe: r.refuse_le || null,
    createdAt: r.created_at || null,
  };
}

export function devisVersDB(d) {
  return {
    titre: texte(d.titre),
    client_nom: String(d.clientNom || '').trim(),
    client_contact: texte(d.clientContact),
    client_email: texte(d.clientEmail),
    client_telephone: texte(d.clientTelephone),
    client_adresse: texte(d.clientAdresse),
    type_groupe: d.typeGroupe || null,
    date_evenement: date(d.dateEvenement),
    heure: d.heure || null,
    nb_pax: Number(d.nbPax) > 0 ? Math.round(Number(d.nbPax)) : null,
    menu_numero: Number(d.menuNumero) > 0 ? Number(d.menuNumero) : null,
    lignes: lignesEnregistrables(d.lignes),
    date_devis: date(d.dateDevis) || undefined,
    valide_jusqu: date(d.valideJusqu),
    conditions: texte(d.conditions),
    notes: texte(d.notes),
  };
}

export function mapFactureFromDB(r) {
  if (!r) return null;
  return {
    id: r.id,
    etablissementId: r.etablissement_id,
    numero: r.numero || '',
    devisId: r.devis_id || null,
    groupeEvenementId: r.groupe_evenement_id || null,
    type: r.type || 'totale',
    libelle: r.libelle || '',
    ordre: Number(r.ordre) || 1,
    statut: r.statut || 'prevue',
    titre: r.titre || '',
    clientNom: r.client_nom || '',
    clientContact: r.client_contact || '',
    clientEmail: r.client_email || '',
    clientAdresse: r.client_adresse || '',
    lignes: Array.isArray(r.lignes) ? r.lignes : [],
    montant: Number(r.montant) || 0,
    dateFacture: r.date_facture || '',
    echeance: r.echeance || '',
    modePrevu: r.mode_prevu || 'virement',
    mention: r.mention || '',
    envoyeeLe: r.envoyee_le || null,
    relances: Array.isArray(r.relances) ? r.relances : [],
    emiseLe: r.emise_le || null,
    annuleeLe: r.annulee_le || null,
    motifAnnulation: r.motif_annulation || '',
    notes: r.notes || '',
    createdAt: r.created_at || null,
  };
}

// Contenu d'une facture prévue (tout) ; une facture émise n'envoie que ce que
// la base laisse bouger (voir majFacture).
export function factureVersDB(f) {
  return {
    devis_id: f.devisId || null,
    groupe_evenement_id: f.groupeEvenementId || null,
    type: f.type || 'totale',
    libelle: texte(f.libelle),
    ordre: Number(f.ordre) > 0 ? Math.min(99, Math.round(Number(f.ordre))) : 1,
    titre: texte(f.titre),
    client_nom: String(f.clientNom || '').trim(),
    client_contact: texte(f.clientContact),
    client_email: texte(f.clientEmail),
    client_adresse: texte(f.clientAdresse),
    lignes: lignesEnregistrables(f.lignes),
    date_facture: date(f.dateFacture),
    echeance: date(f.echeance),
    mode_prevu: f.modePrevu || 'virement',
    mention: texte(f.mention),
    notes: texte(f.notes),
  };
}

export function mapPaiementFromDB(r) {
  if (!r) return null;
  return {
    id: r.id,
    etablissementId: r.etablissement_id,
    factureId: r.facture_id,
    datePaiement: r.date_paiement || '',
    montant: Number(r.montant) || 0,
    mode: r.mode || 'virement',
    reference: r.reference || '',
    note: r.note || '',
    createdAt: r.created_at || null,
  };
}

export function mapReglagesFromDB(r) {
  return {
    raisonSociale: r?.raison_sociale || '',
    rue: r?.rue || '',
    numero: r?.numero || '',
    npa: r?.npa || '',
    localite: r?.localite || '',
    pays: r?.pays || 'CH',
    telephone: r?.telephone || '',
    email: r?.email || '',
    iban: r?.iban || '',
    assujettiTva: r ? r.assujetti_tva !== false : true,
    numeroTva: r?.numero_tva || '',
    delaiPaiementJours: r?.delai_paiement_jours ?? 30,
    validiteDevisJours: r?.validite_devis_jours ?? 30,
    acomptePct: r?.acompte_pct != null ? Number(r.acompte_pct) : 30,
    conditions: r?.conditions || '',
    mentionFacture: r?.mention_facture || '',
    enregistre: !!r,
  };
}

export function reglagesVersDB(g) {
  const entier = (v, d, min, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  return {
    raison_sociale: texte(g.raisonSociale),
    rue: texte(g.rue),
    numero: texte(g.numero),
    npa: texte(g.npa),
    localite: texte(g.localite),
    pays: /^[A-Z]{2}$/.test(String(g.pays || '').toUpperCase()) ? String(g.pays).toUpperCase() : 'CH',
    telephone: texte(g.telephone),
    email: texte(g.email),
    iban: texte(String(g.iban || '').toUpperCase().replace(/\s+/g, '')),
    assujetti_tva: g.assujettiTva !== false,
    numero_tva: texte(g.numeroTva),
    delai_paiement_jours: entier(g.delaiPaiementJours, 30, 0, 365),
    validite_devis_jours: entier(g.validiteDevisJours, 30, 1, 365),
    acompte_pct: Math.min(100, Math.max(0, Number(g.acomptePct) || 0)),
    conditions: texte(g.conditions),
    mention_facture: texte(g.mentionFacture),
  };
}

// Identité de facturation seule : la page des réglages la lit sans charger les
// listes. Rend { data, error } ; data = valeurs par défaut sans ligne.
export async function lireReglagesFacturation(etablissementId) {
  const { data, error } = await supabase.from('facturation_reglages')
    .select('*').eq('etablissement_id', etablissementId).maybeSingle();
  if (error) return { data: null, error: messageErreur(error), code: error.code };
  return { data: mapReglagesFromDB(data), error: null };
}

export async function enregistrerReglagesFacturation(etablissementId, reglages) {
  const { data, error } = await supabase.from('facturation_reglages')
    .upsert({ etablissement_id: etablissementId, ...reglagesVersDB(reglages) }, { onConflict: 'etablissement_id' })
    .select().single();
  if (error) return { data: null, error: messageErreur(error) };
  return { data: mapReglagesFromDB(data), error: null };
}

const lireTable = (table, etablissementId, ordre) => toutesLesPages((de, a) => supabase
  .from(table).select('*').eq('etablissement_id', etablissementId)
  .order(ordre, { ascending: false, nullsFirst: true })
  .order('created_at', { ascending: false })
  .range(de, a));

export function useFacturationGroupes(etablissementId, { actif = true } = {}) {
  const [devis, setDevis] = useState([]);
  const [factures, setFactures] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [reglages, setReglages] = useState(() => mapReglagesFromDB(null));
  const [status, setStatus] = useState(etablissementId && actif ? 'loading' : 'ready');
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!etablissementId || !actif) {
      setDevis([]); setFactures([]); setPaiements([]);
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const [rd, rf, rp, rr] = await Promise.all([
        lireTable('groupe_devis', etablissementId, 'date_devis'),
        lireTable('groupe_factures', etablissementId, 'date_facture'),
        lireTable('groupe_paiements', etablissementId, 'date_paiement'),
        lireReglagesFacturation(etablissementId),
      ]);
      if (!mounted) return;
      const erreur = rd.error || rf.error || rp.error;
      if (erreur || rr.error) {
        const code = erreur?.code || rr.code;
        if (RELATION_ABSENTE.has(code)) {
          setStatus('absent');
          return;
        }
        console.error('[useFacturationGroupes] lecture', erreur || rr.error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }
      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setDevis((rd.data || []).map(mapDevisFromDB));
      setFactures((rf.data || []).map(mapFactureFromDB));
      setPaiements((rp.data || []).map(mapPaiementFromDB));
      setReglages(rr.data);
      setStatus('ready');
    };

    reloadRef.current = reload;
    setStatus('loading');
    reload();

    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload(TABLES, () => { if (mounted) reload(); })
      : null;

    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [etablissementId, actif]);

  const reload = useCallback(() => reloadRef.current?.(), []);

  const actions = useMemo(() => {
    const remplacerDans = (setter, map) => (row) => {
      const x = map(row);
      if (!x) return x;
      setter((liste) => [x, ...liste.filter((y) => y.id !== x.id)]);
      return x;
    };
    const posDevis = remplacerDans(setDevis, mapDevisFromDB);
    const posFacture = remplacerDans(setFactures, mapFactureFromDB);
    const posPaiement = remplacerDans(setPaiements, mapPaiementFromDB);

    async function ecrire(requete, poser) {
      const { data, error } = await requete.select().single();
      if (error) return { data: null, error: messageErreur(error) };
      return { data: poser(data), error: null };
    }

    return {
      creerDevis: (d) => ecrire(
        supabase.from('groupe_devis').insert({
          ...devisVersDB(d),
          etablissement_id: etablissementId,
          groupe_evenement_id: d.groupeEvenementId || null,
          statut: 'brouillon',
        }),
        posDevis,
      ),
      modifierDevis: (id, d) => ecrire(supabase.from('groupe_devis').update(devisVersDB(d)).eq('id', id), posDevis),
      // Notes internes : la seule écriture permise sur un devis accepté, avec le
      // statut et le lien vers le groupe.
      notesDevis: (id, notes) => ecrire(supabase.from('groupe_devis').update({ notes: texte(notes) }).eq('id', id), posDevis),
      changerStatutDevis: (id, statut) => ecrire(supabase.from('groupe_devis').update({ statut }).eq('id', id), posDevis),
      relierDevis: (id, groupeEvenementId) => ecrire(
        supabase.from('groupe_devis').update({ groupe_evenement_id: groupeEvenementId || null }).eq('id', id),
        posDevis,
      ),
      async supprimerDevis(id) {
        const { data, error } = await supabase.from('groupe_devis').delete().eq('id', id).select('id');
        if (error) return { error: messageErreur(error) };
        if (!data?.length) return { error: "Vous n'avez pas les droits pour cette action." };
        setDevis((l) => l.filter((x) => x.id !== id));
        return { error: null };
      },

      // Plusieurs tranches d'un coup : insérées une par une, dans l'ordre, pour
      // que les numéros suivent l'ordre des tranches. Une tranche refusée
      // arrête la suite ; celles déjà créées restent et sont rendues.
      async creerFactures(liste) {
        const creees = [];
        for (const f of liste) {
          const { data, error } = await supabase.from('groupe_factures').insert({
            ...factureVersDB(f),
            etablissement_id: etablissementId,
            statut: f.statut === 'emise' ? 'emise' : 'prevue',
          }).select().single();
          if (error) return { data: creees, error: messageErreur(error) };
          creees.push(posFacture(data));
        }
        return { data: creees, error: null };
      },
      modifierFacturePrevue: (id, f) => ecrire(supabase.from('groupe_factures').update(factureVersDB(f)).eq('id', id), posFacture),
      // Une facture émise : seuls ces champs bougent (garde en base).
      majFacture: (id, champs) => {
        const permis = {};
        if ('echeance' in champs) permis.echeance = date(champs.echeance);
        if ('modePrevu' in champs) permis.mode_prevu = champs.modePrevu;
        if ('envoyeeLe' in champs) permis.envoyee_le = champs.envoyeeLe;
        if ('relances' in champs) permis.relances = champs.relances;
        if ('notes' in champs) permis.notes = texte(champs.notes);
        return ecrire(supabase.from('groupe_factures').update(permis).eq('id', id), posFacture);
      },
      emettreFacture: (id, f) => ecrire(
        supabase.from('groupe_factures').update({ ...factureVersDB(f), statut: 'emise' }).eq('id', id),
        posFacture,
      ),
      annulerFacture: (id, motif) => ecrire(
        supabase.from('groupe_factures').update({ statut: 'annulee', motif_annulation: texte(motif) }).eq('id', id),
        posFacture,
      ),
      async supprimerFacture(id) {
        const { data, error } = await supabase.from('groupe_factures').delete().eq('id', id).select('id');
        if (error) return { error: messageErreur(error) };
        if (!data?.length) return { error: "Vous n'avez pas les droits pour cette action." };
        setFactures((l) => l.filter((x) => x.id !== id));
        return { error: null };
      },

      encaisser: (p) => ecrire(supabase.from('groupe_paiements').insert({
        etablissement_id: etablissementId,
        facture_id: p.factureId,
        date_paiement: date(p.datePaiement) || undefined,
        montant: Math.round((Number(p.montant) || 0) * 100) / 100,
        mode: p.mode || 'virement',
        reference: texte(p.reference),
        note: texte(p.note),
      }), posPaiement),
      async supprimerPaiement(id) {
        const { data, error } = await supabase.from('groupe_paiements').delete().eq('id', id).select('id');
        if (error) return { error: messageErreur(error) };
        if (!data?.length) return { error: "Vous n'avez pas les droits pour cette action." };
        setPaiements((l) => l.filter((x) => x.id !== id));
        return { error: null };
      },
    };
  }, [etablissementId]);

  return { devis, factures, paiements, reglages, status, reload, ...actions };
}
