import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

// Pamięć podręczna dla kursów NBP, żeby nie pytać API wielokrotnie o ten sam dzień
const nbpCache = {};

export default function XtbImporter({ onImportComplete }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Tłumacz Tickerów XTB -> Yahoo Finance
  const mapXtbToYahoo = (xtbTicker) => {
    if (!xtbTicker) return '';
    const parts = xtbTicker.split('.');
    if (parts.length === 1) return xtbTicker; 
    const base = parts[0];
    const suffix = parts[1].toUpperCase();
    
    switch (suffix) {
      case 'PL': return `${base}.WA`;
      case 'US': return base;
      case 'UK': return `${base}.L`;
      case 'DE': return `${base}.DE`;
      case 'FR': return `${base}.PA`;
      case 'ES': return `${base}.MC`;
      case 'NL': return `${base}.AS`;
      case 'IT': return `${base}.MI`;
      default: return xtbTicker;
    }
  };

  // Funkcja pobierająca historyczne kursy z NBP (z obsługą weekendów)
  const fetchNbpRates = async (dateStr) => {
    let targetDate = new Date(dateStr);
    let attempts = 0;

    while (attempts < 5) {
      const dateString = targetDate.toISOString().split('T')[0];
      if (nbpCache[dateString]) return nbpCache[dateString];

      try {
        const response = await fetch(`https://api.nbp.pl/api/exchangerates/tables/A/${dateString}/?format=json`);
        if (response.ok) {
          const data = await response.json();
          const rates = data[0].rates;
          
          const result = {
            USD: rates.find(r => r.code === 'USD')?.mid || 4.0,
            EUR: rates.find(r => r.code === 'EUR')?.mid || 4.3,
            GBP: rates.find(r => r.code === 'GBP')?.mid || 5.0,
          };
          
          nbpCache[dateString] = result;
          return result;
        }
      } catch (e) {
        console.warn(`Brak kursu dla ${dateString}, sprawdzam dzień wcześniej...`);
      }
      
      targetDate.setDate(targetDate.getDate() - 1);
      attempts++;
    }
    
    return { USD: 4.0, EUR: 4.3, GBP: 5.0 };
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatus('Czytanie pliku Excel...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const cashSheetName = workbook.SheetNames.find(s => s.includes('Cash Operations') || s.includes('Operacje gotówkowe'));
      if (!cashSheetName) throw new Error("Nie znaleziono arkusza 'Cash Operations'.");

      const sheet = workbook.Sheets[cashSheetName];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
      const parsedData = extractDataFromXtbArray(rawData);
      await processAndUpload(parsedData, file.name);

    } catch (error) {
       console.error(error);
       setStatus('Błąd: ' + error.message);
    } finally {
       setLoading(false);
       e.target.value = null; 
    }
  };

  const extractDataFromXtbArray = (rawRows) => {
      let headerIndex = -1;
      for (let i = 0; i < Math.min(15, rawRows.length); i++) {
        if (!rawRows[i]) continue;
        const rowString = rawRows[i].join(' ').toLowerCase();
        if (rowString.includes('type') || rowString.includes('typ')) {
          headerIndex = i; break;
        }
      }
      if (headerIndex === -1) throw new Error("Nie rozpoznano nagłówków.");

      const headers = rawRows[headerIndex];
      return rawRows.slice(headerIndex + 1).map(row => {
        let rowObj = {};
        headers.forEach((header, index) => {
          if (header) rowObj[header.toString().trim()] = row[index] || '';
        });
        return rowObj;
      }).filter(obj => Object.keys(obj).length > 0);
  };

  const parseXtbDate = (rawDate) => {
    if (!rawDate) return null;
    if (rawDate instanceof Date) return rawDate.toISOString().split('T')[0];
    if (typeof rawDate === 'string') {
      const match = rawDate.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return new Date().toISOString().split('T')[0]; 
  };

  const processAndUpload = async (parsedData, fileName) => {
    setStatus('Inicjalizacja czyszczenia portfela...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Musisz być zalogowany.");

    // ZAWSZE automatycznie czyścimy dotychczasowy portfel użytkownika przed nowym importem
    setStatus('Resetowanie bazy danych...');
    const { error: deleteError } = await supabase.from('transactions').delete().eq('user_id', user.id);
    if (deleteError) throw new Error("Błąd automatycznego czyszczenia bazy: " + deleteError.message);

    const dbTransactions = [];

    for (const row of parsedData) {
        const typeRaw = (row['Type'] || row['Typ'] || '').toLowerCase();
        if (!typeRaw) continue; 

        const isDeposit = typeRaw.includes('deposit') || typeRaw.includes('wpłata') || typeRaw.includes('transfer in');
        const isWithdrawal = typeRaw.includes('withdrawal') || typeRaw.includes('wypłata') || typeRaw.includes('transfer out');
        const isPurchase = typeRaw.includes('purchase') || typeRaw.includes('kupno');
        const isSell = typeRaw.includes('sell') || typeRaw.includes('sprzedaż') || typeRaw.includes('sale');
        const isDividend = typeRaw.includes('dividend') || typeRaw.includes('dywidenda');
        const isTax = typeRaw.includes('tax') || typeRaw.includes('podatek');
        const isFee = typeRaw.includes('fee') || typeRaw.includes('opłata');

        if (!isDeposit && !isWithdrawal && !isPurchase && !isSell && !isDividend && !isTax && !isFee) continue; 

        const amountPLN = Math.abs(parseFloat((row['Amount'] || row['Kwota'] || '0').toString().replace(',', '.').replace(/\s/g, '')));
        if (isNaN(amountPLN) || amountPLN === 0) continue; 

        const comment = row['Comment'] || row['Komentarz'] || '';
        const dateFormatted = parseXtbDate(row['Time'] || row['Czas']);
        if (!dateFormatted) continue;
        
        let xtbTicker = row['Ticker'] || row['Symbol'] || '';
        let mappedTicker = mapXtbToYahoo(xtbTicker);
        const suffix = xtbTicker.includes('.') ? xtbTicker.split('.')[1].toUpperCase() : '';

        // 1. WPŁATY I WYPŁATY
        if (isDeposit || isWithdrawal) {
            dbTransactions.push({
                user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: isDeposit ? 'Zasilenie konta' : 'Wypłata z konta',
                type: isDeposit ? 'BUY' : 'SELL', quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0
            });
            continue;
        }

        // 2. KUPNO I SPRZEDAŻ AKCJI
        if (isPurchase || isSell) {
            let qty = 1; let price = amountPLN; let exchangeRate = 1;
            const commentMatch = comment.match(/(?:BUY|SELL)\s+([\d.]+)(?:\/[\d.]+)?\s+@\s+([\d.]+)/);
            if (commentMatch) {
                qty = parseFloat(commentMatch[1]); price = parseFloat(commentMatch[2]);
                if (qty > 0 && price > 0) exchangeRate = amountPLN / (qty * price);
            }

            let detectedCurrency = 'USD'; 
            if (suffix === 'PL' || (exchangeRate > 0.8 && exchangeRate < 1.2)) {
                detectedCurrency = 'PLN';
            } else {
                const nbpRates = await fetchNbpRates(dateFormatted);
                const diffs = {
                    USD: Math.abs(exchangeRate - nbpRates.USD),
                    EUR: Math.abs(exchangeRate - nbpRates.EUR),
                    GBP: Math.abs(exchangeRate - nbpRates.GBP)
                };
                detectedCurrency = Object.keys(diffs).reduce((a, b) => diffs[a] < diffs[b] ? a : b);
            }

            if (isPurchase) {
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: mappedTicker, asset_name: 'Zakup akcji', type: 'BUY', quantity: qty, price_per_share: price, asset_currency: detectedCurrency, exchange_rate_pln: Number(exchangeRate.toFixed(4)), commission: 0 });
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: `Zapłata za ${mappedTicker}`, type: 'SELL', quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0 });
            } else {
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: mappedTicker, asset_name: 'Sprzedaż akcji', type: 'SELL', quantity: qty, price_per_share: price, asset_currency: detectedCurrency, exchange_rate_pln: Number(exchangeRate.toFixed(4)), commission: 0 });
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: `Wpływ za ${mappedTicker}`, type: 'BUY', quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0 });
            }
            continue;
        }

        // 3. DYWIDENDY I PODATKI
        let cashType = ''; let cashName = '';
        if (isDividend) { cashType = 'DIVIDEND'; cashName = `Dywidenda ${xtbTicker}`; }
        else if (isTax) { cashType = 'FEE'; cashName = `Podatek u źródła ${xtbTicker}`; }
        else if (isFee) { cashType = 'FEE'; cashName = 'Opłata pobrana przez XTB'; }

        if (cashType) {
             dbTransactions.push({
                user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: cashName,
                type: cashType, quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0
            });
        }
    }

    if (dbTransactions.length === 0) {
      setStatus('Brak poprawnych transakcji w pliku.'); return;
    }

    setStatus(`Zapisywanie ${dbTransactions.length} operacji do bazy...`);
    const { error } = await supabase.from('transactions').insert(dbTransactions);
    if (error) throw error;

    setStatus(`✅ Gotowe! Zaimportowano ${dbTransactions.length} operacji.`);
    if (onImportComplete) onImportComplete();
  };

  return (
    <div className="bg-[#27293d] p-4 rounded-xl shadow-lg mb-6 border border-[#2b2b40] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">Automatyczny Import XTB</h3>
          <span className="bg-[#1f8ef1]/20 text-[#1f8ef1] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#1f8ef1]/50">
            MOŻE NIE DZIAŁAĆ POPRAWNIE
          </span>
          
          <div 
            className="relative flex items-center ml-1"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
          >
            <span 
              onClick={() => setShowHelp(!showHelp)}
              className="cursor-pointer w-4 h-4 flex items-center justify-center rounded-full bg-[#1f8ef1]/20 text-[#1f8ef1] text-[10px] font-bold border border-[#1f8ef1]/50 hover:bg-[#1f8ef1] hover:text-white transition-colors"
            >
              ?
            </span>
            
            {showHelp && (
              <div className="absolute left-0 md:left-1/2 md:-translate-x-1/2 bottom-full mb-2 w-72 md:w-80 p-3 bg-[#1e1e2f] border border-[#2b2b40] rounded-lg shadow-2xl z-50 text-xs text-[#9a9a9a] leading-relaxed">
                <strong className="text-white block mb-2">Instrukcja importu plików XTB:</strong>
                <ol className="list-decimal pl-4 space-y-1 mb-3">
                  <li>Zaloguj się do platformy <span className="text-[#1f8ef1]">xStation 5</span>.</li>
                  <li>Przejdź do zakładki <strong>Historia</strong> → <strong>Operacje gotówkowe</strong>.</li>
                  <li>Wybierz zakres dat i kliknij ikonkę pobierania (Eksportuj do Excel).</li>
                  <li>Wybierz pobrany plik <code>.xlsx</code> przyciskiem obok.</li>
                </ol>
                <div className="bg-[#fd5d93]/10 border border-[#fd5d93]/30 p-2 rounded text-[#fd5d93]">
                  <strong>⚠️ UWAGA:</strong> Każde załadowanie pliku <strong>automatycznie i trwale usuwa</strong> wszystkie dotychczasowe transakcje w Twoim portfelu, aby uniknąć duplikatów i całkowicie odświeżyć historię.
                </div>
                <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-[#2b2b40]"></div>
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-[#9a9a9a] font-light">Wgraj raport operacji gotówkowych, aby zsynchronizować swój portfel.</p>
      </div>

      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="text-xs text-[#1f8ef1] font-medium truncate max-w-[200px]">
          {status}
        </div>
        <label className="flex items-center justify-center px-4 py-2 bg-[#1e1e2f] border border-[#1f8ef1] text-[#1f8ef1] text-xs font-semibold rounded cursor-pointer hover:bg-[#1f8ef1]/10 transition-colors shrink-0 ml-auto md:ml-0">
          <span>Wybierz .xlsx</span>
          <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={loading} />
        </label>
      </div>

    </div>
  );
}