const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.render("game/home");
});

router.get('/games/:id', async (req, res) => {
  const Id = req.params.id;
  res.render(`game/games/${Id}`);
});

module.exports = router;