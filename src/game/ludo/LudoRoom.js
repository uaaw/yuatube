"use strict";

class LudoRoom {
    constructor() {
        this.rooms = new Map();
    }

    generateRoomId() {
        let id;
        do {
            id = String(Math.floor(100000 + Math.random() * 900000));
        } while (this.rooms.has(id));
        return id;
    }

    createRoom(hostSocketId, maxPlayers) {
        const roomId = this.generateRoomId();
        const room = {
            id: roomId,
            hostId: hostSocketId,
            maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 2, 2), 4),
            players: [],
            status: 'waiting',
            game: null,
            createdAt: Date.now()
        };
        this.rooms.set(roomId, room);
        return room;
    }

    joinRoom(roomId, socketId, playerName) {
        const room = this.rooms.get(roomId);
        if (!room) return { error: 'ルームが見つかりません' };
        if (room.players.find(p => p.id === socketId)) return { error: 'すでに参加しています' };

        if (room.status === 'playing') {
            // Mid-game join allowed if room has space
            if (room.players.length >= room.maxPlayers) {
                // Check for disconnected player to replace
                const disconnected = room.players.find(p => p.disconnected);
                if (!disconnected) return { error: 'ルームが満員です' };
                // Replace disconnected player
                const oldSocketId = disconnected.id;
                disconnected.id = socketId;
                disconnected.name = playerName || disconnected.name;
                disconnected.disconnected = false;
                // Update game playerIds
                if (room.game && room.game.playerIds) {
                    for (const [color, sid] of Object.entries(room.game.playerIds)) {
                        if (sid === oldSocketId) {
                            room.game.playerIds[color] = socketId;
                        }
                    }
                }
                return { room, replaced: true, replacedPlayer: disconnected };
            }
            // Room has space - add as new player
            const availableColors = ['red', 'green', 'blue', 'yellow'].filter(c => !room.players.some(p => p.color === c));
            if (availableColors.length === 0) return { error: '利用可能な色がありません' };
            room.players.push({
                id: socketId,
                name: playerName || 'Player',
                color: availableColors[0],
                ready: true,
                disconnected: false
            });
            return { room, midGameJoin: true };
        }

        if (room.status !== 'waiting') return { error: 'ゲームが進行中です' };
        if (room.players.length >= room.maxPlayers) return { error: 'ルームが満員です' };

        room.players.push({
            id: socketId,
            name: playerName || 'Player',
            color: null,
            ready: false,
            disconnected: false
        });
        return { room };
    }

    addPlayerToGame(room, playerColor) {
        if (!room.game) return false;
        room.game.players.push(playerColor);
        room.game.tokens[playerColor] = [-1, -1, -1, -1];
        room.game.playerIds[playerColor] = room.players.find(p => p.color === playerColor).id;
        return true;
    }

    leaveRoom(socketId) {
        const room = this.getRoomBySocketId(socketId);
        if (!room) return null;

        const playerIndex = room.players.findIndex(p => p.id === socketId);
        if (playerIndex === -1) return null;

        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
            this.rooms.delete(room.id);
            return { room, playerName, destroyed: true };
        }

        if (room.hostId === socketId) {
            room.hostId = room.players[0].id;
        }

        return { room, playerName, destroyed: false };
    }

    selectColor(socketId, color) {
        const room = this.getRoomBySocketId(socketId);
        if (!room) return { error: 'ルームが見つかりません' };

        const taken = room.players.some(p => p.color === color);
        if (taken) return { error: 'その色はすでに選択されています' };

        const player = room.players.find(p => p.id === socketId);
        if (!player) return { error: 'プレイヤーが見つかりません' };

        player.color = color;
        return { room };
    }

    setReady(socketId) {
        const room = this.getRoomBySocketId(socketId);
        if (!room) return null;

        const player = room.players.find(p => p.id === socketId);
        if (player) player.ready = true;

        return room;
    }

    isAllReady(room) {
        return room.players.length === room.maxPlayers &&
               room.players.every(p => p.ready && p.color);
    }

    reconnectPlayer(oldSocketId, newSocketId) {
        for (const [, room] of this.rooms) {
            const player = room.players.find(p => p.id === oldSocketId && p.disconnected);
            if (!player) continue;
            if (room.game && room.game.playerIds) {
                for (const [color, sid] of Object.entries(room.game.playerIds)) {
                    if (sid === oldSocketId) {
                        room.game.playerIds[color] = newSocketId;
                    }
                }
            }
            player.id = newSocketId;
            player.disconnected = false;
            return room;
        }
        return null;
    }

    getDisconnectedPlayers() {
        const disconnected = [];
        for (const [, room] of this.rooms) {
            for (const player of room.players) {
                if (player.disconnected) {
                    disconnected.push({ player, room });
                }
            }
        }
        return disconnected;
    }

    getRoomByPlayerName(name) {
        for (const [, room] of this.rooms) {
            if (room.players.find(p => p.name === name)) return room;
        }
        return null;
    }

    getRoomBySocketId(socketId) {
        for (const [, room] of this.rooms) {
            if (room.players.find(p => p.id === socketId)) return room;
        }
        return null;
    }

    cleanup() {
        const now = Date.now();
        for (const [id, room] of this.rooms) {
            if (room.players.length === 0 && now - room.createdAt > 300000) {
                this.rooms.delete(id);
            }
        }
    }
}

module.exports = LudoRoom;
