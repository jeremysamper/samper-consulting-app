import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// useGroupeMenus - menus des groupes (table groupe_menus) : un menu par palier
// de prix (numéros 1 à 12 par type) et, au n°0, la carte des compléments du
// type. Quelques dizaines de lignes par établissement : on les charge d'un
// bloc.
//
// Un menu qui n'a pas encore été composé n'existe pas en base : `menuDe` rend
// alors null et les écrans affichent « menu à composer ». L'enregistrement est
// un upsert sur (établissement, type, numéro), l'index unique de la migration.
//
// Même contrat de `status` que useGroupes ('loading' | 'ready' | 'error' |
// 'absent'), et même règle : une lecture en échec garde la dernière version et
// se relance seule. Les écrans NE DOIVENT PAS confondre « pas encore lu » et
// « menu à composer » : tant que status n'est pas 'ready', aucun éditeur ne
// s'ouvre - l'enregistrement est un upsert, il écraserait le vrai menu.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'groupe_menus';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

export function mapMenuFromDB(row) {
  if (!row) return null;
  return {
    id: row.id,
    etablissementId: row.etablissement_id,
    typeGroupe: row.type_groupe,
    numero: Number(row.numero),
    nom: row.nom || '',
    prixPax: row.prix_pax != null ? Number(row.prix_pax) : null,
    description: row.description || '',
    lignes: Array.isArray(row.lignes) ? row.lignes : [],
    regles: row.regles && typeof row.regles === 'object' && !Array.isArray(row.regles) ? row.regles : {},
  };
}

const texte = (v) => String(v ?? '').trim();
const entierOuNull = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const nombreOuNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Une ligne ne garde que ses champs connus : ce jsonb est relu par le PDF, la
// liste de courses et l'écran de choix, il ne doit rien transporter d'autre.
// Les champs vides ne sont pas écrits, pour que le jsonb reste lisible.
function ligneVersDB(l, index) {
  const parPersonne = Number(l.parPersonne);
  const out = {
    id: l.id || `l-${Date.now()}-${index}`,
    section: l.section || 'plat',
    platId: l.platId || null,
    libelle: texte(l.libelle),
    description: texte(l.description),
    parPersonne: parPersonne > 0 ? parPersonne : 1,
  };
  const recetteIds = Array.isArray(l.recetteIds) ? l.recetteIds.filter(Boolean) : [];
  if (recetteIds.length) out.recetteIds = recetteIds;
  if (texte(l.rubrique)) out.rubrique = texte(l.rubrique);
  if (['vegetarien', 'poisson', 'viande'].includes(l.regime)) out.regime = l.regime;
  if (['ete', 'hiver'].includes(l.saison)) out.saison = l.saison;
  const debut = entierOuNull(l.moisDebut, 1, 12);
  const fin = entierOuNull(l.moisFin, 1, 12);
  if (debut && fin) { out.moisDebut = debut; out.moisFin = fin; }
  if (l.premium) out.premium = true;
  if (l.chaud) out.chaud = true;
  if (texte(l.note)) out.note = texte(l.note);
  if (texte(l.prix)) out.prix = texte(l.prix);
  if (texte(l.unite)) out.unite = texte(l.unite);
  const ppu = nombreOuNull(l.portionsParUnite);
  if (ppu) out.portionsParUnite = ppu;
  const minimum = nombreOuNull(l.minimum);
  if (minimum) out.minimum = minimum;
  return out;
}

// Règles d'un menu : seules les rubriques et clés connues, valeurs bornées.
function reglesVersDB(regles) {
  const src = regles && typeof regles === 'object' ? regles : {};
  const sections = {};
  Object.entries(src.sections && typeof src.sections === 'object' ? src.sections : {}).forEach(([id, r]) => {
    if (!r || typeof r !== 'object' || !['servi', 'table', 'carte', 'quantites'].includes(r.mode)) return;
    const s = { mode: r.mode };
    const nombre = entierOuNull(r.nombre, 1, 20);
    const retenir = entierOuNull(r.retenir, 1, 20);
    const dontVege = entierOuNull(r.dontVege, 0, 20);
    const parPersonne = nombreOuNull(r.parPersonne);
    const auMoinsChaud = entierOuNull(r.auMoinsChaud, 1, 20);
    if (r.mode === 'table' && nombre) s.nombre = nombre;
    if (r.mode === 'carte' && retenir) s.retenir = retenir;
    if (r.mode === 'carte' && dontVege != null) s.dontVege = dontVege;
    if (r.mode === 'table' && r.versionVege) s.versionVege = true;
    if (parPersonne) s.parPersonne = parPersonne;
    if (auMoinsChaud) s.auMoinsChaud = auMoinsChaud;
    if (Array.isArray(r.puiserDans) && r.puiserDans.length) s.puiserDans = r.puiserDans.filter(Boolean);
    if (r.facultatif) s.facultatif = true;
    if (texte(r.label)) s.label = texte(r.label);
    if (Array.isArray(r.formules) && r.formules.length) {
      s.formules = r.formules
        .filter((f) => f && f.id && texte(f.label))
        .map((f) => ({
          id: String(f.id),
          label: texte(f.label),
          prix: Number(f.prix) >= 0 ? Number(f.prix) : 0,
          ...(f.premium ? { premium: true } : {}),
          ...(f.aucunChoix ? { aucunChoix: true } : {}),
        }));
    }
    sections[id] = s;
  });
  const out = { sections };
  const c = src.aperitifConseille;
  if (c && typeof c === 'object') {
    const conseille = {};
    ['ete', 'hiver'].forEach((saison) => {
      if (Array.isArray(c[saison]) && c[saison].length) conseille[saison] = c[saison].filter(Boolean);
    });
    if (c.formule && typeof c.formule === 'object') conseille.formule = { ...c.formule };
    if (Object.keys(conseille).length) out.aperitifConseille = conseille;
  }
  return out;
}

