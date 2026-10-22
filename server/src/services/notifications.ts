import type { PoolClient } from 'pg';

// "A task was assigned to you" (migration 015). Call inside the transaction that sets or changes the assignee:
// earlier assignment notifications for the task go (they belonged to the previous assignee), and every active
// staff login linked to the new assignee gets one, except the person who made the change.
export async function notifyTaskAssigned(db: PoolClient, taskId: string, employeeId: string | null | undefined, actorUserId: string) {
  await db.query(`DELETE FROM notifications WHERE task_id = $1 AND kind = 'task_assigned'`, [taskId]);
  if (!employeeId) return;
  await db.query(
    `INSERT INTO notifications (user_id, kind, task_id, actor_user_id)
     SELECT u.id, 'task_assigned', $1, $3
       FROM users u
      WHERE u.employee_id = $2 AND u.role <> 'client' AND u.status = 'active' AND u.id <> $3`,
    [taskId, employeeId, actorUserId],
  );
}
