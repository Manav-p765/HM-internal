import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { tasksApi } from '../api/tasks';
import { portalApi } from '../api/portal';
import { errorMessage } from '../api/client';
import { homeFor } from './guards';

// /task/TSK-042: the link people share in team chats (copied from a task). It opens just that task in the
// reader's own shell: admins and managers on /tasks/:id, employees on /my/tasks/:id (any staff member may
// open any task), clients in the portal, only if it is their company's shared task. Anything else is the same
// "not found" as a missing code.
export const TaskLinkPage: React.FC = () => {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const resolve = async () => {
      if (user.role === 'client') {
        const { projectId, taskId } = await portalApi.taskByCode(code);
        return `/portal/projects/${projectId}?task=${taskId}`;
      }
      const task = await tasksApi.byCode(code);
      return user.role === 'employee' ? `/my/tasks/${task.id}` : `/tasks/${task.id}`;
    };
    resolve().then(
      path => !cancelled && setTarget(path),
      err => !cancelled && setError(errorMessage(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [code, user]);

  if (target) return <Navigate to={target} replace />;

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-[#DFE6F1] p-6 max-w-sm w-full text-center space-y-3">
        {error ? (
          <>
            <h1 className="text-sm font-semibold text-[#111827]">{code.toUpperCase()} can't be opened</h1>
            <p className="text-xs text-[#7185A5]">It doesn't exist, or it isn't shared with you.</p>
            <Link to={user ? homeFor(user.role) : '/login'} className="inline-block text-xs font-medium text-[#5038F5] hover:underline">
              Go to your dashboard
            </Link>
          </>
        ) : (
          <p className="text-xs text-[#7185A5]" role="status">
            Opening {code.toUpperCase()}…
          </p>
        )}
      </div>
    </div>
  );
};
