// Mode démo : un PostgREST réduit qui sert la base en mémoire de src/demo.
// Il comprend ce que supabase-js envoie depuis l'app : sélection avec
// ressources imbriquées, filtres (eq, neq, gt, gte, lt, lte, like, ilike, in,
// is, cs, cd, ov, not, or, and), tri, limite, décalage, en-têtes Prefer
// (return, count, resolution) et Accept (objet seul pour .single()).
// Aucune dépendance : le module se charge avant l'application.

const uuid = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export { uuid };

// ── Découpage ────────────────────────────────────────────────────────────────

// Coupe sur les virgules de profondeur zéro, en respectant parenthèses et guillemets.
export function decouper(texte, sep = ',') {
  const out = [];
  let prof = 0;
  let guillemet = false;
  let cur = '';
  for (let i = 0; i < texte.length; i += 1) {
    const c = texte[i];
    if (c === '"' && texte[i - 1] !== '\\') guillemet = !guillemet;
    if (!guillemet) {
      if (c === '(' || c === '{' || c === '[') prof += 1;
      if (c === ')' || c === '}' || c === ']') prof -= 1;
      if (c === sep && prof === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += c;
  }
  if (cur !== '' || out.length) out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

// select=*,alias:table!indice(col,sous(*)) → arbre
export function lireSelect(texte) {
  if (!texte) return { etoile: true, colonnes: [], embeds: [] };
  const arbre = { etoile: false, colonnes: [], embeds: [] };
  for (const brut of decouper(texte.replace(/\s+/g, ''))) {
    const ouv = brut.indexOf('(');
    if (ouv > -1 && brut.endsWith(')')) {
      let tete = brut.slice(0, ouv);
      const corps = brut.slice(ouv + 1, -1);
      let alias = null;
      const deuxPoints = tete.indexOf(':');
      if (deuxPoints > -1) { alias = tete.slice(0, deuxPoints); tete = tete.slice(deuxPoints + 1); }
      const [table, ...indices] = tete.split('!');
      arbre.embeds.push({
        alias: alias || table,
        table,
        indices,
        interne: indices.includes('inner'),
        sel: lireSelect(corps),
      });
      continue;
    }
    if (brut === '*') { arbre.etoile = true; continue; }
    let nom = brut.split('::')[0];
    let alias = null;
    const deuxPoints = nom.indexOf(':');
    if (deuxPoints > -1) { alias = nom.slice(0, deuxPoints); nom = nom.slice(deuxPoints + 1); }
    arbre.colonnes.push({ nom, alias: alias || nom.replace(/^.*->>?/, '') });
  }
  return arbre;
}

// ── Valeurs et comparaisons ─────────────────────────────────────────────────

const estNombre = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));

function lireChemin(ligne, col) {
  // col, col->cle, col->>cle
  const m = col.split(/->>?/);
  let v = ligne?.[m[0]];
  for (let i = 1; i < m.length; i += 1) v = v == null ? undefined : v[m[i].replace(/^'|'$/g, '')];
  return v;
}

function comparer(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a === true || a === 'true') - Number(b === true || b === 'true');
  if (estNombre(a) && estNombre(b) && (typeof a === 'number' || typeof b === 'number')) return Number(a) - Number(b);
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function listeLitterale(raw) {
  const corps = raw.replace(/^[({]|[)}]$/g, '');
  return decouper(corps).map((s) => s.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
}

function egal(x, raw) {
  if (x == null) return raw === 'null';
  if (typeof x === 'boolean') return String(x) === raw;
  if (typeof x === 'number' && estNombre(raw)) return x === Number(raw);
  return String(x) === raw;
}

function motif(raw, insensible) {
  const r = raw.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*');
  return new RegExp('^' + r + '$', insensible ? 'is' : 's');
}

function tableau(v) {
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === 'object') return Object.values(v).map(String);
  return null;
}

// Une condition `op.valeur` sur une valeur de ligne.
export function tester(x, expr) {
  const i = expr.indexOf('.');
  const op = i > -1 ? expr.slice(0, i) : expr;
  const raw = i > -1 ? expr.slice(i + 1) : '';
  switch (op) {
    case 'not': return !tester(x, raw);
    case 'eq': return egal(x, raw);
    case 'neq': return !egal(x, raw);
    case 'gt': return x != null && comparer(x, estNombre(raw) && typeof x === 'number' ? Number(raw) : raw) > 0;
    case 'gte': return x != null && comparer(x, estNombre(raw) && typeof x === 'number' ? Number(raw) : raw) >= 0;
    case 'lt': return x != null && comparer(x, estNombre(raw) && typeof x === 'number' ? Number(raw) : raw) < 0;
    case 'lte': return x != null && comparer(x, estNombre(raw) && typeof x === 'number' ? Number(raw) : raw) <= 0;
    case 'like': return x != null && motif(raw, false).test(String(x));
    case 'ilike': return x != null && motif(raw, true).test(String(x));
    case 'in': return listeLitterale(raw).some((v) => egal(x, v));
    case 'is':
      if (raw === 'null') return x == null;
      if (raw === 'not_null') return x != null;
      if (raw === 'true') return x === true;
      if (raw === 'false') return x === false;
      return false;
    case 'cs': {
      const t = tableau(x);
      if (!t) return false;
      return listeLitterale(raw).every((v) => t.includes(v));
    }
    case 'cd': {
      const t = tableau(x);
      if (!t) return false;
      const l = listeLitterale(raw);
      return t.every((v) => l.includes(v));
    }
    case 'ov': {
      const t = tableau(x);
      if (!t) return false;
      return listeLitterale(raw).some((v) => t.includes(v));
    }
    case 'fts': case 'plfts': case 'phfts': case 'wfts':
      return x != null && String(x).toLowerCase().includes(raw.replace(/^\([^)]*\)/, '').toLowerCase());
    default:
      return true;
  }
}

