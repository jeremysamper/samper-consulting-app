import React from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Btn, Coche, SegmentedTabs } from '../components/ui/index.jsx';
import useGlissement from '../hooks/useGlissement.js';
import { apresDepart, jouer, mouvementReduit, voler } from '../utils/mouvement.js';
import './planche.css';

// ─────────────────────────────────────────────────────────────────────────────
// Planche de mouvement : chaque carte montre un geste de l'app, en deux
// dosages. Le dosage n'est qu'un jeu de jetons (--mvt-*, --courbe-*) posé sur
// la planche par planche.css : les mêmes classes et les mêmes appels jouent
// plus court ou plus ample. Rien ici n'écrit ni ne lit de donnée.
// ─────────────────────────────────────────────────────────────────────────────

const DOSES = [{ id: 'sobre', label: 'Sobre' }, { id: 'marque', label: 'Marqué' }];
const chf = (n) => `CHF ${n.toFixed(2)}`;

function Carte({ titre, texte, large = false, children }) {
  return (
    <section className={`planche-carte${large ? ' planche-carte--large' : ''}`} data-cadre="">
      <h2 className="planche-carte-titre">{titre}</h2>
      <p className="planche-carte-texte">{texte}</p>
      <div className="planche-scene">{children}</div>
    </section>
  );
}

// Une sortie attend la fin de son animation pour démonter l'élément. Si cette
// fin n'arrive pas (animation coupée par une règle), un délai ferme quand même.
function useSortieGarantie(enSortie, fermer) {
  React.useEffect(() => {
    if (!enSortie) return undefined;
    const t = setTimeout(fermer, 700);
    return () => clearTimeout(t);
  }, [enSortie, fermer]);
}

