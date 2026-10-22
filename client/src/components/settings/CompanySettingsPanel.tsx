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
import { Building2, ImageUp, Trash2 } from 'lucide-react';
import { trimRate } from '../../utils/money';

// The server accepts PNG, JPEG or WebP up to 150 KB (and checks the file itself); these checks only give a
// quicker message.
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 150 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });

// The logo and the signature are each saved on their own (upload or remove), separately from the text fields
// below, and keep their own state so saving one never resets unsaved edits in the form.
const ImageField: React.FC<{
  field: 'logoDataUrl' | 'signatureDataUrl';
  noun: 'Logo' | 'Signature';
  label: string;
  hint: string;
  initial: string | null;
}> = ({ field, noun, label, hint, initial }) => {
  const { showToast } = useApp();
  const [image, setImage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (value: string | null) => {
    setBusy(true);
    setError('');
    try {
      setImage((await settingsApi.updateCompany({ [field]: value }))[field]);
      showToast('success', value ? `${noun} saved` : `${noun} removed`);
    } catch (err) {
      setError(err instanceof ApiError && err.details?.[0] ? err.details[0].message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setError(`${noun} must be a PNG, JPEG or WebP image`);
    if (file.size > LOGO_MAX_BYTES) return setError(`${noun} must be at most 150 KB`);
    try {
      await save(await readAsDataUrl(file));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <FormField label={label} error={error} hint={hint}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-40 h-16 rounded-lg border border-dashed border-[#DFE6F1] bg-[#F7F9FC] flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={`Company ${noun.toLowerCase()}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[11px] text-[#7185A5]">No {noun.toLowerCase()}</span>
          )}
        </div>
        <label className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#DFE6F1] bg-white cursor-pointer hover:border-[#5038F5] ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          <ImageUp className="w-3.5 h-3.5" />
          {image ? 'Replace' : 'Upload'}
          <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={onFile} disabled={busy} aria-label={`Upload ${noun.toLowerCase()}`} />
        </label>
        {image && (
          <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => save(null)} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </FormField>
  );
};

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
  signatoryName: string;
  signatoryDesignation: string;
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
  signatoryName: c.signatoryName ?? '',
  signatoryDesignation: c.signatoryDesignation ?? '',
});

// Settings > Company (admin only: the /settings route is admin-only and PATCH /api/settings/company is
// admin-only on the server). What invoices and the print page show, saved once for every invoice. The
// company's (ledger) currency is fixed to INR; each invoice has its own currency, from its client.
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
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ImageField field="logoDataUrl" noun="Logo" label="Logo (printed on invoices)" hint="PNG, JPEG or WebP, up to 150 KB." initial={company.data.logoDataUrl} />
        <ImageField
          field="signatureDataUrl"
          noun="Signature"
          label="Signature (printed above Authorized Signatory)"
          hint="A scan or photo of the signature on a white or transparent background; PNG, JPEG or WebP, up to 150 KB."
          initial={company.data.signatureDataUrl}
        />
      </div>
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
          <FormField label="Accounting currency" hint="Ledger and reports are in INR. Each client has its own invoice currency (Clients > Edit).">
            <input value="INR (₹)" disabled className={`${input} bg-[#F7F9FC] text-[#7185A5]`} aria-label="Currency" />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Signatory name (printed under the signature)" error={errors.signatoryName}>
            <input value={form.signatoryName} onChange={set('signatoryName')} className={input} aria-label="Signatory name" />
          </FormField>
          <FormField label="Signatory designation" error={errors.signatoryDesignation} hint="e.g. Director, Partner">
            <input value={form.signatoryDesignation} onChange={set('signatoryDesignation')} className={input} aria-label="Signatory designation" />
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
