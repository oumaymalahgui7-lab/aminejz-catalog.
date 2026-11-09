const REPO = process.env.GH_REPO || "oumaymalahgui7-lab/aminejz-catalog";
const FILE = "settings.json";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  let b = req.body || {};
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch { b = {}; }
  }

  if (!process.env.ADMIN_PASSWORD || b.password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ ok: false, error: "password" });

  const m = Number(b.margin);
  if (!(m >= 0 && m <= 1000))
    return res.status(400).json({ ok: false, error: "margin" });

  const H = {
    Authorization: "Bearer " + (process.env.GITHUB_TOKEN || "").trim(),
    "User-Agent": "aminejz",
    Accept: "application/vnd.github+json",
  };
  const url = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

  try {
    let sha, cur = {};
    const g = await fetch(url, { headers: H });
    if (g.ok) {
      const j = await g.json();
      sha = j.sha;
      try {
        cur = JSON.parse(Buffer.from(j.content, "base64").toString("utf8"));
      } catch {}
    } else if (g.status !== 404) {
      console.error("GH_GET", g.status, (await g.text()).slice(0, 300));
    }

    cur.margin = m;
    if (!cur.prices) cur.prices = {};

    co
