import React, { useRef, useState } from 'react';
import { FileText, Link2, Paperclip, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tasksApi } from '../../api/tasks';
import { errorMessage } from '../../api/client';
import { useApiData } from '../../api/useApiData';
import { ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from '../../types/work';
import { Button } from '../common/Button';
import { LoadError } from '../common/LoadError';
import { fieldClass, formatDateTime } from '../work/WorkBits';

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// A quick check before uploading (the server checks the same rules and is the one that decides).
export function fileProblem(file: File): string | null {
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (!ATTACHMENT_EXTENSIONS.includes(extension)) return `${file.name}: this type of file can't be attached`;
  if (file.size === 0) return `${file.name} is empty`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 10 MB`;
  return null;
}

export const ACCEPT_ATTACHMENTS = ATTACHMENT_EXTENSIONS.map(e => `.${e}`).join(',');

interface TaskAttachmentsProps {
  taskId: string;
  canManage: boolean; // the assignee, whoever assigned the task, or an admin/manager
  onChanged?: () => void;
}

// Files and links on a task. Everyone who can open the task sees and downloads them; the people working on it
// add and remove them. Files download through the server (never opened inside the app); links open in a new tab.
export const TaskAttachments: React.FC<TaskAttachmentsProps> = ({ taskId, canManage, onChanged }) => {
  const { showToast } = useApp();
  const list = useApiData(() => tasksApi.attachments(taskId), [taskId]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  const refresh = async () => {
    await list.reload();
    onChanged?.();
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files)) {
      const problem = fileProblem(file);
      if (problem) {
        showToast('error', problem);
        continue;
      }
      try {
        await tasksApi.uploadFile(taskId, file);
        added++;
      } catch (err) {
        showToast('error', `${file.name}: ${errorMessage(err)}`);
      }
    }
    if (fileInput.current) fileInput.current.value = '';
    setBusy(false);
    if (added > 0) {
      showToast('success', `${added} file${added === 1 ? '' : 's'} attached`);
      await refresh();
    }
  };

  const addLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      await tasksApi.addLink(taskId, url.trim(), name.trim());
      setUrl('');
      setName('');
      setLinkOpen(false);
      await refresh();
    } catch (err) {
      showToast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachmentId: string) => {
    try {
      await tasksApi.removeAttachment(taskId, attachmentId);
      await refresh();
    } catch (err) {
      showToast('error', errorMessage(err));
    }
  };

  const attachments = list.data ?? [];

  return (
    <div className="rounded-xl border border-[#DFE6F1] overflow-hidden" data-testid="task-attachments">
      <div className="px-4 py-3 border-b border-[#DFE6F1] bg-white flex items-center justify-between gap-2">
        <span className="font-semibold text-[#111827] flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-[#5038F5]" />
          Attachments & links ({attachments.length})
        </span>
        {canManage && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" icon={<Plus className="w-3.5 h-3.5" />} disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? 'Uploading…' : 'File'}
            </Button>
            <Button size="sm" variant="outline" icon={<Link2 className="w-3.5 h-3.5" />} disabled={busy} onClick={() => setLinkOpen(!linkOpen)}>
              Link
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT_ATTACHMENTS}
              className="hidden"
              aria-label="Attach files"
              onChange={e => uploadFiles(e.target.files)}
            />
          </div>
        )}
      </div>

      {linkOpen && canManage && (
        <form onSubmit={addLink} className="p-3 border-b border-[#DFE6F1] bg-[#F7F9FC] grid grid-cols-1 sm:grid-cols-[2fr_1fr_auto] gap-2">
          <input aria-label="Link URL" type="url" required placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} className={fieldClass} />
          <input aria-label="Link name (optional)" placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} className={fieldClass} />
          <Button type="submit" size="sm" variant="primary" disabled={busy || !url.trim()}>
            Add link
          </Button>
        </form>
      )}

      {list.error ? (
        <LoadError message={list.error} onRetry={list.reload} />
      ) : attachments.length === 0 ? (
        <p className="px-4 py-4 text-center text-[#7185A5]">
          {list.isLoading ? 'Loading…' : canManage ? 'No files or links yet. Add a brief, a report or reference links.' : 'No files or links.'}
        </p>
      ) : (
        <ul className="divide-y divide-[#DFE6F1] bg-white">
          {attachments.map(a => (
            <li key={a.id} className="px-4 py-2.5 flex items-center gap-2.5">
              {a.kind === 'file' ? <FileText className="w-4 h-4 text-[#7185A5] shrink-0" /> : <Link2 className="w-4 h-4 text-[#7185A5] shrink-0" />}
              <div className="min-w-0 flex-1">
                {a.kind === 'file' ? (
                  <a href={tasksApi.downloadUrl(taskId, a.id)} download className="font-medium text-[#5038F5] hover:underline break-all">
                    {a.name}
                  </a>
                ) : (
                  <a href={a.url!} target="_blank" rel="noopener noreferrer" className="font-medium text-[#5038F5] hover:underline break-all">
                    {a.name}
                  </a>
                )}
                <span className="block text-[10px] text-[#7185A5]">
                  {a.kind === 'file' ? formatBytes(a.sizeBytes ?? 0) : a.url} · {a.uploadedByName} · {formatDateTime(a.createdAt)}
                </span>
              </div>
              {canManage && (
                <button
                  onClick={() => remove(a.id)}
                  className="p-1 text-[#7185A5] hover:text-[#E11D48] rounded cursor-pointer"
                  aria-label={`Remove ${a.name}`}
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
