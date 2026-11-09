// Vercel Function: /api/feed?after=<آخر رقم منشور>  → يرجع منشورات تيليغرام الجديدة (صور + فيديوهات + سعر)
const SRC = "toopmaroc", MAX_PAGES = 8;
const dec = s => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (m, c) => String.fromCharCode(+c));
const txt = h => dec(h.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).trim();

function parseMsgs(html) {
  const out = [];
  for (const b of html.split('<div class="tgme_widget_message_wrap').slice(1)) {
    const m = b.match(/data-post="[^"\/]+\/(\d+)"/); if (!m) continue;
    const imgs = [...b.matchAll(/tgme_widget_message_photo_wrap[^>]*?background-image:\s*url\(['"]?([^'")]+)/g)].map(x => dec(x[1]));
    const vids = [...b.matchAll(/<video[^>]*?\ssrc="([^"]+)"/g)].map(x => dec(x[1]));
    if (!imgs.length && vids.length) {   // فيديو بدون صورة: نستعمل صورة الغلاف
      const th = b.match(/tgme_widget_message_video_thumb[^>]*?background-image:\s*url\(['"]?([^'")]+)/);
      if (th) imgs.push(dec(th[1]));
    }
    const t = b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/), d = b.match(/<time[^>]*datetime="([^"]+)"/);
    out.push({ n: +m[1], imgs, vids, text: t ? txt(t[1]) : "", date: d ? d[1].slice(0, 10) : "" });
  }
  return out;
}

function price(t) {
  const m = t.match(/(\d{1,5}(?:[.,]\d+)?)\s*(?:dhs?|mad|درهم|د\.م)/i) || t.match(/(?:prix|السعر|ثمن)[^\d]{0,20}(\d{1,5})/i);
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
}

// الألبوم: الرسالة التي فيها نص تبدأ منتجا جديدا، والرسائل المتتالية بلا نص تنضم إليها
function group(msgs) {
  const out = []; let cur = null;
  for (const m of msgs.sort((a, b) => a.n - b.n)) {
    if (!m.imgs.length && !m.vids.length) continue;
    if (cur && !m.text && m.n === cur.end + 1) { cur.i.push(...m.imgs); cur.v.push(...m.vids); cur.end = m.n; continue; }
    cur = { n: m.n, end: m.n, i: [...m.imgs], v: [...m.vids], text: m.text, d: m.date }; out.push(cur);
  }
  return out;
}

function toProduct(g) {
  const lines = g.text.split("\n").map(s => s.trim()).filter(Boolean);
  const q = lines.map(l => l.match(/^(.{1,40}?)\s*[:=\-–]?\s*(\d{1,5})\s*(?:dhs?|mad|درهم)\s*$/i)).filter(Boolean).map(m => [m[1].trim(), +m[2]]);
  const title = lines.find(l => !/\d/.test(l) && l.length < 60) || null;
  return { n: g.n, t: title, o: price(g.text), i: g.i, v: g.v, d: g.d, x: "", q: q.length > 1 ? q : [] };
}

module.exports = async (req, res) => {
  const after = parseInt(req.query.after) || 0; let before = "", all = [];
  try {
    for (let k = 0; k < MAX_PAGES; k++) {
      const r = await fetch(`https://t.me/s/${SRC}${before ? "?before=" + before : ""}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) break;
      const msgs = parseMsgs(await r.text()); if (!msgs.length) break;
      all.push(...msgs); const min = Math.min(...msgs.map(m => m.n));
      if (min <= after + 1) break; before = min;
    }
    const seen = new Set(), uniq = all.filter(m => !seen.has(m.n) && seen.add(m.n));
    const products = group(uniq).filter(g => g.n > after).map(toProduct).filter(p => p.o > 0);
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({ products });
  } catch (e) { res.status(200).json({ products: [] }); }
};
module.exports._t = { parseMsgs, group, toProduct };
