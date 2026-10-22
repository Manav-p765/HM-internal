import React from 'react';
import { AttendanceRecord } from '../../types/attendance';
import { Badge } from '../common/Badge';

// The server's derived flags on a punch-in: late (more than 30 min after the shift start) or outside the
// shift window altogether. Nothing is shown for employees without working hours.
export const PunchFlagBadges: React.FC<{ record: Pick<AttendanceRecord, 'lateMinutes' | 'outsideHours'> }> = ({ record }) => (
  <>
    {record.outsideHours && (
      <Badge variant="warning" size="sm">
        Outside hours
      </Badge>
    )}
    {record.lateMinutes !== null && (
      <Badge variant="warning" size="sm">
        Late {record.lateMinutes} min
      </Badge>
    )}
  </>
);
