import { useState } from 'react'
import TransactionForm from './components/TransactionForm'
import TransactionList from './components/TransactionList'
import PortfolioChart from './components/PortfolioChart'

function App() {
  const [activeTab, setActiveTab] = useState('portfolio')
  // Stan służący do wymuszania odświeżenia listy i wykresu po dodaniu transakcji
  const [refreshList, setRefreshList] = useState(0) 

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            Dashboard Inwestycyjny
          </h1>
          
          <div className="flex bg-white rounded-lg shadow-sm p-1 border border-slate-200">
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === 'portfolio' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Portfel (Historia)
            </button>
            <button
              onClick={() => setActiveTab('gem')}
              className={`px-6 py-2 rounded-md font-medium transition-all duration-200 ${
                activeTab === 'gem' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Strategia GEM
            </button>
          </div>
        </header>

        <main className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[600px]">
          {activeTab === 'portfolio' ? (
            <div>
              <h2 className="text-2xl font-bold mb-6">Mój Portfel</h2>
              
              {/* Wykres wpłaconego kapitału */}
              <PortfolioChart refreshTrigger={refreshList} />
              
              {/* Formularz dodawania transakcji */}
              <TransactionForm onTransactionAdded={() => setRefreshList(prev => prev + 1)} />
              
              {/* Tabela historii transakcji */}
              <TransactionList refreshTrigger={refreshList} />
              
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold mb-6">System Sygnałów GEM</h2>
              <div className="flex items-center justify-center h-64 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500">Tutaj wstawimy wskaźniki ETF i moduł momentum.</p>
              </div>
            </div>
          )}
        </main>

      </div>
    </div>
  )
}

export default App