import { useState, useEffect } from 'react';
import { supabase } from '../supabase'; // Importujemy klienta Supabase
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

export default function GemModule() {
  const [tickers, setTickers] = useState([]);
  const [newTicker, setNewTicker] = useState('');
  const [momentumData, setMomentumData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingTickers, setFetchingTickers] = useState(true);

  // 1. Pobieranie tickerów z Supabase przy starcie komponentu
  useEffect(() => {
    fetchTickersFromDB();
  }, []);

  const fetchTickersFromDB = async () => {
    setFetchingTickers(true);
    const { data, error } = await supabase
      .from('gem_tickers')
      .select('ticker')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Błąd pobierania tickerów z bazy:', error);
    } else if (data) {
      setTickers(data.map(item => item.ticker));
    }
    setFetchingTickers(false);
  };

  // 2. Pobieranie danych momentum po załadowaniu tickerów
  useEffect(() => {
    if (!fetchingTickers) {
      fetchMomentumData();
    }
  }, [tickers, fetchingTickers]);

  const fetchMomentumData = async () => {
    if (tickers.length === 0) {
      setMomentumData([]);
      return;
    }

    setLoading(true);
    const results = [];
    
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const fromDate = oneYearAgo.toISOString().split('T')[0];

    for (const ticker of tickers) {
      try {
        const res = await fetch(`/api/yahoo?ticker=${ticker}&from=${fromDate}&interval=1d`);
        if (!res.ok) throw new Error('Błąd API');
        
        const data = await res.json();
        
        if (data && data.length > 0) {
          const startPrice = data[0].close;
          const endPrice = data[data.length - 1].close;
          
          if (startPrice && endPrice) {
            const returnPct = ((endPrice - startPrice) / startPrice) * 100;
            results.push({
              ticker: ticker,
              return: Number(returnPct.toFixed(2)),
              startPrice: Number(startPrice.toFixed(2)),
              endPrice: Number(endPrice.toFixed(2))
            });
          }
        }
      } catch (err) {
        console.error(`Nie udało się pobrać danych dla ${ticker}:`, err);
      }
    }

    results.sort((a, b) => b.return - a.return);
    setMomentumData(results);
    setLoading(false);
  };

  // 3. Zapisywanie nowego tickera w Supabase
  const handleAddTicker = async (e) => {
    e.preventDefault();
    const cleanTicker = newTicker.trim().toUpperCase();
    
    if (cleanTicker && !tickers.includes(cleanTicker)) {
      setNewTicker(''); // Od razu czyścimy input, żeby poprawić UX
      
      const { error } = await supabase
        .from('gem_tickers')
        .insert([{ ticker: cleanTicker }]);
        
      if (error) {
        console.error('Błąd dodawania tickera do Supabase:', error);
        alert('Błąd dodawania tickera.');
      } else {
        setTickers([...tickers, cleanTicker]);
      }
    }
  };

  // 4. Usuwanie tickera z Supabase
  const handleRemoveTicker = async (tickerToRemove) => {
    // Od razu optymistycznie usuwamy z UI dla lepszego UX
    const previousTickers = [...tickers];
    setTickers(tickers.filter(t => t !== tickerToRemove));

    const { error } = await supabase
      .from('gem_tickers')
      .delete()
      .eq('ticker', tickerToRemove);
      
    if (error) {
      console.error('Błąd usuwania tickera z Supabase:', error);
      alert('Błąd usuwania tickera.');
      // Jeśli się nie powiodło w bazie, przywracamy w UI
      setTickers(previousTickers);
    }
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#27293d] p-3 rounded shadow-lg border border-[#1e1e2f]">
          <p className="font-bold text-white mb-2">{data.ticker}</p>
          <div className="flex flex-col gap-1 text-sm">
            <span className={data.return >= 0 ? "text-[#00f2c3]" : "text-[#fd5d93]"}>
              Stopa zwrotu (1Y): {data.return > 0 ? '+' : ''}{data.return}%
            </span>
            <span className="text-[#9a9a9a]">Cena rok temu: ${data.startPrice}</span>
            <span className="text-[#9a9a9a]">Obecna cena: ${data.endPrice}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const winner = momentumData.length > 0 ? momentumData[0] : null;

  return (
    <div className="bg-[#27293d] rounded-xl p-6 md:p-8 shadow-lg">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-normal text-white">System Sygnałów GEM</h2>
          <p className="text-sm text-[#9a9a9a] font-light mt-1">
            Porównanie 12-miesięcznej stopy zwrotu (Momentum)
          </p>
        </div>

        <form onSubmit={handleAddTicker} className="flex bg-[#1e1e2f] border border-[#2b2b40] rounded focus-within:border-[#fd5d93] transition-colors">
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="Dodaj ticker (np. QQQ)"
            className="bg-transparent p-2 text-sm text-white outline-none w-36 uppercase"
          />
          <button type="submit" disabled={fetchingTickers} className="bg-[#fd5d93] text-white px-4 text-sm font-semibold cursor-pointer hover:bg-[#e04a7c] transition-colors disabled:opacity-50">
            +
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {fetchingTickers ? (
          <span className="text-[#9a9a9a] text-sm">Ładowanie tickerów...</span>
        ) : (
          tickers.map(ticker => (
            <div key={ticker} className="flex items-center gap-2 bg-[#1e1e2f] px-3 py-1.5 rounded-full border border-[#2b2b40]">
              <span className="text-sm font-medium text-white">{ticker}</span>
              <button 
                onClick={() => handleRemoveTicker(ticker)}
                className="text-[#fd5d93] hover:text-white transition-colors text-xs font-bold w-4 h-4 flex items-center justify-center rounded-full hover:bg-[#fd5d93]"
                title="Usuń ticker"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {winner && !loading && (
        <div className="mb-8 p-4 bg-[#1e1e2f] border-l-4 border-[#00f2c3] rounded-r">
          <p className="text-[#9a9a9a] text-sm">Aktualny sygnał (zwycięzca rankingu):</p>
          <p className="text-xl text-white mt-1">
            <span className="font-bold text-[#00f2c3]">{winner.ticker}</span> ze stopą zwrotu <span className="font-bold">{winner.return}%</span>
          </p>
        </div>
      )}

      <div className="h-[350px] w-full relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center font-light text-[#fd5d93] bg-[#27293d]/50 rounded">
            Obliczanie momentum...
          </div>
        )}
        
        {momentumData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={momentumData} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#414868" strokeOpacity={0.6} />
              <XAxis dataKey="ticker" tick={{fill: '#9a9a9a'}} axisLine={false} tickLine={false} />
              <YAxis 
                tick={{fill: '#9a9a9a'}} 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(val) => `${val}%`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{fill: '#1e1e2f'}} />
              <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                {momentumData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.return >= 0 ? '#00f2c3' : '#fd5d93'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          !loading && !fetchingTickers && <div className="text-[#9a9a9a] text-center mt-10">Brak danych do wyświetlenia. Dodaj tickery powyżej.</div>
        )}
      </div>
    </div>
  );
}