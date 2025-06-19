// UNTESTED but here it is

const Robinhood = require("robinhood");

// RH CONFIG
const RH_ACCOUNT = { username: "YOUR_EMAIL", password: "YOUR_PASSWORD" };

// --- ACTIONS ---
async function placeBuyOrder(ticker, qty) {
  Robinhood(RH_ACCOUNT, async (err, robinhood) => {
    if (err) return console.error("Login error:", err);

    try {
      await new Promise((res, rej) => {
        robinhood.place_buy_order(
          {
            type: "market",
            time_in_force: "gfd",
            trigger: "immediate",
            quantity: qty,
            instrument: {
              symbol: ticker,
            },
          },
          (err, resBody) => {
            if (err) return rej(err);
            console.log(`Buy order placed for ${ticker}`);
            res();
          },
        );
      });
    } catch (e) {
      console.error(`Failed to buy ${ticker}:`, e.message);
    }
  });
}