// or=(a.eq.1,and(b.eq.2,c.eq.3)) ; renvoie un prédicat sur une ligne.
export function predicatLogique(expr, conj) {
  const conds = decouper(expr.replace(/^\(|\)$/g, '')).map((c) => {
    const m = c.match(/^(not\.)?(and|or)\((.*)\)$/s);
    if (m) {
      const p = predicatLogique(m[3], m[2]);
      return m[1] ? (l) => !p(l) : p;
    }
    const i = c.indexOf('.');
    const col = c.slice(0, i);
    const e = c.slice(i + 1);
    return (l) => tester(lireChemin(l, col), e);
  });
  return conj === 'and' ? (l) => conds.every((f) => f(l)) : (l) => conds.some((f) => f(l));
}

// ── Relations ───────────────────────────────────────────────────────────────

const singulier = (mot) => (mot.endsWith('s') ? mot.slice(0, -1) : mot);

function candidatsCle(table) {
  const mots = table.split('_');
  const set = new Set([
    singulier(table) + '_id',
    mots.map(singulier).join('_') + '_id',
    [singulier(mots[0]), ...mots.slice(1)].join('_') + '_id',
    singulier(mots[mots.length - 1]) + '_id',
  ]);
  return [...set];
}

function colonnesDe(db, table) {
  const set = new Set();
  for (const r of (db[table] || []).slice(0, 50)) Object.keys(r).forEach((k) => set.add(k));
  return set;
}

