import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

export default async function handler(req, res) {
  const { ticker, from, interval } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Brak tickera w zapytaniu' });
  }

  try {
    // chart() wymaga period1 (start) oraz period2 (koniec)
    // Yahoo wymaga daty końcowej, więc ustawiamy ją na dzisiaj
    const queryOptions = {
      period1: from || '2020-01-01',
      period2: new Date(), // Dzisiaj
      interval: interval || '1wk'
    };

    const result = await yahooFinance.chart(ticker, queryOptions);
    
    // Zwracamy tylko tablicę notowań (quotes), ponieważ chart() zwraca też metadane
    res.status(200).json(result.quotes);
  } catch (error) {
    console.error(`[API ERROR - ${ticker}]:`, error.message);
    res.status(500).json({ 
      error: error.message,
      name: error.name
    });
  }
}