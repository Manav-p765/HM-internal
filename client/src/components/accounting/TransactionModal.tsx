import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Transaction,
  TransactionType,
  PaymentMethod,
  IncomeCategory,
  ExpenseCategory,
} from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { CURRENCY } from '../../utils/money';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionToEdit?: Transaction | null;
}

const INCOME_CATEGORIES: IncomeCategory[] = [
  'Client Payments',
  'Service Revenue',
  'Other Income',
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Salaries',
  'Software and Tools',
  'Marketing',
  'Office Expenses',
  'Hosting and Infrastructure',
  'Travel',
  'Other Expenses',
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Cheque',
  'Cash',
];

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  transactionToEdit,
}) => {
  const { addTransaction, updateTransaction, currentUser } = useApp();

  const [type, setType] = useState<TransactionType>('expense');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<string>('Software and Tools');
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setDate(transactionToEdit.date);
      setCategory(transactionToEdit.category);
      setDescription(transactionToEdit.description);
      setAmount(String(transactionToEdit.amount));
      setPaymentMethod(transactionToEdit.paymentMethod);
      setReferenceNumber(transactionToEdit.referenceNumber || '');
      setNotes(transactionToEdit.notes || '');
    } else {
      // Defaults
      setType('expense');
      setDate(new Date().toISOString().split('T')[0]);
      setCategory('Software and Tools');
      setDescription('');
      setAmount('');
      setPaymentMethod('Bank Transfer');
      setReferenceNumber('');
      setNotes('');
    }
    setError('');
  }, [transactionToEdit, isOpen]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'income') {
      setCategory(INCOME_CATEGORIES[0]);
    } else {
      setCategory(EXPENSE_CATEGORIES[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be a valid positive number');
      return;
    }

    if (transactionToEdit) {
      updateTransaction({
        ...transactionToEdit,
        type,
        date,
        category: category as any,
        description: description.trim(),
        amount: numAmount,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      addTransaction({
        type,
        date,
        category: category as any,
        description: description.trim(),
        amount: numAmount,
        paymentMethod,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        createdBy: currentUser.name,
      });
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={transactionToEdit ? 'Edit Transaction' : 'Record New Transaction'}
      description="Financial ledger record for company accounting"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 text-xs bg-[#E11D48]/10 border border-[#E11D48]/20 text-[#E11D48] rounded-lg">
            {error}
          </div>
        )}

        {/* Transaction Type Segmented Toggle */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Transaction Type
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F9] rounded-lg">
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                type === 'income'
                  ? 'bg-white text-[#047857] shadow-xs'
                  : 'text-[#475569] hover:text-[#111827]'
              }`}
            >
              + Income
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                type === 'expense'
                  ? 'bg-white text-[#E11D48] shadow-xs'
                  : 'text-[#475569] hover:text-[#111827]'
              }`}
            >
              - Expense
            </button>
          </div>
        </div>

        {/* Amount & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Amount ({CURRENCY}) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full text-sm font-mono px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Transaction Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
              required
            />
          </div>
        </div>

        {/* Category & Payment Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Category *
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {(type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Payment Method *
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-[#111827] mb-1.5">
            Description *
          </label>
          <input
            type="text"
            placeholder="e.g. AWS Cloud Hosting, Client Retainer Milestone"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            required
          />
        </div>

        {/* Reference & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Reference / UTR / Check #
            </label>
            <input
              type="text"
              placeholder="e.g. NEFT-99120, CHQ-4029"
              value={referenceNumber}
              onChange={e => setReferenceNumber(e.target.value)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#111827] mb-1.5">
              Internal Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Internal bookkeeping remarks"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-sm px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DFE6F1]">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md">
            {transactionToEdit ? 'Save Changes' : 'Record Transaction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
