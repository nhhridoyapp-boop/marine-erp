// ERP role helpers. UI gating only — every sensitive action also re-checks the role from the database (requireActor).
// Hierarchy: Master Super Admin → Super Admin → Admin → Supervisor → Staff. "Operations Admin" is an existing extra role, kept as is.
export const ROLE_SETS = {
  SUPER: ['Master Super Admin', 'Super Admin'],
  ADMIN: ['Master Super Admin', 'Super Admin', 'Admin'],
  MASTER: ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin'],
  // Master data Add (create new): includes Supervisor and Staff. Edit/delete stays at MASTER (Admin+).
  MASTER_ADD: ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin', 'Supervisor', 'Staff'],
  HANDLE: ['Master Super Admin', 'Super Admin', 'Admin', 'Operations Admin', 'Supervisor'],
};
export const isSuperAdmin = (u) => u?.role === 'Master Super Admin' || u?.role === 'Super Admin';
export const isMasterSuperAdmin = (u) => u?.role === 'Master Super Admin';
export const isAdminRole = (u) => ROLE_SETS.ADMIN.includes(u?.role);
export const canManageMaster = (u) => ROLE_SETS.MASTER.includes(u?.role);
export const canAddMaster = (u) => ROLE_SETS.MASTER_ADD.includes(u?.role);
export const canHandleAlerts = (u) => ROLE_SETS.HANDLE.includes(u?.role);
export const canClose = (u) => ROLE_SETS.HANDLE.includes(u?.role);
// Admin edits/deletes directly; Supervisor/Staff must send a request that the Super Admin approves.
export const canEditDirect = isAdminRole;
export const canDeleteDirect = isAdminRole;