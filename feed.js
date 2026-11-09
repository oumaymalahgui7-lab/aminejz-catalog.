// Vercel function: reads the public Telegram channel page and returns posts newer than ?after=<id> as catalog products.
const CH = "toopmaroc";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const EMO = /[\u{1F000}-\u{1FAFF}☀-➿⭐⬆️‍]+/gu;
const PRICE = /(\d+(?:[.,]\d+)?)\s*(?:dhs?|dirhams?|درهم|دراهم)(?![\p{L}])/iu;
const SUPPLIER = /(?:📞\s*)?too?p\s*maroc\s*:?/gi;

const decode = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const htmlToText = h => decode(h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
const junk = s => !s.replace(EMO, "").replace(/[\s:：\-–—_=.|,،•*]+/g, "");

function parseBlock(b) {
  const id = +(b.match(/data-post="[^"/]+\/(\d+)"/) || [])[1];
  if (!id) return null;
  const photos = [...b.matchAll(/tgme_widget_message_photo_wrap[^>]*?background-image:\s*url\((?:&quot;|["'])?([^)"']+?)(?:&quot;|["'])?\)/g)].map(m => decode(m[1]));
  const thumbs = [...b.matchAll(/tgme_widget_message_(?:round)?video_thumb[^>]*?background-image:\s*url\((?:&quot;|["'])?([^)"']+?)(?:&quot;|["'])?\)/g)].map(m => decode(m[1]));
  const videos = [...new Set([...b.matchAll(/<video[^>]*?\ssrc="([^"]+)"/g)].map(m => decode(m[1])))];
  const tm = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const date = (b.match(/<time[^>]*datetime="([^"]+)"/) || [])[1] || "";
  return { id, photos, thumbs, videos, text: tm ? htmlToText(tm[1]) : "", date: date.slice(0, 10) };
}

function toProduct(m) {
  const lines = m.text.replace(SUPPLIER, "").split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(l => !junk(l));
  const tiers = []; const keep = []; let o = null;
  for (const l of lines) {
    const pm = l.match(PRICE), bare = l.replace(EMO, "").trim().match(/^(\d+(?:[.,]\d+)?)$/);
    if (pm || bare) {
      const price = parseFloat(((pm || bare)[1]).replace(",", "."));
      let label = pm ? (l.slice(0, pm.index) + " " + l.slice(pm.index + pm[0].length)) : "";
      label = label.replace(EMO, " ").replace(/\s+/g, " ").trim().replace(/^[\s:：\-–|=+]+|[\s:：\-–|=+]+$/g, "");
      if (/^(ال[ثت]من|prix|price|السعر|ب)$/i.test(label)) label = "";
      if (label.length > 40 || label.split(" ").length > 6) { keep.push(l.replace(PRICE, "").trim()); if (o === null) o = price; continue; }
      if (o === null) { o = price; if (!label) continue; }
      if (price === o && !label) continue;
      tiers.push([label.replace(/^(\d+)\s*pcs$/i, "$1 pcs فأكثر"), price]);
    } else keep.push(l);
  }
  if (o === null) return null;                       // no price found: skip
  let t = null;
  for (let i = 0; i < keep.length; i++) { const c = keep[i].replace(EMO, "").trim(); if (c.length >= 2 && c.length <= 50 && !/^(colis|pack\b|\+?\s*\d+\s*pcs)/i.test(c)) { t = c; keep.splice(i, 1); break; } }
  return { n: m.id, t, o, i: m.photos.length ? m.photos : m.thumbs, v: m.videos, d: m.date, x: keep.join("\n"), q: tiers };
}

export default async function handler(req, res) {
  const after = parseInt(req.query.after) || 0;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=120");
  try {
    const out = []; let before = 0, skipped = 0;
    for (let page = 0; page < 10; page++) {
      const r = await fetch(`https://t.me/s/${CH}` + (before ? `?before=${before}` : ""), { headers: { "User-Agent": UA } });
      if (!r.ok) break;
      const html = await r.text();
      const blocks = html.split(/<div class="tgme_widget_message_wrap/).slice(1).map(parseBlock).filter(Boolean);
      if (!blocks.length) break;
      let minId = Infinity;
      for (const b of blocks) {
        minId = Math.min(minId, b.id);
        if (b.id > after && (b.photos.length || b.thumbs.length)) { const p = toProduct(b); if (p) out.push(p); else skipped++; }
      }
      if (minId <= after + 1 || minId === Infinity) break;
      before = minId;
    }
    res.status(200).json({ products: out.sort((a, b) => a.n - b.n), skipped });
  } catch (e) {
    res.status(200).json({ products: [], error: String(e) });
  }
}
