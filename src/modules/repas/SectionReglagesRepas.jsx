import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { ChampEntier, EtatModule, st as stm } from '../compte/sections/reglagesModulesUi.jsx';
import { REPAS, chf } from '../hebergement/hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Repas hôtel » de la page des réglages (plan 15, lot 6b) :
//   - horaires de chaque repas, affichés avec ses couverts ;
//   - heures et frais du room service (les frais s'ajoutent à la commande) ;
//   - carte du room service : un toucher ajoute l'article et son prix à la
//     commande, au lieu de le taper.
// reglages_modules, module 'repas'. Écriture : direction de la maison (RLS) ;
// la section n'est proposée qu'à la direction de l'hôtel.
// ─────────────────────────────────────────────────────────────────────────────

// Deux heures (début, fin), enregistrées quand les deux sont valides.
function ChampPlage({ plage, onValider, desactive }) {
  const [debut, setDebut] = React.useState(plage?.debut || '');
  const [fin, setFin] = React.useState(plage?.fin || '');
  React.useEffect(() => { setDebut(plage?.debut || ''); setFin(plage?.fin || ''); }, [plage?.debut, plage?.fin]);
  const valider = (d, f) => {
    if (!d && !f) { if (plage) onValider(null); return; }
    if (!d || !f) return;
    if (d >= f) { notify('La fin vient après le début.', 'warning'); return; }
    if (d !== plage?.debut || f !== plage?.fin) onValider({ debut: d, fin: f });
  };
  return (
    <span style={st.plage}>
      <input type="time" aria-label="Début" value={debut} disabled={desactive} style={st.heure}
        onChange={(e) => setDebut(e.target.value)} onBlur={() => valider(debut, fin)} />
      <span style={stm.unite}>à</span>
      <input type="time" aria-label="Fin" value={fin} disabled={desactive} style={st.heure}
        onChange={(e) => setFin(e.target.value)} onBlur={() => valider(debut, fin)} />
    </span>
  );
}

export default function SectionReglagesRepas({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'repas');
  const [enCours, setEnCours] = React.useState(false);
  const [article, setArticle] = React.useState({ libelle: '', prix: '' });
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (changes) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer(changes);
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };

  const carte = reglages.carte;
  const ajouterArticle = async () => {
    const libelle = article.libelle.trim();
    const prix = Number(String(article.prix).replace(',', '.'));
    if (!libelle) return;
    if (libelle.length > 80) { notify('80 caractères au plus.', 'warning'); return; }
    if (!Number.isFinite(prix) || prix < 0 || prix > 1000) { notify('Un prix entre 0 et 1000 CHF.', 'warning'); return; }
    if (carte.some((a) => a.libelle.toLowerCase() === libelle.toLowerCase())) { notify('Cet article est déjà sur la carte.', 'warning'); return; }
    if (carte.length >= 80) { notify('80 articles au plus.', 'warning'); return; }
    if (await ecrire({ carte: [...carte, { libelle, prix: Math.round(prix * 100) / 100 }] })) setArticle({ libelle: '', prix: '' });
  };

  return (
    <div style={ui.liste} data-section-reglages="repas">
      <Ligne colonne titre="Horaires des repas" aide="Ils s'affichent avec les couverts de chaque repas. Laissez vide un repas que la maison ne sert pas à heure fixe.">
        <div style={st.grille}>
          {REPAS.map((r) => (
            <label key={r.id} style={st.champBloc}>
              <span style={st.champLabel}>{r.label}</span>
              <ChampPlage plage={reglages.horaires[r.id]} desactive={enCours}
                onValider={(p) => ecrire({ horaires: { ...reglages.horaires, [r.id]: p } })} />
            </label>
          ))}
        </div>
      </Ligne>
      <Ligne colonne titre="Room service" aide="Les heures s'affichent sur la tuile du room service. Les frais s'ajoutent à chaque commande comme un article.">
        <div style={st.grille}>
          <label style={st.champBloc}>
            <span style={st.champLabel}>Heures</span>
            <ChampPlage plage={reglages.room_service.heures} desactive={enCours}
              onValider={(p) => ecrire({ room_service: { ...reglages.room_service, heures: p } })} />
          </label>
          <label style={st.champBloc}>
            <span style={st.champLabel}>Frais de service</span>
            <ChampEntier label="Frais de service en CHF" valeur={Math.round(reglages.room_service.frais)} min={0} max={100} unite="CHF" desactive={enCours}
              onValider={(n) => ecrire({ room_service: { ...reglages.room_service, frais: n } })} />
          </label>
        </div>
      </Ligne>
      <Ligne colonne derniere titre="Carte du room service" aide="Un toucher ajoute l'article et son prix à la commande. Un article hors carte se tape toujours.">
        <div style={stm.liste}>
          {carte.length === 0 && <p style={stm.vide}>Aucun article : chaque commande se tape.</p>}
          {carte.map((a) => (
            <div key={a.libelle} style={stm.ligne} data-valeur-liste="">
              <span style={stm.texte}><span data-no-translate="">{a.libelle}</span> <span style={st.prix} data-no-translate="">CHF {chf(a.prix)}</span></span>
              <Btn variant="ghost" disabled={enCours} style={stm.btn44} onClick={() => ecrire({ carte: carte.filter((x) => x.libelle !== a.libelle) })}>Retirer</Btn>
            </div>
          ))}
          <div style={stm.ajout}>
            <input type="text" value={article.libelle} maxLength={80} aria-label="Nouvel article" placeholder="Club sandwich"
              onChange={(e) => setArticle((p) => ({ ...p, libelle: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') ajouterArticle(); }} style={stm.champ} />
            <span style={st.plage}>
              <input type="text" inputMode="decimal" value={article.prix} aria-label="Prix en CHF" placeholder="24.00"
                onChange={(e) => setArticle((p) => ({ ...p, prix: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') ajouterArticle(); }}
                style={{ ...stm.champ, width: 104, flex: '0 0 auto', textAlign: 'right', fontFamily: 'var(--font-num)' }} />
              <span style={stm.unite}>CHF</span>
            </span>
            <Btn variant="primary" disabled={enCours || !article.libelle.trim() || String(article.prix).trim() === ''} style={stm.btn44} onClick={ajouterArticle}>Ajouter</Btn>
          </div>
        </div>
      </Ligne>
    </div>
  );
}

const st = {
  grille: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 },
  champBloc: { display: 'flex', flexDirection: 'column', gap: 6 },
  champLabel: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  plage: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  heure: { ...stm.champ, width: 120, flex: '0 0 auto', fontFamily: 'var(--font-num)' },
  prix: { color: 'var(--text2)', fontFamily: 'var(--font-num)', marginLeft: 6 },
};
