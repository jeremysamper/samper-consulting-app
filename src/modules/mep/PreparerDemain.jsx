import React from 'react';
import { supabase } from '../../services/supabase.js';
import { notify } from '../../components/toast/index.js';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { useMiseEnPlace } from '../pos/hooks/useMiseEnPlace.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { listeDemain } from './serieDemain.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Mise en place de demain » (plan 15, lot 4) : la liste J+1 de Ventes POS
// entre dans le module. On choisit le poste et, s'il y en a, un modèle de
// liste du poste (Réglages > Mise en place) ; l'app propose les lignes du
// modèle plus les plats vendus le même jour de semaine (moyenne des 14 derniers
// jours, Ventes POS), ajustés par la prévision des couverts de demain. Chaque
// ligne garde la quantité proposée (quantite_suggeree) à côté de la retenue.
// Écriture : mêmes droits que les listes (consultant, resp_cuisine, cuisinier).
// ─────────────────────────────────────────────────────────────────────────────

export default function PreparerDemain({ etablissement, user, onClose, onCreee }) {
  const etabId = etablissement?.id || null;
  const demain = zurichAjouterJours(zurichToday(), 1);
  const { reglages } = useReglagesModule(etabId, 'mep');
  const postes = reglages?.postes || [];
  const pos = useMiseEnPlace(etablissement);
  const [modeles, setModeles] = React.useState([]);
  const [prevision, setPrevision] = React.useState({ prevus: null, reference: null });
  const [poste, setPoste] = React.useState('');
  const [modeleId, setModeleId] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);

  React.useEffect(() => {
    if (!etabId) return undefined;
    let vivant = true;
    (async () => {
      const [m, p] = await Promise.all([
        supabase.from('mep_modeles').select('*').eq('etablissement_id', etabId).order('ordre'),
        supabase.from('previsions_jour').select('date_service, couverts_midi, couverts_soir, couverts_brunch')
          .eq('etablissement_id', etabId).in('date_service', [demain, zurichAjouterJours(demain, -7), zurichAjouterJours(demain, -14)]),
      ]);
      if (!vivant) return;
      if (m.error) console.error('[mep] modèles', m.error); else setModeles((m.data || []).filter((x) => x.actif !== false));
      if (p.error) { console.error('[mep] prévision', p.error); return; }
      const total = (r) => (Number(r.couverts_midi) || 0) + (Number(r.couverts_soir) || 0) + (Number(r.couverts_brunch) || 0);
      const lignes = p.data || [];
      const dem = lignes.find((r) => r.date_service === demain);
      const passes = lignes.filter((r) => r.date_service !== demain).map(total).filter((n) => n > 0);
      setPrevision({
        prevus: dem ? total(dem) : null,
        reference: passes.length ? Math.round(passes.reduce((a, b) => a + b, 0) / passes.length) : null,
      });
    })();
    return () => { vivant = false; };
  }, [etabId, demain]);

  const modelesDuPoste = modeles.filter((m) => !poste || !m.poste || m.poste === poste);
  const modele = modelesDuPoste.find((m) => m.id === modeleId) || null;
  const [y, mo, d] = demain.split('-').map(Number);
  const jourSemaine = new Date(Date.UTC(y, mo - 1, d)).getUTCDay() || 7;
  const proposition = listeDemain({ modele, ventes: pos.items, prevision, jourSemaine });

  const creer = async () => {
    if (enCours || proposition.lignes.length === 0) return;
    setEnCours(true);
    try {
      const nom = poste ? `Mise en place de demain, ${poste}` : 'Mise en place de demain';
      const { data: liste, error } = await supabase.from('mep_listes').insert({
        etablissement_id: etabId, nom, date_service: demain, created_by: user?.id || null,
        poste: poste || null, modele_id: modele?.id || null, origine: 'prevision',
        base_calcul: { jours_ventes: 14, jour_semaine: proposition.jourSemaine, couverts_prevus: prevision.prevus, couverts_reference: prevision.reference },
      }).select().single();
      if (error) throw error;
      const items = proposition.lignes.map((l, i) => ({
        liste_id: liste.id, recette_id: l.recetteId || null, label: l.label, quantite: l.quantite, unite: l.unite || null,
        congelable: l.congelable ?? null, ordre: i, quantite_suggeree: l.quantite, origine: l.origine,
      }));
      const r = await supabase.from('mep_items').insert(items);
      if (r.error) throw r.error;
      notify('La liste de demain est prête.', 'success');
      onCreee?.(liste.id);
    } catch (err) {
      console.error('[mep] liste de demain', err);
      notify(String(err?.code) === '42501' ? 'Votre rôle ne permet pas de créer une liste.' : "La liste n'a pas pu être créée. Réessayez.", 'error');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Fenetre
      id="mep-demain"
      titre="Mise en place de demain"
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours || proposition.lignes.length === 0} onClick={creer}>Créer la liste</button>
        </>
      )}
    >
      {postes.length > 0 && (
        <label style={fs.section}>
          <span style={fs.label}>Poste</span>
          <select style={fs.champ} value={poste} onChange={(e) => { setPoste(e.target.value); setModeleId(''); }}>
            <option value="">Tous les postes</option>
            {postes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      {modelesDuPoste.length > 0 && (
        <label style={fs.section}>
          <span style={fs.label}>Modèle de liste</span>
          <select style={fs.champ} value={modeleId} onChange={(e) => setModeleId(e.target.value)}>
            <option value="">Sans modèle</option>
            {modelesDuPoste.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </label>
      )}
      <div style={fs.section}>
        <span style={fs.remarque}>
          {pos.loading ? 'Lecture des ventes…' : pos.items.length
            ? <>Quantités tirées des ventes des 14 derniers jours, le même jour de la semaine.</>
            : <>Aucune vente reliée à une fiche : seules les lignes du modèle sont proposées.</>}
          {proposition.facteur !== 1 && <> Ajustées à la prévision : <span data-no-translate="">{prevision.prevus}</span> couverts attendus contre <span data-no-translate="">{prevision.reference}</span> d'habitude.</>}
        </span>
        {proposition.lignes.length === 0 ? (
          <span style={fs.remarque}>Rien à proposer pour demain. Choisissez un modèle, ou créez une liste à la main.</span>
        ) : (
          <div style={st.liste}>
            {proposition.lignes.map((l) => (
              <div key={l.cle} style={st.ligne}>
                <span style={st.nom} data-no-translate="">{l.label}</span>
                <span style={st.qte} data-no-translate="">{l.quantite ?? ''}{l.unite ? ` ${l.unite}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Fenetre>
  );
}

const st = {
  liste: { display: 'flex', flexDirection: 'column' },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 40, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' },
  nom: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', color: 'var(--text)' },
  qte: { fontSize: 'var(--t2)', color: 'var(--text2)', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' },
};
