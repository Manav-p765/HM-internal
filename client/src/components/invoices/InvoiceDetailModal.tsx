import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { invoicesApi } from '../../api/invoices';
import { useApiData } from '../../api/useApiData';
import { errorMessage } from '../../api/client';
import { Invoice, InvoicePayment, invoiceLabel } from '../../types/invoices';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ReasonDialog } from '../common/ReasonDialog';
import { LoadError } from '../common/LoadError';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { RecordPaymentModal } from './RecordPaymentModal';
import { CancelInvoiceModal } from './CancelInvoiceModal';
import { Printer, CreditCard, CheckCircle2, Send, Edit2, Trash2, Ban, Undo2 } from 'lucide-react';
import { formatDate } from '../../utils/formatters';
import { formatMoney, trimRate } from '../../utils/money';

interface InvoiceDetailModalProps {
  invoiceId: string;
  onClose: () => void;
  onChanged: () => void; // something changed: refresh the list
  onDeleted: () => void;
}

// /invoices/:id. Loads its own record. Actions follow the server rules; the buttons are cosmetic (the
// API refuses anything a role or status doesn't allow): Send (draft), Edit (draft; sent: due date/notes),
// Delete (draft), Record payment / Reverse payment / Cancel (admin only).
export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoiceId, onClose, onChanged, onDeleted }) => {
  const { currentUser, showToast } = useApp();
  const navigate = useNavigate();
  const isAdmin = currentUser.role === 'admin';
  const detail = useApiData(() => invoicesApi.get(invoiceId), [invoiceId]);
  const invoice = detail.data?.invoice;

  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toReverse, setToReverse] = useState<InvoicePayment | null>(null);

  const applyUpdate = (updated: Invoice) => {
    detail.setData(current => ({ today: current?.today ?? '', invoice: updated }));
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

  const handleSend = () =>
    run(async () => {
      const updated = await invoicesApi.send(invoiceId);
      applyUpdate(updated);
      setConfirmSend(false);
      showToast('success', `${invoiceLabel(updated)} marked as sent. Its lines are now locked.`);
    });

  const handleDelete = () =>
    run(async () => {
      await invoicesApi.remove(invoiceId);
      setConfirmDelete(false);
      showToast('info', 'Draft deleted');
      onDeleted();
    });

  // Errors (e.g. already reversed) are shown inside the reason dialog.
  const handleReverse = async (reason: string) => {
    if (!toReverse) return;
    const updated = await invoicesApi.reversePayment(invoiceId, toReverse.id, reason);
    applyUpdate(updated);
    showToast('info', `Payment of ${formatMoney(toReverse.amount)} reversed`);
    setToReverse(null);
  };

  const canPay = isAdmin && invoice?.status === 'sent' && invoice.balance !== '0.00';
  const canCancel = isAdmin && (invoice?.status === 'draft' || invoice?.status === 'sent') && invoice.amountPaid === '0.00';

  return (
    <>
      <Modal isOpen onClose={onClose} title={invoice ? `Invoice ${invoiceLabel(invoice)}` : 'Invoice'} description="Billing record" maxWidth="4xl">
        {detail.error ? (
          <LoadError message={detail.error} onRetry={detail.reload} />
        ) : !invoice ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading invoice…</div>
        ) : (
          <div className="space-y-5">
            {/* Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#DFE6F1]">
              <div className="flex items-center gap-2 flex-wrap">
                <InvoiceStatusBadge status={invoice.derivedStatus} />
                <span className="text-xs text-[#7185A5]">
                  {invoice.sentAt ? `Sent ${formatDate(invoice.sentAt.slice(0, 10))}` : `Created ${formatDate(invoice.createdAt.slice(0, 10))}`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => navigate(`/invoices/${invoice.id}/print`)}>
                  Print
                </Button>
                {(invoice.status === 'draft' || invoice.status === 'sent') && (
                  <Button variant="outline" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
                    Edit
                  </Button>
                )}
                {invoice.status === 'draft' && (
                  <>
                    <Button variant="outline" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)} disabled={busy}>
                      Delete draft
                    </Button>
                    <Button variant="primary" size="sm" icon={<Send className="w-3.5 h-3.5" />} onClick={() => setConfirmSend(true)} disabled={busy}>
                      Send
                    </Button>
                  </>
                )}
                {canCancel && (
                  <Button variant="outline" size="sm" icon={<Ban className="w-3.5 h-3.5" />} onClick={() => setCancelOpen(true)} disabled={busy}>
                    Cancel invoice
                  </Button>
                )}
                {canPay && (
                  <Button variant="primary" size="sm" icon={<CreditCard className="w-3.5 h-3.5" />} onClick={() => setPayOpen(true)} disabled={busy}>
                    Record payment
                  </Button>
                )}
              </div>
            </div>

            {invoice.status === 'cancelled' && (
              <div className="p-3 text-xs bg-[#F7F9FC] border border-[#DFE6F1] text-[#475569] rounded-lg">
                Cancelled {invoice.cancelledAt ? formatDate(invoice.cancelledAt.slice(0, 10)) : ''}: {invoice.cancelReason}
              </div>
            )}

            {/* Billing details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-[#F7F9FC] border border-[#DFE6F1]">
                <span className="text-[11px] font-semibold text-[#7185A5] uppercase tracking-wider block mb-1">Billed to</span>
                <div className="font-semibold text-sm text-[#111827]">{invoice.clientName || '—'}</div>
                {invoice.clientEmail && <div className="text-xs text-[#7185A5]">{invoice.clientEmail}</div>}
                {invoice.clientAddress && <div className="text-xs text-[#7185A5] mt-0.5 whitespace-pre-line">{invoice.clientAddress}</div>}
                {invoice.clientGstin && <div className="text-xs font-mono text-[#7185A5] mt-0.5">GSTIN: {invoice.clientGstin}</div>}
              </div>
              <div className="p-4 rounded-lg border border-[#DFE6F1] text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#7185A5]">Invoice date</span>
                  <span className="font-medium text-[#111827]">{formatDate(invoice.invoiceDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7185A5]">Due date</span>
                  <span className={`font-medium ${invoice.derivedStatus === 'overdue' ? 'text-[#E11D48]' : 'text-[#111827]'}`}>{formatDate(invoice.dueDate)}</span>
                </div>
                {invoice.notes && (
                  <div className="pt-2 text-[#475569] whitespace-pre-line">
                    <span className="text-[#7185A5]">Notes: </span>
                    {invoice.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="border border-[#DFE6F1] rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Description</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4 text-right">Unit price</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFE6F1]">
                  {invoice.items.map(item => (
                    <tr key={item.id}>
                      <td className="py-2.5 px-4 font-medium text-[#111827]">{item.description}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#475569]">{trimRate(item.quantity)}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#475569] whitespace-nowrap">{formatMoney(item.unitPrice)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-[#111827] whitespace-nowrap">{formatMoney(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals (server) */}
            <div className="sm:w-80 sm:ml-auto space-y-1.5 text-xs" data-testid="invoice-totals">
              <div className="flex justify-between text-[#7185A5]">
                <span>Subtotal</span>
                <span className="font-mono text-[#111827]">{formatMoney(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#7185A5]">
                <span>GST ({trimRate(invoice.taxRate)}%)</span>
                <span className="font-mono text-[#111827]">{formatMoney(invoice.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-[#111827] pt-1.5 border-t border-[#DFE6F1]">
                <span>Total</span>
                <span className="font-mono text-[#5038F5]">{formatMoney(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-[#047857]">
                <span>Paid</span>
                <span className="font-mono">{formatMoney(invoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-bold text-[#B45309] pt-1 border-t border-dashed border-[#DFE6F1]">
                <span>Balance due</span>
                <span className="font-mono" data-testid="invoice-balance">
                  {formatMoney(invoice.balance)}
                </span>
              </div>
            </div>

            {/* Payments */}
            {invoice.payments.length > 0 && (
              <div className="pt-4 border-t border-[#DFE6F1]">
                <h4 className="text-xs font-semibold text-[#111827] mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#047857]" />
                  Payments (income transactions)
                </h4>
                <div className="border border-[#DFE6F1] rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5]">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Method</th>
                        <th className="py-2 px-3">Reference</th>
                        <th className="py-2 px-3">Recorded by</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        {isAdmin && <th className="py-2 px-3 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DFE6F1]">
                      {invoice.payments.map(p =>
                        p.reversedAt ? (
                          // Reversed: kept on record, struck through, not counted in "Paid".
                          <React.Fragment key={p.id}>
                            <tr className="bg-[#F7F9FC]/60 text-[#94A3B8]" data-testid="reversed-payment">
                              <td className="pt-2 px-3 whitespace-nowrap line-through">{formatDate(p.txnDate)}</td>
                              <td className="pt-2 px-3 line-through">{p.paymentMethod}</td>
                              <td className="pt-2 px-3 font-mono line-through">{p.referenceNumber || '—'}</td>
                              <td className="pt-2 px-3">{p.recordedByName}</td>
                              <td className="pt-2 px-3 text-right font-mono whitespace-nowrap line-through">{formatMoney(p.amount)}</td>
                              {isAdmin && (
                                <td className="pt-2 px-3 text-right">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider">Reversed</span>
                                </td>
                              )}
                            </tr>
                            <tr className="bg-[#F7F9FC]/60">
                              <td colSpan={isAdmin ? 6 : 5} className="pb-2 pt-0.5 px-3 text-[11px] text-[#7185A5]">
                                Reversed by {p.reversedByName ?? 'unknown'} on {formatDate(p.reversedAt.slice(0, 10))}: {p.reverseReason}
                              </td>
                            </tr>
                          </React.Fragment>
                        ) : (
                          <tr key={p.id}>
                            <td className="py-2 px-3 text-[#111827] whitespace-nowrap">{formatDate(p.txnDate)}</td>
                            <td className="py-2 px-3 text-[#7185A5]">{p.paymentMethod}</td>
                            <td className="py-2 px-3 font-mono text-[#7185A5]">{p.referenceNumber || '—'}</td>
                            <td className="py-2 px-3 text-[#7185A5]">{p.recordedByName}</td>
                            <td className="py-2 px-3 text-right font-mono font-medium text-[#047857] whitespace-nowrap">{formatMoney(p.amount)}</td>
                            {isAdmin && (
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => setToReverse(p)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#E11D48] bg-[#E11D48]/10 hover:bg-[#E11D48]/20 rounded cursor-pointer"
                                  aria-label={`Reverse payment of ${formatMoney(p.amount)}`}
                                >
                                  <Undo2 className="w-3 h-3" /> Reverse
                                </button>
                              </td>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {invoice && (
        <>
          <ConfirmDialog
            isOpen={confirmSend}
            onClose={() => setConfirmSend(false)}
            onConfirm={handleSend}
            title="Send invoice"
            message={`Mark ${invoiceLabel(invoice)} as sent to ${invoice.clientName || 'the client'} (${formatMoney(invoice.total)})? Its number, client and lines are locked from then on; only the due date and notes can change. No email is sent.`}
            confirmLabel="Mark as sent"
          />
          <ConfirmDialog
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={handleDelete}
            title="Delete draft"
            message={`Delete this draft for ${invoice.clientName || 'no client'}? This cannot be undone.`}
            confirmLabel="Delete draft"
            isDestructive
          />
          {toReverse && (
            <ReasonDialog
              title="Reverse payment"
              message={`Reverse the ${formatMoney(toReverse.amount)} payment of ${formatDate(toReverse.txnDate)}? It stays on record, marked reversed, and no longer counts: the balance goes back up.`}
              confirmLabel="Reverse payment"
              reasonLabel="Reason for reversing"
              onClose={() => setToReverse(null)}
              onConfirm={handleReverse}
            />
          )}
          {payOpen && (
          <RecordPaymentModal
            isOpen
            invoice={invoice}
            today={detail.data?.today ?? ''}
            onClose={() => setPayOpen(false)}
            onRecorded={updated => {
              applyUpdate(updated);
              setPayOpen(false);
            }}
          />
          )}
          {cancelOpen && (
          <CancelInvoiceModal
            isOpen
            invoice={invoice}
            onClose={() => setCancelOpen(false)}
            onCancelled={updated => {
              applyUpdate(updated);
              setCancelOpen(false);
            }}
          />
          )}
        </>
      )}
    </>
  );
};
