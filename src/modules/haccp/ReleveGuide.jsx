import React from 'react';
import ActionsCorrectives, { Mesure, PlageTexte } from './ActionsCorrectives.jsx';
import { creneauLePlusProche, parseHaccpNumber } from './HACCP.utils.js';
import { verdictReleve } from './haccpJour.js';

// ─────────────────────────────────────────────────────────────────────────────
// Relevé guidé (écran « tournee ») : la tournée et l'ancienne saisie rapide en
// un seul écran. Toutes les zones actives, un champ vide chacune, la plage en
// clair, le verdict en mots dès la frappe et quoi faire si le chiffre sort de
// la plage. Un bouton « Enregistrer » dans un pied collant.
//
// Jamais de valeur pré-remplie : la valeur idéale n'est qu'un texte grisé du
// champ. Un registre HACCP contient des mesures, et celui qui débute ne doit
// pas apprendre à valider sans lire le thermomètre. Une ligne vide n'est pas
// enregistrée.
//
// Clavier : « suivant » (Entrée) passe au champ vide suivant ; après le
// dernier, le focus va sur « Enregistrer », jamais d'enregistrement par
// Entrée. Pas d'inputMode="decimal" : sur iPhone ce pavé n'a pas de touche
// moins, un congélateur à -18 ne pourrait pas se saisir. Le premier champ vide
// est focalisé par autoFocus, au rendu qui suit le toucher du bouton (écran
// importé statiquement, rendu synchrone : le clavier s'ouvre sur iOS).
//
// Les chiffres tapés vivent chez le parent (brouillon de HACCP.jsx) : Retour,
// le geste retour ou Échap ne les perdent pas tant que le module reste ouvert.
//
//   brouillon = { [zoneId]: { valeur, choisies, autre } }
//   etatLignes = { [zoneId]: 'ok' | 'echec' } après un enregistrement partiel
//
// Crochets du banc : data-haccp-valeur (chaque champ), data-haccp-enregistrer.
// ─────────────────────────────────────────────────────────────────────────────

const lisible = (v) => v !== '' && v != null && !Number.isNaN(parseHaccpNumber(v));

