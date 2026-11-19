<template>
  <div ref="el" class="echart" :style="{ height }"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '220px' },
  notMerge: { type: Boolean, default: true },
})

const el = ref(null)
let chart = null
let ro = null

function render() {
  if (!chart) return
  chart.setOption(props.option, props.notMerge)
}

onMounted(() => {
  chart = echarts.init(el.value, null, { renderer: 'canvas' })
  render()
  ro = new ResizeObserver(() => chart && chart.resize())
  ro.observe(el.value)
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  ro?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.echart {
  width: 100%;
}
</style>
