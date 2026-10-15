import React from 'react';
import { SalaryStatus, SALARY_STATUS_LABEL } from '../../types/salary';
import { Badge } from '../common/Badge';

export const SalaryStatusBadge: React.FC<{ status: SalaryStatus }> = ({ status }) => (
  <Badge variant={status === 'paid' ? 'success' : 'warning'}>{SALARY_STATUS_LABEL[status]}</Badge>
);
