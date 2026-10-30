// Shared by the task form and the server. Visibility and field-specific checks stay separate.
export const isManagerRole = role => ['ADMIN', 'PROJECT_MANAGER'].includes(String(role || '').toUpperCase());

export const canUpdateTask = (user, task) => {
  if (isManagerRole(user?.role)) return true;
  const userId = user?.userId || user?.id;
  return Boolean(userId && (task?.creatorId === userId || task?.assignee?.userId === userId));
};
