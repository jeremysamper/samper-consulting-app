import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react';
import { envoyerCommande, idAppareil, lireCarte } from './api.js';
import {
  LIMITES, ajouter, chargeLignes, libellePlage, lignesPanier, nbArticles, nettoyerPanier, peutAjouter,
  quantiteDe, retirer, totalPanier, verifierEnvoi,
} from './regles.js';
import './commande.css';

// ─────────────────────────────────────────────────────────────────────────────
// Commande de boissons par QR, vue par le client (lot L3, 22.11.2026).
//
// Un QR fixe par établissement mène ici : /commande/<adresse>. Le client
// choisit dans la carte ouverte au QR, donne sa table (ou « au bar ») et son
// prénom, puis envoie. La commande arrive en caisse « à valider » : l'équipe
// la confirme au bar, où une pièce d'identité peut être demandée pour
// l'alcool. Le paiement se fait à table ou au comptoir, jamais ici.
//
// Pensée pour le téléphone. Apparence de l'app (cartes blanches à grand
// rayon, pilules, aplat sombre pour l'action et le choix), avec ses jetons à
// elle : la page n'embarque pas app.css. États et mouvements : commande.css.
// Thème : celui du téléphone, ou ?theme=dark | light.
// Le panier tient sur le téléphone le temps de l'onglet (sessionStorage).
// ─────────────────────────────────────────────────────────────────────────────

const FINE = ' ';
const MESSAGES = {
  introuvable: "Cette adresse ne mène à aucune commande en ligne. Demandez au personnel.",
  ferme: 'La commande en ligne vient de fermer. Commandez auprès du personnel.',
  table: `Nous ne trouvons pas cette table. Vérifiez le numéro écrit sur la table, ou choisissez «${FINE}Au bar${FINE}».`,
  prenom: `Indiquez votre prénom, en ${LIMITES.prenom} signes au plus.`,
  panier: `Une commande en ligne porte au plus ${LIMITES.parProduit} fois le même produit et ${LIMITES.articles} articles.`,
  rupture: "Un produit vient d'être épuisé. Nous l'avons retiré de votre panier.",
  produit: 'La carte vient de changer. Votre panier a été mis à jour.',
  trop_vite: "Une commande vient de partir de ce téléphone. Patientez une minute avant d'en envoyer une autre.",
  en_attente: "Vos commandes précédentes attendent encore l'équipe. Patientez un instant.",
  occupe: 'Le bar reçoit beaucoup de commandes. Réessayez dans quelques minutes, ou commandez auprès du personnel.',
  vide: 'Votre panier est vide.',
  reseau: "L'envoi n'a pas abouti. Vérifiez la connexion, puis réessayez.",
};

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const articles = (n) => `${n} article${n > 1 ? 's' : ''}`;

function lireParametres() {
  const q = new URLSearchParams(window.location.search);
  const chemin = window.location.pathname.match(/\/commande\/([a-z0-9-]+)\/?$/i);
  const prefere = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = q.get('theme') === 'dark' || q.get('theme') === 'light' ? q.get('theme') : (prefere ? 'dark' : 'light');
  return { slug: (chemin?.[1] || '').toLowerCase(), theme };
}

// Jetons de la page : les valeurs de l'app (bloc :root et bloc sombre
// d'app.css), recopiées ici parce que la page vit seule.
function jetons(theme) {
  const sombre = theme === 'dark';
  return {
    '--q-bg': sombre ? '#071319' : '#e8ebee',
    '--q-surface': sombre ? '#11252e' : '#ffffff',
    '--q-piste': sombre ? '#0c1c24' : '#eef1f4',
    '--q-ink': sombre ? '#e9f1f4' : '#10191d',
    '--q-ink2': sombre ? '#b5c5cc' : '#47535a',
    '--q-ink3': sombre ? '#95a9b1' : '#57636a',
    '--q-line': sombre ? '#223a45' : '#d6dce0',
    '--q-champ': sombre ? '#66838f' : '#b4bdc4',
    '--q-btn-bord': sombre ? '#4f6d79' : '#c2cad0',
    '--q-selection': sombre ? '#1b3540' : '#dae1e6',
    '--q-sh': sombre ? '0 2px 8px rgba(0, 0, 0, 0.5)' : '0 1px 2px rgba(9, 30, 40, 0.04), 0 8px 24px rgba(9, 30, 40, 0.06)',
    '--q-sh-lg': sombre ? '0 8px 28px rgba(0, 0, 0, 0.6)' : '0 4px 12px rgba(9, 30, 40, 0.08), 0 16px 40px rgba(9, 30, 40, 0.12)',
    '--q-focus': sombre ? '#74aec3' : '#12587a',
    '--q-accent': sombre ? '#74aec3' : '#003042',
    '--q-on-accent': sombre ? '#06202b' : '#ffffff',
    '--q-ciel': sombre ? '#16323d' : '#e3eef4',
    '--q-ciel-texte': sombre ? '#d6e7ee' : '#123746',
    '--q-ok': sombre ? '#86d6a0' : '#116530',
    '--q-ok-soft': sombre ? 'rgba(134, 214, 160, 0.14)' : '#dcfce7',
    '--q-danger': sombre ? '#fb8f8f' : '#a11616',
    '--q-danger-soft': sombre ? 'rgba(251, 143, 143, 0.12)' : '#fee2e2',
    colorScheme: sombre ? 'dark' : 'light',
  };
}

