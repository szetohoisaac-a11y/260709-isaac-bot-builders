(function () {
  const TYPES = ['card', 'token', 'tile'];
  const STAT_ORDER = [['cost', 'COST'], ['atk', 'ATK'], ['def', 'HP'], ['hp', 'HP']];
  const ID_BASE = { card: 0, token: 100, tile: 200 };

  function groupByType(assets) {
    const g = { card: [], token: [], tile: [] };
    for (const a of assets || []) if (g[a.type]) g[a.type].push(a);
    return g;
  }

  function statChips(asset) {
    return STAT_ORDER
      .filter(([k]) => typeof asset[k] === 'number')
      .map(([k, label]) => ({ label, value: asset[k] }));
  }

  function slug(name) {
    return String(name || 'asset')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function nextId(assets, type) {
    const ids = (assets || [])
      .filter((a) => a.type === type)
      .map((a) => parseInt(a.id, 10))
      .filter((n) => !Number.isNaN(n));
    const max = ids.length ? Math.max(...ids) : (ID_BASE[type] || 0);
    return String(max + 1).padStart(3, '0');
  }

  function validateAsset(a) {
    const errs = [];
    if (!a || typeof a !== 'object') return ['not an object'];
    for (const f of ['id', 'type', 'name', 'category', 'effect']) {
      if (a[f] == null || a[f] === '') errs.push(`missing ${f}`);
    }
    if (a.type && !TYPES.includes(a.type)) errs.push(`bad type: ${a.type}`);
    if (a.type === 'card') {
      for (const f of ['cost', 'atk', 'def']) {
        if (typeof a[f] !== 'number') errs.push(`card needs numeric ${f}`);
      }
    }
    if (a.type === 'token' && typeof a.hp !== 'number') errs.push('token needs numeric hp');
    if (a.type === 'tile') {
      for (const f of ['cost', 'atk', 'def', 'hp']) {
        if (a[f] != null) errs.push(`tile should not have ${f}`);
      }
    }
    return errs;
  }

  const API = { TYPES, groupByType, statChips, slug, nextId, validateAsset };
  if (typeof window !== 'undefined') window.GalleryCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
