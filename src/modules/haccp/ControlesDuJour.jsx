import React from 'react';
import { userDisplay } from '../../utils/userDisplay.js';
import { zurichAjouterJours } from '../../utils/zurichTime.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { etatControle } from './haccpJour.js';
import { hcfg, hs } from './HACCP.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// Les contrôles d'hygiène d'une journée, rangés par ce qu'il reste à faire :
//   À faire aujourd'hui : les contrôles dus pas encore faits, chacun avec
//     « C'est fait » (écrit tout de suite : aujourd'hui, heure réelle, bon) et
//     « Un problème » (le formulaire, statut problème, heure pré-remplie) ;
//   Déjà fait : qui, quand, et le résultat ; « Annuler » deux minutes sur
//     ce qu'on vient de noter par « C'est fait », pour qui gère le HACCP
//     (annuler supprime : même droit que la suppression) ;
//   Quand il y a lieu : à chaque livraison, sur demande, jamais « à faire »,
//     avec la dernière fois (qui, résultat) et ses boutons, même déjà fait
//     ce jour (une deuxième livraison).
// Dû ou fait selon la fréquence (etatControle, haccpJour.js). Sur un autre
// jour que celui d'aujourd'hui, la liste se lit sans boutons.
//
// Plus bas, HistoriqueControles : tout l'historique, 30 jours à la fois.
//
// Crochets du banc : data-controle-fait sur chaque « C'est fait »,
// data-controle-annuler sur chaque « Annuler ».
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

// « hier », « aujourd'hui », « 27.10. », ou « 27.12.2025 » une autre année.
function Jour({ date, today }) {
  if (date === today) return <>aujourd'hui</>;
  const [y, m, d] = String(date).split('-').map(Number);
  const hier = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) === today;
  if (hier) return <>hier</>;
  const annee = String(y) === String(today).slice(0, 4) ? '' : String(y);
  return <N>{`${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${annee}`}</N>;
}

// « Quotidien » se lit « Tous les jours » ; les autres fréquences restent
// celles des réglages.
const frequenceEnClair = (f) => (f === 'Quotidien' ? 'Tous les jours' : f);

function Resultat({ statut }) {
  return statut === 'conforme'
    ? <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>Bon</span>
    : <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>Problème signalé</span>;
}

