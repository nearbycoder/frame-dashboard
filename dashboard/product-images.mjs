// Public product CDN only; Ring authorization is never involved in image requests.
export function productImageURL(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.host !== 'i5.walmartimages.com' || u.username || u.password || u.hash
        || !/^\/(seo|asr)\/[A-Za-z0-9_.-]{1,1000}\.(jpeg|jpg|png|webp)$/.test(u.pathname)) return null;
    u.search = 'odnHeight=240&odnWidth=240&odnBg=FFFFFF';
    return u.href;
  } catch { return null; }
}
export function createProductImages({ fetchImpl = fetch } = {}) {
  let active = 0;
  const waiting = [];
  async function acquire() { if (active >= 3) await new Promise(resolve => waiting.push(resolve)); else active++; }
  function release() { if (waiting.length) waiting.shift()(); else active--; }
  return async function handle(req, res, url) {
    if (url.pathname !== '/product-image') return false;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return true; }
    const source = productImageURL(url.searchParams.get('url'));
    if (!source) { res.writeHead(400).end('Invalid product image'); return true; }
    await acquire();
    try {
      const response = await fetchImpl(source, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const type = response.headers.get('content-type')?.split(';')[0].trim();
      if (response.status !== 200 || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        await response.body?.cancel(); throw Error('Invalid product image');
      }
      let length = 0; const chunks = [];
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 1024 * 1024) throw Error('Product image too large');
        chunks.push(chunk);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': length,
        'Cache-Control': 'private, max-age=21600', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : Buffer.concat(chunks));
    } catch { if (!res.headersSent) res.writeHead(502).end('Product image unavailable'); }
    finally { release(); }
    return true;
  };
}
