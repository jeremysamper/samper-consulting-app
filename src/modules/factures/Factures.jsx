import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { readText, removeStorageKeys } from '../../utils/storage.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';

// ═══════════════════════════════════════════════════════════════
// MODULE FACTURES — Génération + envoi auto vers Documents
// ═══════════════════════════════════════════════════════════════

// ─── Template email par défaut pour notification facture ───
// Variables disponibles : {{numero}}, {{date}}, {{montant}}, {{echeance}}, {{etablissement}}
const DEFAULT_EMAIL_TEMPLATE = `Bonjour,

Votre facture n° {{numero}} datée du {{date}} d'un montant de {{montant}} est désormais disponible.

Échéance de paiement : {{echeance}}

Le document est joint à ce message ou consultable dans votre espace.

Cordialement,
Jeremy Samper
Samper Consulting`;

const renderEmailTemplate = (tpl, vars) => {
  let out = tpl || '';
  Object.entries(vars).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v ?? '');
  });
  return out;
};

const Factures = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const browserWindow = getBrowserWindow();
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const todayStr = new Date().toISOString().slice(0, 10);

  const isConsultant = user.role === 'consultant';
  const [form, setForm] = React.useState({
    numero: isConsultant ? generateFactureNumber() : '', // Placeholder synchrone non persistant
    dateFacturation: todayStr,
    dateEcheance: addDaysToDate(todayStr, 11),
    destinataire: '',
    prestation: 'Mission de consulting culinaire',
    referenceContratDevis: '',
    montant: '',
    devise: 'CHF',
    htOuTtc: 'HT',
    faitALe: `Erde, le ${formatDateFr(todayStr)}`,
  });

  // Pour éviter qu'au mount on incrémente le compteur DB plusieurs fois en cas de StrictMode/remount,
  // on track si on l'a déjà fait pour cette session.
  const numeroLoadedRef = React.useRef(false);

  // ─── Charger le vrai numéro de facture depuis la DB (compteur centralisé multi-device) ───
  // Au mount, on remplace le numéro placeholder par celui qui vient de getNextFactureNumber.
  // Cette fonction est atomique côté Supabase : pas de risque de doublon entre 2 onglets/devices.
  React.useEffect(() => {
    if (!isConsultant) return;
    if (numeroLoadedRef.current) return; // n'incrémente qu'une seule fois par session/établissement
    if (!legacySB || !legacySB.db.getNextFactureNumber) return;
    numeroLoadedRef.current = true;
    (async () => {
      try {
        const numero = await legacySB.db.getNextFactureNumber(etabId, todayStr);
        setForm(prev => ({ ...prev, numero }));
      } catch (err) {
        console.warn('[Factures] getNextFactureNumber failed', err);
        // On garde le placeholder synchrone déjà en place
      }
    })();
  }, [etabId]);

  // Liste de tous les établissements pour permettre la sélection rapide du destinataire
  const [etabsAll, setEtabsAll] = React.useState([]);
  const [selectedEtabId, setSelectedEtabId] = React.useState(etabId);

  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB) {
      setEtabsAll(demoData.etablissements || []);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const rows = await legacySB.db.listEtablissements();
        if (!mounted) return;
        setEtabsAll((rows || []).map(r => ({
          id: r.id, nom: r.nom, type: r.type, adresse: r.adresse, tel: r.tel,
          email: r.email, couleur: r.couleur, contact: r.contact || r.notes,
        })));
      } catch (err) { console.error('[Factures etabs]', err); }
    })();
    return () => { mounted = false; };
  }, []);

  // Construit automatiquement le bloc destinataire depuis un établissement
  const buildDestinataireFromEtab = (etab) => {
    if (!etab) return '';
    const lines = [];
    // Si on a un nom de contact (M./Mme + nom), on l'ajoute en première ligne
    // Sinon on commence directement par le nom de l'établissement
    if (etab.nom && etab.nom.toLowerCase().includes('woodland')) {
      lines.push('M. et Mme. MULOT');
    }
    if (etab.nom) lines.push(etab.nom);
    if (etab.adresse) lines.push(etab.adresse);
    return lines.join('\n');
  };

  // Quand on change l'établissement sélectionné, pré-remplir le destinataire
  React.useEffect(() => {
    const sel = etabsAll.find(e => e.id === selectedEtabId);
    if (sel) {
      setForm(prev => ({ ...prev, destinataire: buildDestinataireFromEtab(sel) }));
    }
  }, [selectedEtabId, etabsAll]);

  const [savedToDocs, setSavedToDocs] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [recentFactures, setRecentFactures] = React.useState([]);
  // ─── Email automatique ───
  // Settings stockés en DB (user_settings) avec cache mémoire hydraté au login.
  // → Lecture synchrone via getUserSettingSync : pas de loader, pas de useEffect async.
  // → Écriture : setUserSetting met à jour le cache + DB en arrière-plan.
  // → Migration douce : si rien en cache et qu'il y a une valeur localStorage legacy,
  //    on la pousse en DB une seule fois puis on nettoie le localStorage.
  const [showEmailModal, setShowEmailModal] = React.useState(false);
  const [emailDraft, setEmailDraft] = React.useState(null); // { to, subject, body, fileName }
  const [showTemplateEditor, setShowTemplateEditor] = React.useState(false);

  // Lecture initiale synchrone depuis le cache (déjà hydraté par App au login)
  const [emailEnabled, setEmailEnabled] = React.useState(() => {
    if (legacySB?.db?.getUserSettingSync) {
      const v = legacySB.db.getUserSettingSync('email_facture_enabled');
      if (v != null) return !!v;
    }
    // Fallback localStorage legacy
    try {
      const raw = readText('sc_email_facture_enabled', null);
      if (raw != null) return raw !== 'false';
    } catch(e) {}
    return true; // défaut
  });

  const [emailTemplate, setEmailTemplate] = React.useState(() => {
    if (legacySB?.db?.getUserSettingSync) {
      const v = legacySB.db.getUserSettingSync('email_facture_template');
      if (v) return String(v);
    }
    try {
      const raw = readText('sc_email_facture_template', null);
      if (raw) return raw;
    } catch(e) {}
    return DEFAULT_EMAIL_TEMPLATE;
  });

  // Migration douce : si on a lu depuis localStorage (legacy), pousser en DB une seule fois
  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB?.db?.setUserSetting) return;
    // Si la valeur est dans le cache, rien à migrer
    const cachedEnabled = legacySB.db.getUserSettingSync?.('email_facture_enabled');
    const cachedTemplate = legacySB.db.getUserSettingSync?.('email_facture_template');
    (async () => {
      try {
        if (cachedEnabled == null) {
          const local = (() => { try { return readText('sc_email_facture_enabled', null); } catch { return null; } })();
          if (local != null) {
            await legacySB.db.setUserSetting('email_facture_enabled', local !== 'false');
            try { removeStorageKeys(['sc_email_facture_enabled']); } catch(e) {}
          }
        }
        if (cachedTemplate == null) {
          const local = (() => { try { return readText('sc_email_facture_template', null); } catch { return null; } })();
          if (local) {
            await legacySB.db.setUserSetting('email_facture_template', local);
            try { removeStorageKeys(['sc_email_facture_template']); } catch(e) {}
          }
        }
      } catch(e) { console.warn('[Factures] migration legacy localStorage failed', e); }
    })();
  }, []);

  // Sync vers DB sur changement (le cache est mis à jour côté supabase.js automatiquement)
  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB?.db?.setUserSetting) return;
    legacySB.db.setUserSetting('email_facture_enabled', !!emailEnabled).catch(err => {
      console.warn('[Factures] save email_facture_enabled failed', err);
    });
  }, [emailEnabled]);
  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB?.db?.setUserSetting) return;
    legacySB.db.setUserSetting('email_facture_template', String(emailTemplate || '')).catch(err => {
      console.warn('[Factures] save email_facture_template failed', err);
    });
  }, [emailTemplate]);

  // Fermeture des modales avec la touche Échap (UX standard)
  React.useEffect(() => {
    if (!showEmailModal && !showTemplateEditor) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showEmailModal) setShowEmailModal(false);
        else if (showTemplateEditor) setShowTemplateEditor(false);
      }
    };
    browserWindow?.addEventListener('keydown', onKey);
    return () => browserWindow?.removeEventListener('keydown', onKey);
  }, [showEmailModal, showTemplateEditor]);

  // Charger les factures récentes (depuis le dossier Factures dans Documents)
  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB) return;
    let mounted = true;
    (async () => {
      try {
        const docs = await legacySB.db.listDocuments(etabId);
        const factureFolder = docs.find(d => d.type === 'folder' && d.nom === 'Factures' && !d.parentId);
        if (!factureFolder) return;
        // Récupérer toutes les factures (descendants type 'file')
        const collectFiles = (parentId) => {
          const direct = docs.filter(d => d.parentId === parentId);
          let files = direct.filter(d => d.type === 'file');
          for (const folder of direct.filter(d => d.type === 'folder')) {
            files = files.concat(collectFiles(folder.id));
          }
          return files;
        };
        const allFactures = collectFiles(factureFolder.id).sort((a, b) =>
          new Date(b.createdAt) - new Date(a.createdAt)
        );
        if (mounted) setRecentFactures(allFactures.slice(0, 5));
      } catch (err) { console.error('[Factures recents]', err); }
    })();
  }, [etabId]);

  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  // Recalculer le "Fait à Erde le..." quand la date de facturation change
  React.useEffect(() => {
    setForm(prev => ({ ...prev, faitALe: `Erde, le ${formatDateFr(prev.dateFacturation)}` }));
  }, [form.dateFacturation]);

  // ═══ Génération du PDF ═══
  const generatePDF = async (sendToDocs) => {
    if (!form.montant || isNaN(parseFloat(form.montant))) {
      alertLegacy('Le montant doit être un nombre.');
      return;
    }
    setBusy(true);
    try {
      const fileName = `${form.dateFacturation}_${form.numero}_${(etablissement?.nom || 'client').replace(/\s+/g, '')}_${form.montant}${form.devise}.pdf`;

      if (sendToDocs) {
        // Mode "Envoyer au module Documents"
        await sendFactureToDocuments(fileName);
        setSavedToDocs(true);
        setTimeout(() => setSavedToDocs(false), 4000);

        // ─── Préparer le brouillon email si activé ───
        if (emailEnabled) {
          const targetEtab = etabsAll.find(e => e.id === selectedEtabId) || etablissement;
          const vars = {
            numero: form.numero,
            date: formatDateFr(form.dateFacturation),
            echeance: formatDateFr(form.dateEcheance),
            montant: form.montant ? `${form.montant} ${form.devise} ${form.htOuTtc}` : '',
            etablissement: targetEtab?.nom || '',
          };
          const subject = `Facture n° ${form.numero} - ${targetEtab?.nom || 'Samper Consulting'}`;
          const body = renderEmailTemplate(emailTemplate, vars);
          setEmailDraft({
            to: targetEtab?.email || '',
            subject,
            body,
            fileName,
            etabNom: targetEtab?.nom || '',
          });
          setShowEmailModal(true);
        }
      } else {
        // Mode "Télécharger directement"
        if (!pdfUtils?.exportElementToPdf) throw new Error('Export PDF indisponible.');
        await pdfUtils.exportElementToPdf('facture-print', fileName, {
          etablissement,
          title: `Facture ${form.numero}`,
          orientation: 'portrait',
          noBrandHeader: true,
          noHeader: true,
          fitOnePage: true,
        });
      }
    } catch (err) {
      console.error('[Factures]', err);
      notifyLegacy('Erreur génération facture : ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // ═══ Envoyer dans Documents ═══
  // On utilise l'établissement sélectionné (le destinataire de la facture), pas
  // forcément l'établissement actif dans le bandeau supérieur.
  const sendFactureToDocuments = async (fileName) => {
    if (!legacySB) throw new Error('Supabase non configuré');
    const targetEtabId = selectedEtabId || etabId;

    // 1. Générer le PDF en mémoire (Blob)
    if (!pdfUtils?.elementToBlobPDF) throw new Error('Export PDF indisponible.');
    const blob = await pdfUtils.elementToBlobPDF('facture-print', {
      etablissement,
      title: `Facture ${form.numero}`,
      orientation: 'portrait',
      noBrandHeader: true,
          noHeader: true,
      fitOnePage: true,
    });

    // 2. S'assurer que la hiérarchie de dossiers existe : Factures > YYYY > MM - Mois
    const date = new Date(form.dateFacturation + 'T12:00:00');
    const year = String(date.getFullYear());
    const monthNum = String(date.getMonth() + 1).padStart(2, '0');
    const monthName = date.toLocaleDateString('fr-CH', { month: 'long' });
    const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const monthFolder = `${monthNum} - ${monthNameCap}`;

    const allDocs = await legacySB.db.listDocuments(targetEtabId);

    // Cherche ou crée le dossier "Factures" à la racine
    let factureFolder = allDocs.find(d => d.type === 'folder' && d.nom === 'Factures' && !d.parentId);
    if (!factureFolder) {
      factureFolder = await legacySB.db.createFolder({
        etablissementId: targetEtabId, parentId: null, nom: 'Factures', userId: user.id,
      });
    }

    // Cherche ou crée le dossier de l'année
    let yearFolder = allDocs.find(d => d.type === 'folder' && d.nom === year && d.parentId === factureFolder.id);
    if (!yearFolder) {
      yearFolder = await legacySB.db.createFolder({
        etablissementId: targetEtabId, parentId: factureFolder.id, nom: year, userId: user.id,
      });
    }

    // Cherche ou crée le dossier du mois
    let monthFolderObj = allDocs.find(d => d.type === 'folder' && d.nom === monthFolder && d.parentId === yearFolder.id);
    if (!monthFolderObj) {
      monthFolderObj = await legacySB.db.createFolder({
        etablissementId: targetEtabId, parentId: yearFolder.id, nom: monthFolder, userId: user.id,
      });
    }

    // 3. Upload du fichier dans le dossier mensuel
    const file = new File([blob], fileName, { type: 'application/pdf' });
    await legacySB.db.uploadFile({
      etablissementId: targetEtabId,
      parentId: monthFolderObj.id,
      file,
      userId: user.id,
    });

    // 4. Refresh liste récentes pour l'établissement de destination
    const docs = await legacySB.db.listDocuments(targetEtabId);
    const fact = docs.find(d => d.type === 'folder' && d.nom === 'Factures' && !d.parentId);
    if (fact) {
      const collectFiles = (parentId) => {
        const direct = docs.filter(d => d.parentId === parentId);
        let files = direct.filter(d => d.type === 'file');
        for (const folder of direct.filter(d => d.type === 'folder')) {
          files = files.concat(collectFiles(folder.id));
        }
        return files;
      };
      const allFactures = collectFiles(fact.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setRecentFactures(allFactures.slice(0, 5));
    }
  };

  // ═══ Réinitialiser le formulaire (pour faire une nouvelle facture) ═══
  // On commence par un placeholder synchrone puis
  // on remplace par le vrai numéro DB dès qu'il revient — comme au mount.
  const newFacture = async () => {
    // Étape 1 : reset immédiat avec placeholder local non persistant (UX réactif)
    setForm({
      numero: generateFactureNumber(),
      dateFacturation: todayStr,
      dateEcheance: addDaysToDate(todayStr, 11),
      destinataire: form.destinataire,
      prestation: 'Mission de consulting culinaire',
      referenceContratDevis: '',
      montant: '',
      devise: 'CHF',
      htOuTtc: 'HT',
      faitALe: `Erde, le ${formatDateFr(todayStr)}`,
    });
    setSavedToDocs(false);
    // Étape 2 : remplacer par le numéro DB (atomique multi-device)
    if (legacySB && legacySB.db.getNextFactureNumber) {
      try {
        const numero = await legacySB.db.getNextFactureNumber(etabId, todayStr);
        setForm(prev => ({ ...prev, numero }));
      } catch (err) {
        console.warn('[newFacture] getNextFactureNumber failed', err);
      }
    }
  };

  if (!isConsultant) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🔐</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Accès consultant uniquement</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>Le module Factures est réservé au consultant.</div>
      </div>
    );
  }

  return (
    <div style={fac.root}>
      <div style={fac.header}>
        <div>
          <h2 style={fac.title}>Facturation</h2>
          <div style={fac.sub}>Génération de factures de prestation</div>
        </div>
        <button style={fac.ghostBtn} onClick={newFacture}>+ Nouvelle facture</button>
      </div>

      <div style={fac.layout}>
        {/* ═══ Formulaire de saisie (gauche) ═══ */}
        <div style={fac.formCol}>
          <div style={fac.section}>
            <div style={fac.sectionTitle}>Informations facture</div>

            <div style={fac.row2}>
              <div>
                <label style={fac.label}>N° de facture</label>
                <input style={fac.input} value={form.numero} onChange={e => updateForm('numero', e.target.value)} />
              </div>
              <div>
                <label style={fac.label}>Référence contrat / devis</label>
                <input style={fac.input} value={form.referenceContratDevis} onChange={e => updateForm('referenceContratDevis', e.target.value)} placeholder="Ex: 20260224" />
              </div>
            </div>

            <div style={fac.row2}>
              <div>
                <label style={fac.label}>Date de facturation</label>
                <input type="date" style={fac.input} value={form.dateFacturation} onChange={e => updateForm('dateFacturation', e.target.value)} />
              </div>
              <div>
                <label style={fac.label}>Date d'échéance paiement</label>
                <input type="date" style={fac.input} value={form.dateEcheance} onChange={e => updateForm('dateEcheance', e.target.value)} />
              </div>
            </div>

            <label style={fac.label}>Destinataire (établissement client)</label>
            <div style={fac.etabPicker}>
              {etabsAll.map(et => {
                const sel = selectedEtabId === et.id;
                return (
                  <button
                    key={et.id}
                    style={{ ...fac.etabChip, ...(sel ? fac.etabChipActive : {}) }}
                    onClick={() => setSelectedEtabId(et.id)}
                    type="button"
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: et.couleur || 'var(--accent)' }} />
                    {et.nom}
                  </button>
                );
              })}
            </div>
            <textarea
              style={{ ...fac.input, minHeight: 80, resize: 'vertical', marginTop: 8 }}
              value={form.destinataire}
              onChange={e => updateForm('destinataire', e.target.value)}
              rows={4}
              placeholder="Détails du destinataire (modifiable)"
            />
          </div>

          <div style={fac.section}>
            <div style={fac.sectionTitle}>Détail de la prestation</div>
            <textarea
              style={{ ...fac.input, minHeight: 60, resize: 'vertical' }}
              value={form.prestation}
              onChange={e => updateForm('prestation', e.target.value)}
              rows={3}
              placeholder="Mission de consulting culinaire"
            />

            <div style={{ ...fac.row2, marginTop: 14 }}>
              <div style={{ flex: 2 }}>
                <label style={fac.label}>Montant</label>
                <input style={fac.input} type="number" step="0.01" value={form.montant} onChange={e => updateForm('montant', e.target.value)} placeholder="2900.00" />
              </div>
              <div>
                <label style={fac.label}>Devise</label>
                <select style={fac.input} value={form.devise} onChange={e => updateForm('devise', e.target.value)}>
                  <option value="CHF">CHF</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label style={fac.label}>HT/TTC</label>
                <select style={fac.input} value={form.htOuTtc} onChange={e => updateForm('htOuTtc', e.target.value)}>
                  <option value="HT">HT</option>
                  <option value="TTC">TTC</option>
                </select>
              </div>
            </div>
          </div>

          <div style={fac.section}>
            <div style={fac.sectionTitle}>Signature</div>
            <label style={fac.label}>Fait à...</label>
            <input style={fac.input} value={form.faitALe} onChange={e => updateForm('faitALe', e.target.value)} />
          </div>

          <div style={fac.section}>
            <div style={{ ...fac.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Notification client</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text2)', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={e => setEmailEnabled(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                />
                {emailEnabled ? 'Activée' : 'Désactivée'}
              </label>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
              {emailEnabled
                ? 'Après envoi dans Documents, un brouillon d\'email sera proposé pour notifier le client.'
                : 'Aucune notification ne sera proposée après l\'upload.'}
            </div>
            <button
              style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font)' }}
              onClick={() => setShowTemplateEditor(true)}
            >
              ✎ Modifier le template d'email
            </button>
          </div>

          <div style={fac.actions}>
            <button
              style={{ ...fac.primaryBtn, opacity: busy ? 0.6 : 1 }}
              onClick={() => generatePDF(true)}
              disabled={busy}
            >
              {busy ? '⏳ Génération…' : '📤 Envoyer dans Documents'}
            </button>
            <button
              style={{ ...fac.ghostBtn, opacity: busy ? 0.6 : 1 }}
              onClick={() => generatePDF(false)}
              disabled={busy}
            >
              ⬇ Télécharger PDF
            </button>
          </div>

          {savedToDocs && (
            <div style={fac.successBanner}>
              ✓ Facture enregistrée dans Documents › Factures › {new Date(form.dateFacturation + 'T12:00:00').getFullYear()} › {String(new Date(form.dateFacturation + 'T12:00:00').getMonth() + 1).padStart(2, '0')} - {capitalize(new Date(form.dateFacturation + 'T12:00:00').toLocaleDateString('fr-CH', { month: 'long' }))}
            </div>
          )}

          {recentFactures.length > 0 && (
            <div style={fac.section}>
              <div style={fac.sectionTitle}>Dernières factures envoyées</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentFactures.map(f => (
                  <div key={f.id} style={fac.recentRow}>
                    <span style={{ fontSize: 16 }}>📄</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>{f.nom}</span>
                    <span style={{ fontSize: 10, color: 'var(--text2)' }}>{new Date(f.createdAt).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ Aperçu (droite) ═══ */}
        <div style={fac.previewCol}>
          <div style={fac.previewLabel}>Aperçu</div>
          <FactureRender form={form} etablissement={etablissement} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALE 1 : Brouillon email après upload facture
         ═══════════════════════════════════════════════════════════════ */}
      {showEmailModal && emailDraft && (
        // L'overlay ne ferme PAS la modale au clic (UX trop fragile pour une zone de saisie).
        // Fermeture uniquement via : bouton ✕, bouton "Fermer", ou touche Échap.
        <div className="modal-full-overlay" style={fac.overlay}>
          <div className="modal-full" style={{ ...fac.modal, width: 600, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={fac.modalHeader}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>📧 Notifier le client</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Brouillon généré pour <strong>{emailDraft.etabNom}</strong>
                </div>
              </div>
              <button style={fac.closeBtn} onClick={() => setShowEmailModal(false)} title="Fermer (Échap)">✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Destinataire */}
              <div>
                <label style={fac.modalLabel}>Destinataire</label>
                <input
                  type="email"
                  value={emailDraft.to}
                  onChange={e => setEmailDraft({ ...emailDraft, to: e.target.value })}
                  placeholder="email@client.ch"
                  style={fac.modalInput}
                />
                {!emailDraft.to && (
                  <div style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>
                    ⚠ Aucune adresse email enregistrée pour cet établissement. Renseignez-la dans Paramètres ou tapez-la ci-dessus.
                  </div>
                )}
              </div>

              {/* Sujet */}
              <div>
                <label style={fac.modalLabel}>Sujet</label>
                <input
                  type="text"
                  value={emailDraft.subject}
                  onChange={e => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                  style={fac.modalInput}
                />
              </div>

              {/* Corps */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={fac.modalLabel}>Message</label>
                <textarea
                  value={emailDraft.body}
                  onChange={e => setEmailDraft({ ...emailDraft, body: e.target.value })}
                  rows={10}
                  style={{ ...fac.modalInput, resize: 'vertical', fontFamily: 'inherit', minHeight: 200 }}
                />
              </div>

              {/* Note PJ */}
              <div style={{ padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11, color: '#92400e', display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 14 }}>⚠</span>
                <div>
                  <strong>Pièce jointe :</strong> "{emailDraft.fileName}"<br/>
                  <span style={{ fontSize: 10 }}>Le PDF n'est pas joint automatiquement. Téléchargez-le depuis Documents et joignez-le manuellement à votre email.</span>
                </div>
              </div>
            </div>

            <div style={fac.modalFooter}>
              <button style={fac.modalGhostBtn} onClick={() => setShowEmailModal(false)}>Fermer</button>

              {/* Copier dans le presse-papiers */}
              <button
                style={fac.modalGhostBtn}
                onClick={() => {
                  const txt = `À : ${emailDraft.to}\nSujet : ${emailDraft.subject}\n\n${emailDraft.body}`;
                  const clipboard = browserWindow?.navigator?.clipboard;
                  if (clipboard?.writeText) {
                    clipboard.writeText(txt)
                      .then(() => notifyLegacy('✓ Email copié dans le presse-papiers. Collez-le dans votre client mail.', 'success'))
                      .catch(() => notifyLegacy('Impossible de copier. Sélectionnez le texte manuellement.', 'error'));
                  } else {
                    notifyLegacy('Presse-papiers non disponible. Sélectionnez le texte manuellement.', 'warning');
                  }
                }}
              >
                📋 Copier
              </button>

              {/* Ouvrir dans le client mail (mailto) */}
              <button
                style={fac.modalPrimaryBtn}
                onClick={() => {
                  if (!emailDraft.to) {
                    if (!confirmLegacy('Aucune adresse email. Ouvrir quand même le client mail (vous pourrez la renseigner dedans) ?')) return;
                  }
                  const mailtoUrl = `mailto:${encodeURIComponent(emailDraft.to)}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
                  if (mailtoUrl.length > 2000) {
                    if (!confirmLegacy('Le message est très long et certains clients mail risquent de le tronquer. Continuer (recommandé : utiliser "Copier" à la place) ?')) return;
                  }
                  if (browserWindow) browserWindow.location.href = mailtoUrl;
                  setTimeout(() => setShowEmailModal(false), 500);
                }}
              >
                ✉ Ouvrir dans mon mail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODALE 2 : Éditeur du template email
         ═══════════════════════════════════════════════════════════════ */}
      {showTemplateEditor && (
        // Overlay non-cliquable pour fermer (cohérent avec la modale email).
        // Fermeture via : ✕, "Annuler", ou Échap.
        <div className="modal-full-overlay" style={fac.overlay}>
          <div className="modal-full" style={{ ...fac.modal, width: 580, maxWidth: '94vw' }}>
            <div style={fac.modalHeader}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>✎ Template d'email</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Personnalisez le message de notification client
                </div>
              </div>
              <button style={fac.closeBtn} onClick={() => setShowTemplateEditor(false)}>✕</button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 11, color: '#15803d' }}>
                <strong>Variables disponibles</strong> (remplacées automatiquement) :<br/>
                <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{'{{numero}}'}</code> · <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{'{{date}}'}</code> · <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{'{{echeance}}'}</code> · <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{'{{montant}}'}</code> · <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{'{{etablissement}}'}</code>
              </div>

              <textarea
                value={emailTemplate}
                onChange={e => setEmailTemplate(e.target.value)}
                rows={14}
                style={{ ...fac.modalInput, resize: 'vertical', fontFamily: 'inherit', minHeight: 280 }}
              />
            </div>

            <div style={fac.modalFooter}>
              <button
                style={{ ...fac.modalGhostBtn, color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={() => {
                  if (confirmLegacy('Restaurer le template par défaut ?')) {
                    setEmailTemplate(DEFAULT_EMAIL_TEMPLATE);
                  }
                }}
              >
                ↺ Réinitialiser
              </button>
              <div style={{ flex: 1 }} />
              <button style={fac.modalPrimaryBtn} onClick={() => setShowTemplateEditor(false)}>
                ✓ Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Rendu de la facture (utilisé pour aperçu + export PDF)
// ═══════════════════════════════════════════════════════════════
const FactureRender = ({ form, etablissement }) => {
  const montantNum = parseFloat(form.montant || 0);
  const montantFormat = isNaN(montantNum) ? '-' : montantNum.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div id="facture-print" style={fr.page}>
      <div style={fr.titleBar}>
        FACTURE DE PRESTATION N° {form.numero}
      </div>

      <div style={fr.twoColTop}>
        <div style={fr.partyBox}>
          <div style={fr.partyLabel}>Émetteur :</div>
          <div style={fr.partyText}>
            Jeremy SAMPER - Consultant Culinaire<br/>
            Téléphone : +41 76 626 54 00<br/>
            E-mail : jeremysamper.pro@gmail.com<br/>
            Adresse : Route de Collombé 24A, 1976 Erde, Suisse
          </div>
        </div>
        <div style={fr.partyBox}>
          <div style={fr.partyLabel}>Client :</div>
          <div style={{ ...fr.partyText, whiteSpace: 'pre-line' }}>{form.destinataire}</div>
        </div>
      </div>

      <table style={fr.detailTable}>
        <tbody>
          <tr><td style={fr.detailLabel}>Date de facturation :</td><td style={fr.detailVal}>{formatDateFr(form.dateFacturation)}</td></tr>
          <tr><td style={fr.detailLabel}>Prestation :</td><td style={fr.detailVal}>{form.prestation}</td></tr>
          {form.referenceContratDevis && (
            <tr><td style={fr.detailLabel}>Référence contrat / devis :</td><td style={fr.detailVal}>{form.referenceContratDevis}</td></tr>
          )}
          <tr style={{ background: '#f5f0e1' }}>
            <td style={{ ...fr.detailLabel, fontSize: 13, fontWeight: 700 }}>Montant total :</td>
            <td style={{ ...fr.detailVal, fontSize: 14, fontWeight: 700, color: '#588157' }}>
              {form.devise} {montantFormat} {form.htOuTtc}
            </td>
          </tr>
          <tr><td style={fr.detailLabel}>Échéance paiement :</td><td style={fr.detailVal}>{formatDateFr(form.dateEcheance)}</td></tr>
          <tr><td style={fr.detailLabel}>Adresse d'émission :</td><td style={fr.detailVal}>Route de Collombé 24A, 1976 Erde, Suisse</td></tr>
        </tbody>
      </table>

      <div style={fr.section}>
        <div style={fr.sectionTitle}>Coordonnées de paiement</div>
        <table style={fr.bankTable}>
          <tbody>
            <tr><td style={fr.bankLabel}>Titulaire :</td><td style={fr.bankVal}>SAMPER Jérémy</td></tr>
            <tr><td style={fr.bankLabel}>Banque :</td><td style={fr.bankVal}>Banque Cantonale du Valais (BCVS)</td></tr>
            <tr><td style={fr.bankLabel}>IBAN :</td><td style={fr.bankVal}>CH33 0076 5001 0561 6551 0</td></tr>
            <tr><td style={fr.bankLabel}>SWIFT / BIC :</td><td style={fr.bankVal}>BCVSCH2LXXX</td></tr>
          </tbody>
        </table>
      </div>

      <div style={fr.tva}>
        Numéro TVA : Non assujetti (activité indépendante en création)
      </div>

      <div style={fr.signature}>
        <div style={fr.signatureLine}>Fait à {form.faitALe}</div>
        <div style={fr.signatureSig}>
          Jeremy Samper - Consultant culinaire
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
function generateFactureNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  // Aperçu local non persistant : le vrai numéro séquentiel vient de Supabase quand disponible.
  return `FAC-${y}${m}${dd}-${hh}${mm}${ss}`;
}

function formatDateFr(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function addDaysToDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ═══════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════
const fac = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', margin: 0 },
  sub: { fontSize: 13, color: 'var(--text2)', marginTop: 4 },

  // min(380px, 100%) : 2 colonnes sur desktop, empilement naturel sur mobile
  layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(380px, 100%), 1fr))', gap: 18 },

  formCol: { display: 'flex', flexDirection: 'column', gap: 14 },
  previewCol: { display: 'flex', flexDirection: 'column', gap: 8 },
  previewLabel: { fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 },

  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 12 },

  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, marginTop: 10 },
  input: { width: '100%', padding: '8px 11px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },

  actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { flex: 1, padding: '12px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minWidth: 200 },
  ghostBtn: { flex: 1, padding: '12px 18px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minWidth: 180 },

  successBanner: { background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 },

  recentRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg)', borderRadius: 5 },

  etabPicker: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  etabChip: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '7px 12px', borderRadius: 18,
    background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)',
    transition: 'all 0.15s',
  },
  etabChipActive: {
    background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff',
  },
};

// Styles facture imprimable (FR = facture render)
const fr = {
  page: { background: '#fff', padding: '30px 36px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#222', maxWidth: 720, margin: '0 auto', fontSize: 11 },
  titleBar: { textAlign: 'center', fontSize: 16, fontWeight: 700, padding: '10px 0', borderBottom: '2px solid #588157', marginBottom: 18, letterSpacing: 0.5, color: '#588157', fontFamily: 'Arial, Helvetica, sans-serif' },
  twoColTop: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 },
  partyBox: { padding: '10px 12px', background: '#fafaf6', borderLeft: '3px solid #588157', borderRadius: 4 },
  partyLabel: { fontSize: 10, fontWeight: 700, color: '#588157', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, fontFamily: 'Arial, Helvetica, sans-serif' },
  partyText: { fontSize: 11, lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' },
  detailTable: { width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 11, fontFamily: 'Arial, Helvetica, sans-serif' },
  detailLabel: { padding: '7px 12px', borderBottom: '1px solid #e8e0c8', fontWeight: 600, width: '38%', verticalAlign: 'top' },
  detailVal: { padding: '7px 12px', borderBottom: '1px solid #e8e0c8' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#588157', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #d4c8a0', fontFamily: 'Arial, Helvetica, sans-serif' },
  bankTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'Arial, Helvetica, sans-serif' },
  bankLabel: { padding: '4px 12px', fontWeight: 600, width: '38%', color: '#555' },
  bankVal: { padding: '4px 12px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 },
  tva: { fontSize: 10, color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px 0', borderTop: '1px dotted #d4c8a0', borderBottom: '1px dotted #d4c8a0', marginBottom: 14, fontFamily: 'Arial, Helvetica, sans-serif' },
  signature: { marginTop: 14, fontSize: 11, fontFamily: 'Arial, Helvetica, sans-serif' },
  signatureLine: { marginBottom: 18 },
  signatureSig: { fontSize: 11, lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' },

  // ─── Modales email ───
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalFooter: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' },
  modalLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 4 },
  modalInput: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  modalPrimaryBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  modalGhostBtn: { padding: '7px 14px', background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' },
};

export default Factures;
