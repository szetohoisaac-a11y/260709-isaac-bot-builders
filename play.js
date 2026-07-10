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
    dom.enemyBoxes = $('#enemy-boxes');
    dom.passOverlay = $('#pass-overlay');
    dom.passPlayer = $('#pass-player');
    dom.btnContinue = $('#btn-continue');
    dom.targetingOverlay = $('#targeting-overlay');
    dom.targetingHeader = $('#targeting-header');
    dom.btnBack = $('#btn-back');
    dom.targetingBoard = $('#targeting-board');
    dom.btnConfirm = $('#btn-confirm');
    dom.logPanel = $('#log-panel');
    dom.logEntries = $('#log-entries');
    dom.btnCloseLog = $('#btn-close-log');
    dom.victoryScreen = $('#victory-screen');
    dom.victoryText = $('#victory-text');
    dom.btnPlayAgain = $('#btn-play-again');
    dom.btnShared = $('#btn-shared');
    dom.statusBar = $('#status-bar');
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
    var all = Engine.loadCards();
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

  // ========== RENDER FUNCTIONS ==========

  function renderAll(state) {
    gameState = state;
    renderStatus(state);
    renderBoard(state);
    renderBench(state);
    renderHand(state);
    renderMarket(state);
    renderEnemies(state);
    // NOTE: callers are responsible for clearUiSelections() before/after as appropriate.
    // Some flows (e.g. selecting a hand card) need selections to survive the render pass.
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
    label.textContent = p.name + '\'s Turn';
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
        cardDiv.innerHTML =
          '<div class="bot-name">' + escHtml(bot.name) + '</div>' +
          '<span class="atk">ATK ' + atk + '</span> ' +
          '<span class="hp">HP ' + def + '</span>';
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
        if (card && isBotCard(card)) {
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
        chip.textContent = bot.name;
        chip.title = bot.name + ' | ATK ' + (bot.atk || 0) + ' HP ' + (bot.def || 0);
        chip.classList.add(botCategoryClass(bot.category));
      } else {
        chip.textContent = '—';
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
    drawBtn.disabled = p.ap < 1;
    drawBtn.addEventListener('click', function () {
      if (!gameState) return;
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
      cardEl.innerHTML =
        '<strong>' + escHtml(card.name) + '</strong>' +
        ' <span class="cost">(' + cost + 'c)</span>' +
        (atk > 0 ? ' <span class="atk">ATK ' + atk + '</span>' : '') +
        (def > 0 ? ' <span class="hp">HP ' + def + '</span>' : '') +
        '<div style="font-size:10px;color:var(--muted)">' + escHtml(card.effect || '') + '</div>';
      cardEl.title = card.effect || '';
      cardEl.addEventListener('click', function () {
        onHandCardClick(card);
      });
      if (uiState.selectedCard === card.id) cardEl.classList.add('selected');
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
      cardEl.innerHTML =
        '<strong>' + escHtml(card.name) + '</strong>' +
        ' <span class="cost">' + cost + ' credits</span>' +
        '<div style="font-size:10px;color:var(--muted)">' + escHtml(card.effect || '') + '</div>';
      cardEl.addEventListener('click', function () {
        buyMarketCard(idx);
      });
      dom.marketCards.appendChild(cardEl);
    });
  }

  function renderEnemies(state) {
    var p = getPlayer(state);
    if (!p) return;
    var opponents = getOpponents(state);
    dom.enemyBoxes.innerHTML = '';
    opponents.forEach(function (opp) {
      var box = document.createElement('div');
      box.className = 'enemy-box';
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
    var recent = log.slice(-30).reverse();
    recent.forEach(function (entry) {
      var div = document.createElement('div');
      div.textContent = (entry.msg || '');
      dom.logEntries.appendChild(div);
    });
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

  // ========== TARGETING OVERLAY ==========

  function openTargetingOverlay(targetPlayerId) {
    if (!gameState) return;
    var targetPlayer = playerById(gameState, targetPlayerId);
    if (!targetPlayer) return;
    uiState.targeting = {
      action: 'attack',
      botPosition: uiState.selectedSlot,
      targetPlayerId: targetPlayerId,
      targetType: null,
      targetPosition: null,
    };
    dom.targetingHeader.textContent = 'Target: ' + targetPlayer.name;
    dom.targetingBoard.innerHTML = '';
    var positions = ['active', 'secondary', 'defensive', 'support'];
    // Show enemy board positions
    positions.forEach(function (pos) {
      var bot = targetPlayer.board[pos];
      var el = document.createElement('div');
      el.className = 'target-slot';
      el.style.cssText =
        'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;';
      if (bot) {
        el.innerHTML = '<strong>' + escHtml(bot.name) + '</strong><br>ATK ' + (bot.atk || 0) + ' HP ' + (bot.def || 0);
      } else {
        el.innerHTML = '<em>empty</em>';
      }
      el.addEventListener('click', function () {
        // Select this position
        uiState.targeting.targetType = 'bot';
        uiState.targeting.targetPosition = pos;
        highlightTargetSelection(el, dom.targetingBoard);
        dom.btnConfirm.disabled = false;
      });
      if (uiState.targeting.targetPosition === pos && uiState.targeting.targetType === 'bot') {
        el.classList.add('selected');
      }
      dom.targetingBoard.appendChild(el);
    });
    // Base target
    var baseEl = document.createElement('div');
    baseEl.className = 'target-slot';
    baseEl.style.cssText =
      'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;';
    baseEl.innerHTML = '<strong>Attack Base</strong><br><span class="hp">HP: ' + targetPlayer.baseHP + '</span>';
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
    var positions = ['active', 'secondary', 'defensive', 'support'];
    positions.forEach(function (pos) {
      var bot = targetPlayer.board[pos];
      if (!bot) return;
      var el = document.createElement('div');
      el.className = 'target-slot';
      el.style.cssText =
        'border:2px solid var(--rule);border-radius:8px;padding:8px;margin:4px;cursor:pointer;background:#fff;';
      el.innerHTML = '<strong>' + escHtml(bot.name) + '</strong><br>HP ' + (bot.def || 0);
      el.addEventListener('click', function () {
        uiState.targeting = {
          action: 'ability',
          abilityName: abilityName,
          targetPlayerId: playerId,
          targetPosition: pos,
        };
        highlightTargetSelection(el, dom.targetingBoard);
        dom.btnConfirm.disabled = false;
      });
      dom.targetingBoard.appendChild(el);
    });
    dom.btnConfirm.disabled = true;
    // Override confirm for ability
    dom.btnConfirm.onclick = confirmAbility;
    dom.targetingOverlay.style.display = 'flex';
  }

  function confirmAbility() {
    if (!uiState.targeting || !gameState) return;
    var t = uiState.targeting;
    if (!t.targetPosition) return;
    var p = getPlayer(gameState);
    if (!p) return;
    var result = Engine.useSupportAbility(gameState, p.id, t.abilityName, t.targetPosition);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    dom.targetingOverlay.style.display = 'none';
    clearUiSelections();
    renderAll(gameState);
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
    if (uiState.selectedCard === card.id) {
      uiState.selectedCard = null;
      clearUiSelections();
      renderAll(gameState);
      renderActionButtons();
      return;
    }
    uiState.selectedCard = card.id;
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

  function handleInstantPlay(card) {
    var p = getPlayer(gameState);
    if (!p) return;
    // Some instants need targets
    if (['Scrap Bomb', 'Overdrive', 'Hack', 'EMP Blast', 'System Shock'].indexOf(card.name) !== -1) {
      uiState.selectedCard = card.id;
      openInstantTargeting(card);
      return;
    }
    // Self-targeting instants: play immediately
    var result = Engine.playInstant(gameState, p.id, card.id, []);
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
    var result = Engine.playTrap(gameState, p.id, card.id);
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
    dom.btnConfirm.onclick = function () {
      confirmInstant(card, selectedTargets);
    };
    dom.targetingOverlay.style.display = 'flex';
  }

  function confirmInstant(card, targets) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
    var result = Engine.playInstant(gameState, p.id, card.id, targets);
    if (result.error) {
      alert(result.error);
      return;
    }
    gameState = result.newState;
    dom.targetingOverlay.style.display = 'none';
    clearUiSelections();
    renderAll(gameState);
    renderActionButtons();
  }

  function playCardToPosition(cardId, position) {
    if (!gameState) return;
    var p = getPlayer(gameState);
    if (!p) return;
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
      dom.victoryText.textContent = result.winner.name + ' Wins!';
      dom.victoryScreen.style.display = 'flex';
    }
  }

  // ========== GAME INIT ==========

  function startSharedGame() {
    var name1 = prompt('Enter Player 1 name:', 'Player 1');
    if (!name1) return;
    var name2 = prompt('Enter Player 2 name:', 'Player 2');
    if (!name2) return;
    var state = Engine.createGame([name1.trim() || 'Player 1', name2.trim() || 'Player 2'], 'shared');
    var startResult = Engine.startTurn(state);
    gameState = startResult.newState;
    clearUiSelections();
    dom.lobby.style.display = 'none';
    dom.gameScreen.style.display = 'block';
    dom.victoryScreen.style.display = 'none';
    dom.passOverlay.style.display = 'none';
    dom.targetingOverlay.style.display = 'none';
    dom.logPanel.style.display = 'none';
    renderAll(gameState);
  }

  // ========== EVENT WIRING ==========

  function wireEvents() {
    // Lobby
    dom.btnShared.addEventListener('click', startSharedGame);

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

    // Pass overlay
    dom.btnContinue.addEventListener('click', function () {
      dom.passOverlay.style.display = 'none';
    });

    // Targeting overlay
    dom.btnBack.addEventListener('click', function () {
      dom.targetingOverlay.style.display = 'none';
      uiState.targeting = null;
      uiState.selectedCard = null;
    });
    dom.btnConfirm.addEventListener('click', function () {
      // Determine which confirm action to use based on targeting state
      if (uiState.targeting) {
        if (uiState.targeting.action === 'attack') {
          confirmAttack();
        } else if (uiState.targeting.action === 'ability') {
          confirmAbility();
        }
        // instant confirm is set directly on the button
      }
    });

    // Victory screen
    dom.btnPlayAgain.addEventListener('click', function () {
      dom.victoryScreen.style.display = 'none';
      dom.gameScreen.style.display = 'none';
      dom.lobby.style.display = 'block';
      gameState = null;
      clearUiSelections();
    });
  }

  // ========== BOOT ==========
  function init() {
    cacheDom();
    wireEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
