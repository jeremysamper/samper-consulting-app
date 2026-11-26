import { LIMITES, erreurQuestion } from '../../reservation/questionsEnLigne.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglage « Questions au client » de la réservation en ligne (lot 18), dans
// la section des réglages (ReglagesTableEnLigne.jsx). Patron et consultant :
// la règle d'écriture de reservation_en_ligne_parametres le garde en base.
//
// Une ou deux questions à choix, posées au visiteur avant l'envoi. La
// réponse arrive comme une étiquette de la réservation. L'enregistrement
// reste le bouton « Enregistrer les réglages » de la section.
// ─────────────────────────────────────────────────────────────────────────────

// Identifiant donné à la création, jamais recalculé ensuite.
const nouvelId = () => `q${Date.now().toString(36)}${Math.floor(Math.random() * 36 * 36).toString(36)}`.slice(0, 24);

export default function QuestionsEnLigneReglage({ questions = [], onChange, styles: s }) {
  const liste = Array.isArray(questions) ? questions : [];
  const majQuestion = (i, champs) => onChange(liste.map((q, j) => (j === i ? { ...q, ...champs } : q)));
  const majChoix = (i, k, valeur) => majQuestion(i, { choix: liste[i].choix.map((c, j) => (j === k ? valeur : c)) });
  const retirerChoix = (i, k) => majQuestion(i, { choix: liste[i].choix.filter((_, j) => j !== k) });
  const ajouterChoix = (i) => majQuestion(i, { choix: [...liste[i].choix, ''] });
  const retirerQuestion = (i) => onChange(liste.filter((_, j) => j !== i));
  const ajouterQuestion = () => onChange([...liste, { id: nouvelId(), libelle: '', choix: ['', ''], obligatoire: false }]);

  return (
    <div style={s.carte}>
      <div style={s.titre}>Questions au client</div>
      <div style={{ ...s.aide, marginTop: 0, marginBottom: 10 }}>
        Une ou deux questions à choix, posées avant l'envoi de la réservation. La réponse s'affiche comme une étiquette sur la réservation.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {liste.map((q, i) => {
          const erreur = erreurQuestion(q);
          const idChamp = `question-en-ligne-${q.id}`;
          return (
            <div key={q.id} style={styleQuestion}>
              <label htmlFor={idChamp} style={styleLabel}>Question</label>
              <input
                id={idChamp}
                style={s.champ}
                value={q.libelle}
                maxLength={LIMITES.longueur}
                placeholder="Formule"
                onChange={(e) => majQuestion(i, { libelle: e.target.value })}
              />
              <div style={{ ...styleLabel, marginTop: 10 }}>Choix proposés</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {q.choix.map((c, k) => (
                  // Les choix n'ont pas d'identifiant : la place sert de clé
                  // (un choix retiré décale les suivants, sans perte de saisie).
                  <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <input
                      aria-label="Choix proposé"
                      style={{ ...s.champ, flex: '1 1 auto', minWidth: 0 }}
                      value={c}
                      maxLength={LIMITES.longueur}
                      placeholder={k === 0 ? 'Menu du marché' : k === 1 ? 'À la carte' : ''}
                      onChange={(e) => majChoix(i, k, e.target.value)}
                    />
                    <button type="button" onClick={() => retirerChoix(i, k)} style={{ ...s.secondaire, minHeight: 44, flexShrink: 0 }}>
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
              {q.choix.length < LIMITES.choixMax && (
                <button type="button" onClick={() => ajouterChoix(i)} style={{ ...s.secondaire, minHeight: 44, marginTop: 8 }}>
                  Ajouter un choix
                </button>
              )}
              <label style={{ ...s.option, minHeight: 44, alignItems: 'center', marginTop: 4 }}>
                <input
                  type="checkbox"
                  checked={q.obligatoire === true}
                  onChange={(e) => majQuestion(i, { obligatoire: e.target.checked })}
                  style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }}
                />
                <span style={{ fontSize: 'var(--t2)', color: 'var(--text)' }}>Réponse obligatoire</span>
              </label>
              {erreur && <div role="alert" style={{ ...s.erreur, fontSize: 'var(--t1)', marginTop: 4 }}>{erreur}</div>}
              <div style={{ marginTop: 8 }}>
                <button type="button" onClick={() => retirerQuestion(i)} style={{ ...s.secondaire, minHeight: 44 }}>
                  Retirer la question
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {liste.length < LIMITES.questions && (
        <button type="button" onClick={ajouterQuestion} style={{ ...s.secondaire, minHeight: 44, marginTop: liste.length ? 12 : 0 }}>
          Ajouter une question
        </button>
      )}
    </div>
  );
}

const styleQuestion = {
  padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--surface)', minWidth: 0,
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
};
const styleLabel = { display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)', marginBottom: 4 };
