// ws-server.js — WebSocket server with room management for per-device multiplayer.
// Runs the same engine code to validate and resolve all actions server-side.

const { WebSocketServer } = require('ws');
const ENGINE = require('../engine.js');

// ---------------------------------------------------------------------------
// RoomManager — in-memory room store
// ---------------------------------------------------------------------------
class RoomManager {
  constructor() {
    /** Map<roomCode, Room> */
    this._rooms = new Map();
  }

  /**
   * Create a new room. Generates a unique 4-letter code.
   * @param {string} hostName
   * @returns {{ code: string, room: object }}
   */
  createRoom(hostName) {
    let code;
    do {
      code = ENGINE.roomCode();
    } while (this._rooms.has(code));

    const room = {
      code,
      hostName,
      started: false,
      createdAt: Date.now(),
      players: [],          // { id, name, ws, connected: bool, disconnectTimer }
      state: null,          // ENGINE game state — populated on START_GAME
      settings: {},
    };
    this._rooms.set(code, room);
    return { code, room };
  }

  /**
   * Add a player to an existing room.
   * @param {string} code — room code
   * @param {string} playerName
   * @param {import('ws').WebSocket} ws
   * @returns {{ room: object, player: object } | { error: string }}
   */
  joinRoom(code, playerName, ws) {
    const room = this._rooms.get(code);
    if (!room) return { error: 'Room not found' };
    if (room.started) return { error: 'Game already started' };
    if (room.players.length >= 4) return { error: 'Room full (max 4 players)' };

    const exists = room.players.find(p => p.name === playerName);
    if (exists) return { error: 'Name already taken in this room' };

    const id = room.players.length + 1;
    const player = {
      id,
      name: playerName,
      ws,
      connected: true,
      disconnectTimer: null,
    };
    room.players.push(player);
    return { room, player };
  }

  /** Get a room by code, or undefined. */
  getRoom(code) {
    return this._rooms.get(code);
  }

  /** Remove a room and all its state. */
  removeRoom(code) {
    const room = this._rooms.get(code);
    if (!room) return;
    for (const p of room.players) {
      this._clearDisconnectTimer(p);
      if (p.ws && p.ws.readyState === 1) {
        p.ws.close(1001, 'Room closed');
      }
    }
    this._rooms.delete(code);
  }

  /** Clear the disconnect timer for a player. */
  _clearDisconnectTimer(player) {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
  }

  /** Find which room a WebSocket belongs to. */
  findRoomByWs(ws) {
    for (const [, room] of this._rooms) {
      const player = room.players.find(p => p.ws === ws);
      if (player) return { room, player };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize game state for a specific player — hide opponents' hands,
 * decks, and traps so each device only sees its owner's hidden info.
 */
function sanitizeForPlayer(state, playerId) {
  const s = JSON.parse(JSON.stringify(state));
  for (const p of s.players) {
    if (p.id !== playerId) {
      p.hand = undefined;
      p.deck = undefined;
      p.traps = undefined;
      p.handCount = state.players.find(sp => sp.id === p.id).hand.length;
      p.deckCount = state.players.find(sp => sp.id === p.id).deck.length;
      p.trapCount = state.players.find(sp => sp.id === p.id).traps.length;
    }
  }
  return s;
}

/** Send a JSON message to a single websocket. */
function send(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

/** Broadcast a message to every connected player in a room. */
function broadcast(room, message, excludeWs) {
  for (const p of room.players) {
    if (p.ws && p.ws !== excludeWs && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(message));
    }
  }
}

/**
 * Broadcast the current game state to all connected players.
 * Each player receives a view that hides opponents' hidden information.
 */
function broadcastState(room) {
  if (!room.state) return;
  for (const p of room.players) {
    if (!p.connected || !p.ws || p.ws.readyState !== 1) continue;
    const view = sanitizeForPlayer(room.state, p.id);
    send(p.ws, {
      type: 'STATE_UPDATE',
      playerId: p.id,
      state: view,
    });
  }
}

/** Check win condition and broadcast if game over. */
function checkAndBroadcastWin(room) {
  if (!room.state) return false;
  const result = ENGINE.checkWin(room.state);
  if (result.winner) {
    room.state.winner = result.winner;
    room.state.phase = 'ended';
    broadcast(room, {
      type: 'GAME_OVER',
      winner: { id: result.winner.id, name: result.winner.name },
      state: room.state,
    });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// WebSocket message handler
// ---------------------------------------------------------------------------

/**
 * Attach WebSocket server to an existing Node HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {{ wss: WebSocketServer, roomManager: RoomManager }}
 */
function attach(httpServer) {
  const roomManager = new RoomManager();

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    console.log('[ws] new connection');

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'ERROR', error: 'Invalid JSON' });
        return;
      }

      handleMessage(ws, msg, roomManager);
    });

    ws.on('close', () => {
      handleDisconnect(ws, roomManager);
    });

    ws.on('error', (err) => {
      console.error('[ws] socket error:', err.message);
    });
  });

  return { wss, roomManager };
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

