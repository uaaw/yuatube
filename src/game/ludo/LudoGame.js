"use strict";

class LudoGame {
    constructor(players) {
        // players: [{id, name, color}]
        this.players = players.map(p => p.color);
        this.playerIds = {};
        players.forEach(p => { this.playerIds[p.color] = p.id; });

        this.tokens = {};
        this.currentPlayerIndex = 0;
        this.lastRoll = 0;
        this.gameActive = true;
        this.winner = null;

        this.players.forEach(p => {
            this.tokens[p] = [-1, -1, -1, -1];
        });
    }

    // ===== CONSTANTS =====
    static PLAYER_PATHS = {
        red: [[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7]],
        green: [[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0]],
        yellow: [[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14],[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7]],
        blue: [[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14]]
    };
    static FINAL_PATHS = {
        red: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
        green: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
        yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
        blue: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]
    };
    static SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];
    static START_CELLS = { red: 0, green: 13, yellow: 26, blue: 39 };
    static PLAYER_TRACK_OFFSET = { red: 0, green: 13, yellow: 26, blue: 39 };

    // ===== METHODS =====

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    rollDice() {
        return Math.floor(Math.random() * 6) + 1;
    }

    getValidMoves(player, diceValue) {
        const moves = [];
        for (let i = 0; i < 4; i++) {
            const pos = this.tokens[player][i];
            if (pos === -1) {
                if (diceValue === 6) moves.push(i);
            } else if (pos < 51) {
                if (pos + diceValue <= 56) moves.push(i);
            } else if (pos >= 51 && pos < 56) {
                if (pos + diceValue <= 56) moves.push(i);
            }
        }
        return moves;
    }

    moveToken(player, tokenIndex, diceValue) {
        const oldPos = this.tokens[player][tokenIndex];
        const newPos = oldPos === -1 ? 0 : oldPos + diceValue;
        this.tokens[player][tokenIndex] = newPos;

        const captures = this.checkCapture(player, newPos);
        const won = this.checkWin(player);

        return { oldPos, newPos, captures, won };
    }

    checkCapture(player, pos) {
        if (pos < 0 || pos >= 51) return [];
        const trackCell = (LudoGame.PLAYER_TRACK_OFFSET[player] + pos) % 52;
        if (LudoGame.SAFE_CELLS.includes(trackCell)) return [];
        if (Object.values(LudoGame.START_CELLS).includes(trackCell)) return [];

        const captures = [];
        this.players.forEach(other => {
            if (other === player) return;
            for (let i = 0; i < 4; i++) {
                const oPos = this.tokens[other][i];
                if (oPos >= 0 && oPos < 51) {
                    const otherTrackCell = (LudoGame.PLAYER_TRACK_OFFSET[other] + oPos) % 52;
                    if (trackCell === otherTrackCell) {
                        this.tokens[other][i] = -1;
                        captures.push({ player: other, tokenIndex: i });
                    }
                }
            }
        });
        return captures;
    }

    checkWin(player) {
        return this.tokens[player].every(t => t === 56);
    }

    nextTurn() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.lastRoll = 0;
    }

    getState() {
        return {
            tokens: JSON.parse(JSON.stringify(this.tokens)),
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayer: this.getCurrentPlayer(),
            lastRoll: this.lastRoll,
            players: this.players,
            playerIds: this.playerIds,
            gameActive: this.gameActive,
            winner: this.winner
        };
    }
}

module.exports = LudoGame;
