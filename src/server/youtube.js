let client = null;

function setClient(newClient) {
    client = newClient;
}

function isReady() {
    return !!client;
}

async function infoGet(id) {
    if (!client) return;
    try {
        return await client.getInfo(id);
    } catch (error) {
        return;
    }
}

async function getVideoData(videoId) {
    if (!client) throw new Error("YouTube client is not ready");
    const info = await client.getInfo(videoId);
    const sd = info.streaming_data;
    if (!sd) throw new Error("streaming_dataが取得できませんでした");

    const formats = sd.formats || [];
    const adaptive = sd.adaptive_formats || [];

    const stream_url = formats
        .filter(f => f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        [0]?.url || '';

    const videoAdaptive = adaptive.filter(f => f.url && f.quality_label && !f.audio_quality);

    const streamUrls = videoAdaptive
        .sort((a, b) => (parseInt(b.quality_label) || 0) - (parseInt(a.quality_label) || 0))
        .map(f => ({ url: f.url, resolution: f.quality_label }));

    const highstreamUrl = videoAdaptive
        .find(f => (f.mime_type || '').includes('webm') && f.quality_label === '1080p')
        ?.url || '';

    const audioUrl = adaptive
        .find(f => f.url && f.audio_quality && !f.quality_label && (f.mime_type || '').includes('audio/mp4'))
        ?.url || '';

    const pi = info.primary_info;
    const si = info.secondary_info;
    const videoInfo = {
        title: pi.title.text || "",
        channelId: si.owner.author.id || "",
        channelIcon: si.owner.author.thumbnails[0].url || '',
        channelName: si.owner.author.name || "",
        channelSubsc: si.owner.subscriber_count.text || "",
        published: pi.published,
        viewCount: pi.view_count.short_view_count?.text || pi.view_count.view_count?.text || "",
        likeCount: pi.menu.top_level_buttons.short_like_count || pi.menu.top_level_buttons.like_count || info.basic_info.like_count || "",
        description: si.description.text || "",
        watch_next_feed: normalizeWatchNextFeed(info.watch_next_feed),
    };

    const videoData = {
        stream_url,
        streamUrls,
        highstreamUrl,
        audioUrl,
        videoDes: si.description.text || "",
    };

    return { videoInfo, videoData };
}

async function search(q, page, limit) {
    if (!q) return;
    if (!client) return null;
    try {
        return await client.search(q, { type: "all" });
    } catch (error) {
        return null;
    }
}

async function getComments(id) {
    if (!id) return;
    if (!client) return null;
    try {
        return await client.getComments(id);
    } catch (error) {
        return null;
    }
}

async function getChannel(id) {
    if (!client) return null;
    try {
        const channel = await client.getChannel(id);

        let recentVideos = { items: [] };
        try {
            const videosTab = await channel.getVideos();
            const raw = videosTab.current_tab?.content?.contents || [];
            const items = raw.map(i => i.type === 'RichItem' ? i.content : i).filter(Boolean);
            recentVideos = { items };
        } catch (e) {
            console.error("[getChannel] getVideos failed:", e.message);
        }
        return { channel, recentVideos };
    } catch (error) {
        console.error("getChannel error:", error.message);
        return null;
    }
}

function normalizeWatchNextFeed(rawFeed) {
    const feed = Array.isArray(rawFeed) ? rawFeed : [];

    const expanded = [];
    for (const item of feed) {
        if (!item || !item.type) continue;
        if (item.type === 'CompactAutoplay' && Array.isArray(item.videos)) {
            for (const inner of item.videos) {
                if (inner && inner.type) expanded.push(inner);
            }
        } else {
            expanded.push(item);
        }
    }

    return expanded.map(item => {
        if (!item || !item.type) return null;
        if (item.type !== 'LockupView') return item;
        if (item.content_type !== 'VIDEO') return null;

        const rows = item.metadata?.metadata?.metadata_rows || [];
        const channelName = rows[0]?.metadata_parts?.[0]?.text?.text || '';
        const rawViewCount = rows[1]?.metadata_parts?.[0]?.text?.text || '';
        const publishedText = rows[1]?.metadata_parts?.[1]?.text?.text || '';
        const viewCountText = rawViewCount && !rawViewCount.includes('視聴')
            ? rawViewCount + '回視聴'
            : rawViewCount;

        const videoId = item.content_id
            || item.renderer_context?.command_context?.on_tap?.payload?.videoId
            || null;
        if (!videoId) return null;

        const channelId = item.metadata?.image?.renderer_context?.command_context?.on_tap?.payload?.browseId || '';
        const channelThumbUrl = item.metadata?.image?.avatar?.image?.[0]?.url || '';

        let durationText = '';
        for (const overlay of (item.content_image?.overlays || [])) {
            for (const badge of (overlay.badges || [])) {
                if (badge.text && /^\d/.test(badge.text)) {
                    durationText = badge.text;
                    break;
                }
            }
            if (durationText) break;
        }

        return {
            type: 'CompactVideo',
            id: videoId,
            title: { text: item.metadata?.title?.text || '' },
            author: {
                id: channelId,
                name: channelName,
                thumbnails: channelThumbUrl ? [{ url: channelThumbUrl }] : []
            },
            duration: durationText ? { text: durationText } : null,
            short_view_count: { text: viewCountText },
            published: publishedText ? { text: publishedText } : null
        };
    }).filter(Boolean);
}

async function download(videoId, options = {}) {
    if (!client) throw new Error("YouTube client is not ready");
    const opts = {
        type: 'video+audio',
        quality: 'best',
        ...options
    };
    return await client.download(videoId, opts);
}

module.exports = {
    infoGet,
    getVideoData,
    setClient,
    isReady,
    search,
    getComments,
    getChannel,
    normalizeWatchNextFeed,
    download
};
