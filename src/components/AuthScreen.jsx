import { useState } from 'react';
import { supabase } from '../supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLogin, setIsLogin] = useState(true); // Przełącznik: Logowanie / Rejestracja

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Konto zostało utworzone! (Jeśli włączyłeś potwierdzenie e-mail w Supabase, sprawdź skrzynkę).');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e2f] flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-[#27293d] p-8 rounded-xl shadow-2xl border border-[#2b2b40]">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-light text-[#9a9a9a] mb-2">Portfel</h1>
          <h2 className="text-2xl font-normal text-white">
            {isLogin ? 'Logowanie' : 'Rejestracja'}
          </h2>
        </div>

        {error && (
          <div className="bg-[#fd5d93]/20 border border-[#fd5d93] text-[#fd5d93] p-3 rounded mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col gap-5">
          <div>
            <label className="block text-[#9a9a9a] font-light text-sm mb-2">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 bg-[#1e1e2f] border border-[#2b2b40] rounded text-white focus:border-[#1f8ef1] outline-none transition-colors"
              placeholder="twój@email.com"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-[#9a9a9a] font-light text-sm mb-2">Hasło</label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 bg-[#1e1e2f] border border-[#2b2b40] rounded text-white focus:border-[#1f8ef1] outline-none transition-colors pr-12"
                placeholder="Twoje hasło"
                required
                autoComplete="current-password"
              />
              
              {/* Ikona oka */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1 text-[#9a9a9a] hover:text-white transition-colors cursor-pointer"
                title={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
              >
                {showPassword ? (
                  // Przekreślone oko (ukrywanie)
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  // Otwarte oko (pokazywanie)
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#1f8ef1] hover:bg-[#1d80d9] text-white font-semibold py-3 px-4 rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Przetwarzanie...' : (isLogin ? 'Zaloguj się' : 'Zarejestruj się')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-[#9a9a9a] hover:text-white transition-colors cursor-pointer"
          >
            {isLogin 
              ? 'Nie masz jeszcze konta? Zarejestruj się.' 
              : 'Masz już konto? Zaloguj się.'}
          </button>
        </div>

      </div>
    </div>
  );
}