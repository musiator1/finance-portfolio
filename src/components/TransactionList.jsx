import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function TransactionList({ refreshTrigger }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Stany do obsługi edycji
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => {
    fetchTransactions()
  }, [refreshTrigger])

  const fetchTransactions = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false })

    if (error) {
      console.error('Błąd pobierania:', error)
    } else {
      setTransactions(data)
    }
    setLoading(false)
  }

  // --- FUNKCJA USUWANIA ---
  const handleDelete = async (id) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę transakcję?')) return

    const { error } = await supabase.from('transactions').delete().eq('id', id)
    
    if (error) {
      alert('Błąd podczas usuwania: ' + error.message)
    } else {
      fetchTransactions() // Odśwież listę po usunięciu
    }
  }

  // --- FUNKCJE EDYCJI ---
  const startEdit = (t) => {
    setEditingId(t.id)
    setEditForm({
      transaction_date: t.transaction_date,
      ticker: t.ticker,
      asset_name: t.asset_name,
      type: t.type,
      quantity: t.quantity,
      price_per_share: t.price_per_share,
      asset_currency: t.asset_currency,
      exchange_rate_pln: t.exchange_rate_pln
    })
  }

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value })
  }

  const saveEdit = async (id) => {
    const { error } = await supabase
      .from('transactions')
      .update({
        transaction_date: editForm.transaction_date,
        ticker: editForm.ticker.toUpperCase(),
        asset_name: editForm.asset_name,
        type: editForm.type,
        quantity: parseFloat(editForm.quantity),
        price_per_share: parseFloat(editForm.price_per_share),
        asset_currency: editForm.asset_currency,
        exchange_rate_pln: parseFloat(editForm.exchange_rate_pln)
      })
      .eq('id', id)

    if (error) {
      alert('Błąd podczas zapisu edycji: ' + error.message)
    } else {
      setEditingId(null) // Wyjdź z trybu edycji
      fetchTransactions() // Odśwież listę z nowymi danymi
    }
  }

  if (loading) return <p className="text-slate-500 mt-8">Ładowanie transakcji...</p>

  if (transactions.length === 0) {
    return <p className="text-slate-500 mt-8">Brak transakcji w bazie. Dodaj pierwszą powyżej!</p>
  }

  return (
    <div className="overflow-x-auto mt-8 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800">Historia transakcji</h3>
      </div>
      <table className="w-full text-left border-collapse min-w-[800px]">
        <thead>
          <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
            <th className="p-3 font-medium">Data</th>
            <th className="p-3 font-medium">Aktywo (Ticker)</th>
            <th className="p-3 font-medium">Typ</th>
            <th className="p-3 font-medium">Ilość</th>
            <th className="p-3 font-medium">Cena/szt</th>
            <th className="p-3 font-medium">Kurs PLN</th>
            <th className="p-3 font-medium">Wartość PLN</th>
            <th className="p-3 font-medium text-center">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const isEditing = editingId === t.id

            return isEditing ? (
              // --- WIDOK EDYCJI ---
              <tr key={t.id} className="border-b border-slate-100 bg-blue-50/50">
                <td className="p-2"><input type="date" name="transaction_date" value={editForm.transaction_date} onChange={handleEditChange} className="w-full p-1 border rounded text-sm" /></td>
                <td className="p-2">
                  <input type="text" name="ticker" value={editForm.ticker} onChange={handleEditChange} placeholder="Ticker" className="w-full p-1 border rounded text-sm mb-1 uppercase" />
                  <input type="text" name="asset_name" value={editForm.asset_name} onChange={handleEditChange} placeholder="Nazwa" className="w-full p-1 border rounded text-sm" />
                </td>
                <td className="p-2">
                  <select name="type" value={editForm.type} onChange={handleEditChange} className="w-full p-1 border rounded text-sm bg-white">
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </td>
                <td className="p-2"><input type="number" step="any" name="quantity" value={editForm.quantity} onChange={handleEditChange} className="w-full p-1 border rounded text-sm w-16" /></td>
                <td className="p-2">
                  <input type="number" step="any" name="price_per_share" value={editForm.price_per_share} onChange={handleEditChange} className="w-full p-1 border rounded text-sm mb-1 w-20" />
                  <select name="asset_currency" value={editForm.asset_currency} onChange={handleEditChange} className="w-full p-1 border rounded text-sm bg-white">
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="PLN">PLN</option>
                  </select>
                </td>
                <td className="p-2"><input type="number" step="any" name="exchange_rate_pln" value={editForm.exchange_rate_pln} onChange={handleEditChange} className="w-full p-1 border rounded text-sm w-20" /></td>
                <td className="p-2 text-sm text-slate-500 italic">Auto</td>
                <td className="p-2 text-center">
                  <button onClick={() => saveEdit(t.id)} className="text-green-600 hover:text-green-800 text-sm font-medium mr-2">Zapisz</button>
                  <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-700 text-sm font-medium">Anuluj</button>
                </td>
              </tr>
            ) : (
              // --- WIDOK STANDARDOWY ---
              <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="p-3 text-sm text-slate-700">{t.transaction_date}</td>
                <td className="p-3 text-sm font-medium text-slate-900">
                  {t.ticker} <span className="text-slate-500 text-xs font-normal">({t.asset_name})</span>
                </td>
                <td className="p-3 text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${t.type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {t.type}
                  </span>
                </td>
                <td className="p-3 text-sm text-slate-700">{t.quantity}</td>
                <td className="p-3 text-sm text-slate-700">{t.price_per_share} {t.asset_currency}</td>
                <td className="p-3 text-sm text-slate-700">{t.exchange_rate_pln}</td>
                <td className="p-3 text-sm font-semibold text-slate-800">
                  {Number(t.total_value_pln).toFixed(2)} PLN
                </td>
                <td className="p-3 text-sm text-center">
                  <button onClick={() => startEdit(t)} className="text-blue-600 hover:text-blue-800 font-medium mr-3">Edytuj</button>
                  <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:text-red-700 font-medium">Usuń</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}