function handleMessage(ws, msg, rm) {
  switch (msg.type) {
    case 'HOST_GAME':
      handleHostGame(ws, msg, rm);
      break;
    case 'JOIN_GAME':
      handleJoinGame(ws, msg, rm);
      break;
    case 'START_GAME':
      handleStartGame(ws, msg, rm);
      break;
    case 'PLAYER_ACTION':
      handlePlayerAction(ws, msg, rm);
      break;
    case 'END_TURN':
      handleEndTurn(ws, msg, rm);
      break;
    case 'GET_ROOM':
      handleGetRoom(ws, msg, rm);
      break;
    default:
      send(ws, { type: 'ERROR', error: 'Unknown message type: ' + msg.type });
  }
}

// ---------------------------------------------------------------------------
// HOST_GAME
// ---------------------------------------------------------------------------
function handleHostGame(ws, msg, rm) {
  if (!msg.name || typeof msg.name !== 'string' || !msg.name.trim()) {
    return send(ws, { type: 'ERROR', error: 'Player name is required' });
  }

  const { code, room } = rm.createRoom(msg.name.trim());
  const player = { id: 1, name: msg.name.trim(), connected: true };
  room.players.push({ ...player, ws, disconnectTimer: null });

  send(ws, {
    type: 'ROOM_CREATED',
    code,
    playerId: 1,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
  });

  console.log(`[ws] room ${code} created by "${msg.name.trim()}"`);
}

// ---------------------------------------------------------------------------
// JOIN_GAME
// ---------------------------------------------------------------------------
function handleJoinGame(ws, msg, rm) {
  if (!msg.code || !msg.name) {
    return send(ws, { type: 'ERROR', error: 'Room code and player name are required' });
  }

  const code = msg.code.toUpperCase().trim();
  const name = msg.name.trim();

  if (!/^[A-Z]{4}$/.test(code)) {
    return send(ws, { type: 'ERROR', error: 'Room code must be 4 letters' });
  }

  const result = rm.joinRoom(code, name, ws);
  if (result.error) {
    return send(ws, { type: 'ERROR', error: result.error });
  }

  const { room, player } = result;

  send(ws, {
    type: 'JOIN_SUCCESS',
    code,
    playerId: player.id,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
  });

  // Notify everyone else
  broadcast(room, {
    type: 'PLAYER_JOINED',
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
  }, ws);

  console.log(`[ws] "${name}" joined room ${code} (player ${player.id})`);
}

// ---------------------------------------------------------------------------
// START_GAME
// ---------------------------------------------------------------------------
function handleStartGame(ws, msg, rm) {
  const found = rm.findRoomByWs(ws);
  if (!found) return send(ws, { type: 'ERROR', error: 'Not in a room' });

  const { room, player } = found;

  // Only host (player 1) can start
  if (player.id !== 1) {
    return send(ws, { type: 'ERROR', error: 'Only the host can start the game' });
  }

  if (room.players.length < 2) {
    return send(ws, { type: 'ERROR', error: 'Need at least 2 players to start' });
  }

  room.started = true;
  const playerNames = room.players.map(p => p.name);
  room.state = ENGINE.createGame(playerNames, 'network');

  console.log(`[ws] game started in room ${room.code} with ${playerNames.length} players — auction begins`);

  // Broadcast auction state to all players
  broadcastState(room);
}

// ---------------------------------------------------------------------------
// PLAYER_ACTION
// ---------------------------------------------------------------------------
function handlePlayerAction(ws, msg, rm) {
  const found = rm.findRoomByWs(ws);
  if (!found) return send(ws, { type: 'ERROR', error: 'Not in a room' });

  const { room, player } = found;

  if (!room.started || !room.state) {
    return send(ws, { type: 'ERROR', error: 'Game not started' });
  }

  if (room.state.phase === 'ended') {
    return send(ws, { type: 'ERROR', error: 'Game is over' });
  }

  // During auction, all players can bid — skip turn enforcement
  if (room.state.phase !== 'auction') {
    // Turn enforcement — only the active player can act during game
    if (player.id !== room.state.activePlayer) {
      return send(ws, { type: 'ERROR', error: 'It is not your turn' });
    }
  }

  // Handle the specific action
  const action = msg.action;
  if (!action || !action.type) {
    return send(ws, { type: 'ERROR', error: 'No action specified' });
  }

  let result;
  switch (action.type) {
    case 'DRAW_CARD':
      result = ENGINE.drawCard(room.state, player.id);
      break;

    case 'PLAY_BOT':
      result = ENGINE.playBotToPosition(room.state, player.id, action.cardId, action.position);
      break;

    case 'SWAP_BENCH':
      result = ENGINE.swapBench(room.state, player.id, action.benchIndex, action.position);
      break;

    case 'ATTACK': {
      // Check if breacher
      if (action.targetType === 'base') {
        const activeBot = room.state.players.find(p => p.id === player.id).board.active;
        if (activeBot && activeBot.name === 'Breacher') {
          result = ENGINE.breacherAttack(room.state, player.id, action.targetPlayerId, action.targetType);
          break;
        }
      }
      result = ENGINE.attack(room.state, player.id, action.botPosition, action.targetPlayerId, action.targetType, action.targetPosition);

      // Trigger secondary bot on-hit if applicable
      if (!result.error && action.targetType === 'bot' && action.targetPosition) {
        const pState = room.state.players.find(p => p.id === player.id);
        const secondaryBot = pState && pState.board.secondary;
        if (secondaryBot) {
          const secResult = ENGINE.secondaryOnHit(result.newState, player.id, secondaryBot.name, action.targetPlayerId, action.targetPosition);
          result = { ...result, newState: secResult.newState };
        }
      }
      break;
    }

    case 'USE_ABILITY':
      result = ENGINE.useSupportAbility(room.state, player.id, action.abilityName, action.targetPosition);
      break;

    case 'PLAY_INSTANT':
      result = ENGINE.playInstant(room.state, player.id, action.cardId, action.targets || []);
      break;

    case 'PLAY_TRAP':
      result = ENGINE.playTrap(room.state, player.id, action.cardId);
      break;

    case 'BUY_MARKET':
      result = ENGINE.buyFromMarket(room.state, player.id, action.marketIndex);
      break;

    case 'SCAVENGE':
      result = ENGINE.scavenge(room.state, player.id, action.loserId, action.position);
      break;

    case 'SUBMIT_BID':
      result = ENGINE.submitBid(room.state, player.id, action.amount);
      break;

    default:
      return send(ws, { type: 'ERROR', error: 'Unknown action type: ' + action.type });
  }

  if (result && result.error) {
    return send(ws, { type: 'ERROR', error: result.error });
  }

  if (result && result.newState) {
    room.state = result.newState;
  }

  // Check win after action
  const isOver = checkAndBroadcastWin(room);
  if (!isOver) {
    broadcastState(room);
  }
}