// Relations écrites à la main quand le nom des colonnes ne suffit pas.
// [parent, enfant] → { type: 'un' | 'plusieurs', local, distant }
const RELATIONS = {
  'reservation_tables>salle_tables': { type: 'un', local: 'table_id', distant: 'id' },
  'salle_tables>reservation_tables': { type: 'plusieurs', local: 'id', distant: 'table_id' },
  'pos_item_recipe_mapping>recettes': { type: 'un', local: 'recipe_id', distant: 'id' },
  'recettes>pos_item_recipe_mapping': { type: 'plusieurs', local: 'id', distant: 'recipe_id' },
  'pos_items>pos_item_recipe_mapping': { type: 'plusieurs', local: 'id', distant: 'pos_item_id' },
  'pos_connections>pos_providers': { type: 'un', local: 'provider_id', distant: 'id' },
  'kds_orders>kds_order_items': { type: 'plusieurs', local: 'id', distant: 'kds_order_id' },
  'mep_listes>mep_items': { type: 'plusieurs', local: 'id', distant: 'liste_id' },
  'fiches_salle>carte_fiches_salle': { type: 'plusieurs', local: 'id', distant: 'fiche_salle_id' },
  'carte_fiches_salle>fiches_salle': { type: 'un', local: 'fiche_salle_id', distant: 'id' },
  'caisse_tickets>caisse_lignes': { type: 'plusieurs', local: 'id', distant: 'ticket_id' },
  'caisse_tickets>caisse_paiements': { type: 'plusieurs', local: 'id', distant: 'ticket_id' },
  'caisse_boutons>plats': { type: 'un', local: 'plat_id', distant: 'id' },
  'groupe_evenements>reservations': { type: 'plusieurs', local: 'id', distant: 'groupe_evenement_id' },
  'sop_executions>sop_step_states': { type: 'plusieurs', local: 'id', distant: 'execution_id' },
  'produits>produit_fournisseurs': { type: 'plusieurs', local: 'id', distant: 'produit_id' },
  'produit_fournisseurs>fournisseurs': { type: 'un', local: 'fournisseur_id', distant: 'id' },
};

function relation(db, parent, emb) {
  const cle = `${parent}>${emb.table}`;
  // Indice explicite : colonne locale (profiles!created_by) ou nom de contrainte.
  for (const ind of emb.indices) {
    if (ind === 'inner' || ind === 'left') continue;
    const colsParent = colonnesDe(db, parent);
    if (colsParent.has(ind)) return { type: 'un', local: ind, distant: 'id' };
    const m = ind.match(/^[a-z_]+?_([a-z_]+_id)_fkey$/);
    if (m) {
      if (colsParent.has(m[1])) return { type: 'un', local: m[1], distant: 'id' };
      return { type: 'plusieurs', local: 'id', distant: m[1] };
    }
  }
  if (RELATIONS[cle]) return RELATIONS[cle];
  const colsEnfant = colonnesDe(db, emb.table);
  for (const c of candidatsCle(parent)) if (colsEnfant.has(c)) return { type: 'plusieurs', local: 'id', distant: c };
  const colsParent = colonnesDe(db, parent);
  for (const c of candidatsCle(emb.table)) if (colsParent.has(c)) return { type: 'un', local: c, distant: 'id' };
  return { type: 'plusieurs', local: 'id', distant: singulier(parent) + '_id' };
}

// ── Projection ──────────────────────────────────────────────────────────────

function projeter(db, table, ligne, sel, filtresEmbed, chemin = '') {
  let out;
  if (sel.etoile || (!sel.colonnes.length && !sel.embeds.length)) out = { ...ligne };
  else out = {};
  for (const c of sel.colonnes) {
    if (c.nom === 'count') continue;
    out[c.alias] = lireChemin(ligne, c.nom) ?? null;
  }
  for (const emb of sel.embeds) {
    const rel = relation(db, table, emb);
    const prefixe = chemin + emb.alias;
    let enfants = (db[emb.table] || []).filter((e) => e[rel.distant] != null && egal(e[rel.distant], String(ligne[rel.local])));
    const filtres = filtresEmbed.filter((f) => f.chemin === prefixe);
    for (const f of filtres) enfants = enfants.filter(f.predicat);
    const ordres = filtresEmbed.filter((f) => f.chemin === prefixe + '#order');
    for (const o of ordres) enfants = trier(enfants, o.valeur);
    if (emb.sel.colonnes.length === 1 && emb.sel.colonnes[0].nom === 'count' && !emb.sel.embeds.length) {
      out[emb.alias] = [{ count: enfants.length }];
      continue;
    }
    const projetes = enfants.map((e) => projeter(db, emb.table, e, emb.sel, filtresEmbed, prefixe + '.'));
    if (rel.type === 'un') out[emb.alias] = projetes[0] || null;
    else out[emb.alias] = projetes;
    if (emb.interne && (rel.type === 'un' ? !projetes.length : !projetes.length)) out.__exclure = true;
  }
  return out;
}

