// play.js — Interactive game UI for shared-screen and network play
(function () {
  'use strict';

  var Engine = window.GameEngine;

  // ========== STATE ==========
  var gameState = null;
  var uiState = {
    mode: 'shared',
    selectedSlot: null,
    selectedCard: null,
    selectedBench: null,
    targeting: null,
    // Network mode
    ws: null,
    connected: false,
    networkPlayerId: null,
    networkRoomCode: null,
    isHost: false,
    reconnecting: false,
    wasConnected: false,
  };

  // ========== DOM REFS ==========
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  var dom = {};
  function cacheDom() {
    dom.lobby = $('#lobby');
    dom.gameScreen = $('#game-screen');
    dom.apDisplay = $('#ap-display');
    dom.creditsDisplay = $('#credits-display');
    dom.baseDisplay = $('#base-display');
    dom.btnLog = $('#btn-log');
    dom.btnEndTurn = $('#btn-end-turn');
    dom.board = $('#board');
    dom.benchSlots = $('#bench-slots');
    dom.marketCards = $('#market-cards');
    dom.handCards = $('#hand-cards');
    dom.trapsCount = $('#traps-count');
    dom.trapsCards = $('#traps-cards');
    dom.deckCount = $('#deck-count');
    dom.discardCount = $('#discard-count');
    dom.discardCards = $('#discard-cards');
    dom.enemyBoxes = $('#enemy-boxes');
    dom.passOverlay = $('#pass-overlay');
    dom.passPlayer = $('#pass-player');
    dom.btnContinue = $('#btn-continue');
    dom.targetingOverlay = $('#targeting-overlay');
    dom.targetingHeader = $('#targeting-header');
    dom.btnBack = $('#btn-back');
    dom.targetingBoard = $('#targeting-board');
    dom.btnConfirm = $('#btn-confirm');
    dom.placementOverlay = $('#placement-overlay');
    dom.placementCardName = $('#placement-card-name');
    dom.placementCardInfo = $('#placement-card-info');
    dom.placementOptions = $('#placement-options');
    dom.btnPlacementDiscard = $('#btn-placement-discard');
    dom.logPanel = $('#log-panel');
    dom.logEntries = $('#log-entries');
    dom.btnCloseLog = $('#btn-close-log');
    dom.victoryScreen = $('#victory-screen');
    dom.victoryText = $('#victory-text');
    dom.btnPlayAgain = $('#btn-play-again');
    dom.btnShared = $('#btn-shared');
    dom.statusBar = $('#status-bar');
    // Network lobby
    dom.btnHost = $('#btn-host');
    dom.btnJoin = $('#btn-join');
    dom.joinCode = $('#join-code');
    dom.playerName = $('#player-name');
    dom.btnStart = $('#btn-start');
    dom.lobbyPlayers = $('#lobby-players');
    dom.reconnectOverlay = $('#reconnect-overlay');
    // Create reconnect overlay if it doesn't exist
    if (!dom.reconnectOverlay) {
      var overlay = document.createElement('div');
      overlay.id = 'reconnect-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;z-index:300;';
      overlay.innerHTML = '<div style="background:#fff;border-radius:18px;padding:32px;text-align:center;max-width:400px;"><h2>Disconnected</h2><p>Reconnecting...</p><button id="btn-reconnect-retry">Retry Now</button></div>';
      document.body.appendChild(overlay);
      dom.reconnectOverlay = overlay;
    }
  }

  // ========== HELPERS ==========
  function getPlayer(state) {
    return Engine.getActivePlayer(state);
  }

  function getOpponents(state) {
    var activeId = state.activePlayer;
    return state.players.filter(function (p) { return p.id !== activeId; });
  }

  function playerById(state, id) {
    return state.players.find(function (p) { return p.id === id; });
  }

  function cardById(id) {
    // Try _uid first (instance lookup in hand/board/bench), then id (template lookup)
    var all = Engine.loadCards();
    var found = all.find(function (c) { return c._uid === id; });
    if (found) return found;
    // Look in current game state
    if (gameState) {
      var p = getPlayer(gameState);
      if (p) {
        var inHand = p.hand.find(function (c) { return c._uid === id; });
        if (inHand) return inHand;
        var inBoard = ['active','secondary','defensive','support'].reduce(function (acc, pos) {
          if (acc) return acc;
          return (p.board[pos] && p.board[pos]._uid === id) ? p.board[pos] : null;
        }, null);
        if (inBoard) return inBoard;
        var inBench = p.board.bench.find(function (c) { return c && c._uid === id; });
        if (inBench) return inBench;
      }
    }
    // Fallback: template lookup by id
    return all.find(function (c) { return c.id === id; });
  }

  function clearUiSelections() {
    uiState.selectedSlot = null;
    uiState.selectedCard = null;
    uiState.selectedBench = null;
    uiState.targeting = null;
  }

  function botCategoryClass(cat) {
    switch (cat) {
      case 'Active': return 'cat-active';
      case 'Secondary': return 'cat-secondary';
      case 'Defensive': return 'cat-defensive';
      case 'Support': return 'cat-support';
      case 'Instant': return 'cat-instant';
      case 'Trap': return 'cat-trap';
      default: return '';
    }
  }

  // Format attack display: dual stats if card has different bot vs base damage
  function botAttackDisplay(bot) {
    var atk = bot.atk != null ? bot.atk : 0;
    if (atk <= 0) return '';
    var effect = bot.effect || '';
    // Look for "or X to base" or "OR X to base" with a different value
    var baseMatch = effect.match(/or\s+(\d+)\s+to\s+(enemy\s+)?base/i);
    if (baseMatch) {
      var baseDmg = parseInt(baseMatch[1], 10);
      if (baseDmg !== atk) {
        return '<span class="atk">ATK ' + atk + ' vs Bot</span> <span class="atk atk-base">' + baseDmg + ' vs Base</span>';
      }
    }
    return '<span class="atk">ATK ' + atk + '</span>';
  }

  // ========== RENDER FUNCTIONS ==========

  function renderAll(state) {
    gameState = state;
    renderStatus(state);
    renderBoard(state);
    renderBench(state);
    renderHand(state);
    renderMarket(state);
    renderSidePanel(state);
    renderEnemies(state);
    // Turn enforcement for network mode
    if (isNetworkMode()) {
      dom.btnEndTurn.disabled = !isMyTurn();
      var dim = !isMyTurn();
      dimElement(dom.board, dim);
      dimElement(dom.handCards, dim);
      dimElement(dom.marketCards, dim);
      dimElement(dom.benchSlots, dim);
      dimElement(dom.enemyBoxes, dim);
    } else {
      dom.btnEndTurn.disabled = false;
      dimElement(dom.board, false);
      dimElement(dom.handCards, false);
      dimElement(dom.marketCards, false);
      dimElement(dom.benchSlots, false);
      dimElement(dom.enemyBoxes, false);
    }
    // NOTE: callers are responsible for clearUiSelections() before/after as appropriate.
    // Some flows (e.g. selecting a hand card) need selections to survive the render pass.
    // Check for pending placement after any state update
    if (state.pendingPlacement) showPlacementOverlay(state);
  }

  function renderStatus(state) {
    var p = getPlayer(state);
    if (!p) return;
    dom.apDisplay.textContent = 'AP: ' + p.ap;
    dom.creditsDisplay.textContent = 'Credits: ' + p.credits;
    dom.baseDisplay.textContent = 'Base: ' + p.baseHP + ' HP';
    // Show whose turn
    var label = dom.statusBar.querySelector('.turn-label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'turn-label';
      label.style.cssText = 'margin-left:auto;color:var(--accent);font-weight:700;';
      dom.statusBar.appendChild(label);
    }
    if (isNetworkMode()) {
      if (isMyTurn()) {
        label.textContent = 'Your Turn';
        label.style.color = '#27ae60';
      } else {
        label.textContent = p.name + '\'s Turn';
        label.style.color = 'var(--accent)';
      }
    } else {
      label.textContent = p.name + '\'s Turn';
      label.style.color = 'var(--accent)';
    }
  }

  function renderBoard(state) {
    var p = getPlayer(state);
    if (!p) return;
    var positions = ['active', 'secondary', 'defensive', 'support'];
    positions.forEach(function (pos) {
      var slot = dom.board.querySelector('.slot[data-slot="' + pos + '"]');
      if (!slot) return;
      var cardDiv = slot.querySelector('.slot-card');
      if (!cardDiv) return;
      var bot = p.board[pos];
      if (bot) {
        var atk = bot.atk != null ? bot.atk : 0;
        var def = bot.def != null ? bot.def : 0;
        var imgHtml = bot.image
          ? '<img class="slot-img" src="' + escHtml(bot.image) + '" alt="' + escHtml(bot.name) + '" onerror="this.style.display=\'none\'">'
          : '';
        cardDiv.innerHTML =
          '<span class="card-type-badge">' + escHtml(bot.category) + '</span>' +
          imgHtml +
          '<div class="bot-name">' + escHtml(bot.name) + '</div>' +
          botAttackDisplay(bot) +
          (atk > 0 ? ' ' : '') +
          '<span class="hp">HP ' + def + '</span>' +
          (bot.effect ? '<div class="bot-effect">' + escHtml(bot.effect) + '</div>' : '');
        cardDiv.className = 'slot-card ' + botCategoryClass(bot.category);
      } else {
        cardDiv.innerHTML = '<span class="empty-slot">empty</span>';
        cardDiv.className = 'slot-card';
      }
      // Selection highlight
      if (uiState.selectedSlot === pos) {
        slot.classList.add('selected');
      } else {
        slot.classList.remove('selected');
      }
      // Show "Play Here" hint if a hand card is selected and it's a bot
      if (uiState.selectedCard) {
        var card = cardById(uiState.selectedCard);
        if (card && isBotCard(card) && card.category.toLowerCase() === pos) {
          var btn = slot.querySelector('.play-here-btn');
          if (!btn) {
            btn = document.createElement('button');
            btn.className = 'play-here-btn';
            btn.textContent = 'Play Here';
            btn.style.cssText = 'display:block;margin-top:4px;font-size:10px;padding:2px 6px;';
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              playCardToPosition(uiState.selectedCard, pos);
            });
            cardDiv.appendChild(btn);
          }
        } else {
          var existing = slot.querySelector('.play-here-btn');
          if (existing) existing.remove();
        }
      } else {
        var ex = slot.querySelector('.play-here-btn');
        if (ex) ex.remove();
      }
    });
  }

  function renderBench(state) {
    var p = getPlayer(state);
    if (!p) return;
    dom.benchSlots.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var bot = p.board.bench[i];
      var chip = document.createElement('div');
      chip.className = 'bench-chip';
      if (bot) {
        var atk = bot.atk != null ? bot.atk : 0;
        var def = bot.def != null ? bot.def : 0;
        var cost = bot.cost != null ? bot.cost : 0;
        var imgHtml = bot.image
          ? '<img src="' + escHtml(bot.image) + '" alt="' + escHtml(bot.name) + '" onerror="this.style.display=\'none\'">'
          : '';
        chip.innerHTML =
          '<span class="card-type-badge">' + escHtml(bot.category) + '</span>' +
          imgHtml +
          '<div class="bench-info">' +
          '<div class="bench-name">' + escHtml(bot.name) + '</div>' +
          '<div class="bench-stats">' +
          (cost ? '<span class="cost">' + cost + 'c</span> ' : '') +
          botAttackDisplay(bot) +
          (atk > 0 ? ' ' : '') +
          '<span class="hp">HP ' + def + '</span>' +
          '</div>' +
          (bot.effect ? '<div class="bot-effect">' + escHtml(bot.effect) + '</div>' : '') +
          '</div>';
        chip.classList.add(botCategoryClass(bot.category));
      } else {
        chip.innerHTML = '<span class="bench-empty">—</span>';
        chip.style.opacity = '0.4';
      }
      chip.dataset.benchIndex = i;
      chip.addEventListener('click', function () {
        onBenchClick(parseInt(this.dataset.benchIndex, 10));
      });
      if (uiState.selectedBench === i) chip.classList.add('selected');
      dom.benchSlots.appendChild(chip);
    }
  }

  function renderHand(state) {
    var p = getPlayer(state);
    if (!p) return;
    dom.handCards.innerHTML = '';
    // Draw card button
    var drawBtn = document.createElement('button');
    drawBtn.textContent = 'Draw Card (1 AP)';
    drawBtn.style.cssText = 'font-size:11px;padding:4px 8px;margin-bottom:6px;';
    drawBtn.disabled = p.ap < 1 || !isMyTurn();
    drawBtn.addEventListener('click', function () {
      if (!gameState) return;
      if (isNetworkMode()) {
        networkAction({ type: 'DRAW_CARD' });
        return;
      }
      var result = Engine.drawCard(gameState, p.id);
      if (result.error) { alert(result.error); return; }
      gameState = result.newState;
      renderAll(gameState);
      renderActionButtons();
    });
    dom.handCards.appendChild(drawBtn);

    p.hand.forEach(function (card, idx) {
      var cardEl = document.createElement('div');
      cardEl.className = 'hand-card ' + botCategoryClass(card.category);
      var cost = card.cost != null ? card.cost : 0;
      var atk = card.atk != null ? card.atk : 0;
      var def = card.def != null ? card.def : 0;
      var imgHtml = card.image
        ? '<img class="card-img" src="' + escHtml(card.image) + '" alt="' + escHtml(card.name) + '" onerror="this.style.display=\'none\'">'
        : '';
      cardEl.innerHTML =
        '<span class="card-type-badge">' + escHtml(card.category) + '</span>' +
        imgHtml +
        '<div class="card-info"><strong>' + escHtml(card.name) + '</strong>' +
        ' <span class="cost">(' + cost + 'c)</span>' +
        (atk > 0 ? ' <span class="atk">ATK ' + atk + '</span>' : '') +
        (def > 0 ? ' <span class="hp">HP ' + def + '</span>' : '') +
        '<div style="font-size:10px;color:var(--muted)">' + escHtml(card.effect || '') + '</div></div>';
      cardEl.title = card.effect || '';
      cardEl.addEventListener('click', function () {
        onHandCardClick(card);
      });
      if (uiState.selectedCard === (card._uid || card.id)) cardEl.classList.add('selected');
      dom.handCards.appendChild(cardEl);
    });
  }

  function renderMarket(state) {
    dom.marketCards.innerHTML = '';
    state.marketRow.forEach(function (card, idx) {
      if (!card) return;
      var cardEl = document.createElement('div');
      cardEl.className = 'market-card ' + botCategoryClass(card.category);
      var cost = card.cost != null ? card.cost : 0;
      var imgHtml = card.image
        ? '<img class="card-img" src="' + escHtml(card.image) + '" alt="' + escHtml(card.name) + '" onerror="this.style.display=\'none\'">'
        : '';
      cardEl.innerHTML =
        '<span class="card-type-badge">' + escHtml(card.category) + '</span>' +
        imgHtml +
        '<div class="card-info"><strong>' + escHtml(card.name) + '</strong>' +
        ' <span class="cost">' + cost + ' credits</span>' +
        '<div style="font-size:10px;color:var(--muted)">' + escHtml(card.effect || '') + '</div></div>';
      cardEl.addEventListener('click', function () {
        buyMarketCard(idx);
      });
      dom.marketCards.appendChild(cardEl);
    });
  }

  function renderSidePanel(state) {
    var p = getPlayer(state);
    if (!p) return;
    // Active traps
    var trapCount = (p.traps || []).length;
    if (dom.trapsCount) dom.trapsCount.textContent = trapCount;
    if (dom.trapsCards) {
      dom.trapsCards.innerHTML = '';
      (p.traps || []).forEach(function (trap) {
        var chip = document.createElement('div');
        chip.className = 'trap-card';
        var cost = trap.cost != null ? trap.cost : 0;
        chip.innerHTML =
          '<span class="dc-name">' + escHtml(trap.name) + '</span>' +
          '<span class="trap-cost">' + cost + 'c</span>';
        chip.title = trap.name + '\n' + (trap.effect || '');
        dom.trapsCards.appendChild(chip);
      });
    }
    var deckCount = (p.deck || []).length;
    var discardCount = (p.discard || []).length;
    // Deck count
    if (dom.deckCount) {
      dom.deckCount.textContent = deckCount;
    }
    // Discard count
    if (dom.discardCount) {
      dom.discardCount.textContent = discardCount;
    }
    // Discard cards list (most recent at top)
    if (dom.discardCards) {
      dom.discardCards.innerHTML = '';
      var cards = p.discard.slice().reverse();
      cards.forEach(function (card) {
        var chip = document.createElement('div');
        chip.className = 'discard-card';
        var imgHtml = card.image
          ? '<img src="' + escHtml(card.image) + '" alt="' + escHtml(card.name) + '" onerror="this.style.display=\'none\'">'
          : '';
        chip.innerHTML = imgHtml + '<span class="dc-name">' + escHtml(card.name) + '</span>';
        chip.title = card.name + (card.cost != null ? ' (' + card.cost + 'c)' : '') + '\n' + (card.effect || '');
        dom.discardCards.appendChild(chip);
      });
    }
  }

  function renderEnemies(state) {
    var p = getPlayer(state);
    if (!p) return;
    var opponents = getOpponents(state);
    dom.enemyBoxes.innerHTML = '';
    var inAttackMode = uiState.targeting && uiState.targeting.action === 'attack';
    if (inAttackMode) {
      var hint = document.createElement('div');
      hint.style.cssText = 'width:100%;font-size:12px;color:var(--accent);font-weight:700;margin-bottom:6px;';
      hint.textContent = 'Click an enemy to select a target for your attack.';
      dom.enemyBoxes.appendChild(hint);
    }
    opponents.forEach(function (opp) {
      var box = document.createElement('div');
      box.className = 'enemy-box' + (inAttackMode ? ' enemy-targetable' : '');
      box.innerHTML =
        '<h4>' + escHtml(opp.name) + '</h4>' +
        '<div class="hp">Base: ' + opp.baseHP + ' HP</div>' +
        '<div style="font-size:10px;color:var(--muted)">Bots: ' + countBotsOnBoard(opp) + '</div>';
      box.addEventListener('click', function () {
        onEnemyClick(opp.id);
      });
      dom.enemyBoxes.appendChild(box);
    });
  }

  function renderLog() {
    if (!gameState) return;
    dom.logEntries.innerHTML = '';
    var log = gameState.turnLog || [];
    log.forEach(function (entry) {
      var div = document.createElement('div');
      div.textContent = (entry.msg || '');
      dom.logEntries.appendChild(div);
    });
    // Auto-scroll to latest entry
    dom.logEntries.scrollTop = dom.logEntries.scrollHeight;
  }

  function countBotsOnBoard(player) {
    var count = 0;
    var positions = ['active', 'secondary', 'defensive', 'support'];
    positions.forEach(function (p) { if (player.board[p]) count++; });
    if (player.board.bench) {
      player.board.bench.forEach(function (b) { if (b) count++; });
    }
    return count;
  }

  function isBotCard(card) {
    return card && ['Active', 'Secondary', 'Defensive', 'Support'].indexOf(card.category) !== -1;
  }

  function isInstantCard(card) {
    return card && card.category === 'Instant';
  }

  function isTrapCard(card) {
    return card && card.category === 'Trap';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dimElement(el, dim) {
    if (!el) return;
    if (dim) {
      el.style.opacity = '0.5';
      el.style.pointerEvents = 'none';
    } else {
      el.style.opacity = '';
      el.style.pointerEvents = '';
    }
  }

  // ========== TARGETING OVERLAY ==========

  function openTargetingOverlay(targetPlayerId) {
    if (!gameState) return;
    var targetPlayer = playerById(gameState, targetPlayerId);
    if (!targetPlayer) return;
    var p = getPlayer(gameState);
    var attackingBot = p && uiState.selectedSlot ? p.board[uiState.selectedSlot] : null;
    uiState.targeting = {
      action: 'attack',
      botPosition: uiState.selectedSlot,
      targetPlayerId: targetPlayerId,
      targetType: null,
      targetPosition: null,
    };
    var header = 'Select target for ' + (attackingBot ? escHtml(attackingBot.name) : 'attack');
    dom.targetingHeader.textContent = header;
    dom.targetingBoard.innerHTML = '';
    dom.btnConfirm.textContent = 'Confirm Attack';
    // Reset confirm to attack flow handler
    dom.btnConfirm._handler = 'attack';
    var positions = ['active', 'secondary', 'defensive', 'support'];
    // Show enemy board positions
    positions.forEach(function (pos) {
      var bot = targetPlayer.board[pos];
      var el = document.createElement('div');
      el.className = 'target-slot';
      el.style.cssText =
        'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;transition:all 0.15s;';
      if (bot) {
        el.innerHTML = '<strong>' + escHtml(bot.name) + '</strong><br><span class="atk">ATK ' + (bot.atk || 0) + '</span> <span class="hp">HP ' + (bot.def || 0) + '</span>';
        el.addEventListener('click', function () {
          uiState.targeting.targetType = 'bot';
          uiState.targeting.targetPosition = pos;
          highlightTargetSelection(el, dom.targetingBoard);
          dom.btnConfirm.disabled = false;
        });
      } else {
        el.innerHTML = '<em style="color:var(--muted)">empty slot</em>';
        el.style.opacity = '0.5';
        el.style.cursor = 'default';
      }
      if (uiState.targeting.targetPosition === pos && uiState.targeting.targetType === 'bot') {
        el.classList.add('selected');
      }
      dom.targetingBoard.appendChild(el);
    });
    // Base target
    var baseEl = document.createElement('div');
    baseEl.className = 'target-slot';
    baseEl.style.cssText =
      'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;transition:all 0.15s;';
    var breacherBonus = (attackingBot && attackingBot.name === 'Breacher') ? ' (bypasses defenses)' : '';
    baseEl.innerHTML = '<strong>Attack Base</strong><br><span class="hp">HP: ' + targetPlayer.baseHP + '</span>' +
      (breacherBonus ? '<br><span style="font-size:11px;color:#e74c3c;font-weight:700;">' + breacherBonus + '</span>' : '');
    baseEl.addEventListener('click', function () {
      uiState.targeting.targetType = 'base';
      uiState.targeting.targetPosition = null;
      highlightTargetSelection(baseEl, dom.targetingBoard);
      dom.btnConfirm.disabled = false;
    });
    if (uiState.targeting.targetType === 'base') {
      baseEl.classList.add('selected');
    }
    dom.targetingBoard.appendChild(baseEl);
    dom.btnConfirm.disabled = true;
    dom.targetingOverlay.style.display = 'flex';
  }

  function highlightTargetSelection(el, container) {
    var all = container.querySelectorAll('.target-slot');
    all.forEach(function (s) { s.classList.remove('selected'); });
    el.classList.add('selected');
  }

  function confirmAttack() {
    if (!uiState.targeting || !gameState) return;
    var t = uiState.targeting;
    if (!t.targetType) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      var action = {
        type: 'ATTACK',
        botPosition: t.botPosition,
        targetPlayerId: t.targetPlayerId,
        targetType: t.targetType,
        targetPosition: t.targetPosition,
      };
      dom.targetingOverlay.style.display = 'none';
      uiState.targeting = null;
      clearUiSelections();
      networkAction(action);
      return;
    }
    var result;
    // Check if breacher
    var bot = p.board[t.botPosition];
    if (bot && bot.name === 'Breacher' && t.targetType === 'base') {
      result = Engine.breacherAttack(gameState, p.id, t.targetPlayerId, t.targetType);
    } else {
      result = Engine.attack(gameState, p.id, t.botPosition, t.targetPlayerId, t.targetType, t.targetPosition);
    }
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    // Check for secondary on-hit effects
    var secondaryBot = p.board.secondary;
    if (secondaryBot && t.targetType === 'bot' && t.targetPosition) {
      var secResult = Engine.secondaryOnHit(gameState, p.id, secondaryBot.name, t.targetPlayerId, t.targetPosition);
      gameState = secResult.newState;
    }
    dom.targetingOverlay.style.display = 'none';
    clearUiSelections();
    renderAll(gameState);
    checkWinAfterAction();
  }

  // ========== ACTION HANDLERS ==========

  function onSlotClick(position) {
    var p = getPlayer(gameState);
    if (!p) return;
    // If we have a selected card ready to play
    if (uiState.selectedCard) {
      var selCard = cardById(uiState.selectedCard);
      if (selCard && isBotCard(selCard)) {
        playCardToPosition(uiState.selectedCard, position);
      } else {
        uiState.selectedCard = null;
        renderAll(gameState);
        renderActionButtons();
      }
      return;
    }
    // Toggle slot selection
    if (uiState.selectedSlot === position) {
      uiState.selectedSlot = null;
    } else {
      uiState.selectedSlot = position;
      uiState.selectedCard = null;
    }
    renderBoard(gameState);
    renderBench(gameState);
    renderActionButtons();
  }

  function renderActionButtons() {
    // Remove old action bar
    var old = $('#action-bar');
    if (old) old.remove();
    if (!uiState.selectedSlot || !gameState) return;
    // In network mode, only show action bar on your turn
    if (isNetworkMode() && !isMyTurn()) return;
    var p = getPlayer(gameState);
    if (!p) return;
    var bot = p.board[uiState.selectedSlot];
    if (!bot) return;
    var bar = document.createElement('div');
    bar.id = 'action-bar';
    bar.style.cssText =
      'display:flex;gap:8px;padding:8px 0;flex-wrap:wrap;';
    // Attack button
    if ((bot.atk || 0) > 0) {
      var atkBtn = document.createElement('button');
      atkBtn.textContent = 'Attack (' + bot.name + ')';
      atkBtn.addEventListener('click', function () {
        startAttackFlow();
      });
      bar.appendChild(atkBtn);
    }
    // Ability button (support bots)
    if (bot.category === 'Support') {
      var abBtn = document.createElement('button');
      abBtn.textContent = 'Use Ability (' + bot.name + ')';
      abBtn.addEventListener('click', function () {
        startAbilityFlow();
      });
      bar.appendChild(abBtn);
    }
    // Swap to bench
    var swapBtn = document.createElement('button');
    swapBtn.textContent = 'Swap to Bench';
    swapBtn.addEventListener('click', function () {
      startSwapFlow();
    });
    bar.appendChild(swapBtn);
    // Deselect
    var deselBtn = document.createElement('button');
    deselBtn.textContent = 'Deselect';
    deselBtn.addEventListener('click', function () {
      uiState.selectedSlot = null;
      uiState.selectedBench = null;
      renderBoard(gameState);
      renderBench(gameState);
      renderActionButtons();
    });
    bar.appendChild(deselBtn);
    dom.board.parentNode.insertBefore(bar, dom.board.nextSibling);
  }

  function startAttackFlow() {
    if (!uiState.selectedSlot || !gameState) return;
    uiState.targeting = {
      action: 'attack',
      botPosition: uiState.selectedSlot,
      targetPlayerId: null,
      targetType: null,
      targetPosition: null,
    };
    // Highlight that we're in targeting mode — user clicks enemy next
    renderBoard(gameState);
    renderEnemies(gameState);
  }

  function startAbilityFlow() {
    if (!uiState.selectedSlot || !gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    var bot = p.board[uiState.selectedSlot];
    if (!bot) return;
    var abilityName = bot.name;
    // For abilities that target bots, show own board positions as targets
    if (['Repair Bot', 'Medic', 'Booster', 'Shield Gen', 'Overcharger', 'Bounty Drone'].indexOf(abilityName) !== -1) {
      openAbilityTargeting(abilityName, p.id);
    }
  }

  function openAbilityTargeting(abilityName, playerId) {
    if (!gameState) return;
    var targetPlayer = playerById(gameState, playerId);
    if (!targetPlayer) return;
    dom.targetingHeader.textContent = 'Use ' + abilityName + ' — Select Target';
    dom.targetingBoard.innerHTML = '';
    dom.btnConfirm.textContent = 'Confirm Ability';
    // Initialize targeting state
    uiState.targeting = {
      action: 'ability',
      abilityName: abilityName,
      targetPlayerId: playerId,
      targetPosition: null,
    };
    var positions = ['active', 'secondary', 'defensive', 'support'];
    positions.forEach(function (pos) {
      var bot = targetPlayer.board[pos];
      if (!bot) return;
      var el = document.createElement('div');
      el.className = 'target-slot';
      el.style.cssText =
        'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;transition:all 0.15s;';
      el.innerHTML = '<strong>' + escHtml(bot.name) + '</strong><br><span class="hp">HP ' + (bot.def || 0) + '</span>';
      el.addEventListener('click', function () {
        uiState.targeting.targetPosition = pos;
        highlightTargetSelection(el, dom.targetingBoard);
        dom.btnConfirm.disabled = false;
      });
      dom.targetingBoard.appendChild(el);
    });
    dom.btnConfirm.disabled = true;
    dom.targetingOverlay.style.display = 'flex';
  }

  function confirmAbility() {
    if (!uiState.targeting || !gameState) return;
    var t = uiState.targeting;
    if (!t.targetPosition) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      dom.targetingOverlay.style.display = 'none';
      var abilityName = t.abilityName;
      var targetPos = t.targetPosition;
      uiState.targeting = null;
      clearUiSelections();
      networkAction({ type: 'USE_ABILITY', abilityName: abilityName, targetPosition: targetPos });
      return;
    }
    var result = Engine.useSupportAbility(gameState, p.id, t.abilityName, t.targetPosition);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    dom.targetingOverlay.style.display = 'none';
    clearUiSelections();
    renderAll(gameState);
    checkWinAfterAction();
  }

  function startSwapFlow() {
    if (!uiState.selectedSlot || !gameState) return;
    // Highlight bench slots for swapping
    uiState.selectedBench = null;
    renderBoard(gameState);
    renderBench(gameState);
    alert('Click a bench slot to swap with the selected bot. Click an occupied bench slot.');
  }

  function onBenchClick(index) {
    var p = getPlayer(gameState);
    if (!p) return;
    if (uiState.selectedSlot) {
      // Swapping from board to bench
      var bot = p.board.bench[index];
      if (!bot) {
        alert('That bench slot is empty. Select a slot with a bot to swap.');
        return;
      }
      if (isNetworkMode()) {
        var slotPos = uiState.selectedSlot;
        clearUiSelections();
        renderAll(gameState);
        renderActionButtons();
        networkAction({ type: 'SWAP_BENCH', benchIndex: index, position: slotPos });
        return;
      }
      var result = Engine.swapBench(gameState, p.id, index, uiState.selectedSlot);
      if (result.error) {
        alert(result.error);
        return;
      }
      gameState = result.newState;
      clearUiSelections();
      renderAll(gameState);
      renderActionButtons();
    }
  }

  function onHandCardClick(card) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    // Toggle selection
    if (uiState.selectedCard === (card._uid || card.id)) {
      uiState.selectedCard = null;
      clearUiSelections();
      renderAll(gameState);
      renderActionButtons();
      return;
    }
    uiState.selectedCard = card._uid || card.id;
    uiState.selectedSlot = null;
    // If instant or trap, handle immediately
    if (isInstantCard(card)) {
      handleInstantPlay(card);
      return;
    }
    if (isTrapCard(card)) {
      handleTrapPlay(card);
      return;
    }
    // For bots, show "Play Here" on slots
    renderAll(gameState);
    renderActionButtons();
  }

  // ── Placement overlay (bot drawn/bought with no room) ──

  function showPlacementOverlay(state) {
    var p = getPlayer(state);
    if (!p || !state.pendingPlacement) return;
    var pp = state.pendingPlacement;
    if (pp.playerId !== p.id) return;
    var card = pp.card;

    dom.placementCardName.textContent = card.name;
    var atk = card.atk != null ? card.atk : 0;
    var def = card.def != null ? card.def : 0;
    dom.placementCardInfo.textContent = card.category + ' — ATK ' + atk + ' / HP ' + def + ' — ' + (card.effect || '');
    dom.placementOptions.innerHTML = '';

    // Swap targets: matching position bot + bench bots
    var targets = [];
    var matchPos = card.category.toLowerCase();
    if (p.board[matchPos]) {
      targets.push({ label: p.board[matchPos].name + ' (' + matchPos + ')', type: 'position', position: matchPos });
    }
    for (var i = 0; i < 6; i++) {
      if (p.board.bench[i]) {
        targets.push({ label: p.board.bench[i].name + ' (bench ' + (i+1) + ')', type: 'bench', index: i });
      }
    }

    targets.forEach(function(t) {
      var btn = document.createElement('button');
      btn.className = 'placement-swap-btn';
      btn.textContent = 'Swap with ' + t.label;
      btn.addEventListener('click', function () {
        resolvePlacement('swap', t);
      });
      dom.placementOptions.appendChild(btn);
    });

    dom.btnPlacementDiscard.onclick = function () { resolvePlacement('discard', null); };
    dom.placementOverlay.style.display = 'flex';
  }

  function resolvePlacement(choice, swapTarget) {
    dom.placementOverlay.style.display = 'none';
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      networkAction({ type: 'RESOLVE_PLACEMENT', choice: choice, swapTarget: swapTarget });
      return;
    }
    var result = Engine.resolveBotPlacement(gameState, p.id, choice, swapTarget);
    if (result.error) { alert(result.error); return; }
    gameState = result.newState;
    renderAll(gameState);
    renderActionButtons();
    // If there's still a pending placement (unlikely), show overlay again
    if (gameState.pendingPlacement) showPlacementOverlay(gameState);
  }

  function handleInstantPlay(card) {
    var p = getPlayer(gameState);
    if (!p) return;
    // Some instants need targets
    if (['Scrap Bomb', 'Overdrive', 'Hack', 'EMP Blast', 'System Shock'].indexOf(card.name) !== -1) {
      uiState.selectedCard = card._uid || card.id;
      openInstantTargeting(card);
      return;
    }
    // Self-targeting instants: play immediately
    if (isNetworkMode()) {
      clearUiSelections();
      networkAction({ type: 'PLAY_INSTANT', cardId: (card._uid || card.id), targets: [] });
      return;
    }
    var result = Engine.playInstant(gameState, p.id, (card._uid || card.id), []);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
  }

  function handleTrapPlay(card) {
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      clearUiSelections();
      networkAction({ type: 'PLAY_TRAP', cardId: (card._uid || card.id) });
      return;
    }
    var result = Engine.playTrap(gameState, p.id, (card._uid || card.id));
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
  }

  function openInstantTargeting(card) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    dom.targetingHeader.textContent = 'Play ' + card.name + ' — Select Targets';
    dom.targetingBoard.innerHTML = '';
    // Show all enemy board positions as selectable
    var opponents = getOpponents(gameState);
    var allTargets = [];
    opponents.forEach(function (opp) {
      var positions = ['active', 'secondary', 'defensive', 'support'];
      positions.forEach(function (pos) {
        var bot = opp.board[pos];
        if (!bot) return;
        allTargets.push({ playerId: opp.id, position: pos, bot: bot, playerName: opp.name });
      });
    });
    // Also show own positions (for Overdrive buff)
    if (card.name === 'Overdrive') {
      var positions = ['active', 'secondary', 'defensive', 'support'];
      positions.forEach(function (pos) {
        var bot = p.board[pos];
        if (!bot) return;
        allTargets.push({ playerId: p.id, position: pos, bot: bot, playerName: p.name + ' (you)' });
      });
    }
    if (allTargets.length === 0) {
      dom.targetingBoard.innerHTML = '<p>No valid targets available.</p>';
    }
    var selectedTargets = [];
    allTargets.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'target-slot';
      el.style.cssText =
        'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;';
      el.innerHTML = '<strong>' + escHtml(t.bot.name) + '</strong> (' + escHtml(t.playerName) + ')<br>HP ' + (t.bot.def || 0);
      el.addEventListener('click', function () {
        if (card.name === 'EMP Blast') {
          // Multi-select up to 3
          var idx = selectedTargets.findIndex(function (st) { return st.playerId === t.playerId && st.position === t.position; });
          if (idx !== -1) {
            selectedTargets.splice(idx, 1);
            el.classList.remove('selected');
          } else if (selectedTargets.length < 3) {
            selectedTargets.push({ playerId: t.playerId, position: t.position });
            el.classList.add('selected');
          }
        } else {
          // Single select
          selectedTargets.length = 0;
          selectedTargets.push({ playerId: t.playerId, position: t.position });
          highlightTargetSelection(el, dom.targetingBoard);
        }
        dom.btnConfirm.disabled = selectedTargets.length === 0;
      });
      dom.targetingBoard.appendChild(el);
    });
    dom.btnConfirm.disabled = true;
    // Wire confirm via unified dispatch
    uiState.targeting = {
      action: 'instant',
      _instantConfirm: function () {
        confirmInstant(card, selectedTargets);
      },
    };
    dom.targetingOverlay.style.display = 'flex';
  }

  function confirmInstant(card, targets) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      dom.targetingOverlay.style.display = 'none';
      uiState.targeting = null;
      clearUiSelections();
      networkAction({ type: 'PLAY_INSTANT', cardId: (card._uid || card.id), targets: targets });
      return;
    }
    var result = Engine.playInstant(gameState, p.id, (card._uid || card.id), targets);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    dom.targetingOverlay.style.display = 'none';
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
    checkWinAfterAction();
  }

  function playCardToPosition(cardId, position) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      clearUiSelections();
      networkAction({ type: 'PLAY_BOT', cardId: cardId, position: position });
      return;
    }
    var result = Engine.playBotToPosition(gameState, p.id, cardId, position);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
  }

  function buyMarketCard(index) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      clearUiSelections();
      networkAction({ type: 'BUY_MARKET', marketIndex: index });
      return;
    }
    var result = Engine.buyFromMarket(gameState, p.id, index);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
  }

  function onEnemyClick(enemyId) {
    if (!gameState) return;
    // If in attack targeting mode, open targeting overlay
    if (uiState.targeting && uiState.targeting.action === 'attack') {
      openTargetingOverlay(enemyId);
      return;
    }
    // Otherwise, just show info
    var opp = playerById(gameState, enemyId);
    if (opp) {
      alert(opp.name + ': Base ' + opp.baseHP + ' HP, ' + countBotsOnBoard(opp) + ' bots on board, ' + opp.hand.length + ' cards in hand');
    }
  }

  function doEndTurn() {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    if (isNetworkMode()) {
      clearUiSelections();
      sendMessage({ type: 'END_TURN', playerId: uiState.networkPlayerId });
      return;
    }
    var result = Engine.endTurn(gameState, p.id);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
    // Show pass-device overlay in shared mode
    if (uiState.mode === 'shared') {
      var nextPlayer = getPlayer(gameState);
      dom.passPlayer.textContent = nextPlayer ? nextPlayer.name : '?';
      dom.passOverlay.style.display = 'flex';
    }
  }

  function checkWinAfterAction() {
    if (!gameState) return;
    var result = Engine.checkWin(gameState);
    if (result.winner) {
      var loser = gameState.players.find(function (p) { return p.id !== result.winner.id; });
      displayVictoryWithScavenge(result.winner, loser);
    }
  }

  function displayVictoryWithScavenge(winner, loser) {
    // Clean up any previous scavenge UI elements
    var oldOpts = document.getElementById('scavenge-options');
    if (oldOpts) oldOpts.remove();
    var oldSkip = document.getElementById('scavenge-skip');
    if (oldSkip) oldSkip.remove();
    dom.btnPlayAgain.style.display = 'none';

    dom.victoryText.textContent = winner.name + ' Wins! Scavenge a bot from ' + loser.name + '\'s board.';

    var optionsDiv = document.createElement('div');
    optionsDiv.id = 'scavenge-options';
    optionsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:16px 0;';

    var positions = ['active', 'secondary', 'defensive', 'support'];
    var hasBots = false;

    positions.forEach(function (pos) {
      var bot = loser.board[pos];
      if (bot) {
        hasBots = true;
        var btn = document.createElement('button');
        btn.textContent = bot.name + ' (' + pos + ')';
        btn.addEventListener('click', function () {
          doScavenge(winner.id, loser.id, pos);
        });
        optionsDiv.appendChild(btn);
      }
    });

    // Bench: show first available bot (engine.scavenge picks first bench slot)
    var benchBot = null;
    for (var bi = 0; bi < loser.board.bench.length; bi++) {
      if (loser.board.bench[bi]) { benchBot = loser.board.bench[bi]; break; }
    }
    if (benchBot) {
      hasBots = true;
      var benchBtn = document.createElement('button');
      benchBtn.textContent = benchBot.name + ' (bench)';
      benchBtn.addEventListener('click', function () {
        doScavenge(winner.id, loser.id, 'bench');
      });
      optionsDiv.appendChild(benchBtn);
    }

    if (!hasBots) {
      optionsDiv.innerHTML = '<p style="color:var(--muted);margin:8px 0;">No bots available to scavenge.</p>';
    }

    dom.victoryScreen.insertBefore(optionsDiv, dom.btnPlayAgain);

    var skipBtn = document.createElement('button');
    skipBtn.id = 'scavenge-skip';
    skipBtn.textContent = hasBots ? 'Skip Scavenge' : 'OK';
    skipBtn.addEventListener('click', function () {
      var opts = document.getElementById('scavenge-options');
      if (opts) opts.remove();
      this.remove();
      dom.btnPlayAgain.style.display = 'inline-block';
      dom.victoryText.textContent = winner.name + ' Wins!';
    });
    dom.victoryScreen.insertBefore(skipBtn, dom.btnPlayAgain);

    dom.victoryScreen.style.display = 'flex';
  }

  function doScavenge(winnerId, loserId, position) {
    if (isNetworkMode()) {
      networkAction({ type: 'SCAVENGE', loserId: loserId, position: position });
      var opts = document.getElementById('scavenge-options');
      if (opts) opts.remove();
      var skipBtn = document.getElementById('scavenge-skip');
      if (skipBtn) skipBtn.remove();
      dom.btnPlayAgain.style.display = 'inline-block';
      dom.victoryText.textContent = 'Scavenging...';
      return;
    }
    var result = Engine.scavenge(gameState, winnerId, loserId, position);
    gameState = result.newState;
    var opts = document.getElementById('scavenge-options');
    if (opts) opts.remove();
    var skipBtn = document.getElementById('scavenge-skip');
    if (skipBtn) skipBtn.remove();
    var winner = gameState.players.find(function (p) { return p.id === winnerId; });
    dom.victoryText.textContent = winner.name + ' scavenged a bot!';
    dom.btnPlayAgain.style.display = 'inline-block';
  }

  // ========== NETWORK MODE ==========

  function isNetworkMode() {
    return uiState.mode === 'network';
  }

  function isMyTurn() {
    if (!isNetworkMode()) return true;
    if (!gameState) return false;
    return gameState.activePlayer === uiState.networkPlayerId;
  }

  function getWsUrl() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + location.host;
  }

  function connectWebSocket() {
    if (uiState.ws && uiState.ws.readyState === WebSocket.OPEN) return;
    var url = getWsUrl();
    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      alert('Cannot connect to game server. Make sure the server is running with: npm start');
      return;
    }
    uiState.ws = ws;

    ws.onopen = function () {
      uiState.connected = true;
      uiState.wasConnected = true;
      uiState.reconnecting = false;
      hideReconnectNotice();
      console.log('[ws] connected to ' + url);
    };

    ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      try {
        handleServerMessage(msg);
      } catch (e) {
        console.error('[ws] error handling message:', e);
      }
    };

    ws.onclose = function (evt) {
      uiState.connected = false;
      uiState.ws = null;
      console.log('[ws] disconnected, code=' + evt.code + ' reason=' + evt.reason);
      if (!uiState.reconnecting) {
        showReconnectNotice();
      }
    };

    ws.onerror = function (err) {
      console.error('[ws] connection error — server may not be running');
    };
  }

  function sendMessage(msg) {
    if (uiState.ws && uiState.ws.readyState === WebSocket.OPEN) {
      uiState.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function networkAction(actionData) {
    return sendMessage({
      type: 'PLAYER_ACTION',
      playerId: uiState.networkPlayerId,
      action: actionData,
    });
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'ROOM_CREATED':
        uiState.networkRoomCode = msg.code;
        uiState.networkPlayerId = msg.playerId;
        uiState.isHost = true;
        dom.joinCode.value = msg.code;
        dom.joinCode.disabled = true;
        dom.playerName.disabled = true;
        dom.btnHost.style.display = 'none';
        dom.btnJoin.style.display = 'none';
        dom.btnShared.style.display = 'none';
        updateLobbyPlayers(msg.players);
        dom.btnStart.style.display = 'block';
        console.log('[ws] room created: ' + msg.code);
        break;

      case 'JOIN_SUCCESS':
        uiState.networkRoomCode = msg.code;
        uiState.networkPlayerId = msg.playerId;
        uiState.isHost = false;
        dom.joinCode.value = msg.code;
        dom.joinCode.disabled = true;
        dom.playerName.disabled = true;
        dom.btnHost.style.display = 'none';
        dom.btnJoin.style.display = 'none';
        dom.btnShared.style.display = 'none';
        updateLobbyPlayers(msg.players);
        console.log('[ws] joined room: ' + msg.code + ' as player ' + msg.playerId);
        break;

      case 'PLAYER_JOINED':
        updateLobbyPlayers(msg.players);
        break;

      case 'STATE_UPDATE':
        gameState = msg.state;
        uiState.mode = 'network';
        clearUiSelections();
        if (gameState.phase === 'auction') {
          // Show auction screen
          hideAuctionScreen();
          showAuctionScreen();
          dom.lobby.style.display = 'none';
          dom.gameScreen.style.display = 'none';
          dom.victoryScreen.style.display = 'none';
          dom.passOverlay.style.display = 'none';
          dom.targetingOverlay.style.display = 'none';
          dom.logPanel.style.display = 'none';
          renderAuction(gameState);
        } else {
          hideAuctionScreen();
          dom.lobby.style.display = 'none';
          dom.gameScreen.style.display = 'block';
          dom.victoryScreen.style.display = 'none';
          dom.passOverlay.style.display = 'none';
          dom.targetingOverlay.style.display = 'none';
          dom.logPanel.style.display = 'none';
          renderAll(gameState);
          renderActionButtons();
        }
        break;

      case 'GAME_OVER':
        gameState = msg.state;
        renderAll(gameState);
        renderActionButtons();
        if (msg.winner.id === uiState.networkPlayerId) {
          var loser = gameState.players.find(function (p) { return p.id !== msg.winner.id; });
          displayVictoryWithScavenge(msg.winner, loser);
        } else {
          dom.victoryText.textContent = msg.winner.name + ' Wins!';
          dom.btnPlayAgain.style.display = 'inline-block';
          dom.victoryScreen.style.display = 'flex';
        }
        break;

      case 'PLAYER_DISCONNECTED':
      case 'PLAYER_LEFT':
        updateLobbyPlayers(msg.players);
        if (gameState && uiState.mode === 'network') {
          // Show a brief status notification
          var statusLabel = dom.statusBar.querySelector('.turn-label');
          if (statusLabel && msg.name) {
            statusLabel.textContent = msg.name + ' disconnected';
            statusLabel.style.color = '#e74c3c';
            setTimeout(function () {
              if (statusLabel) {
                statusLabel.style.color = 'var(--accent)';
                if (gameState) {
                  var p = getPlayer(gameState);
                  statusLabel.textContent = p ? p.name + '\'s Turn' : '';
                }
              }
            }, 3000);
          }
        }
        break;

      case 'ROOM_INFO':
        uiState.networkRoomCode = msg.code;
        updateLobbyPlayers(msg.players);
        if (msg.started && msg.playerId) {
          // Reconnecting to an in-progress game
          uiState.networkPlayerId = msg.playerId;
        }
        break;

      case 'ERROR':
        alert('Server: ' + (msg.error || 'Unknown error'));
        break;

      default:
        console.log('[ws] unhandled message type:', msg.type);
    }
  }

  function updateLobbyPlayers(players) {
    if (!dom.lobbyPlayers) return;
    dom.lobbyPlayers.innerHTML = '';
    var heading = document.createElement('h3');
    heading.textContent = 'Players in Room';
    heading.style.cssText = 'margin:12px 0 6px;';
    dom.lobbyPlayers.appendChild(heading);
    players.forEach(function (p) {
      var div = document.createElement('div');
      div.style.cssText = 'padding:4px 0;font-size:14px;';
      div.textContent = (p.id === 1 ? '[Host] ' : '') + p.name +
        (p.connected ? '' : ' (disconnected)');
      dom.lobbyPlayers.appendChild(div);
    });
    // Show start button for host when enough players
    if (uiState.isHost && players.length >= 2) {
      dom.btnStart.style.display = 'block';
    } else if (uiState.isHost) {
      dom.btnStart.style.display = 'none';
    }
  }

  function showReconnectNotice() {
    // Only show if we were previously connected (avoid showing on initial failed connection)
    if (!uiState.wasConnected) return;
    if (dom.reconnectOverlay) {
      dom.reconnectOverlay.style.display = 'flex';
      var retryBtn = document.getElementById('btn-reconnect-retry');
      if (retryBtn) {
        retryBtn.onclick = function () {
          uiState.reconnecting = true;
          connectWebSocket();
          // After connecting, rejoin the room
          setTimeout(function () {
            if (uiState.connected && uiState.networkRoomCode && uiState.networkPlayerId) {
              sendMessage({
                type: 'GET_ROOM',
                code: uiState.networkRoomCode,
              });
            }
          }, 500);
        };
      }
    }
  }

  function hideReconnectNotice() {
    if (dom.reconnectOverlay) {
      dom.reconnectOverlay.style.display = 'none';
    }
  }

  // ========== NETWORK LOBBY FLOWS ==========

  function startHostGame() {
    var name = (dom.playerName.value || '').trim();
    if (!name) {
      name = prompt('Enter your name:', 'Host');
      if (!name) return;
      dom.playerName.value = name;
    }
    uiState.mode = 'network';
    uiState.networkPlayerId = null;
    uiState.networkRoomCode = null;
    uiState.isHost = true;
    connectWebSocket();
    // Wait for connection, then send HOST_GAME
    waitForConnection(function () {
      sendMessage({ type: 'HOST_GAME', name: name });
    });
  }

  function startJoinGame() {
    var code = (dom.joinCode.value || '').trim().toUpperCase();
    if (!code || !/^[A-Z]{4}$/.test(code)) {
      code = prompt('Enter room code (4 letters):', '');
      if (!code) return;
      code = code.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) {
        alert('Room code must be 4 letters.');
        return;
      }
      dom.joinCode.value = code;
    }
    var name = (dom.playerName.value || '').trim();
    if (!name) {
      name = prompt('Enter your name:', 'Player');
      if (!name) return;
      dom.playerName.value = name;
    }
    uiState.mode = 'network';
    uiState.networkPlayerId = null;
    uiState.networkRoomCode = code;
    uiState.isHost = false;
    connectWebSocket();
    waitForConnection(function () {
      sendMessage({ type: 'JOIN_GAME', code: code, name: name });
    });
  }

  function startNetworkGame() {
    if (!uiState.isHost || !uiState.connected) return;
    sendMessage({ type: 'START_GAME' });
  }

  function waitForConnection(cb) {
    if (uiState.ws && uiState.ws.readyState === WebSocket.OPEN) {
      cb();
      return;
    }
    var attempts = 0;
    var maxAttempts = 50; // 5 seconds at 100ms
    var interval = setInterval(function () {
      attempts++;
      if (uiState.ws && uiState.ws.readyState === WebSocket.OPEN) {
        clearInterval(interval);
        cb();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        alert('Could not connect to server. Is it running?');
      }
    }, 100);
  }

  // ========== AUCTION ==========

  function showAuctionScreen() {
    var as = document.getElementById('auction-screen');
    if (as) as.style.display = 'block';
  }

  function hideAuctionScreen() {
    var as = document.getElementById('auction-screen');
    if (as) as.style.display = 'none';
  }

  function onBidChange() {
    var inp = document.getElementById('bid-amount');
    var p = getCurrentPlayer();
    if (p && inp) {
      var max = p.biddingChips || 0;
      if (parseInt(inp.value) > max) inp.value = max;
      if (parseInt(inp.value) < 0) inp.value = 0;
    }
  }

  // Track which player is currently bidding (shared-screen auction)
  var _auctionBidder = 0;

  function submitPlayerBid() {
    var inp = document.getElementById('bid-amount');
    var amount = parseInt(inp.value) || 0;
    if (!gameState || gameState.phase !== 'auction') return;

    // Network mode: send bid via WebSocket, server updates state
    if (isNetworkMode()) {
      networkAction({ type: 'SUBMIT_BID', amount: amount });
      inp.value = 0;
      var status = document.getElementById('bid-status');
      if (status) status.textContent = 'Bid submitted. Waiting for others...';
      return;
    }

    // Shared mode
    var currentBidder;
    var alive = gameState.players.filter(function (p) { return p.baseHP > 0; });
    var nextToBid = null;
    for (var i = 0; i < alive.length; i++) {
      if (gameState.bids[alive[i].id] === undefined) {
        nextToBid = alive[i].id;
        break;
      }
    }
    if (!nextToBid) { nextToBid = alive[0].id; }
    currentBidder = nextToBid;

    var result = Engine.submitBid(gameState, currentBidder, amount);
    gameState = result.newState;
    inp.value = 0;
    var status = document.getElementById('bid-status');
    if (status) {
      status.textContent = result.tie ? 'Tie! Re-bid between tied players.' : (currentBidder === 1 ? 'Player 1 bid. Pass to Player 2.' : 'Bid submitted. Resolving...');
    }
    renderAuction(gameState);
    if (gameState.phase === 'playing') {
      hideAuctionScreen();
      dom.gameScreen.style.display = 'block';
      renderAll(gameState);
    }
  }

  function getCurrentPlayer() {
    if (!gameState) return null;
    return gameState.players.find(function (p) { return p.id === gameState.activePlayer; }) || gameState.players[0];
  }

  function getCurrentPlayerId() {
    if (!gameState) return 1;
    return gameState.activePlayer;
  }

  function renderAuction(state) {
    if (!state || state.phase !== 'auction') return;
    var card = state.currentAuctionCard;
    // Update round info
    var roundEl = document.getElementById('auction-round-info');
    if (roundEl) roundEl.textContent = 'Round ' + (state.auctionRound + 1) + ' of ' + state.totalAuctionRounds;

    // Card display
    var imgEl = document.getElementById('auction-card-img');
    var nameEl = document.getElementById('auction-card-name');
    var effectEl = document.getElementById('auction-card-effect');
    var statsEl = document.getElementById('auction-card-stats');
    if (imgEl && card && card.image) {
      imgEl.src = card.image;
      imgEl.alt = card.name;
      imgEl.style.display = 'block';
      imgEl.onerror = function () { imgEl.style.display = 'none'; };
    } else if (imgEl) {
      imgEl.style.display = 'none';
    }
    if (nameEl && card) nameEl.textContent = card.name;
    if (effectEl && card) effectEl.textContent = card.effect || '';
    if (statsEl && card) {
      var parts = [];
      if (card.type === 'card') { parts.push('Cost: ' + card.cost); if (card.atk) parts.push('ATK: ' + card.atk); if (card.def) parts.push('HP: ' + card.def); }
      if (card.type === 'token') parts.push('HP: ' + card.hp);
      statsEl.textContent = parts.join(' · ');
    }

    // Player list with chips and bid status
    var listEl = document.getElementById('auction-player-list');
    if (listEl) {
      listEl.innerHTML = '';
      state.players.forEach(function (p) {
        var div = document.createElement('div');
        div.className = 'auction-player';
        var bid = state.bids[p.id] !== undefined ? state.bids[p.id] : '?';
        div.innerHTML = '<div class="name">' + p.name + '</div>' +
          '<div class="chips">Chips: ' + p.biddingChips + '</div>' +
          '<div class="status">Bid: ' + bid + '</div>';
        listEl.appendChild(div);
      });
    }

    // Bid input max
    var inp = document.getElementById('bid-amount');
    var p = getCurrentPlayer();
    if (inp && p) inp.max = p.biddingChips;

    // Auction log
    var logEl = document.getElementById('auction-log');
    if (logEl && state.turnLog) {
      var recent = state.turnLog.slice(-6);
      logEl.innerHTML = recent.map(function (e) { return '<div>' + e.msg + '</div>'; }).join('');
    }

    // In shared mode, show bid area for all players
    var bidArea = document.getElementById('auction-bid-area');
    if (bidArea) bidArea.style.display = 'block';
  }

  // ========== GAME INIT ==========

  function startSharedGame() {
    uiState.mode = 'shared';
    var name1 = prompt('Enter Player 1 name:', 'Player 1');
    if (!name1) return;
    var name2 = prompt('Enter Player 2 name:', 'Player 2');
    if (!name2) return;
    gameState = Engine.createGame([name1.trim() || 'Player 1', name2.trim() || 'Player 2'], 'shared');
    clearUiSelections();
    dom.lobby.style.display = 'none';
    dom.gameScreen.style.display = 'none';
    dom.victoryScreen.style.display = 'none';
    dom.passOverlay.style.display = 'none';
    dom.targetingOverlay.style.display = 'none';
    dom.logPanel.style.display = 'none';
    // Show auction screen
    showAuctionScreen();
    renderAuction(gameState);
  }

  // ========== EVENT WIRING ==========

  function wireEvents() {
    // Lobby
    dom.btnShared.addEventListener('click', startSharedGame);
    dom.btnHost.addEventListener('click', startHostGame);
    dom.btnJoin.addEventListener('click', startJoinGame);
    dom.btnStart.addEventListener('click', startNetworkGame);

    // Board slots
    var positions = ['active', 'secondary', 'defensive', 'support'];
    positions.forEach(function (pos) {
      var slot = dom.board.querySelector('.slot[data-slot="' + pos + '"]');
      if (slot) {
        slot.addEventListener('click', function () {
          onSlotClick(pos);
        });
      }
    });

    // End turn
    dom.btnEndTurn.addEventListener('click', doEndTurn);

    // Log panel
    dom.btnLog.addEventListener('click', function () {
      renderLog();
      dom.logPanel.style.display = 'block';
    });
    dom.btnCloseLog.addEventListener('click', function () {
      dom.logPanel.style.display = 'none';
    });

    // Pass overlay — tap anywhere to dismiss
    dom.passOverlay.addEventListener('click', function () {
      dom.passOverlay.style.display = 'none';
    });
    dom.btnContinue.addEventListener('click', function (e) {
      e.stopPropagation();
      dom.passOverlay.style.display = 'none';
    });
    // Don't dismiss when clicking inside the content box itself
    var passContent = dom.passOverlay.querySelector('#pass-content');
    if (passContent) {
      passContent.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    // Targeting overlay
    dom.btnBack.addEventListener('click', function () {
      dom.targetingOverlay.style.display = 'none';
      uiState.targeting = null;
      uiState.selectedCard = null;
    });
    dom.btnConfirm.addEventListener('click', function () {
      // Use dynamic handler if set, else dispatch by targeting action
      if (uiState.targeting) {
        if (uiState.targeting.action === 'attack') {
          confirmAttack();
        } else if (uiState.targeting.action === 'ability') {
          confirmAbility();
        } else if (uiState.targeting.action === 'instant') {
          // Instant confirm handled via storage on uiState
          if (uiState.targeting._instantConfirm) {
            uiState.targeting._instantConfirm();
          }
        }
      }
    });

    // Victory screen
    dom.btnPlayAgain.addEventListener('click', function () {
      dom.victoryScreen.style.display = 'none';
      dom.gameScreen.style.display = 'none';
      dom.lobby.style.display = 'block';
      gameState = null;
      clearUiSelections();
      // Clean up scavenge UI elements
      var oldOpts = document.getElementById('scavenge-options');
      if (oldOpts) oldOpts.remove();
      var oldSkip = document.getElementById('scavenge-skip');
      if (oldSkip) oldSkip.remove();
      dom.btnPlayAgain.style.display = 'inline-block';
      uiState.winnerId = null;
      uiState.loserId = null;
      // Reset network state if returning from network game
      if (uiState.mode === 'network') {
        uiState.mode = 'shared';
        uiState.networkPlayerId = null;
        uiState.networkRoomCode = null;
        uiState.isHost = false;
        // Reset lobby UI
        dom.btnHost.style.display = '';
        dom.btnJoin.style.display = '';
        dom.btnShared.style.display = '';
        dom.btnStart.style.display = 'none';
        dom.joinCode.value = '';
        dom.joinCode.disabled = false;
        dom.playerName.value = '';
        dom.playerName.disabled = false;
        dom.lobbyPlayers.innerHTML = '';
        hideReconnectNotice();
      }
    });
  }

  // ========== AUCTION EVENT WIRING ==========
  function wireAuctionEvents() {
    var btnSubmitBid = document.getElementById('btn-submit-bid');
    if (btnSubmitBid) {
      btnSubmitBid.addEventListener('click', submitPlayerBid);
    }
    var bidInp = document.getElementById('bid-amount');
    if (bidInp) {
      bidInp.addEventListener('input', onBidChange);
      bidInp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitPlayerBid();
      });
    }
  }

  // ========== IMAGE PRELOADER ==========
  var _preloadStarted = false;
  var _preloadCount = 0;
  var _preloadTotal = 0;

  function preloadImages() {
    if (_preloadStarted) return;
    _preloadStarted = true;
    var all = Engine.loadCards();
    var urls = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].image && urls.indexOf(all[i].image) === -1) {
        urls.push(all[i].image);
      }
    }
    _preloadTotal = urls.length;
    if (!_preloadTotal) return;
    for (var j = 0; j < urls.length; j++) {
      var img = new Image();
      img.onload = function () {
        _preloadCount++;
      };
      img.onerror = function () {
        _preloadCount++;
      };
      img.src = urls[j];
    }
  }

  // ========== BOOT ==========
  function init() {
    cacheDom();
    wireEvents();
    wireAuctionEvents();
    preloadImages();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
