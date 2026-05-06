const express = require("express");
const router = express.Router();

router.get("/mode/:id", (req, res) => {
    const mode = req.query.mode;
    const videoId = req.params.id;
    const playlist = req.query.playlist;
    const playlistQuery = playlist ? `?playlist=${encodeURIComponent(playlist)}` : '';
    if (mode === 'nocookie') {
        res.redirect(`/gen/yt/nocookie/${videoId}${playlistQuery}`);
    } else if (mode === 'invidious') {
        res.redirect(`/gen/yt/invidious/${videoId}${playlistQuery}`);
    } else {
        res.redirect(`/gen/watch/${videoId}${playlistQuery}`);
    }
});

module.exports = router;
