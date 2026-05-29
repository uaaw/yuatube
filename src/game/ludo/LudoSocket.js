"use strict";

const LudoRoom = require('./LudoRoom');
const LudoGame = require('./LudoGame');

function setupLudoSocket(io) {
    const roomManager = new LudoRoom();

    setInterval(() => roomManager.cleanup(), 60000);

    const ludo = io.of('/ludo');

    ludo.on('connection', (socket) => {
        console.log(`[Ludo] Connected: ${socket.id}`);

        socket.on('createRoom', ({ playerName, maxPlayers }) => {
            const room = roomManager.createRoom(socket.id, maxPlayers);
            roomManager.joinRoom(room.id, socket.id, playerName || 'Player 1');
            socket.join(room.id);
            socket.emit('roomCreated', { roomId: room.id, maxPlayers: room.maxPlayers });
            socket.emit('roomJoined', {
                roomId: room.id,
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
                maxPlayers: room.maxPlayers
            });
        });

        socket.on('joinRoom', ({ roomId, playerName }) => {
            const result = roomManager.joinRoom((roomId || '').toUpperCase(), socket.id, playerName);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            const room = result.room;
            socket.join(room.id);

            socket.emit('roomJoined', {
                roomId: room.id,
                players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
                maxPlayers: room.maxPlayers
            });

            socket.to(room.id).emit('playerJoined', {
                id: socket.id,
                name: playerName,
                color: null
            });

            if (room.players.length === room.maxPlayers) {
                room.status = 'colorSelect';
                ludo.to(room.id).emit('startColorSelect', {
                    players: room.players.map(p => ({ id: p.id, name: p.name })),
                    availableColors: ['red', 'green', 'blue', 'yellow']
                });
            }
        });

        socket.on('selectColor', ({ color }) => {
            const result = roomManager.selectColor(socket.id, color);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            ludo.to(result.room.id).emit('colorSelected', { playerId: socket.id, color });
        });

        socket.on('ready', () => {
            const room = roomManager.setReady(socket.id);
            if (!room) return;

            if (roomManager.isAllReady(room)) {
                room.status = 'playing';
                room.game = new LudoGame(room.players);
                ludo.to(room.id).emit('gameStart', room.game.getState());
            }
        });

        socket.on('rollDice', () => {
            const room = roomManager.getRoomBySocketId(socket.id);
            if (!room || !room.game || !room.game.gameActive) return;

            const game = room.game;
            const currentColor = game.getCurrentPlayer();

            if (game.playerIds[currentColor] !== socket.id) {
                socket.emit('error', { message: 'あなたのターンではありません' });
                return;
            }

            const diceValue = game.rollDice();
            game.lastRoll = diceValue;

            const validMoves = game.getValidMoves(currentColor, diceValue);

            ludo.to(room.id).emit('diceRolled', {
                value: diceValue,
                playerId: socket.id,
                player: currentColor,
                validMoves
            });

            if (validMoves.length === 0) {
                setTimeout(() => {
                    game.nextTurn();
                    ludo.to(room.id).emit('stateUpdate', game.getState());
                }, 1500);
            } else if (validMoves.length === 1) {
                setTimeout(() => {
                    const result = game.moveToken(currentColor, validMoves[0], diceValue);
                    ludo.to(room.id).emit('tokenMoved', {
                        player: currentColor,
                        tokenIndex: validMoves[0],
                        oldPos: result.oldPos,
                        newPos: result.newPos,
                        captures: result.captures
                    });
                    handlePostMove(ludo, room, game, currentColor, diceValue, result);
                }, 500);
            } else {
                // Multiple valid moves - set a timeout for auto-pick
                room._moveTimeout = setTimeout(() => {
                    if (!game.gameActive) return;
                    const result = game.moveToken(currentColor, validMoves[0], diceValue);
                    ludo.to(room.id).emit('tokenMoved', {
                        player: currentColor,
                        tokenIndex: validMoves[0],
                        oldPos: result.oldPos,
                        newPos: result.newPos,
                        captures: result.captures
                    });
                    handlePostMove(ludo, room, game, currentColor, diceValue, result);
                }, 30000);
            }
        });

        socket.on('moveToken', ({ tokenIndex }) => {
            const room = roomManager.getRoomBySocketId(socket.id);
            if (!room || !room.game || !room.game.gameActive) return;

            // Clear move timeout if player responded
            if (room._moveTimeout) { clearTimeout(room._moveTimeout); room._moveTimeout = null; }

            const game = room.game;
            const currentColor = game.getCurrentPlayer();

            if (game.playerIds[currentColor] !== socket.id) {
                socket.emit('error', { message: 'あなたのターンではありません' });
                return;
            }

            const validMoves = game.getValidMoves(currentColor, game.lastRoll);
            if (!validMoves.includes(tokenIndex)) {
                socket.emit('error', { message: '無効な移動です' });
                return;
            }

            const result = game.moveToken(currentColor, tokenIndex, game.lastRoll);

            ludo.to(room.id).emit('tokenMoved', {
                player: currentColor,
                tokenIndex,
                oldPos: result.oldPos,
                newPos: result.newPos,
                captures: result.captures
            });

            handlePostMove(ludo, room, game, currentColor, game.lastRoll, result);
        });

        socket.on('leaveRoom', () => {
            handlePlayerLeave(socket, roomManager, ludo);
        });

        socket.on('disconnect', () => {
            console.log(`[Ludo] Disconnected: ${socket.id}`);
            handlePlayerLeave(socket, roomManager, ludo);
        });
    });
}

function handlePostMove(ludo, room, game, currentColor, diceValue, result) {
    if (result.won) {
        game.gameActive = false;
        game.winner = currentColor;
        room.status = 'finished';
        ludo.to(room.id).emit('gameOver', { winner: currentColor });
    } else if (diceValue === 6) {
        ludo.to(room.id).emit('stateUpdate', game.getState());
    } else {
        game.nextTurn();
        ludo.to(room.id).emit('stateUpdate', game.getState());
    }
}

function handlePlayerLeave(socket, roomManager, ludo) {
    const result = roomManager.leaveRoom(socket.id);
    if (!result) return;

    socket.leave(result.room.id);

    if (result.destroyed) return;

    if (result.room.status === 'playing' && result.room.game) {
        result.room.game.gameActive = false;
        result.room.status = 'finished';
        ludo.to(result.room.id).emit('gameOver', { winner: null, reason: 'プレイヤーが切断しました' });
    }

    ludo.to(result.room.id).emit('playerLeft', {
        playerId: socket.id,
        name: result.playerName
    });
}

module.exports = setupLudoSocket;
