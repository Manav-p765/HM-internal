import React from 'react';
import { Badge } from '../common/Badge';
import { InvoiceDerivedStatus, INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from '../../types/invoices';

// Display only: the derived status (overdue, partially paid) always comes from the server.
export const InvoiceStatusBadge: React.FC<{ status: InvoiceDerivedStatus; size?: 'sm' | 'md' }> = ({ status, size }) => (
  <Badge variant={INVOICE_STATUS_VARIANT[status]} size={size}>
    {INVOICE_STATUS_LABEL[status]}
  </Badge>
);
