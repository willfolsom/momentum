require("dotenv").config();
const Alpaca = require("@alpacahq/alpaca-trade-api");

// --- CONFIG ---
const STOP_LOSS_PCT = 0.95;
const QTY_PER_TRADE = 1;

// --- ALPACA INIT ---
const alpaca = new Alpaca({
  keyId: process.env.ALPACA_KEY_ID,
  secretKey: process.env.ALPACA_SECRET_KEY,
  paper: process.env.ALPACA_PAPER === "true", // true = paper trading
});

// --- ACTIONS ---
async function placeBuyOrder(ticker, qty) {
  await alpaca.createOrder({
    symbol: ticker,
    qty: qty,
    side: "buy",
    type: "market",
    time_in_force: "gtc",
  });
  console.log(`Buy order placed for ${ticker}`);
}

async function placeSellOrder(ticker, qty) {
  await alpaca.createOrder({
    symbol: ticker,
    qty: qty,
    side: "sell",
    type: "market",
    time_in_force: "gtc",
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
    side: "buy",
    type: "market",
    time_in_force: "gtc",
  });
  console.log(`Bought ${qty} share(s) of ${symbol} @ ~$${price}`);

  // Stop Loss Sell Order
  await alpaca.createOrder({
    symbol,
    qty,
    side: "sell",
    type: "stop",
    stop_price: stopPrice,
    time_in_force: "gtc",
  });
  console.log(`Stop-loss set @ $${stopPrice}`);
}

// --- MAIN FUNCTIONS ---
async function executeBuyOrder() {
  try {
    const picks = await analyzeTickers();

    console.log(
      "Top momentum picks: ",
      picks.map((p) => p.ticker),
    );
    console.table(picks);

    for (const p of picks) {
      await placeBuyOrder(p.ticker, QTY_PER_TRADE);
    }
  } catch (err) {
    console.error("Bot error: ", err);
  }
}

async function executeBuyOrderWithStopLoss() {
  try {
    const picks = await analyzeTickers();

    console.log(
      "Top momentum picks: ",
      picks.map((p) => p.ticker),
    );
    console.table(picks);

    for (const p of picks) {
      await buyWithStopLoss(p.ticker, QTY_PER_TRADE, STOP_LOSS_PCT);
    }
  } catch (err) {
    console.error("Bot error: ", err);
  }
}
