import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, ExternalLink, Link2, MousePointerClick, PanelsTopLeft } from 'lucide-react';
import { st } from '../modules/spa/spaUi.jsx';
import {
  COULEUR_DEFAUT, codeBouton, codeIntegre, codeLiens, lienReservation,
} from '../modules/spa/integration.js';
import '../modules/spa/spa.css';

// ─────────────────────────────────────────────────────────────────────────────
// Guide public d'installation (/reserver/<adresse>/integrer).
//
// Pour la personne qui gère le site du spa : le spa lui envoie ce lien depuis
// l'app. Du plus simple au plus complet : le lien sur le bouton existant, le
// bouton prêt à coller, la réservation dans une page, puis « garder ses
// propres boutons ». Instructions par plateforme en dessous.
//
// Rien de privé ici : l'adresse de réservation et des codes publics. Le nom du
// spa vient de public_infos quand la réservation est ouverte.
// ─────────────────────────────────────────────────────────────────────────────

const URL_FONCTION = `${import.meta.env.VITE_SUPABASE_URL || 'https://ppmtoiqgajwcdkbnrcll.supabase.co'}/functions/v1/spa-mailer`;

const PLATEFORMES = [
  {
    id: 'wordpress', nom: 'WordPress',
    lien: 'Sélectionnez le bloc Bouton, cliquez sur l\'icône de lien et collez l\'adresse.',
    page: 'Modifier la page, bouton « + », bloc « HTML personnalisé » : collez le code, puis « Mettre à jour ».',
    site: 'Installez l\'extension gratuite « WPCode », puis Code Snippets, Header & Footer : collez le code dans la zone « Footer » et enregistrez.',
  },
  {
    id: 'wix', nom: 'Wix',
    lien: 'Cliquez sur le bouton, puis sur l\'icône de lien : « Adresse web », collez l\'adresse. C\'est la solution conseillée sur Wix.',
    page: 'Ajouter (+), « Intégrer du code », « Intégrer HTML » : « Saisir le code », collez le code de la réservation dans une page, puis agrandissez le cadre (environ 750 px de haut).',
    site: 'Paramètres du site, « Code personnalisé » : « + Ajouter du code », collez le code, « Toutes les pages », emplacement « Corps : fin ». Demande un forfait Premium avec nom de domaine.',
  },
  {
    id: 'squarespace', nom: 'Squarespace',
    lien: 'Modifiez le bouton, champ « Lien » : collez l\'adresse.',
    page: 'Modifier la page, « Ajouter un bloc », bloc « Code » : collez le code.',
    site: 'Outils du site, « Injection de code » (Code Injection), zone « Footer » : collez le code et enregistrez. Demande un forfait payant.',
  },
  {
    id: 'webflow', nom: 'Webflow',
    lien: 'Sélectionnez le bouton, réglages de l\'élément, « Link » en URL : collez l\'adresse, puis « Publish ».',
    page: 'Ajouter (+), élément « Code Embed » : collez le code, « Save & Close », puis « Publish ».',
    site: 'Site settings, « Custom code », zone « Footer code » : collez le code, « Save », puis « Publish ».',
  },
  {
    id: 'jimdo', nom: 'Jimdo',
    lien: 'Modifiez le bouton et choisissez un lien vers une adresse web externe : collez l\'adresse.',
    page: 'Jimdo Creator : « Ajouter un élément », « Widget/HTML », collez le code. Sur Jimdo Dolphin, utilisez le lien sur un bouton.',
    site: 'Jimdo Creator : Paramètres, « Modifier l\'en-tête » (Edit Head), collez le code. Sur Jimdo Dolphin, utilisez le lien.',
  },
  {
    id: 'mesure', nom: 'Site sur mesure',
    lien: 'Sur le bouton ou le lien du menu : href vers l\'adresse de réservation.',
    page: 'Collez le code à l\'endroit voulu dans le HTML de la page.',
    site: 'Collez le code une fois, juste avant la balise </body> du gabarit commun à toutes les pages.',
  },
];

function lireParametres() {
  const chemin = window.location.pathname.match(/\/reserver\/([a-z0-9-]+)\/integrer\/?$/i);
  const c = (new URLSearchParams(window.location.search).get('couleur') || '').replace('#', '');
  return {
    slug: (chemin?.[1] || '').toLowerCase(),
    couleur: /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : COULEUR_DEFAUT,
  };
}

