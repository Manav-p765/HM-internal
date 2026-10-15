import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { salaryApi } from '../../api/salary';
import { useApiData } from '../../api/useApiData';
import { LoadError } from '../common/LoadError';
import { Button } from '../common/Button';
import { PayslipDocument } from './PayslipDocument';
import { ArrowLeft, Printer } from 'lucide-react';

// /salary/slips/:id/print: the payslip as an A4 sheet. When printing, the app chrome (sidebar, top bar,
// this toolbar) is hidden by the `.no-print` rules in index.css; it shares the `.invoice-sheet` A4 layout.
export const PayslipPrintView: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const slip = useApiData(() => salaryApi.mySlip(id), [id]);

  if (slip.error) return <LoadError message={slip.error} onRetry={slip.reload} />;
  if (!slip.data) return <div className="py-10 text-center text-xs text-[#7185A5]">Loading payslip…</div>;

  return (
    <div className="invoice-print-root">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-4">
        <Button variant="outline" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navigate(`/salary/slips/${id}`)}>
          Back to payslip
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#7185A5] hidden sm:inline">A4 · use "Save as PDF" in the print dialog</span>
          <Button variant="primary" size="sm" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </div>
      <article className="invoice-sheet bg-white mx-auto border border-[#DFE6F1] shadow-sm" data-testid="payslip-sheet">
        <PayslipDocument slip={slip.data} />
      </article>
    </div>
  );
};
