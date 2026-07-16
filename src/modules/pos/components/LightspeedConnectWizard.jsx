// ================================================================
// LightspeedConnectWizard - Assistant de connexion Lightspeed
//
// Modal pas-à-pas ouvert depuis PosConnectionBar (module Ventes POS).
// Trois étapes + écran de confirmation :
//   1. Autoriser   : popup OAuth Lightspeed (résultat via postMessage)
//   2. Restaurant  : choix de la location si le compte en a plusieurs
//                    (sautée automatiquement en mono-location)
//   3. Historique  : premier import des ventes (pos-backfill, 14 jours)
//
// Modes d'entrée :
//   connect   : première connexion
//   reconnect : token révoqué / erreur, refaire l'autorisation
//   location  : statut needs_location, re-autorisation éclair pour
//               récupérer la liste des restaurants puis étape 2
//
// Le wizard possède son propre listener postMessage pendant qu'il est
// monté ; PosConnectionBar n'écoute plus le popup et recharge le statut
// à la fermeture (onClose({ imported })).
// ================================================================
import { Fragment, useState, useEffect } from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import {
  callPosEdge, POS_OAUTH_FN, POS_BACKFILL_FN, OAUTH_ERRORS,
} from '../lib/posApi.js';

const HISTORY_DAYS = 14;

const STEPS = [
  { id: 'authorize', label: 'Autoriser' },
  { id: 'location',  label: 'Restaurant' },
  { id: 'import',    label: 'Historique' },
];
const STEP_INDEX = { authorize: 0, location: 1, import: 2, done: 3 };

const MODE_COPY = {
  connect: {
    title: 'Connecter Lightspeed',
    intro: 'Reliez votre caisse en 3 étapes, environ 2 minutes. Lecture seule : rien n\'est modifié sur la caisse.',
    cta:   'Ouvrir Lightspeed',
  },
  reconnect: {
    title: 'Reconnecter Lightspeed',
    intro: "L'autorisation précédente n'est plus valide. Refaites l'autorisation ci-dessous : les ventes déjà importées sont conservées.",
    cta:   'Rouvrir Lightspeed',
  },
  location: {
    title: 'Choisir votre restaurant',
    intro: "Votre compte Lightspeed gère plusieurs restaurants. Une fenêtre s'ouvre quelques secondes pour récupérer la liste, puis vous choisissez le bon.",
    cta:   'Récupérer mes restaurants',
  },
};

