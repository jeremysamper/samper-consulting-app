import React from 'react';
import { notify } from '../../components/toast/index.js';
import { confirmLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import {
  CLES_EMAIL, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_TEMPLATE, DEFAULT_FACTURE_TEXTS, EMAIL_VARS, FACTURE_TEXT_FIELDS,
  SIGNAL_NOTIFICATION, choisirClientTextes, factureTextsKey, lireReglagesEmail, mergeFactureTexts, useClientTextes,
} from './reglagesFactures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Les deux sections « Factures » de la page des réglages, réservées au
// consultant comme l'écran Factures (même garde, registreReglages.js).
//
//   SectionFacturesTextes : les textes du document, client par client. C'était
//     la fenêtre « Textes de la facture » de Factures.jsx : mêmes champs, même
//     enregistrement explicite, même clé user_settings.
//   SectionFacturesEmail  : l'e-mail d'envoi. C'était la fenêtre « Message
//     type » (objet, copie, message, enregistrés à chaque changement), avec
//     l'activation, dont la case reste aussi dans le formulaire de la facture.
//
// `revenir` n'existe que si la section est ouverte depuis une facture : le
// bouton qui fermait la fenêtre ramène alors à cette facture, restée ouverte.
// ─────────────────────────────────────────────────────────────────────────────

const egaux = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function SectionFacturesTextes({ user, etablissement, signaler, revenir }) {
  const db = dbService.getDb();
  const clientId = useClientTextes(etablissement?.id);
  const [clients, setClients] = React.useState([]);
  const modifieRef = React.useRef(() => false);

  React.useEffect(() => {
    let monte = true;
    Promise.resolve(db?.listEtablissements?.())
      .then((rows) => { if (monte) setClients(rows || []); })
      .catch((err) => console.error('[Factures etabs]', err));
    return () => { monte = false; };
  }, [db]);

  if (user?.role !== 'consultant' || !clientId) return null;

  const liste = clients.length ? clients : (etablissement ? [etablissement] : []);
  const client = liste.find((c) => c.id === clientId) || null;
  // Un brouillon appartient à son client : en changer l'abandonne, on le dit.
  const changerClient = (id) => {
    if (id === clientId) return;
    if (modifieRef.current() && !confirmLegacy('Abandonner les changements non enregistrés ?')) return;
    choisirClientTextes(id);
  };

  return (
    <div style={s.racine} data-factures-textes="">
      <div>
        <div style={s.modalLabel}>Client</div>
        <div style={s.clients} data-no-translate>
          {liste.map((c) => {
            const choisi = c.id === clientId;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={choisi}
                style={{ ...s.puce, ...(choisi ? s.puceActive : null) }}
                onClick={() => changerClient(c.id)}
              >
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: c.couleur || 'var(--accent)' }} />
                {c.nom}
              </button>
            );
          })}
        </div>
        <div style={s.aide}>
          Émetteur, bloc client, coordonnées de paiement, mention TVA et signature : chaque client peut avoir ses propres textes.
        </div>
      </div>
      <EditeurTextes
        key={clientId}
        clientId={clientId}
        client={client}
        modifieRef={modifieRef}
        signaler={signaler}
        revenir={revenir}
      />
    </div>
  );
}

