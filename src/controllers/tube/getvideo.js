const express = require("express");
const router = express.Router();
const axios = require("axios");
const serverYt = require("../../server/youtube.js");

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";
const VIDEO_SERVER = process.env.VIDEO_SERVER || "";

router.get('/:id', async (req, res) => {
    const videoId = req.params.id;

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }

    const cookies = parseCookies(req);
    const playlist = req.query.playlist;
    const playlistQuery = playlist ? `?playlist=${encodeURIComponent(playlist)}` : '';

    if (cookies.playbackMode === "nocookie") {
        return res.redirect(`/gen/yt/nocookie/${videoId}${playlistQuery}`);
    }

    if (cookies.playbackMode === "invidious" || !cookies.playbackMode) {
        return res.redirect(`/gen/yt/invidious/${videoId}${playlistQuery}`);
    }

    const customServer = req.query.server ? `https://${req.query.server}` : VIDEO_SERVER;
    let baseUrl = "direct";

    try {
        let videoData;
        let videoInfo;

        if (customServer) {
            try {
                const [serverRes, infoRes] = await Promise.all([
                    axios.get(`${customServer}/api/${videoId}`, {
                        headers: { 'User-Agent': user_agent },
                        timeout: 5000
                    }),
                    serverYt.infoGet(videoId)
                ]);
                if (serverRes.data?.stream_url) {
                    videoData = serverRes.data;
                    baseUrl = customServer;
                    videoInfo = buildVideoInfo(infoRes);
                }
            } catch (e) {
                console.log("external server failed, fallback to Innertube:", e.message);
            }
        }

        if (!videoData) {
            const result = await serverYt.getVideoData(videoId);
            videoData = result.videoData;
            videoInfo = result.videoInfo;
        }

        res.render('tube/watch.ejs', { videoData, videoInfo, videoId, baseUrl, playlist: req.query.playlist });
    } catch (error) {
        res.status(500).render('tube/mattev.ejs', {
            videoId,
            baseUrl,
            serverUrls: [],
            error: '動画を取得できません',
            details: error.message
        });
    }
});

function buildVideoInfo(info) {
    if (!info) return {};
    const pi = info.primary_info;
    const si = info.secondary_info;
    return {
        title: pi.title.text || "",
        channelId: si.owner.author.id || "",
        channelIcon: si.owner.author.thumbnails[0].url || '',
        channelName: si.owner.author.name || "",
        channelSubsc: si.owner.subscriber_count.text || "",
        published: pi.published,
        viewCount: pi.view_count.short_view_count?.text || pi.view_count.view_count?.text || "",
        likeCount: pi.menu.top_level_buttons.short_like_count || pi.menu.top_level_buttons.like_count || info.basic_info.like_count || "",
        description: si.description.text || "",
        watch_next_feed: serverYt.normalizeWatchNextFeed(info.watch_next_feed),
    };
}

function parseCookies(request) {
    const list = {};
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            let parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }
    return list;
}

module.exports = router;
