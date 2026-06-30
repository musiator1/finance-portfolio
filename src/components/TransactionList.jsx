import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function TransactionList({ refreshTrigger }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  
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

    if (error) console.error('Błąd pobierania:', error)
    else setTransactions(data)
    setLoading(false)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę transakcję?')) return
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) alert('Błąd podczas usuwania: ' + error.message)
    else fetchTransactions() 
  }

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
      setEditingId(null)
      fetchTransactions() 
    }
  }

  if (loading) return <p className="text-[#1f8ef1] font-light mt-4 pl-4">Loading data...</p>

  if (transactions.length === 0) {
    return <p className="text-[#9a9a9a] mt-6 p-6 bg-[#27293d] rounded-xl text-center font-light shadow-lg">Nie znaleziono transakcji.</p>
  }

  const editInputClass = "w-full p-1.5 border-b border-[#1f8ef1] bg-[#1e1e2f] text-white outline-none text-sm font-light rounded-t"

  return (
    <div className="overflow-x-auto bg-[#27293d] rounded-xl shadow-lg mt-6">
      <div className="p-5 flex justify-between items-center">
        <h3 className="text-lg font-light text-white">Operacje</h3>
        <span className="text-[#9a9a9a] text-xs font-medium">
          Total: {transactions.length}
        </span>
      </div>
      <table className="w-full text-left border-collapse min-w-[800px]">
        <thead>
          <tr className="text-[#9a9a9a] text-xs font-light border-y border-[#1e1e2f]">
            <th className="p-4 font-normal">Data</th>
            <th className="p-4 font-normal">Nazwa</th>
            <th className="p-4 font-normal">Typ</th>
            <th className="p-4 font-normal">Ilość</th>
            <th className="p-4 font-normal">Cena</th>
            <th className="p-4 font-normal">Kurs wymiany</th>
            <th className="p-4 font-normal">Wartość (PLN)</th>
            <th className="p-4 font-normal text-right pr-6">Akcje</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e1e2f]">
          {transactions.map((t) => {
            const isEditing = editingId === t.id

            return isEditing ? (
              <tr key={t.id} className="bg-[#1e1e2f]/50">
                <td className="p-3"><input type="date" name="transaction_date" value={editForm.transaction_date} onChange={handleEditChange} className={editInputClass} style={{ colorScheme: "dark" }} /></td>
                <td className="p-3">
                  <input type="text" name="ticker" value={editForm.ticker} onChange={handleEditChange} placeholder="Ticker" className={`${editInputClass} mb-1.5 uppercase font-medium`} />
                  <input type="text" name="asset_name" value={editForm.asset_name} onChange={handleEditChange} placeholder="Nazwa" className={editInputClass} />
                </td>
                <td className="p-3">
                  <select name="type" value={editForm.type} onChange={handleEditChange} className={`${editInputClass} cursor-pointer font-medium ${editForm.type === 'BUY' ? 'text-[#00f2c3]' : 'text-[#fd5d93]'}`}>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </td>
                <td className="p-3"><input type="number" step="any" name="quantity" value={editForm.quantity} onChange={handleEditChange} className={`${editInputClass} w-16`} /></td>
                <td className="p-3">
                  <input type="number" step="any" name="price_per_share" value={editForm.price_per_share} onChange={handleEditChange} className={`${editInputClass} mb-1.5 w-20`} />
                  <select name="asset_currency" value={editForm.asset_currency} onChange={handleEditChange} className={`${editInputClass} cursor-pointer`}>
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="PLN">PLN</option>
                  </select>
                </td>
                <td className="p-3"><input type="number" step="any" name="exchange_rate_pln" value={editForm.exchange_rate_pln} onChange={handleEditChange} className={`${editInputClass} w-16`} /></td>
                <td className="p-3 text-sm text-[#9a9a9a] font-light">Auto</td>
                <td className="p-3 pr-6 text-right">
                  <div className="flex flex-col gap-2 items-end">
                    <button onClick={() => saveEdit(t.id)} className="cursor-pointer text-[#00f2c3] hover:text-white text-xs font-semibold">Save</button>
                    <button onClick={() => setEditingId(null)} className="cursor-pointer text-[#9a9a9a] hover:text-white text-xs font-semibold">Cancel</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={t.id} className="hover:bg-[#1e1e2f] transition-colors group">
                <td className="p-4 text-sm text-[#9a9a9a] font-light">{t.transaction_date}</td>
                <td className="p-4 text-sm font-medium text-white">
                  {t.ticker} <span className="text-[#9a9a9a] text-xs font-light ml-1">{t.asset_name}</span>
                </td>
                <td className="p-4 text-sm">
                  <span className={`font-medium ${t.type === 'BUY' ? 'text-[#00f2c3]' : 'text-[#fd5d93]'}`}>
                    {t.type}
                  </span>
                </td>
                <td className="p-4 text-sm text-white font-light">{t.quantity}</td>
                <td className="p-4 text-sm text-white font-light">{t.price_per_share} <span className="text-[#9a9a9a] text-xs">{t.asset_currency}</span></td>
                <td className="p-4 text-sm text-[#9a9a9a] font-light">{t.exchange_rate_pln}</td>
                <td className="p-4 text-sm font-normal text-white">
                  {Number(t.total_value_pln).toLocaleString('pl-PL')}
                </td>
                <td className="p-4 text-right pr-6">
                  <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(t)} className="cursor-pointer text-[#1f8ef1] hover:text-white text-sm" title="Edit">
                      ✎
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="cursor-pointer text-[#fd5d93] hover:text-white text-sm" title="Delete">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}