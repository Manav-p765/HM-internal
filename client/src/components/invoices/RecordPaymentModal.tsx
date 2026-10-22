import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ApiError, errorMessage } from '../../api/client';
import { invoicesApi } from '../../api/invoices';
import { Invoice, InvoicePaymentMethod, PAYMENT_METHODS, invoiceLabel } from '../../types/invoices';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { formatMoney } from '../../utils/money';

interface RecordPaymentModalProps {
  isOpen: boolean;
  invoice: Invoice;
  today: string; // IST date from the server
  onClose: () => void;
  onRecorded: (invoice: Invoice) => void;
}

// Admin only (the server refuses everyone else). Creates one income transaction; the server checks the
// amount against the balance (409 OVERPAYMENT) and marks the invoice paid when it reaches the total.
// A foreign-currency invoice also asks for the INR actually received: that is what the ledger records.
export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({ isOpen, invoice, today, onClose, onRecorded }) => {
  const { showToast } = useApp();
  const { currency } = invoice;
  const foreign = currency !== 'INR';
  // Mounted only while open (see InvoiceDetailModal), so the defaults below are never stale.
  const [amount, setAmount] = useState(invoice.balance);
  const [amountInr, setAmountInr] = useState('');
  const [txnDate, setTxnDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setIsSaving(true);
    try {
      const updated = await invoicesApi.recordPayment(invoice.id, {
        amount: amount.trim(),
        ...(foreign ? { amountInr: amountInr.trim() } : {}),
        txnDate,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || null,
        notes: notes.trim() || null,
      });
      showToast('success', `Payment of ${formatMoney(amount.trim(), currency)} recorded on ${invoiceLabel(updated)}`);
      onRecorded(updated);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) setErrors(Object.fromEntries(err.details.map(d => [d.path, d.message])));
      setFormError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const input = 'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record payment" description={`${invoiceLabel(invoice)} · Balance due ${formatMoney(invoice.balance, currency)}`} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {formError && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg" role="alert">
            {formError}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label={`Amount (${currency})`} required error={errors.amount} hint={`At most ${formatMoney(invoice.balance, currency)}`}>
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={`${input} font-mono`} aria-label="Amount" />
          </FormField>
          {foreign && (
            <FormField label="Received in bank (INR)" required error={errors.amountInr} hint="The rupees credited, after conversion and bank charges. This goes to the ledger.">
              <input inputMode="decimal" value={amountInr} onChange={e => setAmountInr(e.target.value)} className={`${input} font-mono`} aria-label="Amount received in INR" />
            </FormField>
          )}
          <FormField label="Payment date" required error={errors.txnDate}>
            <input type="date" value={txnDate} max={today} onChange={e => setTxnDate(e.target.value)} className={input} aria-label="Payment date" />
          </FormField>
          <FormField label="Method" required error={errors.paymentMethod}>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as InvoicePaymentMethod)} className={input} aria-label="Payment method">
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Reference (UTR / cheque no.)" error={errors.referenceNumber}>
            <input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} className={`${input} font-mono`} aria-label="Reference" />
          </FormField>
        </div>
        <FormField label="Notes" error={errors.notes}>
          <input value={notes} onChange={e => setNotes(e.target.value)} className={input} aria-label="Payment notes" />
        </FormField>
        <p className="text-[11px] text-[#7185A5]">
          Recorded as an income transaction (category "Invoice Payment") linked to this invoice{foreign ? ', for the INR received' : ''}.
        </p>
        <div className="flex justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Recording…' : 'Record payment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
