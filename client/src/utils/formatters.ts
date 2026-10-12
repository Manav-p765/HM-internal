/**
 * Currency, Date, and Reporting formatters
 */

export function formatCurrency(amount: number, currencyCode: string = 'INR'): string {
  const safeAmount = Math.round((Number(amount) || 0) * 100) / 100;
  
  if (currencyCode === 'INR') {
    // Format with Indian numbering system (lakhs, crores)
    return '₹' + new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }

  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
  };

  const symbol = symbols[currencyCode] || currencyCode + ' ';
  return symbol + new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '—';
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return dateString;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatMonthYear(monthStr: string): string {
  if (!monthStr) return '—';
  try {
    const [year, month] = monthStr.split('-').map(Number);
    if (!year || !month) return monthStr;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return monthStr;
  }
}

export function getNextInvoiceNumber(existingNumbers: string[], prefix: string = 'INV-2026-'): string {
  let highestSeq = 0;
  for (const num of existingNumbers) {
    if (num && num.startsWith(prefix)) {
      const remainder = num.slice(prefix.length);
      const parsed = parseInt(remainder, 10);
      if (!isNaN(parsed) && parsed > highestSeq) {
        highestSeq = parsed;
      }
    }
  }
  const nextSeq = highestSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number | undefined)[][]): void {
  const escapeValue = (val: string | number | undefined): string => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent = [
    headers.map(escapeValue).join(','),
    ...rows.map(row => row.map(escapeValue).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function roundToTwoDecimals(num: number): number {
  return Math.round((Number(num) || 0) * 100) / 100;
}
