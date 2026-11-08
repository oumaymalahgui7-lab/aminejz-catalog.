export default async function handler(req, res) {
  const u = req.query.url || "";
  if (!/^https:\/\/(cdn\d*\.telesco\.pe|t\.me)\//.test(u)) return res.status(400).send("bad url");
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://t.me/" } });
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=2592000, max-age=2592000");
  res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
  res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
}
