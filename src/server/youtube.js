let client = null;
const ytpl = require("ytpl");

function setClient(newClient) {
    client = newClient;
}

async function infoGet(id) {
    try {
        return await client.getInfo(id);
    } catch (error) {
        return;
    }
}

async function getVideoData(videoId) {
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
    try {
        return await client.search(q, { type: "all" });
    } catch (error) {
        return null;
    }
}

async function getComments(id) {
    if (!id) return;
    try {
        return await client.getComments(id);
    } catch (error) {
        return null;
    }
}

async function getChannel(id) {
    try {
        const channel = await client.getChannel(id);
        const recentVideos = await ytpl(id, { pages: 1 });
        return { channel, recentVideos };
    } catch (error) {
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

module.exports = {
    infoGet,
    getVideoData,
    setClient,
    search,
    getComments,
    getChannel,
    normalizeWatchNextFeed
};
