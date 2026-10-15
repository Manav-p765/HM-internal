import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ApiError, errorMessage } from '../../api/client';
import { transactionsApi } from '../../api/transactions';
import { useApiData } from '../../api/useApiData';
import { InvoicePaymentMethod, PAYMENT_METHODS } from '../../types/invoices';
import { LedgerRow, TxnType } from '../../types/ledger';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { CURRENCY } from '../../utils/money';

const inputClass = 'w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// Create or edit a MANUAL ledger row (admin). The category picker lists active, non-system categories of the
// chosen type; when editing, the row's own category stays selectable even if it was deactivated since.
// Every rule (category, amount bounds, date at most tomorrow IST) is enforced by the server; its field
// errors are shown under the fields. Mount only while open so it starts from the row (or empty).
export const TransactionModal: React.FC<{
  existing: LedgerRow | null;
  today: string; // IST, from the server
  onClose: () => void;
  onSaved: (row: LedgerRow) => void;
}> = ({ existing, today, onClose, onSaved }) => {
  const { showToast } = useApp();
  const categories = useApiData(() => transactionsApi.categories(), []);
  const [type, setType] = useState<TxnType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [txnDate, setTxnDate] = useState(existing?.txnDate ?? today);
  const [category, setCategory] = useState(existing?.category ?? '');
  const [paymentMethod, setPaymentMethod] = useState<InvoicePaymentMethod>(existing?.paymentMethod ?? 'Bank Transfer');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [referenceNumber, setReferenceNumber] = useState(existing?.referenceNumber ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const options = useMemo(
    () =>
      (categories.data ?? []).filter(
        c => c.type === type && !c.isSystem && (c.active || c.name.toLowerCase() === existing?.category.toLowerCase()),
      ),
    [categories.data, type, existing],
  );
  // Keep the selection valid for the chosen type.
  const selected = options.some(c => c.name === category) ? category : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setIsSaving(true);
    const input = {
      txnDate,
      type,
      category: selected,
      description: description.trim(),
      amount: amount.trim(),
      paymentMethod,
      referenceNumber: referenceNumber.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      const saved = existing ? await transactionsApi.update(existing.id, input) : await transactionsApi.create(input);
      showToast('success', existing ? 'Transaction updated' : `${type === 'income' ? 'Income' : 'Expense'} recorded`);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const fields: Record<string, string> = {};
        for (const d of err.details) if (d.path) fields[d.path] ??= d.message;
        setErrors(fields);
        if (Object.keys(fields).length === 0) setFormError(errorMessage(err));
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={existing ? 'Edit transaction' : 'Record transaction'}
      description="A manual ledger entry. Invoice and salary payments are recorded on their own pages."
      maxWidth="md"
    >
      <form onSubmit={submit} className="space-y-4" noValidate aria-label={existing ? 'Edit transaction' : 'Record transaction'}>
        {formError && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg" role="alert">
            {formError}
          </div>
        )}

        <div>
          <span className="block text-xs font-semibold text-[#111827] mb-1.5">Type</span>
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F9] rounded-lg" role="radiogroup" aria-label="Type">
            {(['income', 'expense'] as const).map(t => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={`py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  type === t ? `bg-white shadow-xs ${t === 'income' ? 'text-[#047857]' : 'text-[#E11D48]'}` : 'text-[#475569] hover:text-[#111827]'
                }`}
              >
                {t === 'income' ? '+ Income' : '− Expense'}
              </button>
            ))}
          </div>
          {errors.type && <p className="text-[11px] text-[#E11D48] mt-1">{errors.type}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label={`Amount (${CURRENCY})`} required error={errors.amount}>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputClass} font-mono`} aria-label="Amount" />
          </FormField>
          <FormField label="Date" required error={errors.txnDate}>
            <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} className={inputClass} aria-label="Date" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Category" required error={errors.category}>
            <select value={selected} onChange={e => setCategory(e.target.value)} className={inputClass} aria-label="Category" disabled={!categories.data}>
              <option value="">{categories.data ? 'Choose a category' : 'Loading…'}</option>
              {options.map(c => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Payment method" required error={errors.paymentMethod}>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as InvoicePaymentMethod)} className={inputClass} aria-label="Payment method">
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Description" required error={errors.description}>
          <input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="e.g. Office rent for October" className={inputClass} aria-label="Description" />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Reference / UTR / cheque no." error={errors.referenceNumber}>
            <input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} maxLength={100} className={inputClass} aria-label="Reference" />
          </FormField>
          <FormField label="Notes" error={errors.notes}>
            <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} className={inputClass} aria-label="Notes" />
          </FormField>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving…' : existing ? 'Save changes' : 'Record transaction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
