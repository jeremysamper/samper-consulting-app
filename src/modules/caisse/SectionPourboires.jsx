import React from 'react';
import { Btn, SegmentedTabs } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { PHRASES_REGLE, refusReglePourboires, versConfigPourboires } from './pourboires.js';

// ─────────────────────────────────────────────────────────────────────────────
// Réglage du partage des pourboires (lot 11 du panel), montré au consultant et
// au patron seulement (peutReglerPourboires, gardesCaisse.js). La règle vit
// dans caisse_reglages.config, clé pourboires (pourboires.js).
//
// Rien ne s'écrit à chaque geste : un brouillon local, puis « Enregistrer la
// règle » d'un seul geste. Une règle à moitié saisie ne part jamais : aucun
// groupe coché, ou des parts qui ne font pas 100 en mode « Par groupe », et
// l'enregistrement est refusé avec la raison. Sans groupes lisibles (lecture
// en cours, en échec, ou maison sans groupe), aucun champ ni bouton : une
// règle bâtie sur une liste vide ne s'enregistre pas.
// Les noms des groupes sont des données : data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

const MODES = [
  { id: 'egales', label: 'Parts égales' },
  { id: 'heures', label: 'Selon les heures' },
  { id: 'cle', label: 'Par groupe' },
];

// Brouillon tiré de la règle enregistrée : un état par groupe de la maison.
function brouillonDe(regle, groupes) {
  const parId = new Map((regle?.groupes || []).map((g) => [g.id, g]));
  return {
    mode: regle?.mode || 'heures',
    groupes: Object.fromEntries((groupes || []).map((g) => {
      const r = parId.get(g.id);
      return [g.id, { coche: Boolean(r), part: r?.part != null ? String(r.part) : '' }];
    })),
  };
}

const entier = (t) => {
  const n = Number(String(t ?? '').trim());
  return Number.isFinite(n) && String(t ?? '').trim() !== '' ? Math.round(n) : 0;
};