export default function GuideIntegration() {
  const { slug, couleur } = useMemo(lireParametres, []);
  const [nom, setNom] = useState(null);
  const [ouverte, setOuverte] = useState(null); // null = inconnu
  const [plateforme, setPlateforme] = useState('wordpress');
  const apercu = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.title = 'Installer la réservation en ligne';
    if (!slug) return;
    fetch(URL_FONCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'public_infos', slug }),
    })
      .then(async (r) => {
        const corps = await r.json().catch(() => ({}));
        setOuverte(r.ok);
        if (r.ok && corps.etablissement?.nom) {
          setNom(corps.etablissement.nom);
          document.title = `Installer la réservation, ${corps.etablissement.nom}`;
        }
      })
      .catch(() => setOuverte(null));
  }, [slug]);

  // Aperçu : le vrai widget, chargé comme sur le site du spa.
  useEffect(() => {
    const zone = apercu.current;
    if (!slug || !zone || zone.dataset.pret) return;
    zone.dataset.pret = '1';
    const script = document.createElement('script');
    script.src = '/widget-spa.js';
    script.async = true;
    script.dataset.spa = slug;
    script.dataset.cible = '#apercu-bouton';
    if (couleur !== COULEUR_DEFAUT) script.dataset.couleur = couleur;
    document.body.appendChild(script);
  }, [slug, couleur]);

  if (!slug) {
    return (
      <div className="spa" style={s.racine}>
        <main style={s.colonne}>
          <h1 style={s.titre}>Lien incomplet</h1>
          <p style={s.texte}>Ouvrez le lien d'installation envoyé par le spa, tel quel.</p>
        </main>
      </div>
    );
  }

  const lien = lienReservation(slug);
  const p = PLATEFORMES.find((x) => x.id === plateforme) || PLATEFORMES[0];

  return (
    <div className="spa" style={s.racine}>
      <main style={s.colonne}>
        <header style={{ marginBottom: 22 }}>
          <div style={st.surTitre}>Guide d'installation</div>
          <h1 style={s.titre}>
            Réservation en ligne{nom ? <> de <span data-no-translate>{nom}</span></> : null}
          </h1>
          <p style={{ ...s.texte, marginTop: 8 }}>
            Pour la personne qui gère le site internet du spa. Trois façons de faire, de la plus simple à la plus complète.
            La première ne demande aucune compétence technique.
          </p>
          {ouverte === false && (
            <div style={{ ...st.encartInfo, marginTop: 14, fontSize: 14 }}>
              La réservation n'est pas encore ouverte par le spa. Vous pouvez tout installer dès maintenant : elle affichera « fermée » jusqu'à son ouverture.
            </div>
          )}
        </header>

        {/* ── 1. Le lien ── */}
        <Etape numero={1} icone={Link2} titre="Le lien, sur le bouton « Réserver » du site" badge="Le plus simple">
          <p style={s.texte}>
            Mettez cette adresse sur le bouton « Réserver » du site, et dans le menu. La réservation s'ouvre dans un nouvel onglet.
          </p>
          <div style={s.lien}>
            <span style={s.lienTexte} data-no-translate>{lien}</span>
            <BoutonCopier texte={lien} libelle="Copier le lien" />
          </div>
          <button type="button" onClick={() => window.open(lien, '_blank', 'noopener')} style={{ ...st.lien, minHeight: 40 }}>
            <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" /> Voir la page de réservation
          </button>
          <p style={{ ...s.texte, fontSize: 13, marginTop: 8 }}>
            Le même lien sert partout : bio Instagram, fiche Google de l'établissement, signature d'e-mail.
          </p>
        </Etape>

        {/* ── 2. Le bouton prêt ── */}
        <Etape numero={2} icone={MousePointerClick} titre="Un bouton prêt à coller">
          <p style={s.texte}>
            Ce code affiche un bouton « Réserver un soin ». La réservation s'ouvre par-dessus le site, sans le quitter.
          </p>
          <div style={s.apercu}>
            <span style={{ fontSize: 12, color: 'var(--spa-ink2)' }}>Aperçu, cliquable :</span>
            <div id="apercu-bouton" ref={apercu} />
          </div>
          <BlocCode code={codeBouton(slug, couleur)} />
        </Etape>

        {/* ── 3. Dans une page ── */}
        <Etape numero={3} icone={PanelsTopLeft} titre="La réservation dans une page">
          <p style={s.texte}>
            Pour une page « Réserver » dédiée : la réservation s'affiche directement dans la page et s'ajuste à sa hauteur.
          </p>
          <BlocCode code={codeIntegre(slug, couleur)} />
        </Etape>

        {/* ── Garder ses boutons ── */}
        <Etape icone={Code2} titre="Garder les boutons du site, avec l'ouverture par-dessus">
          <p style={s.texte}>
            Collez ce code une seule fois pour tout le site (zone « pied de page » ou « footer »). Il n'ajoute rien de visible :
            les boutons et liens qui mènent au lien de réservation (étape 1) ouvriront alors la réservation par-dessus le site.
          </p>
          <BlocCode code={codeLiens(slug, couleur)} />
        </Etape>

        {/* ── Par plateforme ── */}
        <section style={{ ...s.carte, marginTop: 8 }}>
          <h2 style={s.sousTitre}>Où coller, selon le site</h2>
          <div className="spa-defile" style={{ display: 'flex', gap: 8, paddingBottom: 4, marginBottom: 14 }} role="tablist">
            {PLATEFORMES.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={plateforme === x.id}
                onClick={() => setPlateforme(x.id)}
                style={{ ...st.choix, flexShrink: 0, ...(plateforme === x.id ? st.choixActif : null) }}
                data-no-translate
              >
                {x.nom}
              </button>
            ))}
          </div>
          <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }} role="tabpanel">
            <Consigne titre="Le lien (étape 1)" texte={p.lien} />
            <Consigne titre="Le bouton ou la réservation dans une page (étapes 2 et 3)" texte={p.page} />
            <Consigne titre="Pour tout le site (dernier code)" texte={p.site} />
          </dl>
        </section>

        <p style={{ ...s.texte, fontSize: 13, marginTop: 20, textAlign: 'center' }}>
          Une question ? Répondez simplement à l'e-mail du spa qui vous a transmis ce guide.
        </p>
      </main>
    </div>
  );
}

