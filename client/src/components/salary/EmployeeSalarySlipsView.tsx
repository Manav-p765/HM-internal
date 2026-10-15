import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { salaryApi } from '../../api/salary';
import { useApiData } from '../../api/useApiData';
import { ApiError } from '../../api/client';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { LoadError } from '../common/LoadError';
import { PayslipDocument } from './PayslipDocument';
import { FileText, Printer, Eye } from 'lucide-react';
import { formatDate, formatMonthYear } from '../../utils/formatters';
import { formatMoney } from '../../utils/money';

// /salary/slips and /salary/slips/:id: the signed-in person's own PUBLISHED payslips. The server selects
// them by the session's employee record; a manager or admin without one gets 403 NOT_LINKED.
export const EmployeeSalarySlipsView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  // null = this login has no employee record (403 NOT_LINKED), shown as an explanation rather than an error.
  const list = useApiData(
    () =>
      salaryApi.mySlips().catch(err => {
        if (err instanceof ApiError && err.code === 'NOT_LINKED') return null;
        throw err;
      }),
    [],
  );
  const notLinked = list.data === null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#111827]">My Payslips</h1>
        <p className="text-xs sm:text-sm text-[#7185A5] mt-0.5">Your published monthly payslips</p>
      </div>

      <Card padding="none" className="overflow-hidden">
        {notLinked ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No employee record"
            description="Your account is not linked to an employee record, so there are no payslips to show."
          />
        ) : list.error ? (
          <LoadError message={list.error} onRetry={list.reload} />
        ) : !list.data ? (
          <div className="py-10 text-center text-xs text-[#7185A5]">Loading payslips…</div>
        ) : list.data.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No published payslips yet"
            description="Your payslip appears here once your salary for the month is paid and the slip is published."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="payslip-list">
              <thead className="bg-[#F7F9FC] border-b border-[#DFE6F1] text-[#7185A5] font-semibold">
                <tr>
                  <th className="py-3 px-3 sm:px-4">Month</th>
                  <th className="py-3 px-3 sm:px-4 text-right">Net pay</th>
                  <th className="py-3 px-3 sm:px-4 hidden sm:table-cell">Paid on</th>
                  <th className="py-3 px-3 sm:px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE6F1]">
                {list.data.map(slip => (
                  <tr key={slip.id} className="hover:bg-[#F7F9FC]/60 transition-colors">
                    <td className="py-3 px-3 sm:px-4 font-bold text-[#111827] whitespace-nowrap">
                      {formatMonthYear(slip.month)}
                      <span className="block sm:hidden text-[10px] font-normal text-[#7185A5]">Paid {formatDate(slip.paidOn)}</span>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-mono font-bold text-[#047857] whitespace-nowrap">{formatMoney(slip.netPayable)}</td>
                    <td className="py-3 px-3 sm:px-4 text-[#7185A5] whitespace-nowrap hidden sm:table-cell">{formatDate(slip.paidOn)}</td>
                    <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="outline" size="sm" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => navigate(`/salary/slips/${slip.id}`)}>
                          View
                        </Button>
                        <button
                          onClick={() => navigate(`/salary/slips/${slip.id}/print`)}
                          className="p-1.5 text-[#7185A5] hover:text-[#5038F5] hover:bg-[#F1F5F9] rounded cursor-pointer"
                          aria-label={`Print the ${formatMonthYear(slip.month)} payslip`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {id && <PayslipModal slipId={id} onClose={() => navigate('/salary/slips')} />}
    </div>
  );
};

// /salary/slips/:id: loads its own record, so deep links work; another person's id or an unpublished slip
// is the same 404 as a missing one.
const PayslipModal: React.FC<{ slipId: string; onClose: () => void }> = ({ slipId, onClose }) => {
  const navigate = useNavigate();
  const slip = useApiData(() => salaryApi.mySlip(slipId), [slipId]);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={slip.data ? `Payslip · ${formatMonthYear(slip.data.month)}` : 'Payslip'}
      maxWidth="2xl"
    >
      {slip.error ? (
        <LoadError message={slip.error} onRetry={slip.reload} />
      ) : !slip.data ? (
        <div className="py-10 text-center text-xs text-[#7185A5]">Loading payslip…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => navigate(`/salary/slips/${slipId}/print`)}>
              Print / Save as PDF
            </Button>
          </div>
          <PayslipDocument slip={slip.data} />
        </div>
      )}
    </Modal>
  );
};
