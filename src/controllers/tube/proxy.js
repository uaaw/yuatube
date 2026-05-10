const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getInvidiousVideoData, HOST_REGEX } = require('./youtube.js');

router.get('/invidious/:id', async (req, res) => {
    const videoId = req.params.id;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }
    try {
        const preferredServer = req.query.server && HOST_REGEX.test(req.query.server) ? `https://${req.query.server}` : null;
        const fastestServer = req.query.fastest && HOST_REGEX.test(req.query.fastest) ? `https://${req.query.fastest}` : null;
        const { streams } = await getInvidiousVideoData(videoId, preferredServer, fastestServer);
        const streamUrl = streams[0]?.url;
        if (!streamUrl) throw new Error('ストリームURLが取得できません');

        const axiosOptions = {
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };
        if (req.headers.range) {
            axiosOptions.headers['Range'] = req.headers.range;
        }

        const streamRes = await axios(axiosOptions);
        const headersToForward = ['content-type', 'content-length', 'accept-ranges', 'cache-control', 'content-range'];
        headersToForward.forEach(h => {
            const val = streamRes.headers[h];
            if (val) res.setHeader(h, val);
        });
        if (req.headers.range) {
            res.status(206);
        }
        streamRes.data.on('error', (err) => {
            console.error('Proxy stream read error:', err.message);
            if (!res.headersSent) res.status(500).end();
            else res.end();
        });
        res.on('error', (err) => {
            console.error('Proxy stream write error:', err.message);
            streamRes.data.destroy();
        });
        streamRes.data.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error.message);
        if (!res.headersSent) {
            res.status(500).send('動画プロキシに失敗しました: ' + error.message);
        }
    }
});

module.exports = router;