export function useGroupeMenus(etablissementId) {
  const [menus, setMenus] = useState([]);
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!etablissementId) {
      setMenus([]);
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let loadedOnce = false;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('etablissement_id', etablissementId)
        .order('type_groupe')
        .order('numero');
      if (!mounted) return;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) { setMenus([]); setStatus('absent'); return; }
        console.error('[useGroupeMenus] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }
      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setMenus((data || []).map(mapMenuFromDB));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setStatus('loading');
    reload();

    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([TABLE], () => { if (mounted) reload(); })
      : null;

    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [etablissementId]);

  const reload = useCallback(() => reloadRef.current?.(), []);

  const menuDe = useCallback(
    (typeGroupe, numero) => menus.find((m) => m.typeGroupe === typeGroupe && m.numero === Number(numero)) || null,
    [menus]
  );

  const actions = useMemo(() => {
    async function enregistrer(menu) {
      const prix = menu.prixPax === '' || menu.prixPax == null ? null : Number(menu.prixPax);
      const row = {
        etablissement_id: etablissementId,
        type_groupe: menu.typeGroupe,
        numero: Number(menu.numero),
        nom: String(menu.nom || '').trim() || null,
        prix_pax: Number.isFinite(prix) && prix >= 0 ? prix : null,
        description: String(menu.description || '').trim() || null,
        lignes: (menu.lignes || [])
          .map(ligneVersDB)
          .filter((l) => l.libelle || l.platId),
        regles: reglesVersDB(menu.regles),
      };
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(row, { onConflict: 'etablissement_id,type_groupe,numero' })
        .select()
        .single();
      if (error) {
        console.error('[useGroupeMenus] enregistrer', error);
        const message = error.code === '42501'
          ? "Tu n'as pas les droits pour modifier les menus de groupe."
          : RELATION_ABSENTE.has(error.code)
            ? "Le module Groupes n'est pas encore activé sur la base de données."
            : 'Enregistrement du menu impossible. Réessaie.';
        return { data: null, error: message };
      }
      const saved = mapMenuFromDB(data);
      setMenus((liste) => [...liste.filter((m) => m.id !== saved.id), saved]);
      return { data: saved, error: null };
    }

    // Plusieurs menus d'un coup (une liaison propagée à tous les menus qui
    // servent le même plat). L'un après l'autre : la première erreur arrête
    // la suite et le message dit combien sont passés.
    async function enregistrerPlusieurs(liste) {
      let faits = 0;
      for (const menu of liste) {
        const { error } = await enregistrer(menu);
        if (error) {
          return { faits, error: faits ? `${error} (${faits} menu${faits > 1 ? 's' : ''} déjà enregistré${faits > 1 ? 's' : ''})` : error };
        }
        faits += 1;
      }
      return { faits, error: null };
    }

    // Suppression d'un menu : la base la limite au consultant, au patron et
    // au responsable cuisine ; refusée, elle touche zéro ligne sans erreur,
    // on relit donc ce qui a été supprimé.
    async function supprimer(menu) {
      const { data, error } = await supabase
        .from(TABLE)
        .delete()
        .eq('id', menu.id)
        .select('id');
      if (error || !data?.length) {
        if (error) console.error('[useGroupeMenus] supprimer', error);
        return { error: "Suppression du menu impossible : ton rôle ne le permet pas ou le menu n'existe plus." };
      }
      setMenus((liste) => liste.filter((m) => m.id !== menu.id));
      return { error: null };
    }

    return { enregistrer, enregistrerPlusieurs, supprimer };
  }, [etablissementId]);

  const menusDuType = useCallback(
    (typeGroupe) => menus
      .filter((m) => m.typeGroupe === typeGroupe && m.numero > 0)
      .sort((a, b) => a.numero - b.numero),
    [menus]
  );

  return { menus, status, reload, menuDe, menusDuType, ...actions };
}