function trier(lignes, ordre) {
  if (!ordre) return lignes;
  const cles = decouper(ordre).map((o) => {
    const p = o.split('.');
    return { col: p[0], desc: p.includes('desc'), nullsFirst: p.includes('nullsfirst'), nullsLast: p.includes('nullslast') };
  });
  return [...lignes].sort((a, b) => {
    for (const k of cles) {
      const x = lireChemin(a, k.col);
      const y = lireChemin(b, k.col);
      if ((x == null) !== (y == null)) {
        // PostgreSQL : nulls en dernier en ordre croissant, en premier en décroissant.
        const nullsDabord = k.nullsFirst || (k.desc && !k.nullsLast);
        return (x == null ? -1 : 1) * (nullsDabord ? 1 : -1);
      }
      const c = comparer(x, y);
      if (c !== 0) return k.desc ? -c : c;
    }
    return 0;
  });
}

// ── Requête ─────────────────────────────────────────────────────────────────

const RESERVES = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function lireFiltres(params) {
  const racine = [];
  const embed = [];
  for (const [cle, valeur] of params.entries()) {
    if (RESERVES.has(cle)) continue;
    // Tri d'une ressource imbriquée : plat_recettes.order=ordre
    if (cle.endsWith('.order')) { embed.push({ chemin: cle.slice(0, -6) + '#order', valeur }); continue; }
    if (cle.endsWith('.limit') || cle.endsWith('.offset')) continue;
    let predicat;
    let col = cle;
    let chemin = '';
    const point = cle.lastIndexOf('.');
    if (point > -1 && !/->/.test(cle)) { chemin = cle.slice(0, point); col = cle.slice(point + 1); }
    if (col === 'or' || col === 'and') predicat = predicatLogique(valeur, col);
    else if (col === 'not.or' || col === 'not.and') { const p = predicatLogique(valeur, col.slice(4)); predicat = (l) => !p(l); } else predicat = (l) => tester(lireChemin(l, col), valeur);
    if (chemin) embed.push({ chemin, predicat });
    else racine.push(predicat);
  }
  return { racine, embed };
}

// Valeurs par défaut posées par la base à l'insertion.
function avecDefauts(table, ligne, defauts) {
  const maintenant = new Date().toISOString();
  const out = { ...ligne };
  const d = defauts?.[table];
  if (d) for (const [k, v] of Object.entries(d)) if (out[k] === undefined) out[k] = typeof v === 'function' ? v(out) : v;
  if (out.id === undefined && !(defauts?.__sansId || []).includes(table)) out.id = uuid();
  if (out.created_at === undefined) out.created_at = maintenant;
  if (out.updated_at === undefined && d?.updated_at !== null) out.updated_at = maintenant;
  return out;
}

const json = (status, corps, entetes = {}) => ({ status, corps, entetes });

export function erreurPg(status, message, code = 'P0001', details = null) {
  return json(status, { code, message, details, hint: null });
}

/**
 * Exécute une requête REST sur la base en mémoire.
 * @param {object} db         tables : { nom: [lignes] }
 * @param {object} req        { methode, table, params (URLSearchParams), entetes (Headers), corps }
 * @param {object} options    { defauts, clesPrimaires, avantLecture(table, lignes), apresEcriture(evt) }
 * @returns {{status:number, corps:any, entetes:object}}
 */