function lirePanierGarde(slug) {
  try {
    const brut = JSON.parse(window.sessionStorage.getItem(`sc_commande_panier:${slug}`) || '{}');
    return brut && typeof brut === 'object' ? brut : {};
  } catch {
    return {};
  }
}

function garderPanier(slug, panier) {
  try { window.sessionStorage.setItem(`sc_commande_panier:${slug}`, JSON.stringify(panier)); } catch { /* stockage plein ou refusé */ }
}

export default function CommandeQr() {
  const parametres = useMemo(lireParametres, []);
  const { slug, theme } = parametres;
  const [carte, setCarte] = useState(null);
  const [etat, setEtat] = useState('chargement'); // chargement | pret | ferme | introuvable | erreur
  const [etape, setEtape] = useState('carte'); // carte | panier | envoye
  const [panier, setPanier] = useState(() => lirePanierGarde(slug));
  const [auBar, setAuBar] = useState(false);
  const [table, setTable] = useState('');
  const [prenom, setPrenom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [resultat, setResultat] = useState(null);
  const [categorie, setCategorie] = useState(null);
  const sections = useRef({});
  const appareil = useMemo(idAppareil, []);

  useEffect(() => { document.documentElement.style.background = jetons(theme)['--q-bg']; }, [theme]);
  useEffect(() => { garderPanier(slug, panier); }, [slug, panier]);

  const charger = useCallback(async () => {
    if (!slug) { setEtat('introuvable'); return null; }
    const c = await lireCarte(slug);
    if (c?.erreur === 'introuvable') { setEtat('introuvable'); return null; }
    if (!c || c.erreur) { setEtat('erreur'); return null; }
    setCarte(c);
    setEtat(c.ouvert ? 'pret' : 'ferme');
    setPanier((p) => nettoyerPanier(p, c.produits));
    setCategorie((x) => x || c.categories?.[0]?.id || null);
    return c;
  }, [slug]);

  useEffect(() => { charger(); }, [charger]);

  const produits = useMemo(() => carte?.produits || [], [carte]);
  const lignes = useMemo(() => lignesPanier(panier, produits), [panier, produits]);
  const total = useMemo(() => totalPanier(panier, produits), [panier, produits]);
  const nb = nbArticles(panier);
  const parCategorie = useMemo(() => {
    const m = new Map();
    produits.forEach((p) => {
      if (!m.has(p.categorie_id)) m.set(p.categorie_id, []);
      m.get(p.categorie_id).push(p);
    });
    return m;
  }, [produits]);

  function allerA(id) {
    setCategorie(id);
    const el = sections.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function envoyer() {
    if (envoi) return;
    const manque = verifierEnvoi({ panier, produits, prenom, auBar, table });
    if (manque) { setErreur(MESSAGES[manque] || MESSAGES.reseau); return; }
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await envoyerCommande({ slug, table, auBar, prenom, lignes: chargeLignes(panier), appareil });
      if (r?.ok) {
        setResultat({ total: r.total, articles: r.articles, prenom: prenom.trim(), table: auBar ? null : table.trim() });
        setPanier({});
        setEtape('envoye');
        window.scrollTo({ top: 0 });
        return;
      }
      const code = r?.erreur || 'reseau';
      if (code === 'rupture' || code === 'produit' || code === 'ferme') {
        const c = await charger();
        if (code === 'ferme' || (c && !c.ouvert)) { setEtape('carte'); return; }
      }
      setErreur(MESSAGES[code] || MESSAGES.reseau);
    } finally {
      setEnvoi(false);
    }
  }

  const style = jetons(theme);

  return (
    <div className="cq-racine" data-theme={theme} style={style}>
      <main className="cq-page">
        <header className="cq-tete">
          <p className="cq-sur">Commander depuis votre place</p>
          <h1 className="cq-titre">{carte?.etablissement || (etat === 'chargement' ? '' : 'Commande en ligne')}</h1>
        </header>

        {etat === 'chargement' && (
          <div className="cq-carte" aria-busy="true" aria-label="Chargement de la carte">
            {[0, 1, 2, 3].map((i) => <div key={i} className="cq-squelette" />)}
          </div>
        )}

        {etat === 'introuvable' && (
          <section className="cq-carte cq-message cq-entree">
            <p>{MESSAGES.introuvable}</p>
          </section>
        )}

        {etat === 'erreur' && (
          <section className="cq-carte cq-message cq-entree">
            <p>La carte ne se charge pas. Vérifiez la connexion.</p>
            <button type="button" className="cq-bouton cq-secondaire" onClick={() => { setEtat('chargement'); charger(); }}>Réessayer</button>
          </section>
        )}

        {etat === 'ferme' && (
          <section className="cq-carte cq-message cq-entree">
            <p className="cq-fort">La commande en ligne est fermée pour le moment.</p>
            {(carte?.plages || []).length > 0 && (
              <>
                <p>Elle est ouverte chaque jour{FINE}:</p>
                <ul className="cq-plages">
                  {carte.plages.map((p) => <li key={`${p.de}-${p.a}`}>{libellePlage(p)}</li>)}
                </ul>
              </>
            )}
            <p>Le personnel prend volontiers votre commande.</p>
          </section>
        )}

        {etat === 'pret' && etape === 'carte' && (
          <>
            {(carte.categories || []).length > 1 && (
              <nav className="cq-onglets" aria-label="Catégories">
                {carte.categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="cq-pilule"
                    data-actif={categorie === c.id ? '1' : undefined}
                    aria-pressed={categorie === c.id}
                    onClick={() => allerA(c.id)}
                  >
                    {c.nom}
                  </button>
                ))}
              </nav>
            )}
            {produits.length === 0 && (
              <section className="cq-carte cq-message cq-entree">
                <p>Aucune boisson n'est proposée en ligne pour le moment. Le personnel prend volontiers votre commande.</p>
              </section>
            )}
            {(carte.categories || []).map((c, ic) => {
              const liste = parCategorie.get(c.id) || [];
              if (!liste.length) return null;
              return (
                <section
                  key={c.id}
                  className="cq-section cq-entree"
                  style={{ '--cq-delai': `${Math.min(ic * 60, 240)}ms` }}
                  ref={(el) => { sections.current[c.id] = el; }}
                  aria-labelledby={`cq-cat-${c.id}`}
                >
                  <h2 id={`cq-cat-${c.id}`} className="cq-section-titre">{c.nom}</h2>
                  <div className="cq-carte cq-liste">
                    {liste.map((p) => (
                      <LigneProduit
                        key={p.id}
                        produit={p}
                        quantite={quantiteDe(panier, p.id)}
                        peutPlus={peutAjouter(panier, p.id)}
                        onPlus={() => setPanier((x) => ajouter(x, p.id))}
                        onMoins={() => setPanier((x) => retirer(x, p.id))}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            <div className="cq-pied-espace" aria-hidden="true" />
            {nb > 0 && (
              <div className="cq-pied">
                <button type="button" className="cq-bouton cq-principal cq-pied-bouton" onClick={() => { setEtape('panier'); setErreur(null); window.scrollTo({ top: 0 }); }}>
                  <ShoppingBag size={18} aria-hidden="true" />
                  <span>Voir le panier</span>
                  <span className="cq-pied-detail">{articles(nb)}, {chf(total)} CHF</span>
                </button>
              </div>
            )}
          </>
        )}

        {etat === 'pret' && etape === 'panier' && (
          <div className="cq-entree">
            <button type="button" className="cq-bouton cq-lien cq-retour" onClick={() => { setEtape('carte'); setErreur(null); }}>
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Retour à la carte</span>
            </button>

            <section className="cq-carte cq-bloc" aria-labelledby="cq-panier-titre">
              <h2 id="cq-panier-titre" className="cq-bloc-titre">Votre commande</h2>
              {lignes.length === 0 && <p className="cq-doux">{MESSAGES.vide}</p>}
              <div className="cq-liste">
                {lignes.map((l) => (
                  <LigneProduit
                    key={l.id}
                    produit={l}
                    quantite={l.quantite}
                    peutPlus={peutAjouter(panier, l.id)}
                    onPlus={() => setPanier((x) => ajouter(x, l.id))}
                    onMoins={() => setPanier((x) => retirer(x, l.id))}
                    sousTotal
                  />
                ))}
              </div>
              {lignes.length > 0 && (
                <div className="cq-total">
                  <span>Total</span>
                  <span className="cq-chiffre">{chf(total)} CHF</span>
                </div>
              )}
            </section>

            <section className="cq-carte cq-bloc" aria-labelledby="cq-ou-titre">
              <h2 id="cq-ou-titre" className="cq-bloc-titre">Où êtes-vous{FINE}?</h2>
              <div className="cq-choix" role="group" aria-label="Où êtes-vous">
                <button type="button" className="cq-pilule" data-actif={!auBar ? '1' : undefined} aria-pressed={!auBar} onClick={() => setAuBar(false)}>À une table</button>
                <button type="button" className="cq-pilule" data-actif={auBar ? '1' : undefined} aria-pressed={auBar} onClick={() => setAuBar(true)}>Au bar</button>
              </div>
              {!auBar && (
                <label className="cq-champ-bloc">
                  <span className="cq-label">Numéro de la table</span>
                  <input
                    className="cq-champ"
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    maxLength={LIMITES.table}
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="Écrit sur la table"
                  />
                </label>
              )}
              <label className="cq-champ-bloc">
                <span className="cq-label">Votre prénom</span>
                <input
                  className="cq-champ"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  maxLength={LIMITES.prenom}
                  autoComplete="given-name"
                  enterKeyHint="send"
                  placeholder="Pour vous retrouver"
                />
              </label>
            </section>

            <section className="cq-avis" aria-label="Avant d'envoyer">
              <p>L'équipe confirme votre commande au bar avant de la préparer. Une pièce d'identité peut vous être demandée pour l'alcool.</p>
              <p>Vous payez à table ou au comptoir, comme d'habitude.</p>
            </section>

            {erreur && <p className="cq-erreur" role="alert">{erreur}</p>}

            <button
              type="button"
              className="cq-bouton cq-principal cq-envoyer"
              onClick={envoyer}
              disabled={envoi || lignes.length === 0}
            >
              {envoi ? <span className="cq-roue" aria-hidden="true" /> : null}
              <span>{envoi ? 'Envoi en cours' : 'Envoyer la commande'}</span>
            </button>
          </div>
        )}

        {etape === 'envoye' && resultat && (
          <section className="cq-carte cq-message cq-envoye cq-entree" aria-live="polite">
            <svg className="cq-coche" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
              <circle cx="28" cy="28" r="28" fill="var(--q-ok-soft)" />
              <path d="M17 29l7 7 15-16" fill="none" stroke="var(--q-ok)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
            </svg>
            <h2 className="cq-bloc-titre">Commande envoyée</h2>
            <p>
              Merci {resultat.prenom}. L'équipe confirme votre commande au bar
              {resultat.table ? `, pour la table ${resultat.table}` : ''}.
            </p>
            <p className="cq-doux">{articles(resultat.articles)}, {chf(resultat.total)} CHF, à payer à table ou au comptoir.</p>
            <button type="button" className="cq-bouton cq-secondaire" onClick={() => { setEtape('carte'); setResultat(null); charger(); }}>
              Commander autre chose
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function LigneProduit({ produit, quantite, peutPlus, onPlus, onMoins, sousTotal = false }) {
  const prix = Number(produit.prix) || 0;
  return (
    <div className="cq-ligne" data-choisi={quantite > 0 ? '1' : undefined}>
      {produit.photo ? <img className="cq-photo" src={produit.photo} alt="" loading="lazy" /> : null}
      <div className="cq-ligne-texte">
        <span className="cq-nom">{produit.nom}</span>
        <span className="cq-prix">
          {sousTotal && quantite > 1 ? `${quantite} × ${chf(prix)} = ${chf(prix * quantite)} CHF` : `${chf(prix)} CHF`}
        </span>
      </div>
      <div className="cq-pas">
        {quantite > 0 && (
          <>
            <button type="button" className="cq-rond cq-rond-doux" onClick={onMoins} aria-label={`Retirer ${produit.nom}`}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <span className="cq-quantite" aria-live="polite">{quantite}</span>
          </>
        )}
        <button
          type="button"
          className="cq-rond"
          onClick={onPlus}
          disabled={!peutPlus}
          aria-label={`Ajouter ${produit.nom}`}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
