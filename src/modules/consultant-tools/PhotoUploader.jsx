import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';

export default function PhotoUploader({ photoUrl, onUpload, onRemove, size = 100, emoji = '📖' }) {
  const fileRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { notifyLegacy('Image trop grande (max 5 Mo).', 'warning'); return; }
    setBusy(true);
    try { await onUpload(file); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photoUrl ? (
        <img src={photoUrl} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}/>
      ) : (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: size / 3, color: 'var(--text2)' }}>
          {emoji}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 4 }}>
        <button
          type="button"
          style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer', fontSize: 12 }}
          title={photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >{busy ? '⏳' : '📷'}</button>
        {photoUrl && (
          <button
            type="button"
            style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
            title="Retirer la photo"
            onClick={onRemove}
          >✕</button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleChange}/>
    </div>
  );
};
