import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Invoice, PaymentMethod } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { formatCurrency, roundToTwoDecimals } from '../../utils/formatters';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Cheque',
  'Cash',
];

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const { recordInvoicePayment, currentUser, settings } = useApp();

  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [createLinkedTxn, setCreateLinkedTxn] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (invoice) {
      setAmount(String(invoice.outstandingAmount > 0 ? invoice.outstandingAmount : invoice.totalAmount));
      setDate(new Date().toISOString().split('T')[0]);
      setPaymentMethod('Bank Transfer');
      setReference(`${invoice.invoiceNumber}-PAY`);
      setNotes(`Payment received for ${invoice.invoiceNumber}`);
      setCreateLinkedTxn(true);
    }
    setError('');
  }, [invoice, isOpen]);

  if (!invoice) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Payment amount must be greater than 0');
      return;
    }
    if (numAmount > invoice.outstandingAmount && invoice.outstandingAmount > 0) {
      setError(`Payment cannot exceed outstanding balance of ${formatCurrency(invoice.outstandingAmount, settings.defaultCurrency)}`);
      return;
    }

    const success = recordInvoicePayment(
      invoice.id,
      {
        date,
        amount: roundToTwoDecimals(numAmount),
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        recordedBy: currentUser.name,
      },
      createLinkedTxn
    );

    if (success) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Record Payment — ${invoice.invoiceNumber}`}
      description={`Client: ${invoice.clientName} · Outstanding: ${formatCurrency(invoice.outstandingAmount, settings.defaultCurrency)}`}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-3 bg-[#F7F9FC] rounded-lg border border-[#DFE6F1] text-xs">
          <div>
            <span className="text-[#7185A5] block">Total Invoiced</span>
            <span className="font-mono font-bold text-[#111827]">
              {formatCurrency(invoice.totalAmount, settings.defaultCurrency)}
            </span>
          </div>
          <div>
            <span className="text-[#7185A5] block">Remaining Balance</span>
            <span className="font-mono font-bold text-[#047857]">
              {formatCurrency(invoice.outstandingAmount, settings.defaultCurrency)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Payment Amount ({settings.defaultCurrency}) *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              max={invoice.outstandingAmount > 0 ? invoice.outstandingAmount : undefined}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full text-sm font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Payment Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Reference / UTR / Check #
            </label>
            <input
              type="text"
              placeholder="e.g. NEFT-881923"
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Remarks
          </label>
          <input
            type="text"
            placeholder="Payment notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          />
        </div>

        {/* Linked Transaction Checkbox */}
        <div className="p-3 bg-[#F1F5F9]/70 rounded-lg flex items-start gap-2.5">
          <input
            type="checkbox"
            id="linkedTxn"
            checked={createLinkedTxn}
            onChange={e => setCreateLinkedTxn(e.target.checked)}
            className="mt-0.5 rounded border-[#DFE6F1] text-[#5038F5] focus:ring-[#5038F5]"
          />
          <label htmlFor="linkedTxn" className="text-xs text-[#111827] cursor-pointer">
            <span className="font-semibold block">Create linked Income Transaction</span>
            <span className="text-[#7185A5]">
              Automatically logs a 'Client Payments' transaction in company accounting without double counting.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md">
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};
