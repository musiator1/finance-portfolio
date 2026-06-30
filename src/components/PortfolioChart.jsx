import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { 
  ComposedChart, Area, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts'

// Cache uwzględniający interwały (np. "SPY_1mo")
const apiCache = {};

export default function PortfolioChart({ refreshTrigger }) {
  const [chartData, setChartData] = useState([])
  const [activeView, setActiveView] = useState('value')
  const [interval, setInterval] = useState('weekly') // Domyślnie tygodniowo ('daily', 'weekly', 'monthly')
  const [loading, setLoading] = useState(false)

  // Pobieramy dane ponownie, gdy zmieni się baza LUB wybrany interwał
  useEffect(() => {
    fetchAndProcessData()
  }, [refreshTrigger, interval])

  const fetchAndProcessData = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: true })

    if (error || !data || data.length === 0) {
      setChartData([])
      setLoading(false)
      return
    }

    const firstDateStr = data[0].transaction_date;
    const firstDate = new Date(firstDateStr)
    const today = new Date()
    
    // 1. Budujemy oś czasu w zależności od wybranego interwału
    const dateArray = []
    let currentDate = new Date(firstDate)
    
    while (currentDate <= today) {
      dateArray.push(currentDate.toISOString().split('T')[0])
      
      if (interval === 'monthly') {
        currentDate.setMonth(currentDate.getMonth() + 1)
      } else if (interval === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7)
      } else {
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }
    
    // Zawsze upewniamy się, że dzisiejszy dzień jest na końcu wykresu
    const todayStr = today.toISOString().split('T')[0]
    if (dateArray[dateArray.length - 1] !== todayStr) {
      dateArray.push(todayStr)
    }

    const uniqueTickers = [...new Set(data.map(t => t.ticker))]
    const uniqueCurrencies = [...new Set(data.map(t => t.asset_currency))].filter(c => c !== 'PLN')

    const marketData = {} 
    // Formatowanie interwału dla Yahoo API
    const yfInterval = interval === 'monthly' ? '1mo' : interval === 'weekly' ? '1wk' : '1d'

    try {
      const symbolsToFetch = [
        ...uniqueTickers, 
        ...uniqueCurrencies.map(c => `${c}PLN=X`)
      ];

      // Pobieranie równoległe z serwera (z uwzględnieniem cache'a)
      const fetchPromises = symbolsToFetch.map(async (ticker) => {
        const cacheKey = `${ticker}_${yfInterval}`
        
        if (apiCache[cacheKey]) {
          marketData[ticker] = apiCache[cacheKey];
          return;
        }

        const res = await fetch(`/api/yahoo?ticker=${ticker}&from=${firstDateStr}&interval=${yfInterval}`)
        if (res.ok) {
          const json = await res.json()
          const formattedData = {};
          // Zapisujemy daty bez godzin
          json.forEach(day => {
            formattedData[day.date.split('T')[0]] = day.close
          })
          
          apiCache[cacheKey] = formattedData;
          marketData[ticker] = formattedData;
        }
      });

      await Promise.all(fetchPromises);
    } catch (err) {
      console.error("Błąd podczas pobierania danych giełdowych", err)
    }

    let currentCapital = 0
    let txIndex = 0
    let runningShares = {} 
    let lastKnownPrices = {} 

    // Funkcja wyciągająca ceny - zapamiętuje ostatnią cenę na wypadek luk (np. święta/weekendy)
    const getPrice = (symbol, targetDateStr) => {
      const lookupKey = symbol.length === 3 && !symbol.includes('=') && uniqueCurrencies.includes(symbol) 
        ? `${symbol}PLN=X` 
        : symbol;

      // 1. Dodajemy LOGI DO KONSOLI - to nam zaraz powie, czy w ogóle mamy dane
      if (!marketData[lookupKey]) {
        console.warn(`Brak jakichkolwiek danych dla tickera: ${lookupKey}`);
        return lastKnownPrices[lookupKey] || 0;
      }

      // 2. Szukamy dokładnego dopasowania (działa idealnie dla interwału 'daily')
      if (marketData[lookupKey][targetDateStr]) {
        lastKnownPrices[lookupKey] = marketData[lookupKey][targetDateStr]
        return marketData[lookupKey][targetDateStr]
      }

      // 3. NAPRAWA ROZJAZDU DAT: Szukamy najbliższej wcześniejszej daty w pobranych
      // (Dzięki temu, jeśli aplikacja szuka 15 marca, a Yahoo dało datę 1 marca, to ją znajdzie)
      const availableDates = Object.keys(marketData[lookupKey]).sort();
      let bestDate = null;
      for (const d of availableDates) {
        if (d <= targetDateStr) bestDate = d;
        else break; // Daty są posortowane, jeśli trafiliśmy na późniejszą, przerywamy
      }

      if (bestDate) {
         lastKnownPrices[lookupKey] = marketData[lookupKey][bestDate];
         return marketData[lookupKey][bestDate];
      }

      return lastKnownPrices[lookupKey] || 0
    }
    console.log("Pobrane ceny z Yahoo:", marketData);

    // 2. Kalkulacja wartości portfela dla wyznaczonych punktów w czasie
    const finalData = dateArray.map(dateStr => {
      
      // Ważna zmiana: Przetwarzamy wszystkie transakcje, które odbyły się DO danej daty.
      // Dzięki temu, jeśli przeskakujemy o miesiąc, nie ominiemy transakcji z połowy miesiąca.
      const targetDate = new Date(dateStr)
      
      while (txIndex < data.length && new Date(data[txIndex].transaction_date) <= targetDate) {
        const t = data[txIndex]
        const value = Number(t.total_value_pln)
        
        if (!runningShares[t.ticker]) runningShares[t.ticker] = { shares: 0, currency: t.asset_currency }

        if (t.type === 'BUY') {
          currentCapital += value
          runningShares[t.ticker].shares += Number(t.quantity)
        } else if (t.type === 'SELL') {
          currentCapital -= value
          runningShares[t.ticker].shares -= Number(t.quantity)
        }
        txIndex++
      }

      let dailyMarketValuePLN = 0
      
      for (const [ticker, info] of Object.entries(runningShares)) {
        if (info.shares > 0) {
          const assetPrice = getPrice(ticker, dateStr)
          
          let fxRate = 1 
          if (info.currency !== 'PLN') {
            fxRate = getPrice(info.currency, dateStr)
            if (fxRate === 0) fxRate = info.currency === 'USD' ? 4.0 : 4.3 
          }

          dailyMarketValuePLN += (info.shares * assetPrice * fxRate)
        }
      }

      if (currentCapital === 0) dailyMarketValuePLN = 0

      return {
        date: dateStr,
        invested: currentCapital,
        marketValue: Number(dailyMarketValuePLN.toFixed(2)),
        profit: Number((dailyMarketValuePLN - currentCapital).toFixed(2))
      }
    })

    setChartData(finalData)
    setLoading(false)
  }

  if (loading && chartData.length === 0) {
    return <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8 h-[550px] flex items-center justify-center text-slate-500">Pobieranie prawdziwych danych z giełdy...</div>
  }

  if (chartData.length === 0) return null

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-slate-200 shadow-lg rounded-xl">
          <p className="font-bold text-slate-800 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm font-medium">
              {entry.name}: {entry.value.toLocaleString()} PLN
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8 h-[550px] flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h3 className="text-lg font-semibold text-slate-800">Wydajność Portfela (PLN)</h3>
        
        <div className="flex flex-wrap gap-4">
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setActiveView('value')} className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${ activeView === 'value' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700' }`}>
              Wartość i Kapitał
            </button>
            <button onClick={() => setActiveView('profit')} className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${ activeView === 'profit' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700' }`}>
              Tylko Zysk
            </button>
          </div>

          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setInterval('daily')} disabled={loading} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${ interval === 'daily' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50' }`}>
              1D
            </button>
            <button onClick={() => setInterval('weekly')} disabled={loading} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${ interval === 'weekly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50' }`}>
              1W
            </button>
            <button onClick={() => setInterval('monthly')} disabled={loading} className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${ interval === 'monthly' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 disabled:opacity-50' }`}>
              1M
            </button>
          </div>
        </div>
      </div>

      <div className="flex-grow min-h-0 relative">
        {/* Subtelny overlay podczas zmiany interwału */}
        {loading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-lg">Pobieranie...</div>}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            
            <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} stroke="#cbd5e1" tickMargin={10} minTickGap={30} />
            <YAxis tick={{fontSize: 12, fill: '#64748b'}} stroke="#cbd5e1" tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`} width={60} />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />

            {activeView === 'value' ? (
              <>
                <Area type="monotone" dataKey="invested" name="Wpłacony Kapitał" stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorInvested)" isAnimationActive={false} />
                <Line type="monotone" dataKey="marketValue" name="Wartość Rynkowa" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
              </>
            ) : (
              <Area type="monotone" dataKey="profit" name="Zysk / Strata netto" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}