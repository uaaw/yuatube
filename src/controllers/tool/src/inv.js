const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const bodyParser = require("body-parser");

const PORT = 3000;
const MAX_API_WAIT_TIME = 5000;
const videoId = "beFiVQcwVY8";

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

async function fetchStreamUrls(videoId, invidiousapis) {
  let successUrls = [];
  let errorUrls = [];

  for (const instance of invidiousapis) {
    try {
      const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
      
      if (response.data && response.data.formatStreams) {
        const formatStreams = response.data.formatStreams || [];
        let streamUrl = formatStreams.reverse().map(stream => stream.url)[0];
        successUrls.push({ api: instance, streamUrl });
      } else {
        console.error(`formatStreamsが存在しない: ${instance}`);
        errorUrls.push(instance);
      }
    } catch (error) {
      console.error(`エラー: ${instance} - ${error.message}`);
      errorUrls.push(instance);
    }
  }

  return { successUrls, errorUrls };
}

router.post("/check", async (req, res) => {
  const urls = req.body.urls;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "APIのURLを入力してください。" });
  }

  const invidiousapis = urls.map(url => url.match(/https?:\/\/[^\s]+/g)).filter(Boolean).flat();
  if (invidiousapis.length === 0) {
    return res.status(400).json({ error: "APIのURLを入力してください。" });
  }

  try {
    const { successUrls, errorUrls } = await fetchStreamUrls(videoId, invidiousapis);
    
    res.json({ successUrls, errorUrls });
  } catch (error) {
    res.status(500).json({ error: "エラーが発生しました: " + error.message });
  }
});

module.exports = router;