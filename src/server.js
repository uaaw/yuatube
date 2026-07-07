"use strict";
const express = require("express");
const http = require("http");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const serverYt = require("./server/youtube.js");
const cors = require('cors');
const { Server } = require('socket.io');
const setupLudoSocket = require('./game/ludo/LudoSocket');
const setupTankSocket = require('./game/tank/TankServer');
const wisp = require('@mercuryworkshop/wisp-js').server;
const { COOKIE_SECRET, isAuthed, checkAuthFromHeaders } = require("./server/auth");

const SECRET_HASH = "34c1d941c0e1d6ac17d19f71ddbbb3f414d37285f67d48e810f9d2095d50e9c9";

function requireAuth(req, res, next) {
  if (isAuthed(req)) {
    return next();
  }
  res.redirect("/home");
}

const STATIC_EXT = /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|otf|ttf|mp3|wasm|json|html|map)$/i;

function isPublicStaticPath(urlPath) {
  if (urlPath === "/css/reisen.css") return true;
  if (urlPath.startsWith("/fonts/")) return true;
  return false;
}

function looksLikePublicStatic(urlPath) {
  if (isPublicStaticPath(urlPath)) return true;
  if (urlPath.startsWith("/css/") || urlPath.startsWith("/js/") || urlPath.startsWith("/fonts/")) return true;
  if (urlPath.startsWith("/tank/") || urlPath.startsWith("/tetris/") || urlPath.startsWith("/shogi/")) return true;
  if (urlPath.startsWith("/yahtzee/") || urlPath.startsWith("/ludo/") || urlPath.startsWith("/uv/")) return true;
  if (STATIC_EXT.test(urlPath)) return true;
  return false;
}

function protectPublicStatic(req, res, next) {
  if (!looksLikePublicStatic(req.path)) {
    return next();
  }
  if (isPublicStaticPath(req.path)) {
    return next();
  }
  if (isAuthed(req)) {
    return next();
  }
  res.redirect("/home");
}

let app = express();
let client;
let httpServer = null;
let io = null;
let serverStarted = false;
let initInFlight = false;

app.use(compression());
app.use(cookieParser(COOKIE_SECRET));
app.use(protectPublicStatic, express.static(__dirname + "/public"));

app.use("/sonota/proxy", (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
app.use("/uv/", (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
app.use("/epoxy/", (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
app.use("/baremux/", (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
app.use("/uv/", requireAuth, express.static(path.join(__dirname, "node_modules/@titaniumnetwork-dev/ultraviolet/dist")));
app.use("/epoxy/", requireAuth, express.static(path.join(__dirname, "node_modules/@mercuryworkshop/epoxy-transport/dist")));
app.use("/baremux/", requireAuth, express.static(path.join(__dirname, "node_modules/@mercuryworkshop/bare-mux/dist")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

app.get('/', (req, res) => {
  res.redirect('/home');
});

app.get('/google', (req, res) => {
  res.render("home/google");
});

app.post('/google', (req, res) => {
  const query = (req.body.q || '').trim();
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  if (hash === SECRET_HASH) {
    res.cookie('gen_access', 'ok', {
      signed: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.redirect('/gen');
  }
  res.redirect('https://www.google.com/search?q=' + encodeURIComponent(query));
});

app.get('/home', (req, res) => {
  res.render("home/index");
});

app.get('/home/yes', (req, res) => {
  res.render("home/yes");
});

app.get('/home/no', (req, res) => {
  res.render("home/no");
});

app.use("/gen", requireAuth, require("./routes/tensaitube"));
app.use("/sonota", requireAuth, require("./routes/sonota"));
app.use("/game", requireAuth, require("./routes/game"));
app.use("/tools", requireAuth, require("./routes/tools"));
app.use("/tensais", requireAuth, require("./routes/music"));

app.get('/watch', (req, res) => {
  const videoId = req.query.v;
  if (videoId) {
    res.redirect(`/gen/watch/${videoId}`);
  } else {
    res.redirect(`/gen`);
  }
});
app.get('/channel/:id', (req, res) => {
  const id = req.params.id;
    res.redirect(`/gen/c/${id}`);
});
app.get('/channel/:id/join', (req, res) => {
  const id = req.params.id;
  res.redirect(`/gen/c/${id}`);
});
app.get('/hashtag/:des', (req, res) => {
  const des = req.params.des;
  res.redirect(`/gen/s?q=${des}`);
});

app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "そのページは存在しません。",
  });
});
function startHttpServer() {
  if (serverStarted) return;

  httpServer = http.createServer(app);
  io = new Server(httpServer, { cors: { origin: "*" } });
  setupLudoSocket(io);
  setupTankSocket(io);

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url.endsWith('/wisp/')) {
      if (!checkAuthFromHeaders(req.headers.cookie, COOKIE_SECRET)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wisp.routeRequest(req, socket, head);
    }
  });

  httpServer.on('error', (err) => {
    const port = process.env.PORT || 38239;
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop the other process or set a different PORT.`);
      process.exit(1);
    }
    console.error('HTTP server error:', err);
    process.exit(1);
  });

  const port = process.env.PORT || 38239;
  const listener = httpServer.listen(port, () => {
    serverStarted = true;
    console.log(process.pid, "Ready.", listener.address().port);
  });
}

async function initInnerTube() {
  if (initInFlight) return;
  initInFlight = true;
  try {
    const { Innertube } = await import("youtubei.js");
    client = await Innertube.create({ lang: "ja", location: "JP" });
    serverYt.setClient(client);
    console.log("YouTube client ready");
  } catch (e) {
    console.error(e);
    setTimeout(initInnerTube, 10000);
  } finally {
    initInFlight = false;
  }
}

function shutdown() {
  const finish = () => process.exit(0);
  if (io) {
    io.close(() => {
      if (httpServer) {
        httpServer.close(finish);
      } else {
        finish();
      }
    });
  } else if (httpServer) {
    httpServer.close(finish);
  } else {
    finish();
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on("unhandledRejection", console.error);

startHttpServer();
initInnerTube();