import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { readText, removeStorageKeys } from '../../utils/storage.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';

// ═══════════════════════════════════════════════════════════════
// MODULE FACTURES - Génération + envoi auto vers Documents
// ═══════════════════════════════════════════════════════════════

// ─── Templates email par défaut pour la notification client ───
// Variables disponibles : {{numero}}, {{date}}, {{echeance}}, {{montant}},
// {{etablissement}}, {{prestation}}, {{reference}}
const EMAIL_VARS = ['numero', 'date', 'echeance', 'montant', 'etablissement', 'prestation', 'reference'];

const DEFAULT_EMAIL_SUBJECT = 'Facture n° {{numero}} - Samper Consulting';

const DEFAULT_EMAIL_TEMPLATE = `Bonjour,

Vous trouverez en pièce jointe la facture n° {{numero}} du {{date}}, relative à la prestation suivante : {{prestation}}.

Montant : {{montant}}
Échéance de paiement : {{echeance}}

Le règlement peut être effectué par virement sur le compte indiqué au bas de la facture. Le document reste également disponible dans votre espace Samper Consulting, rubrique Documents.

Je reste à disposition pour toute question.

Avec mes meilleures salutations,

Jeremy Samper
Consultant culinaire
Samper Consulting
+41 76 626 54 00
jeremysamper.pro@gmail.com`;

const renderEmailTemplate = (tpl, vars) => {
  let out = tpl || '';
  Object.entries(vars).forEach(([k, v]) => {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v ?? '');
  });
  // Une variable vide (référence absente, par ex.) laisse souvent une ligne
  // orpheline du type "Référence :" ; on compacte les blancs qui en résultent.
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

// Un champ multiligne (la prestation est un textarea) ne doit pas casser la
// mise en forme du mail : on l'aplatit en une seule ligne.
const flattenValue = (v) => String(v ?? '').replace(/\s*\n\s*/g, ' ').trim();

// ─── Textes du document facture, par établissement client ───
// Tout ce qui était figé dans le PDF (émetteur, coordonnées bancaires, mention
// TVA, signature) est éditable et enregistré sur l'établissement sélectionné :
// un client facturé depuis une autre entité ou avec un autre compte garde ses
// propres textes. Stockage en user_settings sous une clé scopée par etabId,
// donc pas de migration ni de colonne à ajouter.
const DEFAULT_FACTURE_TEXTS = {
  titre: 'FACTURE DE PRESTATION',
  emetteur: `Jeremy SAMPER - Consultant Culinaire
Téléphone : +41 76 626 54 00
E-mail : jeremysamper.pro@gmail.com
Adresse : Route de Collombé 24A, 1976 Erde, Suisse`,
  // Vide = bloc client dérivé de la fiche établissement (nom + adresse). Dès
  // qu'un texte est enregistré il prime : c'est là que vivent la personne de
  // contact, une raison sociale différente ou une adresse de facturation.
  client: '',
  prestationDefaut: 'Mission de consulting culinaire',
  adresseEmission: 'Route de Collombé 24A, 1976 Erde, Suisse',
  paiementTitre: 'Coordonnées de paiement',
  paiement: `Titulaire : SAMPER Jérémy
Banque : Banque Cantonale du Valais (BCVS)
IBAN : CH33 0076 5001 0561 6551 0
SWIFT / BIC : BCVSCH2LXXX`,
  mentionTva: 'Numéro TVA : Non assujetti (activité indépendante en création)',
  ville: 'Erde',
  signature: 'Jeremy Samper - Consultant culinaire',
};

const FACTURE_TEXT_FIELDS = [
  { key: 'titre', label: 'Titre du document', rows: 0, hint: 'Le numéro de facture est ajouté automatiquement à la suite.' },
  { key: 'emetteur', label: 'Bloc émetteur', rows: 5 },
  { key: 'client', label: 'Bloc client', rows: 4, hint: "Laisser vide pour reprendre le nom et l'adresse de la fiche établissement. Reste modifiable facture par facture dans le formulaire." },
  { key: 'prestationDefaut', label: 'Prestation par défaut', rows: 2, hint: 'Pré-remplit le détail de la prestation quand ce client est sélectionné.' },
  { key: 'adresseEmission', label: "Adresse d'émission", rows: 0, hint: 'Laisser vide pour masquer la ligne du tableau.' },
  { key: 'paiementTitre', label: 'Titre du bloc paiement', rows: 0 },
  { key: 'paiement', label: 'Coordonnées de paiement', rows: 5, hint: 'Une ligne par entrée, au format « Libellé : valeur ».' },
  { key: 'mentionTva', label: 'Mention TVA', rows: 2, hint: 'Laisser vide pour masquer la ligne.' },
  { key: 'ville', label: "Ville d'émission", rows: 0, hint: 'Utilisée pour la ligne « Fait à… ».' },
  { key: 'signature', label: 'Signature', rows: 2 },
];

