import React from 'react';
import { Fenetre, Options, st } from './planningUi.jsx';
import { ajouterJours } from './planningModeles.js';
import { exporterExcel, libellePeriode, payloadEquipe, payloadPersonnes, payloadPointages } from './planningExport.js';
import { pdfUtils } from '../../services/pdf.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Exporter : un seul endroit pour tous les documents du planning. On choisit
// le document, la période et, au besoin, le groupe ou la personne.
// Les PDF sont construits depuis les données (pas de capture d'écran).
// Sans le droit d'export de l'équipe, chacun télécharge son propre planning.
// ─────────────────────────────────────────────────────────────────────────────

const finDuMois = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).toISOString().slice(0, 10);
};

export default function ExportModal({
  semaine, horizon, user, peutExporterEquipe, personnes, groupes, groupeDe, groupeNomDe,
  shifts, absenceDe, nomDe, etablissement, onCCNT, onClose,
}) {
  const [doc, setDoc] = React.useState(peutExporterEquipe ? 'equipe' : 'personnes');
  const [periode, setPeriode] = React.useState('affichee');
  const [du, setDu] = React.useState(semaine);
  const [au, setAu] = React.useState(ajouterJours(semaine, 6));
  const [groupe, setGroupe] = React.useState('tous');
  const [personne, setPersonne] = React.useState(peutExporterEquipe ? 'tous' : user.id);
  const [enCours, setEnCours] = React.useState(false);

  const debutMois = semaine.slice(0, 8) + '01';
  const [debut, fin] = periode === 'mois'
    ? [debutMois, finDuMois(semaine)]
    : periode === 'perso'
      ? [du, au]
      : [semaine, ajouterJours(semaine, horizon * 7 - 1)];
  const periodeOk = debut && fin && debut <= fin;

  const dansGroupe = (p) => groupe === 'tous' || groupeDe(p.id) === groupe;
  const choisis = personnes.filter(dansGroupe).filter(p => doc !== 'personnes' || personne === 'tous' || p.id === personne);
  const nomEtab = etablissement?.nom || '';
  const nomGroupe = groupe === 'tous' ? '' : (groupes.find(g => g.id === groupe)?.nom || '');
  const sousTitre = [nomEtab, nomGroupe && nomGroupe.toLowerCase(), libellePeriode(debut, fin)].filter(Boolean).join(', ');

  // Sections par groupe pour le planning d'équipe (un seul bloc si un groupe est choisi).
  const sections = groupe !== 'tous' || !groupes.length
    ? [{ nom: null, personnes: choisis }]
    : [
        ...groupes.map(g => ({ nom: g.nom, personnes: choisis.filter(p => groupeDe(p.id) === g.id) })),
        { nom: 'Sans groupe', personnes: choisis.filter(p => !groupeDe(p.id)) },
      ].filter(s => s.personnes.length);

  const exporter = async () => {
    if (doc === 'ccnt') { onClose(); onCCNT(); return; }
    if (!periodeOk || enCours) return;
    setEnCours(true);
    const base = `${debut}${debut !== fin ? `-au-${fin}` : ''}`;
    try {
      if (doc === 'equipe') {
        await pdfUtils.exportPlanningPdf(
          payloadEquipe({ titre: 'Planning de l\'équipe', sousTitre, debut, fin, sections, shifts, absenceDe, nomDe }),
          { etablissement, filename: `planning-equipe-${base}.pdf` },
        );
      } else if (doc === 'personnes') {
        // « Toutes » : pas de page pour qui n'a aucun horaire sur la période.
        const avecHoraires = choisis.length > 1
          ? choisis.filter(p => shifts.some(s => s.userId === p.id && s.date >= debut && s.date <= fin))
          : choisis;
        const seul = avecHoraires.length === 1 ? avecHoraires[0] : null;
        await pdfUtils.exportPlanningPdf(
          payloadPersonnes({ titre: 'Planning', sousTitre, debut, fin, personnes: avecHoraires, shifts, absenceDe, nomDe }),
          { etablissement, filename: seul ? `planning-${nomDe(seul.id).toLowerCase().replace(/\s+/g, '-')}-${base}.pdf` : `planning-par-personne-${base}.pdf` },
        );
      } else if (doc === 'pointages') {
        await pdfUtils.exportPlanningPdf(
          payloadPointages({ titre: 'Pointages', sousTitre, debut, fin, personnesIds: choisis.map(p => p.id), shifts, nomDe }),
          { etablissement, filename: `pointages-${base}.pdf` },
        );
      } else if (doc === 'excel') {
        const res = await exporterExcel({ nomFichier: `heures-${base}.xlsx`, debut, fin, personnes: choisis, shifts, nomDe, groupeNomDe });
        if (!res.lignes) notifyLegacy('Aucun horaire sur cette période : le classeur est vide.', 'warning');
      }
      onClose();
    } catch (err) {
      console.error('[Planning export]', err);
      if (doc === 'excel') notifyLegacy('Export Excel échoué : ' + (err?.message || 'erreur inconnue'), 'error');
    } finally {
      setEnCours(false);
    }
  };

  const optionsDoc = peutExporterEquipe
    ? [
        { v: 'equipe', label: 'Planning de l\'équipe', detail: 'PDF, une semaine par page, toute l\'équipe ou un groupe.' },
        { v: 'personnes', label: 'Planning par personne', detail: 'PDF, une page par personne, à remettre ou à afficher.' },
        { v: 'pointages', label: 'Pointages', detail: 'PDF, arrivées, départs et écarts, jour par jour.' },
        { v: 'excel', label: 'Heures pour les salaires', detail: 'Excel, le total par personne et le détail des horaires.' },
        { v: 'ccnt', label: 'Relevé CCNT', detail: 'Le relevé mensuel d\'une personne, conforme CCNT.' },
      ]
    : [{ v: 'personnes', label: 'Mon planning', detail: 'PDF de mes horaires.' }];

  return (
    <Fenetre
      id="planning-exporter"
      titre="Exporter"
      sousTitre={nomEtab}
      onClose={onClose}
      largeur={500}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="button" style={{ ...st.primaire, opacity: (doc === 'ccnt' || (periodeOk && choisis.length)) && !enCours ? 1 : 0.5 }}
            onClick={exporter} disabled={enCours || (doc !== 'ccnt' && (!periodeOk || !choisis.length))}>
            {enCours ? 'Préparation…' : doc === 'ccnt' ? 'Ouvrir le relevé' : 'Télécharger'}
          </button>
        </>
      )}
    >
      {optionsDoc.length > 1 && (
        <div>
          <div style={st.label}>Document</div>
          <Options nom="export-doc" valeur={doc} onChange={setDoc} options={optionsDoc} />
        </div>
      )}

      {doc !== 'ccnt' && (
        <div>
          <div style={st.label}>Période</div>
          <Options
            nom="export-periode"
            valeur={periode}
            onChange={setPeriode}
            options={[
              { v: 'affichee', label: horizon > 1 ? `Les ${horizon} semaines affichées` : 'La semaine affichée', detail: libellePeriode(semaine, ajouterJours(semaine, horizon * 7 - 1)) },
              { v: 'mois', label: 'Le mois', detail: libellePeriode(debutMois, finDuMois(semaine)) },
              { v: 'perso', label: 'D\'autres dates' },
            ]}
          />
          {periode === 'perso' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <label style={st.label} htmlFor="export-du">Du</label>
                <input id="export-du" type="date" style={{ ...st.champ, marginTop: 4 }} value={du} onChange={e => setDu(e.target.value)} />
              </div>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <label style={st.label} htmlFor="export-au">Au</label>
                <input id="export-au" type="date" style={{ ...st.champ, marginTop: 4 }} value={au} onChange={e => setAu(e.target.value)} />
              </div>
            </div>
          )}
          {!periodeOk && <div style={{ ...st.remarque, color: 'var(--danger-text)', marginTop: 4 }}>La date de fin doit suivre celle de début.</div>}
        </div>
      )}

      {peutExporterEquipe && doc !== 'ccnt' && groupes.length > 0 && (
        <div>
          <label style={st.label} htmlFor="export-groupe">Groupe</label>
          <select id="export-groupe" style={{ ...st.champ, marginTop: 4 }} value={groupe} onChange={e => setGroupe(e.target.value)}>
            <option value="tous">Toute l'équipe</option>
            {groupes.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
          </select>
        </div>
      )}

      {peutExporterEquipe && doc === 'personnes' && (
        <div>
          <label style={st.label} htmlFor="export-personne">Personne</label>
          <select id="export-personne" style={{ ...st.champ, marginTop: 4 }} value={personne} onChange={e => setPersonne(e.target.value)}>
            <option value="tous">Toutes, une page par personne</option>
            {personnes.filter(dansGroupe).map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
          </select>
        </div>
      )}

      {doc !== 'ccnt' && periodeOk && !choisis.length && (
        <div style={st.remarque}>Personne dans ce choix.</div>
      )}
    </Fenetre>
  );
}
