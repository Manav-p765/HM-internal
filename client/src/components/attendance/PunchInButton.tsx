import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { attendanceApi } from '../../api/attendance';
import { errorMessage } from '../../api/client';
import { AttendanceRecord } from '../../types/attendance';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatTimeIst } from '../../utils/formatters';

interface PunchInButtonProps {
  size?: 'sm' | 'lg';
  className?: string;
  // Outside the shift window: punching in is still allowed, but the confirmation says it will be flagged.
  outsideWindow?: boolean;
  onPunchedIn: (record: AttendanceRecord) => void | Promise<void>;
}

// Starting the shift is the employee's own action: signing in or opening a page never punches anyone in.
// It asks first, so opening the app to look something up can't start a shift by accident.
export const PunchInButton: React.FC<PunchInButtonProps> = ({ size = 'sm', className, outsideWindow, onPunchedIn }) => {
  const { showToast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const punchIn = async () => {
    setBusy(true);
    try {
      const record = await attendanceApi.punchIn();
      const note = record.outsideHours
        ? ' This is outside your working hours, so a manager may review it.'
        : record.lateMinutes !== null
          ? ` That is ${record.lateMinutes} minutes after your shift start.`
          : '';
      showToast(record.outsideHours || record.lateMinutes !== null ? 'info' : 'success', `Punched in at ${formatTimeIst(record.punchIn)}.${note}`);
      await onPunchedIn(record);
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="primary"
        size={size}
        icon={<Play className={size === 'lg' ? 'w-4 h-4 fill-current' : 'w-3.5 h-3.5 fill-current'} />}
        onClick={() => setConfirming(true)}
        disabled={busy}
        className={className}
      >
        {busy ? 'Punching in…' : 'Punch In'}
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={punchIn}
        title="Start your shift?"
        message={
          outsideWindow
            ? 'You are outside your working hours. You can still punch in, but the record will be marked "Outside hours" for a manager to review.'
            : 'This records your start time now. Only punch in when you are starting work.'
        }
        confirmLabel="Yes, punch in"
      />
    </>
  );
};
