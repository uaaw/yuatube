"use strict";
const express = require("express");
const path = require("path");
const compression = require("compression");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const serverYt = require("./server/youtube.js");
const cors = require('cors');

// READMEにあるようにここにハッシュ値を設置してね
//デフォルトはhello
const SECRET_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "tensai_cookie_secret";

function requireAuth(req, res, next) {
  if (req.signedCookies && req.signedCookies.gen_access === "ok") {
    return next();
  }
  res.redirect("/home");
}

let app = express();
let client;

app.use(compression());
app.use(express.static(__dirname + "/public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser(COOKIE_SECRET));
app.use(cors());

app.get('/', (req, res) => {
  res.redirect('/home');
});

app.get('/home', (req, res) => {
  res.render("home/google");
});

app.post('/home', (req, res) => {
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

app.use("/gen", requireAuth, require("./routes/tensaitube"));
app.use("/sonota", require("./routes/sonota"));
app.use("/game", require("./routes/game"));
app.use("/tools", require("./routes/tools"));
app.use("/tensais", require("./routes/music"));

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
app.on("error", console.error);
async function initInnerTube() {
  try {
    const { Innertube } = await import("youtubei.js");
    client = await Innertube.create({ lang: "ja", location: "JP"});
    serverYt.setClient(client);
    const listener = app.listen(process.env.PORT || 3000, () => {
      console.log(process.pid, "Ready.", listener.address().port);
    });
  } catch (e) {
    console.error(e);
    setTimeout(initInnerTube, 10000);
  };
};
process.on("unhandledRejection", console.error);
initInnerTube();