export default function ReleveGuide({
  zones, creneaux, tournee, relevesDuJour, brouillon, etatLignes, enregistrement, onLigne, onEnregistrer,
}) {
  const champs = React.useRef({});
  const boutonRef = React.useRef(null);

  const aEnregistrer = zones.filter(z => etatLignes[z.id] !== 'ok' && lisible(brouillon[z.id]?.valeur));
  const tapes = zones.filter(z => lisible(brouillon[z.id]?.valeur)).length;
  const echecs = aEnregistrer.filter(z => etatLignes[z.id] === 'echec').length;
  // Premier champ vide : il reçoit le focus (autoFocus) à l'ouverture.
  const premierVide = zones.find(z => etatLignes[z.id] !== 'ok' && !brouillon[z.id]?.valeur)?.id;

  // Dernier relevé du jour de chaque zone pour cette tournée (rattaché au
  // créneau le plus proche), ou du jour sans heures de relevé.
  const deja = {};
  relevesDuJour.forEach(r => {
    if (tournee && creneauLePlusProche(creneaux, r.heure)?.id !== tournee.id) return;
    const prec = deja[r.zoneId];
    if (!prec || String(r.heure) > String(prec.heure)) deja[r.zoneId] = r;
  });

  const suivant = (zoneId) => {
    const i = zones.findIndex(z => z.id === zoneId);
    for (const z of zones.slice(i + 1)) {
      const champ = champs.current[z.id];
      if (champ && !champ.disabled && champ.value === '') { champ.focus(); return; }
    }
    boutonRef.current?.focus();
  };

  let libelle;
  if (enregistrement) libelle = <>Enregistrement…</>;
  else if (!aEnregistrer.length) libelle = <>Tapez au moins une température</>;
  else if (echecs > 0) libelle = <>Réessayer (<span data-no-translate="">{aEnregistrer.length}</span>)</>;
  else libelle = <>Enregistrer <span data-no-translate="">{aEnregistrer.length}</span> {aEnregistrer.length > 1 ? 'relevés' : 'relevé'}</>;

  return (
    <div style={st.ecran}>
      <span id="haccp-temperature-de" hidden>Température de</span>
      <p style={st.consigne}>
        Lisez le thermomètre de chaque frigo ou appareil et tapez le chiffre.
        <br />
        <span style={st.consigneDiscrete}>Une ligne vide n'est pas enregistrée.</span>
      </p>

      <div>
        {zones.map(z => {
          const ligne = brouillon[z.id] || {};
          const etat = etatLignes[z.id];
          const verdict = verdictReleve(z, ligne.valeur);
          const d = deja[z.id];
          const fige = enregistrement || etat === 'ok';
          return (
            <div key={z.id} data-haccp-ligne={z.id} style={st.ligne}>
              <div style={st.rangee}>
                <div style={st.texte}>
                  <div id={`haccp-nom-${z.id}`} style={st.nom}>{z.nom}</div>
                  <div style={st.plage}>
                    <PlageTexte zone={z} />.
                    {z.cible != null && z.cible !== '' && <> Idéal : <Mesure valeur={z.cible} unite={z.unite || '°C'} />.</>}
                  </div>
                  {d && <div style={st.deja}>Déjà relevé à <span data-no-translate="">{String(d.heure).slice(0, 5)}</span> : <Mesure valeur={d.valeur} unite={z.unite || '°C'} /></div>}
                </div>
                <div style={st.saisie}>
                  <input
                    ref={el => { champs.current[z.id] = el; }}
                    data-haccp-valeur=""
                    type="number" step="0.1" enterKeyHint="next"
                    autoFocus={z.id === premierVide}
                    aria-labelledby={`haccp-temperature-de haccp-nom-${z.id}`}
                    placeholder={z.cible != null ? String(z.cible) : ''}
                    value={ligne.valeur ?? ''}
                    disabled={fige}
                    onChange={e => onLigne(z.id, { valeur: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); suivant(z.id); } }}
                    style={{
                      ...st.champ,
                      ...(verdict?.ton === 'danger' ? st.champAlerte : verdict?.ton === 'ok' ? st.champBon : {}),
                    }}
                  />
                  <span data-no-translate="" style={st.unite}>{z.unite || '°C'}</span>
                </div>
              </div>
              {verdict?.ton === 'ok' && etat !== 'ok' && <div style={st.bon}>Bon</div>}
              <ActionsCorrectives
                zone={z} valeur={ligne.valeur} desactive={fige}
                choix={{ choisies: ligne.choisies || [], autre: ligne.autre || '' }}
                onChoix={c => onLigne(z.id, c)}
              />
              {etat === 'ok' && <div style={st.enregistre}>Enregistré</div>}
              {etat === 'echec' && <div style={st.echec}>Pas enregistré. Réessayez.</div>}
            </div>
          );
        })}
      </div>

      {/* Pied collant : la coque a une hauteur fixe et fait défiler son
          contenu, le pied reste en bas de l'écran sur les trois coques. */}
      <div style={st.pied}>
        <span style={st.compte}>
          <span data-no-translate="">{tapes}</span> {tapes > 1 ? 'chiffres tapés sur' : 'chiffre tapé sur'} <span data-no-translate="">{zones.length}</span>
        </span>
        <button
          ref={boutonRef} type="button" data-haccp-enregistrer=""
          disabled={enregistrement || !aEnregistrer.length}
          onClick={onEnregistrer}
          style={{ ...st.enregistrer, ...(enregistrement || !aEnregistrer.length ? st.enregistrerInactif : {}) }}
        >{libelle}</button>
      </div>
    </div>
  );
}

const st = {
  ecran: { maxWidth: 720, minWidth: 0, display: 'flex', flexDirection: 'column' },
  consigne: { margin: '4px 0 6px', fontSize: 14, lineHeight: 1.45, color: 'var(--text)' },
  consigneDiscrete: { fontSize: 13, color: 'var(--text2)' },
  ligne: { padding: '14px 0', borderBottom: '1px solid var(--border)', minWidth: 0 },
  rangee: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' },
  // 150 px : le champ tient à droite du nom dès 375 px de large.
  texte: { flex: '1 1 150px', minWidth: 0 },
  nom: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  plage: { fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  deja: { fontSize: 12, color: 'var(--text2)', marginTop: 2 },
  saisie: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  // 56 px de haut, chiffre en 28 px : une cible confortable au doigt, lisible
  // d'un coup d'œil, en chiffres tabulaires.
  champ: {
    width: 120, height: 56, boxSizing: 'border-box', padding: '0 10px', textAlign: 'center',
    borderRadius: 'var(--r)', borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 28, fontWeight: 600,
  },
  champBon: { borderColor: 'var(--success-bd)' },
  champAlerte: { borderColor: 'var(--danger-strong)', color: 'var(--danger-text)' },
  unite: { fontSize: 16, fontWeight: 600, color: 'var(--text2)', width: 28 },
  bon: { marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--success-text)' },
  enregistre: { marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--success-text)' },
  echec: { marginTop: 6, fontSize: 14, fontWeight: 600, color: 'var(--danger-text)' },
  pied: {
    position: 'sticky', bottom: 0, zIndex: 2, marginTop: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
    padding: '12px 0', background: 'var(--surface)', borderTop: '1px solid var(--border)',
  },
  compte: { fontSize: 13, color: 'var(--text2)' },
  enregistrer: {
    flex: '1 1 220px', maxWidth: 360, minHeight: 52, padding: '10px 18px', borderRadius: 'var(--r)', border: 'none',
    background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  },
  enregistrerInactif: { opacity: 0.55, cursor: 'not-allowed' },
};