export default function SectionPourboires({ reglages, regler, groupes = [], statutGroupes = 'ready' }) {
  const regle = reglages?.pourboires || null;
  const cleRegle = JSON.stringify(regle);
  const cleGroupes = groupes.map((g) => g.id).join('|');
  const [brouillon, setBrouillon] = React.useState(() => brouillonDe(regle, groupes));
  const [refus, setRefus] = React.useState(null);
  const [enCours, setEnCours] = React.useState(false);
  const occupe = React.useRef(false);
  // La règle enregistrée ou la liste des groupes a changé : on repart d'elles.
  React.useEffect(() => {
    setBrouillon(brouillonDe(regle, groupes));
    setRefus(null);
  }, [cleRegle, cleGroupes]);

  if (statutGroupes === 'loading') return <p style={st.aide}>Lecture des groupes du Planning…</p>;
  if (statutGroupes === 'error') {
    return <p style={st.aide}>Les groupes du Planning n'ont pas pu être lus. La règle de partage ne peut pas se régler pour le moment.</p>;
  }
  if (statutGroupes === 'absent' || !groupes.length) {
    return (
      <div style={st.bloc}>
        <p style={st.aide}>La règle de partage s'appuie sur les groupes du Planning, Salle et Cuisine par exemple. Créez-les d'abord dans Réglages, Planning, Groupes.</p>
      </div>
    );
  }

  const choisis = groupes.filter((g) => brouillon.groupes[g.id]?.coche);
  const totalParts = choisis.reduce((s, g) => s + entier(brouillon.groupes[g.id]?.part), 0);
  const candidat = {
    mode: brouillon.mode,
    groupes: choisis.map((g) => ({ id: g.id, part: brouillon.mode === 'cle' ? entier(brouillon.groupes[g.id]?.part) : null })),
  };

  const changerGroupe = (id, partiel) => {
    setRefus(null);
    setBrouillon((b) => ({ ...b, groupes: { ...b.groupes, [id]: { ...b.groupes[id], ...partiel } } }));
  };

  async function enregistrer() {
    if (occupe.current) return;
    const raison = refusReglePourboires(candidat);
    if (raison) { setRefus(raison); return; }
    occupe.current = true;
    setEnCours(true);
    try {
      const ok = await regler({ pourboires: versConfigPourboires(candidat) });
      if (ok) notify('Règle de partage enregistrée.', 'success');
    } finally {
      occupe.current = false;
      setEnCours(false);
    }
  }

  async function retirer() {
    if (occupe.current) return;
    occupe.current = true;
    setEnCours(true);
    try {
      const ok = await regler({ pourboires: null });
      if (ok) notify('Règle de partage retirée.', 'success');
    } finally {
      occupe.current = false;
      setEnCours(false);
    }
  }

  return (
    <div style={st.bloc} data-reglage-pourboires="">
      <p style={st.aide}>
        Les pourboires saisis à l'encaissement sont partagés dans le rapport de la caisse, onglet Pourboires. Ils restent hors chiffre d'affaires. Rien n'est versé ni écrit en comptabilité.
      </p>
      {!regle && <p style={st.aide}>Aucune règle n'est réglée : le rapport ne propose aucun partage.</p>}

      <div style={st.sousTitre}>Comment les pourboires sont partagés</div>
      <SegmentedTabs tabs={MODES} active={brouillon.mode} onChange={(m) => { setRefus(null); setBrouillon((b) => ({ ...b, mode: m })); }} retourLigne />
      <p style={st.aide}>{PHRASES_REGLE[brouillon.mode]}</p>

      <div style={st.sousTitre}>{brouillon.mode === 'cle' ? 'Groupes qui partagent, et la part de chacun' : 'Groupes qui partagent'}</div>
      <div style={st.liste}>
        {groupes.map((g) => {
          const e = brouillon.groupes[g.id] || { coche: false, part: '' };
          return (
            <div key={g.id} style={st.ligne}>
              <label style={st.caseLigne}>
                <input
                  type="checkbox"
                  checked={e.coche}
                  onChange={(ev) => changerGroupe(g.id, { coche: ev.target.checked })}
                  style={st.case}
                />
                <span style={st.nom} data-no-translate>{g.nom}</span>
              </label>
              {brouillon.mode === 'cle' && e.coche && (
                <span style={st.part}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={e.part}
                    aria-label="Part du groupe en pour cent"
                    onChange={(ev) => changerGroupe(g.id, { part: ev.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                    style={st.champ}
                  />
                  <span>%</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {brouillon.mode === 'cle' && (
        <div style={st.total} data-pourboires-total="">
          <span>Total des parts :</span> <span style={st.num}>{totalParts}</span> <span>%</span>
        </div>
      )}
      {refus && <p style={st.refus} role="alert">{refus}</p>}

      <div style={st.rang}>
        <Btn variant="primary" onClick={enregistrer} disabled={enCours} style={st.btn44}>Enregistrer la règle</Btn>
        {regle && <Btn variant="ghost" onClick={retirer} disabled={enCours} style={st.btn44}>Retirer la règle</Btn>}
      </div>
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  sousTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text2)', marginTop: 6 },
  aide: { fontSize: 'var(--t2)', color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  liste: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  ligne: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, minHeight: 'var(--ligne)', padding: '4px 0', minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  caseLigne: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, flex: '1 1 160px', minWidth: 0, cursor: 'pointer' },
  case: { width: 24, height: 24, flexShrink: 0, accentColor: 'var(--accent)' },
  nom: { fontSize: 'var(--t2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  part: { display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 'var(--t2)', color: 'var(--text)' },
  champ: {
    width: 84, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', textAlign: 'right',
    fontFamily: 'var(--font-num)', fontSize: 'var(--t3)', color: 'var(--text)', background: 'var(--surface)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)',
  },
  total: { fontSize: 'var(--t2)', color: 'var(--text)' },
  num: { fontFamily: 'var(--font-num)' },
  refus: { fontSize: 'var(--t2)', color: 'var(--danger-text)', margin: 0, lineHeight: 1.4 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn44: { minHeight: 44, flexShrink: 0 },
};
