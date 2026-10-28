import {
  adminRoleLabel,
  canAccessManagementCenter,
  canAccessSystemSettings,
  getUserRole,
  ROLE_ADMIN,
  ROLE_SUPER_ADMIN,
} from '~/utils/auth-session'

/** 管理后台页面：基于登录用户 role（10 管理员 / 100 超级管理员） */
export function useAdminAccess() {
  const { user } = useAuth()

  const userRole = computed(() => getUserRole(user.value))

  const isAdmin = computed(() => canAccessManagementCenter(user.value))

  const isSuperAdmin = computed(() => userRole.value === ROLE_SUPER_ADMIN)

  const canAccessSystemSettingsPage = computed(() => canAccessSystemSettings(user.value))

  const isNormalAdmin = computed(() => userRole.value === ROLE_ADMIN)

  const roleLabel = computed(() => adminRoleLabel(userRole.value))

  return {
    user,
    userRole,
    isAdmin,
    isSuperAdmin,
    canAccessSystemSettingsPage,
    isNormalAdmin,
    roleLabel,
  }
}
