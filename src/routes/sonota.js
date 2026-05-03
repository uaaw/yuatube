const express = require("express");
const router = express.Router();

const SERVICES = {
  tiktok:  { name: "TikTok",      hasOther: false, hasSearch: false },
  x:       { name: "X (Twitter)", hasOther: true,  hasSearch: false },
  niko:    { name: "ニコニコ動画", hasOther: false, hasSearch: true  },
  bluesky: { name: "Bluesky",     hasOther: false, hasSearch: true  }
};

router.get("/", (req, res) => {
  res.render("sonota/home");
});

router.get("/:service", (req, res) => {
  const service = req.params.service;
  if (!SERVICES[service]) {
    return res.status(404).render("error.ejs", {
      title: "404 Not found",
      content: "そのサービスは存在しないよ"
    });
  }
  res.render("sonota/select", { service, serviceInfo: SERVICES[service] });
});

router.use("/tiktok/umekomi", require("../controllers/sonota/tiktok"));
router.use("/niko",           require("../controllers/sonota/niko"));
router.use("/x",              require("../controllers/sonota/x"));
router.use("/bluesky",        require("../controllers/sonota/bluesky"));

module.exports = router;
