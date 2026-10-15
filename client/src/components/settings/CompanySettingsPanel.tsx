import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ApiError, errorMessage } from '../../api/client';
import { settingsApi } from '../../api/settings';
import { useApiData } from '../../api/useApiData';
import { CompanySettings } from '../../types/invoices';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { LoadError } from '../common/LoadError';
import { Building2 } from 'lucide-react';
import { trimRate } from '../../utils/money';

type Form = {
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyGstin: string;
  companyAddress: string;
  defaultGstRate: string;
  invoicePrefix: string;
  bankDetails: string;
  terms: string;
};

const toForm = (c: CompanySettings): Form => ({
  companyName: c.companyName,
  companyEmail: c.companyEmail ?? '',
  companyPhone: c.companyPhone ?? '',
  companyGstin: c.companyGstin ?? '',
  companyAddress: c.companyAddress ?? '',
  defaultGstRate: trimRate(c.defaultGstRate),
  invoicePrefix: c.invoicePrefix,
  bankDetails: c.bankDetails ?? '',
  terms: c.terms ?? '',
});

// Settings > Company (admin only: the /settings route is admin-only and PATCH /api/settings/company is
// admin-only on the server). What invoices and the print page show. Currency is fixed to INR.
export const CompanySettingsPanel: React.FC = () => {
  const { showToast } = useApp();
  const company = useApiData(() => settingsApi.company(), []);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (company.data) setForm(toForm(company.data));
  }, [company.data]);

  if (company.error) return <LoadError message={company.error} onRetry={company.reload} />;
  if (!form || !company.data) return <div className="py-10 text-center text-xs text-[#7185A5]">Loading company settings…</div>;

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    // Send only what changed (the server audits the field names).
    const original = toForm(company.data!);
    const changes = Object.fromEntries(
      (Object.keys(form) as (keyof Form)[])
        .filter(k => form[k].trim() !== original[k].trim())
        .map(k => [k, k === 'companyName' || k === 'invoicePrefix' || k === 'defaultGstRate' ? form[k].trim() : form[k].trim() || null]),
    );
    if (Object.keys(changes).length === 0) {
      showToast('info', 'Nothing to save');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await settingsApi.updateCompany(changes);
      company.setData(updated);
      showToast('success', 'Company settings saved');
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map(d => [d.path, d.message])));
      showToast('error', errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const input = 'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

  return (
    <Card padding="md">
      <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-[#5038F5]" />
        Company details for invoices
      </h3>
      <form onSubmit={handleSave} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Company name" required error={errors.companyName}>
            <input value={form.companyName} onChange={set('companyName')} className={input} aria-label="Company name" />
          </FormField>
          <FormField label="Company email" error={errors.companyEmail}>
            <input type="email" value={form.companyEmail} onChange={set('companyEmail')} className={input} aria-label="Company email" />
          </FormField>
          <FormField label="Phone" error={errors.companyPhone}>
            <input value={form.companyPhone} onChange={set('companyPhone')} className={input} aria-label="Company phone" />
          </FormField>
          <FormField label="GSTIN" error={errors.companyGstin} hint="15 letters/digits.">
            <input value={form.companyGstin} onChange={set('companyGstin')} className={`${input} font-mono`} aria-label="Company GSTIN" />
          </FormField>
        </div>
        <FormField label="Registered address" error={errors.companyAddress}>
          <textarea rows={2} value={form.companyAddress} onChange={set('companyAddress')} className={input} aria-label="Company address" />
        </FormField>

        <div className="pt-3 border-t border-[#DFE6F1] grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="Default GST rate (%)" required error={errors.defaultGstRate}>
            <input inputMode="decimal" value={form.defaultGstRate} onChange={set('defaultGstRate')} className={`${input} font-mono`} aria-label="Default GST rate" />
          </FormField>
          <FormField label="Invoice prefix" required error={errors.invoicePrefix} hint={`Next number: ${company.data.nextInvoiceNumber}. Affects new invoices only.`}>
            <input value={form.invoicePrefix} onChange={set('invoicePrefix')} className={`${input} font-mono`} aria-label="Invoice prefix" />
          </FormField>
          <FormField label="Currency" hint="Fixed to INR.">
            <input value="INR (₹)" disabled className={`${input} bg-[#F7F9FC] text-[#7185A5]`} aria-label="Currency" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Bank details (printed on invoices)" error={errors.bankDetails}>
            <textarea rows={4} value={form.bankDetails} onChange={set('bankDetails')} className={`${input} font-mono`} aria-label="Bank details" />
          </FormField>
          <FormField label="Terms (printed on invoices)" error={errors.terms}>
            <textarea rows={4} value={form.terms} onChange={set('terms')} className={input} aria-label="Terms" />
          </FormField>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save company settings'}
          </Button>
        </div>
      </form>
    </Card>
  );
};
