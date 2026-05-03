const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");

router.get('/history', (req, res) => {
    res.render('tube/cl/history.ejs');
});

router.get('/fav', (req, res) => {
    res.render('tube/cl/fav.ejs');
});

router.get('/setting', (req, res) => {
    res.render('tube/cl/setting.ejs');
});

router.get('/shistory', (req, res) => {
    res.render('tube/cl/serhistory.ejs');
});

module.exports = router;