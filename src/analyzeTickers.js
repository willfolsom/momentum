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
  if (closes.length < 35) return null;

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

  const macd = macdArr.slice(-1)[0];

  return {
    return7d,
    return7dPercent: (return7d * 100).toFixed(2) + "%",
    rsi,
    macd: macd?.MACD,
    signal: macd?.signal.toFixed(2),
    macdArr,
  };
}

async function analyzeTops() {
  const results = [];

  for (const ticker of TICKERS) {
    try {
      const closes = await getCloses(ticker);
      const metrics = calculateMomentum(closes);

      // Adjustable params
      if (metrics && metrics.rsi < 70 && metrics.return7d > 0) {
        results.push({ ticker, ...metrics });
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
        results.push({ ticker, ...metrics });
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

    console.log("All");
    console.table(allPicks);

    console.log("-=-=-=- Momentum screener -=-=-=-");
    recommendations(allPicks);

    console.log("-=-=-=- MACD screener -=-=-=-");
    macdTable(allPicks);

    console.log("-=-=-=- Mild Suggestion -=-=-=-");
    getOverallRecommendation(allPicks);
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
