import React, { useState } from 'react';
import { Calendar, Edit2, Eye, EyeOff, FolderKanban, Lock, MessageSquare, Trash2, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tasksApi } from '../../api/tasks';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { CommentType, Task } from '../../types/work';
import { formatDate } from '../../utils/formatters';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { LoadError } from '../common/LoadError';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { TaskStatusControl } from '../work/TaskStatusControl';
import { OverdueBadge, PriorityBadge, TaskStatusBadge, fieldClass, formatDateTime } from '../work/WorkBits';

interface TaskDetailModalProps {
  taskId: string;
  onClose: () => void;
  onChanged: () => void; // refresh whatever list is behind
  onEdit?: (task: Task) => void; // admin, manager
  onDeleted?: () => void;
}

// A task with its status control and comment thread. Staff choose the comment type: internal notes are
// never shown to clients; "client feedback" is the thread shared with the client portal.
export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ taskId, onClose, onChanged, onEdit, onDeleted }) => {
  const { currentUser, showToast } = useApp();
  const isManager = currentUser.role === 'admin' || currentUser.role === 'manager';
  const detail = useApiData(() => tasksApi.get(taskId), [taskId]);
  const thread = useApiData(() => tasksApi.comments(taskId), [taskId]);
  const task = detail.data?.id === taskId ? detail.data : undefined;

  const [body, setBody] = useState('');
  const [type, setType] = useState<CommentType>('internal_note');
  const [posting, setPosting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      await tasksApi.addComment(taskId, body.trim(), type);
      setBody('');
      thread.reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await tasksApi.deleteComment(commentId);
      thread.reload();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  const deleteTask = async () => {
    setConfirmDelete(false);
    try {
      await tasksApi.remove(taskId);
      showToast('success', `${task?.code} deleted`);
      onDeleted?.();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  if (!task) {
    return (
      <Modal isOpen onClose={onClose} title="Task" size="2xl">
        {detail.error ? (
          <LoadError message={detail.error} onRetry={detail.reload} />
        ) : (
          <p className="py-10 text-center text-xs text-[#7185A5]" role="status">
            Loading...
          </p>
        )}
      </Modal>
    );
  }

  const comments = thread.data ?? [];

  return (
    <>
      <Modal isOpen onClose={onClose} title={`${task.code} · ${task.title}`} description={task.projectName} size="2xl">
        <div className="space-y-5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.overdue && <OverdueBadge />}
            {task.clientVisible ? (
              <Badge variant="info" size="sm">
                <Eye className="w-3 h-3 inline mr-1" />
                Visible to {task.clientName ?? 'client'}
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                <EyeOff className="w-3 h-3 inline mr-1" />
                Internal only
              </Badge>
            )}
            <div className="ml-auto flex gap-2">
              {onEdit && (
                <Button variant="outline" size="sm" icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => onEdit(task)}>
                  Edit
                </Button>
              )}
              {isManager && (
                <Button variant="ghost" size="sm" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-[#DFE6F1] bg-white flex items-center gap-2">
              <User className="w-4 h-4 text-[#7185A5]" />
              <div>
                <span className="text-[10px] text-[#7185A5] block">Assignee</span>
                <span className="font-medium text-[#111827]">{task.assignee ? task.assignee.fullName : 'Unassigned'}</span>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-[#DFE6F1] bg-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#7185A5]" />
              <div>
                <span className="text-[10px] text-[#7185A5] block">Start → Deadline</span>
                <span className="font-medium text-[#111827]">
                  {formatDate(task.startDate ?? undefined)} → {formatDate(task.deadline ?? undefined)}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-[#DFE6F1] bg-white flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-[#7185A5]" />
              <div>
                <span className="text-[10px] text-[#7185A5] block">Client</span>
                <span className="font-medium text-[#111827]">{task.clientName ?? 'Internal project'}</span>
              </div>
            </div>
          </div>

          {task.description && <p className="text-[#475569] whitespace-pre-line">{task.description}</p>}

          {task.completionComment && (
            <div className="p-3 rounded-lg border border-[#DFE6F1] bg-[#F7F9FC]">
              <span className="font-semibold text-[#7185A5] flex items-center gap-1 mb-1">
                <Lock className="w-3 h-3" /> Hand-over note (internal)
              </span>
              <p className="text-[#111827] whitespace-pre-line">{task.completionComment}</p>
            </div>
          )}

          <div className="p-3 rounded-lg border border-[#DFE6F1] bg-white space-y-2">
            <span className="font-semibold text-[#111827] block">Status</span>
            <TaskStatusControl
              task={task}
              allowComment
              onChanged={updated => {
                detail.setData(updated);
                onChanged();
              }}
            />
          </div>

          {/* Comment thread */}
          <div className="rounded-xl border border-[#DFE6F1] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#DFE6F1] bg-white font-semibold text-[#111827] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#5038F5]" />
              Comments ({comments.length})
            </div>
            <div className="divide-y divide-[#DFE6F1] max-h-72 overflow-y-auto">
              {thread.error ? (
                <LoadError message={thread.error} onRetry={thread.reload} />
              ) : comments.length === 0 ? (
                <p className="px-4 py-6 text-center text-[#7185A5]">{thread.isLoading ? 'Loading…' : 'No comments yet.'}</p>
              ) : (
                comments.map(c => (
                  <div key={c.id} className={`px-4 py-3 ${c.type === 'internal_note' ? 'bg-[#F7F9FC]' : 'bg-white'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[#111827]">{c.authorName}</span>
                      {c.authorRole === 'client' && <Badge variant="info" size="sm">Client</Badge>}
                      <Badge variant={c.type === 'internal_note' ? 'neutral' : 'purple'} size="sm">
                        {c.type === 'internal_note' ? 'Internal note' : 'Shared with client'}
                      </Badge>
                      <span className="text-[10px] text-[#7185A5]">{formatDateTime(c.createdAt)}</span>
                      {(c.authorId === currentUser.id || currentUser.role === 'admin') && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="ml-auto p-1 text-[#7185A5] hover:text-[#E11D48] rounded cursor-pointer"
                          aria-label="Delete comment"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-[#475569] whitespace-pre-line">{c.body}</p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={postComment} className="p-3 border-t border-[#DFE6F1] bg-white space-y-2">
              <textarea
                aria-label="New comment"
                rows={2}
                maxLength={2000}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write a comment…"
                className={fieldClass}
              />
              <div className="flex items-center justify-between gap-2">
                <select aria-label="Comment type" value={type} onChange={e => setType(e.target.value as CommentType)} className={`${fieldClass} w-auto!`}>
                  <option value="internal_note">Internal note (staff only)</option>
                  <option value="client_feedback" disabled={!task.clientId}>
                    Shared with client{task.clientId ? '' : ' (internal project)'}
                  </option>
                </select>
                <Button type="submit" size="sm" variant="primary" disabled={posting || !body.trim()}>
                  {posting ? 'Posting…' : 'Post comment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteTask}
        title="Delete task"
        message={`Delete ${task.code} "${task.title}" and its comments? This cannot be undone.`}
        confirmLabel="Delete task"
        isDestructive
      />
    </>
  );
};
