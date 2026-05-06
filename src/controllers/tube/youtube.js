const express = require("express");
const router = express.Router();
const axios = require("axios");
const serverYt = require("../../server/youtube.js");

const INVIDIOUS_SERVERS = [
    'https://invidious.f5.si',
    'https://yt.omada.cafe',
    'https://invidious.ritoge.com',
    'https://invidious.darkness.services',
    'https://inv.zoomerville.com',
];

async function getInvidiousVideoData(videoId, preferredServer = null) {
    const servers = preferredServer
        ? [preferredServer, ...INVIDIOUS_SERVERS.filter(s => s !== preferredServer)]
        : INVIDIOUS_SERVERS;
    for (const server of servers) {
        try {
            const r = await axios.get(`${server}/api/v1/videos/${videoId}`, { timeout: 5000 });
            const streams = r.data?.formatStreams;
            if (streams?.length) {
                return { server, streams: [...streams].reverse() };
            }
        } catch (_) {}
    }
    throw new Error('利用可能なInvidiousサーバーが見つかりません');
}

router.get('/nocookie/:id', async (req, res) => {
    const videoId = req.params.id;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }
    try {
        const videosrc = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
        const Info = await serverYt.infoGet(videoId);
        const videoInfo = {
            title: Info.primary_info.title.text || "",
            channelId: Info.secondary_info.owner.author.id || "",
            channelIcon: Info.secondary_info.owner.author.thumbnails[0].url || '',
            channelName: Info.secondary_info.owner.author.name || "",
            channelSubsc: Info.secondary_info.owner.subscriber_count.text || "",
            published: Info.primary_info.published,
            viewCount: Info.primary_info.view_count.short_view_count?.text || Info.primary_info.view_count.view_count?.text || "",
            likeCount: Info.primary_info.menu.top_level_buttons.short_like_count || Info.primary_info.menu.top_level_buttons.like_count || Info.basic_info.like_count || "",
            description: Info.secondary_info.description.text || "",
            watch_next_feed: serverYt.normalizeWatchNextFeed(Info.watch_next_feed),
        };
        res.render('tube/umekomi/nocookie.ejs', { videosrc, videoInfo, videoId, playlist: req.query.playlist });
    } catch (error) {
        res.status(500).render('tube/mattev', {
            videoId,
            baseUrl: '',
            serverUrls: [],
            error: '動画を取得できません',
            details: error.message
        });
    }
});

router.get('/invidious/:id', async (req, res) => {
    const videoId = req.params.id;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).send('videoIDが正しくありません');
    }
    try {
        const preferredServer = req.query.server ? `https://${req.query.server}` : null;
        const [invResult, infoResult] = await Promise.allSettled([
            getInvidiousVideoData(videoId, preferredServer),
            serverYt.infoGet(videoId),
        ]);

        if (invResult.status === 'rejected') {
            throw invResult.reason;
        }

        const { server, streams } = invResult.value;

        let videoInfo = { title: videoId, channelId: '', channelIcon: '', channelName: '', channelSubsc: '', published: '', viewCount: '', likeCount: '', description: '', watch_next_feed: [] };
        if (infoResult.status === 'fulfilled') {
            const i = infoResult.value;
            videoInfo = {
                title: i.primary_info.title.text || "",
                channelId: i.secondary_info.owner.author.id || "",
                channelIcon: i.secondary_info.owner.author.thumbnails[0].url || '',
                channelName: i.secondary_info.owner.author.name || "",
                channelSubsc: i.secondary_info.owner.subscriber_count.text || "",
                published: i.primary_info.published,
                viewCount: i.primary_info.view_count.short_view_count?.text || i.primary_info.view_count.view_count?.text || "",
                likeCount: i.primary_info.menu.top_level_buttons.short_like_count || i.primary_info.menu.top_level_buttons.like_count || i.basic_info.like_count || "",
                description: i.secondary_info.description.text || "",
                watch_next_feed: serverYt.normalizeWatchNextFeed(i.watch_next_feed),
            };
        }

        res.render('tube/umekomi/invidious.ejs', { streams, videoInfo, videoId, server, servers: INVIDIOUS_SERVERS, playlist: req.query.playlist });
    } catch (error) {
        res.status(500).render('tube/mattev', {
            videoId,
            baseUrl: '',
            serverUrls: [],
            error: '動画を取得できません',
            details: error.message
        });
    }
});

module.exports = router;
