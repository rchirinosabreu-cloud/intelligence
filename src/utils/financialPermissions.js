const FINANCIAL_PERMISSION_LEVELS = {
  NONE: 0,
  VIEWER: 1,
  EDITOR: 2,
  APPROVER: 3,
  ADMIN: 4
};

const REQUIRED_FINANCIAL_LEVELS = {
  read: FINANCIAL_PERMISSION_LEVELS.VIEWER,
  write: FINANCIAL_PERMISSION_LEVELS.EDITOR,
  approve: FINANCIAL_PERMISSION_LEVELS.APPROVER,
  admin: FINANCIAL_PERMISSION_LEVELS.ADMIN
};

export const effectiveFinancialRole = user => {
  if (!user || user.isActive === false) return 'NONE';
  if (String(user.role || '').toUpperCase() === 'ADMIN') return 'ADMIN';
  // The Equipo checkbox is the grant. Names, old flags and a stale financial
  // level never bypass a missing or revoked module permission.
  if (user.modulePermissions?.financiero !== true) return 'NONE';
  const role = String(user.financialRole ?? 'NONE').toUpperCase();
  // Before financial levels existed, the checked module granted operational
  // access. Preserve that explicit grant, not the unrelated legacy flag.
  if (role === 'NONE') return 'EDITOR';
  return Object.hasOwn(FINANCIAL_PERMISSION_LEVELS, role) ? role : 'NONE';
};

export const hasFinancialPermission = (user, permission = 'read') => {
  const requiredLevel = REQUIRED_FINANCIAL_LEVELS[permission];
  if (!requiredLevel) return false;
  return FINANCIAL_PERMISSION_LEVELS[effectiveFinancialRole(user)] >= requiredLevel;
};
