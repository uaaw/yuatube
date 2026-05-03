const express = require("express");
const router = express.Router();

router.get("/mode/:id", (req, res) => {
    const mode = req.query.mode;
    const videoId = req.params.id;
    if (mode === 'nocookie') {
        res.redirect(`/gen/yt/nocookie/${videoId}`);
    } else if (mode === 'invidious') {
        res.redirect(`/gen/yt/invidious/${videoId}`);
    } else {
        res.redirect(`/gen/watch/${videoId}`);
    }
});

module.exports = router;
