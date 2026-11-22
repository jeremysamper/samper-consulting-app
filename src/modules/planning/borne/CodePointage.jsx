import React from 'react';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { Ligne, ui } from '../../compte/sections/reglagesUi.jsx';
import { codeComplet, codeTropSimple, messageChoixCode } from './borneLogique.js';
import { definirMonCode, etatDeMonCode } from './borneService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages > Mon compte : le code personnel de pointage (lot L6, 22.11.2026).
// Un code par personne et par établissement, à taper sur la borne. La base
// n'en garde que l'empreinte (pointage_code_definir) et refuse un code déjà
// pris, sans dire par qui, au plus cinq fois par heure.
// ─────────────────────────────────────────────────────────────────────────────

const chiffres = (v) => String(v || '').replace(/[^0-9]/g, '').slice(0, 4);

export default function CodePointage({ etablissement }) {
  const etabId = etablissement?.id || null;
  const [etat, setEtat] = React.useState(null);
  const [ouvert, setOuvert] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [encore, setEncore] = React.useState('');
  const [message, setMessage] = React.useState(null);
  const [envoi, setEnvoi] = React.useState(false);

  React.useEffect(() => {
    if (!etabId) return undefined;
    let vivant = true;
    etatDeMonCode(etabId)
      .then((e) => { if (vivant) setEtat(e); })
      .catch(() => { if (vivant) setEtat({ defini: false, illisible: true }); });
    return () => { vivant = false; };
  }, [etabId]);

  if (!etabId) return null;

  const enregistrer = async () => {
    if (!codeComplet(code)) { setMessage({ ok: false, texte: 'Le code compte 4 chiffres.' }); return; }
    if (codeTropSimple(code)) { setMessage(messageChoixCode({ raison: 'trop_simple' })); return; }
    if (code !== encore) { setMessage({ ok: false, texte: 'Les deux codes ne sont pas les mêmes.' }); return; }
    setEnvoi(true);
    try {
      const m = messageChoixCode(await definirMonCode(etabId, code));
      setMessage(m);
      if (m.ok) {
        setEtat({ defini: true, maj_le: new Date().toISOString() });
        setOuvert(false);
        setCode('');
        setEncore('');
      }
    } catch (err) {
      console.error('[code de pointage]', err);
      setMessage(messageChoixCode(null));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div style={ui.liste} data-code-pointage>
      <Ligne colonne derniere titre="Code de pointage" aide="Votre code personnel à 4 chiffres, pour pointer à la borne de l'établissement. Gardez-le pour vous.">
        <div style={st.etat}>
          <span>{etat === null ? 'Chargement…' : etat.defini ? 'Code choisi' : 'Pas encore de code'}</span>
          {etablissement?.nom ? <span style={st.etab} data-no-translate>{etablissement.nom}</span> : null}
        </div>
        {ouvert ? (
          <div style={st.formulaire}>
            <Input
              type="password" inputMode="numeric" autoComplete="off" maxLength={4}
              value={code} onChange={(e) => setCode(chiffres(e.target.value))}
              placeholder="Nouveau code" aria-label="Nouveau code" style={st.champ}
            />
            <Input
              type="password" inputMode="numeric" autoComplete="off" maxLength={4}
              value={encore} onChange={(e) => setEncore(chiffres(e.target.value))}
              placeholder="Le même code" aria-label="Confirmer le code" style={st.champ}
            />
            <div style={st.actions}>
              <Btn variant="primary" onClick={enregistrer} disabled={envoi}>Enregistrer</Btn>
              <Btn onClick={() => { setOuvert(false); setCode(''); setEncore(''); setMessage(null); }}>Annuler</Btn>
            </div>
          </div>
        ) : (
          <div style={st.actions}>
            <Btn onClick={() => { setOuvert(true); setMessage(null); }} disabled={etat === null}>
              {etat?.defini ? 'Changer mon code' : 'Choisir mon code'}
            </Btn>
          </div>
        )}
        {message ? <p role="status" style={{ ...st.message, color: message.ok ? 'var(--success-text)' : 'var(--danger-text)' }}>{message.texte}</p> : null}
      </Ligne>
    </div>
  );
}

const st = {
  etat: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--t2)', color: 'var(--text)' },
  etab: { fontSize: 'var(--t1)', padding: '2px 10px', borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text2)' },
  formulaire: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 },
  champ: { width: 150, fontSize: 'var(--t3)', letterSpacing: '0.3em' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  message: { margin: '8px 0 0', fontSize: 'var(--t2)' },
};
