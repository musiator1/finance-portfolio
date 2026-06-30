import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { 
  LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts'

const apiCache = {};

export default function PortfolioChart({ refreshTrigger }) {
  const [chartData, setChartData] = useState([])
  const [activeView, setActiveView] = useState('value')
  const [interval, setInterval] = useState('monthly')
  const [loading, setLoading] = useState(false)
  
  const [financialGoal, setFinancialGoal] = useState(() => {
    const saved = localStorage.getItem('financialGoal');
    return saved ? Number(saved) : 1000000;
  });
  const [isEditingGoal, setIsEditingGoal] = useState(false);

  useEffect(() => {
    localStorage.setItem('financialGoal', financialGoal);
  }, [financialGoal]);

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
    
    const todayStr = today.toISOString().split('T')[0]
    if (dateArray[dateArray.length - 1] !== todayStr) dateArray.push(todayStr)

    const uniqueTickers = [...new Set(data.map(t => t.ticker))]
    const uniqueCurrencies = [...new Set(data.map(t => t.asset_currency))].filter(c => c !== 'PLN')

    const marketData = {} 
    const yfInterval = interval === 'monthly' ? '1mo' : interval === 'weekly' ? '1wk' : '1d'

    try {
      const symbolsToFetch = [...uniqueTickers, ...uniqueCurrencies.map(c => `${c}PLN=X`)];
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
          json.forEach(day => {
            if (day.close != null) formattedData[day.date.split('T')[0]] = day.close
          })
          apiCache[cacheKey] = formattedData;
          marketData[ticker] = formattedData;
        }
      });
      await Promise.all(fetchPromises);
    } catch (err) {
      console.error("Błąd API", err)
    }

    let currentCapital = 0
    let txIndex = 0
    let runningShares = {} 
    let lastKnownPrices = {} 

    const getPrice = (symbol, targetDateStr) => {
      const lookupKey = symbol.length === 3 && !symbol.includes('=') && uniqueCurrencies.includes(symbol) ? `${symbol}PLN=X` : symbol;
      if (!marketData[lookupKey]) return lastKnownPrices[lookupKey] || 0;
      const exactPrice = marketData[lookupKey][targetDateStr]
      if (exactPrice != null) {
        lastKnownPrices[lookupKey] = exactPrice
        return exactPrice
      }
      const availableDates = Object.keys(marketData[lookupKey]).sort();
      let bestPrice = null;
      for (const d of availableDates) {
        if (d > targetDateStr) break;
        const price = marketData[lookupKey][d];
        if (price != null) bestPrice = price;
      }
      if (bestPrice != null) {
        lastKnownPrices[lookupKey] = bestPrice;
        return bestPrice;
      }
      return lastKnownPrices[lookupKey] || 0
    }

    const finalData = dateArray.map(dateStr => {
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
        date: dateStr, // Tego użyjemy jako unikalnego ID osi X
        invested: currentCapital,
        marketValue: Number(dailyMarketValuePLN.toFixed(2)),
        profit: Number((dailyMarketValuePLN - currentCapital).toFixed(2))
      }
    })

    setChartData(finalData)
    setLoading(false)
  }

  if (loading && chartData.length === 0) {
    return <div className="bg-[#27293d] p-6 rounded-xl mb-8 h-[550px] flex items-center justify-center text-[#1f8ef1] font-light shadow-lg">Fetching market data...</div>
  }

  if (chartData.length === 0) return null

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#27293d] p-3 rounded shadow-lg border border-[#1e1e2f]">
          <p className="font-bold text-white mb-2 text-sm">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-sm mb-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <span className="text-[#9a9a9a]">{entry.name}:</span>
              <span className="text-white font-medium">{entry.value.toLocaleString()} PLN</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const latestData = chartData[chartData.length - 1] || { invested: 0, marketValue: 0, profit: 0 };
  const simpleROI = latestData.invested > 0 ? ((latestData.profit / latestData.invested) * 100).toFixed(2) : 0;
  const goalSafeValue = financialGoal || 1; 
  const goalProgress = Math.min((latestData.marketValue / goalSafeValue) * 100, 100);

  return (
    <div className="flex flex-col gap-8 mb-6">
      
      {/* WIDGETY KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Karta 1 */}
        <div className="bg-[#27293d] p-6 rounded-xl shadow-lg flex justify-between items-center h-32">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#fd5d93]/20">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#fd5d93" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5m-4 0h4M17 12a2 2 0 110-4 2 2 0 010 4z" />
             </svg>
          </div>
          <div className="text-right">
            <p className="text-sm font-light text-[#9a9a9a] mb-1">Aktualna wartość</p>
            <h3 className="text-2xl font-normal text-white">
              {latestData.marketValue.toLocaleString('pl-PL')} <span className="text-sm">PLN</span>
            </h3>
            <p className={`text-xs mt-1 ${latestData.profit >= 0 ? 'text-[#00f2c3]' : 'text-[#fd5d93]'}`}>
               {latestData.profit >= 0 ? '▲' : '▼'} {Math.abs(latestData.profit).toLocaleString('pl-PL')} PLN
            </p>
          </div>
        </div>

        {/* Karta 2 */}
        <div className="bg-[#27293d] p-6 rounded-xl shadow-lg flex justify-between items-center h-32">
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#00f2c3]/20">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="#00f2c3" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
             </svg>
          </div>
          <div className="text-right">
            <p className="text-sm font-light text-[#9a9a9a] mb-1">Całkowita stopa zwrotu</p>
            <h3 className="text-2xl font-normal text-white">
              {simpleROI >= 0 ? '+' : ''}{simpleROI}%
            </h3>
            <p className="text-xs mt-1 text-[#9a9a9a]">
              Wpłacono: {latestData.invested.toLocaleString('pl-PL')} PLN
            </p>
          </div>
        </div>

        {/* Karta 3 */}
        <div className="bg-[#27293d] p-6 rounded-xl shadow-lg flex flex-col justify-center h-32 relative group">
           <div className="flex justify-between items-center w-full mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1f8ef1]/20">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#1f8ef1" className="w-6 h-6">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                 </svg>
              </div>
              <div className="text-right flex-1 ml-4">
                <div className="flex justify-end items-center gap-2">
                  <p className="text-sm font-light text-[#9a9a9a]">Cel</p>
                  <span className="text-xs text-[#1f8ef1] font-bold">{goalProgress.toFixed(1)}%</span>
                </div>
                {isEditingGoal ? (
                  <input
                    type="number"
                    autoFocus
                    className="w-24 text-xl font-normal text-white bg-[#1e1e2f] border-b border-[#1f8ef1] outline-none text-right"
                    value={financialGoal}
                    onChange={(e) => setFinancialGoal(Number(e.target.value))}
                    onBlur={() => setIsEditingGoal(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingGoal(false) }}
                  />
                ) : (
                  <h3 
                    className="text-xl font-normal text-white cursor-pointer hover:text-[#1f8ef1] transition-colors"
                    onClick={() => setIsEditingGoal(true)}
                    title="Kliknij, aby zmienić"
                  >
                    {financialGoal.toLocaleString('pl-PL')} <span className="text-sm">PLN</span>
                  </h3>
                )}
              </div>
           </div>
           
           <div className="w-full bg-[#1e1e2f] rounded-full h-1.5 overflow-hidden mt-auto">
             <div className="bg-[#1f8ef1] h-full transition-all duration-1000" style={{ width: `${goalProgress}%` }}></div>
           </div>
        </div>

      </div>

      {/* WYKRES GŁÓWNY */}
      <div className="bg-[#27293d] p-6 rounded-xl shadow-lg h-[450px] flex flex-col relative">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 z-10 w-full">
          <div>
            <h3 className="text-[#9a9a9a] text-sm font-light mb-1">PLN</h3>
            <h2 className="text-2xl font-normal text-white">Portfel w czasie</h2>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Duży, animowany przełącznik widoków (Kapitał / Zysk) */}
            <div className="flex rounded border border-[#1f8ef1] overflow-hidden">
              <button
                onClick={() => setActiveView('value')}
                className={`cursor-pointer px-5 py-2 text-sm font-semibold transition-colors duration-200 ${
                  activeView === 'value' 
                    ? 'bg-[#1f8ef1] text-white' 
                    : 'bg-transparent text-[#1f8ef1] hover:bg-[#1f8ef1]/10'
                }`}
              >
                KAPITAŁ VS WARTOŚĆ
              </button>
              <button
                onClick={() => setActiveView('profit')}
                className={`cursor-pointer px-5 py-2 text-sm font-semibold border-l border-[#1f8ef1] transition-colors duration-200 ${
                  activeView === 'profit' 
                    ? 'bg-[#1f8ef1] text-white' 
                    : 'bg-transparent text-[#1f8ef1] hover:bg-[#1f8ef1]/10'
                }`}
              >
                TYLKO ZYSK
              </button>
            </div>

            {/* Przełącznik interwału */}
            <div className="flex bg-[#1e1e2f] rounded p-1">
              <button onClick={() => setInterval('daily')} disabled={loading} className={`cursor-pointer px-4 py-1.5 text-xs rounded font-medium transition-colors ${ interval === 'daily' ? 'bg-[#fd5d93] text-white shadow' : 'text-[#9a9a9a] hover:text-white disabled:opacity-50' }`}>1D</button>
              <button onClick={() => setInterval('weekly')} disabled={loading} className={`cursor-pointer px-4 py-1.5 text-xs rounded font-medium transition-colors ${ interval === 'weekly' ? 'bg-[#fd5d93] text-white shadow' : 'text-[#9a9a9a] hover:text-white disabled:opacity-50' }`}>1W</button>
              <button onClick={() => setInterval('monthly')} disabled={loading} className={`cursor-pointer px-4 py-1.5 text-xs rounded font-medium transition-colors ${ interval === 'monthly' ? 'bg-[#fd5d93] text-white shadow' : 'text-[#9a9a9a] hover:text-white disabled:opacity-50' }`}>1M</button>
            </div>
          </div>
        </div>

        <div className="flex-grow min-h-0">
          {loading && <div className="absolute inset-0 z-10 flex items-center justify-center font-light text-[#1f8ef1] bg-[#27293d]/50 rounded-xl">Aktualizowanie...</div>}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              {/* KLUCZOWA ZMIANA: dataKey to teraz unikalna "date", a tickFormatter robi magię z miesiącami */}
              <XAxis 
                dataKey="date" 
                tickFormatter={(dateStr) => {
                  const d = new Date(dateStr);
                  return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                }}
                tick={{fontSize: 11, fill: '#9a9a9a'}} 
                stroke="#2b2b40" 
                tickMargin={10} 
                minTickGap={30} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis tick={{fontSize: 11, fill: '#9a9a9a'}} stroke="#2b2b40" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} width={60} axisLine={false} tickLine={false} />
              <CartesianGrid strokeDasharray="0" vertical={true} horizontal={false} stroke="#2b2b40" />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2b2b40', strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />

              {activeView === 'value' ? (
                <>
                  <Line type="monotone" dataKey="marketValue" name="Wartość" stroke="#1f8ef1" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="invested" name="Kapitał" stroke="#9a9a9a" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive={false} />
                </>
              ) : (
                <Line type="monotone" dataKey="profit" name="Zysk netto" stroke="#00f2c3" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}