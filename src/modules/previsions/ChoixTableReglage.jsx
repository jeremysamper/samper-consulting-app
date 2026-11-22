import { useEffect, useState } from 'react';
import { usePlanSalle } from '../../hooks/usePlanSalle.js';
import { encadreStyle } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Réglage « Choix de la table » de la réservation en ligne (lot L9), dans la
// section des réglages (ReglagesTableEnLigne.jsx). Patron et consultant : la
// règle d'écriture de reservation_en_ligne_parametres le garde en base.
//
// Oui ou non (non par défaut), puis les salles ouvertes à ce choix. Le
// visiteur voit ensuite, après le jour et l'heure, le plan de ces salles avec
// les tables libres pour son nombre de personnes (RPC table_en_ligne_plan).
// ─────────────────────────────────────────────────────────────────────────────

export default function ChoixTableReglage({ etablissementId, actif, salles: choisies, onActif, onSalles, styles }) {
  const plan = usePlanSalle(etablissementId);
  const [salles, setSalles] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    Promise.all([plan.listSalles(), plan.listTables()]).then(([rs, rt]) => {
      if (!vivant) return;
      if (rs.error || rt.error) { setErreur(true); return; }
      const parSalle = new Map();
      for (const t of rt.data || []) if (t.actif !== false && t.salle_id) parSalle.set(t.salle_id, (parSalle.get(t.salle_id) || 0) + 1);
      setSalles((rs.data || []).filter((s) => s.actif !== false).map((s) => ({ id: s.id, nom: s.nom, tables: parSalle.get(s.id) || 0 })));
    });
    return () => { vivant = false; };
  }, [plan]);

  const basculer = (id) => onSalles(choisies.includes(id) ? choisies.filter((x) => x !== id) : [...choisies, id]);
  const aucuneCochee = actif && salles?.length > 0 && !salles.some((s) => choisies.includes(s.id));

  return (
    <div style={styles.carte}>
      <div style={styles.titre}>Choix de la table</div>
      <label style={{ ...styles.option, minHeight: 44 }}>
        <input type="checkbox" checked={actif} onChange={(e) => onActif(e.target.checked)} style={{ width: 18, height: 18, margin: '2px 0 0', flexShrink: 0 }} />
        <span>
          <span style={{ fontWeight: 'var(--g2)', fontSize: 'var(--t2)', color: 'var(--text)' }}>Laisser le client choisir sa table</span>
          <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5 }}>
            Après le jour et l'heure, il voit le plan des salles cochées, avec les tables libres pour son nombre de personnes. Il peut aussi vous laisser choisir. La table choisie est posée sur le plan : vous pouvez la changer.
          </span>
        </span>
      </label>
      {actif && (
        <div style={{ marginTop: 6, paddingLeft: 28 }}>
          {erreur && <div style={{ ...encadreStyle('erreur'), fontSize: 'var(--t1)' }}>Les salles n'ont pas pu être lues. Réessayez dans un instant.</div>}
          {!erreur && salles === null && <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)' }}>Chargement…</div>}
          {!erreur && salles?.length === 0 && (
            <div style={{ ...encadreStyle('info'), fontSize: 'var(--t1)', lineHeight: 1.5 }}>Aucune salle n'est encore dessinée sur le plan de salle.</div>
          )}
          {!erreur && salles?.length > 0 && (
            <div role="group" aria-label="Salles ouvertes au choix" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', marginBottom: 2 }}>Salles proposées</div>
              {salles.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                  <input type="checkbox" checked={choisies.includes(s.id)} onChange={() => basculer(s.id)} style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--t2)', color: 'var(--text)' }}>
                    <span data-no-translate>{s.nom}</span>
                    <span style={{ color: 'var(--text3)' }}> (<span data-no-translate>{s.tables}</span> {s.tables > 1 ? 'tables' : 'table'})</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {aucuneCochee && (
            <div style={{ ...encadreStyle('alerte'), fontSize: 'var(--t1)', lineHeight: 1.5, marginTop: 6 }}>
              Cochez au moins une salle : sans elle, le client ne voit pas de plan.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
