"use strict";
const express = require("express");
const router = express.Router();
const { Readable } = require("stream");
const serverYt = require("../../../server/youtube.js");

/**
 * Extract video ID from various YouTube URL formats.
 * @param {string} rawUrl
 * @returns {string|null}
 */
function extractVideoId(rawUrl) {
    if (!rawUrl) return null;

    const trimmed = rawUrl.trim();

    // Bare 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }

    try {
        const url = new URL(trimmed);
        const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

        if (hostname === "youtube.com" || hostname === "m.youtube.com") {
            // /watch?v=VIDEO_ID
            if (url.pathname === "/watch") {
                const v = url.searchParams.get("v");
                if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
            }
            // /shorts/VIDEO_ID
            if (url.pathname.startsWith("/shorts/")) {
                const id = url.pathname.split("/")[2];
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
            }
            // /embed/VIDEO_ID
            if (url.pathname.startsWith("/embed/")) {
                const id = url.pathname.split("/")[2];
                if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
            }
        }

        // youtu.be/VIDEO_ID
        if (hostname === "youtu.be") {
            const id = url.pathname.slice(1).split("/")[0];
            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
        }
    } catch {
        // Invalid URL
    }

    return null;
}

/**
 * GET /info
 * Returns video metadata as JSON.
 * Query params: url (required)
 */
router.get("/info", async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: "URLが入力されていません" });
    }
    if (url.length > 2048) {
        return res.status(400).json({ error: "URLが長すぎます" });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: "無効なYouTube URLです" });
    }

    try {
        const info = await serverYt.infoGet(videoId);
        if (!info) {
            return res.status(500).json({ error: "動画情報を取得できませんでした" });
        }

        const basic = info.basic_info || {};
        const thumbnails = basic.thumbnail || [];

        res.json({
            title: basic.title || "",
            channelName: basic.author || "",
            thumbnailUrl: thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : "",
            duration: basic.duration || 0,
            videoId: basic.id || videoId
        });
    } catch (error) {
        res.status(500).json({ error: "動画情報の取得に失敗しました: " + error.message });
    }
});

/**
 * GET /download
 * Downloads the video/audio as a stream.
 * Query params: url (required), type (optional, default: video+audio), quality (optional, default: best)
 */
router.get("/download", async (req, res) => {
    const url = req.query.url;
    const type = req.query.type || "video+audio";
    const quality = req.query.quality || "best";

    if (!url) {
        return res.status(400).json({ error: "URLが入力されていません" });
    }
    if (url.length > 2048) {
        return res.status(400).json({ error: "URLが長すぎます" });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
        return res.status(400).json({ error: "無効なYouTube URLです" });
    }

    let streamError = false;

    try {
        // Get video info for the filename
        const info = await serverYt.infoGet(videoId);
        const title = info?.basic_info?.title || videoId;

        // Determine file extension
        const ext = type === "audio" ? ".m4a" : ".mp4";
        const encodedFilename = encodeURIComponent(title) + ext;

        // Get download stream (Web ReadableStream)
        const webStream = await serverYt.download(videoId, { type, quality });
        const nodeStream = Readable.fromWeb(webStream);

        // Set proper Content-Type per format
        let contentType;
        if (type === "video+audio" || type === "video") {
            contentType = "video/mp4";
        } else if (type === "audio") {
            contentType = "audio/mp4";
        } else {
            contentType = "application/octet-stream";
        }

        // Set response headers
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Transfer-Encoding", "chunked");

        // Pipe the stream to response
        nodeStream.pipe(res);

        // Cleanup on client disconnect
        req.on("close", () => {
            if (!nodeStream.destroyed) {
                nodeStream.destroy();
            }
        });

        // Handle stream errors mid-download
        nodeStream.on("error", (err) => {
            console.error("Download stream error:", err.message);
            streamError = true;
            if (!res.headersSent) {
                res.status(500).json({ error: "ダウンロード中にエラーが発生しました" });
            } else {
                res.destroy();
            }
        });
    } catch (error) {
        console.error("Download setup error:", error.message);
        if (!streamError && !res.headersSent) {
            res.status(500).json({ error: "ダウンロードの準備に失敗しました: " + error.message });
        } else {
            res.destroy();
        }
    }
});

module.exports = router;
