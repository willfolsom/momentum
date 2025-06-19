# momentum

Programmatic trading.

If you start to compare the 7d return to Robinhoods "1W", you'll notice RH sometimes uses 6 days, sometimes 7 days, and regardless, it doesn't always match Yahoo Finance. It also seems to account for time, which isn't consistent across equities, while YF just gets the price at close. Stuck a bit on this one, but it is a wildly interesting (to me) find that it's difficult to reproduce the RH "1W" view.

Exhibit A, 1W here for AS starts on June 12 at 11AM (it is right now June 18 at 11PM).

**This would imply a 2.90% drop over the week.**

![](A.png)

However, Exhibit B.

![](B.png)

**Their close price June 11 4pm @ $37.74 to June 11 postMarketPrice $36.21 --> 4.03% drop**

This code (i.e. THIS REPO) is suggesting a 3.93% drop.

I know the UI and graph(s) can't be perfect. Repeat this set of moving targets for each stock. Times, dates, etc.

Anyways, heres the analysis aspect.

![](example.png)
