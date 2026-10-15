import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { salaryApi } from '../../api/salary';
import { useApiData } from '../../api/useApiData';
import { ApiError, errorMessage } from '../../api/client';
import { AdjustmentKind, ADJUSTMENT_KIND_LABEL, SalaryDetail } from '../../types/salary';
import { PAYMENT_METHODS, InvoicePaymentMethod } from '../../types/invoices';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FormField } from '../common/FormField';
import { LoadError } from '../common/LoadError';
import { ReasonDialog } from '../common/ReasonDialog';
import { SalaryStatusBadge } from './SalaryStatusBadge';
import { CreditCard, FileCheck2, FileX2, Lock, Plus, Trash2, Undo2, AlertTriangle } from 'lucide-react';
import { formatDate, formatMonthYear } from '../../utils/formatters';
import { formatMoney, previewNetAfterLine } from '../../utils/money';

const inputClass = 'w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]';

// The first field error of a 400, or the message (e.g. 409 NEGATIVE_NET).
function fieldErrors(err: unknown): { fields: Record<string, string>; message: string } {
  const fields: Record<string, string> = {};
  if (err instanceof ApiError && err.details) for (const d of err.details) fields[d.path] ??= d.message;
  return { fields, message: errorMessage(err) };
}

// One salary row (admin): adjustment lines, base override and notes while pending; pay, un-pay and the
// payslip. Loads its own record; every amount shown comes from the server except the labelled preview.
export const SalaryDetailModal: React.FC<{
  salaryId: string;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}> = ({ salaryId, today, onClose, onChanged }) => {
  const { showToast } = useApp();
  const detail = useApiData(() => salaryApi.get(salaryId), [salaryId]);
  const salary = detail.data;
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [unpayOpen, setUnpayOpen] = useState(false);

  const apply = (updated: SalaryDetail) => {
    detail.setData(updated);
    onChanged();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = salary ? `${salary.employeeName} · ${formatMonthYear(salary.month)}` : 'Salary';

  return (
    <>
      <Modal isOpen onClose={onClose} title={title} description={salary ? `${salary.employeeCode} · ${salary.department}` : undefined} maxWidth="2xl">
        {detail.error ? (
          <LoadError message={detail.error} onRetry={detail.reload} />
        ) : !salary ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading salary…</div>
        ) : (
          <div className="space-y-5" data-testid="salary-detail">
            {/* Status and actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#DFE6F1]">
              <div className="flex items-center gap-2 flex-wrap text-xs text-[#7185A5]">
                <SalaryStatusBadge status={salary.status} />
                {salary.status === 'paid' && salary.paidOn && (
                  <span>
                    Paid {formatDate(salary.paidOn)} · {salary.paymentMethod}
                    {salary.referenceNumber ? ` · ${salary.referenceNumber}` : ''}
                  </span>
                )}
                {salary.slipPublished && <span className="text-[#5038F5] font-semibold">Payslip published</span>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {salary.status === 'pending' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<CreditCard className="w-3.5 h-3.5" />}
                    onClick={() => setPayOpen(true)}
                    disabled={busy || salary.netPayable === '0.00'}
                    title={salary.netPayable === '0.00' ? 'Nothing to pay: the net payable is zero' : undefined}
                  >
                    Mark paid
                  </Button>
                ) : (
                  <>
                    {salary.slipPublished ? (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<FileX2 className="w-3.5 h-3.5" />}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            apply(await salaryApi.unpublishSlip(salary.id));
                            showToast('info', 'Payslip unpublished');
                          })
                        }
                      >
                        Unpublish slip
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<FileCheck2 className="w-3.5 h-3.5" />}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            apply(await salaryApi.publishSlip(salary.id));
                            showToast('success', `Payslip published for ${salary.employeeName}`);
                          })
                        }
                      >
                        Publish slip
                      </Button>
                    )}
                    <Button variant="outline" size="sm" icon={<Undo2 className="w-3.5 h-3.5" />} onClick={() => setUnpayOpen(true)} disabled={busy}>
                      Un-pay
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Amounts (server) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs" data-testid="salary-amounts">
              <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] min-w-0 flex sm:block items-baseline justify-between gap-2">
                <span className="text-[#7185A5] block">Base</span>
                <span className="font-mono font-bold text-[#111827] whitespace-nowrap">{formatMoney(salary.baseSalary)}</span>
              </div>
              <div className="p-3 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1] min-w-0 flex sm:block items-baseline justify-between gap-2">
                <span className="text-[#7185A5] block">Adjustments</span>
                <span className={`font-mono font-bold whitespace-nowrap ${salary.adjustments.startsWith('-') ? 'text-[#E11D48]' : 'text-[#047857]'}`}>
                  {formatMoney(salary.adjustments)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#5038F5]/5 border border-[#5038F5]/20 min-w-0 flex sm:block items-baseline justify-between gap-2">
                <span className="text-[#7185A5] block">Net payable</span>
                <span className="font-mono font-bold text-[#5038F5] whitespace-nowrap" data-testid="salary-net">
                  {formatMoney(salary.netPayable)}
                </span>
              </div>
            </div>

            {salary.unpaidLeaveDays > 0 && (
              <div className="p-3 rounded-lg bg-[#B45309]/5 border border-[#B45309]/20 text-xs text-[#92400E] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {salary.unpaidLeaveDays} day{salary.unpaidLeaveDays === 1 ? '' : 's'} of approved unpaid leave this month. Nothing is deducted
                  automatically: add a deduction line if one applies.
                </span>
              </div>
            )}

            {salary.status === 'paid' && (
              <div className="p-3 rounded-lg bg-[#F1F5F9] text-xs text-[#475569] flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0" /> Paid salaries are locked. Un-pay to make changes (the expense stays in the ledger, marked reversed).
              </div>
            )}

            {/* Adjustment lines */}
            <div>
              <h4 className="text-xs font-semibold text-[#111827] mb-2">Adjustment lines</h4>
              {salary.lines.length === 0 ? (
                <p className="text-xs text-[#7185A5]">No adjustments.</p>
              ) : (
                <div className="border border-[#DFE6F1] rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-[#DFE6F1]">
                      {salary.lines.map(line => (
                        <tr key={line.id}>
                          <td className="py-2 px-3 text-[#111827]">
                            {line.label}
                            <span className="block text-[10px] text-[#7185A5]">
                              {ADJUSTMENT_KIND_LABEL[line.kind]}
                              {line.createdByName ? ` · added by ${line.createdByName}` : ''}
                            </span>
                          </td>
                          <td className={`py-2 px-3 text-right font-mono whitespace-nowrap ${line.kind === 'earning' ? 'text-[#047857]' : 'text-[#E11D48]'}`}>
                            {line.kind === 'earning' ? '+' : '−'}
                            {formatMoney(line.amount)}
                          </td>
                          {salary.status === 'pending' && (
                            <td className="py-2 px-3 text-right w-10">
                              <button
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    apply(await salaryApi.removeAdjustment(salary.id, line.id));
                                    showToast('info', `Removed "${line.label}"`);
                                  })
                                }
                                className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#E11D48]/10 rounded cursor-pointer disabled:opacity-50"
                                aria-label={`Remove ${line.label}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {salary.status === 'pending' && <AddLineForm salary={salary} onSaved={apply} />}
            {salary.status === 'pending' && <EditSalaryForm salary={salary} onSaved={apply} />}
            {salary.status === 'paid' && salary.notes && (
              <div className="text-xs text-[#475569]">
                <span className="text-[#7185A5]">Notes: </span>
                {salary.notes}
              </div>
            )}
          </div>
        )}
      </Modal>

      {salary && payOpen && (
        <PaySalaryModal
          salary={salary}
          today={today}
          onClose={() => setPayOpen(false)}
          onPaid={updated => {
            apply(updated);
            setPayOpen(false);
          }}
        />
      )}
      {salary && unpayOpen && (
        <ReasonDialog
          title="Un-pay salary"
          message={`Un-pay ${salary.employeeName}'s ${formatMonthYear(salary.month)} salary (${formatMoney(salary.netPayable)})? The expense stays in the ledger, marked reversed; the row goes back to Pending and the payslip is withdrawn.`}
          confirmLabel="Un-pay"
          reasonLabel="Reason"
          onClose={() => setUnpayOpen(false)}
          onConfirm={async reason => {
            apply(await salaryApi.unpay(salary.id, reason));
            setUnpayOpen(false);
            showToast('info', `${salary.employeeName}'s salary is pending again`);
          }}
        />
      )}
    </>
  );
};

// Add an earning or deduction. The net shown under the form is a labelled preview; the server decides.
const AddLineForm: React.FC<{ salary: SalaryDetail; onSaved: (s: SalaryDetail) => void }> = ({ salary, onSaved }) => {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<AdjustmentKind>('earning');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<{ fields: Record<string, string>; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const preview = amount.trim() ? previewNetAfterLine(salary.netPayable, kind, amount) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors(null);
    setIsSaving(true);
    try {
      onSaved(await salaryApi.addAdjustment(salary.id, { label: label.trim(), kind, amount: amount.trim() }));
      setLabel('');
      setAmount('');
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setIsSaving(false);
    }
  };

  const fieldless = errors && Object.keys(errors.fields).length === 0;
  return (
    <form onSubmit={submit} noValidate className="p-3 rounded-lg border border-dashed border-[#DFE6F1] space-y-3" aria-label="Add adjustment">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_9rem] gap-3">
        <FormField label="Label" required error={errors?.fields.label}>
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={200} placeholder="e.g. Festival bonus" className={inputClass} aria-label="Adjustment label" />
        </FormField>
        <FormField label="Type" error={errors?.fields.kind}>
          <select value={kind} onChange={e => setKind(e.target.value as AdjustmentKind)} className={inputClass} aria-label="Adjustment type">
            <option value="earning">Earning (+)</option>
            <option value="deduction">Deduction (−)</option>
          </select>
        </FormField>
        <FormField label="Amount (INR)" required error={errors?.fields.amount}>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputClass} font-mono`} aria-label="Adjustment amount" />
        </FormField>
      </div>
      {fieldless && (
        <p className="text-xs text-[#E11D48]" role="alert">
          {errors.message}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-[#7185A5]" data-testid="net-preview">
          {preview !== null && (
            <>
              Net after this line (preview): <span className={`font-mono font-semibold ${preview.startsWith('-') ? 'text-[#E11D48]' : 'text-[#111827]'}`}>{formatMoney(preview)}</span>
              {preview.startsWith('-') && ' — would be negative'}
            </>
          )}
        </span>
        <Button type="submit" variant="outline" size="sm" icon={<Plus className="w-3.5 h-3.5" />} disabled={isSaving}>
          {isSaving ? 'Adding…' : 'Add line'}
        </Button>
      </div>
    </form>
  );
};

// Notes, and a base salary override (needs a reason, recorded in the audit log).
const EditSalaryForm: React.FC<{ salary: SalaryDetail; onSaved: (s: SalaryDetail) => void }> = ({ salary, onSaved }) => {
  const { showToast } = useApp();
  const [notes, setNotes] = useState(salary.notes ?? '');
  const [base, setBase] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ fields: Record<string, string>; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const notesChanged = notes.trim() !== (salary.notes ?? '');
  const baseChanged = base.trim() !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors(null);
    setIsSaving(true);
    try {
      const updated = await salaryApi.update(salary.id, {
        ...(notesChanged ? { notes: notes.trim() || null } : {}),
        ...(baseChanged ? { baseSalary: base.trim(), reason: reason.trim() } : {}),
      });
      onSaved(updated);
      setBase('');
      setReason('');
      showToast('success', 'Salary updated');
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setIsSaving(false);
    }
  };

  const fieldless = errors && Object.keys(errors.fields).length === 0;
  return (
    <form onSubmit={submit} noValidate className="space-y-3 pt-4 border-t border-[#DFE6F1]" aria-label="Edit salary">
      <FormField label="Notes" error={errors?.fields.notes}>
        <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} className={inputClass} aria-label="Salary notes" />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-3">
        <FormField label="Override base (INR)" error={errors?.fields.baseSalary} hint={`Now ${formatMoney(salary.baseSalary)}`}>
          <input value={base} onChange={e => setBase(e.target.value)} inputMode="decimal" placeholder="Leave empty" className={`${inputClass} font-mono`} aria-label="Override base salary" />
        </FormField>
        <FormField label="Reason for the override" required={baseChanged} error={errors?.fields.reason}>
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} disabled={!baseChanged} className={`${inputClass} disabled:bg-[#F7F9FC]`} aria-label="Override reason" />
        </FormField>
      </div>
      {fieldless && (
        <p className="text-xs text-[#E11D48]" role="alert">
          {errors.message}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="outline" size="sm" disabled={isSaving || (!notesChanged && !baseChanged)}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};

// Mark paid: one expense transaction (category "Salary") for the net payable, created by the server.
const PaySalaryModal: React.FC<{
  salary: SalaryDetail;
  today: string;
  onClose: () => void;
  onPaid: (s: SalaryDetail) => void;
}> = ({ salary, today, onClose, onPaid }) => {
  const { showToast } = useApp();
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<InvoicePaymentMethod>('Bank Transfer');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<{ fields: Record<string, string>; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors(null);
    setIsSaving(true);
    try {
      const updated = await salaryApi.pay(salary.id, { paidOn, paymentMethod: method, referenceNumber: reference.trim() || null });
      showToast('success', `${salary.employeeName}'s salary marked paid (${formatMoney(updated.netPayable)})`);
      onPaid(updated);
    } catch (err) {
      setErrors(fieldErrors(err));
    } finally {
      setIsSaving(false);
    }
  };

  const fieldless = errors && Object.keys(errors.fields).length === 0;
  return (
    <Modal isOpen onClose={onClose} title="Mark salary paid" description={`${salary.employeeName} · ${formatMonthYear(salary.month)} · Net ${formatMoney(salary.netPayable)}`} maxWidth="md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-xs text-[#475569] p-3 rounded-lg bg-[#047857]/5 border border-[#047857]/20">
          Records one expense transaction (category "Salary") for {formatMoney(salary.netPayable)} in the same step. The row is locked afterwards.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Paid on" required error={errors?.fields.paidOn}>
            <input type="date" value={paidOn} max={today || undefined} onChange={e => setPaidOn(e.target.value)} className={inputClass} aria-label="Paid on" />
          </FormField>
          <FormField label="Payment method" required error={errors?.fields.paymentMethod}>
            <select value={method} onChange={e => setMethod(e.target.value as InvoicePaymentMethod)} className={inputClass} aria-label="Payment method">
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Reference (optional)" error={errors?.fields.referenceNumber}>
          <input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} placeholder="UTR / cheque number" className={inputClass} aria-label="Reference number" />
        </FormField>
        {fieldless && (
          <p className="text-xs text-[#E11D48]" role="alert">
            {errors.message}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Mark paid'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
