import React from 'react';
import { useNavigate } from 'react-router';
import { FileText } from 'lucide-react';
import { invoicesApi } from '../../api/invoices';
import { invoiceLabel } from '../../types/invoices';
import { useApiData } from '../../api/useApiData';
import { InvoiceStatusBadge } from '../invoices/InvoiceStatusBadge';
import { formatDate } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

// The client's invoices (GET /api/invoices?clientId=), shown in the client detail panel (admin, manager).
// Invoices linked by client_id only; invoices typed in manually for this company are not linked.
export const ClientInvoicesSection: React.FC<{ clientId: string }> = ({ clientId }) => {
  const navigate = useNavigate();
  const list = useApiData(() => invoicesApi.list({ clientId, limit: 50 }), [clientId]);
  const invoices = list.data?.invoices ?? [];

  return (
    <div className="rounded-xl border border-[#DFE6F1] overflow-hidden" data-testid="client-invoices">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#DFE6F1] bg-white">
        <span className="font-semibold text-[#111827] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#5038F5]" />
          Invoices ({list.data?.total ?? 0})
        </span>
      </div>
      {list.error ? (
        <p className="px-4 py-6 text-center text-[#E11D48]">{list.error}</p>
      ) : !list.data ? (
        <p className="px-4 py-6 text-center text-[#7185A5]">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p className="px-4 py-6 text-center text-[#7185A5]">No invoices for this client yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F7F9FC] text-[11px] font-semibold text-[#7185A5] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFE6F1]">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-[#F7F9FC]/60 cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="px-4 py-2.5 font-mono font-semibold text-[#5038F5] whitespace-nowrap">{invoiceLabel(inv)}</td>
                  <td className="px-4 py-2.5 text-[#475569] whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-2.5">
                    <InvoiceStatusBadge status={inv.derivedStatus} size="sm" />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">{formatMoney(inv.total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">{formatMoney(inv.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
