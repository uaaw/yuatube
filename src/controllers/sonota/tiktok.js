"use strict";
const express = require("express");
const router = express.Router();
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchTikTokData(inputUrl) {
    let url = inputUrl;
    // Follow redirects for short links (vm.tiktok.com etc)
    try {
        const r = await axios.get(inputUrl, {
            headers: { 'User-Agent': UA },
            maxRedirects: 5,
            timeout: 10000,
            validateStatus: () => true,
        });
        url = r.request?.res?.responseUrl || r.config?.url || inputUrl;
    } catch (_) {}

    const res = await axios.get(url, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8',
        },
        timeout: 15000,
        maxRedirects: 5,
    });

    const html = res.data;

    // __UNIVERSAL_DATA_FOR_REHYDRATION__
    const m1 = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (m1) {
        try {
            const data = JSON.parse(m1[1]);
            const scope = data?.['__DEFAULT_SCOPE__'];
            const detail = scope?.['webapp.video-detail'];
            const item = detail?.itemInfo?.itemStruct || detail?.itemList?.[0];
            if (item) return parseItem(item);
        } catch (_) {}
    }

    // SIGI_STATE
    const m2 = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);
    if (m2) {
        try {
            const data = JSON.parse(m2[1]);
            const items = data?.ItemModule;
            if (items) {
                const item = Object.values(items)[0];
                if (item) return parseItem(item);
            }
        } catch (_) {}
    }

    throw new Error('動画データを取得できませんでした（ページ構造が変わった可能性があります）');
}

function parseItem(item) {
    const v = item.video;
    const videoUrl =
        v?.playAddr ||
        v?.downloadAddr ||
        v?.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0] || '';
    return {
        videoId:    item.id || '',
        title:      item.desc || '',
        authorName: item.author?.nickname || item.author?.uniqueId || '',
        thumbnail:  v?.cover || v?.originCover || '',
        videoUrl,
    };
}

// TikTok CDN動画のプロキシ
router.get("/proxy", async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send('URLが必要です');
    if (!/^https?:\/\/(v[\w-]*\.(tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com)|[\w-]+\.tiktokv\.com)/.test(url)) {
        return res.status(400).send('無効なURL');
    }
    try {
        const upstream = await axios.get(url, {
            responseType: 'stream',
            headers: {
                'User-Agent': UA,
                'Referer': 'https://www.tiktok.com/',
                'Origin': 'https://www.tiktok.com',
            },
            timeout: 30000,
        });
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'video/mp4');
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        upstream.data.pipe(res);
    } catch (e) {
        res.status(500).send('プロキシエラー: ' + e.message);
    }
});

router.get("/", async (req, res) => {
    const url = (req.query.url || '').trim();
    if (!url) return res.render("sonota/tiktok/umekomi", { videoData: null, url: null, error: null });
    try {
        const videoData = await fetchTikTokData(url);
        res.render("sonota/tiktok/umekomi", { videoData, url, error: null });
    } catch (e) {
        res.render("sonota/tiktok/umekomi", { videoData: null, url, error: e.message });
    }
});

module.exports = router;
