import React from 'react';
import { useApp } from '../../context/AppContext';
import { Invoice } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Printer, CreditCard, CheckCircle2, Clock } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onRecordPayment: (invoice: Invoice) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onRecordPayment,
}) => {
  const { settings } = useApp();

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status: Invoice['status']) => {
    switch (status) {
      case 'Paid':
        return <Badge variant="success">Paid</Badge>;
      case 'Partially Paid':
        return <Badge variant="warning">Partially Paid</Badge>;
      case 'Overdue':
        return <Badge variant="error">Overdue</Badge>;
      case 'Sent':
        return <Badge variant="purple">Sent</Badge>;
      case 'Draft':
        return <Badge variant="neutral">Draft</Badge>;
      case 'Cancelled':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Invoice: ${invoice.invoiceNumber}`}
      description="Official company billing record"
      maxWidth="4xl"
    >
      <div className="space-y-6 print:p-0">
        {/* Actions Bar (hidden in print) */}
        <div className="flex items-center justify-between no-print pb-4 border-b border-[#DFE6F1]">
          <div className="flex items-center gap-2">
            {getStatusBadge(invoice.status)}
            <span className="text-xs text-[#7185A5]">
              Created {formatDate(invoice.createdAt.split('T')[0])}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={handlePrint}
            >
              Print / Save PDF
            </Button>
            {invoice.outstandingAmount > 0 && invoice.status !== 'Cancelled' && (
              <Button
                variant="primary"
                size="sm"
                icon={<CreditCard className="w-3.5 h-3.5" />}
                onClick={() => {
                  onClose();
                  onRecordPayment(invoice);
                }}
              >
                Record Payment
              </Button>
            )}
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div className="bg-white border border-[#DFE6F1] rounded-xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-[#5038F5] text-white flex items-center justify-center font-bold text-sm">
                  M
                </div>
                <h2 className="text-xl font-bold tracking-tight text-[#111827]">
                  {settings.companyName}
                </h2>
              </div>
              <p className="text-xs text-[#7185A5] max-w-xs leading-relaxed">
                {settings.companyAddress}
              </p>
              <p className="text-xs text-[#7185A5] mt-1">
                {settings.companyEmail} · {settings.companyPhone}
              </p>
              {settings.companyGstin && (
                <p className="text-xs font-mono text-[#7185A5]">
                  GSTIN: {settings.companyGstin}
                </p>
              )}
            </div>

            <div className="sm:text-right">
              <span className="text-xs uppercase font-bold text-[#5038F5] tracking-wider block">
                Tax Invoice
              </span>
              <h3 className="text-lg font-mono font-bold text-[#111827]">
                {invoice.invoiceNumber}
              </h3>
              <div className="text-xs space-y-1 mt-2 text-[#7185A5]">
                <div>
                  Invoice Date:{' '}
                  <span className="font-medium text-[#111827]">
                    {formatDate(invoice.invoiceDate)}
                  </span>
                </div>
                <div>
                  Payment Due:{' '}
                  <span className="font-medium text-[#111827]">
                    {formatDate(invoice.dueDate)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Billed To */}
          <div className="p-4 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
            <span className="text-[11px] font-semibold text-[#7185A5] uppercase tracking-wider block mb-1">
              Billed To
            </span>
            <div className="font-semibold text-sm text-[#111827]">
              {invoice.clientName}
            </div>
            {invoice.clientEmail && (
              <div className="text-xs text-[#7185A5]">{invoice.clientEmail}</div>
            )}
            {invoice.clientAddress && (
              <div className="text-xs text-[#7185A5] mt-0.5">{invoice.clientAddress}</div>
            )}
          </div>

          {/* Items Table */}
          <div className="border border-[#DFE6F1] rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-center w-20">Qty</th>
                  <th className="py-2.5 px-4 text-right w-32">Unit Price</th>
                  <th className="py-2.5 px-4 text-right w-36">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {invoice.items.map((item, i) => (
                  <tr key={item.id || i}>
                    <td className="py-3 px-4 font-medium text-[#111827]">
                      {item.description}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[#7185A5]">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[#7185A5]">
                      {formatCurrency(item.unitPrice, settings.defaultCurrency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-[#111827]">
                      {formatCurrency(item.subtotal, settings.defaultCurrency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Calculation breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
            <div className="text-xs text-[#7185A5] max-w-sm">
              <span className="font-semibold text-[#111827] block mb-1">Payment Instructions</span>
              <p>{invoice.notes || 'Please transfer payments directly to our registered bank account.'}</p>
            </div>

            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-[#7185A5]">
                <span>Subtotal</span>
                <span className="font-mono text-[#111827]">
                  {formatCurrency(invoice.subtotal, settings.defaultCurrency)}
                </span>
              </div>
              <div className="flex justify-between text-[#7185A5]">
                <span>GST / Tax ({invoice.taxRate}%)</span>
                <span className="font-mono text-[#111827]">
                  {formatCurrency(invoice.taxAmount, settings.defaultCurrency)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-sm text-[#111827] pt-2 border-t border-[#DFE6F1]">
                <span>Total Amount</span>
                <span className="font-mono text-[#5038F5]">
                  {formatCurrency(invoice.totalAmount, settings.defaultCurrency)}
                </span>
              </div>
              <div className="flex justify-between text-[#047857] pt-1">
                <span>Amount Paid</span>
                <span className="font-mono font-medium">
                  {formatCurrency(invoice.amountPaid, settings.defaultCurrency)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-[#E11D48] pt-1 border-t border-dashed border-[#DFE6F1]">
                <span>Balance Due</span>
                <span className="font-mono">
                  {formatCurrency(invoice.outstandingAmount, settings.defaultCurrency)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment History Section */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div className="pt-4 border-t border-[#DFE6F1]">
              <h4 className="text-xs font-semibold text-[#111827] mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#047857]" />
                Payment History
              </h4>
              <div className="border border-[#DFE6F1] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5]">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Method</th>
                      <th className="py-2 px-3">Reference</th>
                      <th className="py-2 px-3">Recorded By</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DFE6F1]">
                    {invoice.payments.map((p, idx) => (
                      <tr key={p.id || idx}>
                        <td className="py-2 px-3 text-[#111827]">{formatDate(p.date)}</td>
                        <td className="py-2 px-3 text-[#7185A5]">{p.paymentMethod}</td>
                        <td className="py-2 px-3 font-mono text-[#7185A5]">{p.reference || '—'}</td>
                        <td className="py-2 px-3 text-[#7185A5]">{p.recordedBy}</td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-[#047857]">
                          {formatCurrency(p.amount, settings.defaultCurrency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
