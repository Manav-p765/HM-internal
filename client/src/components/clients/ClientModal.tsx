import React, { useEffect, useState } from 'react';
import { clientsApi, ClientInput } from '../../api/clients';
import { ApiError, errorMessage } from '../../api/client';
import { Client } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientToEdit?: Client | null;
  onSaved: (client: Client, created: boolean) => void;
}

const inputClass =
  'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// Create / edit a client company (admin, manager). Status changes go through Deactivate/Reactivate.
export const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, clientToEdit, onSaved }) => {
  const [form, setForm] = useState<Required<ClientInput>>({
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    gstin: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ClientInput, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const c = clientToEdit;
    setForm({
      companyName: c?.companyName ?? '',
      contactName: c?.contactName ?? '',
      contactEmail: c?.contactEmail ?? '',
      contactPhone: c?.contactPhone ?? '',
      address: c?.address ?? '',
      gstin: c?.gstin ?? '',
      notes: c?.notes ?? '',
    });
    setError('');
    setFieldErrors({});
    setIsSaving(false);
  }, [isOpen, clientToEdit]);

  const set = (field: keyof ClientInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(current => ({ ...current, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsSaving(true);
    const optional = (value: string | null) => (value ?? '').trim() || null;
    const input: ClientInput = {
      companyName: form.companyName.trim(),
      contactName: optional(form.contactName),
      contactEmail: optional(form.contactEmail),
      contactPhone: optional(form.contactPhone),
      address: optional(form.address),
      gstin: optional(form.gstin),
      notes: optional(form.notes),
    };
    try {
      const saved = clientToEdit ? await clientsApi.update(clientToEdit.id, input) : await clientsApi.create(input);
      onSaved(saved, !clientToEdit);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const byField: Partial<Record<keyof ClientInput, string>> = {};
        for (const d of err.details) byField[d.path as keyof ClientInput] ??= d.message;
        setFieldErrors(byField);
      }
      setError(errorMessage(err));
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={clientToEdit ? `Edit ${clientToEdit.companyName}` : 'Add Client Company'}
      description="Company details used for the client portal and, later, invoices"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        <FormField label="Company Name" required error={fieldErrors.companyName}>
          <input aria-label="Company Name" value={form.companyName} onChange={set('companyName')} className={inputClass} placeholder="e.g. Acme Pvt Ltd" />
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Primary Contact Person" error={fieldErrors.contactName}>
            <input aria-label="Primary Contact Person" value={form.contactName ?? ''} onChange={set('contactName')} className={inputClass} />
          </FormField>
          <FormField label="Contact Email" error={fieldErrors.contactEmail} hint="For correspondence. Portal logins are added separately.">
            <input aria-label="Contact Email" type="email" value={form.contactEmail ?? ''} onChange={set('contactEmail')} className={inputClass} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Phone Number" error={fieldErrors.contactPhone}>
            <input aria-label="Phone Number" value={form.contactPhone ?? ''} onChange={set('contactPhone')} className={inputClass} />
          </FormField>
          <FormField label="GSTIN" error={fieldErrors.gstin} hint="15 characters; used on invoices.">
            <input aria-label="GSTIN" value={form.gstin ?? ''} onChange={set('gstin')} className={`${inputClass} font-mono uppercase`} />
          </FormField>
        </div>

        <FormField label="Billing Address" error={fieldErrors.address}>
          <textarea aria-label="Billing Address" rows={2} value={form.address ?? ''} onChange={set('address')} className={inputClass} />
        </FormField>

        <FormField label="Internal Notes" error={fieldErrors.notes} hint="Visible to staff only, never to the client.">
          <textarea aria-label="Internal Notes" rows={2} value={form.notes ?? ''} onChange={set('notes')} className={inputClass} />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving...' : clientToEdit ? 'Save Client' : 'Add Client'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
