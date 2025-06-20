require("dotenv").config();
const yahoo = require("yahoo-finance2").default;
const ti = require("technicalindicators");

// --- CONFIG ---
const TICKERS = [
  "HOOD",
  "RIVN",
  "ONDS",
  "DPRO",
  "UPS",
  "RDDT",
  "QTUM",
  "RXRX",
  "VRT",
  "BKSY",
  "AS",
];
const LOOKBACK_DAYS = 50;
const TOP_N = 2;

// --- HELPERS ---
async function getCloses(ticker) {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const history = await yahoo.historical(ticker, {
      period1: from.toISOString().split("T")[0],
      period2: to.toISOString().split("T")[0],
      interval: "1d",
    });

    return history.map((c) => c.close);
  } catch (error) {
    console.error(`Failed to fetch ${ticker}:`, error.message);
    return [];
  }
}

function calculateMomentum(closes) {
  // MACD requires slowPeriod = 26 + signalPeriod = 9 = >=35 closes
  // Noticed bug here -- closes not consistent
  if (closes.length < 35) {
    console.info(
      "Closes less 35. Momentum may be effected. Closes length: " +
        closes.length,
    );

    if (closes.length < 30) {
      console.error("(!!!) Closes less 30! Killing. " + closes.length);
      return null;
    }
  }

  const return7d =
    (closes[closes.length - 1] - closes[closes.length - 8]) /
    closes[closes.length - 8];
  const rsi = ti.RSI.calculate({ values: closes, period: 14 }).slice(-1)[0];
  const macdArr = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const ema9 = ti.EMA.calculate({ values: closes, period: 9 }).slice(-1)[0];
  const ema21 = ti.EMA.calculate({ values: closes, period: 21 }).slice(-1)[0];

  const macd = macdArr.slice(-1)[0];

  return {
    return7d,
    return7dPercent: (return7d * 100).toFixed(2) + "%",
    rsi,
    macd: macd?.MACD,
    signal: macd?.signal.toFixed(2),
    ema9,
    ema21,
    macdArr,
  };
}

function getPriceFromQuote(quote) {
  let price = "n/a";

  if (quote.postMarketPrice) {
    price = quote.postMarketPrice;
  } else if (quote.preMarketPrice) {
    price = quote.preMarketPrice;
  }

  return price;
}

async function analyzeTops() {
  const results = [];

  for (const ticker of TICKERS) {
    try {
      const closes = await getCloses(ticker);
      const metrics = calculateMomentum(closes);

      // Adjustable params
      if (metrics && metrics.rsi < 70 && metrics.return7d > 0) {
        // pull quote for match
        const quote = await yahoo.quote(ticker);

        results.push({ ticker, quote: getPriceFromQuote(quote) });
      }
    } catch (e) {
      console.error(`Failed to analyze ${ticker}:`, e.message);
    }
  }

  return results
    .sort((a, b) => parseFloat(b.return7d) - parseFloat(a.return7d))
    .slice(0, TOP_N);
}

async function analyzeAll() {
  const results = [];

  for (const ticker of TICKERS) {
    try {
      const closes = await getCloses(ticker);
      const metrics = calculateMomentum(closes);

      if (metrics) {
        const { score, meaning } = calculateScore(metrics);
        results.push({ ticker, score, meaning, ...metrics });
      }
    } catch (e) {
      console.error(`Failed to analyze ${ticker}:`, e.message);
    }
  }

  return results.sort(
    (a, b) => parseFloat(b.return7d) - parseFloat(a.return7d),
  );
}

function recommendations(data) {
  const summary = [];

  // BUY: Strong momentum, not overbought
  const buy = data.filter((d) => d.return7d > 0 && d.rsi < 70);
  buy.forEach((d) =>
    summary.push({
      Action: "BUY",
      Ticker: d.ticker,
      Reason: "Strong momentum, RSI < 70",
    }),
  );

  // WATCH: Very strong momentum, but overbought (RSI >= 70, return7d > 0)
  const watch = data.filter((d) => d.return7d > 0 && d.rsi >= 70);
  watch.forEach((d) =>
    summary.push({
      Action: "WATCH",
      Ticker: d.ticker,
      Reason: "Very strong momentum, but overbought",
    }),
  );

  // AVOID: Overbought, but not strong momentum (RSI >= 70, return7d <= 0)
  const avoidOverbought = data.filter((d) => d.return7d <= 0 && d.rsi >= 70);
  avoidOverbought.forEach((d) =>
    summary.push({ Action: "AVOID", Ticker: d.ticker, Reason: "Overbought" }),
  );

  // AVOID: The rest (negative returns, weak momentum)
  const avoided = data.filter(
    (d) =>
      !buy.includes(d) && !watch.includes(d) && !avoidOverbought.includes(d),
  );
  if (avoided.length) {
    summary.push({
      Action: "AVOID",
      Ticker: "Rest",
      Reason: "Negative returns, weak momentum",
    });
  }

  // Print the summary table
  console.table(summary);
}

