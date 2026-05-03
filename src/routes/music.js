const express = require("express");
const router = express.Router();
const path = require("path");
const scdl = require('soundcloud-downloader').default;

router.get('/', (req, res) => {
    res.render('music/home', { tracks: [] , query: [] });
});

router.get('/s', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).send('Search query is required');
    }
    try {
        const searchResults = await scdl.search({ query: query, resourceType: 'tracks' });
        const tracks = searchResults.collection.slice(0, 10).map(track => ({
            id: track.id,
            title: track.title,
            username: track.user.username,
            artwork_url: track.artwork_url ? track.artwork_url.replace('-large', '-t500x500') : 'https://via.placeholder.com/500'
        }));

        res.render('music/home', { tracks: tracks , query: query });
    } catch (error) {
        console.error('Error occurred while searching:', error);
        res.status(500).send('えらーだよ!あちゃー');
    }
});

router.get('/f', (req, res) => {
    res.render('music/favorite');
});

module.exports = router;