"use strict";
const express = require("express");
const router = express.Router();

let _twitterApi = null;

async function getClient() {
    const { TwitterOpenApi } = require("twitter-openapi-typescript");
    if (!_twitterApi) _twitterApi = new TwitterOpenApi();
    return _twitterApi.getGuestClient();
}

function extractTweet(result) {
    if (!result) return null;
    const legacy = result.legacy;
    if (!legacy) return null;
    const user = result.core?.userResults?.result?.legacy;
    return {
        id:         legacy.idStr        || legacy.id_str        || '',
        text:       legacy.fullText     || legacy.full_text     || '',
        createdAt:  legacy.createdAt    || legacy.created_at    || '',
        likes:      legacy.favoriteCount  ?? legacy.favorite_count  ?? 0,
        retweets:   legacy.retweetCount   ?? legacy.retweet_count   ?? 0,
        replies:    legacy.replyCount     ?? legacy.reply_count     ?? 0,
        userName:   user?.name                                       || '',
        screenName: user?.screenName    || user?.screen_name         || '',
        userImage:  user?.profileImageUrlHttps || user?.profile_image_url_https || '',
    };
}

function extractTweets(data) {
    if (!Array.isArray(data)) return [];
    const results = [];
    for (const item of data) {
        try {
            const tweet = item?.content?.itemContent?.tweetResults?.result;
            const t = extractTweet(tweet);
            if (t) results.push(t);
        } catch (_) {}
    }
    return results;
}

// 単一ポスト表示（twitter-openapi-typescript でネイティブ取得）
router.get("/umekomi", async (req, res) => {
    const url = (req.query.url || '').trim();
    if (!url) return res.render("sonota/x/umekomi", { tweet: null, url: null, error: null });

    const idMatch = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
    if (!idMatch) {
        return res.render("sonota/x/umekomi", { tweet: null, url, error: 'URLの形式が正しくありません（例: https://x.com/user/status/xxxxx）' });
    }

    try {
        const client = await getClient();
        const tweetId = idMatch[1];
        const tweetRes = await client.getTweetApi().getTweetDetail({ focalTweetId: tweetId });
        const data = tweetRes.data?.data;
        let tweet = null;
        for (const item of (Array.isArray(data) ? data : [])) {
            const result = item?.content?.itemContent?.tweetResults?.result;
            const t = extractTweet(result);
            if (t && t.id === tweetId) { tweet = t; break; }
        }
        if (!tweet && Array.isArray(data) && data.length > 0) {
            const result = data[0]?.content?.itemContent?.tweetResults?.result;
            tweet = extractTweet(result);
        }
        if (!tweet) throw new Error('ツイートが見つかりませんでした');
        res.render("sonota/x/umekomi", { tweet, url, error: null });
    } catch (e) {
        console.error("X umekomi error:", e.message);
        res.render("sonota/x/umekomi", { tweet: null, url, error: e.message });
    }
});

// タイムライン・検索
router.get("/other", async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.render("sonota/x/other", { tweets: null, q: null, error: null });
    try {
        const client = await getClient();
        let rawData;
        if (q.startsWith('@')) {
            const screenName = q.slice(1);
            const userRes = await client.getUserApi().getUserByScreenName({ screenName });
            const userId  = userRes.data?.user?.result?.restId
                         || userRes.data?.data?.user?.result?.restId;
            if (!userId) throw new Error('ユーザーが見つかりませんでした');
            const twRes = await client.getTweetApi().getUserTweets({ userId, count: 20 });
            rawData = twRes.data?.data ?? twRes.data;
        } else {
            const api = client.getTweetApi();
            const searchFn = api.getSearchTimeline?.bind(api) || api.searchTimeline?.bind(api);
            if (!searchFn) throw new Error('キーワード検索は現在このバージョンでは利用できません');
            const searchRes = await searchFn({ rawQuery: q, product: 'Latest' });
            rawData = searchRes.data?.data ?? searchRes.data;
        }
        const tweets = extractTweets(rawData);
        res.render("sonota/x/other", { tweets, q, error: null });
    } catch (e) {
        console.error("X API error:", e.message);
        res.render("sonota/x/other", { tweets: null, q, error: e.message });
    }
});

module.exports = router;
