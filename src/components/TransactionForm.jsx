import { useState } from 'react'
import { supabase } from '../supabase'

export default function TransactionForm({ onTransactionAdded }) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    ticker: '',
    asset_name: '',
    type: 'BUY',
    quantity: '',
    price_per_share: '',
    commission: '', 
    asset_currency: 'USD',
    exchange_rate_pln: ''
  })
  const [showTooltip, setShowTooltip] = useState(false)

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const fetchNBPRate = async () => {
    if (formData.asset_currency === 'PLN') {
      setFormData({ ...formData, exchange_rate_pln: 1 })
      return
    }
    
    try {
      const response = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${formData.asset_currency.toLowerCase()}/${formData.transaction_date}/?format=json`)
      if (response.ok) {
        const data = await response.json()
        setFormData({ ...formData, exchange_rate_pln: data.rates[0].mid })
      } else {
        alert('Brak kursu NBP dla tej daty (np. weekend). Wpisz ręcznie.')
      }
    } catch (error) {
      console.error('Błąd pobierania kursu:', error)
      alert('Wystąpił błąd przy pobieraniu kursu NBP.')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
          transaction_date: formData.transaction_date,
          ticker: formData.ticker.toUpperCase(),
          asset_name: formData.asset_name,
          type: formData.type,
          quantity: parseFloat(formData.quantity),
          price_per_share: parseFloat(formData.price_per_share),
          commission: parseFloat(formData.commission) || 0,
          asset_currency: formData.asset_currency,
          exchange_rate_pln: parseFloat(formData.exchange_rate_pln)
      }])

    setLoading(false)

    if (error) {
      console.error('Błąd:', error)
      alert('Błąd: ' + error.message)
    } else {
      setFormData({ ...formData, ticker: '', asset_name: '', quantity: '', price_per_share: '', commission: '' })
      if (onTransactionAdded) onTransactionAdded()
    }
  }

  const inputClassName = "w-full p-2.5 border-b border-[#2b2b40] bg-[#1e1e2f] text-white outline-none focus:border-[#1f8ef1] transition-colors rounded-t text-sm font-light"

  return (
    <form onSubmit={handleSubmit} className="bg-[#27293d] p-6 md:p-8 rounded-xl shadow-lg mb-6">
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-lg font-light text-white flex items-center gap-2">
          Dodaj transakcję
        </h3>
        
        {/* Tooltip ze znakiem zapytania */}
        <div 
          className="relative flex items-center"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <span 
            onClick={() => setShowTooltip(!showTooltip)}
            className="cursor-pointer w-5 h-5 flex items-center justify-center rounded-full bg-[#1f8ef1]/20 text-[#1f8ef1] text-xs font-bold border border-[#1f8ef1]/50 hover:bg-[#1f8ef1] hover:text-white transition-colors"
          >
            ?
          </span>
          
          {/* Treść dymka (warunkowe renderowanie) */}
          {showTooltip && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-4 bg-[#1e1e2f] border border-[#2b2b40] rounded-lg shadow-2xl z-50 text-xs text-[#9a9a9a] leading-relaxed">
              <strong className="text-white block mb-2 text-sm">Zarządzanie gotówką 💵</strong>
              <p className="mb-2">Aby dodać luźną gotówkę do portfela, użyj tickera zaczynającego się od <span className="text-[#1f8ef1] font-mono font-bold">CASH</span> (np. <span className="text-white font-mono">CASH-PLN</span>, <span className="text-white font-mono">CASH-USD</span>).</p>
              <ul className="space-y-1">
                <li><span className="text-[#00f2c3] font-bold">BUY</span>: Wpłata środków na konto</li>
                <li><span className="text-[#fd5d93] font-bold">SELL</span>: Wypłata środków</li>
                <li><span className="text-[#1f8ef1] font-bold">DIVIDEND</span>: Otrzymana dywidenda (zwiększa zysk netto)</li>
                <li><span className="text-[#ffb236] font-bold">FEE</span>: Opłata za konto (zmniejsza zysk netto)</li>
              </ul>
              {/* Strzałeczka w dół */}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-[#2b2b40]"></div>
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Data</label>
          <input type="date" name="transaction_date" value={formData.transaction_date} onChange={handleChange} required className={inputClassName} style={{ colorScheme: "dark" }} />
        </div>
        
        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Typ</label>
          <select name="type" value={formData.type} onChange={handleChange} className={`${inputClassName} cursor-pointer font-medium text-[#1f8ef1]`}>
            <option value="BUY">Kupno (BUY)</option>
            <option value="SELL">Sprzedaż (SELL)</option>
            <option value="DIVIDEND">Dywidenda (DIVIDEND)</option>
            <option value="FEE">Opłata (FEE)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Ticker (np. SPY)</label>
          <input type="text" name="ticker" value={formData.ticker} onChange={handleChange} required className={`${inputClassName} uppercase font-medium`} />
        </div>

        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Pełna nazwa aktywa</label>
          <input type="text" name="asset_name" value={formData.asset_name} onChange={handleChange} required className={inputClassName} />
        </div>

        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Ilość</label>
          <input type="number" step="any" name="quantity" value={formData.quantity} onChange={handleChange} required className={inputClassName} />
        </div>

        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Cena / Sztuka</label>
          <input type="number" step="any" name="price_per_share" value={formData.price_per_share} onChange={handleChange} required className={inputClassName} />
        </div>

        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Prowizja</label>
          <input type="number" step="any" name="commission" value={formData.commission} onChange={handleChange} placeholder="0.00" className={inputClassName} />
        </div>

        <div>
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Waluta</label>
          <select name="asset_currency" value={formData.asset_currency} onChange={handleChange} className={`${inputClassName} cursor-pointer`}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="PLN">PLN</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <label className="block text-xs font-light text-[#9a9a9a] mb-2 uppercase">Kurs NBP (PLN)</label>
          <div className="flex gap-2 bg-[#1e1e2f] border-b border-[#2b2b40] focus-within:border-[#1f8ef1] rounded-t pr-1">
            <input type="number" step="any" name="exchange_rate_pln" value={formData.exchange_rate_pln} onChange={handleChange} required className="w-full p-2.5 bg-transparent text-white outline-none text-sm font-light" />
            <button type="button" onClick={fetchNBPRate} className="cursor-pointer text-[#1f8ef1] text-xs font-medium px-4 hover:text-white transition-colors">
              Pobierz kurs
            </button>
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading} className="cursor-pointer px-8 py-2.5 bg-[#1f8ef1] text-white font-semibold rounded hover:bg-[#1d80d9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        {loading ? 'Zapisywanie...' : 'Zapisz transakcję'}
      </button>
    </form>
  )
}