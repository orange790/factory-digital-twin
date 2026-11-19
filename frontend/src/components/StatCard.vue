<template>
  <div class="stat-card" :class="[tone, { clickable }]">
    <div class="sc-top">
      <span class="sc-label">{{ label }}</span>
      <el-icon :size="14" class="sc-icon"><component :is="icon" /></el-icon>
    </div>
    <div class="sc-val">
      <b class="mono">{{ display }}</b>
      <span v-if="unit" class="unit">{{ unit }}</span>
    </div>
    <div class="sc-foot">
      <span v-if="hint" class="hint">{{ hint }}</span>
      <span class="spark" v-if="series?.length">
        <i v-for="(v, i) in series" :key="i" :style="{ height: v + '%' }"></i>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: String,
  value: [Number, String],
  unit: String,
  hint: String,
  icon: { type: String, default: 'DataLine' },
  tone: { type: String, default: 'default' },
  series: Array,
  clickable: Boolean,
})

const display = computed(() => {
  if (typeof props.value === 'number') return props.value.toLocaleString('zh-CN')
  return props.value ?? '—'
})
</script>

<style scoped>
.stat-card {
  position: relative;
  padding: 13px 15px 11px;
  border-radius: 10px;
  background: linear-gradient(160deg, #121a24 0%, #0e141c 100%);
  border: 1px solid var(--line-soft);
  overflow: hidden;
  transition: all 0.18s;
}
.stat-card.clickable {
  cursor: pointer;
}
.stat-card.clickable:hover {
  border-color: rgba(47, 129, 247, 0.38);
  transform: translateY(-1px);
}
.stat-card::after {
  content: '';
  position: absolute;
  right: -30px;
  top: -30px;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(47, 129, 247, 0.14), transparent 70%);
}
.stat-card.bad::after {
  background: radial-gradient(circle, rgba(248, 81, 73, 0.16), transparent 70%);
}
.stat-card.warn::after {
  background: radial-gradient(circle, rgba(210, 153, 34, 0.15), transparent 70%);
}
.stat-card.ok::after {
  background: radial-gradient(circle, rgba(63, 185, 80, 0.14), transparent 70%);
}
.sc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sc-label {
  font-size: 11.5px;
  color: var(--txt-3);
}
.sc-icon {
  color: #3f4d5e;
}
.sc-val {
  display: flex;
  align-items: baseline;
  gap: 3px;
  margin: 6px 0 4px;
}
.sc-val b {
  font-size: 23px;
  font-weight: 550;
  letter-spacing: -0.01em;
  color: #e6edf3;
}
.sc-val .unit {
  font-size: 10.5px;
  color: var(--txt-3);
}
.sc-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  min-height: 16px;
}
.hint {
  font-size: 10.5px;
  color: #536174;
}
.spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 16px;
}
.spark i {
  width: 2.5px;
  border-radius: 1px;
  background: rgba(47, 129, 247, 0.55);
}
</style>
