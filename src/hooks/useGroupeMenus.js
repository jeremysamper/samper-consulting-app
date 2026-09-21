import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// useGroupeMenus - menus prédéfinis des groupes (table groupe_menus) : cinq
// numéros pour chacun des cinq types, soit vingt-cinq lignes au plus par
// établissement. On les charge donc d'un bloc.
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
  };
}

// Une ligne ne garde que ses champs connus : ce jsonb est relu par le PDF et
// par la liste de courses, il ne doit rien transporter d'autre.
function ligneVersDB(l, index) {
  const parPersonne = Number(l.parPersonne);
  return {
    id: l.id || `l-${Date.now()}-${index}`,
    section: l.section || 'plat',
    platId: l.platId || null,
    libelle: String(l.libelle || '').trim(),
    description: String(l.description || '').trim(),
    parPersonne: parPersonne > 0 ? parPersonne : 1,
  };
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

    return { enregistrer };
  }, [etablissementId]);

  return { menus, status, reload, menuDe, ...actions };
}
