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
  completedAt: string | null;
  completionComment: string | null;
  overdue: boolean;
  createdBy: string;
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
}

export interface PortalComment {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  fromClient: boolean;
}
