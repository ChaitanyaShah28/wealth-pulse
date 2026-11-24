export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const raw = String(req.query.symbol || '').trim().toUpperCase().replace(/\.NS$|\.BO$/i, '');
  if (!raw || raw === 'NSE' || raw === 'BSE') {
    return res.status(400).json({ error: 'Enter a stock ticker symbol such as RELIANCE, TCS, or HDFCBANK' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/html,*/*'
  };

  async function tryYahoo(sym, exch) {
    const suffix = exch === 'BSE' ? '.BO' : '.NS';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym + suffix)}?interval=1d&range=1d`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('yahoo status');
    const data = await r.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice || meta?.previousClose || 0);
    if (!price || price <= 0) throw new Error('yahoo price');
    return { symbol: sym, exchange: exch, price, name: meta?.shortName || meta?.longName || sym };
  }

  async function tryGoogleFinance(sym, exch) {
    const url = `https://www.google.com/finance/quote/${encodeURIComponent(sym)}:${exch}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error('gf status');
    const html = await r.text();
    const m = html.match(/data-last-price="([0-9.]+)"/);
    const price = m ? parseFloat(m[1]) : 0;
    if (!price || price <= 0) throw new Error('gf price');
    return { symbol: sym, exchange: exch, price, name: sym };
  }

  try {
    const quote = await Promise.any([
      tryYahoo(raw, 'NSE'),
      tryGoogleFinance(raw, 'NSE'),
      tryYahoo(raw, 'BSE'),
      tryGoogleFinance(raw, 'BSE')
    ]);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(quote);
  } catch {
    return res.status(404).json({ error: `Could not find live price for ${raw}` });
  }
}
