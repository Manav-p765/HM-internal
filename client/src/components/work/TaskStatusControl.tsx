import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { tasksApi } from '../../api/tasks';
import { errorMessage } from '../../api/client';
import { TASK_STATUSES, TASK_STATUS_LABEL, Task, TaskStatus, allowedTaskMoves } from '../../types/work';
import { Button } from '../common/Button';

interface TaskStatusControlProps {
  task: Task;
  onChanged: (task: Task) => void;
  compact?: boolean; // board cards: smaller controls
  allowComment?: boolean; // detail view: optional hand-over note when sending to review / completing
}

// Changing a task's status. Admin/manager pick any status from a menu; an employee gets one button per move
// they are allowed to make: their own task's steps, or the review of a task they assigned (the server enforces
// the same rules). No drag and drop.
export const TaskStatusControl: React.FC<TaskStatusControlProps> = ({ task, onChanged, compact, allowComment }) => {
  const { currentUser, showToast } = useApp();
  const moves = allowedTaskMoves(task, currentUser);
  const isAssignee = Boolean(task.assigneeId) && task.assigneeId === currentUser.employeeId;
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

  if (moves === null) {
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

  if (moves.length === 0) {
    // Client requests and tasks from a login without an employee record are reviewed by a manager.
    const reviewer = task.requestedByClient || task.createdByName === 'Hybrid Monks' ? 'a manager' : task.createdByName;
    let note = 'No changes available.';
    if (task.status === 'completed') note = 'Completed.';
    else if (task.status === 'in_review') note = isAssignee ? `Waiting for ${reviewer} to review.` : 'Waiting for review.';
    else if (!isAssignee) note = `With ${task.assignee?.fullName ?? 'nobody yet'}.`;
    return <p className="text-[11px] text-[#7185A5]">{note}</p>;
  }
  // The assigner reviewing a colleague's hand-over: approve, or send it back.
  const label = (status: TaskStatus) => {
    if (status === 'blocked') return 'Mark blocked';
    if (!isAssignee && status === 'completed') return 'Approve & complete';
    if (!isAssignee && status === 'in_progress') return 'Send back';
    return `Move to ${TASK_STATUS_LABEL[status]}`;
  };
  return (
    <div className="space-y-2">
      {(moves.includes('in_review') || moves.includes('completed')) && commentBox}
      <div className="flex flex-wrap gap-1.5" onClick={e => e.stopPropagation()}>
        {moves.map(status => (
          <Button
            key={status}
            size="sm"
            variant={status === 'blocked' || (!isAssignee && status === 'in_progress') ? 'outline' : 'primary'}
            disabled={busy}
            className={compact ? 'text-[11px]! px-2! py-1!' : undefined}
            onClick={() => change(status)}
          >
            {label(status)}
          </Button>
        ))}
      </div>
    </div>
  );
};
