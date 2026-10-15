import React, { useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { Modal } from './Modal';
import { Button } from './Button';
import { FormField } from './FormField';
import { AlertTriangle } from 'lucide-react';

// A confirmation that needs a reason (reversing a payment, un-paying a salary). The server requires the
// reason too; its validation message is shown under the field. Mount only while open so it starts empty.
export const ReasonDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel?: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}> = ({ title, message, confirmLabel, reasonLabel = 'Reason', onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('A reason is required');
      return;
    }
    setIsSaving(true);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof ApiError && err.details?.[0] ? err.details[0].message : errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={title} maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[#E11D48]/10 text-[#E11D48] shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-sm text-[#475569] leading-relaxed">{message}</p>
        </div>
        <FormField label={reasonLabel} required error={error}>
          <textarea
            rows={3}
            value={reason}
            maxLength={500}
            onChange={e => setReason(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            aria-label={reasonLabel}
          />
        </FormField>
        <div className="flex justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="md" disabled={isSaving}>
            {isSaving ? 'Saving…' : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
