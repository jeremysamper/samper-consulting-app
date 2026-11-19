import React from 'react';
import { Camera } from 'lucide-react';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { normaliserCode, saisieDuCode } from './codeBon.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lire un bon cadeau : la caméra arrière s'ouvre d'elle-même et cherche un QR
// quatre fois par seconde ; le code peut aussi se taper. Sans caméra (refusée,
// absente), une photo du bon fait le même travail.
//
// Décodeur : BarcodeDetector quand le navigateur l'a (Chrome, Android), sinon
// jsQR chargé à la demande (iPad, iPhone). Rien ne sort de l'appareil : l'image
// est lue sur place, seul le code part à la base.
// ─────────────────────────────────────────────────────────────────────────────

async function creerDecodeur() {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detecteur = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (source) => {
          const r = await detecteur.detect(source);
          return r?.[0]?.rawValue || null;
        };
      }
    } catch { /* repli sur jsQR */ }
  }
  const mod = await import('jsqr');
  const jsQR = mod.default?.default || mod.default || mod;
  const toile = document.createElement('canvas');
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  return async (source) => {
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    if (!w || !h) return null;
    const echelle = Math.min(1, 800 / Math.max(w, h));
    toile.width = Math.round(w * echelle);
    toile.height = Math.round(h * echelle);
    ctx.drawImage(source, 0, 0, toile.width, toile.height);
    const img = ctx.getImageData(0, 0, toile.width, toile.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || null;
  };
}

export default function LecteurBon({ onCode, enCours = false }) {
  const videoRef = React.useRef(null);
  const fluxRef = React.useRef(null);
  const decodeurRef = React.useRef(null);
  const [camera, setCamera] = React.useState('ouverture'); // ouverture | active | refusee | absente
  const [saisie, setSaisie] = React.useState('');
  const [photoIllisible, setPhotoIllisible] = React.useState(false);
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;

  const arreter = React.useCallback(() => {
    fluxRef.current?.getTracks().forEach((t) => t.stop());
    fluxRef.current = null;
  }, []);

  React.useEffect(() => {
    let vivant = true;
    let minuterie = null;
    let occupe = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamera('absente'); return; }
      try {
        const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!vivant) { flux.getTracks().forEach((t) => t.stop()); return; }
        fluxRef.current = flux;
        const v = videoRef.current;
        if (v) { v.srcObject = flux; await v.play().catch(() => {}); }
        decodeurRef.current = await creerDecodeur();
        if (!vivant) return;
        setCamera('active');
        minuterie = setInterval(async () => {
          if (occupe || !videoRef.current || videoRef.current.readyState < 2) return;
          occupe = true;
          try {
            const brut = await decodeurRef.current(videoRef.current);
            const code = normaliserCode(brut);
            if (code && vivant) {
              clearInterval(minuterie);
              arreter();
              onCodeRef.current(code);
            }
          } catch { /* image suivante */ } finally { occupe = false; }
        }, 250);
      } catch (e) {
        if (!vivant) return;
        setCamera(e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'absente' : 'refusee');
      }
    })();
    return () => { vivant = false; if (minuterie) clearInterval(minuterie); arreter(); };
  }, [arreter]);

  async function lirePhoto(fichier) {
    if (!fichier) return;
    setPhotoIllisible(false);
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const decoder = decodeurRef.current || (decodeurRef.current = await creerDecodeur());
      const code = normaliserCode(await decoder(img));
      if (code) onCode(code); else setPhotoIllisible(true);
    } catch {
      setPhotoIllisible(true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const codeTape = normaliserCode(saisie);
  return (
    <div style={st.bloc} data-lecteur-bon="">
      {(camera === 'ouverture' || camera === 'active') && (
        <div style={st.cadreVideo}>
          <video ref={videoRef} playsInline muted autoPlay style={st.video} aria-label="Caméra : montrez le QR du bon" />
          {camera === 'ouverture' && <span style={st.surVideo}>Ouverture de la caméra</span>}
          {camera === 'active' && <span style={st.viseur} aria-hidden="true" />}
        </div>
      )}
      {camera === 'active' && <p style={st.aide}>Montrez le QR du bon à la caméra.</p>}
      {(camera === 'refusee' || camera === 'absente') && (
        <div style={st.repli}>
          <p style={st.aide}>{camera === 'refusee'
            ? "La caméra n'est pas permise sur cet appareil. Prenez le bon en photo, ou tapez son code."
            : "Pas de caméra disponible. Prenez le bon en photo, ou tapez son code."}</p>
          <label style={st.photo}>
            <Camera size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Prendre le bon en photo</span>
            <input type="file" accept="image/*" capture="environment" style={st.masque} onChange={(e) => lirePhoto(e.target.files?.[0])} />
          </label>
          {photoIllisible && <p style={st.alerte}>Le QR ne se lit pas sur cette photo. Rapprochez-vous, ou tapez le code.</p>}
        </div>
      )}
      <form
        style={st.rang}
        onSubmit={(e) => { e.preventDefault(); if (codeTape && !enCours) onCode(codeTape); }}
      >
        <label style={st.champLabel}>
          <span style={st.sousTitre}>Ou tapez le code</span>
          <Input
            value={saisie}
            onChange={(e) => setSaisie(saisieDuCode(e.target.value))}
            placeholder="ABCD-EFGH"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            style={st.champCode}
          />
        </label>
        <Btn type="submit" variant="primary" disabled={!codeTape || enCours} style={st.btn44}>Chercher</Btn>
      </form>
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 12 },
  cadreVideo: { position: 'relative', width: '100%', maxWidth: 360, aspectRatio: '4 / 3', borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--piste)', alignSelf: 'center' },
  video: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  surVideo: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontSize: 'var(--t2)' },
  viseur: { position: 'absolute', left: '22%', right: '22%', top: '16%', bottom: '16%', borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--surface)', borderRadius: 'var(--r)' },
  aide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  alerte: { margin: 0, fontSize: 'var(--t2)', color: 'var(--warning-text)', lineHeight: 1.45 },
  repli: { display: 'flex', flexDirection: 'column', gap: 10 },
  photo: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, padding: '0 18px', borderRadius: 'var(--r-full)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  masque: { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },
  rang: { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px', minWidth: 0 },
  sousTitre: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  champCode: { fontFamily: 'var(--font-num)', letterSpacing: '0.08em', fontSize: 'var(--t3)' },
  btn44: { minHeight: 44 },
};
