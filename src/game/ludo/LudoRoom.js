"use strict";

class LudoRoom {
    constructor() {
        this.rooms = new Map();
    }

    generateRoomId() {
        const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
        let id = '';
        for (let i = 0; i < 6; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
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
        if (room.status !== 'waiting') return { error: 'ゲームが進行中です' };
        if (room.players.length >= room.maxPlayers) return { error: 'ルームが満員です' };
        if (room.players.find(p => p.id === socketId)) return { error: 'すでに参加しています' };

        room.players.push({
            id: socketId,
            name: playerName || 'Player',
            color: null,
            ready: false
        });
        return { room };
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
