import React from 'react';
import { ChevronsRight } from 'lucide-react';
import { PLAN_W, PLAN_H } from '../../hooks/usePlanSalle.js';
import { TabBar } from '../../components/ui/index.jsx';
import { useLargeur, useMaintenant } from './mesures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Plan de salle compact, en lecture : une vignette par salle, les tables
// posées aux coordonnées du canevas virtuel 1000 x 700 (usePlanSalle), mises
// à l'échelle en pourcentages. Aucune édition ici : un tap sur une table
// appelle onTapTable. Sans mobilier dessiné, repli en liste de boutons.
//
// v4, lecture sans tap : une table ouverte affiche son montant, son nombre
// d'articles, les minutes écoulées depuis le dernier envoi en cuisine et un
// repère quand des lignes « à suivre » attendent. Ce qu'une petite table ne
// peut pas porter (un tabouret fait 44 px) se lit dans la liste « Tables
// ouvertes » sous le plan, toujours complète. Une table libre reste sobre.
// Les noms de tables sont des données : data-no-translate. Chaque nombre vit
// dans son propre noeud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

// L'état d'un ticket, calculé une fois pour le plan et pour la liste.
export function etatTicket(ticket, maintenant = Date.now()) {
  const lignes = ticket?.lignes || [];
  const envois = lignes.map((l) => (l.envoye_at ? new Date(l.envoye_at).getTime() : 0)).filter(Boolean);
  const dernier = envois.length ? Math.max(...envois) : null;
  const enAttente = lignes.filter((l) => l.statut === 'en_attente');
  return {
    articles: lignes.reduce((s, l) => s + Number(l.quantite || 0), 0),
    montant: lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0),
    minutes: dernier == null ? null : Math.max(0, Math.floor((maintenant - dernier) / 60000)),
    aEnvoyer: enAttente.filter((l) => l.suite === 1).length,
    aSuivre: enAttente.filter((l) => l.suite > 1).length,
  };
}

