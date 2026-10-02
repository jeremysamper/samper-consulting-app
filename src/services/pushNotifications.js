import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Notifications push de cet appareil (téléphone, tablette, poste).
//
// L'abonnement est propre au navigateur : chaque appareil s'abonne une fois,
// pour un établissement. Les gestionnaires push / clic sont dans
// public/push-sw.js (chargé par le service worker de l'app), l'envoi dans
// l'Edge Function « notifications ».
//
// iPhone / iPad : les notifications web n'existent que pour l'app ajoutée à
// l'écran d'accueil (iOS 16.4 et plus), pas dans Safari.
// ─────────────────────────────────────────────────────────────────────────────

const estIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const estInstallee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// 'ok' | 'ios-a-installer' | 'non-supporte'
export function supportPush() {
  if (typeof window === 'undefined') return 'non-supporte';
  const api = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (estIos() && !estInstallee()) return 'ios-a-installer';
  return api ? 'ok' : 'non-supporte';
}

async function inscription() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.getRegistration();
}

const versOctets = (b64url) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

async function appeler(action) {
  const { data, error } = await supabase.functions.invoke('notifications', { body: { action } });
  if (error) {
    let message = null;
    try { message = (await error.context?.json?.())?.error || null; } catch { /* corps illisible */ }
    return { data: null, error: message || 'Le service de notifications n\'a pas répondu.' };
  }
  if (data?.error) return { data: null, error: data.error };
  return { data, error: null };
}

const nomAppareil = () => {
  const ua = navigator.userAgent;
  if (/ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? 'Téléphone Android' : 'Tablette Android';
  return 'Ordinateur';
};

// État pour cet établissement : 'actif' | 'inactif' | 'refuse' | support non-ok.
export async function etatPush(etablissementId) {
  const support = supportPush();
  if (support !== 'ok') return support;
  if (window.Notification.permission === 'denied') return 'refuse';
  const reg = await inscription();
  const abo = await reg?.pushManager.getSubscription();
  if (!abo || !etablissementId) return 'inactif';
  const { data } = await supabase.from('push_abonnements')
    .select('id').eq('endpoint', abo.endpoint).eq('etablissement_id', etablissementId).maybeSingle();
  return data ? 'actif' : 'inactif';
}

// Demande l'autorisation (doit suivre un tap), abonne le navigateur et
// l'enregistre pour l'établissement. Renvoie { error }.
export async function activerPush(etablissementId, userId) {
  if (supportPush() !== 'ok') return { error: 'Cet appareil ne permet pas les notifications.' };
  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') return { error: 'Notifications refusées sur cet appareil.' };
  const reg = await inscription();
  if (!reg) return { error: 'L\'app n\'est pas encore prête hors-ligne : rechargez la page puis réessayez.' };
  let abo = await reg.pushManager.getSubscription();
  if (!abo) {
    const { data, error } = await appeler('cle');
    if (error) return { error };
    abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(data.cle) });
  }
  const json = abo.toJSON();
  const { error } = await supabase.from('push_abonnements').upsert({
    user_id: userId,
    etablissement_id: etablissementId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    appareil: nomAppareil(),
  }, { onConflict: 'endpoint,etablissement_id' });
  if (error) return { error: 'L\'abonnement n\'a pas pu être enregistré. Réessayez.' };
  return { error: null };
}

// Retire cet appareil pour l'établissement (le navigateur reste abonné s'il
// l'est pour un autre établissement).
export async function desactiverPush(etablissementId) {
  const reg = await inscription();
  const abo = await reg?.pushManager.getSubscription();
  if (!abo) return { error: null };
  await supabase.from('push_abonnements').delete().eq('endpoint', abo.endpoint).eq('etablissement_id', etablissementId);
  const { data: restants } = await supabase.from('push_abonnements').select('id').eq('endpoint', abo.endpoint).limit(1);
  if (!restants?.length) await abo.unsubscribe().catch(() => {});
  return { error: null };
}

export async function testerPush() {
  return appeler('test');
}
