import React from 'react';
import { Btn, Panneau } from '../../components/ui/index.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { isModuleActiveForEtab } from '../moduleConfig.js';
import { inscrireGeste } from '../../services/tempsGagne.js';
import { zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import { SERVICES_BRIEFING, serviceParDefaut } from './briefingLogique.js';
import { preparerBriefing } from './donneesBriefing.js';

// ─────────────────────────────────────────────────────────────────────────────
// Page « Briefing du service » (lot C3), hors menu, ouverte depuis le widget
// du tableau de bord. Toute l'équipe : chacun ne lit que ce que ses droits
// lisent déjà. « Écouter » lit le briefing à voix haute par la synthèse
// vocale du navigateur (aucun prestataire). Un briefing préparé compte au
// temps gagné une fois par personne, par jour et par service.
// ─────────────────────────────────────────────────────────────────────────────

const cleCompte = (etabId, jour, service, userId) => `sc_briefing_compte_${etabId}_${jour}_${service}_${userId || ''}`;

export default function Briefing({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const jour = zurichToday();
  const [service, setService] = React.useState(() => serviceParDefaut(zurichNowMinutes()));
  const [etat, setEtat] = React.useState({ statut: 'chargement' });
  const [enLecture, setEnLecture] = React.useState(false);
  const voix = typeof window !== 'undefined' && 'speechSynthesis' in window;

  React.useEffect(() => {
    if (!etabId) return undefined;
    let vivant = true;
    setEtat({ statut: 'chargement' });
    preparerBriefing({
      etabId, jour, service,
      avecReservations: isModuleActiveForEtab(etablissement, 'previsions'),
      avecPlanning: isModuleActiveForEtab(etablissement, 'planning'),
      avecHaccp: isModuleActiveForEtab(etablissement, 'haccp'),
      avecPassations: isModuleActiveForEtab(etablissement, 'passations'),
    }).then((b) => {
      if (!vivant) return;
      setEtat({ statut: 'pret', ...b });
      try {
        const cle = cleCompte(etabId, jour, service, user?.id);
        if (!localStorage.getItem(cle)) { localStorage.setItem(cle, '1'); inscrireGeste(etabId, 'briefing_prepare'); }
      } catch { /* stockage indisponible : le gain n'est pas compté */ }
    }).catch(() => { if (vivant) setEtat({ statut: 'erreur' }); });
    return () => { vivant = false; };
  }, [etabId, jour, service, etablissement, user?.id]);

  React.useEffect(() => () => { if (voix) window.speechSynthesis.cancel(); }, [voix]);

  const ecouter = () => {
    if (!voix || etat.statut !== 'pret') return;
    if (enLecture) { window.speechSynthesis.cancel(); setEnLecture(false); return; }
    const u = new window.SpeechSynthesisUtterance(etat.texte);
    u.lang = 'fr-CH';
    u.onend = () => setEnLecture(false);
    u.onerror = () => setEnLecture(false);
    setEnLecture(true);
    window.speechSynthesis.speak(u);
  };

  return (
    <div style={s.page} data-briefing="">
      <header style={s.tete}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.titre}>Briefing du service</h2>
          <p style={s.intro}>Ce qu'il faut savoir avant d'ouvrir, en deux minutes.</p>
        </div>
        <div style={s.actions} className="no-print">
          {voix && <Btn variant="primary" onClick={ecouter} disabled={etat.statut !== 'pret'}>{enLecture ? 'Arrêter la lecture' : 'Écouter'}</Btn>}
          <Btn onClick={() => window.print()} disabled={etat.statut !== 'pret'}>Imprimer</Btn>
        </div>
      </header>

      <div className="no-print">
        <SegmentedTabs tabs={SERVICES_BRIEFING} active={service} onChange={setService} />
      </div>

      {etat.statut === 'chargement' && <p style={s.info} aria-live="polite">Préparation du briefing…</p>}
      {etat.statut === 'erreur' && <p style={s.info} role="alert">Le briefing n'a pas pu être préparé. Réessayez dans un instant.</p>}
      {etat.statut === 'pret' && etat.sections.map((sec) => (
        <Panneau key={sec.id} style={s.carte}>
          <h3 style={s.carteTitre}>{sec.titre}</h3>
          {sec.lignes.map((l, i) => <p key={i} style={s.ligne}>{l}</p>)}
        </Panneau>
      ))}
    </div>
  );
}

const s = {
  page: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880, margin: '0 auto', width: '100%', minWidth: 0 },
  tete: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  titre: { margin: 0, fontFamily: 'var(--font)', fontWeight: 'var(--g2)', fontSize: 'var(--t6)', lineHeight: 1.2, color: 'var(--text)' },
  intro: { margin: '6px 0 0', fontSize: 'var(--t2)', lineHeight: 1.5, color: 'var(--text2)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  info: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  carte: { display: 'flex', flexDirection: 'column', gap: 8 },
  carteTitre: { margin: 0, fontFamily: 'var(--font)', fontWeight: 'var(--g3)', fontSize: 'var(--t3)', color: 'var(--text)' },
  ligne: { margin: 0, fontSize: 'var(--t3)', lineHeight: 1.5, color: 'var(--text)' },
};
