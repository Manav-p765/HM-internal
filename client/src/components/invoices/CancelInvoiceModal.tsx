import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ApiError, errorMessage } from '../../api/client';
import { invoicesApi } from '../../api/invoices';
import { Invoice, invoiceLabel } from '../../types/invoices';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';

// Admin only. Allowed for drafts and sent invoices without payments; the invoice keeps its number.
// Mounted only while open, so it always starts empty.
export const CancelInvoiceModal: React.FC<{
  isOpen: boolean;
  invoice: Invoice;
  onClose: () => void;
  onCancelled: (invoice: Invoice) => void;
}> = ({ isOpen, invoice, onClose, onCancelled }) => {
  const { showToast } = useApp();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const updated = await invoicesApi.cancel(invoice.id, reason.trim());
      showToast('info', `${invoiceLabel(updated)} cancelled`);
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof ApiError && err.details?.[0] ? err.details[0].message : errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Cancel ${invoiceLabel(invoice)}`} description={invoice.invoiceNumber ? "The invoice keeps its number and stays on record." : "The draft stays on record without a number."} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label="Reason" required error={error}>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            aria-label="Cancellation reason"
          />
        </FormField>
        <div className="flex justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Keep invoice
          </Button>
          <Button type="submit" variant="danger" size="md" disabled={isSaving}>
            {isSaving ? 'Cancelling…' : 'Cancel invoice'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
