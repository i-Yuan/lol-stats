<script setup lang="ts">
import { computed } from "vue"
import type { PlayerStatsResponse } from "../types"
const props = defineProps<{ stats: PlayerStatsResponse; compact?: boolean }>()
const status = computed(() => props.stats.dataStatus)
const sources: Record<string, string> = { sgp: "国服服务", lcu: "客户端", cache: "本地缓存", "network-cache": "网络更新 + 本地缓存" }
function date(value?: number | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未知"
}
</script>
<template>
  <aside class="data-status" :class="{ warning: status?.stale || status?.partial, compact }" aria-live="polite">
    <template v-if="status">
      <div>
        <strong>{{ status.stale ? "刷新未成功，当前结果可能过期" : sources[status.source] || "数据状态未知" }}</strong>
        <span v-if="status.partial"> · 样本可能不完整</span>
        <span> · 最近成功更新：{{ date(status.lastSuccessAt) }}</span>
      </div>
      <template v-if="!compact">
        <div>请求 {{ stats.depthRequested }} 局 · 已载入原始记录 {{ status.rawGames }} 局 · 有效统计 {{ stats.depthLoaded }} 局（页面筛选前）</div>
        <details>
          <summary>样本范围与排除原因</summary>
          <p>原始记录覆盖 {{ date(status.oldestGameAt) }} 至 {{ date(status.newestGameAt) }}</p>
          <p>排除人机/教程 {{ status.excludedPve }} 局，少于 8 分钟 {{ status.excludedShort }} 局，缺少玩家数据 {{ status.excludedMissingPlayer }} 局。排除原因按此顺序互斥计数。</p>
        </details>
      </template>
      <div v-if="status.warning">{{ status.warning }}。可点击刷新重试。</div>
    </template>
    <span v-else>此记录缺少更新时间，请刷新后查看数据状态。</span>
  </aside>
</template>
<style scoped>
.data-status { margin: 10px 0; padding: 10px 14px; border: 1px solid #d7e5e1; border-radius: 8px; color: #52666b; background: #f5faf8; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.warning { border-color: #d9a85d; background: #fff8eb; color: #805718; }
.compact { padding: 5px 8px; font-size: 11px; }
summary { cursor: pointer; } p { margin: 4px 0; }
</style>
