export async function handleMarketRoute({
  request,
  url,
  cors,
  buildHeaders,
  fetchWithTimeout,
  MARKET_TIMEOUT_MS,
}) {
  if (url.pathname !== "/market" || request.method !== "GET") return null;

  const symbols = (url.searchParams.get("symbols") || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  if (symbols.length === 0 || symbols.length > 20) {
    return new Response(JSON.stringify({ error: "Provide 1-20 comma-separated symbols" }), {
      status: 400,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }

  const cacheKey = `https://market-data.internal/${symbols.sort().join(",")}`;
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return new Response(body, {
      status: 200,
      headers: buildHeaders(cors, { "Content-Type": "application/json", "X-Cache": "HIT" }),
    });
  }

  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.join(",")}&range=1d&interval=1d`;
    const yfRes = await fetchWithTimeout(
      yfUrl,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalystCash/1.0)", Accept: "application/json" },
      },
      MARKET_TIMEOUT_MS
    );
    if (!yfRes.ok) throw new Error(`Yahoo Finance returned ${yfRes.status}`);
    const yfData = await yfRes.json();

    const result = {};
    for (const sym of symbols) {
      let price = null;
      let prevClose = null;
      let name = sym;

      if (yfData[sym]) {
        const directSymbolData = yfData[sym];
        const closes = directSymbolData.close || [];
        price = closes[closes.length - 1] || null;
        prevClose = directSymbolData.chartPreviousClose || directSymbolData.previousClose || null;
        name = directSymbolData.symbol || sym;
      } else if (yfData?.spark?.result) {
        const spark = yfData.spark.result.find((row) => row.symbol === sym);
        if (spark?.response?.[0]?.meta) {
          const meta = spark.response[0].meta;
          price = meta.regularMarketPrice ?? meta.previousClose ?? null;
          prevClose = meta.previousClose ?? null;
          name = meta.shortName || meta.symbol || sym;
        }
      }

      if (price != null) {
        result[sym] = {
          price,
          previousClose: prevClose,
          change: price && prevClose ? +(price - prevClose).toFixed(2) : null,
          changePct: price && prevClose ? +(((price - prevClose) / prevClose) * 100).toFixed(2) : null,
          name,
          currency: "USD",
        };
      }
    }

    if (Object.keys(result).length === 0) {
      const fallbackUrl = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${symbols.join(",")}`;
      const fallbackRes = await fetchWithTimeout(
        fallbackUrl,
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CatalystCash/1.0)", Accept: "application/json" },
        },
        MARKET_TIMEOUT_MS
      );
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        for (const quote of fallbackData?.quoteResponse?.result || []) {
          result[quote.symbol] = {
            price: quote.regularMarketPrice ?? null,
            previousClose: quote.regularMarketPreviousClose ?? null,
            change: quote.regularMarketChange != null ? +quote.regularMarketChange.toFixed(2) : null,
            changePct: quote.regularMarketChangePercent != null ? +quote.regularMarketChangePercent.toFixed(2) : null,
            name: quote.shortName || quote.longName || quote.symbol,
            currency: quote.currency || "USD",
          };
        }
      }
    }

    const json = JSON.stringify({ data: result, fetchedAt: Date.now() });
    await cache.put(cacheKey, new Response(json, { headers: { "Cache-Control": "max-age=900" } }));

    return new Response(json, {
      status: 200,
      headers: buildHeaders(cors, { "Content-Type": "application/json", "X-Cache": "MISS" }),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Market data unavailable" }), {
      status: 502,
      headers: buildHeaders(cors, { "Content-Type": "application/json" }),
    });
  }
}