// ---------------------------------------------------------------------------
// END_TURN
// ---------------------------------------------------------------------------
function handleEndTurn(ws, msg, rm) {
  const found = rm.findRoomByWs(ws);
  if (!found) return send(ws, { type: 'ERROR', error: 'Not in a room' });

  const { room, player } = found;

  if (!room.started || !room.state) {
    return send(ws, { type: 'ERROR', error: 'Game not started' });
  }

  if (player.id !== room.state.activePlayer) {
    return send(ws, { type: 'ERROR', error: 'It is not your turn' });
  }

  const result = ENGINE.endTurn(room.state, player.id);
  if (result.error) {
    return send(ws, { type: 'ERROR', error: result.error });
  }

  room.state = result.newState;
  broadcastState(room);
}

// ---------------------------------------------------------------------------
// GET_ROOM — reconnection / info
// ---------------------------------------------------------------------------
function handleGetRoom(ws, msg, rm) {
  if (!msg.code) {
    return send(ws, { type: 'ERROR', error: 'Room code required' });
  }

  const code = msg.code.toUpperCase().trim();
  const room = rm.getRoom(code);

  if (!room) {
    return send(ws, { type: 'ERROR', error: 'Room not found' });
  }

  send(ws, {
    type: 'ROOM_INFO',
    code: room.code,
    hostName: room.hostName,
    started: room.started,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
  });
}

// ---------------------------------------------------------------------------
// Disconnect handling — 60s timeout, skip turns for disconnected
// ---------------------------------------------------------------------------
function handleDisconnect(ws, rm) {
  const found = rm.findRoomByWs(ws);
  if (!found) return;

  const { room, player } = found;
  console.log(`[ws] player "${player.name}" disconnected from room ${room.code}`);

  player.connected = false;
  player.ws = null;

  // Clear any existing timer
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);

  // 60 second reconnection window
  player.disconnectTimer = setTimeout(() => {
    console.log(`[ws] player "${player.name}" timed out — removing from room ${room.code}`);
    const idx = room.players.indexOf(player);
    if (idx !== -1) room.players.splice(idx, 1);

    // If host disconnects permanently, close the room
    if (player.id === 1 || room.players.length === 0) {
      rm.removeRoom(room.code);
      console.log(`[ws] room ${room.code} closed (host disconnected or room empty)`);
      return;
    }

    // If game was in progress, mark player as eliminated
    if (room.state && room.state.phase === 'playing') {
      const statePlayer = room.state.players.find(p => p.id === player.id);
      if (statePlayer) {
        statePlayer.baseHP = 0;
        // If it was their turn, skip to next
        if (room.state.activePlayer === player.id) {
          const result = ENGINE.endTurn(room.state, player.id);
          if (!result.error) room.state = result.newState;
        }
      }
    }

    broadcast(room, {
      type: 'PLAYER_LEFT',
      playerId: player.id,
      name: player.name,
      players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
    });

    if (room.started && room.state) {
      checkAndBroadcastWin(room);
      if (room.state.phase !== 'ended') broadcastState(room);
    }
  }, 60000);

  // Notify others immediately
  broadcast(room, {
    type: 'PLAYER_DISCONNECTED',
    playerId: player.id,
    name: player.name,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = { RoomManager, attach, sanitizeForPlayer, broadcastState };
