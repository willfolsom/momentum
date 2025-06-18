// npm install @alpacahq/alpaca-trade-api yahoo-finance2 technicalindicators dotenv

require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const yahoo = require('yahoo-finance2').default;
const ti = require('technicalindicators');

// --- CONFIG ---
const TICKERS = ['TQQQ', 'NVDA', 'SOXL', 'AMD', 'AAPL'];
const LOOKBACK_DAYS = 30;
const TOP_N = 2;
const STOP_LOSS_PCT = 0.95;
const QTY_PER_TRADE = 1;

// --- ALPACA INIT ---
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_KEY_ID,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: process.env.ALPACA_PAPER === 'true', // true = paper trading
});

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
  await alpaca.createOrder({
    symbol: ticker,
    qty: qty,
    side: 'buy',
    type: 'market',
    time_in_force: 'gtc',
  });
  console.log(`Buy order placed for ${ticker}`);
}

async function placeSellOrder(ticker, qty) {
  await alpaca.createOrder({
    symbol: ticker,
    qty: qty,
    side: 'sell',
    type: 'market',
    time_in_force: 'gtc',
  });
  console.log(`Sell order placed for ${ticker}`);
}

async function buyWithStopLoss(symbol, qty, stopPercent) {
  const price = (await alpaca.getLatestTrade(symbol)).Price;
  const stopPrice = (price * stopPercent).toFixed(2);

  // Buy Market Order
  await alpaca.createOrder({
    symbol,
    qty,
    side: 'buy',
    type: 'market',
    time_in_force: 'gtc',
  });
  console.log(`Bought ${qty} share(s) of ${symbol} @ ~$${price}`);

  // Stop Loss Sell Order
  await alpaca.createOrder({
    symbol,
    qty,
    side: 'sell',
    type: 'stop',
    stop_price: stopPrice,
    time_in_force: 'gtc',
  });
  console.log(`Stop-loss set @ $${stopPrice}`);
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
    console.log('Details: ');
    console.table(picks.slice(0, topN));

    for (const p of picks) {
      await placeBuyOrder(p.ticker, QTY_PER_TRADE);
    }
  } catch (err) {
    console.error('Bot error: ', err);
  }
}

async function executeBuyOrderWithStopLoss() {
  try {
    const picks = await analyzeTickers();

    console.log('Top momentum picks: ', picks.map(p => p.ticker));
    console.log('Details: ');
    console.table(picks.slice(0, topN));

    for (const p of picks) {
      await buyWithStopLoss(p.ticker, QTY_PER_TRADE, STOP_LOSS_PCT);
    }
  } catch (err) {
    console.error('Bot error: ', err);
  }
}