export default function ControlesDuJour({
  tpls, controls, date, today, enCours, onFait, onProbleme, annulables, annulationEnCours, onAnnuler,
}) {
  const aujourdhui = date === today;
  const lignes = tpls.map(t => ({ tpl: t, ...etatControle(t, controls, date) }));
  const aFaire = lignes.filter(l => l.du && !l.fait);
  // Un contrôle « quand il y a lieu » fait ce jour reste dans sa section, avec
  // sa dernière fois et ses boutons (une deuxième livraison le même jour) :
  // jamais deux fois à l'écran.
  const faits = lignes.filter(l => l.du && l.fait);
  const occasionnels = lignes.filter(l => !l.du);

  const boutons = (tpl) => aujourdhui && (
    <div style={st.boutons}>
      <button type="button" data-controle-fait="" data-cadre="" disabled={enCours.has(tpl.id)} style={st.fait} onClick={() => onFait(tpl)}>
        {enCours.has(tpl.id) ? 'Enregistrement…' : "C'est fait"}
      </button>
      <button type="button" data-cadre="" style={st.probleme} onClick={() => onProbleme(tpl)}>Un problème</button>
    </div>
  );
  // « Annuler » sur ce qu'on vient de noter par « C'est fait » (deux
  // minutes, qui gère le HACCP) : un toucher sur le mauvais bouton se rattrape.
  const annuler = (dernier) => aujourdhui && dernier && annulables?.has(dernier.id) && (
    <button
      type="button" data-cadre="" data-controle-annuler="" disabled={!!annulationEnCours}
      style={st.annuler} onClick={() => onAnnuler(dernier.id)}
    >{annulationEnCours === dernier.id ? 'Annulation…' : 'Annuler'}</button>
  );
  const parQui = (dernier) => (
    <>{' '}par <N>{userDisplay(dernier.operateur).name}</N>. <Resultat statut={dernier.statut} /></>
  );

  return (
    <div style={st.racine}>
      {aFaire.length > 0 && (
        <section style={st.section}>
          <div style={st.titre}>{aujourdhui ? <>À faire aujourd'hui</> : <>Pas fait</>}</div>
          {aFaire.map(({ tpl }) => (
            <div key={tpl.id} style={st.ligne}>
              <div style={st.texte}>
                <div style={st.nom}>{tpl.label}</div>
                <div style={st.detail}>
                  {frequenceEnClair(tpl.frequence)}
                  {tpl.description && <>. {tpl.description}</>}
                </div>
              </div>
              {boutons(tpl)}
            </div>
          ))}
        </section>
      )}

      {faits.length > 0 && (
        <section style={st.section}>
          <div style={st.titre}>Déjà fait</div>
          {faits.map(({ tpl, dernier }) => (
            <div key={tpl.id} style={st.ligne}>
              <div style={st.texte}>
                <div style={st.nom}>{tpl.label}</div>
                <div style={st.detail}>
                  {dernier.date === date
                    ? <>Fait à <N>{String(dernier.heure || '').slice(0, 5)}</N></>
                    : <>Dernière fois : <Jour date={dernier.date} today={date} /> à <N>{String(dernier.heure || '').slice(0, 5)}</N></>}
                  {parQui(dernier)}
                </div>
                {dernier.notes && <div style={st.notes}>{dernier.notes}</div>}
              </div>
              {annuler(dernier)}
            </div>
          ))}
        </section>
      )}

      {occasionnels.length > 0 && (
        <section style={st.section}>
          <div style={st.titre}>Quand il y a lieu</div>
          {occasionnels.map(({ tpl, dernier }) => (
            <div key={tpl.id} style={st.ligne}>
              <div style={st.texte}>
                <div style={st.nom}>{tpl.label}</div>
                <div style={st.detail}>
                  {frequenceEnClair(tpl.frequence)}. Dernière fois :{' '}
                  {dernier
                    ? <><Jour date={dernier.date} today={date} /> à <N>{String(dernier.heure || '').slice(0, 5)}</N>{parQui(dernier)}</>
                    : <>jamais</>}
                </div>
                {dernier?.notes && dernier.date === date && <div style={st.notes}>{dernier.notes}</div>}
              </div>
              {annuler(dernier)}
              {boutons(tpl)}
            </div>
          ))}
        </section>
      )}

      {!lignes.length && <div style={st.vide}>Rien à faire aujourd'hui</div>}
    </div>
  );
}

// ─── Tout l'historique des contrôles ───
// Les 30 derniers jours, puis « Voir plus » : 30 jours de plus, comptés
// depuis le contrôle suivant s'il est plus ancien (un trou d'un an ne
// demande pas douze touchers). La liste ne grandit pas sans fin. Dates en clair (« hier », « 27.10. »).
// Sous 600 px de large, une ligne empilée par contrôle au lieu d'un tableau
// qui défile de côté. Supprimer : qui gère le HACCP (canManage).
const PAS_HISTORIQUE_JOURS = 30;

// Jours de a à b inclus (dates YYYY-MM-DD), calendrier sans fuseau.
const joursEntre = (a, b) => {
  const t = (d) => { const [y, m, j] = String(d).split('-').map(Number); return Date.UTC(y, m - 1, j); };
  return Math.round((t(b) - t(a)) / 86400000) + 1;
};

export function HistoriqueControles({ tpls, controls, today, canManage, onSupprimer }) {
  const etroit = useIsMobile(600);
  const [jours, setJours] = React.useState(PAS_HISTORIQUE_JOURS);
  const debut = zurichAjouterJours(today, -(jours - 1));
  const tous = [...controls].sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || '')) || String(b.heure || '').localeCompare(String(a.heure || '')));
  const visibles = tous.filter(c => String(c.date || '') >= debut);
  const reste = tous.length - visibles.length;
  const suivant = tous[visibles.length];
  const voirPlus = () => setJours(j => Math.max(
    j + PAS_HISTORIQUE_JOURS,
    suivant?.date ? joursEntre(suivant.date, today) + PAS_HISTORIQUE_JOURS - 1 : 0,
  ));
  const colonnes = '2fr 90px 60px 120px 130px 2fr' + (canManage ? ' 90px' : '');
  const supprimer = (c) => canManage && (
    <button className="btn-suppr-discret no-print" style={{ ...hcfg.deleteBtn, minHeight: 44 }} onClick={() => onSupprimer(c.id)}>Supprimer</button>
  );

  return (
    <div style={hs.tableCard} className={etroit ? undefined : 'grid-table-scroll'}>
      <div style={hs.tableCardHeader}>Tout l'historique</div>
      {!tous.length && <div style={hs.empty}>Aucun contrôle enregistré.</div>}
      {!etroit && visibles.length > 0 && (
        <div className="grid-table-row" style={{ ...hs.relHead, gridTemplateColumns: colonnes }}>
          <span>Contrôle</span><span>Date</span><span>Heure</span><span>Par</span><span>Résultat</span><span>Notes</span>
          {canManage && <span className="no-print">Action</span>}
        </div>
      )}
      {visibles.map(c => {
        const tpl = tpls.find(t => t.id === c.templateId);
        const op = userDisplay(c.operateur);
        const heure = String(c.heure || '').slice(0, 5);
        if (etroit) {
          return (
            <div key={c.id} data-historique-controle="" style={st.histoLigne}>
              <div style={st.histoTexte}>
                <div style={st.histoHaut}>
                  <span style={st.histoNom}>{tpl?.label}</span>
                  <Resultat statut={c.statut} />
                </div>
                <div style={st.detail}><Jour date={c.date} today={today} /> à <N>{heure}</N>, par <N>{op.name}</N></div>
                {c.notes && <div style={st.notes}>{c.notes}</div>}
              </div>
              {supprimer(c)}
            </div>
          );
        }
        const bon = c.statut === 'conforme';
        return (
          <div key={c.id} data-historique-controle="" className="grid-table-row" style={{ ...hs.relRow, gridTemplateColumns: colonnes }}>
            <span style={{ ...hs.cell, fontWeight: 500 }}>{tpl?.label}</span>
            <span style={hs.cell}><Jour date={c.date} today={today} /></span>
            <span style={hs.cell}><N>{heure}</N></span>
            <span style={hs.cell}><N>{op.name}</N></span>
            <span style={{ ...hs.cell, fontWeight: 600, color: bon ? 'var(--success-text)' : 'var(--danger-strong)' }}>{bon ? 'Bon' : 'Problème signalé'}</span>
            <span style={{ ...hs.cell, fontSize: 12, color: 'var(--text2)' }}>{c.notes || '-'}</span>
            {canManage && <span className="no-print">{supprimer(c)}</span>}
          </div>
        );
      })}
      {reste > 0 && (
        <div className="no-print" style={st.voirPlusRangee}>
          <button type="button" data-historique-voir-plus="" style={st.voirPlus} onClick={voirPlus}>Voir plus</button>
        </div>
      )}
    </div>
  );
}

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 },
  section: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  titre: { fontSize: 15, fontWeight: 600, color: 'var(--text)', paddingBottom: 4 },
  ligne: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', padding: '12px 0', borderBottom: '1px solid var(--border)', minWidth: 0 },
  texte: { flex: '1 1 260px', minWidth: 0 },
  nom: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  detail: { fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  notes: { fontSize: 13, color: 'var(--text)', marginTop: 4, fontStyle: 'italic' },
  // Téléphone : les deux boutons passent sous le libellé et se partagent la
  // largeur ; iPad et ordinateur : à droite du libellé.
  boutons: { display: 'flex', gap: 8, flex: '1 1 300px', maxWidth: 360, minWidth: 0 },
  fait: {
    flex: '1 1 140px', minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r)', border: 'none',
    background: 'var(--success-fill)', color: 'var(--on-success)', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  probleme: {
    flex: '1 1 140px', minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 500, cursor: 'pointer',
  },
  annuler: {
    flex: '0 0 auto', minHeight: 44, padding: '8px 14px', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
  },
  vide: { fontSize: 14, color: 'var(--text2)' },
  histoLigne: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', minWidth: 0 },
  histoTexte: { flex: 1, minWidth: 0 },
  histoHaut: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 14 },
  histoNom: { fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 0 },
  voirPlusRangee: { padding: '4px 16px' },
  voirPlus: {
    minHeight: 44, padding: '8px 0', background: 'none', border: 'none', color: 'var(--accent)',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer',
  },
};
