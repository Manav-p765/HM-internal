import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ApiError, errorMessage } from '../../api/client';
import { invoicesApi, InvoiceInput } from '../../api/invoices';
import { clientsApi } from '../../api/clients';
import { settingsApi } from '../../api/settings';
import { Client } from '../../types';
import { Invoice } from '../../types/invoices';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { formatMoney, previewTotals, trimRate } from '../../utils/money';

interface InvoiceModalProps {
  isOpen: boolean;
  invoiceId: string | null; // null = create
  onClose: () => void;
  onSaved: (invoice: Invoice) => void;
}

interface ItemRow {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const newRow = (): ItemRow => ({ key: Math.random().toString(36).slice(2), description: '', quantity: '1', unitPrice: '' });

// Today in IST for the default dates (the server uses the same date when invoiceDate is omitted).
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Create / edit form. Drafts: everything. Sent invoices: only the due date and notes (the server enforces
// this too; locked fields are shown read-only). Totals below are a labelled LIVE PREVIEW; the saved
// invoice always shows the server's numbers.
export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, invoiceId, onClose, onSaved }) => {
  const { showToast } = useApp();
  const [existing, setExisting] = useState<Invoice | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taxRate, setTaxRate] = useState('18');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemRow[]>([newRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isSent = existing?.status === 'sent';
  const locked = Boolean(existing && existing.status !== 'draft');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setErrors({});
    setFormError('');
    setLoadError('');
    setIsLoading(true);
    const load = async () => {
      try {
        const [clientList, invoice, company] = await Promise.all([
          clientsApi.list({ status: 'active', limit: 200 }).then(r => r.clients),
          invoiceId ? invoicesApi.get(invoiceId).then(r => r.invoice) : Promise.resolve(null),
          invoiceId ? Promise.resolve(null) : settingsApi.company(),
        ]);
        if (cancelled) return;
        setClients(clientList);
        setExisting(invoice);
        if (invoice) {
          setClientId(invoice.clientId ?? '');
          setClientName(invoice.clientName);
          setClientEmail(invoice.clientEmail ?? '');
          setClientAddress(invoice.clientAddress ?? '');
          setClientGstin(invoice.clientGstin ?? '');
          setInvoiceDate(invoice.invoiceDate);
          setDueDate(invoice.dueDate);
          setTaxRate(trimRate(invoice.taxRate));
          setNotes(invoice.notes ?? '');
          setItems(invoice.items.map(i => ({ key: i.id, description: i.description, quantity: trimRate(i.quantity), unitPrice: i.unitPrice })));
        } else {
          const today = istToday();
          setClientId('');
          setClientName('');
          setClientEmail('');
          setClientAddress('');
          setClientGstin('');
          setInvoiceDate(today);
          setDueDate(addDays(today, 15));
          setTaxRate(trimRate(company!.defaultGstRate));
          setNotes('');
          setItems([newRow()]);
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, invoiceId]);

  // Picking a client prefills the snapshot; every field stays editable for this invoice.
  const pickClient = (id: string) => {
    setClientId(id);
    const client = clients.find(c => c.id === id);
    if (client) {
      setClientName(client.companyName);
      setClientEmail(client.contactEmail ?? '');
      setClientAddress(client.address ?? '');
      setClientGstin(client.gstin ?? '');
    }
  };

  const preview = useMemo(() => previewTotals(items, taxRate), [items, taxRate]);

  const updateItem = (index: number, field: keyof Omit<ItemRow, 'key'>, value: string) =>
    setItems(rows => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setIsSaving(true);
    try {
      let saved: Invoice;
      if (existing && isSent) {
        saved = await invoicesApi.update(existing.id, { dueDate, notes: notes.trim() || null });
      } else {
        const body: InvoiceInput = {
          clientId: clientId || null,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || null,
          clientAddress: clientAddress.trim() || null,
          clientGstin: clientGstin.trim() || null,
          invoiceDate,
          dueDate,
          taxRate: taxRate.trim(),
          notes: notes.trim() || null,
          items: items.map(i => ({ description: i.description.trim(), quantity: i.quantity.trim(), unitPrice: i.unitPrice.trim() })),
        };
        saved = existing ? await invoicesApi.update(existing.id, body) : await invoicesApi.create(body);
      }
      showToast('success', existing ? `Invoice ${saved.invoiceNumber} saved` : `Draft ${saved.invoiceNumber} created`);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        setErrors(Object.fromEntries(err.details.map(d => [d.path || '_', d.message])));
        setFormError(err.message);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const input = 'w-full min-w-0 text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] disabled:bg-[#F7F9FC] disabled:text-[#7185A5]';
  const title = !invoiceId ? 'Create Invoice (Draft)' : existing ? `Edit ${existing.invoiceNumber}` : 'Edit Invoice';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description="The number and all totals are assigned by the server when you save." maxWidth="2xl">
      {loadError ? (
        <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">{loadError}</div>
      ) : isLoading ? (
        <div className="py-10 text-center text-xs text-[#7185A5]">Loading…</div>
      ) : existing && existing.status !== 'draft' && existing.status !== 'sent' ? (
        <div className="p-3 text-xs bg-[#F7F9FC] border border-[#DFE6F1] text-[#475569] rounded-lg">
          This invoice is {existing.status} and can no longer be edited.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError && (
            <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg" role="alert">
              {formError}
            </div>
          )}
          {locked && (
            <div className="p-3 text-xs bg-[#5038F5]/5 border border-[#5038F5]/20 text-[#3F2BC9] rounded-lg flex items-start gap-2" data-testid="sent-lock-notice">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>This invoice has been sent: its number, client, lines and totals are locked. Only the due date and notes can change.</span>
            </div>
          )}

          <FormField label="Client" error={errors.clientId}>
            <select value={clientId} onChange={e => pickClient(e.target.value)} className={input} disabled={locked} aria-label="Client">
              <option value="">Manual entry (no client record)</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Bill to (name)" required error={errors.clientName}>
              <input value={clientName} onChange={e => setClientName(e.target.value)} className={input} disabled={locked} aria-label="Bill to name" />
            </FormField>
            <FormField label="Billing email" error={errors.clientEmail}>
              <input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className={input} disabled={locked} aria-label="Billing email" />
            </FormField>
            <FormField label="Billing address" error={errors.clientAddress}>
              <textarea rows={2} value={clientAddress} onChange={e => setClientAddress(e.target.value)} className={input} disabled={locked} aria-label="Billing address" />
            </FormField>
            <FormField label="Client GSTIN" error={errors.clientGstin}>
              <input value={clientGstin} onChange={e => setClientGstin(e.target.value)} className={`${input} font-mono`} disabled={locked} aria-label="Client GSTIN" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <FormField label="Invoice date" required error={errors.invoiceDate}>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={input} disabled={locked} aria-label="Invoice date" />
            </FormField>
            <FormField label="Due date" required error={errors.dueDate}>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={input} aria-label="Due date" />
            </FormField>
            <FormField label="GST rate (%)" error={errors.taxRate}>
              <input inputMode="decimal" value={taxRate} onChange={e => setTaxRate(e.target.value)} className={`${input} font-mono`} disabled={locked} aria-label="GST rate" />
            </FormField>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#111827]">Line items ({items.length})</span>
              {!locked && (
                <Button type="button" variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setItems(rows => [...rows, newRow()])} disabled={items.length >= 100}>
                  Add line
                </Button>
              )}
            </div>
            {errors.items && <p className="text-[11px] text-[#E11D48] font-medium mb-1">{errors.items}</p>}
            <div className="space-y-2 border border-[#DFE6F1] rounded-lg p-2.5 bg-[#F7F9FC]/50 max-h-72 overflow-y-auto">
              {items.map((item, idx) => {
                const err = (f: string) => errors[`items.${idx}.${f}`];
                return (
                  <div key={item.key} className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded-md border border-[#DFE6F1]" data-testid="invoice-line">
                    <div className="col-span-12 sm:col-span-6">
                      <input
                        placeholder="Description"
                        value={item.description}
                        onChange={e => updateItem(idx, 'description', e.target.value)}
                        className={input}
                        disabled={locked}
                        aria-label={`Line ${idx + 1} description`}
                      />
                      {err('description') && <p className="text-[11px] text-[#E11D48] mt-0.5">{err('description')}</p>}
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        inputMode="decimal"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        className={`${input} font-mono`}
                        disabled={locked}
                        aria-label={`Line ${idx + 1} quantity`}
                      />
                      {err('quantity') && <p className="text-[11px] text-[#E11D48] mt-0.5">{err('quantity')}</p>}
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <input
                        inputMode="decimal"
                        placeholder="Unit price"
                        value={item.unitPrice}
                        onChange={e => updateItem(idx, 'unitPrice', e.target.value)}
                        className={`${input} font-mono`}
                        disabled={locked}
                        aria-label={`Line ${idx + 1} unit price`}
                      />
                      {err('unitPrice') && <p className="text-[11px] text-[#E11D48] mt-0.5">{err('unitPrice')}</p>}
                    </div>
                    <div className="col-span-2 sm:col-span-1 pt-2 text-right text-[11px] font-mono text-[#475569] truncate" title="Preview">
                      {preview.lineTotals[idx] !== null ? formatMoney(preview.lineTotals[idx]) : '—'}
                    </div>
                    <div className="col-span-1 pt-1 text-right">
                      {!locked && (
                        <button
                          type="button"
                          onClick={() => setItems(rows => rows.filter((_, i) => i !== idx))}
                          disabled={items.length === 1}
                          className="p-1 text-[#7185A5] hover:text-[#E11D48] disabled:opacity-30 rounded cursor-pointer"
                          aria-label={`Remove line ${idx + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals: live preview while editing a draft; the server's numbers for a sent invoice */}
          <div className="bg-[#F7F9FC] border border-[#DFE6F1] rounded-lg p-3.5 text-xs" data-testid="totals-preview">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7185A5]">
                {locked ? 'Totals (saved)' : 'Live preview · final totals are calculated by the server on save'}
              </span>
            </div>
            {(() => {
              const t = locked && existing ? { subtotal: existing.subtotal, taxAmount: existing.taxAmount, total: existing.total } : preview;
              return (
                <div className="space-y-1 sm:w-72 sm:ml-auto">
                  <div className="flex justify-between text-[#7185A5]">
                    <span>Subtotal</span>
                    <span className="font-mono text-[#111827]">{formatMoney(t.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[#7185A5]">
                    <span>GST ({taxRate || 0}%)</span>
                    <span className="font-mono text-[#111827]">{formatMoney(t.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-[#111827] pt-1 border-t border-[#DFE6F1]">
                    <span>Total</span>
                    <span className="font-mono text-[#5038F5]">{formatMoney(t.total)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <FormField label="Notes" error={errors.notes} hint="Shown on the invoice (e.g. PO number or milestone).">
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={input} aria-label="Notes" />
          </FormField>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
            <Button type="button" variant="outline" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={isSaving}>
              {isSaving ? 'Saving…' : existing ? 'Save changes' : 'Create draft'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