// Enregistrement explicite (pas à chaque frappe comme le message type) : les
// textes visent un client précis, une écriture involontaire sur le mauvais
// client serait invisible jusqu'à la facture suivante.
function EditeurTextes({ clientId, client, modifieRef, signaler, revenir }) {
  const db = dbService.getDb();
  const lire = () => mergeFactureTexts(db?.getUserSettingSync?.(factureTextsKey(clientId)));
  const [brouillon, setBrouillon] = React.useState(lire);
  const [occupe, setOccupe] = React.useState(false);
  modifieRef.current = () => !egaux(mergeFactureTexts(brouillon), lire());

  // Cache user_settings pas encore hydraté : lecture en base, comme Factures.
  React.useEffect(() => {
    if (db?.isUserSettingsCacheReady?.()) return undefined;
    let monte = true;
    Promise.resolve(db?.getUserSetting?.(factureTextsKey(clientId)))
      .then((raw) => { if (monte) setBrouillon(mergeFactureTexts(raw)); })
      .catch((err) => console.warn('[Factures] lecture des textes de facture', err));
    return () => { monte = false; };
  }, [db, clientId]);

  // Section quittée sans enregistrer : le brouillon est abandonné, comme à la
  // fermeture de la fenêtre d'origine (la page signale chaque sortie).
  useReglageModifie('factures_textes', () => {
    if (db?.isUserSettingsCacheReady?.()) setBrouillon(lire());
  });

  // Bloc client dérivé de la fiche de l'établissement : affiché en indication
  // pour montrer ce qui sera utilisé tant que le champ reste vide.
  const blocClientAuto = [client?.nom, client?.adresse].filter(Boolean).join('\n');

  const enregistrer = async () => {
    const propre = mergeFactureTexts(brouillon);
    setOccupe(true);
    try {
      if (db?.setUserSetting) await db.setUserSetting(factureTextsKey(clientId), propre);
      notify('Textes de facture enregistrés pour cet établissement.', 'success');
      signaler?.();
      revenir?.();
    } catch (err) {
      console.error('[Factures] enregistrement des textes', err);
      notify('Enregistrement impossible : ' + err.message, 'error');
    } finally {
      setOccupe(false);
    }
  };
  const annuler = () => {
    setBrouillon(lire());
    revenir?.();
  };

  return (
    <>
      <div style={s.corps} data-factures-champs="">
        {FACTURE_TEXT_FIELDS.map((f, i) => (
          <div key={f.key}>
            {/* Intertitre au premier champ d'un groupe : la liste compte
                dix-huit champs, elle a besoin d'un repère. */}
            {f.groupe && f.groupe !== FACTURE_TEXT_FIELDS[i - 1]?.groupe && (
              <div style={s.modalGroupTitle}>{f.groupe}</div>
            )}
            {f.type === 'bool' ? (
              <label style={s.modalCheckRow}>
                <input
                  type="checkbox"
                  checked={!!brouillon[f.key]}
                  onChange={e => setBrouillon(prev => ({ ...prev, [f.key]: e.target.checked }))}
                  style={{ accentColor: 'var(--accent)', width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.label}</span>
              </label>
            ) : (
              <>
                <label style={s.modalLabel}>{f.label}</label>
                {f.rows > 0 ? (
                  <textarea
                    value={brouillon[f.key] ?? ''}
                    onChange={e => setBrouillon(prev => ({ ...prev, [f.key]: e.target.value }))}
                    rows={f.rows}
                    placeholder={f.key === 'client' ? blocClientAuto : undefined}
                    style={{ ...s.modalInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
                  />
                ) : (
                  <input
                    type="text"
                    value={brouillon[f.key] ?? ''}
                    onChange={e => setBrouillon(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={s.modalInput}
                  />
                )}
              </>
            )}
            {f.hint && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 }}>{f.hint}</div>
            )}
          </div>
        ))}
      </div>

      {/* Pied gardé en vue, comme celui de la fenêtre : « Enregistrer » ne
          coûte pas un défilement après la retouche d'un champ du milieu. */}
      <div style={s.piedFixe} data-factures-pied="">
        <button
          style={s.modalDangerBtn}
          onClick={() => {
            if (confirmLegacy('Restaurer les textes par défaut pour cet établissement ?')) {
              setBrouillon({ ...DEFAULT_FACTURE_TEXTS });
            }
          }}
        >
          ↺ Réinitialiser
        </button>
        <div style={{ flex: 1 }} />
        <button style={s.modalGhostBtn} onClick={annuler}>Annuler</button>
        <button
          style={{ ...s.modalPrimaryBtn, opacity: occupe ? 0.6 : 1 }}
          onClick={enregistrer}
          disabled={occupe}
        >
          {occupe ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </>
  );
}

export function SectionFacturesEmail({ user, revenir }) {
  const db = dbService.getDb();
  const [reglages, setReglages] = React.useState(() => lireReglagesEmail(db));
  const messageRef = React.useRef(null);

  // La case « Notification client » vit aussi dans le formulaire de la
  // facture : cette section, restée montée derrière, relit quand elle y change.
  useReglageModifie(SIGNAL_NOTIFICATION, () => {
    if (db?.isUserSettingsCacheReady?.()) setReglages(lireReglagesEmail(db));
  });

  if (user?.role !== 'consultant') return null;

  // Chaque changement est écrit tout de suite, comme dans la fenêtre d'origine.
  const regler = (champ, valeur) => {
    setReglages((prev) => ({ ...prev, [champ]: valeur }));
    const ecrite = champ === 'enabled' ? !!valeur : String(valeur || '');
    Promise.resolve(db?.setUserSetting?.(CLES_EMAIL[champ], ecrite)).catch((err) => {
      console.warn('[Factures] enregistrement de ' + CLES_EMAIL[champ], err);
    });
  };

  // Insertion d'une variable à l'endroit du curseur dans le message type.
  const insererVariable = (nom) => {
    const jeton = `{{${nom}}}`;
    const el = messageRef.current;
    if (!el) { regler('template', `${reglages.template}${jeton}`); return; }
    const debut = el.selectionStart ?? el.value.length;
    const fin = el.selectionEnd ?? debut;
    regler('template', `${el.value.slice(0, debut)}${jeton}${el.value.slice(fin)}`);
    // Le curseur est repositionné après le rendu, sinon React le renvoie en fin de champ.
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(debut + jeton.length, debut + jeton.length);
    }, 0);
  };

  return (
    <div style={{ ...s.racine, maxWidth: 620 }} data-factures-email="">
      <div>
        <label style={s.modalCheckRow}>
          <input
            type="checkbox"
            checked={reglages.enabled}
            onChange={e => regler('enabled', e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 18, height: 18, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Notification client</span>
        </label>
        <div style={s.aide}>
          {reglages.enabled
            ? 'Après envoi dans Documents, un brouillon prérempli s\'ouvre directement dans Gmail (objet, destinataire et message).'
            : 'Aucune notification ne sera proposée après l\'envoi dans Documents.'}
        </div>
      </div>

      <div style={s.corps} data-factures-champs="">
        <div>
          <label style={s.modalLabel}>Objet</label>
          <input
            type="text"
            value={reglages.subject}
            onChange={e => regler('subject', e.target.value)}
            style={s.modalInput}
          />
        </div>

        <div>
          <label style={s.modalLabel}>Copie (Cc) par défaut</label>
          <input
            type="email"
            value={reglages.cc}
            onChange={e => regler('cc', e.target.value)}
            placeholder="comptable@exemple.ch (facultatif)"
            style={s.modalInput}
          />
        </div>

        <div>
          <label style={s.modalLabel}>Message</label>
          <textarea
            ref={messageRef}
            value={reglages.template}
            onChange={e => regler('template', e.target.value)}
            rows={14}
            style={{ ...s.modalInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55, minHeight: 280 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
            Variables remplacées à l'envoi (cliquez pour insérer dans le message) :
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EMAIL_VARS.map(v => (
              <button key={v} type="button" style={s.varChip} onClick={() => insererVariable(v)}>
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={s.pied} data-factures-pied="">
        <button
          style={s.modalDangerBtn}
          onClick={() => {
            if (confirmLegacy('Restaurer l\'objet et le message par défaut ?')) {
              regler('template', DEFAULT_EMAIL_TEMPLATE);
              regler('subject', DEFAULT_EMAIL_SUBJECT);
            }
          }}
        >
          ↺ Réinitialiser
        </button>
        <div style={{ flex: 1 }} />
        {/* Rien à écrire ici, chaque changement l'est déjà : le bouton ramène à
            la facture, comme il fermait la fenêtre, ou confirme. */}
        <button
          style={s.modalPrimaryBtn}
          onClick={() => (revenir ? revenir() : notify('Message type enregistré.', 'success'))}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

const s = {
  racine: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 640, minWidth: 0, boxSizing: 'border-box' },
  corps: { display: 'flex', flexDirection: 'column', gap: 14 },
  pied: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid var(--border)' },
  piedFixe: {
    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid var(--border)',
    position: 'sticky', bottom: 0, background: 'var(--bg)', zIndex: 1,
  },
  aide: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 },
  clients: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  puce: {
    display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, boxSizing: 'border-box',
    padding: '7px 14px', borderRadius: 22,
    background: 'var(--bg)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, cursor: 'pointer',
  },
  puceActive: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' },

  // Champs et boutons : les styles des fenêtres d'origine de Factures.jsx. Le
  // bouton principal prend le jeton --on-accent, lisible aussi en sombre.
  modalLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 4 },
  modalInput: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  modalPrimaryBtn: { padding: '9px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  modalGhostBtn: { padding: '8px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  modalDangerBtn: { padding: '8px 14px', background: 'none', color: 'var(--danger-strong)', border: '1px solid var(--danger-bd)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  modalGroupTitle: {
    fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)',
    paddingTop: 6, marginBottom: 10, borderTop: '1px solid var(--border)',
  },
  modalCheckRow: {
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer',
  },
  varChip: {
    padding: '5px 9px', borderRadius: 14, background: 'var(--bg)',
    border: '1px solid var(--border)', color: 'var(--text2)',
    fontFamily: 'var(--font)', fontSize: 11, cursor: 'pointer',
  },
};
