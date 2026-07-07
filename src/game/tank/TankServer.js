"use strict";

const config = require('./config.json');
const ClientData = require('./clientData');
const util = require('./util');
const QuadtreeManager = require('./quadtreeManager');
const SpatialHashManager = require('./spacialHashManager');
const GameLogicService = require('./gameLogicService');
const Heap = require('heap');
const { checkAuthFromHeaders, COOKIE_SECRET } = require('../../server/auth');

function setupTankSocket(io) {
    const tankNsp = io.of('/tank');

    tankNsp.use((socket, next) => {
        if (checkAuthFromHeaders(socket.handshake.headers.cookie, COOKIE_SECRET)) return next();
        next(new Error('Unauthorized'));
    });

    // Initialize game state
    const quadtreeManager = new QuadtreeManager();
    const spatialHashManager = new SpatialHashManager();
    const gameLogicService = new GameLogicService(quadtreeManager, spatialHashManager);
    gameLogicService.initializeGame();

    let currentClientDatas = [];
    let currentClientDatasSpectators = [];
    let sockets = {};
    let scoreboardList = [];
    let radarObjects = {};

    tankNsp.on('connection', (socket) => {
        console.log(`[Tank] Connected: ${socket.id}`);

        const currentClientData = new ClientData(socket.id, GameLogicService.getSpawnLocation(quadtreeManager));

        /**
         * "HANDSHAKE"/MANAGEMENT RELATED SOCKET EVENTS
         */

        socket.on('init', (screenName) => {
            screenName = screenName.substring(0, config.screenName.maxLength);
            for (var i = 0; i < config.screenName.blacklist.length; i++) {
                if (screenName.toUpperCase().indexOf(config.screenName.blacklist[i].toUpperCase()) > -1) {
                    var splitName = screenName.toUpperCase().split(config.screenName.blacklist[i].toUpperCase());
                    screenName = splitName.join("*");
                }
            }
            currentClientData.screenName = screenName.toLowerCase();
            socket.emit('welcome', currentClientData, { gameWidth: config.gameWidth, gameHeight: config.gameHeight });
        });

        socket.on('welcome_received', (clientUpdatedData) => {
            currentClientData.player = clientUpdatedData.player || {};
            sockets[clientUpdatedData.id] = socket;

            if (clientUpdatedData.player.type === 'PLAYER') {
                currentClientDatas.push(currentClientData);
                quadtreeManager.getQuadtree().put(currentClientData.tank.forQuadtree());
                // Reset spawn timer so invincibility period starts when player enters the game
                currentClientData.tank.spawnTime = new Date().getTime();
            } else if (clientUpdatedData.player.type === 'SPECTATOR') {
                currentClientDatasSpectators.push(currentClientData);
            }
        });

        socket.on('pongcheck', () => {
            currentClientData.ping = new Date().getTime() - currentClientData.startPingTime;
        });

        socket.on('disconnect', () => {
            console.log(`[Tank] Disconnected: ${socket.id}`);

            for (let bullet of currentClientData.tank.bullets) {
                quadtreeManager.getQuadtree().remove(bullet.forQuadtree());
            }

            quadtreeManager.getQuadtree().remove(currentClientData.tank.forQuadtree(), 'id');

            if (currentClientData.player.type === 'PLAYER') {
                var playerIndex = util.findIndex(currentClientDatas, currentClientData.id);
                if (playerIndex > -1) {
                    currentClientDatas.splice(playerIndex, 1);
                    console.log(`Player ${currentClientData.player.screenName} has been removed from tracked players.`);
                }
            } else if (currentClientData.player.type === 'SPECTATOR') {
                var spectatorIndex = util.findIndex(currentClientDatasSpectators, currentClientData.id);
                if (spectatorIndex > -1) {
                    currentClientDatasSpectators.splice(spectatorIndex, 1);
                    console.log(`Spectator has been removed from tracked spectators.`);
                }
            }

            var allItemsInQuadtree = quadtreeManager.getQuadtree().get({ x: 0, y: 0, w: config.gameWidth, h: config.gameHeight });
            console.log('quadtree size', allItemsInQuadtree.length);
        });

        /**
         * GAME RELATED SOCKET EVENTS
         */

        socket.on('client_checkin', (clientCheckinData) => {
            if (clientCheckinData) {
                currentClientData.player.userInput = {
                    "keysPressed": clientCheckinData.keysPressed || config.defaultKeysPressed,
                    "mouseClicked": clientCheckinData.mouseClicked || config.defaultMouseClicked,
                    "mouseAngle": clientCheckinData.mouseAngle || config.defaultMouseAngle
                };
            } else {
                currentClientData.player.userInput = {
                    "keysPressed": config.defaultKeysPressed,
                    "mouseClicked": config.defaultMouseClicked,
                    "mouseAngle": config.defaultMouseAngle
                };
            }

            currentClientData.lastHeartbeat = new Date().getTime();
        });

        socket.on('windowResized', (data) => {
            currentClientData.player.screenWidth = data.screenWidth;
            currentClientData.player.screenHeight = data.screenHeight;
        });
    });

    /**
     * GAME RELATED FUNCTIONS AND LOOPS
     */

    var checkPing = function () {
        currentClientDatas.forEach(function (clientData) {
            currentClientDatas[util.findIndex(currentClientDatas, clientData.id)].startPingTime = new Date().getTime();
            sockets[clientData.id].emit('pingcheck');
        });
    };

    var gameTick = function (clientData) {
        gameLogicService.gameTick(clientData, sockets[clientData.id], currentClientDatas);
    };

    var gameTickSpectator = function (clientData) {
        gameLogicService.gameTickSpectator(clientData, sockets[clientData.id]);
    };

    var gameObjectUpdater = function () {
        for (var i = currentClientDatas.length - 1; i >= 0; --i) {
            gameTick(currentClientDatas[i]);
        }

        for (var i = currentClientDatasSpectators.length - 1; i >= 0; --i) {
            gameTickSpectator(currentClientDatasSpectators[i]);
        }
    };

    var clientUpdater = function () {
        function queryAndSendData(clientData) {
            var queryArea = {
                x: clientData.position.x - clientData.player.screenWidth / 2,
                y: clientData.position.y - clientData.player.screenHeight / 2,
                w: clientData.player.screenWidth,
                h: clientData.player.screenHeight
            };

            var perspective = {
                "perspective": {
                    x: clientData.position.x,
                    y: clientData.position.y
                }
            };

            var ammo = {
                "ammo": {
                    capacity: config.tank.ammoCapacity,
                    count: clientData.tank.ammo
                }
            };

            sockets[clientData.id].emit('game_objects_update',
                Object.assign(
                    {},
                    perspective,
                    quadtreeManager.queryGameObjects(queryArea),
                    // Tracks disabled for performance and visual improvement
                    // spatialHashManager.queryTracks(range),
                    ammo,
                    { scoreboard: scoreboardList },
                    { radar: radarObjects }
                )
            );
        }

        currentClientDatas.forEach(function (clientData) { queryAndSendData(clientData); });
        currentClientDatasSpectators.forEach(function (clientData) { queryAndSendData(clientData); });
    };

    var updateScoreboard = function () {
        scoreboardList = Heap.nlargest(currentClientDatas.map(function (clientData) {
            return clientData.tank;
        }), Math.min(currentClientDatas.length, config.scoreBoardLength), function (tank1, tank2) {
            return tank1.kills - tank2.kills;
        }).map(function (tank) { return { screenName: tank.screenName, kills: tank.kills } });
    };

    var updateRadar = function () {
        radarObjects = quadtreeManager.queryGameObjectsForType(['TANK', 'WALL']);
    };

    // Start server loops
    setInterval(gameObjectUpdater, 1000 / 60);
    setInterval(clientUpdater, 1000 / 40);
    setInterval(updateScoreboard, 500);
    setInterval(updateRadar, 2500);

    console.log('[Tank] Tank game server initialized on /tank namespace');
}

module.exports = setupTankSocket;
