"use strict";
const express = require("express");
const router = express.Router();
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function extractNicoId(input) {
    const urlMatch = input.match(/nicovideo\.jp\/watch\/((?:sm|nm|so)\d+|\d+)/);
    if (urlMatch) return urlMatch[1];
    const idMatch = input.match(/^((?:sm|nm|so)\d+|\d+)$/);
    if (idMatch) return idMatch[1];
    return null;
}

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

async function getThumbInfo(videoId) {
    const res = await axios.get(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`, { timeout: 8000 });
    const xml = res.data;
    return {
        title:      decodeEntities(xml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || videoId),
        thumbnail:  xml.match(/<thumbnail_url>([\s\S]*?)<\/thumbnail_url>/)?.[1] || '',
        viewCount:  xml.match(/<view_counter>([\s\S]*?)<\/view_counter>/)?.[1] || '0',
        description: decodeEntities(xml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || ''),
    };
}

async function getVideoStream(videoId) {
    const watchRes = await axios.get(`https://www.nicovideo.jp/watch/${videoId}`, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'ja-JP,ja;q=0.9',
        },
        timeout: 15000,
        maxRedirects: 3,
    });

    const html = watchRes.data;

    // 方法1: data-api-data 属性
    let apiData = null;
    const attrMatch = html.match(/data-api-data="([^"]+)"/);
    if (attrMatch) {
        try { apiData = JSON.parse(decodeEntities(attrMatch[1])); } catch (_) {}
    }

    // 方法2: __NEXT_DATA__ スクリプトタグ
    if (!apiData) {
        const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
        if (nextMatch) {
            try {
                const nextData = JSON.parse(nextMatch[1]);
                apiData = nextData?.props?.pageProps?.initialState
                       || nextData?.props?.pageProps?.watchData
                       || nextData?.props?.pageProps;
            } catch (_) {}
        }
    }

    // 方法3: server-response スクリプトタグ
    if (!apiData) {
        const srMatch = html.match(/<script id="server-response"[^>]*>([^<]+)<\/script>/);
        if (srMatch) {
            try { apiData = JSON.parse(srMatch[1]); } catch (_) {}
        }
    }

    if (!apiData) throw new Error('動画データが見つかりません（ログインが必要な可能性があります）');

    const delivery = apiData?.media?.delivery?.movie
                  || apiData?.initialState?.media?.delivery?.movie
                  || apiData?.watchData?.media?.delivery?.movie;
    if (!delivery) throw new Error('配信データが見つかりません');

    // 直接URLがある場合
    if (delivery.contentUrl) {
        return { url: delivery.contentUrl, type: 'direct' };
    }

    // DMC APIでHLSストリームを取得
    const session = delivery.session;
    if (!session) throw new Error('セッションデータが見つかりません（ログインが必要な可能性があります）');

    return await createDmcSession(videoId, session);
}

