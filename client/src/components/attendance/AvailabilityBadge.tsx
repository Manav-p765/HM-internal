import React from 'react';
import { Availability, AVAILABILITY_LABEL } from '../../types/attendance';
import { Badge } from '../common/Badge';

// Display only: the status itself always comes from the server (services/availability.ts).
const VARIANT: Record<Availability, 'success' | 'info' | 'warning' | 'neutral'> = {
  online: 'success',
  available: 'info',
  on_leave: 'warning',
  not_in_today: 'neutral',
};

const DOT: Record<Availability, string> = {
  online: 'bg-[#047857]',
  available: 'bg-[#0284C7]',
  on_leave: 'bg-[#B45309]',
  not_in_today: 'bg-[#CBD5E1]',
};

export const AvailabilityBadge: React.FC<{ status: Availability }> = ({ status }) => (
  <Badge variant={VARIANT[status]} size="sm">
    <span className={`w-1.5 h-1.5 rounded-full ${DOT[status]}`} />
    {AVAILABILITY_LABEL[status]}
  </Badge>
);

export const AvailabilityDot: React.FC<{ status: Availability; className?: string }> = ({ status, className = '' }) => (
  <span
    className={`inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white ${DOT[status]} ${className}`}
    title={AVAILABILITY_LABEL[status]}
    aria-label={AVAILABILITY_LABEL[status]}
    role="img"
  />
);
