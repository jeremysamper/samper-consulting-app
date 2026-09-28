import { useMemo, useState } from 'react';
import {
  Archive, ArchiveRestore, Cake, CalendarPlus, ChevronRight, Gift, HeartPulse, Leaf, Mail, MailCheck,
  NotebookPen, Pencil, Phone, Sprout, Trash2,
} from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { zurichToday } from '../../utils/zurichTime.js';
import BonCarte from './BonCarte.jsx';
import SeanceForm from './SeanceForm.jsx';
import { mapBon, mapSeance, seanceVersDB, useSpaTable } from './spaData.js';
import {
  Avatar, BoutonFermer, EtatVide, Modale, Puce, TitreSection, age, dateLongue, heureFin,
  jourComplet, jourMois, metaStatutRdv, nomClient, prochainAnniversaire, st,
} from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Fiche client, en tiroir latéral : l'agenda reste visible derrière.
//
// Dans l'ordre où le praticien en a besoin : ce qu'il faut savoir avant
// d'entrer en cabine (santé, préférences, dernier conseil), les rendez-vous à
// venir, le parcours complet des séances, puis les bons cadeaux.
// ─────────────────────────────────────────────────────────────────────────────

const MOIS_ANNEE = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });

export default function ClientFiche({
  client, etablissementId, reservations, stats, peutGerer, peutSupprimer, peutOffrir,
  onModifier, onReserver, onOffrirBon, onArchiver, onSupprimer, onClose,
}) {
  const aujourdhui = zurichToday();
  const [seanceOuverte, setSeanceOuverte] = useState(null); // {} = nouvelle, sinon séance
  const [deplie, setDeplie] = useState(null);

  const seances = useSpaTable('spa_seances', etablissementId, {
    map: mapSeance, filtres: [['client_id', 'eq', client.id]], cle: client.id, order: [['date_seance', false]], limit: 500,
  });
  const bons = useSpaTable('spa_bons', etablissementId, {
    map: mapBon, filtres: [['client_id', 'eq', client.id]], cle: client.id, order: [['created_at', false]], limit: 200,
  });

  const historique = useMemo(
    () => [...seances.rows].sort((a, b) => b.dateSeance.localeCompare(a.dateSeance) || String(b.createdAt).localeCompare(String(a.createdAt))),
    [seances.rows]
  );
  const aVenir = useMemo(
    () => reservations
      .filter((r) => r.clientId === client.id && r.dateRdv >= aujourdhui && !['annulee', 'terminee', 'absent'].includes(r.statut))
      .sort((a, b) => (a.dateRdv + a.heureDebut).localeCompare(b.dateRdv + b.heureDebut)),
    [reservations, client.id, aujourdhui]
  );
  const nbAbsences = reservations.filter((r) => r.clientId === client.id && r.statut === 'absent').length;
  const bonsTries = useMemo(() => [...bons.rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [bons.rows]);

  const ans = age(client.dateNaissance, aujourdhui);
  const anniv = prochainAnniversaire(client.dateNaissance, aujourdhui);
  const derniere = historique[0] || null;
  // Seul le dernier compte rendu fait foi : un conseil plus ancien a été
  // remplacé par la séance qui a suivi.
  const conseil = derniere?.prochaineSeance && derniere.prochaineSeance >= aujourdhui ? derniere : null;
  const depuis = client.createdAt ? MOIS_ANNEE.format(new Date(client.createdAt)) : null;

  async function sauverSeance(sv) {
    const valeurs = seanceVersDB(sv);
    return seanceOuverte?.id ? seances.modifier(seanceOuverte.id, valeurs) : seances.inserer(valeurs);
  }

  async function basculerBon(bon) {
    const utilise = !bon.utiliseAt;
    if (!utilise && !window.confirm(`Remettre le bon ${bon.code} comme non utilisé ?`)) return;
    if (utilise && bon.valableJusqu && bon.valableJusqu < aujourdhui
      && !window.confirm(`Ce bon a expiré le ${dateLongue(bon.valableJusqu)}. Le marquer utilisé quand même ?`)) return;
    const { error } = await bons.modifier(bon.id, { utilise_at: utilise ? new Date().toISOString() : null });
    if (error) { notify(error, 'error'); return; }
    notify(utilise ? 'Bon marqué utilisé.' : 'Bon de nouveau disponible.', 'success');
  }

  const entete = (
    <div style={s.entete}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
          <Avatar client={client} taille={68} />
          <div style={{ minWidth: 0 }}>
            <div style={st.surTitre}>Fiche client{client.archive ? ' archivée' : ''}</div>
            <div style={s.nom} data-no-translate>{nomClient(client)}</div>
            <div style={{ fontSize: 13, color: 'var(--spa-ink2)' }}>
              {[ans !== null ? `${ans} ans` : null, depuis ? `client depuis ${depuis}` : null].filter(Boolean).join(', ')}
            </div>
          </div>
        </div>
        <BoutonFermer onClose={onClose} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        {anniv && (
          <Puce icone={Cake} ton="kin">
            {anniv.jours === 0 ? 'Anniversaire aujourd\'hui' : `Anniversaire le ${jourMois(client.dateNaissance)}${anniv.jours <= 30 ? `, dans ${anniv.jours} jour${anniv.jours > 1 ? 's' : ''}` : ''}`}
          </Puce>
        )}
        {client.consentementMarketing
          ? <Puce icone={MailCheck} ton="matcha">Accepte les e-mails</Puce>
          : <Puce icone={Mail}>{client.desinscritAt ? 'Désinscrit des e-mails' : 'Pas d\'accord e-mail'}</Puce>}
        {nbAbsences > 0 && <Puce ton="sakura">{nbAbsences} absence{nbAbsences > 1 ? 's' : ''}</Puce>}
      </div>

      {/* Actions rapides */}
      <div style={s.actions}>
        {peutGerer && (
          <button type="button" onClick={() => onReserver(client)} style={st.principal}>
            <CalendarPlus size={17} strokeWidth={1.8} aria-hidden="true" /> Réserver
          </button>
        )}
        <button type="button" onClick={() => setSeanceOuverte({})} style={st.secondaire}>
          <NotebookPen size={16} strokeWidth={1.8} aria-hidden="true" /> Compte rendu
        </button>
        {peutOffrir && (
          <button type="button" onClick={() => onOffrirBon(client)} style={st.secondaire}>
            <Gift size={16} strokeWidth={1.8} aria-hidden="true" /> Offrir un bon
          </button>
        )}
        {client.telephone && (
          <a href={`tel:${client.telephone.replace(/\s+/g, '')}`} style={{ ...st.secondaire, textDecoration: 'none', boxSizing: 'border-box' }} aria-label={`Appeler ${nomClient(client)}`}>
            <Phone size={16} strokeWidth={1.8} aria-hidden="true" /> Appeler
          </a>
        )}
        {client.email && (
          <a href={`mailto:${client.email}`} style={{ ...st.secondaire, textDecoration: 'none', boxSizing: 'border-box' }} aria-label={`Écrire à ${nomClient(client)}`}>
            <Mail size={16} strokeWidth={1.8} aria-hidden="true" /> Écrire
          </a>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Modale
        titre={nomClient(client)}
        titreBrut
        entete={entete}
        variante="tiroir"
        largeur={640}
        onClose={onClose}
        pied={(
          <>
            {peutSupprimer && (
              <button type="button" onClick={() => onSupprimer(client)} style={{ ...st.danger, marginRight: 'auto' }}>
                <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" /> Supprimer
              </button>
            )}
            {peutGerer && (
              <button type="button" onClick={() => onArchiver(client, !client.archive)} style={st.discret}>
                {client.archive
                  ? <><ArchiveRestore size={16} strokeWidth={1.8} aria-hidden="true" /> Réactiver</>
                  : <><Archive size={16} strokeWidth={1.8} aria-hidden="true" /> Archiver</>}
              </button>
            )}
            {peutGerer && (
              <button type="button" onClick={() => onModifier(client)} style={st.secondaire}>
                <Pencil size={16} strokeWidth={1.8} aria-hidden="true" /> Modifier la fiche
              </button>
            )}
          </>
        )}
      >
        {/* ── Chiffres ── */}
        <div className="spa-chiffres" style={s.chiffres}>
          <Chiffre valeur={stats?.nb || historique.length || 0} label={(stats?.nb || historique.length) > 1 ? 'séances' : 'séance'} />
          <Chiffre valeur={derniere ? jourMois(derniere.dateSeance) : 'Aucune'} label="dernière visite" />
          <Chiffre valeur={stats?.soinPrefere || 'Aucun'} label="soin favori" brut petit />
        </div>

        {/* ── Avant la séance ── */}
        {(client.notesSante || client.preferences || conseil || client.notes) && (
          <section>
            <TitreSection>Avant la séance</TitreSection>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {client.notesSante && (
                <div style={st.encartSante}>
                  <HeartPulse size={18} strokeWidth={1.8} color="var(--spa-sakura)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><strong>Santé :</strong> {client.notesSante}</span>
                </div>
              )}
              {client.preferences && (
                <div style={st.encartInfo}>
                  <Leaf size={18} strokeWidth={1.8} color="var(--spa-mizu)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><strong>Préférences :</strong> {client.preferences}</span>
                </div>
              )}
              {conseil && (
                <div style={{ ...st.encartInfo, background: 'var(--spa-matcha-soft)' }}>
                  <Sprout size={18} strokeWidth={1.8} color="var(--spa-matcha)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Revenir vers le <strong>{dateLongue(conseil.prochaineSeance)}</strong>
                    {conseil.recommandations ? ` : ${conseil.recommandations}` : '.'}
                  </span>
                </div>
              )}
              {client.notes && <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--spa-ink2)', overflowWrap: 'anywhere' }}>{client.notes}</div>}
            </div>
          </section>
        )}

        {/* ── À venir ── */}
        {aVenir.length > 0 && (
          <section>
            <TitreSection>À venir</TitreSection>
            <div style={st.liste}>
              {aVenir.map((r) => {
                const m = metaStatutRdv(r.statut);
                return (
                  <div key={r.id} style={{ ...st.ligne, cursor: 'default', boxShadow: 'none', minHeight: 56 }}>
                    <span style={s.dateBloc}>
                      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{jourComplet(r.dateRdv).split(' ')[0].slice(0, 3)}</span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20, lineHeight: 1 }} data-no-translate>{Number(r.dateRdv.slice(8))}</span>
                    </span>
                    <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 14 }}>
                      <span style={{ display: 'block', fontWeight: 600 }}>{r.soinLibelle || 'Soin à préciser'}</span>
                      <span style={{ display: 'block', color: 'var(--spa-ink2)', fontSize: 13 }}>
                        {jourMois(r.dateRdv)}, de {r.heureDebut} à {heureFin(r.heureDebut, r.dureeMin)}{r.praticien ? ` avec ${r.praticien}` : ''}
                      </span>
                    </span>
                    <span style={{ ...st.puce, background: m.fond, color: m.texte }}>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Parcours des séances ── */}
        <section>
          <TitreSection action={(
            <button type="button" onClick={() => setSeanceOuverte({})} style={st.lien}>
              <NotebookPen size={15} strokeWidth={1.8} aria-hidden="true" /> Ajouter
            </button>
          )}
          >
            Parcours des séances
          </TitreSection>
          {seances.status === 'error' && <div style={st.encartDanger}>L'historique ne s'est pas chargé. Vérifiez la connexion internet.</div>}
          {seances.status === 'ready' && !historique.length && (
            <EtatVide icone={Sprout} texte="Aucune séance pour l'instant. À la fin de chaque soin, remplissez le compte rendu : il s'affichera ici." />
          )}
          <ol style={s.parcours}>
            {historique.map((sc, i) => {
              const ouvert = deplie === sc.id || (deplie === null && i === 0);
              const details = [
                ['Observations', sc.observations], ['Produits', sc.produits],
                ['Ressenti', sc.ressenti], ['Conseils', sc.recommandations],
              ].filter(([, v]) => v);
              return (
                <li key={sc.id} style={s.etape}>
                  <span aria-hidden="true" style={{ ...s.point, ...(i === 0 ? s.pointRecent : null) }} />
                  <div style={{ ...st.carte, padding: 0, boxShadow: 'none', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setDeplie(ouvert ? '' : sc.id)}
                      aria-expanded={ouvert}
                      style={s.etapeTete}
                    >
                      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 17 }}>{dateLongue(sc.dateSeance)}</span>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)' }}>
                          {[sc.soin, sc.praticien].filter(Boolean).join(', ') || 'Séance'}
                        </span>
                      </span>
                      <ChevronRight size={18} strokeWidth={1.8} aria-hidden="true" style={{ color: 'var(--spa-ink3)', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform 200ms ease' }} />
                    </button>
                    {ouvert && (
                      <div style={{ padding: '0 16px 16px' }}>
                        {details.length ? (
                          <div style={s.details}>
                            {details.map(([l, v]) => (
                              <div key={l} style={{ minWidth: 0 }}>
                                <div style={s.detailLabel}>{l}</div>
                                <div style={{ fontSize: 14, lineHeight: 1.55 }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        ) : <div style={{ fontSize: 13, color: 'var(--spa-ink2)' }}>Compte rendu vide.</div>}
                        {sc.prochaineSeance && (
                          <div style={{ fontSize: 13, color: 'var(--spa-matcha)', marginTop: 10 }}>
                            Prochaine venue conseillée : {dateLongue(sc.prochaineSeance)}
                          </div>
                        )}
                        <button type="button" onClick={() => setSeanceOuverte(sc)} style={{ ...st.lien, marginTop: 6 }}>
                          <Pencil size={14} strokeWidth={1.8} aria-hidden="true" /> Modifier
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Bons cadeaux ── */}
        <section>
          <TitreSection action={peutOffrir && (
            <button type="button" onClick={() => onOffrirBon(client)} style={st.lien}>
              <Gift size={15} strokeWidth={1.8} aria-hidden="true" /> Offrir
            </button>
          )}
          >
            Bons cadeaux
          </TitreSection>
          {bons.status === 'ready' && !bonsTries.length && <div style={{ fontSize: 14, color: 'var(--spa-ink2)' }}>Aucun bon émis.</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            {bonsTries.map((b) => (
              <BonCarte key={b.id} bon={b} aujourdhui={aujourdhui} compact onBasculer={() => basculerBon(b)} />
            ))}
          </div>
        </section>
      </Modale>

      {seanceOuverte && (
        <SeanceForm
          client={client}
          seance={seanceOuverte.id ? seanceOuverte : null}
          onSave={sauverSeance}
          onClose={() => setSeanceOuverte(null)}
        />
      )}
    </>
  );
}

function Chiffre({ valeur, label, brut = false, petit = false }) {
  return (
    <div style={s.chiffre}>
      <span
        style={{ fontFamily: 'var(--font-serif)', fontSize: petit ? 16 : 'clamp(19px, 5.6vw, 24px)', lineHeight: 1.2, maxWidth: '100%', overflowWrap: 'break-word' }}
        data-no-translate={brut ? '' : undefined}
      >
        {valeur}
      </span>
      <span style={{ fontSize: 12, color: 'var(--spa-ink2)' }}>{label}</span>
    </div>
  );
}

const s = {
  entete: { padding: '22px 22px 18px', background: 'var(--spa-hero)', borderBottom: '1px solid var(--spa-line)', flexShrink: 0 },
  // Nom : 28 px sur grand écran, un peu moins sur téléphone où l'avatar et le
  // bouton fermer ne laissent que ~180 px ; un mot trop long se coupe en
  // dernier recours plutôt que de sortir de l'en-tête.
  nom: { fontFamily: 'var(--font-serif)', fontSize: 'clamp(22px, 6.4vw, 28px)', lineHeight: 1.15, color: 'var(--spa-ink)', margin: '2px 0', overflowWrap: 'break-word' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  // Colonnes dans spa.css (.spa-chiffres) : trois, deux sur téléphone.
  chiffres: { display: 'grid', gap: 10 },
  chiffre: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, textAlign: 'center',
    padding: '14px 10px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface2)', border: '1px solid var(--spa-line)',
  },
  dateBloc: {
    width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    color: 'var(--spa-mizu)',
  },
  parcours: { listStyle: 'none', margin: 0, padding: '0 0 0 22px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '2px solid var(--spa-line)', marginLeft: 6 },
  etape: { position: 'relative' },
  point: {
    position: 'absolute', left: -31, top: 20, width: 14, height: 14, borderRadius: 7, boxSizing: 'border-box',
    background: 'var(--spa-surface)', border: '2px solid var(--spa-line2)',
  },
  pointRecent: { background: 'var(--spa-mizu)', border: '2px solid var(--spa-mizu)', boxShadow: '0 0 0 4px var(--spa-mizu-soft)' },
  etapeTete: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 60, padding: '10px 16px',
    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
    fontFamily: 'var(--font)', color: 'var(--spa-ink)',
  },
  details: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 },
  detailLabel: {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--spa-ink2)', marginBottom: 4,
  },
};
