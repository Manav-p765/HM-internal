import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { tasksApi } from '../../api/tasks';
import { errorMessage } from '../../api/client';
import { EMPLOYEE_TASK_TRANSITIONS, TASK_STATUSES, TASK_STATUS_LABEL, Task, TaskStatus } from '../../types/work';
import { Button } from '../common/Button';

interface TaskStatusControlProps {
  task: Task;
  onChanged: (task: Task) => void;
  compact?: boolean; // board cards: smaller controls
  allowComment?: boolean; // detail view: optional hand-over note when sending to review / completing
}

// Changing a task's status. Admin/manager pick any status from a menu; an employee gets one button per
// move they are allowed to make (the server enforces the same rules). No drag and drop.
export const TaskStatusControl: React.FC<TaskStatusControlProps> = ({ task, onChanged, compact, allowComment }) => {
  const { currentUser, showToast } = useApp();
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');

  const change = async (status: TaskStatus) => {
    if (status === task.status) return;
    setBusy(true);
    try {
      const updated = await tasksApi.setStatus(task.id, status, comment.trim() || undefined);
      setComment('');
      showToast('success', `${task.code} moved to ${TASK_STATUS_LABEL[status]}`);
      onChanged(updated);
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const commentBox = allowComment && (
    <textarea
      aria-label="Note for the reviewer (optional)"
      rows={2}
      value={comment}
      onChange={e => setComment(e.target.value)}
      placeholder="Optional note when sending to review or completing (internal)"
      className="w-full text-xs px-3 py-2 bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5]"
    />
  );

  if (isManager) {
    return (
      <div className="space-y-2">
        <select
          aria-label={`Status of ${task.code}`}
          value={task.status}
          disabled={busy}
          onClick={e => e.stopPropagation()}
          onChange={e => change(e.target.value as TaskStatus)}
          className={`${compact ? 'text-[11px] px-2 py-1' : 'text-xs px-3 py-2'} bg-white rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] cursor-pointer`}
        >
          {TASK_STATUSES.map(s => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {commentBox}
      </div>
    );
  }

  const moves = EMPLOYEE_TASK_TRANSITIONS[task.status] ?? [];
  if (moves.length === 0) {
    return (
      <p className="text-[11px] text-[#7185A5]">
        {task.status === 'in_review' ? 'Waiting for a manager to review.' : task.status === 'completed' ? 'Completed.' : 'No changes available.'}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {moves.includes('in_review') && commentBox}
      <div className="flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
        {moves.map(status => (
          <Button
            key={status}
            size="sm"
            variant={status === 'blocked' ? 'outline' : 'primary'}
            disabled={busy}
            className={compact ? 'text-[11px]! px-2! py-1!' : undefined}
            onClick={() => change(status)}
          >
            {status === 'blocked' ? 'Mark blocked' : `Move to ${TASK_STATUS_LABEL[status]}`}
          </Button>
        ))}
      </div>
    </div>
  );
};
