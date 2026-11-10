import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';

// ─────────────────────────────────────────────────────────────────────────────
// Clôture de caisse du jour (v7), en trois temps :
//   1. vérifier : le jour à clôturer, les tickets encore ouverts ;
//   2. compter : le fond de caisse et les espèces, sans voir l'attendu ;
//   3. figer : la base calcule les totaux, l'écart, et scelle la clôture.
// Consultant, patron, resp_cuisine (RPC caisse_cloturer_jour ; la base refuse
// les autres rôles, l'écran ne leur montre pas la tuile). Une clôture ne se
// modifie pas : corriger un comptage passe par une clôture complémentaire,
// avec un motif. Après la clôture d'un jour, les tickets encaissés passent au
// jour suivant.
// Chaque nombre vit dans son propre nœud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const dateCH = (jour) => { const [a, m, j] = String(jour || '').slice(0, 10).split('-'); return j ? `${j}.${m}.${a}` : ''; };
const nombre = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

export default function Cloture({ etablissementId, onDocument, onChange }) {
  const [etat, setEtat] = React.useState(null);
  const [erreur, setErreur] = React.useState(null);
  const [clotures, setClotures] = React.useState([]);
  const [jour, setJour] = React.useState(null);
  const [etape, setEtape] = React.useState(1);
  const [fond, setFond] = React.useState('');
  const [comptees, setComptees] = React.useState('');
  const [motif, setMotif] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const [faite, setFaite] = React.useState(null);

  const charger = React.useCallback(async () => {
    if (!etablissementId) return;
    const [j, c] = await Promise.all([caisse.journee(etablissementId), caisse.listClotures(etablissementId)]);
    if (j.error) { setErreur(j.error); return; }
    setErreur(null);
    setEtat(j.data);
    if (!c.error) setClotures(c.data);
    // Le jour proposé : le plus ancien jour passé sans clôture, sinon aujourd'hui.
    setJour((actuel) => actuel || j.data.a_cloturer?.[0]?.jour || j.data.jour);
  }, [etablissementId]);
  React.useEffect(() => { charger(); }, [charger]);

  const dejaCloturee = clotures.find((c) => c.jour_exploitation === jour && !c.complement_de) || null;
  const complementaire = Boolean(dejaCloturee);

  async function figer() {
    if (enCours) return;
    const f = nombre(fond) ?? 0;
    const e = nombre(comptees);
    if (e == null) { notify('Saisissez les espèces comptées.', 'warning'); return; }
    if (complementaire && motif.trim().length < 3) { notify('Une clôture complémentaire demande un motif.', 'warning'); return; }
    setEnCours(true);
    try {
      const { data, error } = await caisse.cloturerJour({
        etablissementId, jour, especesComptees: e, fondCaisse: f, motif: complementaire ? motif.trim() : null,
      });
      if (error) { notify(error, 'error'); return; }
      setFaite(data);
      notify('Clôture enregistrée', 'success');
      setFond(''); setComptees(''); setMotif(''); setEtape(1);
      await Promise.all([charger(), onChange?.()]);
    } finally {
      setEnCours(false);
    }
  }

  if (erreur) {
    return (
      <div style={st.erreur}>
        <p style={{ margin: 0 }}>{erreur}</p>
        <Btn variant="primary" onClick={charger} style={st.btn44}>Réessayer</Btn>
      </div>
    );
  }
  if (!etat) return <p style={st.aide}>Chargement...</p>;

  const jours = [...(etat.a_cloturer || []).map((x) => x.jour), etat.jour].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={st.racine} data-caisse-cloture="">
      {faite && <Resultat cloture={faite} onDocument={onDocument} onFermer={() => setFaite(null)} />}

      {!faite && (
        <>
          <div style={st.etapes} aria-label="Étapes de la clôture">
            {['Vérifier', 'Compter', 'Figer'].map((nom, i) => (
              <span key={nom} style={{ ...st.etape, ...(etape === i + 1 ? st.etapeActive : null) }}>
                <span style={st.num}>{i + 1}</span> <span>{nom}</span>
              </span>
            ))}
          </div>

          {etape === 1 && (
            <div style={st.bloc} data-cloture-etape="1">
              <div style={st.sousTitre}>Jour à clôturer</div>
              <div style={st.rang}>
                {jours.map((j) => (
                  <Btn key={j} variant={jour === j ? 'primary' : 'ghost'} onClick={() => setJour(j)} style={st.btnChoix}>
                    <span style={st.num}>{dateCH(j)}</span>
                    {j === etat.jour && <span>{' '}</span>}
                    {j === etat.jour && <span>aujourd'hui</span>}
                  </Btn>
                ))}
              </div>
              {jour === etat.jour && (
                <p style={st.aide}>
                  <span style={st.num}>{etat.tickets_du_jour}</span> <span>tickets encaissés aujourd'hui.</span>
                </p>
              )}
              {etat.ouverts > 0 ? (
                <div style={st.alerte} data-cadre="">
                  <p style={st.ligneForte}><span style={st.num}>{etat.ouverts}</span> <span>tickets encore ouverts.</span></p>
                  <p style={st.aide}>Encaissez-les ou annulez-les d'abord. Sinon ils passeront au jour suivant : un ticket encaissé après la clôture appartient au lendemain.</p>
                </div>
              ) : (
                <p style={st.aide}>Aucun ticket ouvert : la caisse peut être clôturée.</p>
              )}
              {complementaire && (
                <div style={st.alerte} data-cadre="">
                  <p style={st.ligneForte}>Ce jour est déjà clôturé.</p>
                  <p style={st.aide}>Une clôture ne se modifie pas. Pour corriger un comptage, vous pouvez enregistrer une clôture complémentaire, avec un motif.</p>
                </div>
              )}
              <div style={st.pied}>
                <Btn variant="primary" onClick={() => setEtape(2)} style={st.btnAction}>{complementaire ? 'Corriger le comptage' : 'Compter les espèces'}</Btn>
              </div>
            </div>
          )}

          {etape === 2 && (
            <div style={st.bloc} data-cloture-etape="2">
              <p style={st.aide}>Comptez les billets et les pièces de la caisse, sans les pourboires. Le montant attendu s'affiche après la clôture, pas avant.</p>
              <label style={st.champLabel}>
                <span style={st.sousTitre}>Fond de caisse, CHF</span>
                <Input value={fond} onChange={(e) => setFond(e.target.value)} placeholder="0.00" type="text" inputMode="decimal" style={st.champ} />
              </label>
              <label style={st.champLabel}>
                <span style={st.sousTitre}>Espèces comptées, fond compris, CHF</span>
                <Input value={comptees} onChange={(e) => setComptees(e.target.value)} placeholder="0.00" type="text" inputMode="decimal" style={st.champ} />
              </label>
              {complementaire && (
                <label style={st.champLabel}>
                  <span style={st.sousTitre}>Motif de la clôture complémentaire</span>
                  <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Pourquoi corriger" style={st.champ} />
                </label>
              )}
              <div style={st.pied}>
                <Btn variant="ghost" onClick={() => setEtape(1)} style={st.btn44}>Retour</Btn>
                <Btn variant="primary" disabled={nombre(comptees) == null} onClick={() => setEtape(3)} style={st.btnAction}>Continuer</Btn>
              </div>
            </div>
          )}

          {etape === 3 && (
            <div style={st.bloc} data-cloture-etape="3">
              <p style={st.ligneForte}>
                <span>Clôturer le</span> <span style={st.num}>{dateCH(jour)}</span>
              </p>
              <p style={st.aide}>
                <span>Fond de caisse</span> <span style={st.num}>{chf(nombre(fond) ?? 0)}</span><span>, espèces comptées</span> <span style={st.num}>{chf(nombre(comptees))}</span> <span>CHF.</span>
              </p>
              <p style={st.aide}>Une fois figée, la clôture ne se modifie plus. Les ventes du jour, la TVA par taux et l'écart de caisse y sont enregistrés tels quels.</p>
              <div style={st.pied}>
                <Btn variant="ghost" onClick={() => setEtape(2)} style={st.btn44}>Retour</Btn>
                <Btn variant="primary" disabled={enCours} onClick={figer} style={st.btnAction}>Figer la clôture</Btn>
              </div>
            </div>
          )}
        </>
      )}

      {clotures.length > 0 && (
        <div style={st.bloc}>
          <div style={st.sousTitre}>Clôtures enregistrées</div>
          {clotures.map((c) => (
            <div key={c.id} style={st.ligneCloture} data-cloture={c.numero}>
              <span style={st.ligneClotureCorps}>
                <span style={st.ligneForte}>
                  <span>Z</span><span style={st.num}>{c.numero}</span> <span style={st.num}>{dateCH(c.jour_exploitation)}</span>
                  {c.complement_de && <span>{' '}</span>}
                  {c.complement_de && <span>complémentaire</span>}
                </span>
                <span style={st.aide}>
                  <span>Net</span> <span style={st.num}>{chf(c.totaux?.net?.ttc)}</span><span>, écart de caisse</span> <span style={st.num}>{chf(c.ecart)}</span><span>, clôturée le</span> <span style={st.num}>{zurichDateHeure(c.cloture_at).date}</span>
                </span>
              </span>
              <Btn variant="ghost" onClick={() => onDocument?.(c)} style={st.btn44}>PDF</Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Ce que la clôture a figé ──
function Resultat({ cloture, onDocument, onFermer }) {
  const t = cloture.totaux || {};
  const ecart = Number(cloture.ecart);
  return (
    <div style={st.bloc} data-cloture-resultat="">
      <p style={st.titre}>
        <span>Clôture</span> <span>Z</span><span style={st.num}>{cloture.numero}</span>{', '}<span style={st.num}>{dateCH(cloture.jour_exploitation)}</span>
      </p>
      <div style={st.grand}>
        <span style={st.grandLibelle}>Net du jour, TVA comprise</span>
        <span style={st.grandValeur}><span>{chf(t.net?.ttc)}</span> <span style={st.devise}>CHF</span></span>
      </div>
      {(t.net?.par_taux || []).map((x) => (
        <p key={x.taux} style={st.aide}>
          <span>TVA</span> <span style={st.num}>{String(x.taux).replace('.', ',')}</span> <span>% :</span> <span style={st.num}>{chf(x.tva)}</span> <span>sur</span> <span style={st.num}>{chf(x.ttc)}</span>
        </p>
      ))}
      <p style={st.aide}>
        <span style={st.num}>{t.ventes?.tickets || 0}</span> <span>tickets,</span> <span style={st.num}>{t.annulations?.tickets || 0}</span> <span>annulations.</span>
      </p>
      <div style={{ ...st.grand, ...st.ecart }} data-cadre="">
        <span style={st.grandLibelle}>Écart de caisse</span>
        <span style={st.grandValeur}><span>{chf(ecart)}</span> <span style={st.devise}>CHF</span></span>
      </div>
      <p style={st.aide}>
        <span>Espèces attendues</span> <span style={st.num}>{chf(t.especes?.attendues)}</span><span>, fond</span> <span style={st.num}>{chf(cloture.fond_caisse)}</span><span>, comptées</span> <span style={st.num}>{chf(cloture.especes_comptees)}</span> <span>CHF.</span>
      </p>
      <div style={st.pied}>
        <Btn variant="ghost" onClick={onFermer} style={st.btn44}>Fermer</Btn>
        <Btn variant="primary" onClick={() => onDocument?.(cloture)} style={st.btnAction}>PDF de clôture</Btn>
      </div>
    </div>
  );
}

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12, maxWidth: 640, minWidth: 0 },
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: 'var(--text)', marginTop: 12 },
  etapes: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  etape: { fontSize: 14, color: 'var(--text2)', padding: '6px 12px', borderRadius: 'var(--r-full)', background: 'var(--surface2)' },
  etapeActive: { color: 'var(--text)', fontWeight: 600 },
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  aide: { fontSize: 14, color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  ligneForte: { fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 },
  titre: { fontSize: 20, fontFamily: 'var(--font-serif)', color: 'var(--text)', margin: 0 },
  alerte: { padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 4 },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  champ: { minHeight: 52, fontSize: 18, minWidth: 0, width: '100%', boxSizing: 'border-box' },
  btn44: { minHeight: 44, flexShrink: 0 },
  btnChoix: { minHeight: 56, fontSize: 16, flex: '1 1 160px' },
  btnAction: { minHeight: 56, fontSize: 16, flex: '1 1 200px' },
  pied: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
  num: { fontFamily: 'var(--font-num)' },
  grand: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  grandLibelle: { fontSize: 15, color: 'var(--text2)' },
  grandValeur: { fontSize: 30, fontWeight: 600, fontFamily: 'var(--font-num)', lineHeight: 1.1, color: 'var(--text)' },
  devise: { fontSize: 14, fontWeight: 500, color: 'var(--text2)' },
  ecart: { padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)' },
  ligneCloture: {
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '6px 0',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  ligneClotureCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
};
