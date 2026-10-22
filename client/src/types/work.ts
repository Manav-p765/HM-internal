// Projects, tasks and comments: shapes returned by /api/projects, /api/tasks and /api/portal.
import type { EmploymentStatus, UserRole } from './index';

export type ProjectStatus = 'not_started' | 'active' | 'on_hold' | 'completed' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CommentType = 'internal_note' | 'client_feedback';

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  not_started: 'Not Started',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};
export const EDITABLE_PROJECT_STATUSES: Exclude<ProjectStatus, 'archived'>[] = ['not_started', 'active', 'on_hold', 'completed'];

// Board column order.
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'completed'];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  completed: 'Completed',
  blocked: 'Blocked',
};
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };

// Status changes an employee may make on their own task (mirrors the server; managers may make any change).
export const EMPLOYEE_TASK_TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  todo: ['in_progress'],
  in_progress: ['in_review', 'blocked'],
  blocked: ['in_progress'],
};

// Status changes an employee may make on a task they assigned to someone else: the review (mirrors the server).
export const CREATOR_TASK_TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  in_review: ['completed', 'in_progress'],
};

// The moves the signed-in user may make on a task (null = any status: admin/manager).
export function allowedTaskMoves(task: Task, user: { id: string; role: string; employeeId?: string }): TaskStatus[] | null {
  if (user.role === 'admin' || user.role === 'manager') return null;
  if (task.assigneeId && task.assigneeId === user.employeeId) return EMPLOYEE_TASK_TRANSITIONS[task.status] ?? [];
  if (task.createdBy === user.id) return CREATOR_TASK_TRANSITIONS[task.status] ?? [];
  return [];
}

// Admin/manager edit and delete any task; an employee only one they assigned, while it is still to do.
export const canChangeTask = (task: Task, user: { id: string; role: string }) =>
  user.role === 'admin' || user.role === 'manager' || (task.createdBy === user.id && task.status === 'todo');

export interface ProjectMember {
  id: string;
  code: string;
  fullName: string;
  designation: string;
  status: EmploymentStatus;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  clientName: string | null;
  startDate: string | null;
  deadline: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
  completedTaskCount: number;
  memberCount: number;
  progress: number | null; // completed / total, 0..1; null with no tasks
  members?: ProjectMember[]; // detail only
}

export interface Task {
  id: string;
  code: string;
  projectId: string;
  projectName: string;
  projectStatus: ProjectStatus;
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assignee: { id: string; fullName: string; designation: string } | null;
  startDate: string | null;
  deadline: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  clientVisible: boolean;
  requestedByClient: boolean; // created by the client in the portal (always stays shared with them)
  completedAt: string | null;
  completionComment: string | null;
  overdue: boolean;
  createdBy: string; // user id
  createdByName: string; // who assigned it: an employee name, the client company, or "Hybrid Monks"
  attachmentCount: number; // files and links on the task (TaskAttachment)
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  inReview: number;
  completed: number;
  blocked: number;
  overdue: number;
}

export interface TaskComment {
  id: string;
  type: CommentType;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
}

// Client portal shapes: no internal fields.
export interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  deadline: string | null;
  status: ProjectStatus;
  progress: number | null; // over client-visible tasks; null when none are visible
  taskCounts?: { total: number; completed: number; inProgress: number; overdue: number };
}

export interface PortalTask {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  deadline: string | null;
  completedAt: string | null;
  overdue: boolean;
  assignee: { fullName: string; designation: string } | null;
  feedbackCount: number;
  requestedByClient: boolean; // the client's company asked for it
  editable: boolean; // their request, not started yet: they may still change or reassign it
}

// GET /api/portal/projects/:id/assignees: who a client may assign on that project (its active team).
export interface PortalAssignee {
  id: string;
  name: string;
  designation: string;
}

export interface PortalTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  deadline?: string | null;
  assigneeId?: string | null;
}

export interface PortalComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  fromClient: boolean;
}

// The staff bell (GET /api/notifications). "Assigned to you" notices are stored and marked read; reminders are
// worked out by the server each time from deadlines (today in IST).
export interface TaskNotification {
  id: string;
  kind: 'task_assigned';
  readAt: string | null;
  createdAt: string;
  assignedBy: string | null;
  task: { id: string; code: string; title: string; deadline: string | null; priority: TaskPriority; status: TaskStatus; projectName: string; overdue: boolean };
}

export interface TaskReminder {
  id: string;
  code: string;
  title: string;
  deadline: string;
  priority: TaskPriority;
  status: TaskStatus;
  projectName: string;
  assigneeName: string | null;
  overdue: boolean;
  dueToday: boolean;
}

export interface NotificationFeed {
  unread: number;
  assigned: TaskNotification[];
  dueSoon: { total: number; tasks: TaskReminder[] }; // my open tasks due by tomorrow, overdue included
  overdueTeam: { total: number; tasks: TaskReminder[] }; // admin/manager: everyone's; employee: ones I assigned
  // Attendance, derived each time: an employee's own punch reminders; admin/manager the last week's
  // forgotten punch-outs and outside-hours punches nobody has corrected.
  attendance: {
    punchInDue?: boolean;
    shift?: { start: string; end: string } | null;
    review?: {
      total: number;
      records: { employeeId: string; fullName: string; workDate: string; punchIn: string; reasons: ('incomplete' | 'outside_hours')[] }[];
    };
  };
}

// GET /api/tasks/:id/attachments: files (kept by the server, downloaded through it) and links. Staff only.
export interface TaskAttachment {
  id: string;
  kind: 'file' | 'link';
  name: string;
  url: string | null; // links only
  contentType: string | null; // files only
  sizeBytes: number | null; // files only
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
}

// The file types the server accepts (server/src/routes/tasks.ts, FILE_TYPES), at most 10 MB each.
export const ATTACHMENT_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip'];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// The link people share in chats: opens just that task after sign-in (staff: the task; clients: in the portal,
// only if it is their company's shared task).
export const taskLink = (code: string) => `${window.location.origin}/task/${code}`;

// The people working on a task (mirrors the server's worksOnTask): admin/manager, its assignee, and whoever
// assigned it. They add and remove attachments; anyone else who opens the task only views.
export const worksOnTask = (task: Task, user: { id: string; role: string; employeeId?: string }) =>
  user.role === 'admin' ||
  user.role === 'manager' ||
  (task.assigneeId !== null && task.assigneeId === user.employeeId) ||
  task.createdBy === user.id;