const factureTextsKey = (etabId) => `facture_textes:${etabId}`;

// Fusion avec les valeurs par défaut : une facture enregistrée avant l'ajout
// d'un champ ne doit pas afficher un bloc vide.
const mergeFactureTexts = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FACTURE_TEXTS };
  const out = { ...DEFAULT_FACTURE_TEXTS };
  Object.keys(DEFAULT_FACTURE_TEXTS).forEach(k => {
    if (typeof raw[k] === 'string') out[k] = raw[k];
  });
  return out;
};

const isCustomFactureTexts = (texts) =>
  Object.keys(DEFAULT_FACTURE_TEXTS).some(k => (texts?.[k] ?? '') !== DEFAULT_FACTURE_TEXTS[k]);

// Le bloc paiement est saisi en texte libre, une ligne par entrée au format
// « Libellé : valeur ». On le rend en tableau deux colonnes pour conserver la
// mise en page d'origine ; une ligne sans « : » occupe toute la largeur.
const splitLabelledLines = (text) => String(text || '')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(line => {
    const i = line.indexOf(':');
    if (i === -1) return { label: '', value: line };
    return { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
  });

// « Erde, le 15 Août 2026 ». Sans ville renseignée on garde juste la date.
const buildFaitALe = (ville, dateStr) => {
  const d = formatDateFr(dateStr);
  return ville ? `${ville}, le ${d}` : `le ${d}`;
};

// ─── Ouverture d'un brouillon Gmail prérempli ───
// view=cm : fenêtre de rédaction. fs=1&tf=1 : plein écran, pas la petite popup
// d'angle. Pas de /u/0/ : Gmail utilise le compte déjà connecté dans le navigateur.
const buildGmailUrl = ({ to, cc, subject, body }) => {
  const params = new URLSearchParams();
  if (to) params.set('to', to);
  if (cc) params.set('cc', cc);
  if (subject) params.set('su', subject);
  if (body) params.set('body', body);
  return `https://mail.google.com/mail/?view=cm&fs=1&tf=1&${params.toString()}`;
};

const buildMailtoUrl = ({ to, cc, subject, body }) => {
  const q = [];
  if (cc) q.push(`cc=${encodeURIComponent(cc)}`);
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent(to || '')}${q.length ? `?${q.join('&')}` : ''}`;
};

// Téléchargement local d'un Blob déjà en mémoire (le PDF qui vient d'être uploadé) :
// évite un aller-retour par le module Documents pour joindre la facture au mail.
const downloadBlob = (win, blob, fileName) => {
  const doc = win?.document;
  if (!doc || !win.URL?.createObjectURL) return false;
  const url = win.URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  setTimeout(() => { try { win.URL.revokeObjectURL(url); } catch (e) {} }, 4000);
  return true;
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
    prestation: DEFAULT_FACTURE_TEXTS.prestationDefaut,
    referenceContratDevis: '',
    montant: '',
    devise: 'CHF',
    htOuTtc: 'HT',
    faitALe: buildFaitALe(DEFAULT_FACTURE_TEXTS.ville, todayStr),
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

  // ─── Textes du document, propres à l'établissement facturé ───
  // Lecture synchrone quand le cache user_settings est hydraté (cas normal après
  // login) ; sinon repli sur la lecture async qui interroge la DB.
  const readFactureTextsSync = (id) => mergeFactureTexts(legacySB?.db?.getUserSettingSync?.(factureTextsKey(id)));
  const [factureTexts, setFactureTexts] = React.useState(() => readFactureTextsSync(etabId));
  const [showTextsEditor, setShowTextsEditor] = React.useState(false);
  const [textsDraft, setTextsDraft] = React.useState(DEFAULT_FACTURE_TEXTS);
  // L'établissement visé est figé à l'ouverture de l'éditeur : changer de
  // destinataire pendant l'édition ne doit pas écrire sur le mauvais client.
  const [textsEtabId, setTextsEtabId] = React.useState(etabId);
  const [textsBusy, setTextsBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isConsultant || !selectedEtabId) return undefined;
    // Changement de client = on repart de sa prestation type ; le champ reste
    // librement modifiable pour la facture en cours.
    const apply = (texts) => {
      setFactureTexts(texts);
      setForm(prev => ({ ...prev, prestation: texts.prestationDefaut }));
    };
    if (legacySB?.db?.isUserSettingsCacheReady?.()) {
      apply(readFactureTextsSync(selectedEtabId));
      return undefined;
    }
    let mounted = true;
    (async () => {
      try {
        const raw = await legacySB?.db?.getUserSetting?.(factureTextsKey(selectedEtabId));
        if (mounted) apply(mergeFactureTexts(raw));
      } catch (err) {
        console.warn('[Factures] lecture des textes de facture', err);
        if (mounted) apply({ ...DEFAULT_FACTURE_TEXTS });
      }
    })();
    return () => { mounted = false; };
  }, [selectedEtabId]);

  const openTextsEditor = () => {
    setTextsEtabId(selectedEtabId || etabId);
    setTextsDraft({ ...factureTexts });
    setShowTextsEditor(true);
  };

  const saveFactureTexts = async () => {
    const clean = mergeFactureTexts(textsDraft);
    setTextsBusy(true);
    try {
      if (legacySB?.db?.setUserSetting) {
        await legacySB.db.setUserSetting(factureTextsKey(textsEtabId), clean);
      }
      if (textsEtabId === selectedEtabId) {
        // La prestation en cours suit le nouveau texte type seulement si elle
        // n'a pas été retouchée pour cette facture-là.
        const previousDefault = factureTexts.prestationDefaut;
        setFactureTexts(clean);
        setForm(prev => (prev.prestation === previousDefault
          ? { ...prev, prestation: clean.prestationDefaut }
          : prev));
      }
      setShowTextsEditor(false);
      notifyLegacy('Textes de facture enregistrés pour cet établissement.', 'success');
    } catch (err) {
      console.error('[Factures] enregistrement des textes', err);
      notifyLegacy('Enregistrement impossible : ' + err.message, 'error');
    } finally {
      setTextsBusy(false);
    }
  };

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

  // Quand on change l'établissement sélectionné, pré-remplir le destinataire :
  // le bloc client enregistré pour ce client prime, sinon on le reconstruit
  // depuis sa fiche.
  React.useEffect(() => {
    const sel = etabsAll.find(e => e.id === selectedEtabId);
    if (!sel && !factureTexts.client) return;
    setForm(prev => ({ ...prev, destinataire: factureTexts.client || buildDestinataireFromEtab(sel) }));
  }, [selectedEtabId, etabsAll, factureTexts.client]);

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
  const [emailDraft, setEmailDraft] = React.useState(null); // { to, cc, subject, body, fileName, blob, etabNom }
  const [showTemplateEditor, setShowTemplateEditor] = React.useState(false);
  // Le PDF ne peut pas être joint par URL : on trace si l'utilisateur l'a déjà
  // téléchargé pour afficher l'étape suivante plutôt qu'un simple avertissement.
  const [attachmentSaved, setAttachmentSaved] = React.useState(false);

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

  // Objet du mail : template au même titre que le corps (mêmes variables).
  const [emailSubjectTpl, setEmailSubjectTpl] = React.useState(() => {
    const v = legacySB?.db?.getUserSettingSync?.('email_facture_subject');
    return v ? String(v) : DEFAULT_EMAIL_SUBJECT;
  });

  // Copie systématique (comptable, archive perso...) préremplie dans chaque brouillon.
  const [emailCcDefault, setEmailCcDefault] = React.useState(() => {
    const v = legacySB?.db?.getUserSettingSync?.('email_facture_cc');
    return v ? String(v) : '';
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
  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB?.db?.setUserSetting) return;
    legacySB.db.setUserSetting('email_facture_subject', String(emailSubjectTpl || '')).catch(err => {
      console.warn('[Factures] save email_facture_subject failed', err);
    });
  }, [emailSubjectTpl]);
  React.useEffect(() => {
    if (!isConsultant) return;
    if (!legacySB?.db?.setUserSetting) return;
    legacySB.db.setUserSetting('email_facture_cc', String(emailCcDefault || '')).catch(err => {
      console.warn('[Factures] save email_facture_cc failed', err);
    });
  }, [emailCcDefault]);

  // Insertion d'une variable à l'endroit du curseur dans l'éditeur de message type
  const templateBodyRef = React.useRef(null);
  const insertTemplateVar = (name) => {
    const token = `{{${name}}}`;
    const el = templateBodyRef.current;
    if (!el) { setEmailTemplate(prev => `${prev}${token}`); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setEmailTemplate(`${el.value.slice(0, start)}${token}${el.value.slice(end)}`);
    // Le curseur est repositionné après le re-render, sinon React le renvoie en fin de champ.
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  // Fermeture des modales avec la touche Échap (UX standard)
  React.useEffect(() => {
    if (!showEmailModal && !showTemplateEditor && !showTextsEditor) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showEmailModal) setShowEmailModal(false);
        else if (showTemplateEditor) setShowTemplateEditor(false);
        else if (showTextsEditor) setShowTextsEditor(false);
      }
    };
    browserWindow?.addEventListener('keydown', onKey);
    return () => browserWindow?.removeEventListener('keydown', onKey);
  }, [showEmailModal, showTemplateEditor, showTextsEditor]);

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

  // Recalculer le "Fait à Erde le..." quand la date de facturation ou la ville
  // d'émission enregistrée pour ce client change
  React.useEffect(() => {
    setForm(prev => ({ ...prev, faitALe: buildFaitALe(factureTexts.ville, prev.dateFacturation) }));
  }, [form.dateFacturation, factureTexts.ville]);

  // ═══ Brouillon de notification client ═══
  // Objet et corps viennent des templates persistés ; les variables sont
  // résolues sur la facture qui vient d'être envoyée.
  const buildEmailDraft = (fileName, blob) => {
    const targetEtab = etabsAll.find(e => e.id === selectedEtabId) || etablissement;
    const vars = {
      numero: form.numero,
      date: formatDateFr(form.dateFacturation),
      echeance: formatDateFr(form.dateEcheance),
      montant: form.montant ? `${form.montant} ${form.devise} ${form.htOuTtc}` : '',
      etablissement: targetEtab?.nom || '',
      prestation: flattenValue(form.prestation),
      reference: flattenValue(form.referenceContratDevis),
    };
    return {
      to: targetEtab?.email || '',
      cc: emailCcDefault || '',
      subject: renderEmailTemplate(emailSubjectTpl || DEFAULT_EMAIL_SUBJECT, vars),
      body: renderEmailTemplate(emailTemplate, vars),
      fileName,
      blob: blob || null,
      etabNom: targetEtab?.nom || '',
    };
  };

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
        // On récupère le Blob généré pour le proposer en pièce jointe sans
        // repasser par un téléchargement depuis Documents.
        const blob = await sendFactureToDocuments(fileName);
        setSavedToDocs(true);
        setTimeout(() => setSavedToDocs(false), 4000);

        // ─── Préparer le brouillon email si activé ───
        if (emailEnabled) {
          setEmailDraft(buildEmailDraft(fileName, blob));
          setAttachmentSaved(false);
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

    return blob;
  };

  // ═══ Réinitialiser le formulaire (pour faire une nouvelle facture) ═══
  // On commence par un placeholder synchrone puis
  // on remplace par le vrai numéro DB dès qu'il revient - comme au mount.
  const newFacture = async () => {
    // Étape 1 : reset immédiat avec placeholder local non persistant (UX réactif)
    setForm({
      numero: generateFactureNumber(),
      dateFacturation: todayStr,
      dateEcheance: addDaysToDate(todayStr, 11),
      destinataire: form.destinataire,
      prestation: factureTexts.prestationDefaut,
      referenceContratDevis: '',
      montant: '',
      devise: 'CHF',
      htOuTtc: 'HT',
      faitALe: buildFaitALe(factureTexts.ville, todayStr),
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

  const selectedEtabNom = etabsAll.find(e => e.id === selectedEtabId)?.nom
    || (selectedEtabId === etabId ? etablissement?.nom : '')
    || 'cet établissement';
  const textsCustomized = isCustomFactureTexts(factureTexts);
  // Bloc client dérivé de la fiche de l'établissement en cours d'édition :
  // affiché en placeholder pour montrer ce qui sera utilisé tant que le champ
  // reste vide, sans figer le texte à la première ouverture de l'éditeur.
  const autoClientBlock = buildDestinataireFromEtab(etabsAll.find(e => e.id === textsEtabId));

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

            <div style={fac.datesRow}>
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
            <div style={{ ...fac.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>Textes du document</span>
              {textsCustomized && <span style={fac.badge}>Personnalisés</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
              Émetteur, bloc client, coordonnées de paiement, mention TVA et signature sont
              enregistrés pour <strong>{selectedEtabNom}</strong>. Chaque client peut avoir ses propres textes.
            </div>
            <button style={fac.smallBtn} onClick={openTextsEditor}>
              ✎ Modifier les textes de la facture
            </button>
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
            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
              {emailEnabled
                ? 'Après envoi dans Documents, un brouillon prérempli s\'ouvre directement dans Gmail (objet, destinataire et message).'
                : 'Aucune notification ne sera proposée après l\'envoi dans Documents.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                style={fac.smallBtn}
                onClick={() => setShowTemplateEditor(true)}
              >
                ✎ Modifier le message type
              </button>
              {emailDraft && (
                <button
                  style={fac.smallBtn}
                  onClick={() => setShowEmailModal(true)}
                  title={`Brouillon de la facture ${emailDraft.fileName}`}
                >
                  ✉ Rouvrir le dernier brouillon
                </button>
              )}
            </div>
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
          <FactureRender form={form} etablissement={etablissement} textes={factureTexts} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALE 1 : Brouillon email après upload facture
         ═══════════════════════════════════════════════════════════════ */}
      {showEmailModal && emailDraft && (
        // L'overlay ne ferme PAS la modale au clic (UX trop fragile pour une zone de saisie).
        // Fermeture uniquement via : bouton ✕, bouton "Fermer", ou touche Échap.
        <div className="modal-full-overlay" style={fac.overlay}>
          <div className="modal-full" style={{ ...fac.modal, width: 640, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={fac.modalHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Notifier le client</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Facture n° {form.numero} · <strong>{emailDraft.etabNom || 'client'}</strong>
                </div>
              </div>
              <button style={fac.closeBtn} onClick={() => setShowEmailModal(false)} title="Fermer (Échap)">✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Destinataires */}
              <div style={fac.modalRow2}>
                <div style={{ minWidth: 0 }}>
                  <label style={fac.modalLabel}>Destinataire</label>
                  <input
                    type="email"
                    value={emailDraft.to}
                    onChange={e => setEmailDraft({ ...emailDraft, to: e.target.value })}
                    placeholder="email@client.ch"
                    style={fac.modalInput}
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={fac.modalLabel}>Copie (Cc)</label>
                  <input
                    type="email"
                    value={emailDraft.cc || ''}
                    onChange={e => setEmailDraft({ ...emailDraft, cc: e.target.value })}
                    placeholder="facultatif"
                    style={fac.modalInput}
                  />
                </div>
              </div>
              {!emailDraft.to && (
                <div style={fac.noticeWarn}>
                  Aucune adresse enregistrée pour cet établissement. Renseignez-la ci-dessus, ou dans sa fiche pour les prochaines factures.
                </div>
              )}

              {/* Objet */}
              <div>
                <label style={fac.modalLabel}>Objet</label>
                <input
                  type="text"
                  value={emailDraft.subject}
                  onChange={e => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                  style={fac.modalInput}
                />
              </div>

              {/* Corps */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <label style={fac.modalLabel}>Message</label>
                  <button
                    style={fac.linkBtn}
                    onClick={() => setShowTemplateEditor(true)}
                    title="Modifier le message type utilisé pour toutes les factures"
                  >
                    Modifier le message type
                  </button>
                </div>
                <textarea
                  value={emailDraft.body}
                  onChange={e => setEmailDraft({ ...emailDraft, body: e.target.value })}
                  rows={12}
                  style={{ ...fac.modalInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55, minHeight: 240 }}
                />
              </div>

              {/* Pièce jointe : Gmail ne permet pas de joindre un fichier par URL,
                  on met donc le PDF à un clic de la fenêtre de rédaction. */}
              <div style={attachmentSaved ? fac.attachBoxDone : fac.attachBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18 }}>📎</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Pièce jointe</div>
                    <div style={{ fontSize: 11, opacity: 0.85, wordBreak: 'break-all' }}>{emailDraft.fileName}</div>
                  </div>
                  <button
                    style={fac.attachBtn}
                    disabled={!emailDraft.blob}
                    onClick={() => {
                      if (!emailDraft.blob) return;
                      const ok = downloadBlob(browserWindow, emailDraft.blob, emailDraft.fileName);
                      if (ok) {
                        setAttachmentSaved(true);
                        notifyLegacy('PDF téléchargé, glissez-le dans la fenêtre Gmail.', 'success');
                      } else {
                        notifyLegacy('Téléchargement impossible. Récupérez le PDF dans Documents.', 'error');
                      }
                    }}
                  >
                    {attachmentSaved ? '✓ Téléchargé' : '⬇ Récupérer le PDF'}
                  </button>
                </div>
                <div style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5, opacity: 0.9 }}>
                  {attachmentSaved
                    ? 'Le PDF est dans vos téléchargements : glissez-le dans la fenêtre Gmail avant d\'envoyer.'
                    : 'La facture est déjà classée dans Documents. Récupérez-la ici pour la joindre au message en une fois.'}
                </div>
              </div>
            </div>

            {/* Pas d'espaceur flex ici : le bouton Gmail occupe la place restante,
                donc il passe pleine largeur quand la barre se réorganise sur mobile. */}
            <div style={fac.modalFooter}>
              <button style={fac.modalGhostBtn} onClick={() => setShowEmailModal(false)}>Fermer</button>

              {/* Copier dans le presse-papiers (secours si Gmail n'est pas le client utilisé) */}
              <button
                style={fac.modalGhostBtn}
                title="Copier objet + message"
                onClick={() => {
                  const txt = `Objet : ${emailDraft.subject}\n\n${emailDraft.body}`;
                  const clipboard = browserWindow?.navigator?.clipboard;
                  if (clipboard?.writeText) {
                    clipboard.writeText(txt)
                      .then(() => notifyLegacy('Message copié dans le presse-papiers.', 'success'))
                      .catch(() => notifyLegacy('Impossible de copier. Sélectionnez le texte manuellement.', 'error'));
                  } else {
                    notifyLegacy('Presse-papiers non disponible. Sélectionnez le texte manuellement.', 'warning');
                  }
                }}
              >
                📋 Copier
              </button>

              {/* Repli pour un autre client mail que Gmail */}
              <button
                style={fac.modalGhostBtn}
                title="Ouvrir dans le client mail par défaut du poste"
                onClick={() => {
                  const url = buildMailtoUrl(emailDraft);
                  if (url.length > 2000 && !confirmLegacy('Le message est long : certains clients mail vont le tronquer. Continuer quand même ?')) return;
                  if (browserWindow) browserWindow.location.href = url;
                }}
              >
                Autre client mail
              </button>

              {/* Brouillon Gmail prérempli, dans un nouvel onglet */}
              <button
                style={{ ...fac.modalPrimaryBtn, flexGrow: 1, minWidth: 200 }}
                onClick={() => {
                  if (!emailDraft.to && !confirmLegacy('Aucune adresse email. Ouvrir quand même Gmail (vous la saisirez dans le brouillon) ?')) return;
                  const url = buildGmailUrl(emailDraft);
                  const win = browserWindow?.open(url, '_blank', 'noopener,noreferrer');
                  if (!win) {
                    notifyLegacy('Gmail a été bloqué par le navigateur. Autorisez les fenêtres pop-up pour ce site.', 'warning');
                    return;
                  }
                  setTimeout(() => setShowEmailModal(false), 400);
                }}
              >
                ✉ Ouvrir le brouillon Gmail
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
          <div className="modal-full" style={{ ...fac.modal, width: 620, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={fac.modalHeader}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Message type</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Utilisé pour chaque notification de facture
                </div>
              </div>
              <button style={fac.closeBtn} onClick={() => setShowTemplateEditor(false)} title="Fermer (Échap)">✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={fac.modalLabel}>Objet</label>
                <input
                  type="text"
                  value={emailSubjectTpl}
                  onChange={e => setEmailSubjectTpl(e.target.value)}
                  style={fac.modalInput}
                />
              </div>

              <div>
                <label style={fac.modalLabel}>Copie (Cc) par défaut</label>
                <input
                  type="email"
                  value={emailCcDefault}
                  onChange={e => setEmailCcDefault(e.target.value)}
                  placeholder="comptable@exemple.ch (facultatif)"
                  style={fac.modalInput}
                />
              </div>

              <div>
                <label style={fac.modalLabel}>Message</label>
                <textarea
                  ref={templateBodyRef}
                  value={emailTemplate}
                  onChange={e => setEmailTemplate(e.target.value)}
                  rows={14}
                  style={{ ...fac.modalInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55, minHeight: 280 }}
                />
              </div>

              <div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>
                  Variables remplacées à l'envoi (cliquez pour insérer dans le message) :
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EMAIL_VARS.map(v => (
                    <button key={v} type="button" style={fac.varChip} onClick={() => insertTemplateVar(v)}>
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={fac.modalFooter}>
              <button
                style={fac.modalDangerBtn}
                onClick={() => {
                  if (confirmLegacy('Restaurer l\'objet et le message par défaut ?')) {
                    setEmailTemplate(DEFAULT_EMAIL_TEMPLATE);
                    setEmailSubjectTpl(DEFAULT_EMAIL_SUBJECT);
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

      {/* ═══════════════════════════════════════════════════════════════
          MODALE 3 : Textes du document facture (par établissement)
         ═══════════════════════════════════════════════════════════════ */}
      {showTextsEditor && (
        // Enregistrement explicite (pas d'auto-save comme le message type) :
        // les textes visent un établissement précis, une écriture involontaire
        // sur le mauvais client serait invisible jusqu'à la facture suivante.
        <div className="modal-full-overlay" style={fac.overlay}>
          <div className="modal-full" style={{ ...fac.modal, width: 640, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={fac.modalHeader}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Textes de la facture</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  Enregistrés pour <strong>{selectedEtabNom}</strong>
                </div>
              </div>
              <button style={fac.closeBtn} onClick={() => setShowTextsEditor(false)} title="Fermer (Échap)">✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FACTURE_TEXT_FIELDS.map(f => (
                <div key={f.key}>
                  <label style={fac.modalLabel}>{f.label}</label>
                  {f.rows > 0 ? (
                    <textarea
                      value={textsDraft[f.key] ?? ''}
                      onChange={e => setTextsDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      rows={f.rows}
                      placeholder={f.key === 'client' ? autoClientBlock : undefined}
                      style={{ ...fac.modalInput, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }}
                    />
                  ) : (
                    <input
                      type="text"
                      value={textsDraft[f.key] ?? ''}
                      onChange={e => setTextsDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={fac.modalInput}
                    />
                  )}
                  {f.hint && (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 }}>{f.hint}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={fac.modalFooter}>
              <button
                style={fac.modalDangerBtn}
                onClick={() => {
                  if (confirmLegacy('Restaurer les textes par défaut pour cet établissement ?')) {
                    setTextsDraft({ ...DEFAULT_FACTURE_TEXTS });
                  }
                }}
              >
                ↺ Réinitialiser
              </button>
              <div style={{ flex: 1 }} />
              <button style={fac.modalGhostBtn} onClick={() => setShowTextsEditor(false)}>Annuler</button>
              <button
                style={{ ...fac.modalPrimaryBtn, opacity: textsBusy ? 0.6 : 1 }}
                onClick={saveFactureTexts}
                disabled={textsBusy}
              >
                {textsBusy ? '⏳ Enregistrement…' : '✓ Enregistrer'}
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
const FactureRender = ({ form, etablissement, textes }) => {
  const t = mergeFactureTexts(textes);
  const montantNum = parseFloat(form.montant || 0);
  const montantFormat = isNaN(montantNum) ? '-' : montantNum.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div id="facture-print" style={fr.page}>
      <div style={fr.titleBar}>
        {t.titre} N° {form.numero}
      </div>

      <div style={fr.twoColTop}>
        <div style={fr.partyBox}>
          <div style={fr.partyLabel}>Émetteur :</div>
          <div style={{ ...fr.partyText, whiteSpace: 'pre-line' }}>{t.emetteur}</div>
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
            <td style={{ ...fr.detailVal, fontSize: 14, fontWeight: 700, color: '#003042' }}>
              {form.devise} {montantFormat} {form.htOuTtc}
            </td>
          </tr>
          <tr><td style={fr.detailLabel}>Échéance paiement :</td><td style={fr.detailVal}>{formatDateFr(form.dateEcheance)}</td></tr>
          {t.adresseEmission && (
            <tr><td style={fr.detailLabel}>Adresse d'émission :</td><td style={fr.detailVal}>{t.adresseEmission}</td></tr>
          )}
        </tbody>
      </table>

      {t.paiement.trim() && (
        <div style={fr.section}>
          {t.paiementTitre && <div style={fr.sectionTitle}>{t.paiementTitre}</div>}
          <table style={fr.bankTable}>
            <tbody>
              {splitLabelledLines(t.paiement).map((l, i) => (
                <tr key={i}>
                  {l.label ? (
                    <>
                      <td style={fr.bankLabel}>{l.label} :</td>
                      <td style={fr.bankVal}>{l.value}</td>
                    </>
                  ) : (
                    <td style={fr.bankVal} colSpan={2}>{l.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {t.mentionTva.trim() && (
        <div style={{ ...fr.tva, whiteSpace: 'pre-line' }}>{t.mentionTva}</div>
      )}

      <div style={fr.signature}>
        <div style={fr.signatureLine}>Fait à {form.faitALe}</div>
        <div style={{ ...fr.signatureSig, whiteSpace: 'pre-line' }}>{t.signature}</div>
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
  // minmax(0,1fr) : sans le minimum 0, la largeur intrinsèque des input[type=date]
  // élargit les colonnes et fait déborder la 2e date du cadre sur mobile.
  row2: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  // Rangée des deux dates (facturation / échéance) : auto-fit pour qu'elles
  // s'empilent sous ~330px au lieu de rester serrées et de tronquer la valeur.
  datesRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },

  actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  primaryBtn: { flex: 1, padding: '12px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minWidth: 200 },
  ghostBtn: { flex: 1, padding: '12px 18px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minWidth: 180 },

  successBanner: { background: 'var(--success-bg)', border: '1px solid var(--success-bd)', color: 'var(--success-text)', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 },

  smallBtn: { padding: '7px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: 'var(--text)', fontFamily: 'var(--font)', fontWeight: 500 },

  badge: {
    padding: '2px 8px', borderRadius: 12, background: 'var(--info-bg-soft)',
    border: '1px solid var(--info-bd)', color: 'var(--info-text)',
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
    fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },

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

  // ─── Modales email ───
  // (elles vivaient par erreur dans l'objet `fr` réservé à la facture imprimable,
  //  donc toutes les clés `fac.modal*` sortaient undefined et les modales
  //  s'affichaient sans mise en forme)
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHeader: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexShrink: 0 },
  modalFooter: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0, background: 'var(--surface)' },
  modalLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, display: 'block', marginBottom: 4 },
  modalInput: { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  modalPrimaryBtn: { padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  modalGhostBtn: { padding: '8px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  modalDangerBtn: { padding: '8px 14px', background: 'none', color: 'var(--danger-strong)', border: '1px solid var(--danger-bd)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)', lineHeight: 1, flexShrink: 0 },

  // Destinataire + Cc côte à côte, empilés dès que la modale est étroite
  modalRow2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 },

  linkBtn: {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    color: 'var(--accent)', fontFamily: 'var(--font)', fontSize: 11, fontWeight: 600,
    textDecoration: 'underline', textUnderlineOffset: 2,
  },

  noticeWarn: {
    padding: '9px 12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)',
    color: 'var(--warning-text)', borderRadius: 8, fontSize: 11, lineHeight: 1.5,
  },

  attachBox: {
    padding: 12, borderRadius: 10,
    background: 'var(--info-bg-soft)', border: '1px solid var(--info-bd)', color: 'var(--info-text)',
  },
  attachBoxDone: {
    padding: 12, borderRadius: 10,
    background: 'var(--success-bg-soft)', border: '1px solid var(--success-bd)', color: 'var(--success-text)',
  },
  attachBtn: {
    padding: '8px 13px', background: 'var(--surface)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
  },

  varChip: {
    padding: '5px 9px', borderRadius: 14, background: 'var(--bg)',
    border: '1px solid var(--border)', color: 'var(--text2)',
    fontFamily: 'monospace', fontSize: 11, cursor: 'pointer',
  },
};

// Styles facture imprimable (FR = facture render)
const fr = {
  page: { background: '#fff', padding: '30px 36px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#222', maxWidth: 720, margin: '0 auto', fontSize: 11 },
  titleBar: { textAlign: 'center', fontSize: 16, fontWeight: 700, padding: '10px 0', borderBottom: '2px solid #003042', marginBottom: 18, letterSpacing: 0.5, color: '#003042', fontFamily: 'Arial, Helvetica, sans-serif' },
  twoColTop: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 },
  partyBox: { padding: '10px 12px', background: '#fafaf6', borderLeft: '3px solid #003042', borderRadius: 4 },
  partyLabel: { fontSize: 10, fontWeight: 700, color: '#003042', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, fontFamily: 'Arial, Helvetica, sans-serif' },
  partyText: { fontSize: 11, lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' },
  detailTable: { width: '100%', borderCollapse: 'collapse', marginBottom: 18, fontSize: 11, fontFamily: 'Arial, Helvetica, sans-serif' },
  detailLabel: { padding: '7px 12px', borderBottom: '1px solid #e8e0c8', fontWeight: 600, width: '38%', verticalAlign: 'top' },
  detailVal: { padding: '7px 12px', borderBottom: '1px solid #e8e0c8' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#003042', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #d4c8a0', fontFamily: 'Arial, Helvetica, sans-serif' },
  bankTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'Arial, Helvetica, sans-serif' },
  bankLabel: { padding: '4px 12px', fontWeight: 600, width: '38%', color: '#555' },
  bankVal: { padding: '4px 12px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11 },
  tva: { fontSize: 10, color: '#666', fontStyle: 'italic', textAlign: 'center', padding: '10px 0', borderTop: '1px dotted #d4c8a0', borderBottom: '1px dotted #d4c8a0', marginBottom: 14, fontFamily: 'Arial, Helvetica, sans-serif' },
  signature: { marginTop: 14, fontSize: 11, fontFamily: 'Arial, Helvetica, sans-serif' },
  signatureLine: { marginBottom: 18 },
  signatureSig: { fontSize: 11, lineHeight: 1.5, fontFamily: 'Arial, Helvetica, sans-serif' },
};

export default Factures;
