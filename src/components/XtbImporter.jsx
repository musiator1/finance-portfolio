import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

export default function XtbImporter({ onImportComplete }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [clearDatabase, setClearDatabase] = useState(false);
  const [showHelp, setShowHelp] = useState(false); // Stan dla dymka z instrukcją

  // Tłumacz Tickerów XTB -> Yahoo Finance
  const mapXtbToYahoo = (xtbTicker) => {
    if (!xtbTicker) return { ticker: '', currency: 'PLN' };
    const parts = xtbTicker.split('.');
    if (parts.length === 1) return { ticker: xtbTicker, currency: 'USD' }; 
    const base = parts[0];
    const suffix = parts[1].toUpperCase();
    switch (suffix) {
      case 'PL': return { ticker: `${base}.WA`, currency: 'PLN' };
      case 'US': return { ticker: base, currency: 'USD' };
      case 'UK': return { ticker: `${base}.L`, currency: 'GBP' };
      case 'DE': return { ticker: `${base}.DE`, currency: 'EUR' };
      case 'FR': return { ticker: `${base}.PA`, currency: 'EUR' };
      case 'ES': return { ticker: `${base}.MC`, currency: 'EUR' };
      case 'NL': return { ticker: `${base}.AS`, currency: 'EUR' };
      case 'IT': return { ticker: `${base}.MI`, currency: 'EUR' };
      default: return { ticker: xtbTicker, currency: 'USD' };
    }
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
    setStatus('Analiza i księgowanie danych...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Musisz być zalogowany.");

    if (clearDatabase) {
      setStatus('Czyszczenie starego portfela...');
      const { error: deleteError } = await supabase.from('transactions').delete().eq('user_id', user.id);
      if (deleteError) throw new Error("Błąd czyszczenia: " + deleteError.message);
    }

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
        let mappedData = mapXtbToYahoo(xtbTicker);

        if (isDeposit || isWithdrawal) {
            dbTransactions.push({
                user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: isDeposit ? 'Zasilenie konta' : 'Wypłata z konta',
                type: isDeposit ? 'BUY' : 'SELL', quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0
            });
            continue;
        }

        if (isPurchase || isSell) {
            let qty = 1; let price = amountPLN; let exchangeRate = 1;
            const commentMatch = comment.match(/(?:BUY|SELL)\s+([\d.]+)(?:\/[\d.]+)?\s+@\s+([\d.]+)/);
            if (commentMatch) {
                qty = parseFloat(commentMatch[1]); price = parseFloat(commentMatch[2]);
                if (qty > 0 && price > 0) exchangeRate = amountPLN / (qty * price);
            }

            if (isPurchase) {
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: mappedData.ticker, asset_name: 'Zakup akcji', type: 'BUY', quantity: qty, price_per_share: price, asset_currency: mappedData.currency, exchange_rate_pln: Number(exchangeRate.toFixed(4)), commission: 0 });
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: `Zapłata za ${mappedData.ticker}`, type: 'SELL', quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0 });
            } else {
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: mappedData.ticker, asset_name: 'Sprzedaż akcji', type: 'SELL', quantity: qty, price_per_share: price, asset_currency: mappedData.currency, exchange_rate_pln: Number(exchangeRate.toFixed(4)), commission: 0 });
                dbTransactions.push({ user_id: user.id, transaction_date: dateFormatted, ticker: 'CASH-PLN', asset_name: `Wpływ za ${mappedData.ticker}`, type: 'BUY', quantity: amountPLN, price_per_share: 1, asset_currency: 'PLN', exchange_rate_pln: 1, commission: 0 });
            }
            continue;
        }

        let cashType = ''; let cashName = '';
        if (isDividend) { cashType = 'DIVIDEND'; cashName = `Dywidenda ${xtbTicker}`; }
        else if (isTax) { cashType = 'FEE'; cashName = `Podatek (Belki/U źródła) ${xtbTicker}`; }
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

    setStatus(`✅ Gotowe! Wgrano ${dbTransactions.length} zbilansowanych operacji.`);
    if (onImportComplete) onImportComplete();
  };

  return (
    <div className="bg-[#27293d] p-4 rounded-xl shadow-lg mb-6 border border-[#2b2b40] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">Import z XTB (Wersja Beta)</h3>
          <span className="bg-[#00f2c3]/20 text-[#00f2c3] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#00f2c3]/50">
            AUTO-FX
          </span>
          
          {/* Znak zapytania z instrukcją */}
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
                  <li>Przejdź do zakładki <strong>Historia</strong>, a następnie <strong>Operacje gotówkowe</strong>.</li>
                  <li>Wybierz interesujący Cię zakres dat i kliknij ikonkę pobierania (Eksportuj do Excel).</li>
                  <li>Wybierz pobrany plik <code>.xlsx</code> używając przycisku poniżej.</li>
                </ol>
                <div className="bg-[#fd5d93]/10 border border-[#fd5d93]/30 p-2 rounded text-[#fd5d93]">
                  <strong>⚠️ UWAGA:</strong> Jeśli zaznaczysz pole wyczyszczenia bazy, wszystkie dotychczasowe transakcje w tym portfelu zostaną <strong>trwale usunięte</strong> przed dodaniem nowych!
                </div>
                {/* Strzałeczka w dół (widoczna na dekstopach) */}
                <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-[#2b2b40]"></div>
              </div>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input 
            type="checkbox" 
            checked={clearDatabase}
            onChange={(e) => setClearDatabase(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#fd5d93] cursor-pointer rounded"
          />
          <span className="text-[#fd5d93] font-medium text-xs">
            Wyczyść obecne transakcje przed wgraniem pliku
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="text-xs text-white font-medium truncate max-w-[150px]">
          {status}
        </div>
        <label className="flex items-center justify-center px-4 py-2 bg-[#1e1e2f] border border-[#00f2c3] text-[#00f2c3] text-xs font-semibold rounded cursor-pointer hover:bg-[#00f2c3]/10 transition-colors shrink-0 ml-auto md:ml-0">
          <span>Wybierz .xlsx</span>
          <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} disabled={loading} />
        </label>
      </div>

    </div>
  );
}