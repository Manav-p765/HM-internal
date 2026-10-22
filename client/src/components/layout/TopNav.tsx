import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { invoicesApi } from '../../api/invoices';
import { salaryApi } from '../../api/salary';
import { tasksApi } from '../../api/tasks';
import { notificationsApi } from '../../api/notifications';
import { TaskReminder } from '../../types/work';
import { formatDate } from '../../utils/formatters';
import { invoiceLabel } from '../../types/invoices';
import { useApiData } from '../../api/useApiData';
import {
  Search,
  Bell,
  Plus,
  Menu,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  MessageSquarePlus,
  ListTodo,
  AlarmClock,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../common/Button';
import { PunchInButton } from '../attendance/PunchInButton';
import { Badge } from '../common/Badge';

const FEED_POLL_MS = 60_000;

interface TopNavProps {
  onMobileMenuToggle: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onMobileMenuToggle,
  searchQuery,
  setSearchQuery,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const {
    currentUser,
    setIsAddEmployeeOpen,
  } = useApp();

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Derive real notifications from active system state
  // Overdue invoices come from the API, and only for admins (the only role that may read invoices: a
  // manager's or employee's browser never calls /api/invoices). Best effort: the bell still works without them.
  const canSeeInvoices = currentUser.role === 'admin';
  const overdue = useApiData(
    () => (canSeeInvoices ? invoicesApi.list({ status: 'overdue', limit: 5 }) : Promise.resolve(null)),
    [canSeeInvoices],
  );
  const overdueInvoices = overdue.data?.invoices ?? [];
  const overdueTotalCount = overdue.data?.total ?? 0;
  // Unpaid salaries of the current month (IST), admin only (managers never call /api/salary).
  const isAdmin = currentUser.role === 'admin';
  const salaryMonth = useApiData(() => (isAdmin ? salaryApi.list() : Promise.resolve(null)), [isAdmin]);
  const pendingSalaryCount = salaryMonth.data ? salaryMonth.data.summary.headcount - salaryMonth.data.summary.paidCount : 0;

  // Tasks clients requested in the portal that nobody has started yet (admin and manager). Reloaded each time
  // the bell is opened, so a new request shows up without a page refresh.
  const seesClientRequests = currentUser.role === 'admin' || currentUser.role === 'manager';
  const clientRequests = useApiData(
    () => (seesClientRequests ? tasksApi.list({ requestedByClient: true, status: 'todo', limit: 5 }) : Promise.resolve(null)),
    [seesClientRequests],
  );
  const clientRequestCount = clientRequests.data?.total ?? 0;

  // Tasks: "assigned to you" notices, my tasks due by tomorrow or overdue, and overdue tasks I'm responsible for
  // (admin/manager: everyone's; an employee: the ones they assigned). Polled so a new assignment shows up.
  const feed = useApiData(() => notificationsApi.feed(), []);
  const reloadFeed = feed.reload;
  useEffect(() => {
    const timer = setInterval(reloadFeed, FEED_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadFeed]);
  const unreadAssigned = feed.data?.unread ?? 0;
  const dueSoon = feed.data?.dueSoon ?? { total: 0, tasks: [] };
  const overdueTeam = feed.data?.overdueTeam ?? { total: 0, tasks: [] };
  const taskPath = (id: string) => (seesClientRequests ? `/tasks/${id}` : `/my/tasks/${id}`);
  const openTask = (id: string, notificationId?: string) => {
    if (notificationId) notificationsApi.markRead(notificationId).then(feed.reload, () => undefined);
    navigate(taskPath(id));
    setNotificationsOpen(false);
  };
  const markAllRead = () => notificationsApi.markAllRead().then(feed.reload, () => undefined);
  const reminderLine = (t: TaskReminder, showAssignee: boolean) => (
    <button onClick={() => openTask(t.id)} className="w-full text-left text-[11px] text-[#475569] hover:text-[#111827] cursor-pointer">
      <span className="font-mono text-[10px] text-[#7185A5]">{t.code}</span> {t.title}
      <span className={`block ${t.overdue ? 'text-[#E11D48]' : 'text-[#7185A5]'}`}>
        {t.overdue ? `overdue since ${formatDate(t.deadline)}` : t.dueToday ? 'due today' : 'due tomorrow'}
        {showAssignee ? ` · ${t.assigneeName ?? 'unassigned'}` : ''}
      </span>
    </button>
  );

  // Attendance (from the same feed): an employee's punch reminders; admin/manager the records to review.
  const attendance = feed.data?.attendance ?? {};
  const attendanceReview = attendance.review ?? { total: 0, records: [] };

  const notificationCount =
    overdueTotalCount +
    (isAdmin ? pendingSalaryCount : 0) +
    clientRequestCount +
    unreadAssigned +
    dueSoon.total +
    overdueTeam.total +
    (attendance.punchInDue ? 1 : 0) +
    attendanceReview.total;

  // Context-aware Quick Action button
  const renderQuickAction = () => {
    // Employee: nothing punches them in automatically. While their shift is due the top bar offers Punch In on
    // every page (the dashboard and My Attendance have their own button); punch-out lives on those two pages.
    if (currentUser.role === 'employee') {
      const ownPunchCard = pathname.startsWith('/my/attendance') || pathname.startsWith('/dashboard');
      if (attendance.punchInDue && !ownPunchCard) return <PunchInButton onPunchedIn={feed.reload} />;
      if (pathname.startsWith('/my/attendance')) return null;
      return (
        <Button variant="outline" size="sm" icon={<Clock className="w-3.5 h-3.5" />} onClick={() => navigate('/my/attendance')}>
          My Attendance
        </Button>
      );
    }

    if (pathname.startsWith('/invoices') && currentUser.role === 'admin') {
      return (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => navigate('/invoices/new')}
        >
          Create Invoice
        </Button>
      );
    }

    if ((pathname.startsWith('/employees') || pathname === '/team') && currentUser.role === 'admin') {
      return (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            navigate('/employees');
            setIsAddEmployeeOpen(true);
          }}
        >
          Add Employee
        </Button>
      );
    }

    // Recording transactions is admin-only (accounting); other pages have no quick action.
    if (currentUser.role !== 'admin' || pathname.startsWith('/salary')) {
      return null;
    }

    // Default for Dashboard and Accounting
    return (
      <Button
        variant="primary"
        size="sm"
        icon={<Plus className="w-4 h-4" />}
        onClick={() => navigate('/accounting/new')}
      >
        Add Transaction
      </Button>
    );
  };

  return (
    <header className="no-print sticky top-0 z-30 h-16 bg-white border-b border-[#DFE6F1] px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Left zone: Mobile toggle & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          onClick={onMobileMenuToggle}
          className="p-2 text-[#7185A5] hover:text-[#111827] rounded-lg lg:hidden"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#7185A5] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={currentUser.role === 'admin' ? 'Search transactions, invoices, team members...' : 'Search projects, tasks, team members...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#F7F9FC] text-sm text-[#111827] placeholder:text-[#7185A5] pl-9 pr-4 py-2 rounded-lg border border-[#DFE6F1] focus:outline-none focus:border-[#5038F5] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Right zone: Notifications, User preview, Quick action */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Functional Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              if (!notificationsOpen && seesClientRequests) clientRequests.reload();
              if (!notificationsOpen) feed.reload();
              setNotificationsOpen(!notificationsOpen);
            }}
            className="relative p-2 text-[#7185A5] hover:text-[#111827] hover:bg-[#F7F9FC] rounded-lg transition-colors cursor-pointer"
            aria-label="View notifications"
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E11D48] rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl border border-[#DFE6F1] shadow-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#DFE6F1]">
                <span className="text-xs font-semibold text-[#111827]">
                  Notifications ({notificationCount})
                </span>
                {unreadAssigned > 0 ? (
                  <button onClick={markAllRead} className="text-[11px] font-medium text-[#5038F5] hover:underline cursor-pointer">
                    Mark all read
                  </button>
                ) : (
                  <span className="text-[11px] text-[#7185A5]">System alerts</span>
                )}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {/* The employee's punch-in reminder (there is none for punching out: that is theirs to decide). */}
                {attendance.punchInDue && (
                  <div className="p-2.5 rounded-lg bg-[#B45309]/5 border border-[#B45309]/15 text-xs" data-testid="bell-punch">
                    <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
                      <Clock className="w-4 h-4 shrink-0" />
                      You have not punched in
                    </div>
                    <p className="text-[11px] text-[#475569] mt-1">
                      Your shift{attendance.shift ? ` starts at ${attendance.shift.start} IST` : ' is on'}. Punch in when you start working.
                    </p>
                    <button
                      onClick={() => {
                        navigate('/my/attendance');
                        setNotificationsOpen(false);
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                    >
                      My Attendance <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Admin/manager: forgotten punch-outs and outside-hours punches of the last week, not yet corrected. */}
                {attendanceReview.total > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#B45309]/5 border border-[#B45309]/15 text-xs" data-testid="bell-attendance-review">
                    <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
                      <Clock className="w-4 h-4 shrink-0" />
                      {attendanceReview.total} Attendance Record{attendanceReview.total === 1 ? '' : 's'} to Check
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-[#475569]">
                      {attendanceReview.records.slice(0, 5).map(r => (
                        <li key={`${r.employeeId}-${r.workDate}`}>
                          {r.fullName} · {formatDate(r.workDate)} ·{' '}
                          {r.reasons.map(x => (x === 'incomplete' ? 'no punch-out' : 'outside hours')).join(', ')}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => {
                        navigate('/attendance');
                        setNotificationsOpen(false);
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                    >
                      Review Attendance <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Assigned to you: newest first; unread ones stand out and are marked read when opened. */}
                {feed.data && feed.data.assigned.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#5038F5]/5 border border-[#5038F5]/15 text-xs" data-testid="bell-assigned">
                    <div className="flex items-center gap-1.5 font-semibold text-[#3F2BC9]">
                      <ListTodo className="w-4 h-4 shrink-0" />
                      {unreadAssigned > 0 ? `${unreadAssigned} New Task${unreadAssigned === 1 ? '' : 's'} for You` : 'Assigned to You'}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {feed.data.assigned.slice(0, 5).map(n => (
                        <li key={n.id}>
                          <button
                            onClick={() => openTask(n.task.id, n.readAt ? undefined : n.id)}
                            className={`w-full text-left text-[11px] hover:text-[#111827] cursor-pointer ${n.readAt ? 'text-[#7185A5]' : 'text-[#111827] font-medium'}`}
                          >
                            {!n.readAt && <span className="inline-block w-1.5 h-1.5 mr-1 rounded-full bg-[#5038F5] align-middle" />}
                            <span className="font-mono text-[10px] text-[#7185A5]">{n.task.code}</span> {n.task.title}
                            <span className="block text-[#7185A5] font-normal">
                              {n.assignedBy ? `from ${n.assignedBy} · ` : ''}
                              {n.task.deadline ? `due ${formatDate(n.task.deadline)}` : 'no deadline'}
                              {n.task.overdue ? ' · overdue' : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Reminders: my open tasks due today, tomorrow or already late. */}
                {dueSoon.total > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#B45309]/5 border border-[#B45309]/15 text-xs" data-testid="bell-due-soon">
                    <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
                      <AlarmClock className="w-4 h-4 shrink-0" />
                      {dueSoon.total} Task{dueSoon.total === 1 ? '' : 's'} Due Soon or Late
                    </div>
                    <ul className="mt-1 space-y-1">
                      {dueSoon.tasks.map(t => (
                        <li key={t.id}>{reminderLine(t, false)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Overdue work I'm responsible for: everyone's (admin/manager) or what I assigned (employee). */}
                {overdueTeam.total > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#E11D48]/5 border border-[#E11D48]/15 text-xs" data-testid="bell-overdue-team">
                    <div className="flex items-center gap-1.5 font-semibold text-[#E11D48]">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {overdueTeam.total} Overdue Task{overdueTeam.total === 1 ? '' : 's'}
                      {seesClientRequests ? ' on the Team' : ' You Assigned'}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {overdueTeam.tasks.map(t => (
                        <li key={t.id}>{reminderLine(t, true)}</li>
                      ))}
                    </ul>
                    {seesClientRequests && (
                      <button
                        onClick={() => {
                          navigate('/tasks');
                          setNotificationsOpen(false);
                        }}
                        className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                      >
                        View Tasks <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {clientRequestCount > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#5038F5]/5 border border-[#5038F5]/15 text-xs" data-testid="bell-client-requests">
                    <div className="flex items-center gap-1.5 font-semibold text-[#3F2BC9]">
                      <MessageSquarePlus className="w-4 h-4 shrink-0" />
                      {clientRequestCount} New Client Request{clientRequestCount === 1 ? '' : 's'}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {clientRequests.data!.tasks.map(t => (
                        <li key={t.id}>
                          <button
                            onClick={() => {
                              navigate(`/tasks/${t.id}`);
                              setNotificationsOpen(false);
                            }}
                            className="w-full text-left text-[11px] text-[#475569] hover:text-[#111827] cursor-pointer"
                          >
                            <span className="font-mono text-[10px] text-[#7185A5]">{t.code}</span> {t.title}
                            <span className="text-[#7185A5]">
                              {' '}
                              · {t.clientName ?? t.projectName} → {t.assignee?.fullName ?? 'unassigned'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-[#7185A5] mt-1">Listed until someone starts on them.</p>
                  </div>
                )}

                {overdueTotalCount > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#E11D48]/5 border border-[#E11D48]/15 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[#E11D48]">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      {overdueTotalCount} Overdue Invoice{overdueTotalCount === 1 ? '' : 's'}
                    </div>
                    <p className="text-[11px] text-[#475569] mt-1">
                      {overdueInvoices.map(i => invoiceLabel(i)).join(', ')}
                      {overdueTotalCount > overdueInvoices.length ? ' and more' : ''} need follow-up.
                    </p>
                    <button
                      onClick={() => {
                        navigate('/invoices?status=overdue');
                        setNotificationsOpen(false);
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                    >
                      View Invoices <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {isAdmin && pendingSalaryCount > 0 && (
                  <div className="p-2.5 rounded-lg bg-[#B45309]/5 border border-[#B45309]/15 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-[#B45309]">
                      <Clock className="w-4 h-4 shrink-0" />
                      {pendingSalaryCount} Pending Salary Payouts
                    </div>
                    <p className="text-[11px] text-[#475569] mt-1">
                      Salaries awaiting disbursement for current payroll cycle.
                    </p>
                    <button
                      onClick={() => {
                        navigate('/salary');
                        setNotificationsOpen(false);
                      }}
                      className="mt-1.5 text-[11px] font-medium text-[#5038F5] hover:underline flex items-center gap-1"
                    >
                      Manage Salaries <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {notificationCount === 0 && (
                  <div className="py-6 text-center text-xs text-[#7185A5]">
                    <CheckCircle2 className="w-6 h-6 text-[#047857] mx-auto mb-1 opacity-80" />
                    All caught up!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User info & role badge (visible on tablet/desktop) */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#DFE6F1]">
          <div className="text-right">
            <div className="text-xs font-semibold text-[#111827] leading-none">
              {currentUser.name}
            </div>
            <div className="text-[10px] text-[#7185A5] mt-0.5">
              {currentUser.designation}
            </div>
          </div>
          <Badge
            variant={
              currentUser.role === 'admin'
                ? 'purple'
                : currentUser.role === 'manager'
                ? 'info'
                : 'neutral'
            }
            size="sm"
          >
            {currentUser.role.toUpperCase()}
          </Badge>
        </div>

        {/* Quick action button */}
        {renderQuickAction()}
      </div>
    </header>
  );
};
