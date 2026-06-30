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
    asset_currency: 'USD',
    exchange_rate_pln: ''
  })

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
      .insert([
        {
          transaction_date: formData.transaction_date,
          ticker: formData.ticker.toUpperCase(),
          asset_name: formData.asset_name,
          type: formData.type,
          quantity: parseFloat(formData.quantity),
          price_per_share: parseFloat(formData.price_per_share),
          asset_currency: formData.asset_currency,
          exchange_rate_pln: parseFloat(formData.exchange_rate_pln)
        }
      ])

    setLoading(false)

    if (error) {
      console.error('Błąd:', error)
      alert('Błąd: ' + error.message)
    } else {
      alert('Dodano transakcję!')
      setFormData({ ...formData, ticker: '', asset_name: '', quantity: '', price_per_share: '', exchange_rate_pln: '' })
      if (onTransactionAdded) onTransactionAdded()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
      <h3 className="text-lg font-semibold mb-4 text-slate-800">Dodaj nową transakcję</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Data transakcji</label>
          <input type="date" name="transaction_date" value={formData.transaction_date} onChange={handleChange} required className="w-full p-2 border border-slate-300 rounded-md outline-none" />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Typ</label>
          <select name="type" value={formData.type} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-md outline-none">
            <option value="BUY">Kupno (BUY)</option>
            <option value="SELL">Sprzedaż (SELL)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Ticker (np. SPY)</label>
          <input type="text" name="ticker" value={formData.ticker} onChange={handleChange} required className="w-full p-2 border border-slate-300 rounded-md outline-none uppercase" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Pełna nazwa aktywa</label>
          <input type="text" name="asset_name" value={formData.asset_name} onChange={handleChange} required className="w-full p-2 border border-slate-300 rounded-md outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Ilość</label>
          <input type="number" step="any" name="quantity" value={formData.quantity} onChange={handleChange} required className="w-full p-2 border border-slate-300 rounded-md outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Cena za sztukę</label>
          <input type="number" step="any" name="price_per_share" value={formData.price_per_share} onChange={handleChange} required className="w-full p-2 border border-slate-300 rounded-md outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Waluta</label>
          <select name="asset_currency" value={formData.asset_currency} onChange={handleChange} className="w-full p-2 border border-slate-300 rounded-md outline-none">
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="PLN">PLN</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Kurs NBP do PLN</label>
          <div className="flex gap-2">
            <input type="number" step="any" name="exchange_rate_pln" value={formData.exchange_rate_pln} onChange={handleChange} required className="w-full p-2 border border-slate-300 rounded-md outline-none" />
            <button type="button" onClick={fetchNBPRate} className="bg-slate-100 hover:bg-slate-200 px-3 rounded-md border border-slate-300 text-sm">
              Pobierz
            </button>
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300">
        {loading ? 'Zapisywanie...' : 'Zapisz transakcję'}
      </button>
    </form>
  )
}