function IconLS({ size = 30 }) {
  // Logo Lightspeed (marque tierce) - orange conservé volontairement.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="7" fill="#FF6B35" />
      <path d="M10 22L16 10L22 22H18L16 17L14 22H10Z" fill="white" />
    </svg>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1100, padding: 16,
  },
  sheet: {
    background: 'var(--surface)', borderRadius: 'var(--r-lg)', width: 520,
    maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  header: {
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 12,
  },
  title:  { fontWeight: 700, fontSize: 16, color: 'var(--text)', fontFamily: 'var(--font-serif)', lineHeight: 1.3 },
  etab:   { fontSize: 12, color: 'var(--text3)', marginTop: 1 },
  close:  { marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)', lineHeight: 1, padding: 4, minHeight: 0, flexShrink: 0 },
  body:   { padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  intro:  { fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, margin: 0 },
  // Étapes numérotées (langage visuel de l'onboarding KDS)
  stepRow:  { display: 'flex', alignItems: 'flex-start', gap: 11 },
  stepNum:  { flex: '0 0 auto', width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', color: 'var(--accent)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 13.5, color: 'var(--text)', lineHeight: 1.45 },
  stepHint: { fontSize: 12, color: 'var(--text3)', marginTop: 2, lineHeight: 1.45 },
  box:      { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 11 },
  infoBox:  { fontSize: 12.5, color: 'var(--info-text)', background: 'var(--info-bg-soft)', border: '1px solid var(--info-bd)', borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 },
  errorBox: { fontSize: 12.5, color: 'var(--danger-text)', background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', borderRadius: 8, padding: '9px 12px', lineHeight: 1.5 },
  waitBox:  { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 15px' },
  spinner:  { width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.9s linear infinite', flexShrink: 0 },
  actions:  { display: 'flex', gap: 8, flexWrap: 'wrap' },
  locRow: (selected) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px',
    borderRadius: 8, cursor: 'pointer',
    border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
    background: selected ? 'var(--accent-light)' : 'var(--bg)',
  }),
};

// Fil d'Ariane 1-2-3 en tête du wizard. current = index de l'étape
// active (3 = terminé, tout est coché).
function Stepper({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px 0' }}>
      {STEPS.map((s, i) => {
        const done   = i < current;
        const active = i === current;
        const filled = done || active;
        return (
          <Fragment key={s.id}>
            {i > 0 && (
              <div style={{ flex: 1, height: 2, minWidth: 10, borderRadius: 1, background: i <= current ? 'var(--accent)' : 'var(--border)' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{
                width: 24, height: 24, borderRadius: '50%', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? 'var(--accent)' : 'var(--accent-light)',
                color: filled ? '#fff' : 'var(--accent)',
                border: `1px solid ${filled ? 'var(--accent)' : 'var(--accent-bd)'}`,
              }}>
                {done ? '✓' : i + 1}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: active ? 700 : 600, color: active ? 'var(--text)' : 'var(--text3)' }}>
                {s.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default function LightspeedConnectWizard({ etablissement, provider, mode = 'connect', onClose }) {
  const etablissementId = etablissement?.id;
  const etabNom = etablissement?.nom || 'cet établissement';
  const copy = MODE_COPY[mode] || MODE_COPY.connect;

  const [step, setStep]           = useState('authorize');
  const [waiting, setWaiting]     = useState(false); // popup ouvert, en attente du postMessage
  const [authError, setAuthError] = useState(null);

  const [connectionId, setConnectionId] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [locations, setLocations]       = useState([]);
  const [selectedLoc, setSelectedLoc]   = useState(null);
  const [savingLoc, setSavingLoc]       = useState(false);
  const [locError, setLocError]         = useState(null);

  const [importing, setImporting]       = useState(false);
  const [importError, setImportError]   = useState(null);
  const [importResult, setImportResult] = useState(null); // { salesTotal, daysProcessed }

  // ── Résultat du popup OAuth (postMessage) ──
  useEffect(() => {
    const handler = (event) => {
      const d = event.data ?? {};
      if (d.type === 'pos_oauth_success') {
        // Mono-location : la location est déjà sélectionnée côté serveur.
        setWaiting(false);
        setAuthError(null);
        setConnectionId(d.connectionId || null);
        setLocationName(d.locationName || null);
        setStep('import');
      } else if (d.type === 'pos_oauth_needs_location') {
        setWaiting(false);
        setAuthError(null);
        setConnectionId(d.connectionId || null);
        setLocations(Array.isArray(d.locations) ? d.locations : []);
        setStep('location');
      } else if (d.type === 'pos_oauth_error') {
        setWaiting(false);
        const msg = (d.error_code && OAUTH_ERRORS[d.error_code])
          ? OAUTH_ERRORS[d.error_code]
          : (d.error || 'Connexion échouée. Réessayez.');
        setAuthError(msg);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  async function openOAuth() {
    setAuthError(null);
    setWaiting(true);
    try {
      const { url } = await callPosEdge(POS_OAUTH_FN, 'get_auth_url', {
        etablissementId, providerId: provider.id,
      });
      const popup = window.open(url, 'lightspeed_oauth', 'width=600,height=720,left=200,top=80');
      if (!popup) {
        setWaiting(false);
        setAuthError('Popup bloqué : autorisez les fenêtres popup pour ce site, puis réessayez.');
      }
    } catch (err) {
      setWaiting(false);
      setAuthError(`Impossible de lancer la connexion : ${err.message}`);
    }
  }

  async function confirmLocation() {
    if (!selectedLoc || !connectionId) return;
    setSavingLoc(true);
    setLocError(null);
    try {
      await callPosEdge(POS_OAUTH_FN, 'set_location', {
        etablissementId,
        providerId: provider.id,
        connectionId,
        businessId: selectedLoc.businessId,
        locationId: selectedLoc.locationId,
      });
      setLocationName(selectedLoc.locationName);
      setStep('import');
    } catch (err) {
      setLocError(err.message);
    } finally {
      setSavingLoc(false);
    }
  }

  async function runImport() {
    if (!connectionId) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await callPosEdge(POS_BACKFILL_FN, null, { connectionId, days: HISTORY_DAYS });
      if ((res.daysProcessed ?? 0) === 0 && (res.daysErrored ?? 0) > 0) {
        setImportError(res.errors?.[0]?.error || 'Erreur inconnue pendant l\'import.');
      } else {
        setImportResult({ salesTotal: res.salesTotal ?? 0, daysProcessed: res.daysProcessed ?? 0 });
        setStep('done');
      }
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function close() {
    onClose?.({ imported: !!importResult });
  }

  // ── Écran 1 : autoriser l'accès ──
  const renderAuthorize = () => (
    <>
      <p style={S.intro}>{copy.intro}</p>
      <div style={S.box}>
        <div style={S.stepRow}>
          <span style={S.stepNum}>1</span>
          <div>
            <div style={S.stepText}>Une fenêtre Lightspeed s'ouvre</div>
            <div style={S.stepHint}>Si rien ne s'ouvre, autorisez les popups pour ce site puis réessayez.</div>
          </div>
        </div>
        <div style={S.stepRow}>
          <span style={S.stepNum}>2</span>
          <div>
            <div style={S.stepText}>Connectez-vous avec vos identifiants Lightspeed</div>
            <div style={S.stepHint}>Ceux de votre caisse, pas ceux de l'application Samper.</div>
          </div>
        </div>
        <div style={S.stepRow}>
          <span style={S.stepNum}>3</span>
          <div>
            <div style={S.stepText}>Acceptez les droits demandés</div>
            <div style={S.stepHint}>Lecture des ventes et des commandes en cours - la fenêtre se ferme toute seule.</div>
          </div>
        </div>
      </div>

      {authError && <div style={S.errorBox}>{authError}</div>}

      {waiting ? (
        <div style={S.waitBox}>
          <span style={S.spinner} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              En attente de l'autorisation...
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Terminez dans la fenêtre Lightspeed. Fenêtre fermée par erreur ?{' '}
              <button
                type="button"
                onClick={openOAuth}
                style={{ background: 'none', border: 'none', padding: 0, minHeight: 0, color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Rouvrir
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={S.actions}>
          <Btn variant="primary" onClick={openOAuth}>
            {authError ? 'Réessayer' : copy.cta}
          </Btn>
          <Btn variant="ghost" onClick={close}>Plus tard</Btn>
        </div>
      )}
    </>
  );

  // ── Écran 2 : choix du restaurant (multi-location) ──
  const renderLocation = () => (
    <>
      <p style={S.intro}>
        Votre compte Lightspeed gère {locations.length} restaurants. Choisissez celui qui correspond
        à « {etabNom} » : ses ventes alimenteront les vues cuisine.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {locations.map((loc) => {
          const selected = selectedLoc?.locationId === loc.locationId;
          return (
            <label key={loc.locationId} style={S.locRow(selected)}>
              <input
                type="radio"
                name="ls_location"
                value={loc.locationId}
                checked={selected}
                onChange={() => setSelectedLoc(loc)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{loc.locationName}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {loc.businessName ? `${loc.businessName} · ` : ''}{loc.locationId}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {locError && <div style={S.errorBox}>{locError}</div>}

      <div style={S.actions}>
        <Btn variant="primary" onClick={confirmLocation} disabled={!selectedLoc || savingLoc}>
          {savingLoc ? 'Enregistrement...' : 'Confirmer ce restaurant'}
        </Btn>
      </div>
    </>
  );

  // ── Écran 3 : import de l'historique ──
  const renderImport = () => (
    <>
      <p style={S.intro}>
        {locationName ? `Caisse connectée : ${locationName}. ` : 'Caisse connectée. '}
        Importez maintenant les {HISTORY_DAYS} derniers jours de ventes pour activer les vues
        cuisine (mise en place, top/flop, conso ingrédients).
      </p>
      <div style={S.infoBox}>
        Ensuite, plus rien à faire : la synchronisation tourne automatiquement chaque nuit.
      </div>

      {importError && <div style={S.errorBox}>Import échoué : {importError}</div>}

      {importing ? (
        <div style={S.waitBox}>
          <span style={S.spinner} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Import en cours...</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Jusqu'à une minute selon le volume de ventes.
            </div>
          </div>
        </div>
      ) : (
        <div style={S.actions}>
          <Btn variant="primary" onClick={runImport}>
            {importError ? 'Réessayer l\'import' : `Importer les ${HISTORY_DAYS} derniers jours`}
          </Btn>
          <Btn variant="ghost" onClick={() => setStep('done')}>Plus tard</Btn>
        </div>
      )}
    </>
  );

  // ── Écran final : confirmation ──
  const renderDone = () => (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '6px 0 2px', textAlign: 'center' }}>
        <span style={{
          width: 44, height: 44, borderRadius: '50%', fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--success-bg-soft)', border: '1px solid var(--success-bd)', color: 'var(--success-text)',
        }}>
          ✓
        </span>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          Lightspeed est connecté
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
          {locationName ? <>Restaurant : {locationName}.<br /></> : null}
          {importResult
            ? `${importResult.salesTotal} vente(s) importée(s) sur ${importResult.daysProcessed} jour(s).`
            : 'Vous pourrez importer l\'historique à tout moment depuis la barre Lightspeed du module.'}
        </div>
      </div>
      <div style={S.infoBox}>
        Prochaine étape : associez vos plats aux recettes dans l'onglet « Mapping plats » pour
        alimenter la mise en place et la conso ingrédients.
      </div>
      <div style={{ ...S.actions, justifyContent: 'center' }}>
        <Btn variant="primary" onClick={close} style={{ minWidth: 160 }}>Terminer</Btn>
      </div>
    </>
  );

  return (
    <div className="modal-sheet-overlay" style={S.overlay} onClick={close}>
      <div className="modal-sheet" style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.header}>
          <IconLS />
          <div style={{ minWidth: 0 }}>
            <div style={S.title}>{copy.title}</div>
            <div style={S.etab}>{etabNom}</div>
          </div>
          <button type="button" onClick={close} aria-label="Fermer" style={S.close}>×</button>
        </div>

        <Stepper current={STEP_INDEX[step] ?? 0} />

        <div style={S.body}>
          {step === 'authorize' && renderAuthorize()}
          {step === 'location'  && renderLocation()}
          {step === 'import'    && renderImport()}
          {step === 'done'      && renderDone()}
        </div>
      </div>
    </div>
  );
}