// noms (v5) : table_id -> { nom, attendu, heure }. Le nom de la réservation
// s'écrit sous celui de la table quand la place le permet : celle du ticket
// ouvert, ou la prochaine attendue posée sur une table encore libre.
export default function PlanTables({ salles, tables, ticketsParTable, noms = {}, onTapTable }) {
  const sallesAvecTables = (salles || []).filter((s) => (tables || []).some((t) => t.salle_id === s.id));
  const [salleId, setSalleId] = React.useState(null);
  const tablesActives = (tables || []).filter((t) => t.actif !== false);
  const maintenant = useMaintenant();
  const canevasRef = React.useRef(null);
  const largeur = useLargeur(canevasRef);

  if (!tablesActives.length) return null;

  // Tables sans salle (plan d'avant les espaces) : une vignette unique.
  const horsSalle = tablesActives.filter((t) => !t.salle_id);
  const onglets = sallesAvecTables.map((s) => ({ id: s.id, label: s.nom }));
  if (horsSalle.length && onglets.length) onglets.push({ id: '_autres', label: 'Autres tables' });
  const actif = salleId || onglets[0]?.id || '_autres';
  const visibles = actif === '_autres' || !onglets.length
    ? horsSalle
    : tablesActives.filter((t) => t.salle_id === actif);
  const ouvertes = visibles.filter((t) => ticketsParTable?.[t.id]);
  const hauteur = largeur * (PLAN_H / PLAN_W);

  return (
    <div style={st.bloc}>
      <div style={st.colPlan}>
        {onglets.length > 1 && (
          <TabBar tabs={onglets} active={actif} onChange={setSalleId} />
        )}
        <div ref={canevasRef} style={st.canevas} data-no-translate>
          {visibles.map((t) => {
            const ticket = ticketsParTable?.[t.id];
            const ronde = t.forme === 'ronde' || t.forme === 'tabouret';
            const e = ticket ? etatTicket(ticket, maintenant) : null;
            // Place réelle de la table à l'écran (jamais sous 44 px).
            const wPx = Math.max(44, (t.largeur / PLAN_W) * largeur);
            const hPx = Math.max(44, (t.hauteur / PLAN_H) * hauteur);
            // Grande table : montant, articles et minutes. Table moyenne :
            // montant et minutes. Petite (tabouret) : son nom, et les minutes
            // si la hauteur le permet. La liste à côté dit toujours tout.
            // Trois lignes (nom, montant, détail) tiennent dans 52 px.
            const large = wPx >= 96 && hPx >= 52;
            const moyenne = wPx >= 62 && hPx >= 52;
            const detail = hPx >= 52;
            // Le nom de la réservation : une ligne de plus, donc 68 px pour
            // une table ouverte (quatre lignes), 44 px pour une table libre.
            const client = noms[t.id];
            const placeNom = wPx >= 62 && (ticket ? hPx >= 68 : hPx >= 44);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTapTable(t, ticket)}
                data-table-ouverte={ticket ? '' : undefined}
                style={{
                  ...st.table,
                  left: `${(t.pos_x / PLAN_W) * 100}%`,
                  top: `${(t.pos_y / PLAN_H) * 100}%`,
                  width: `${(t.largeur / PLAN_W) * 100}%`,
                  height: `${(t.hauteur / PLAN_H) * 100}%`,
                  borderRadius: ronde ? '50%' : 10,
                  ...(ticket ? st.tableOccupee : null),
                }}
              >
                <span style={st.tableNom}>{t.nom}</span>
                {client && placeNom && (
                  <span style={{ ...st.tableClient, ...(ticket ? null : st.tableClientAttendu) }}>{client.nom}</span>
                )}
                {e && moyenne && <span style={st.tableMontant}>{chf(e.montant)}</span>}
                {e && detail && (
                  <span style={st.tableDetail}>
                    {large && <><span>{e.articles}</span><span style={st.sep}>art.</span></>}
                    {e.minutes != null && <><span>{e.minutes}</span><span style={st.sep}>min</span></>}
                  </span>
                )}
                {e && e.aSuivre > 0 && (
                  <span style={st.tableRepere} aria-hidden="true"><ChevronsRight size={14} strokeWidth={2.25} /></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {ouvertes.length > 0 && (
        <div style={st.liste}>
          <div style={st.listeTitre}>Tables ouvertes</div>
          {ouvertes.map((t) => {
            const ticket = ticketsParTable[t.id];
            const e = etatTicket(ticket, maintenant);
            return (
              <button key={t.id} type="button" data-cadre="" style={st.rang} onClick={() => onTapTable(t, ticket)}>
                <span style={st.rangNom} data-no-translate>{t.nom}</span>
                <span style={st.rangInfos}>
                  {noms[t.id] && !noms[t.id].attendu && (
                    <span style={st.rangClient} data-no-translate>{noms[t.id].nom}</span>
                  )}
                  <span style={st.rangLigne}>
                    <span style={st.num}>{e.articles}</span> <span>articles</span>
                  </span>
                  <span style={st.rangLigne}>
                    {e.minutes != null
                      ? <><span>Dernier envoi il y a</span> <span style={st.num}>{e.minutes}</span> <span>min</span></>
                      : <span>Rien d'envoyé en cuisine</span>}
                  </span>
                  {e.aSuivre > 0 && (
                    <span style={st.rangSuivre}>
                      <ChevronsRight size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span style={st.num}>{e.aSuivre}</span> <span>à suivre en attente</span>
                    </span>
                  )}
                </span>
                <span style={st.rangMontant}><span>{chf(e.montant)}</span> <span style={st.devise}>CHF</span></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const st = {
  // Écran large : le plan à gauche, la liste des tables ouvertes à droite,
  // les deux lisibles sans défiler. Écran étroit : la liste passe dessous.
  bloc: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', marginTop: 10 },
  colPlan: { display: 'flex', flexDirection: 'column', gap: 10, flex: '2 1 440px', minWidth: 0, maxWidth: 900 },
  canevas: {
    position: 'relative',
    width: '100%',
    aspectRatio: '10 / 7',
    background: 'var(--surface2)',
    borderRadius: 'var(--r-lg)',
    overflow: 'hidden',
  },
  // Cibles tactiles : jamais sous 44 px, même pour un tabouret minuscule.
  table: {
    position: 'absolute',
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    background: 'var(--surface)',
    color: 'var(--text)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'var(--font)',
    lineHeight: 1.15,
    overflow: 'hidden',
  },
  tableOccupee: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    borderColor: 'var(--accent)',
  },
  tableNom: { fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-num)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 2px' },
  tableClient: { fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 4px' },
  tableClientAttendu: { color: 'var(--text2)' },
  rangClient: { fontSize: 14, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' },
  tableMontant: { fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-num)' },
  tableDetail: { fontSize: 12, fontFamily: 'var(--font-num)', display: 'inline-flex', alignItems: 'baseline', whiteSpace: 'nowrap' },
  sep: { margin: '0 5px 0 2px' },
  tableRepere: { position: 'absolute', top: 3, right: 4, display: 'inline-flex' },
  liste: { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 300px', minWidth: 0, maxWidth: 900 },
  listeTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '4px 0 2px' },
  rang: {
    display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '10px 14px', width: '100%',
    borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, textAlign: 'left',
  },
  rangNom: { fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-num)', minWidth: 44, flexShrink: 0 },
  rangInfos: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  rangLigne: { color: 'var(--text2)', fontSize: 13 },
  rangSuivre: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text)', fontSize: 13, fontWeight: 600 },
  num: { fontFamily: 'var(--font-num)' },
  rangMontant: { fontFamily: 'var(--font-num)', fontWeight: 600, fontSize: 18, flexShrink: 0, whiteSpace: 'nowrap' },
  devise: { fontSize: 12, fontWeight: 500, color: 'var(--text2)' },
};
