import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Mail, MailCheck, RefreshCw } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { appelerMailer } from './spaData.js';
import { st } from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Boîte d'envoi du spa (onglet E-mails, direction).
//
// Le spa connecte sa boîte Gmail ou Outlook d'un clic : confirmations de
// rendez-vous, bons d'anniversaire et actualités partent ensuite de sa propre
// adresse, et les réponses des clients y arrivent. La connexion se fait dans
// une fenêtre Google ou Microsoft (OAuth, spa-mailer boite_debut) ; la page de
// retour /api/spa-oauth prévient cet onglet (BroadcastChannel, ou
// window.opener) et l'état est relu au retour du focus dans tous les cas.
// Fenêtre bloquée : la connexion se fait dans cet onglet, puis retour à l'app.
// ─────────────────────────────────────────────────────────────────────────────

const FOURNISSEURS = {
  google: { nom: 'Gmail', detail: 'Adresse Gmail ou Google', editeur: 'Google' },
  microsoft: { nom: 'Outlook', detail: 'Adresse Outlook, Hotmail ou Microsoft', editeur: 'Microsoft' },
};
const DELAI_TENTATIVE = 15 * 60 * 1000; // durée de validité d'une connexion en cours (state côté serveur)

function dateCourte(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));
}

export default function BoiteEnvoi({ etablissementId, etat, erreurService, onRecharger, consultant }) {
  const [enCours, setEnCours] = useState(null); // 'google' | 'microsoft' | 'deconnexion'
  const [changer, setChanger] = useState(false);
  const tentative = useRef(null); // { debut, traitee }
  const fenetre = useRef(null);
  const recharger = useRef(onRecharger);
  recharger.current = onRecharger;

  useEffect(() => {
    const surRetour = (info) => {
      if (!info || info.source !== 'spa-oauth') return;
      recharger.current();
      const t = tentative.current;
      if (!t || t.traitee || Date.now() - t.debut > DELAI_TENTATIVE) return;
      t.traitee = true;
      setEnCours(null);
      if (info.ok) setChanger(false);
      notify(info.message || (info.ok ? 'Boîte connectée.' : 'La connexion n\'a pas abouti.'), info.ok ? 'success' : 'error');
    };
    let canal = null;
    try {
      canal = new BroadcastChannel('spa-oauth');
      canal.onmessage = (e) => surRetour(e.data);
    } catch { /* navigateur ancien : relecture au retour du focus */ }
    const surMessage = (e) => { if (e.origin === window.location.origin) surRetour(e.data); };
    const surFocus = () => {
      const t = tentative.current;
      if (!t || t.traitee) return;
      recharger.current();
      // Fenêtre fermée sans aboutir (ou lien coupé par la page de connexion) :
      // on rend la main, le message de retour éventuel affichera le résultat.
      if (!fenetre.current || fenetre.current.closed) setEnCours(null);
    };
    const surVisibilite = () => { if (document.visibilityState === 'visible') surFocus(); };
    window.addEventListener('message', surMessage);
    window.addEventListener('focus', surFocus);
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      if (canal) canal.close();
      window.removeEventListener('message', surMessage);
      window.removeEventListener('focus', surFocus);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, []);

  async function connecter(f) {
    if (enCours) return;
    setEnCours(f);
    // Fenêtre ouverte tout de suite, dans le geste du clic : ouverte après
    // l'appel au serveur, le navigateur la bloquerait.
    let w = null;
    try { w = window.open('', 'spa-oauth', 'popup,width=520,height=700'); } catch { w = null; }
    if (w) {
      try {
        w.document.title = 'Connexion';
        w.document.body.style.cssText = 'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:15px system-ui,sans-serif;color:#535f5a;background:#f4f1eb;';
        w.document.body.textContent = 'Ouverture de la connexion…';
      } catch { /* fenêtre déjà sur une autre page */ }
    }
    const { data, error } = await appelerMailer('boite_debut', { etablissementId, fournisseur: f });
    if (error || !data?.url) {
      try { w?.close(); } catch { /* déjà fermée */ }
      setEnCours(null);
      notify(error || 'La connexion n\'a pas pu démarrer. Réessayez.', 'error');
      return;
    }
    tentative.current = { debut: Date.now(), traitee: false };
    if (w && !w.closed) {
      fenetre.current = w;
      w.location.href = data.url;
      try { w.focus(); } catch { /* sans importance */ }
      return;
    }
    try { sessionStorage.setItem('spa-oauth-meme-onglet', '1'); } catch { /* stockage indisponible */ }
    window.location.assign(data.url);
  }

  async function deconnecter() {
    const b = etat?.boite;
    if (!b || enCours) return;
    if (!window.confirm(`Déconnecter ${b.adresse} ?\n\nLes e-mails du spa ne partiront plus de cette adresse.`)) return;
    setEnCours('deconnexion');
    try {
      const { error } = await appelerMailer('boite_deconnexion', { etablissementId });
      if (error) { notify(error, 'error'); return; }
      notify('Boîte déconnectée.', 'success');
      setChanger(false);
      onRecharger();
    } finally {
      setEnCours(null);
    }
  }

  if (erreurService) {
    return (
      <div style={{ ...st.encartAttention, marginBottom: 14 }}>
        <AlertCircle size={18} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--spa-kin)' }} />
        <span>{erreurService}</span>
      </div>
    );
  }
  if (!etat) {
    return <div style={{ ...s.carte, color: 'var(--spa-ink2)', fontSize: 14 }} aria-live="polite">Vérification de votre adresse e-mail…</div>;
  }

  const b = etat.boite;
  const connexions = etat.connexions || {};

  // ── Boîte connectée ──
  if (b && b.statut === 'actif' && !changer) {
    return (
      <div style={{ ...s.carte, background: 'var(--spa-matcha-soft)', borderColor: 'transparent' }}>
        <span aria-hidden="true" style={{ ...s.icone, color: 'var(--spa-matcha)' }}><MailCheck size={20} strokeWidth={1.8} /></span>
        <div style={s.texte}>
          <div style={s.titre}>Vos e-mails partent de cette adresse</div>
          <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }} data-no-translate>{b.adresse}</div>
          <div style={s.aide}>
            {FOURNISSEURS[b.fournisseur]?.nom}, connectée le {dateCourte(b.connecteAt)}. Quand un client répond, sa réponse arrive ici.
          </div>
        </div>
        <div style={s.actions}>
          <button type="button" onClick={() => setChanger(true)} disabled={Boolean(enCours)} style={st.secondaire}>Changer d'adresse</button>
          <button type="button" onClick={deconnecter} disabled={Boolean(enCours)} style={st.danger}>
            {enCours === 'deconnexion' ? 'Déconnexion…' : 'Déconnecter'}
          </button>
        </div>
      </div>
    );
  }

  // ── Boîte en erreur (accès retiré, mot de passe changé…) ──
  if (b && b.statut === 'erreur' && !changer) {
    const f = FOURNISSEURS[b.fournisseur];
    return (
      <div style={{ ...s.carte, background: 'var(--spa-sakura-soft)', borderColor: 'transparent' }}>
        <span aria-hidden="true" style={{ ...s.icone, color: 'var(--spa-sakura)' }}><AlertCircle size={20} strokeWidth={1.8} /></span>
        <div style={s.texte}>
          <div style={s.titre}>Votre adresse e-mail n'est plus connectée</div>
          <div style={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }} data-no-translate>{b.adresse}</div>
          <div style={s.aide}>
            Cliquez sur « Reconnecter », puis acceptez à nouveau.{' '}
            {etat.resend ? 'En attendant, les e-mails partent d\'une adresse de secours, à votre nom.' : 'En attendant, aucun e-mail ne part.'}
            {consultant && b.derniereErreur && <span style={{ display: 'block', marginTop: 4 }}>Détail : {b.derniereErreur}</span>}
          </div>
        </div>
        <div style={s.actions}>
          <button type="button" onClick={() => connecter(b.fournisseur)} disabled={Boolean(enCours) || !connexions[b.fournisseur]} style={st.principal}>
            <RefreshCw size={16} strokeWidth={1.8} aria-hidden="true" /> {enCours === b.fournisseur ? 'Connexion…' : `Reconnecter ${f?.nom || ''}`}
          </button>
          <button type="button" onClick={deconnecter} disabled={Boolean(enCours)} style={st.discret}>Déconnecter</button>
        </div>
      </div>
    );
  }

  // ── Aucune boîte (ou changement de boîte) ──
  const aucuneConnexion = !connexions.google && !connexions.microsoft;
  return (
    <div style={s.carte}>
      <span aria-hidden="true" style={{ ...s.icone, color: 'var(--spa-mizu)' }}><Mail size={20} strokeWidth={1.8} /></span>
      <div style={s.texte}>
        <div style={s.titre}>{changer ? 'Connecter une autre adresse' : 'Connectez l\'adresse e-mail du spa'}</div>
        <div style={{ ...s.aide, marginTop: 2 }}>
          Les confirmations de rendez-vous, les bons cadeaux et les nouvelles partiront de votre adresse. Vos clients vous
          répondront directement.
        </div>
        <ol style={s.etapes}>
          <li>Cliquez sur « Connecter Gmail » ou « Connecter Outlook ».</li>
          <li>Connectez-vous avec l'adresse e-mail du spa.</li>
          <li>Acceptez. C'est fait, une fois pour toutes.</li>
        </ol>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {Object.entries(FOURNISSEURS).map(([id, f]) => {
            const dispo = Boolean(connexions[id]);
            return (
              <button
                key={id}
                type="button"
                onClick={() => connecter(id)}
                disabled={!dispo || Boolean(enCours)}
                title={f.detail}
                style={{ ...(id === 'google' ? st.principal : st.secondaire), opacity: dispo && !enCours ? 1 : 0.55 }}
              >
                <Mail size={16} strokeWidth={1.8} aria-hidden="true" /> {enCours === id ? 'Connexion…' : `Connecter ${f.nom}`}
              </button>
            );
          })}
          {changer && <button type="button" onClick={() => setChanger(false)} style={st.discret}>Annuler</button>}
        </div>
        <div style={{ ...s.aide, marginTop: 10 }}>
          Gmail pour une adresse Gmail ou Google, Outlook pour une adresse Outlook, Hotmail ou Microsoft.{' '}
          {!b && (etat.resend
            ? 'En attendant, les e-mails partent d\'une adresse de secours, à votre nom.'
            : 'Tant qu\'aucune adresse n\'est connectée, aucun e-mail ne part.')}
        </div>
        {(aucuneConnexion || !connexions.google || !connexions.microsoft) && (
          <div style={{ ...st.encartInfo, marginTop: 12, fontSize: 13 }}>
            {consultant ? (
              <span>
                Pas encore activé : les accès{' '}
                {Object.entries(FOURNISSEURS).filter(([id]) => !connexions[id]).map(([id, f]) => f.editeur).join(' et ')}
                {' '}sont à créer une seule fois, pour tous les spas.
              </span>
            ) : (
              <span>{aucuneConnexion ? 'Bientôt disponible.' : 'L\'autre bouton sera bientôt disponible.'}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  carte: {
    display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 14,
    padding: '16px 18px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  icone: {
    width: 42, height: 42, borderRadius: 21, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-surface)',
  },
  texte: { flex: '1 1 260px', minWidth: 0 },
  titre: { fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.25, marginBottom: 2 },
  aide: { fontSize: 13, color: 'var(--spa-ink2)', lineHeight: 1.5, marginTop: 4 },
  etapes: { margin: '10px 0 0', paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7, color: 'var(--spa-ink)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', alignSelf: 'center' },
};
