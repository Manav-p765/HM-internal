import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Invoice, InvoiceItem, InvoiceStatus } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Plus, Trash2 } from 'lucide-react';
import { getNextInvoiceNumber, roundToTwoDecimals, formatCurrency } from '../../utils/formatters';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceToEdit?: Invoice | null;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  invoiceToEdit,
}) => {
  const { invoices, addInvoice, updateInvoice, settings } = useApp();

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [taxRate, setTaxRate] = useState<number>(settings.taxRatePercentage || 18);
  const [status, setStatus] = useState<InvoiceStatus>('Sent');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: `item-${Date.now()}`,
      description: 'Professional Services / Engineering Milestone',
      quantity: 1,
      unitPrice: 100000,
      subtotal: 100000,
    },
  ]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (invoiceToEdit) {
      setInvoiceNumber(invoiceToEdit.invoiceNumber);
      setClientName(invoiceToEdit.clientName);
      setClientEmail(invoiceToEdit.clientEmail || '');
      setClientAddress(invoiceToEdit.clientAddress || '');
      setInvoiceDate(invoiceToEdit.invoiceDate);
      setDueDate(invoiceToEdit.dueDate);
      setTaxRate(invoiceToEdit.taxRate);
      setStatus(invoiceToEdit.status);
      setNotes(invoiceToEdit.notes || '');
      setItems(invoiceToEdit.items && invoiceToEdit.items.length > 0 ? invoiceToEdit.items : [
        {
          id: `item-${Date.now()}`,
          description: '',
          quantity: 1,
          unitPrice: 0,
          subtotal: 0,
        },
      ]);
    } else {
      // Auto-generate safe sequential number
      const existing = invoices.map(i => i.invoiceNumber);
      const nextNum = getNextInvoiceNumber(existing, settings.invoicePrefix || 'INV-2026-');
      setInvoiceNumber(nextNum);
      setClientName('');
      setClientEmail('');
      setClientAddress('');
      const today = new Date();
      setInvoiceDate(today.toISOString().split('T')[0]);
      // Default due date: 15 days from now
      const due = new Date();
      due.setDate(today.getDate() + 15);
      setDueDate(due.toISOString().split('T')[0]);
      setTaxRate(settings.taxRatePercentage || 18);
      setStatus('Sent');
      setNotes('Payment terms: Net 15 days. Please transfer to Hybrid Monks Bank Account.');
      setItems([
        {
          id: `item-${Date.now()}`,
          description: 'Web Application Architecture & Development',
          quantity: 1,
          unitPrice: 150000,
          subtotal: 150000,
        },
      ]);
    }
    setError('');
  }, [invoiceToEdit, isOpen, invoices, settings]);

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      const q = parseFloat(String(field === 'quantity' ? value : item.quantity)) || 0;
      const p = parseFloat(String(field === 'unitPrice' ? value : item.unitPrice)) || 0;
      item.subtotal = roundToTwoDecimals(q * p);
    }
    updated[index] = item;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        description: '',
        quantity: 1,
        unitPrice: 0,
        subtotal: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = roundToTwoDecimals(
    items.reduce((sum, item) => sum + (parseFloat(String(item.subtotal)) || 0), 0)
  );
  const taxAmount = roundToTwoDecimals((subtotal * taxRate) / 100);
  const totalAmount = roundToTwoDecimals(subtotal + taxAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      setError('Invoice number is required');
      return;
    }
    if (!clientName.trim()) {
      setError('Client name is required');
      return;
    }
    if (!dueDate) {
      setError('Due date is required');
      return;
    }
    if (items.some(i => !i.description.trim() || i.quantity <= 0 || i.unitPrice < 0)) {
      setError('All line items must have a valid description, quantity > 0, and unit price >= 0');
      return;
    }

    if (invoiceToEdit) {
      updateInvoice({
        ...invoiceToEdit,
        invoiceNumber: invoiceNumber.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        invoiceDate,
        dueDate,
        items,
        subtotal,
        taxRate,
        taxAmount,
        totalAmount,
        status,
        notes: notes.trim() || undefined,
      });
    } else {
      addInvoice({
        invoiceNumber: invoiceNumber.trim(),
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || undefined,
        clientAddress: clientAddress.trim() || undefined,
        invoiceDate,
        dueDate,
        items,
        subtotal,
        taxRate,
        taxAmount,
        totalAmount,
        status,
        notes: notes.trim() || undefined,
      });
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={invoiceToEdit ? 'Edit Invoice' : 'Create New Invoice'}
      description="Issue a client invoice with automated calculations and GST tax"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        {/* Invoice Header Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Invoice Number *
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              className="w-full text-xs font-mono font-medium px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Invoice Date *
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Due Date *
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
        </div>

        {/* Client Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Client / Company Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Acme Corp"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1">
              Client Billing Email
            </label>
            <input
              type="email"
              placeholder="billing@acmecorp.com"
              value={clientEmail}
              onChange={e => setClientEmail(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1">
            Client Billing Address (Optional)
          </label>
          <input
            type="text"
            placeholder="Address, City, State, Country"
            value={clientAddress}
            onChange={e => setClientAddress(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          />
        </div>

        {/* Line Items */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#111827]">
              Line Items ({items.length})
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleAddItem}
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-2 border border-[#DFE6F1] rounded-lg p-2.5 bg-[#F7F9FC]/50 max-h-56 overflow-y-auto">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-md border border-[#DFE6F1]"
              >
                <div className="col-span-12 sm:col-span-6">
                  <input
                    type="text"
                    placeholder="Item description / deliverables"
                    value={item.description}
                    onChange={e => handleItemChange(idx, 'description', e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-white rounded border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1.5 bg-white rounded border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Unit Price"
                    value={item.unitPrice}
                    onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1.5 bg-white rounded border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
                    required
                  />
                </div>
                <div className="col-span-3 sm:col-span-1 text-right text-xs font-mono font-medium text-[#111827] truncate">
                  {formatCurrency(item.subtotal, settings.defaultCurrency)}
                </div>
                <div className="col-span-1 sm:col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length === 1}
                    className="p-1 text-[#7185A5] hover:text-[#E11D48] disabled:opacity-30 disabled:hover:text-[#7185A5] rounded cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Summary & Tax */}
        <div className="bg-[#F7F9FC] border border-[#DFE6F1] rounded-lg p-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                GST / Tax Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={taxRate}
                onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                className="w-20 text-xs font-mono px-2 py-1 bg-white rounded border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#7185A5] mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as InvoiceStatus)}
                className="text-xs px-2 py-1 bg-white rounded border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              >
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="w-full sm:w-auto text-right space-y-1 text-xs">
            <div className="flex justify-between sm:justify-end gap-6 text-[#7185A5]">
              <span>Subtotal:</span>
              <span className="font-mono font-medium text-[#111827]">
                {formatCurrency(subtotal, settings.defaultCurrency)}
              </span>
            </div>
            <div className="flex justify-between sm:justify-end gap-6 text-[#7185A5]">
              <span>Tax ({taxRate}%):</span>
              <span className="font-mono font-medium text-[#111827]">
                {formatCurrency(taxAmount, settings.defaultCurrency)}
              </span>
            </div>
            <div className="flex justify-between sm:justify-end gap-6 text-sm font-bold text-[#111827] pt-1 border-t border-[#DFE6F1]">
              <span>Total Payable:</span>
              <span className="font-mono text-[#5038F5]">
                {formatCurrency(totalAmount, settings.defaultCurrency)}
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1">
            Invoice Notes / Bank Instructions
          </label>
          <input
            type="text"
            placeholder="Payment terms, bank details, or milestones"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md">
            {invoiceToEdit ? 'Save Invoice' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
