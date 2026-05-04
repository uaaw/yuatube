"use strict";
const express = require("express");
const router = express.Router();
const axios = require("axios");

const BSKY = 'https://public.api.bsky.app/xrpc';
const BSKY_AUTH = 'https://bsky.social/xrpc';

let bskySession = null;

async function getBskyToken() {
    if (bskySession && Date.now() < bskySession.expiresAt) {
        return bskySession.accessJwt;
    }
    if (bskySession?.refreshJwt) {
        try {
            const r = await axios.post(`${BSKY_AUTH}/com.atproto.server.refreshSession`, null, {
                headers: { Authorization: `Bearer ${bskySession.refreshJwt}` },
                timeout: 8000,
            });
            bskySession = { accessJwt: r.data.accessJwt, refreshJwt: r.data.refreshJwt, expiresAt: Date.now() + 90 * 60 * 1000 };
            return bskySession.accessJwt;
        } catch (_) { bskySession = null; }
    }
    const identifier = process.env.BSKY_IDENTIFIER;
    const password = process.env.BSKY_PASSWORD;
    if (!identifier || !password) throw new Error('BSKY_IDENTIFIER / BSKY_PASSWORD が設定されていません');
    const r = await axios.post(`${BSKY_AUTH}/com.atproto.server.createSession`, { identifier, password }, { timeout: 8000 });
    bskySession = { accessJwt: r.data.accessJwt, refreshJwt: r.data.refreshJwt, expiresAt: Date.now() + 90 * 60 * 1000 };
    return bskySession.accessJwt;
}

function parseUrl(url) {
    // https://bsky.app/profile/{handle_or_did}/post/{rkey}
    const m = url.match(/bsky\.app\/profile\/([^/?#]+)\/post\/([a-z0-9]+)/i);
    if (m) return { actor: m[1], rkey: m[2] };
    return null;
}

async function getPost(actor, rkey) {
    // DIDを取得
    const profileRes = await axios.get(`${BSKY}/app.bsky.actor.getProfile`, {
        params: { actor },
        timeout: 8000,
    });
    const did = profileRes.data.did;

    const atUri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const threadRes = await axios.get(`${BSKY}/app.bsky.feed.getPostThread`, {
        params: { uri: atUri, depth: 0 },
        timeout: 8000,
    });
    return threadRes.data?.thread?.post || null;
}

router.get("/umekomi", async (req, res) => {
    const url = (req.query.url || '').trim();
    if (!url) return res.render("sonota/bluesky/umekomi", { post: null, url: null, error: null });

    const parsed = parseUrl(url);
    if (!parsed) {
        return res.render("sonota/bluesky/umekomi", {
            post: null, url,
            error: 'URLの形式が正しくありません（例: https://bsky.app/profile/user.bsky.social/post/xxxxx）',
        });
    }

    try {
        const post = await getPost(parsed.actor, parsed.rkey);
        if (!post) throw new Error('投稿が見つかりませんでした');
        res.render("sonota/bluesky/umekomi", { post, url, error: null });
    } catch (e) {
        res.render("sonota/bluesky/umekomi", { post: null, url, error: e.message });
    }
});

router.get("/search", async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.render("sonota/bluesky/search", { posts: null, q: '', error: null });

    try {
        const token = await getBskyToken();
        const r = await axios.get(`${BSKY}/app.bsky.feed.searchPosts`, {
            params: { q, limit: 25 },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 8000,
        });
        const posts = r.data?.posts || [];
        res.render("sonota/bluesky/search", { posts, q, error: null });
    } catch (e) {
        res.render("sonota/bluesky/search", { posts: null, q, error: e.message });
    }
});

module.exports = router;