export function executer(db, req, options = {}) {
  const { methode, table, params, entetes } = req;
  if (!db[table]) db[table] = [];
  const accept = entetes.get('Accept') || '';
  const objet = accept.includes('vnd.pgrst.object');
  const prefer = entetes.get('Prefer') || '';
  const representation = prefer.includes('return=representation');
  const compter = /count=(exact|planned|estimated)/.test(prefer);
  const sel = lireSelect(params.get('select'));
  const { racine, embed } = lireFiltres(params);

  const filtrer = (lignes) => lignes.filter((l) => racine.every((p) => p(l)));
  const sortie = (lignes, status = 200, total = null) => {
    const projetes = lignes
      .map((l) => projeter(db, table, l, sel, embed))
      .filter((l) => !l.__exclure);
    const ent = {};
    if (compter || total != null) {
      const n = total ?? projetes.length;
      ent['Content-Range'] = projetes.length ? `0-${projetes.length - 1}/${n}` : `*/${n}`;
    }
    if (objet) {
      if (projetes.length !== 1) {
        return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${projetes.length} rows`, hint: null }, ent);
      }
      return json(status, projetes[0], ent);
    }
    if (status === 201 && !representation) return json(201, null, ent);
    return json(status, projetes, ent);
  };

  if (methode === 'GET' || methode === 'HEAD') {
    let lignes = options.avantLecture ? options.avantLecture(table, db[table]) : db[table];
    lignes = filtrer(lignes);
    // Ressources imbriquées !inner : on retire les parents sans enfant retenu.
    if (sel.embeds.some((e) => e.interne)) {
      lignes = lignes.filter((l) => !projeter(db, table, l, sel, embed).__exclure);
    }
    lignes = trier(lignes, params.get('order'));
    const total = lignes.length;
    const offset = Number(params.get('offset') || 0);
    const limite = params.get('limit');
    let tranche = lignes.slice(offset, limite != null ? offset + Number(limite) : undefined);
    const plage = entetes.get('Range');
    if (plage && /^\d+-\d*$/.test(plage)) {
      const [a, b] = plage.split('-').map((x) => (x === '' ? null : Number(x)));
      tranche = lignes.slice(a, b == null ? undefined : b + 1);
    }
    if (methode === 'HEAD') {
      return json(200, null, compter ? { 'Content-Range': tranche.length ? `0-${tranche.length - 1}/${total}` : `*/${total}` } : {});
    }
    // Copie profonde légère : l'app ne doit jamais muter la base par référence.
    const r = sortie(tranche.map((l) => JSON.parse(JSON.stringify(l))), 200, compter ? total : null);
    return r;
  }

  if (methode === 'POST') {
    const liste = Array.isArray(req.corps) ? req.corps : [req.corps || {}];
    const fusion = prefer.includes('resolution=merge-duplicates');
    const ignorer = prefer.includes('resolution=ignore-duplicates');
    const conflit = params.get('on_conflict');
    const pk = options.clesPrimaires?.[table] || ['id'];
    const cles = conflit ? conflit.split(',').map((s) => s.trim()) : pk;
    const crees = [];
    for (const brut of liste) {
      const existante = (fusion || ignorer)
        ? db[table].find((r) => cles.every((c) => brut[c] !== undefined && String(r[c]) === String(brut[c])))
        : null;
      if (existante) {
        if (fusion) {
          const avant = { ...existante };
          Object.assign(existante, brut, existante.updated_at !== undefined ? { updated_at: new Date().toISOString() } : {});
          options.apresEcriture?.({ type: 'UPDATE', table, record: { ...existante }, old_record: avant });
          crees.push(existante);
        }
        continue;
      }
      // Clé unique simple : refuser un doublon comme la base.
      if (!fusion && !ignorer && pk.every((c) => brut[c] !== undefined) && db[table].some((r) => pk.every((c) => String(r[c]) === String(brut[c])))) {
        return erreurPg(409, `duplicate key value violates unique constraint "${table}_pkey"`, '23505');
      }
      const ligne = avecDefauts(table, brut, options.defauts);
      db[table].push(ligne);
      options.apresEcriture?.({ type: 'INSERT', table, record: { ...ligne }, old_record: null });
      crees.push(ligne);
    }
    if (!representation && !objet) return json(201, null);
    return sortie(crees.map((l) => JSON.parse(JSON.stringify(l))), 201);
  }

  if (methode === 'PATCH') {
    const cibles = filtrer(db[table]);
    for (const r of cibles) {
      const avant = { ...r };
      Object.assign(r, req.corps || {});
      options.apresEcriture?.({ type: 'UPDATE', table, record: { ...r }, old_record: avant });
    }
    if (!representation && !objet) return json(204, null);
    return sortie(cibles.map((l) => JSON.parse(JSON.stringify(l))));
  }

  if (methode === 'DELETE') {
    const cibles = filtrer(db[table]);
    const set = new Set(cibles);
    db[table] = db[table].filter((r) => !set.has(r));
    for (const r of cibles) options.apresEcriture?.({ type: 'DELETE', table, record: null, old_record: { ...r } });
    if (!representation && !objet) return json(204, null);
    return sortie(cibles);
  }

  return erreurPg(405, 'Méthode non prise en charge par la démo');
}
