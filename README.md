# momentum

Stock analysis stuff.

+ Strategies look at 1day / 7day momentum, MACD, RSI, EMA, scoring, combinations, etc.
+ Input an array of tickers to get analyzed, currently a const.

![](example.png)

+ Pine script for LPPL Oscillation

![](example2.png)

+ Alpaca buy / sell example

## Observations

I have frontends for various things - code is currently private but they exist.

If you start to compare the 7d return to Robinhoods "1W", you'll notice RH sometimes uses 6 days, sometimes 7 days, and regardless, it doesn't always match Yahoo Finance. It also seems to account for time, which isn't consistent across equities, while YF just gets the price at close. Stuck a bit on this one, but it is a wildly interesting (to me) find that it's difficult to reproduce the RH "1W" view. Obviously the dataset they draw from is richer than a free time at close YF provided dataset, and they use smoothing of some sort.

Exhibit A, 1W here for AS starts on June 12 at 11AM (it is right now June 18 at 11PM).

**This would imply a 2.90% drop over the week.**

<img src="A.png" alt="" width="350" />

However, Exhibit B.

<img src="B.png" alt="" width="350" />

**Their close price June 11 4pm @ $37.74 to June 11 postMarketPrice $36.21 --> 4.03% drop**
