import React from 'react';
import { notify } from '../../../components/toast/index.js';
import { dbService } from '../../../services/dbService.js';
import { ATTENTE_MAX_MS, listerEnAttente } from '../../../services/commandeQrService.js';

// Commandes QR en attente de l'établissement (lot L3), tenues à jour par le
// temps réel de caisse_commandes_qr. Une commande neuve s'annonce par un toast
// sur tous les écrans de la caisse ; le bandeau, lui, vit sur le plan.
// Une lecture en échec garde la dernière liste connue. Une commande de plus de
// 3 heures sort de la liste (elle a expiré côté serveur).
// actif = false (poste en mode test) : rien n'est lu, rien ne s'annonce.
export function useCommandesQr(etablissementId, { actif = true } = {}) {
  const [commandes, setCommandes] = React.useState([]);
  const [horloge, setHorloge] = React.useState(() => Date.now());
  const connues = React.useRef(null);

  const recharger = React.useCallback(async () => {
    if (!etablissementId || !actif) { setCommandes([]); return; }
    const { data, error } = await listerEnAttente(etablissementId);
    if (error) return;
    if (connues.current && data.some((c) => !connues.current.has(c.id))) {
      notify('Nouvelle commande QR à valider', 'info');
    }
    connues.current = new Set(data.map((c) => c.id));
    setCommandes(data);
  }, [etablissementId, actif]);

  React.useEffect(() => {
    connues.current = null;
    recharger();
  }, [recharger]);

  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etablissementId || !actif) return undefined;
    return rt.subscribeReload(['caisse_commandes_qr'], recharger);
  }, [etablissementId, actif, recharger]);

  // L'âge affiché (« il y a 4 min ») et l'expiration suivent la minute.
  React.useEffect(() => {
    if (!commandes.length) return undefined;
    const id = setInterval(() => setHorloge(Date.now()), 30000);
    return () => clearInterval(id);
  }, [commandes.length]);

  const visibles = React.useMemo(
    () => commandes.filter((c) => horloge - new Date(c.created_at).getTime() < ATTENTE_MAX_MS),
    [commandes, horloge],
  );

  return { commandes: visibles, recharger, maintenant: horloge };
}