// ── Boutons ──
function Boutons() {
  return (
    <div className="planche-rang">
      <Btn variant="primary">Enregistrer</Btn>
      <Btn>Annuler</Btn>
      <button type="button" className="planche-rond" aria-label="Ajouter">
        <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Onglets : la pilule sombre glisse vers l'onglet choisi ──
const PERIODES = ['Jour', 'Semaine', 'Mois', 'Année'];

function Onglets() {
  const [actif, setActif] = React.useState(0);
  const [place, setPlace] = React.useState(null);
  const boutons = React.useRef([]);
  const mesurer = React.useCallback(() => {
    const el = boutons.current[actif];
    if (el) setPlace({ x: el.offsetLeft, largeur: el.offsetWidth });
  }, [actif]);
  React.useLayoutEffect(() => { mesurer(); }, [mesurer]);
  React.useEffect(() => {
    window.addEventListener('resize', mesurer);
    document.fonts?.ready?.then(mesurer);
    return () => window.removeEventListener('resize', mesurer);
  }, [mesurer]);
  return (
    <div className="planche-onglets" role="tablist">
      {place && (
        <span className="planche-onglets-pilule" aria-hidden="true" style={{ transform: `translateX(${place.x}px)`, width: place.largeur }} />
      )}
      {PERIODES.map((nom, i) => (
        <button
          key={nom}
          type="button"
          role="tab"
          aria-selected={i === actif}
          className={`planche-onglet${i === actif ? ' is-actif' : ''}`}
          ref={(el) => { boutons.current[i] = el; }}
          onClick={() => setActif(i)}
        >
          {nom}
        </button>
      ))}
    </div>
  );
}

// ── Interrupteur et case à cocher ──
function Interrupteur({ libelle }) {
  const [actif, setActif] = React.useState(false);
  return (
    <button type="button" role="switch" aria-checked={actif} className="planche-inter" onClick={() => setActif((v) => !v)}>
      <span className="planche-inter-piste" aria-hidden="true"><span className="planche-inter-bouton" /></span>
      <span>{libelle}</span>
    </button>
  );
}

function Case({ libelle }) {
  const [cochee, setCochee] = React.useState(false);
  return (
    <button type="button" role="checkbox" aria-checked={cochee} className="planche-case" onClick={() => setCochee((v) => !v)}>
      <span className="planche-case-boite" aria-hidden="true">{cochee && <Coche taille={16} epaisseur={3} />}</span>
      <span>{libelle}</span>
    </button>
  );
}

// ── Liste : choisir, ajouter, retirer ──
const RESERVE = ['Citron', 'Crème entière', 'Œufs', 'Échalotes', 'Persil plat', 'Vin blanc'];

function Liste() {
  const [lignes, setLignes] = React.useState([{ id: 1, nom: 'Saumon fumé' }, { id: 2, nom: 'Beurre' }, { id: 3, nom: 'Farine' }]);
  const [choisie, setChoisie] = React.useState(2);
  const suivant = React.useRef(4);
  const liste = React.useRef(null);
  useGlissement(liste, lignes.map((l) => l.id).join('|'));

  const ajouter = () => {
    const id = suivant.current;
    suivant.current += 1;
    setLignes((l) => [{ id, nom: RESERVE[(id - 4) % RESERVE.length] }, ...l]);
  };
  const retirer = (id, bouton) => {
    apresDepart(bouton.closest('.planche-ligne'), () => setLignes((l) => l.filter((x) => x.id !== id)));
  };

  return (
    <div className="planche-colonne">
      <div className="planche-liste" ref={liste}>
        {lignes.map((l) => (
          <div key={l.id} className="planche-ligne" data-choisie={choisie === l.id ? '' : undefined}>
            <button type="button" className="planche-ligne-corps" aria-pressed={choisie === l.id} onClick={() => setChoisie(l.id)}>
              {l.nom}
            </button>
            <button type="button" className="planche-ligne-retirer" aria-label={`Retirer ${l.nom}`} onClick={(e) => retirer(l.id, e.currentTarget)}>
              <Trash2 size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="planche-rang">
        <Btn small onClick={ajouter}>Ajouter une ligne</Btn>
      </div>
    </div>
  );
}

// ── Validation : le bouton dit que c'est fait, un champ vide se secoue ──
function Enregistrer() {
  const [etat, setEtat] = React.useState('repos'); // repos | cours | fait
  const verrou = React.useRef(false);
  const minuteurs = React.useRef([]);
  React.useEffect(() => () => minuteurs.current.forEach(clearTimeout), []);
  const lancer = () => {
    if (verrou.current) return;
    verrou.current = true;
    setEtat('cours');
    minuteurs.current.push(
      setTimeout(() => setEtat('fait'), 700),
      setTimeout(() => { setEtat('repos'); verrou.current = false; }, 2300)
    );
  };
  return (
    <Btn variant="primary" onClick={lancer} style={{ minWidth: 176 }}>
      {etat === 'repos' && <span className="mvt-naissance">Enregistrer</span>}
      {etat === 'cours' && (
        <>
          <span className="planche-tourne" aria-hidden="true" />
          <span>Enregistrement</span>
        </>
      )}
      {etat === 'fait' && (
        <>
          <Coche />
          <span className="mvt-naissance">Enregistré</span>
        </>
      )}
    </Btn>
  );
}

function Champ() {
  const [valeur, setValeur] = React.useState('');
  const [verdict, setVerdict] = React.useState(null); // 'erreur' | 'ok'
  const [tour, setTour] = React.useState(0);
  const champ = React.useRef(null);
  const valider = () => {
    setTour((t) => t + 1);
    if (!valeur.trim()) {
      setVerdict('erreur');
      jouer(champ.current, 'secousse');
      return;
    }
    setVerdict('ok');
  };
  return (
    <div className="planche-colonne">
      <label className="planche-label" htmlFor="planche-temperature">Température relevée</label>
      <div className="planche-rang planche-rang--serre">
        <input
          id="planche-temperature"
          ref={champ}
          className="planche-champ"
          data-erreur={verdict === 'erreur' ? '' : undefined}
          inputMode="decimal"
          placeholder="3,5"
          value={valeur}
          onChange={(e) => { setValeur(e.target.value); setVerdict(null); }}
        />
        <Btn onClick={valider}>Valider</Btn>
      </div>
      <p className="planche-verdict" aria-live="polite">
        {verdict === 'erreur' && <span key={`e${tour}`} className="planche-erreur mvt-naissance">Saisissez une température.</span>}
        {verdict === 'ok' && (
          <span key={`o${tour}`} className="planche-ok mvt-naissance">
            <Coche taille={16} />
            <span>Relevé enregistré.</span>
          </span>
        )}
      </p>
    </div>
  );
}

// ── Message : il monte, puis s'efface seul ──
function Message() {
  const [messages, setMessages] = React.useState([]);
  const suivant = React.useRef(1);
  const minuteurs = React.useRef([]);
  React.useEffect(() => () => minuteurs.current.forEach(clearTimeout), []);
  const afficher = () => {
    const id = suivant.current;
    suivant.current += 1;
    setMessages((m) => [...m, { id, part: false }]);
    minuteurs.current.push(
      setTimeout(() => setMessages((m) => m.map((x) => (x.id === id ? { ...x, part: true } : x))), 2400),
      // Filet : le message part même si la fin de son animation n'arrive pas.
      setTimeout(() => setMessages((m) => m.filter((x) => x.id !== id)), 3200)
    );
  };
  const finir = (id) => setMessages((m) => m.filter((x) => !(x.id === id && x.part)));
  return (
    <div className="planche-colonne">
      <div className="planche-rang">
        <Btn onClick={afficher}>Afficher un message</Btn>
      </div>
      <div className="planche-messages" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`planche-message ${m.part ? 'mvt-depart' : 'mvt-naissance'}`} onAnimationEnd={() => finir(m.id)}>
            <span className="planche-message-picto"><Coche taille={16} /></span>
            <span>Fiche enregistrée.</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Fenêtre : elle arrive et repart sans à-coup ──
function Fenetre() {
  const [etat, setEtat] = React.useState('fermee'); // fermee | ouverte | sortie
  const fermer = React.useCallback(() => setEtat((e) => (e === 'ouverte' ? 'sortie' : e)), []);
  const demonter = React.useCallback(() => setEtat((e) => (e === 'sortie' ? 'fermee' : e)), []);
  useSortieGarantie(etat === 'sortie', demonter);
  React.useEffect(() => {
    if (etat !== 'ouverte') return undefined;
    const touche = (e) => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [etat, fermer]);
  const sortie = etat === 'sortie';
  return (
    <>
      <Btn onClick={() => setEtat('ouverte')}>Ouvrir la fenêtre</Btn>
      {etat !== 'fermee' && (
        <div
          className={`planche-voile ${sortie ? 'mvt-voile-sort' : 'mvt-voile'}`}
          onClick={fermer}
          onAnimationEnd={(e) => { if (sortie && e.target === e.currentTarget) demonter(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="planche-fenetre-titre"
            className={`planche-fenetre ${sortie ? 'mvt-depart' : 'mvt-fenetre'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="planche-fenetre-titre" className="planche-fenetre-titre">Supprimer cette fiche ?</h3>
            <p className="planche-carte-texte">La fiche part à la corbeille. Vous pouvez la reprendre pendant trente jours.</p>
            <div className="planche-rang planche-rang--fin">
              <Btn onClick={fermer}>Annuler</Btn>
              <Btn variant="primary" onClick={fermer}>Supprimer</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Glisser-déposer : la ligne se soulève, les voisines s'écartent ──
// Chaque rang est posé par une translation (son rang multiplié par le pas) :
// les voisins glissent par une transition, le rang tenu suit le doigt sans
// transition, puis rejoint sa case au lâcher.
const RANGS = ['Entrées', 'Plats', 'Fromages', 'Desserts', 'Boissons'];
const PAS = 52;

function Triable() {
  const [ordre, setOrdre] = React.useState(RANGS);
  const [prise, setPrise] = React.useState(null); // { nom, y }
  const zone = React.useRef(null);
  const geste = React.useRef(null);

  const prendre = (e, nom) => {
    if (e.button != null && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    const index = ordre.indexOf(nom);
    geste.current = { nom, departY: e.clientY, index, ordreDepart: ordre };
    setPrise({ nom, y: index * PAS });
  };
  const bouger = (e) => {
    const g = geste.current;
    if (!g) return;
    const dernier = g.ordreDepart.length - 1;
    const y = Math.max(-PAS / 2, Math.min(dernier * PAS + PAS / 2, g.index * PAS + e.clientY - g.departY));
    const cible = Math.max(0, Math.min(dernier, Math.round(y / PAS)));
    const sans = g.ordreDepart.filter((n) => n !== g.nom);
    const suite = [...sans.slice(0, cible), g.nom, ...sans.slice(cible)];
    setOrdre((o) => (o.join('|') === suite.join('|') ? o : suite));
    setPrise({ nom: g.nom, y });
  };
  const lacher = (e) => {
    const g = geste.current;
    if (!g) return;
    geste.current = null;
    const cadre = zone.current?.getBoundingClientRect();
    const dehors = e.type === 'pointercancel' || (cadre && (e.clientX < cadre.left - 40 || e.clientX > cadre.right + 40));
    // Lâchée à côté de la liste : le dépôt est refusé, tout revient en place.
    if (dehors) setOrdre(g.ordreDepart);
    setPrise(null);
  };
  const auClavier = (e, nom) => {
    const sens = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!sens) return;
    e.preventDefault();
    setOrdre((o) => {
      const i = o.indexOf(nom);
      const j = i + sens;
      if (j < 0 || j >= o.length) return o;
      const suite = [...o];
      [suite[i], suite[j]] = [suite[j], suite[i]];
      return suite;
    });
  };

  return (
    <div className="planche-tri" ref={zone} style={{ height: RANGS.length * PAS - 8 }}>
      {RANGS.map((nom) => {
        const tenue = prise?.nom === nom;
        const y = tenue ? prise.y : ordre.indexOf(nom) * PAS;
        return (
          <div key={nom} className="planche-tri-rang" data-prise={tenue ? '' : undefined} style={{ transform: `translateY(${y}px)` }}>
            <div className="planche-tri-corps">
              <button
                type="button"
                className="planche-tri-poignee"
                aria-label={`Déplacer ${nom}`}
                onPointerDown={(e) => prendre(e, nom)}
                onPointerMove={bouger}
                onPointerUp={lacher}
                onPointerCancel={lacher}
                onKeyDown={(e) => auClavier(e, nom)}
              >
                <GripVertical size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <span>{nom}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Caisse : article touché, envoi en cuisine, encaissement ──
// Comme dans l'app, l'écriture part au toucher : le mouvement l'accompagne,
// il ne la retarde pas. Ici l'attente du réseau est simulée (600 ms).
const ARTICLES = [
  { id: 'cafe', nom: 'Café', prix: 4.5 },
  { id: 'the', nom: 'Thé', prix: 5 },
  { id: 'croissant', nom: 'Croissant', prix: 2.8 },
  { id: 'salade', nom: 'Salade du jour', prix: 16 },
  { id: 'plat', nom: 'Plat du jour', prix: 24 },
  { id: 'tarte', nom: 'Tarte aux pommes', prix: 9 },
];

function Caisse({ dose }) {
  const [lignes, setLignes] = React.useState([]); // { id, nom, prix, qte, envoyee }
  const [etape, setEtape] = React.useState('saisie'); // saisie | envoi | envoye | pret
  const [paiement, setPaiement] = React.useState('ferme'); // ferme | ouvert | sortie
  const [paye, setPaye] = React.useState(null); // { montant, moyen }
  const [dernier, setDernier] = React.useState(null); // { id, tour, depuis, vol }
  const ticket = React.useRef(null);
  const total = React.useRef(null);
  const verrou = React.useRef(false);
  const minuteurs = React.useRef([]);
  React.useEffect(() => () => minuteurs.current.forEach(clearTimeout), []);
  useGlissement(ticket, lignes.map((l) => l.id).join('|'));

  const somme = lignes.reduce((s, l) => s + l.prix * l.qte, 0);
  const aEnvoyer = lignes.some((l) => l.envoyee < l.qte);

  const ajouter = (article, tuile) => {
    setLignes((ls) => (ls.some((l) => l.id === article.id)
      ? ls.map((l) => (l.id === article.id ? { ...l, qte: l.qte + 1 } : l))
      : [...ls, { ...article, qte: 1, envoyee: 0 }]));
    setDernier((d) => ({ id: article.id, tour: (d?.tour || 0) + 1, depuis: tuile.getBoundingClientRect(), vol: dose === 'marque' }));
  };

  // Après le rendu qui suit un toucher : la quantité et le total battent ; en
  // dosage marqué, une pastille vole de l'article à sa ligne.
  React.useLayoutEffect(() => {
    if (!dernier) return;
    const ligne = ticket.current?.querySelector(`[data-ligne="${dernier.id}"]`);
    jouer(ligne?.querySelector('[data-qte]'), 'battement');
    jouer(total.current, 'battement');
    if (dernier.vol && ligne) voler(dernier.depuis, ligne);
  }, [dernier]);

  const envoyer = () => {
    if (verrou.current || !aEnvoyer) return;
    verrou.current = true;
    setEtape('envoi');
    minuteurs.current.push(
      setTimeout(() => {
        setLignes((ls) => ls.map((l) => ({ ...l, envoyee: l.qte })));
        setEtape('envoye');
        verrou.current = false;
      }, 600),
      setTimeout(() => setEtape((e) => (e === 'envoye' ? 'pret' : e)), 1900)
    );
  };

  const fermerPaiement = React.useCallback(() => setPaiement((p) => (p === 'ouvert' ? 'sortie' : p)), []);
  // La feuille fermée après un encaissement : le ticket repart de zéro.
  const demonter = React.useCallback(() => {
    setPaiement('ferme');
    if (!paye) return;
    setPaye(null);
    setLignes([]);
    setDernier(null);
    setEtape('saisie');
  }, [paye]);
  useSortieGarantie(paiement === 'sortie', demonter);

  let principal;
  if (etape === 'envoi') {
    principal = (
      <Btn variant="primary" disabled style={st.principal}>
        <span className="planche-tourne" aria-hidden="true" />
        <span>Envoi</span>
      </Btn>
    );
  } else if (aEnvoyer || !lignes.length) {
    principal = (
      <Btn variant="primary" onClick={envoyer} disabled={!lignes.length} style={st.principal}>
        <span className="mvt-naissance">Envoyer en cuisine</span>
      </Btn>
    );
  } else if (etape === 'envoye') {
    principal = (
      <Btn variant="success" style={st.principal}>
        <Coche />
        <span className="mvt-naissance">Bon envoyé en cuisine</span>
      </Btn>
    );
  } else {
    principal = (
      <Btn variant="primary" onClick={() => setPaiement('ouvert')} style={st.principal}>
        <span className="mvt-naissance">Encaisser</span>
      </Btn>
    );
  }

  const sortie = paiement === 'sortie';
  return (
    <div className="planche-caisse">
      <div className="planche-articles">
        {ARTICLES.map((a) => (
          <button key={a.id} type="button" className="planche-article" onClick={(e) => ajouter(a, e.currentTarget)}>
            <span>{a.nom}</span>
            <span className="planche-article-prix">{chf(a.prix)}</span>
          </button>
        ))}
      </div>

      <div className="planche-ticket">
        <div className="planche-ticket-lignes" ref={ticket}>
          {lignes.map((l, i) => {
            const envoyee = l.envoyee >= l.qte;
            return (
              <div key={l.id} className="planche-ticket-ligne" data-ligne={l.id}>
                <span className="planche-ticket-qte" data-qte="">{l.qte}</span>
                <span className="planche-ticket-nom">
                  <span>{l.nom}</span>
                  <span
                    key={envoyee ? 'envoye' : 'attente'}
                    className="planche-etat mvt-naissance"
                    data-etat={envoyee ? 'envoye' : 'attente'}
                    style={dose === 'marque' && envoyee ? { animationDelay: `${i * 70}ms` } : undefined}
                  >
                    <span className="planche-etat-point" aria-hidden="true" />
                    {envoyee ? 'Envoyé' : 'En attente'}
                  </span>
                </span>
                <span className="planche-ticket-prix">{chf(l.prix * l.qte)}</span>
              </div>
            );
          })}
        </div>
        {!lignes.length && <p className="planche-ticket-vide">Touchez un article pour l'ajouter au ticket.</p>}
        <div className="planche-total">
          <span>Total</span>
          <span className="planche-total-chiffre" ref={total}>{chf(somme)}</span>
        </div>
        {principal}
      </div>

      {paiement !== 'ferme' && (
        <div className={`planche-voile planche-voile--bas ${sortie ? 'mvt-voile-sort' : 'mvt-voile'}`} onClick={fermerPaiement}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Encaissement"
            className={`planche-feuille ${sortie ? 'mvt-feuille-sort' : 'mvt-feuille'}`}
            onClick={(e) => e.stopPropagation()}
            onAnimationEnd={(e) => { if (sortie && e.target === e.currentTarget) demonter(); }}
          >
            {!paye ? (
              <>
                <p className="planche-feuille-libelle">Reste à payer</p>
                <p className="planche-feuille-chiffre">{chf(somme)}</p>
                <div className="planche-moyens">
                  {['Carte', 'Espèces'].map((moyen) => (
                    <button key={moyen} type="button" className="planche-moyen" onClick={() => setPaye({ montant: somme, moyen })}>
                      {moyen}
                    </button>
                  ))}
                </div>
                <Btn onClick={fermerPaiement}>Fermer</Btn>
              </>
            ) : (
              <div className="planche-paye">
                <span className="planche-paye-rond"><Coche taille={40} epaisseur={2.2} /></span>
                <p className="planche-paye-titre mvt-naissance">Ticket encaissé</p>
                <p className="planche-feuille-chiffre mvt-naissance">{chf(paye.montant)}</p>
                <p className="planche-feuille-libelle mvt-naissance">{paye.moyen}</p>
                <Btn variant="primary" onClick={fermerPaiement} style={st.principal}>Nouveau ticket</Btn>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  principal: { width: '100%', minHeight: 48 },
};

export default function PlancheMouvement() {
  const [dose, setDose] = React.useState('marque');
  const reduit = mouvementReduit();
  return (
    <div className="planche" data-dose={dose}>
      <header className="planche-tete">
        <h1 className="planche-titre">Planche de mouvement</h1>
        <p className="planche-chapeau">
          Chaque carte montre un geste de l'application. Choisissez un dosage, puis touchez les exemples.
        </p>
      </header>
      <div className="planche-dose">
        <SegmentedTabs tabs={DOSES} active={dose} onChange={setDose} />
      </div>
      {reduit && (
        <p className="planche-note" role="status">
          Les animations réduites sont actives sur cet appareil : rien ne bouge ici.
        </p>
      )}
      <main className="planche-grille">
        <Carte titre="Boutons" texte="Le bouton s'enfonce sous le doigt, puis revient.">
          <Boutons />
        </Carte>
        <Carte titre="Onglets" texte="La pilule sombre glisse vers l'onglet choisi.">
          <Onglets />
        </Carte>
        <Carte titre="Interrupteur et case" texte="Le bouton rond glisse. La coche se trace.">
          <div className="planche-colonne">
            <Interrupteur libelle="Recevoir les alertes" />
            <Case libelle="Plan de travail nettoyé" />
          </div>
        </Carte>
        <Carte titre="Liste" texte="Touchez une ligne pour la choisir. Ajoutez ou retirez une ligne : les autres lui font place.">
          <Liste />
        </Carte>
        <Carte titre="Validation" texte="Le bouton dit que l'enregistrement est fait. Un champ vide se secoue.">
          <div className="planche-colonne">
            <div className="planche-rang"><Enregistrer /></div>
            <Champ />
          </div>
        </Carte>
        <Carte titre="Message" texte="Le message monte, puis s'efface seul.">
          <Message />
        </Carte>
        <Carte titre="Fenêtre" texte="La fenêtre arrive et repart sans à-coup.">
          <Fenetre />
        </Carte>
        <Carte titre="Glisser-déposer" texte="Tenez la poignée et déplacez la ligne. Lâchez-la à côté de la liste : elle revient à sa place.">
          <Triable />
        </Carte>
        <Carte large titre="Caisse" texte="Touchez des articles, envoyez le bon en cuisine, puis encaissez.">
          <Caisse dose={dose} />
        </Carte>
      </main>
    </div>
  );
}
