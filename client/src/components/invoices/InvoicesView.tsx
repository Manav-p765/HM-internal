import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Invoice, InvoiceStatus } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { InvoiceModal } from './InvoiceModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import {
  FileText,
  Plus,
  Download,
  Search,
  Filter,
  Eye,
  CreditCard,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Printer,
} from 'lucide-react';
import { formatCurrency, formatDate, exportToCSV } from '../../utils/formatters';

export const InvoicesView: React.FC = () => {
  const {
    invoices,
    deleteInvoice,
    settings,
    currentUser,
    isAddInvoiceOpen,
    setIsAddInvoiceOpen,
  } = useApp();

  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [invoiceToView, setInvoiceToView] = useState<Invoice | null>(null);
  const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (startDate && inv.invoiceDate < startDate) return false;
      if (endDate && inv.invoiceDate > endDate) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesNum = inv.invoiceNumber.toLowerCase().includes(query);
        const matchesClient = inv.clientName.toLowerCase().includes(query);
        const matchesEmail = (inv.clientEmail || '').toLowerCase().includes(query);
        if (!matchesNum && !matchesClient && !matchesEmail) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, startDate, endDate, search]);

  // Aggregate metrics
  const totalBilled = useMemo(() => {
    return filteredInvoices
      .filter(i => i.status !== 'Cancelled')
      .reduce((sum, i) => sum + i.totalAmount, 0);
  }, [filteredInvoices]);

  const totalCollected = useMemo(() => {
    return filteredInvoices
      .filter(i => i.status !== 'Cancelled')
      .reduce((sum, i) => sum + i.amountPaid, 0);
  }, [filteredInvoices]);

  const totalOutstanding = useMemo(() => {
    return filteredInvoices
      .filter(i => i.status !== 'Cancelled')
      .reduce((sum, i) => sum + i.outstandingAmount, 0);
  }, [filteredInvoices]);

  const handleExportCSV = () => {
    const headers = [
      'Invoice Number',
      'Client Name',
      'Client Email',
      'Invoice Date',
      'Due Date',
      `Subtotal (${settings.defaultCurrency})`,
      'Tax Rate (%)',
      `Tax Amount (${settings.defaultCurrency})`,
      `Total Amount (${settings.defaultCurrency})`,
      `Amount Paid (${settings.defaultCurrency})`,
      `Outstanding (${settings.defaultCurrency})`,
      'Status',
    ];

    const rows = filteredInvoices.map(i => [
      i.invoiceNumber,
      i.clientName,
      i.clientEmail || '',
      i.invoiceDate,
      i.dueDate,
      i.subtotal,
      i.taxRate,
      i.taxAmount,
      i.totalAmount,
      i.amountPaid,
      i.outstandingAmount,
      i.status,
    ]);

    exportToCSV(`invoices_${settings.companyName.toLowerCase().replace(/\s+/g, '_')}`, headers, rows);
  };

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'Paid':
        return <Badge variant="success">Paid</Badge>;
      case 'Partially Paid':
        return <Badge variant="warning">Partially Paid</Badge>;
      case 'Overdue':
        return <Badge variant="error">Overdue</Badge>;
      case 'Sent':
        return <Badge variant="purple">Sent</Badge>;
      case 'Draft':
        return <Badge variant="neutral">Draft</Badge>;
      case 'Cancelled':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">
            Invoices & Client Billing
          </h1>
          <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">
            Manage deliverables, billing milestones, and track incoming payments
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
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setInvoiceToEdit(null);
              setIsAddInvoiceOpen(true);
            }}
          >
            Create Invoice
          </Button>
        </div>
      </div>

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Total Invoiced</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#111827]">
              {formatCurrency(totalBilled, settings.defaultCurrency)}
            </span>
            <span className="text-xs text-[#7185A5]">
              {filteredInvoices.filter(i => i.status !== 'Cancelled').length} active invoices
            </span>
          </div>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Payments Collected</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#047857]">
              {formatCurrency(totalCollected, settings.defaultCurrency)}
            </span>
            <span className="text-xs text-[#047857] font-medium">
              {totalBilled > 0 ? `${Math.round((totalCollected / totalBilled) * 100)}% collected` : '0%'}
            </span>
          </div>
        </Card>

        <Card padding="md">
          <span className="text-xs font-semibold text-[#7185A5] block">Outstanding Balance</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-[#B45309]">
              {formatCurrency(totalOutstanding, settings.defaultCurrency)}
            </span>
            <span className="text-xs text-[#B45309] font-medium">
              {filteredInvoices.filter(i => i.status === 'Overdue').length} overdue
            </span>
          </div>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card padding="sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search invoice #, client, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
            >
              <option value="all">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
              <option value="Cancelled">Cancelled</option>
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

      {/* Invoices Table */}
      <Card padding="none" className="overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No invoices found"
            description="No client invoices found for this search or filter."
            actionLabel="Create Invoice"
            onAction={() => {
              setInvoiceToEdit(null);
              setIsAddInvoiceOpen(true);
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Invoice Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Outstanding</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right w-36">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-[#111827]">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#111827]">{inv.clientName}</div>
                      {inv.clientEmail && (
                        <div className="text-[11px] text-[#7185A5]">{inv.clientEmail}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#7185A5] whitespace-nowrap">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={
                          inv.status === 'Overdue'
                            ? 'text-[#E11D48] font-semibold'
                            : 'text-[#7185A5]'
                        }
                      >
                        {formatDate(inv.dueDate)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-[#111827] whitespace-nowrap">
                      {formatCurrency(inv.totalAmount, settings.defaultCurrency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-[#047857] whitespace-nowrap">
                      {formatCurrency(inv.amountPaid, settings.defaultCurrency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      <span
                        className={
                          inv.outstandingAmount > 0 ? 'text-[#B45309]' : 'text-[#7185A5]'
                        }
                      >
                        {formatCurrency(inv.outstandingAmount, settings.defaultCurrency)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setInvoiceToView(inv)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          title="View / Print Invoice"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {inv.outstandingAmount > 0 && inv.status !== 'Cancelled' && (
                          <button
                            onClick={() => setInvoiceToPay(inv)}
                            className="p-1.5 text-[#7185A5] hover:text-[#047857] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Record Payment"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {inv.status === 'Draft' && (
                          <button
                            onClick={() => {
                              setInvoiceToEdit(inv);
                              setIsAddInvoiceOpen(true);
                            }}
                            className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Edit Draft"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {currentUser.role === 'admin' && (
                          <button
                            onClick={() => setInvoiceToDelete(inv)}
                            className="p-1.5 text-[#7185A5] hover:text-[#E11D48] hover:bg-[#F1F5F9] rounded cursor-pointer"
                            title="Delete Invoice"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invoice Modal (Create / Edit) */}
      <InvoiceModal
        isOpen={isAddInvoiceOpen}
        onClose={() => {
          setIsAddInvoiceOpen(false);
          setInvoiceToEdit(null);
        }}
        invoiceToEdit={invoiceToEdit}
      />

      {/* Invoice Detail / Print Modal */}
      <InvoiceDetailModal
        isOpen={!!invoiceToView}
        onClose={() => setInvoiceToView(null)}
        invoice={invoiceToView}
        onRecordPayment={inv => {
          setInvoiceToPay(inv);
        }}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={!!invoiceToPay}
        onClose={() => setInvoiceToPay(null)}
        invoice={invoiceToPay}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!invoiceToDelete}
        onClose={() => setInvoiceToDelete(null)}
        onConfirm={() => {
          if (invoiceToDelete) {
            deleteInvoice(invoiceToDelete.id);
            setInvoiceToDelete(null);
          }
        }}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice "${invoiceToDelete?.invoiceNumber}" for ${invoiceToDelete?.clientName}? This action cannot be undone.`}
        confirmLabel="Delete Invoice"
        isDestructive={true}
      />
    </div>
  );
};
