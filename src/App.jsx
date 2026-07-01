import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import TransactionForm from './components/TransactionForm'
import TransactionList from './components/TransactionList'
import PortfolioChart from './components/PortfolioChart'
import GemModule from './components/GemModule'
import AuthScreen from './components/AuthScreen' // Import nowego ekranu

function App() {
  const [session, setSession] = useState(null)
  const [activeTab, setActiveTab] = useState('portfolio')
  const [refreshList, setRefreshList] = useState(0) 

  useEffect(() => {
    // Sprawdzamy, czy użytkownik jest już zalogowany
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    // Nasłuchujemy zmian (logowanie / wylogowanie)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Funkcja wylogowywania
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // Jeśli brak sesji - pokazujemy ekran logowania
  if (!session) {
    return <AuthScreen />
  }

  // Główna aplikacja widoczna tylko po zalogowaniu
  return (
    <div className="min-h-screen bg-[#1e1e2f] text-white font-sans p-4 md:p-8 selection:bg-[#1f8ef1] selection:text-white">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
          <div>
            <h1 className="text-3xl font-light text-[#9a9a9a] tracking-wide mb-1">
              Portfel inwestycyjny
            </h1>
            <h2 className="text-4xl font-normal text-white tracking-tight">
              Kokpit
            </h2>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex rounded border border-[#fd5d93] overflow-hidden">
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`cursor-pointer px-6 py-1.5 text-sm font-semibold transition-colors duration-200 ${
                  activeTab === 'portfolio' ? 'bg-[#fd5d93] text-white' : 'bg-transparent text-[#fd5d93] hover:bg-[#fd5d93]/10'
                }`}
              >
                Portfolio
              </button>
              <button
                onClick={() => setActiveTab('gem')}
                className={`cursor-pointer px-6 py-1.5 text-sm font-semibold border-l border-[#fd5d93] transition-colors duration-200 ${
                  activeTab === 'gem' ? 'bg-[#fd5d93] text-white' : 'bg-transparent text-[#fd5d93] hover:bg-[#fd5d93]/10'
                }`}
              >
                Strategia GEM
              </button>
            </div>
            
            {/* Przycisk wylogowania */}
            <button 
              onClick={handleLogout}
              className="text-[#9a9a9a] hover:text-[#fd5d93] text-sm transition-colors"
            >
              Wyloguj
            </button>
          </div>
        </header>

        <main className="min-h-[600px]">
          {activeTab === 'portfolio' ? (
            <div className="animate-in fade-in duration-300">
              <PortfolioChart refreshTrigger={refreshList} />
              <TransactionForm onTransactionAdded={() => setRefreshList(prev => prev + 1)} />
              <TransactionList refreshTrigger={refreshList} />
            </div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <GemModule />
            </div>
          )}
        </main>

      </div>
    </div>
  )
}

export default App