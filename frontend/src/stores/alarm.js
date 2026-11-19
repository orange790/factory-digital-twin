import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'
import { simulator } from '@/mock/simulator'

export const useAlarmStore = defineStore('alarm', () => {
  const active = ref([])
  const latest = ref(null)
  const loading = ref(false)

  const activeCount = computed(() => active.value.length)
  const criticalCount = computed(() => active.value.filter((a) => a.level === 'critical').length)

  async function loadActive() {
    loading.value = true
    try {
      const r = await api.alarms.list({ status: 'active', page_size: 100, all: true })
      active.value = Array.isArray(r) ? r : r.results
    } finally {
      loading.value = false
    }
  }

  function pushAlarm(alarm) {
    if (!alarm || alarm.status !== 'active') return
    latest.value = { ...alarm, _ts: Date.now() }
    if (!active.value.some((a) => a.id === alarm.id)) active.value.unshift(alarm)
  }

  function removeAlarm(id) {
    active.value = active.value.filter((a) => a.id !== id)
  }

  function bindSimulator() {
    return simulator.on((evt) => {
      if (evt.alarms?.length) evt.alarms.forEach(pushAlarm)
      if (evt.type === 'alarm-close') {
        removeAlarm(evt.alarm?.id)
        if (Array.isArray(evt.batch)) evt.batch.forEach((a) => removeAlarm(a.id))
      }
      if (evt.type === 'alarm-ack' && evt.alarm) {
        const a = active.value.find((x) => x.id === evt.alarm.id)
        if (a) a.status = 'acked'
      }
    })
  }

  return { active, latest, loading, activeCount, criticalCount, loadActive, pushAlarm, removeAlarm, bindSimulator }
})
