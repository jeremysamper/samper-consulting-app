import React from 'react';
import { createPortal } from 'react-dom';

// Liste de suggestions posée sous un champ, rendue dans <body> : une carte en
// overflow hidden ou un tableau qui défile ne la coupe plus. Elle se place
// sous son parent (le conteneur en position relative qui la portait), suit le
// défilement et le redimensionnement, et s'ouvre au-dessus du champ quand la
// place manque en bas de l'écran.
//   <ListeAncree style={styleDeLaListe}>{items}</ListeAncree>
export function ListeAncree({ style, children }) {
  const repereRef = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const hauteur = typeof style?.maxHeight === 'number' ? style.maxHeight : 200;

  React.useLayoutEffect(() => {
    const placer = () => {
      const parent = repereRef.current?.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      const dessous = window.innerHeight - r.bottom;
      const auDessus = dessous < hauteur && r.top > dessous;
      const n = auDessus
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 2 }
        : { left: r.left, width: r.width, top: r.bottom };
      setPos(p => (p && p.left === n.left && p.width === n.width && p.top === n.top && p.bottom === n.bottom ? p : n));
    };
    placer();
    window.addEventListener('resize', placer);
    window.addEventListener('scroll', placer, true);
    return () => {
      window.removeEventListener('resize', placer);
      window.removeEventListener('scroll', placer, true);
    };
  }, [hauteur]);

  return (
    <>
      <span ref={repereRef} hidden />
      {pos && createPortal(
        <div
          style={{
            ...style,
            position: 'fixed',
            left: pos.left,
            width: pos.width,
            right: 'auto',
            top: pos.top ?? 'auto',
            bottom: pos.bottom ?? 'auto',
            ...(pos.bottom != null ? { marginTop: 0 } : null),
            zIndex: 1100,
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
