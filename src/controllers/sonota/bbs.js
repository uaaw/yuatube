"use strict";
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "../../data/bbs.json");

// Get or create anonymous user ID from cookie
function getUserId(req, res) {
    let uid = req.cookies && req.cookies.bbs_uid;
    if (!uid) {
        uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        res.cookie('bbs_uid', uid, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    }
    return uid;
}

// Ensure data directory exists
function ensureDataDir() {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Load posts
function loadPosts() {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch {
        return [];
    }
}

// Save posts
function savePosts(posts) {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
}

// GET /sonota/bbs - Show all posts
router.get("/", (req, res) => {
    const posts = loadPosts();
    const userId = getUserId(req, res);
    res.render("sonota/bbs/index", { posts, error: null, userId });
});

// POST /sonota/bbs - Create a new post
router.post("/", (req, res) => {
    const { username, message } = req.body;
    const error = [];

    if (!username || username.trim().length === 0) error.push("ユーザーネームを入力してください");
    if (!message || message.trim().length === 0) error.push("メッセージを入力してください");
    if (username && username.length > 20) error.push("ユーザーネームは20文字以内");
    if (message && message.length > 500) error.push("メッセージは500文字以内");

    if (error.length > 0) {
        const posts = loadPosts();
        return res.render("sonota/bbs/index", { posts, error: error.join("、") });
    }

    const userId = getUserId(req, res);
    const posts = loadPosts();
    posts.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        userId: userId,
        username: username.trim(),
        message: message.trim(),
        timestamp: new Date().toISOString()
    });

    // Keep max 200 posts
    if (posts.length > 200) posts.length = 200;

    savePosts(posts);
    res.redirect("/sonota/bbs");
});

// DELETE /sonota/bbs/:id - Delete a post (only by original author)
router.post("/delete", (req, res) => {
    const { id } = req.body;
    if (!id) return res.redirect("/sonota/bbs");

    const userId = getUserId(req, res);
    let posts = loadPosts();
    const post = posts.find(p => p.id === id);

    if (!post || post.userId !== userId) {
        return res.redirect("/sonota/bbs");
    }

    posts = posts.filter(p => p.id !== id);
    savePosts(posts);
    res.redirect("/sonota/bbs");
});

module.exports = router;
