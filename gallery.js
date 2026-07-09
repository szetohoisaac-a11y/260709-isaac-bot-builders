(function () {
  const C = window.GalleryCore;
  const ASSETS = window.ASSETS || [];
  const R = window.RULEBOOK || {};

  // Small inline robot/tech icon set (24x24 stroke paths), chosen by category then type.
  const PATHS = {
    bot: 'M9 2v2M15 2v2M5 8h14a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1ZM9 13h.01M15 13h.01',
    zap: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
    cpu: 'M6 6h12v12H6zM9 9h6v6H9zM2 9h2M2 14h2M20 9h2M20 14h2M9 2v2M14 2v2M9 20v2M14 20v2',
    shield: 'M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z',
    wrench: 'M14 7a4 4 0 0 1-5 5l-6 6 2 2 6-6a4 4 0 0 0 5-5l-2 2-2-2 2-2Z',
    battery: 'M3 8h14v8H3zM21 11v2',
    grid: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16',
  };
  function pickIcon(asset) {
    const c = String(asset.category || '').toLowerCase();
    if (asset.type === 'tile') return PATHS.grid;
    if (asset.type === 'token') return PATHS.bot;
    if (c.includes('attack')) return PATHS.zap;
    if (c.includes('defense')) return PATHS.shield;
    if (c.includes('support')) return PATHS.wrench;
    if (c.includes('boost')) return PATHS.battery;
    return PATHS.cpu;
  }
  function svgIcon(asset) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#45ACF4');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', pickIcon(asset));
    svg.appendChild(p);
    return svg;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function artBox(asset) {
    const box = el('div', 'asset-art');
    const badge = el('span', 'asset-badge', asset.category || asset.type);
    const placeholder = svgIcon(asset);
    if (asset.image) {
      const img = document.createElement('img');
      img.alt = asset.name;
      img.src = asset.image;
      img.onerror = () => { img.remove(); box.appendChild(placeholder); };
      box.appendChild(img);
    } else {
      box.appendChild(placeholder);
    }
    box.appendChild(badge);
    return box;
  }

  function assetCard(asset) {
    const card = el('div', 'asset');
    const head = el('div', 'asset-head');
    head.appendChild(el('span', 'asset-name', asset.name));
    if (typeof asset.cost === 'number') head.appendChild(el('span', 'asset-cost', String(asset.cost)));
    card.appendChild(head);
    card.appendChild(artBox(asset));

    const stats = C.statChips(asset).filter((s) => s.label !== 'COST');
    if (stats.length) {
      const row = el('div', 'asset-stats');
      for (const s of stats) {
        const stat = el('span', 'stat');
        stat.appendChild(el('span', 'label', s.label));
        stat.appendChild(document.createTextNode(String(s.value)));
        row.appendChild(stat);
      }
      card.appendChild(row);
    }
    if (asset.effect) card.appendChild(el('p', 'asset-effect', asset.effect));
    if (asset.flavor) card.appendChild(el('p', 'asset-flavor', asset.flavor));
    card.appendChild(el('div', 'asset-foot', '#' + asset.id));
    return card;
  }

  function family(label, items) {
    const wrap = el('section', 'family');
    wrap.appendChild(el('div', 'family-label', label + ' · ' + items.length));
    const grid = el('div', 'grid');
    for (const a of items) grid.appendChild(assetCard(a));
    wrap.appendChild(grid);
    return wrap;
  }

  function renderRulebook(R) {
    const sec = document.getElementById('rulebook');
    sec.appendChild(el('h2', null, R.theme || 'Your game'));
    const dl = document.createElement('dl');
    const rows = [
      ['How to play', R.howToPlay], ['A turn', R.aTurn],
      ['Win', R.winCondition], ['Pieces', R.pieces], ['Numbers', R.ranges],
      ['Starting deck', R.startingDeck], ['How bidding works', R.howBiddingWorks],
    ];
    for (const [k, v] of rows) {
      if (!v) continue;
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, v));
    }
    sec.appendChild(dl);
  }

  renderRulebook(R);
  const g = C.groupByType(ASSETS);
  const root = document.getElementById('gallery');
  root.appendChild(family('Cards · modules', g.card));
  root.appendChild(family('Tokens · bots', g.token));
  root.appendChild(family('Tiles · arena', g.tile));
})();
