const axios = require('axios');
const express = require("express");
const router = express.Router();

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get('/gethtml/:Url', async (req, res) => {
  const { Url } = req.params;
  const replacedUrl = decodeURIComponent(Url);
  const url = replacedUrl.replace(/\.wakame02\./g, '.');
  if (!url) {
    return res.status(400).send('URLが入力されていません');
  }
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': user_agent,
        'Accept-Language': 'ja;q=1.0,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });
    const html = response.data;
    res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>View Source: ${url}</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/google/code-prettify@master/loader/prettify.css">
                <style>
                    body {
                        color: #d4d4d4;
                        font-family: monospace;
                        margin: 0;
                        padding: 8px;
                    }
                    pre {
                        background-color: #252526;
                        padding: 5px;
                        border-radius: 5px;
                        overflow: auto;
                        white-space: pre-wrap;
                        word-break: break-word;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body onload="PR.prettyPrint()">
                <pre class="prettyprint lang-html linenums">${escapeHTML(response.data)}</pre>
                <script src="https://cdn.jsdelivr.net/gh/google/code-prettify@master/loader/run_prettify.js?skin=sons-of-obsidian"></script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`<h1>エラー: ${error.message}</h1>`);
    }
});

function escapeHTML(html) {
    return html.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

router.get('/get/:Url', async (req, res) => {
  const { Url } = req.params;
  const replacedUrl = decodeURIComponent(Url);
  const url = replacedUrl.replace(/\.wakame02\./g, '.');
  const baseUrl = new URL(url);
  if (!url) {
    return res.status(400).send('URLが入力されていません');
  }
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': user_agent,
        'Accept-Language': 'ja;q=1.0,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      }
    });
    let html = response.data;
    html = html.replace(/<a\s+([\s\S]*?)href="([\s\S]*?)"([\s\S]*?)>([\s\S]*?)<\/a>/g, (match, beforeHref, url, afterHref, innerText) => {
      let absoluteUrl;

      try {
        if (url.startsWith('http') || url.startsWith('https')) {
          absoluteUrl = url;
        } else {
          absoluteUrl = new URL(url, baseUrl).href;
        }
      } catch (e) {
        console.error('Error parsing URL:', url, e);
        return match;
      }
      const replacedAbsoluteUrl = absoluteUrl.replace(/\./g, '.wakame02.');
      const encoded = encodeURIComponent(replacedAbsoluteUrl);
      return `<a ${beforeHref}href="/tools/html/get/${encoded}"${afterHref}>${innerText}</a>`;
    });
    res.send(html);
    } catch (error) {
        res.status(500).send(`<h1>エラー: ${error.message}</h1>`);
    }
});

module.exports = router;