function Etape({ numero, icone: Icone, titre, badge, children }) {
  return (
    <section style={{ ...s.carte, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span aria-hidden="true" style={s.pastille}>
          {numero ? <span style={{ fontWeight: 700, fontSize: 14 }}>{numero}</span> : <Icone size={16} strokeWidth={1.8} />}
        </span>
        <h2 style={{ ...s.sousTitre, margin: 0, flex: '1 1 220px', minWidth: 0 }}>{titre}</h2>
        {badge && <span style={s.badge}>{badge}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
}

function Consigne({ titre, texte }) {
  return (
    <div>
      <dt style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{titre}</dt>
      <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--spa-ink2)' }}>{texte}</dd>
    </div>
  );
}

function BoutonCopier({ texte, libelle = 'Copier' }) {
  const [fait, setFait] = useState(false);
  async function copier() {
    try {
      await navigator.clipboard.writeText(texte);
      setFait(true);
      setTimeout(() => setFait(false), 1800);
    } catch {
      window.prompt('Copiez ce texte :', texte);
    }
  }
  const Icone = fait ? Check : Copy;
  return (
    <button type="button" onClick={copier} style={{ ...st.secondaire, minHeight: 40, flexShrink: 0 }} aria-live="polite">
      <Icone size={15} strokeWidth={1.8} aria-hidden="true" /> {fait ? 'Copié' : libelle}
    </button>
  );
}

function BlocCode({ code }) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <pre style={s.code} data-no-translate>{code}</pre>
      <BoutonCopier texte={code} libelle="Copier le code" />
    </div>
  );
}

const s = {
  racine: { minHeight: '100vh', background: 'var(--spa-bg)', color: 'var(--spa-ink)', padding: '32px 16px 48px' },
  colonne: { maxWidth: 680, margin: '0 auto' },
  titre: { margin: '6px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 32, lineHeight: 1.15 },
  sousTitre: { margin: '0 0 12px', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 20, lineHeight: 1.25 },
  texte: { margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--spa-ink2)' },
  carte: {
    padding: '20px 20px', borderRadius: 'var(--spa-r-lg)', background: 'var(--spa-surface)',
    border: '1px solid var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  pastille: {
    width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-mizu-soft)', color: 'var(--spa-mizu)',
  },
  badge: {
    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
    background: 'var(--spa-matcha-soft)', color: 'var(--spa-matcha)',
  },
  lien: {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', boxSizing: 'border-box',
    padding: '10px 10px 10px 14px', borderRadius: 'var(--spa-r-sm)', background: 'var(--spa-sunken)', border: '1px solid var(--spa-line)',
  },
  lienTexte: { flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere', fontSize: 15, fontWeight: 600, color: 'var(--spa-ink)' },
  apercu: {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', width: '100%', boxSizing: 'border-box',
    padding: '14px 16px', borderRadius: 'var(--spa-r-sm)', border: '1px dashed var(--spa-line2)', minHeight: 76,
  },
  code: {
    margin: 0, width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 'var(--spa-r-sm)', overflowX: 'auto',
    background: 'var(--spa-sunken)', border: '1px solid var(--spa-line)', color: 'var(--spa-ink)',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 12.5, lineHeight: 1.6,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  },
};
