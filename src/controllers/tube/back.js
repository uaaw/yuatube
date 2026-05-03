const axios = require("axios");
const express = require("express");
const router = express.Router();
const path = require("path");
const http = require('http');
const undici = require("undici");
const miniget = require("miniget");
const bodyParser = require("body-parser");
const serverYt = require("../../server/youtube.js");

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

const user_agent = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get('/suggest', (req, res) => {
    const keyword = req.query.keyword;
    const options = {
        hostname: 'www.google.com',
        path: `/complete/search?client=youtube&hl=ja&ds=yt&q=${encodeURIComponent(keyword)}`,
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    };
    const request = http.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            const jsonString = data.substring(data.indexOf('['), data.lastIndexOf(']') + 1);

            try {
                const suggestionsArray = JSON.parse(jsonString);
                const suggestions = suggestionsArray[1].map(i => i[0]);
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.json(suggestions);
            } catch (error) {
                console.error('JSON parse error:', error);
                res.status(500).send({ error: 'えらー。あらら' });
            }
        });
    });
    request.on('error', (error) => {
        console.error('Request error:', error);
        res.status(500).send({ error: 'えらー。あらら' });
    });
    request.end();
});

router.get("/vi*", async (req, res) => {
  let headersForwarded = false;
  const range = req.headers.range;
  try {
    const request = await undici.request("https://i.ytimg.com" + req.url, {
      headers: {
        "User-Agent": user_agent,
        ...(range && { range })
      },
      maxRedirections: 4
    });
    res.status(request.statusCode);
    if (!headersForwarded) {
      for (const h of ["Accept-Ranges", "Content-Type", "Content-Range", "Content-Length", "Cache-Control"]) {
        const headerValue = request.headers[h.toLowerCase()];
        if (headerValue) res.setHeader(h, headerValue);
      }
      headersForwarded = true;
    }
    request.body.pipe(res);
    request.body.on('error', err => {
      console.error(err);
      res.status(500).send(err.toString());
    });
  } catch (err) {
    const stream = miniget(`https://i.ytimg.com${req.url.split("?")[0]}`, {
      headers: {
        "User-Agent": user_agent
      }
    });
    stream.on('error', err => {
      console.error("minigetエラー:", err);
      res.status(500).send(err.toString());
    });
    stream.pipe(res);
  }
});

router.get(["/yt3/*", "/ytc/*"], async (req, res) => {
  let url = null;
  if (req.url.startsWith("/yt3/")){
    url = req.url.slice(4);
  }else{
    url = req.url;
  }
  let headersForwarded = false;
  let errLength = 0;
  const range = req.headers.range;
  try {
    const request = await undici.request("https://yt3.ggpht.com" + url, {
      headers: {
        "User-Agent": user_agent,
        range
      },
      maxRedirections: 4
    })
    if (!headersForwarded) {
      res.status(request.statusCode);
      for (const h of ["Accept-Ranges", "Content-Type", "Content-Range", "Content-Length", "Cache-Control"]) {
        const headerValue = request.headers[h.toLowerCase()];
        if (headerValue) res.setHeader(h, headerValue);
      }
    }
    errLength = 0;
    request.body.pipe(res);
  } catch (err) {
    res.destroy();
  }
});

router.get('/comment/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const cm = await serverYt.getComments(id);
        res.render('tube/back/comment', { cm });
   } catch (error) {
        res.status(500).render('error', { 
      id, 
      error: 'コメントを取得できません', 
      details: error.message 
    });
  }
});

router.get('/next/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const videoInfo = await serverYt.infoGet(id);
        res.render('tube/back/next', { videoInfo });
   } catch (error) {
        res.status(500).render('error', { 
      id, 
      error: 'コメントを取得できません', 
      details: error.message 
    });
  }
});

router.get("/info/:id", async (req, res) => {
  try {
		res.json(await serverYt.infoGet(req.params.id));
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "youtube.js Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get("/nextvideo/:id", async (req, res) => {
  try {
    const info = await serverYt.infoGet(req.params.id)
    if(info.watch_next_feed){
      res.json(info.watch_next_feed);
    }
    
    throw new Error(`Failed to get nextvideo`);
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "youtube.js Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get('/stream/api/:id', async (req, res) => {
    try {
        const { videoData } = await serverYt.getVideoData(req.params.id);
        res.json(videoData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/search", async (req, res) => {
	let query = req.query.q;
	let page = Number(req.query.p || 1);
    try {
		res.render("tube/back/search.ejs", {
			res: await serverYt.search(query),
			query: query,
			page
		});
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "ytsr Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

router.get("/tensai/refresh", async (req, res) => {
  try {
    await serverYt.getapis();
		res.json("ok");
	} catch (error) {
		console.error(error);
		try {
			res.status(500).render("error.ejs", {
				title: "Error",
				content: error
			});
		} catch (error) {
			console.error(error);
		}
	}
});

module.exports = router;
