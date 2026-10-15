import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Transaction, TransactionType } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { TransactionModal } from './TransactionModal';
import { EmptyState } from '../common/EmptyState';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Plus,
  Download,
  Search,
  Filter,
  Edit2,
  Trash2,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { formatCurrency, formatDate, exportToCSV } from '../../utils/formatters';
import { CURRENCY } from '../../utils/money';
import { COMPANY_BRAND } from '../../utils/company';

export const AccountingView: React.FC = () => {
  const {
    transactions,
    deleteTransaction,
    currentUser,
    isAddTransactionOpen,
    setIsAddTransactionOpen,
  } = useApp();

  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Extract all categories in data
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesDesc = t.description.toLowerCase().includes(query);
        const matchesCat = t.category.toLowerCase().includes(query);
        const matchesId = t.id.toLowerCase().includes(query);
        const matchesRef = (t.referenceNumber || '').toLowerCase().includes(query);
        if (!matchesDesc && !matchesCat && !matchesId && !matchesRef) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, startDate, endDate, search]);

  // Summary Metrics
  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const totalExpense = useMemo(() => {
    return filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTransactions]);

  const netBalance = totalIncome - totalExpense;

  const handleExportCSV = () => {
    const headers = [
      'Transaction ID',
      'Date',
      'Type',
      'Category',
      'Description',
      `Amount (${CURRENCY})`,
      'Payment Method',
      'Reference Number',
      'Created By',
      'Notes',
    ];

    const rows = filteredTransactions.map(t => [
      t.id,
      t.date,
      t.type.toUpperCase(),
      t.category,
      t.description,
      t.amount,
      t.paymentMethod,
      t.referenceNumber || '',
      t.createdBy,
      t.notes || '',
    ]);

    exportToCSV(`accounting_ledger_${COMPANY_BRAND.toLowerCase().replace(/\s+/g, '_')}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Accounting & Transactions
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Record, audit, and categorize company cash flow in {CURRENCY}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          {currentUser.role !== 'employee' && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                setTransactionToEdit(null);
                setIsAddTransactionOpen(true);
              }}
            >
              Add Transaction
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7185A5]">Filtered Income</span>
            <div className="w-8 h-8 rounded-lg bg-[#047857]/10 text-[#047857] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-mono font-bold text-[#111827]">
              {formatCurrency(totalIncome, CURRENCY)}
            </span>
            <p className="text-[11px] text-[#7185A5] mt-1">
              {filteredTransactions.filter(t => t.type === 'income').length} income records
            </p>
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7185A5]">Filtered Expenses</span>
            <div className="w-8 h-8 rounded-lg bg-[#E11D48]/10 text-[#E11D48] flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-mono font-bold text-[#111827]">
              {formatCurrency(totalExpense, CURRENCY)}
            </span>
            <p className="text-[11px] text-[#7185A5] mt-1">
              {filteredTransactions.filter(t => t.type === 'expense').length} expense records
            </p>
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7185A5]">Current Net Balance</span>
            <div className="w-8 h-8 rounded-lg bg-[#5038F5]/10 text-[#5038F5] flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <span
              className={`text-2xl font-mono font-bold ${
                netBalance >= 0 ? 'text-[#047857]' : 'text-[#E11D48]'
              }`}
            >
              {formatCurrency(netBalance, CURRENCY)}
            </span>
            <p className="text-[11px] text-[#7185A5] mt-1">
              Net operating surplus
            </p>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search description, reference, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Types (Income & Expense)</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
            </select>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Categories</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type="date"
              placeholder="From Date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <div>
            <input
              type="date"
              placeholder="To Date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>
        </div>
      </Card>

      {/* Transactions Table */}
      <Card padding="none" className="overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-6 h-6" />}
            title="No transactions found"
            description="No transactions match your current search and filter settings."
            actionLabel={currentUser.role !== 'employee' ? 'Add Transaction' : undefined}
            onAction={() => {
              setTransactionToEdit(null);
              setIsAddTransactionOpen(true);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  {currentUser.role !== 'employee' && (
                    <th className="py-3 px-4 text-right w-24">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filteredTransactions.map(txn => (
                  <tr key={txn.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-[#111827]">
                      {txn.id}
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {formatDate(txn.date)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={txn.type === 'income' ? 'success' : 'error'}>
                        {txn.type === 'income' ? '+ Income' : '- Expense'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-medium text-[#111827]">
                      {txn.category}
                    </td>
                    <td className="py-3 px-4 text-[#475569] max-w-xs truncate" title={txn.description}>
                      {txn.description}
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {txn.paymentMethod}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#7185A5] whitespace-nowrap">
                      {txn.referenceNumber || '—'}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                        txn.type === 'income' ? 'text-[#047857]' : 'text-[#111827]'
                      }`}
                    >
                      {txn.type === 'income' ? '+' : '-'}
                      {formatCurrency(txn.amount, CURRENCY)}
                    </td>
                    {currentUser.role !== 'employee' && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setTransactionToEdit(txn);
                              setIsAddTransactionOpen(true);
                            }}
                            className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Edit Transaction"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setTransactionToDelete(txn)}
                            className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Delete Transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={isAddTransactionOpen}
        onClose={() => {
          setIsAddTransactionOpen(false);
          setTransactionToEdit(null);
        }}
        transactionToEdit={transactionToEdit}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!transactionToDelete}
        onClose={() => setTransactionToDelete(null)}
        onConfirm={() => {
          if (transactionToDelete) {
            deleteTransaction(transactionToDelete.id);
            setTransactionToDelete(null);
          }
        }}
        title="Delete Transaction"
        message={`Are you sure you want to delete transaction "${transactionToDelete?.id}" (${transactionToDelete?.description})? This financial ledger entry will be removed.`}
        confirmLabel="Delete"
        isDestructive={true}
      />
    </div>
  );
};
