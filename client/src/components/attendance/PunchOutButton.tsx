import React, { useState } from 'react';
import { Square } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { attendanceApi } from '../../api/attendance';
import { errorMessage } from '../../api/client';
import { AttendanceRecord } from '../../types/attendance';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatMinutes, formatTimeIst } from '../../utils/formatters';

interface PunchOutButtonProps {
  size?: 'sm' | 'lg';
  className?: string;
  onPunchedOut: (record: AttendanceRecord) => void | Promise<void>;
}

// Punching out ends the working day: the record is closed and there is no second punch-in that day, so it
// always asks first (a stray click used to end a shift seconds after sign-in). Signing out does NOT punch out.
export const PunchOutButton: React.FC<PunchOutButtonProps> = ({ size = 'sm', className, onPunchedOut }) => {
  const { showToast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const punchOut = async () => {
    setBusy(true);
    try {
      const record = await attendanceApi.punchOut();
      showToast('success', `Punched out at ${formatTimeIst(record.punchOut)}. Worked ${formatMinutes(record.workedMinutes)} today.`);
      await onPunchedOut(record);
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="danger"
        size={size}
        icon={<Square className={size === 'lg' ? 'w-4 h-4 fill-current' : 'w-3.5 h-3.5 fill-current'} />}
        onClick={() => setConfirming(true)}
        disabled={busy}
        className={className}
      >
        {busy ? 'Punching out…' : 'Punch Out'}
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={punchOut}
        title="End your working day?"
        message="Punching out closes today's attendance and you cannot punch in again until tomorrow. To just leave the app, sign out instead: that keeps your shift open."
        confirmLabel="Yes, punch out"
        isDestructive
      />
    </>
  );
};
