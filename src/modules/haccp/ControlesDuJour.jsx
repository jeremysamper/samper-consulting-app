import React from 'react';
import { userDisplay } from '../../utils/userDisplay.js';
import { etatControle } from './haccpJour.js';

// ─────────────────────────────────────────────────────────────────────────────
// Les contrôles d'hygiène d'une journée, rangés par ce qu'il reste à faire :
//   À faire aujourd'hui : les contrôles dus pas encore faits, chacun avec
//     « C'est fait » (écrit tout de suite : aujourd'hui, heure réelle, bon) et
//     « Un problème » (le formulaire, statut problème, heure pré-remplie) ;
//   Déjà fait : qui, quand, et le résultat ;
//   Quand il y a lieu : à chaque livraison, sur demande, jamais « à faire »,
//     avec la dernière fois.
// Dû ou fait selon la fréquence (etatControle, haccpJour.js). Sur un autre
// jour que celui d'aujourd'hui, la liste se lit sans boutons.
//
// Crochet du banc : data-controle-fait sur chaque « C'est fait ».
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

// « hier », « aujourd'hui » ou « 27.10. ».
function Jour({ date, today }) {
  if (date === today) return <>aujourd'hui</>;
  const [y, m, d] = String(date).split('-').map(Number);
  const hier = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) === today;
  if (hier) return <>hier</>;
  return <N>{`${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`}</N>;
}

// « Quotidien » se lit « Tous les jours » ; les autres fréquences restent
// celles des réglages.
const frequenceEnClair = (f) => (f === 'Quotidien' ? 'Tous les jours' : f);

function Resultat({ statut }) {
  return statut === 'conforme'
    ? <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>Bon</span>
    : <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>Problème signalé</span>;
}

export default function ControlesDuJour({ tpls, controls, date, today, enCours, onFait, onProbleme }) {
  const aujourdhui = date === today;
  const lignes = tpls.map(t => ({ tpl: t, ...etatControle(t, controls, date) }));
  const aFaire = lignes.filter(l => l.du && !l.fait);
  const faits = lignes.filter(l => (l.du && l.fait) || (!l.du && l.dernier?.date === date));
  const occasionnels = lignes.filter(l => !l.du);

  const boutons = (tpl) => aujourdhui && (
    <div style={st.boutons}>
      <button type="button" data-controle-fait="" data-cadre="" disabled={enCours.has(tpl.id)} style={st.fait} onClick={() => onFait(tpl)}>
        {enCours.has(tpl.id) ? 'Enregistrement…' : "C'est fait"}
      </button>
      <button type="button" data-cadre="" style={st.probleme} onClick={() => onProbleme(tpl)}>Un problème</button>
    </div>
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
                  {' '}par <N>{userDisplay(dernier.operateur).name}</N>. <Resultat statut={dernier.statut} />
                </div>
                {dernier.notes && <div style={st.notes}>{dernier.notes}</div>}
              </div>
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
                    ? <><Jour date={dernier.date} today={date} /> à <N>{String(dernier.heure || '').slice(0, 5)}</N></>
                    : <>jamais</>}
                </div>
              </div>
              {boutons(tpl)}
            </div>
          ))}
        </section>
      )}

      {!lignes.length && <div style={st.vide}>Rien à faire aujourd'hui</div>}
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
  vide: { fontSize: 14, color: 'var(--text2)' },
};