function getMacdSignalAction(macdArr) {
  if (!Array.isArray(macdArr) || macdArr.length < 2)
    return {
      condition: "N/A",
      meaning: "Not enough data",
      action: "No action",
    };

  const prev = macdArr[macdArr.length - 2];
  const curr = macdArr[macdArr.length - 1];

  if (prev.MACD < prev.signal && curr.MACD > curr.signal) {
    return {
      condition: "MACD crosses above Signal (from below)",
      meaning: "Bullish momentum turning up",
      action: "BUY",
    };
  } else if (curr.MACD > curr.signal) {
    return {
      condition: "MACD above Signal (no crossover check)",
      meaning: "Momentum positive",
      action: "Optional BUY",
    };
  } else {
    return {
      condition: "MACD below Signal",
      meaning: "Momentum weak",
      action: "Wait/Avoid",
    };
  }
}

function macdTable(allPicks) {
  let out = [];

  allPicks.forEach((p) => {
    const macdSignal = getMacdSignalAction(p.macdArr);
    out.push({
      ticker: p.ticker,
      action: macdSignal.action,
      condition: macdSignal.condition,
      meaning: macdSignal.meaning,
    });
  });

  // Print the summary table
  console.table(out);
}

function isShortCandidate(metrics) {
  const macdSignal = getMacdSignalAction(metrics.macdArr);

  return (
    metrics.rsi > 70 &&
    metrics.macd < metrics.signal && // MACD below signal
    metrics.return7d < 0 &&
    metrics.ema9 < metrics.ema21 &&
    macdSignal.condition === "MACD below Signal"
  );
}

function getOverallRecommendation(allPicks) {
  let out = [];

  allPicks.forEach((p) => {
    const macdSignal = getMacdSignalAction(p.macdArr);

    // First, check the primary momentum filters
    if (
      p.return7d > 0 &&
      p.rsi < 70 &&
      (macdSignal.action === "BUY" || macdSignal.action === "Optional BUY")
    ) {
      out.push({
        ticker: p.ticker,
        action: "BUY",
        reason: "Strong momentum, RSI < 70, MACD confirms",
      });
    } else if (
      p.return7d > 0 &&
      p.rsi >= 70 &&
      (macdSignal.action === "BUY" || macdSignal.action === "Optional BUY")
    ) {
      out.push({
        ticker: p.ticker,
        action: "WATCH",
        reason: "Momentum strong, but overbought (RSI >= 70). MACD positive",
      });
    } else if (p.return7d > 0 && macdSignal.action === "Wait/Avoid") {
      out.push({
        ticker: p.ticker,
        action: "WATCH",
        reason: "Momentum strong, but MACD weak",
      });
    } else if (p.return7d <= 0) {
      out.push({
        ticker: p.ticker,
        action: "AVOID",
        reason: "Negative returns, weak momentum",
      });
    } else if (isShortCandidate(p)) {
      out.push({
        ticker: p.ticker,
        action: "SHORT",
        reason: "Overbought + MACD bearish + momentum reversal",
      });
    } else {
      out.push({
        ticket: p.ticker,
        action: "AVOID",
        reason: "No strong buy signal",
      });
    }
  });

  console.table(out);
}

function calculateScore(metrics) {
  let score = 0;

  // 7-Day Return
  if (metrics.return7d > 0.05) score += 2;
  else if (metrics.return7d > 0) score += 1;

  // RSI
  if (metrics.rsi > 30 && metrics.rsi < 70) score += 1;
  if (metrics.rsi < 30 || (metrics.rsi >= 50 && metrics.rsi <= 60)) score += 1;

  // MACD crossover logic
  const macdSignal = getMacdSignalAction(metrics.macdArr);
  if (macdSignal.condition === "MACD crosses above Signal (from below)")
    score += 2;
  else if (macdSignal.condition === "MACD above Signal (no crossover check)")
    score += 1;

  // Future (optional): EMA, ADX, OBV, Volume Spike
  if (metrics.ema9 > metrics.ema21) score += 1;
  // e.g., if (metrics.adx > 30) score += 2;

  // 8–10: ✅ Strong Buy Candidate
  // 5–7: 👀 Watchlist / Possible Buy
  // <5: ❌ Avoid

  let meaning = "Avoid";
  if (score >= 8 && score <= 10) {
    meaning = "BUY";
  } else if (score >= 5 && score <= 7) {
    meaning = "Watch";
  }

  return { score, meaning };
}

// --- MAIN FUNCTIONS ---
async function getAnalysis() {
  try {
    const picks = await analyzeTops();
    const allPicks = await analyzeAll();

    console.log(
      "Top momentum picks: ",
      picks.map((p) => p.ticker),
    );
    console.table(picks);

    console.log("-=-=-=- Momentum screener -=-=-=-");
    recommendations(allPicks.sort((a, b) => b.score - a.score));

    console.log("-=-=-=- MACD screener -=-=-=-");
    macdTable(allPicks.sort((a, b) => b.score - a.score));

    console.log("-=-=-=- Mild Suggestions -=-=-=-");
    getOverallRecommendation(allPicks.sort((a, b) => b.score - a.score));

    console.log("-=-=-=- All Dump -=-=-=-");
    console.table(allPicks.sort((a, b) => b.score - a.score));
  } catch (err) {
    console.error("Bot error: ", err);
  }
}

if (require.main === module) {
  getAnalysis();
}

module.exports = {
  getAnalysis: getAnalysis,
};
