/**
 * LightspeedSetupGuide — Modal guide de configuration OAuth Lightspeed K-Series
 *
 * Affiche les 3 étapes pour connecter un compte Lightspeed :
 *   1. Créer une app sur developers.lightspeedhq.com
 *   2. Configurer les 4 secrets dans Supabase
 *   3. Autoriser la connexion dans l'app
 *
 * Valeurs techniques copiables : Redirect URI, scopes.
 */
import { useState } from 'react';

const REDIRECT_URI   = 'https://ppmtoiqgajwcdkbnrcll.supabase.co/functions/v1/pos-oauth';
const SCOPES         = 'financial-api offline_access';
const DEV_PORTAL_URL = 'https://developers.lightspeedhq.com';

// ── Bouton copier ─────────────────────────────────────────────────

function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(value); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        padding: '3px 10px', borderRadius: 6,
        border: `1px solid ${copied ? '#86efac' : 'var(--border)'}`,
        background: copied ? '#f0fdf4' : 'var(--surface)',
        color: copied ? '#15803d' : 'var(--text2)',
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'var(--font)', whiteSpace: 'nowrap', flexShrink: 0,
        transition: 'all 0.15s',
      }}
    >
      {copied ? 'Copié ✓' : 'Copier'}
    </button>
  );
}

// ── Bloc valeur technique (code monospace + bouton copier) ─────────

function CodeLine({ value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
      <code style={{
        flex: 1, padding: '5px 10px', borderRadius: 6,
        background: '#f1f5f9', border: '1px solid #e2e8f0',
        fontSize: 12, color: '#0f172a', fontFamily: 'monospace',
        wordBreak: 'break-all',
      }}>
        {value}
      </code>
      <CopyBtn value={value} />
    </div>
  );
}

// ── Badge numéro d'étape ──────────────────────────────────────────

function StepBadge({ n }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%',
      background: 'var(--accent)', color: '#fff',
      fontSize: 13, fontWeight: 700, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {n}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────

export default function LightspeedSetupGuide({ onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: 580, maxWidth: '100%', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
              Guide de configuration Lightspeed
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              K-Series · OAuth2 · ~5 minutes
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text2)', padding: '2px 6px' }}
          >
            ×
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div style={{ padding: '22px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Étape 1 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <StepBadge n="1" />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                Créer une app sur le portail développeur Lightspeed
              </div>
            </div>
            <div style={{ paddingLeft: 36, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 13, lineHeight: 1.7 }}>
                <li>
                  Va sur{' '}
                  <a href={DEV_PORTAL_URL} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                    developers.lightspeedhq.com
                  </a>
                </li>
                <li>Connecte-toi avec le compte propriétaire du restaurant</li>
                <li>Crée une nouvelle app et renseigne ces valeurs&nbsp;:</li>
              </ol>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 2 }}>Redirect URI</div>
                <CodeLine value={REDIRECT_URI} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 2 }}>Scopes requis</div>
                <CodeLine value={SCOPES} />
              </div>
              <div style={{
                fontSize: 12, color: '#92400e',
                background: '#fefce8', border: '1px solid #fde68a',
                borderRadius: 7, padding: '7px 11px', marginTop: 2,
              }}>
                ⚠ Note le <strong>Client ID</strong> et le <strong>Client Secret</strong> après création
                — tu en auras besoin à l'étape&nbsp;2.
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Étape 2 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <StepBadge n="2" />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                Configurer les secrets dans Supabase
              </div>
            </div>
            <div style={{ paddingLeft: 36, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                Dans <strong>Supabase Dashboard → Edge Functions → Manage secrets</strong>,
                ajoute ces 4 valeurs&nbsp;:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { key: 'LS_CLIENT_ID',     note: '(ton Client ID Lightspeed)' },
                  { key: 'LS_CLIENT_SECRET', note: '(ton Client Secret Lightspeed)' },
                  { key: 'LS_REDIRECT_URI',  note: REDIRECT_URI, copyVal: REDIRECT_URI },
                  { key: 'LS_ENV',           note: 'demo  (sandbox)  ou  production' },
                ].map(({ key, note, copyVal }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <code style={{
                      padding: '3px 9px', borderRadius: 5,
                      background: '#f1f5f9', border: '1px solid #e2e8f0',
                      fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: '#0f172a',
                      flexShrink: 0, minWidth: 148,
                    }}>
                      {key}
                    </code>
                    <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>→ {note}</span>
                    {copyVal && <CopyBtn value={copyVal} />}
                  </div>
                ))}
              </div>
              <div style={{
                fontSize: 12, color: '#0369a1',
                background: '#f0f9ff', border: '1px solid #bae6fd',
                borderRadius: 7, padding: '7px 11px', marginTop: 2,
              }}>
                💡 Une fois les secrets ajoutés, recharge cette page — le bouton
                "Connecter" s'activera automatiquement.
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Étape 3 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <StepBadge n="3" />
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                Autoriser la connexion dans l'application
              </div>
            </div>
            <div style={{ paddingLeft: 36, fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
              Clique sur <strong>"Connecter Lightspeed"</strong> dans cette page.<br />
              Tu seras redirigé vers Lightspeed pour autoriser l'accès.<br />
              Une fois autorisé, tu reviens automatiquement ici et le module POS est opérationnel.
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
          background: 'var(--bg)',
        }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '8px 22px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font)',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
