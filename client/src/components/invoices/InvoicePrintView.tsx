import React, { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { invoicesApi } from '../../api/invoices';
import { invoiceLabel } from '../../types/invoices';
import { settingsApi } from '../../api/settings';
import { useApiData } from '../../api/useApiData';
import { LoadError } from '../common/LoadError';
import { Button } from '../common/Button';
import { InvoiceDocument } from './InvoiceDocument';
import { ArrowLeft, Download, Printer } from 'lucide-react';

// /invoices/:id/print: the A4 invoice (InvoiceDocument) from company settings, the client snapshot, the items
// and the server totals. When printing, the app chrome (sidebar, top bar, footer, this toolbar) is hidden by
// the `.no-print` / `.invoice-sheet` rules in index.css; "Save as PDF" is the browser's print dialog. There is
// no server-side PDF: the old invoice generator rendered PDFs with Puppeteer/Chromium, which this app does
// not run. "Download PDF" (?download=1) opens this page and starts the print dialog once the data is in.
export const InvoicePrintView: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useApiData(() => Promise.all([invoicesApi.get(id), settingsApi.company()]), [id]);
  const printed = useRef(false);
  const ready = data.data?.[0].invoice;

  // The document title is the browser's suggested PDF file name: "HM-0007 - Acme" (or "Draft - Acme").
  useEffect(() => {
    if (!ready) return;
    const previous = document.title;
    document.title = `${invoiceLabel(ready)} - ${ready.clientName}`;
    return () => {
      document.title = previous;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || printed.current || searchParams.get('download') !== '1') return;
    printed.current = true;
    // Drop the flag first so a reload or "Back" doesn't print again.
    setSearchParams({}, { replace: true });
    window.print();
  }, [ready, searchParams, setSearchParams]);

  if (data.error) return <LoadError message={data.error} onRetry={data.reload} />;
  if (!data.data) return <div className="py-10 text-center text-xs text-[#7185A5]">Loading invoice…</div>;
  const [{ invoice }, company] = data.data;

  return (
    <div className="invoice-print-root">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button variant="outline" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate(`/invoices/${invoice.id}`)}>
          Back to invoice
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#7185A5] hidden sm:inline">A4 · choose "Save as PDF" in the print dialog</span>
          <Button variant="outline" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="primary" size="sm" icon={<Download className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Download PDF
          </Button>
        </div>
      </div>

      <article className="invoice-sheet relative bg-white mx-auto border border-[#DFE6F1] shadow-sm" data-testid="invoice-sheet">
        <InvoiceDocument invoice={invoice} company={company} />
      </article>
    </div>
  );
};
