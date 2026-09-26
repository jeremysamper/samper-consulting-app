-- ================================================================
-- MIGRATION - Messagerie privée : vraie messagerie à deux sens
-- Projet : Samper Consulting
-- Date   : 2026-09-26
--
-- AVANT : sens unique consultant → comptes. Seul le consultant écrivait,
--         et il lisait TOUS les messages, y compris ceux des autres.
-- APRÈS : chacun écrit à qui il peut déjà voir (profils de ses
--         établissements, consultants compris) ; une conversation n'est
--         lisible QUE par ses deux participants.
--
-- Qui peut écrire à qui : la sous-requête sur profiles passe par la RLS
-- de profiles (profiles_read : consultant = tous, sinon profils partageant
-- un établissement). On ne peut donc écrire qu'à un compte actif qu'on voit :
-- aucun message entre établissements sans lien.
--
-- COMPATIBILITÉ (front déployé) :
--   - vue consultant : listAllPrivateMessages ne renvoie plus que ses propres
--     conversations (c'est l'intention) ; ses envois marchent toujours.
--   - boîte de réception des autres rôles : inchangée (recipient_id = moi).
--   - marquage lu (pm_update_read) : inchangé, colonne read_at seule.
-- À appliquer AVANT de déployer le front de la messagerie à deux sens.
-- ================================================================

-- ─── 1. LECTURE : participants uniquement ──────────────────────────────────────
DROP POLICY IF EXISTS pm_select ON public.private_messages;
CREATE POLICY pm_select ON public.private_messages FOR SELECT TO authenticated
  USING (
    sender_id = (SELECT auth.uid())::text
    OR recipient_id = (SELECT auth.uid())::text
  );

-- ─── 2. ÉCRITURE : tout compte, vers un compte actif qu'il voit ────────────────
DROP POLICY IF EXISTS pm_insert ON public.private_messages;
CREATE POLICY pm_insert ON public.private_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())::text
    AND recipient_id <> sender_id
    AND EXISTS (
      SELECT 1 FROM public.profiles r
      WHERE r.id = recipient_id
        AND r.actif IS NOT FALSE
    )
  );

-- ─── 3. SUPPRESSION : l'auteur retire ses propres messages ─────────────────────
DROP POLICY IF EXISTS pm_delete ON public.private_messages;
CREATE POLICY pm_delete ON public.private_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid())::text);

-- ─── 4. GARDE-FOU : message non vide, longueur bornée ─────────────────────────
ALTER TABLE public.private_messages
  DROP CONSTRAINT IF EXISTS private_messages_message_len;
ALTER TABLE public.private_messages
  ADD CONSTRAINT private_messages_message_len
  CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000);

-- ─── 5. INDEX : conversations lues des deux côtés ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_private_messages_sender_created
  ON public.private_messages (sender_id, created_at DESC);

-- ─── ROLLBACK (à exécuter tel quel pour revenir à l'état précédent) ────────────
--
-- DROP POLICY IF EXISTS pm_select ON public.private_messages;
-- CREATE POLICY pm_select ON public.private_messages FOR SELECT
--   USING ((recipient_id = (SELECT auth.uid())::text) OR (current_user_role() = 'consultant'));
-- DROP POLICY IF EXISTS pm_insert ON public.private_messages;
-- CREATE POLICY pm_insert ON public.private_messages FOR INSERT
--   WITH CHECK ((current_user_role() = 'consultant') AND (sender_id = (SELECT auth.uid())::text));
-- DROP POLICY IF EXISTS pm_delete ON public.private_messages;
-- CREATE POLICY pm_delete ON public.private_messages FOR DELETE
--   USING ((current_user_role() = 'consultant') AND (sender_id = (SELECT auth.uid())::text));
-- ALTER TABLE public.private_messages DROP CONSTRAINT IF EXISTS private_messages_message_len;
-- DROP INDEX IF EXISTS public.idx_private_messages_sender_created;
-- ────────────────────────────────────────────────────────────────────────────────
