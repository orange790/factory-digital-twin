import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { parseToken, ROLES } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const claims = ref(parseToken())
  const username = computed(() => claims.value?.sub || '')
  const role = computed(() => claims.value?.role || 'guest')
  const roleMeta = computed(() => ROLES[role.value] || ROLES.guest)
  const isLogged = computed(() => !!claims.value)
  const isGuest = computed(() => role.value === 'guest')

  function can(perm) {
    if (!claims.value) return false
    return (ROLES[role.value]?.perms || []).includes(perm)
  }

  async function login(u, p) {
    const r = await api.auth.login(u, p)
    claims.value = parseToken(r.access)
    return r
  }
  async function demo() {
    const r = await api.auth.demo()
    claims.value = parseToken(r.access)
    return r
  }
  function logout() {
    api.auth.logout()
    claims.value = null
  }

  return { claims, username, role, roleMeta, isLogged, isGuest, can, login, demo, logout }
})
