// npm install robinhood yahoo-finance2 technicalindicators

const Robinhood = require('robinhood');
const yahoo = require('yahoo-finance2').default;
const ti = require('technicalindicators');

// --- CONFIG ---
const TICKERS = ['TQQQ', 'NVDA', 'SOXL', 'AMD', 'AAPL'];
const LOOKBACK_DAYS = 30;
const TOP_N = 2;
const QTY_PER_TRADE = 1;

// RH CONFIG
const RH_ACCOUNT = { username: 'YOUR_EMAIL', password: 'YOUR_PASSWORD' };

// --- HELPERS ---
async function getCloses(ticker) {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const history = await yahoo.historical(ticker, {
      period1: from.toISOString().split('T')[0],
      period2: to.toISOString().split('T')[0],
      interval: '1d',
    });

    return history.map(c => c.close);
  } catch (error) {
    console.error(`Failed to fetch ${ticker}:`, error.message);
    return [];
  }
}

function calculateMomentum(closes) {
  if (closes.length < 20) return null;

  const return7d = (closes[closes.length - 1] - closes[closes.length - 8]) / closes[closes.length - 8];
  const rsi = ti.RSI.calculate({ values: closes, period: 14 }).slice(-1)[0];
  const macd = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  }).slice(-1)[0];

  return {
    return7d,
    return7dPercent: (return7d * 100).toFixed(2) + '%',
    rsi,
    macd: macd?.MACD,
    signal: macd?.signal.toFixed(2)
  };
}

async function analyzeTickers() {
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

  return results.sort((a, b) => parseFloat(b.return7d) - parseFloat(a.return7d).slice(0, TOP_N));
}

// --- ACTIONS ---
async function placeBuyOrder(ticker, qty) {
  Robinhood(RH_ACCOUNT, async (err, robinhood) => {
    if (err) return console.error('Login error:', err);

    try {
      await new Promise((res, rej) => {
        robinhood.place_buy_order({
          type: 'market',
          time_in_force: 'gfd',
          trigger: 'immediate',
          quantity: qty,
          instrument: {
            symbol: ticker,
          },
        }, (err, resBody) => {
          if (err) return rej(err);
          console.log(`Buy order placed for ${ticker}`);
          res();
        });
      });
    } catch (e) {
      console.error(`Failed to buy ${ticker}:`, e.message);
    }
  });
}

// --- MAIN FUNCTIONS ---
async function getAnalysis() {
  try {
    const picks = await analyzeTickers();

    console.log('Top momentum picks: ', picks.map(p => p.ticker));
    console.log('Details: ');
    console.table(picks.slice(0, topN));
  } catch (err) {
    console.error('Bot error: ', err);
  }
}

async function executeBuyOrder() {
  try {
    const picks = await analyzeTickers();
    console.log('Top momentum picks: ', picks.map(p => p.ticker));

    for (const p of picks) {
      await placeBuyOrder(p.ticker, QTY_PER_TRADE);
    }
  } catch (err) {
    console.error('Bot error: ', err);
  }
}