async function createDmcSession(videoId, s) {
    const srcIdToMux = s.contentSrcIdSets?.[0]?.contentSrcIds?.[0]?.srcIdToMux;
    if (!srcIdToMux) throw new Error('ソースIDが見つかりません');

    const body = {
        session: {
            recipe_id: s.recipeId,
            content_id: s.contentId,
            content_type: 'movie',
            content_src_id_sets: [{
                content_src_ids: [{
                    src_id_to_mux: {
                        video_src_ids: srcIdToMux.videoSrcIds || [],
                        audio_src_ids: srcIdToMux.audioSrcIds || [],
                    }
                }]
            }],
            timing_constraint: 'unlimited',
            keep_method: { heartbeat: { lifetime: 120000 } },
            protocol: {
                name: 'http',
                parameters: {
                    http_parameters: {
                        parameters: {
                            hls_parameters: {
                                use_ssl: 'yes',
                                use_well_known_port: 'yes',
                                transfer_preset: '',
                                segment_duration: 6000,
                            }
                        }
                    }
                }
            },
            content_uri: '',
            session_operation_auth: {
                session_operation_auth_by_signature: {
                    token:     s.sessionOperationAuth?.sessionOperationAuthBySignature?.token || '',
                    signature: s.sessionOperationAuth?.sessionOperationAuthBySignature?.signature || '',
                }
            },
            content_auth: {
                auth_type: 'ht2',
                content_key_timeout: 600000,
                service_id: 'nicovideo',
                service_user_id: s.contentAuth?.serviceUserId || '0',
            },
            client_info: {
                player_id: s.clientInfo?.playerId || 'html5_ncp_hls-1.0.0',
            },
            priority: s.priority || 0,
        }
    };

    const dmcRes = await axios.post(
        'https://api.dmc.nico/api/sessions?_format=json',
        body,
        {
            headers: {
                'Content-Type': 'application/json',
                'Origin':  'https://www.nicovideo.jp',
                'Referer': `https://www.nicovideo.jp/watch/${videoId}`,
                'User-Agent': UA,
            },
            timeout: 12000,
        }
    );

    const sessionData = dmcRes.data?.data?.session;
    const hlsUrl = sessionData?.content_uri;
    if (!hlsUrl) throw new Error('HLS URLが取得できませんでした');

    // ハートビートでセッションを維持（最大10分）
    if (sessionData?.id) {
        startHeartbeat(sessionData.id, sessionData, videoId);
    }

    return { url: hlsUrl, type: 'hls' };
}

const heartbeats = new Map();

function startHeartbeat(sessionId, sessionObj, videoId) {
    let count = 0;
    const id = setInterval(async () => {
        if (++count > 15) { clearInterval(id); heartbeats.delete(sessionId); return; }
        try {
            await axios.post(
                `https://api.dmc.nico/api/sessions/${sessionId}?_format=json&_method=PUT`,
                { session: sessionObj },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin':  'https://www.nicovideo.jp',
                        'Referer': `https://www.nicovideo.jp/watch/${videoId}`,
                    },
                    timeout: 5000,
                }
            );
        } catch (_) { clearInterval(id); heartbeats.delete(sessionId); }
    }, 40000);
    heartbeats.set(sessionId, id);
}

router.get("/umekomi", async (req, res) => {
    const input = (req.query.url || '').trim();
    if (!input) return res.render("sonota/niko/umekomi", { nicoData: null, input: null, error: null });

    const videoId = extractNicoId(input);
    if (!videoId) {
        return res.render("sonota/niko/umekomi", { nicoData: null, input, error: 'URLまたは動画IDが正しくありません' });
    }

    const [thumbResult, streamResult] = await Promise.allSettled([
        getThumbInfo(videoId),
        getVideoStream(videoId),
    ]);

    const meta   = thumbResult.status === 'fulfilled'  ? thumbResult.value  : { title: videoId, thumbnail: '', viewCount: '0', description: '' };
    const stream = streamResult.status === 'fulfilled' ? streamResult.value : null;
    const streamError = streamResult.status === 'rejected' ? streamResult.reason?.message : null;

    res.render("sonota/niko/umekomi", {
        nicoData: { ...meta, videoId, stream },
        input,
        error: streamError,
    });
});

router.get("/search", async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.render("sonota/niko/search", { videos: null, q: '', error: null });

    try {
        const r = await axios.get('https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search', {
            params: {
                q,
                targets: 'title,description,tags',
                fields: 'contentId,title,thumbnailUrl,viewCounter,lengthSeconds',
                _sort: '-viewCounter',
                _limit: 20,
                _context: 'youtube-site',
            },
            headers: { 'User-Agent': UA },
            timeout: 8000,
        });
        const videos = r.data?.data || [];
        res.render("sonota/niko/search", { videos, q, error: null });
    } catch (e) {
        res.render("sonota/niko/search", { videos: null, q, error: e.message });
    }
});

module.exports = router;
