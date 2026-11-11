import React from 'react';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';
import { zurichDateHeure } from '../../../utils/zurichTime.js';
import * as tpe from '../../../services/caisseTpeService.js';
import { PLAFONDS, ROLES_TERMINAL, estSimule, plafondDe } from './ecranTpe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la caisse, section « Terminal de paiement » (caisse v9).
//
// Relier un terminal en trois temps : le prestataire, la clé (champ masqué),
// le code de jumelage lu sur le terminal. Consultant et patron seulement ; le
// lien et le retrait sont écrits au Journal d'activité.
//
// La clé part une fois vers l'Edge Function caisse-tpe, qui la range dans le
// coffre de la base. Elle n'est gardée ni dans le navigateur ni dans une
// table lisible, et ne revient jamais : l'écran ne montre que ses quatre
// derniers caractères, la date et l'auteur du lien. Le champ est vidé dès la
// réponse.
//
// Cette section dit ce que l'app fait et ne fait pas. Elle ne promet aucune
// conformité : les obligations envers le prestataire restent celles de la
// maison.
// Les noms de terminal et les numéros de série sont des données :
// data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

const VIDE = { prestataire: null, nom: '', numeroSerie: '', secret: {}, code: '' };

export default function SectionTerminal({ etablissementId, role, config, regler, terminaux, lecture, onChange }) {
  const direction = ROLES_TERMINAL.includes(role);
  const [prestataires, setPrestataires] = React.useState(null);
  const [erreurListe, setErreurListe] = React.useState(null);
  const [etape, setEtape] = React.useState(0); // 0 : fermé ; 1 prestataire ; 2 clé ; 3 code
  const [saisie, setSaisie] = React.useState(VIDE);
  const [enCours, setEnCours] = React.useState(false);
  const [aRetirer, setARetirer] = React.useState(null);
  const plafond = plafondDe(config);
  const relies = (terminaux || []).filter((t) => t.actif);
  const retires = (terminaux || []).filter((t) => !t.actif);

  const ouvrir = async () => {
    setEtape(1);
    setSaisie(VIDE);
    setErreurListe(null);
    const { data, error } = await tpe.listPrestataires();
    if (error) { setErreurListe(error); return; }
    setPrestataires(data.prestataires || []);
  };
  const fermer = () => { setEtape(0); setSaisie(VIDE); };
  const choisi = (prestataires || []).find((p) => p.id === saisie.prestataire) || null;
  const champsRemplis = choisi && saisie.nom.trim() && saisie.numeroSerie.trim()
    && (choisi.champs || []).every((c) => String(saisie.secret[c.cle] || '').trim().length > 0);

  async function relier() {
    if (enCours || !choisi) return;
    setEnCours(true);
    try {
      const { error } = await tpe.relierTerminal({
        etablissementId, prestataire: choisi.id, nom: saisie.nom.trim(), numeroSerie: saisie.numeroSerie.trim(),
        secret: saisie.secret, code: saisie.code.trim().toUpperCase(),
      });
      if (error) { notify(error, 'error'); return; }
      // La clé ne reste pas dans l'écran.
      fermer();
      notify('Terminal relié', 'success');
      await onChange?.();
    } finally {
      setEnCours(false);
    }
  }

  async function retirer(terminal) {
    if (enCours) return;
    setEnCours(true);
    try {
      const { error } = await tpe.retirerTerminal(terminal.id);
      if (error) { notify(error, 'error'); return; }
      setARetirer(null);
      notify('Terminal retiré', 'success');
      await onChange?.();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={st.bloc} data-reglages-terminal="">
      <p style={st.aide}>
        Au tap sur « Carte », la caisse envoie le montant au terminal ; le client paie sur le terminal ; la caisse reçoit « accepté » ou « refusé » et pose le paiement toute seule.
      </p>
      <p style={st.aide}>
        La caisse ne voit jamais une carte : ni numéro, ni date, ni code. Elle garde seulement le résultat (marque, quatre derniers chiffres, code d'autorisation). L'argent va du prestataire à la maison, sans passer par l'app.
      </p>

      <div style={st.sousTitre}>Terminaux reliés</div>
      {lecture === 'echec' && <p style={st.aide}>Les terminaux n'ont pas pu être lus. Fermez les Réglages et rouvrez-les.</p>}
      {lecture !== 'echec' && !relies.length && (
        <p style={st.aide}>Aucun terminal relié : les cartes s'encaissent à la main, comme aujourd'hui.</p>
      )}
      {relies.map((t) => {
        const quand = t.relie_at ? zurichDateHeure(t.relie_at) : null;
        return (
          <div key={t.id} style={st.rangTerminal} data-terminal={t.prestataire}>
            <span style={st.terminalCorps}>
              <span style={st.terminalNom} data-no-translate>{t.nom}</span>
              <span style={st.detail}>
                <span>{estSimule(t) ? 'Terminal simulé' : 'Terminal de paiement'}</span>
                <span><span>n° de série</span> <span style={st.num} data-no-translate>{t.numero_serie}</span></span>
              </span>
              <span style={st.detail}>
                {t.cle_fin
                  ? <span><span>Clé enregistrée, se termine par</span> <span style={st.num} data-no-translate>{t.cle_fin}</span></span>
                  : <span>Clé enregistrée</span>}
                {quand && <span><span>Relié le</span> <span style={st.num}>{quand.date}</span></span>}
                {t.relie_par_nom && <span><span>par</span> <span data-no-translate>{t.relie_par_nom}</span></span>}
              </span>
              <span style={st.detail}>
                {estSimule(t)
                  ? <span>Il ne sert que les tickets du mode test : aucun argent ne bouge, aucun vrai ticket ne peut être payé par lui.</span>
                  : (t.premier_paiement_reel_at
                    ? <span>Ce terminal a déjà encaissé un paiement réel accepté.</span>
                    : <span>Ce terminal n'a pas encore encaissé de paiement réel accepté : faites un premier paiement de 1 franc avant le service.</span>)}
              </span>
            </span>
            {direction && (aRetirer === t.id ? (
              <span style={st.rang}>
                <Btn variant="ghost" onClick={() => setARetirer(null)} style={st.btn44}>Garder</Btn>
                <Btn variant="danger" disabled={enCours} onClick={() => retirer(t)} style={st.btn44}>Retirer ce terminal</Btn>
              </span>
            ) : (
              <Btn variant="ghost" onClick={() => setARetirer(t.id)} style={st.btn44}>Retirer</Btn>
            ))}
          </div>
        );
      })}
      {retires.length > 0 && (
        <p style={st.aide}>
          <span>Terminaux retirés :</span>{' '}
          {retires.map((t, i) => <span key={t.id}>{i ? ', ' : ''}<span data-no-translate>{t.nom}</span></span>)}
          <span>. Leurs paiements passés restent dans la caisse ; un remboursement se fait alors chez le prestataire.</span>
        </p>
      )}

      {direction ? (
        <>
          {etape === 0 && (
            <div><Btn variant="primary" onClick={ouvrir} style={st.btnAction}>Relier un terminal</Btn></div>
          )}
          {etape > 0 && (
            <div style={st.assistant} data-cadre="" data-terminal-etape={etape}>
              <div style={st.etapes} aria-label="Étapes pour relier un terminal">
                {['Prestataire', 'Clé', 'Jumelage'].map((nom, i) => (
                  <span key={nom} style={{ ...st.etape, ...(etape === i + 1 ? st.etapeActive : null) }}>
                    <span style={st.num}>{i + 1}</span> <span>{nom}</span>
                  </span>
                ))}
              </div>

              {etape === 1 && (
                <div style={st.bloc}>
                  {erreurListe && <p style={st.aide}>{erreurListe}</p>}
                  {!prestataires && !erreurListe && <p style={st.aide}>Chargement...</p>}
                  {(prestataires || []).map((p) => (
                    <Btn key={p.id} variant={saisie.prestataire === p.id ? 'primary' : 'ghost'} onClick={() => setSaisie({ ...VIDE, prestataire: p.id })} style={st.btnPrestataire}>
                      <span style={st.prestataireNom}>{p.nom}</span>
                      {p.description && <span style={st.prestataireAide}>{p.description}</span>}
                    </Btn>
                  ))}
                  {prestataires && (
                    <p style={st.aide}>
                      Aucun prestataire réel n'est encore proposé. Le terminal simulé sert à s'entraîner en mode test ; un vrai terminal sera ajouté quand son prestataire aura confirmé ses règles et fourni un moyen d'essai sans argent réel.
                    </p>
                  )}
                  <div style={st.pied}>
                    <Btn variant="ghost" onClick={fermer} style={st.btn44}>Fermer</Btn>
                    <Btn variant="primary" disabled={!choisi} onClick={() => setEtape(2)} style={st.btn44}>Continuer</Btn>
                  </div>
                </div>
              )}

              {etape === 2 && choisi && (
                <div style={st.bloc}>
                  <label style={st.champLabel}>
                    <span style={st.sousTitre}>Nom du terminal, tel que l'équipe le verra</span>
                    <Input value={saisie.nom} onChange={(e) => setSaisie({ ...saisie, nom: e.target.value.slice(0, 40) })} placeholder="Terminal du bar" style={st.champ} />
                  </label>
                  <label style={st.champLabel}>
                    <span style={st.sousTitre}>Numéro de série, lu sous le terminal</span>
                    <Input value={saisie.numeroSerie} onChange={(e) => setSaisie({ ...saisie, numeroSerie: e.target.value.slice(0, 40) })} placeholder="N86W000000" autoCapitalize="characters" autoComplete="off" spellCheck={false} style={st.champ} />
                  </label>
                  {(choisi.champs || []).map((c) => (
                    <label key={c.cle} style={st.champLabel}>
                      <span style={st.sousTitre}>{c.libelle}</span>
                      <Input
                        value={saisie.secret[c.cle] || ''}
                        onChange={(e) => setSaisie({ ...saisie, secret: { ...saisie.secret, [c.cle]: e.target.value } })}
                        type="password" autoComplete="new-password" spellCheck={false} placeholder="Saisie masquée" style={st.champ}
                      />
                      {c.aide && <span style={st.aide}>{c.aide}</span>}
                    </label>
                  ))}
                  <p style={st.aide}>La clé part une seule fois vers le serveur, qui la range dans son coffre. Elle ne revient jamais à l'écran : seuls ses quatre derniers caractères seront rappelés.</p>
                  <div style={st.pied}>
                    <Btn variant="ghost" onClick={() => setEtape(1)} style={st.btn44}>Retour</Btn>
                    <Btn variant="primary" disabled={!champsRemplis} onClick={() => setEtape(3)} style={st.btn44}>Continuer</Btn>
                  </div>
                </div>
              )}

              {etape === 3 && choisi && (
                <div style={st.bloc}>
                  <label style={st.champLabel}>
                    <span style={st.sousTitre}>{choisi.code?.libelle || 'Code de jumelage'}</span>
                    <Input value={saisie.code} onChange={(e) => setSaisie({ ...saisie, code: e.target.value.slice(0, 12) })} placeholder="Code lu sur le terminal" autoCapitalize="characters" autoComplete="off" spellCheck={false} style={st.champ} />
                    {choisi.code?.aide && <span style={st.aide}>{choisi.code.aide}</span>}
                  </label>
                  <p style={st.aide}>Le code s'affiche sur le terminal et ne sert qu'une fois : il prouve que le terminal est devant vous.</p>
                  <div style={st.pied}>
                    <Btn variant="ghost" onClick={() => setEtape(2)} style={st.btn44}>Retour</Btn>
                    <Btn variant="primary" disabled={enCours || !saisie.code.trim()} onClick={relier} style={st.btnAction}>Relier ce terminal</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p style={st.aide}>Relier ou retirer un terminal : consultant ou patron de la maison.</p>
      )}

      <div style={st.sousTitre}>Plafond d'un paiement sur le terminal, en CHF</div>
      <div style={st.rang}>
        {PLAFONDS.map((n) => (
          <Btn key={n} variant={plafond === n ? 'primary' : 'ghost'} onClick={() => regler({ tpe_plafond: n === 5000 ? null : n })} style={st.btn44}>
            <span style={st.num}>{n}</span>
          </Btn>
        ))}
      </div>
      <p style={st.aide}>Au-dessus de ce montant, pourboire compris, la caisse n'envoie rien au terminal : une erreur de saisie ne part pas en débit.</p>
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 6 },
  aide: { fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  rangTerminal: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  terminalCorps: { display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 260px', minWidth: 0 },
  terminalNom: { fontSize: 16, fontWeight: 600, color: 'var(--text)' },
  detail: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.4 },
  num: { fontFamily: 'var(--font-num)' },
  assistant: { display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', minWidth: 0 },
  etapes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  etape: { fontSize: 14, color: 'var(--text2)', padding: '6px 12px', borderRadius: 'var(--r-full)', background: 'var(--surface)' },
  etapeActive: { color: 'var(--text)', fontWeight: 600 },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champ: { minHeight: 48, fontSize: 16, minWidth: 0, width: '100%', boxSizing: 'border-box' },
  btn44: { minHeight: 44, flexShrink: 0 },
  btnAction: { minHeight: 52, fontSize: 16 },
  btnPrestataire: { minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left', padding: '10px 14px' },
  prestataireNom: { fontSize: 16, fontWeight: 600 },
  prestataireAide: { fontSize: 13, fontWeight: 400 },
  pied: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
};
