<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { LoaderCircle } from "lucide-vue-next"
import type {
  ChampionSummaryItem,
  GameAssetBundle,
  OpenMatchPayload,
  PlayerStatsResponse,
} from "../types"
import { fixed } from "../utils"
import RecentGamesShare from "./RecentGamesShare.vue"
import GameRecordList from "./GameRecordList.vue"

const props = defineProps<{
  stats: PlayerStatsResponse | null
  champions: Record<number, ChampionSummaryItem>
  gameAssets: GameAssetBundle
  sgpServerId?: string
  loadingMore?: boolean
  hasMore?: boolean
  ownerLabel?: string
  ownerPuuid?: string
}>()

const emit = defineEmits<{
  loadMore: []
  openMatch: [payload: OpenMatchPayload]
}>()

const augmentFilter = ref(0)
const augmentOptions = computed(() => [...new Set((props.stats?.recentGames || []).filter(g=>g.queueId===2400).flatMap(g=>g.augmentIds))].filter(id=>id>0).map(id=>({id,name:props.gameAssets.augments.find(a=>a.id===id)?.name || `强化 ${id}`})))
const filteredGames = computed(() => (props.stats?.recentGames || []).filter(g=>!augmentFilter.value || (g.queueId===2400 && g.augmentIds.includes(augmentFilter.value))))
watch([()=>props.stats?.summoner.puuid,()=>props.sgpServerId],()=>{augmentFilter.value=0})
const loadMoreSentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function canLoadMore() {
  return Boolean(props.stats) && !props.loadingMore && props.hasMore !== false
}

function requestMoreIfVisible() {
  if (augmentFilter.value || !canLoadMore()) return

  const sentinel = loadMoreSentinel.value
  if (!sentinel) return

  const rect = sentinel.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  if (rect.top <= viewportHeight + 180) {
    emit("loadMore")
  }
}

function handleIntersection(entries: IntersectionObserverEntry[]) {
  if (augmentFilter.value || !canLoadMore()) return

  if (entries.some((entry) => entry.isIntersecting)) {
    emit("loadMore")
  }
}

onMounted(() => {
  observer = new IntersectionObserver(handleIntersection, {
    root: null,
    rootMargin: "160px 0px 220px 0px",
    threshold: 0,
  })

  if (loadMoreSentinel.value) observer.observe(loadMoreSentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})

watch(loadMoreSentinel, (current, previous) => {
  if (previous) observer?.unobserve(previous)
  if (current) observer?.observe(current)
})

watch(
  () => [props.stats?.recentGames.length, props.loadingMore, props.hasMore] as const,
  async () => {
    await nextTick()
    requestMoreIfVisible()
  },
)
</script>

<template>
  <section class="empty-panel" v-if="!stats">
    <div class="empty-title">暂无战绩</div>
    <div class="empty-subtitle">等待读取客户端数据</div>
  </section>

  <section class="match-panel" v-else>
    <div class="match-summary">
      <div>
        <span>近 {{ stats.depthLoaded }} 局</span>
        <strong>{{ stats.summary.wins }}胜 {{ stats.summary.losses }}负</strong>
      </div>
      <div>
        <span>胜率</span>
        <strong>{{ Math.round(stats.summary.winRate * 100) }}%</strong>
      </div>
      <div>
        <span>KDA</span>
        <strong>{{ fixed(stats.summary.averageKda) }}</strong>
      </div>
    </div>

    <div class="history-actions">
    <RecentGamesShare :stats="stats" :champions="champions" :game-assets="gameAssets" :visible-games="filteredGames" />

    <label v-if="augmentOptions.length">海克斯强化筛选
      <select v-model.number="augmentFilter"><option :value="0">全部已加载对局</option><option v-for="a in augmentOptions" :key="a.id" :value="a.id">{{a.name}}</option></select>
      <small v-if="augmentFilter"> 匹配 {{filteredGames.length}} 局，仅筛选已加载海克斯对局；上方汇总仍为全部样本。</small>
    </label>
    </div>
    <GameRecordList
      :games="filteredGames"
      :champions="champions"
      :game-assets="gameAssets"
      :sgp-server-id="sgpServerId"
      :owner-label="ownerLabel"
      :owner-puuid="ownerPuuid"
      external-detail
      @open-match="emit('openMatch', $event)"
    />

    <div class="load-more-sentinel" ref="loadMoreSentinel">
      <template v-if="loadingMore">
        <LoaderCircle class="spin" :size="16" />
        <span>正在加载下一组</span>
      </template>
      <button v-else-if="augmentFilter && hasMore !== false" @click="emit('loadMore')">手动加载更多样本</button>
      <span v-else-if="hasMore !== false">继续下滑加载更多</span>
      <span v-else-if="stats.dataStatus?.partial || stats.dataStatus?.stale">加载未完成，可刷新重试</span>
      <span v-else-if="stats.depthRequested >= 1000 && stats.dataStatus?.hasMore">已达到 1000 局加载上限</span>
      <span v-else-if="stats.dataStatus?.hasMore">已暂停加载，可刷新重试</span>
      <span v-else>数据源暂无更多记录</span>
    </div>
  </section>
</template>

<style scoped>
.history-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.history-actions>label{font-size:11px;color:#728578}.history-actions select{margin-left:6px;padding:6px 8px;border:1px solid #d0ddd4;border-radius:6px;background:#fff;color:#476853;max-width:240px}.history-actions small{display:block;margin-top:4px}.history-actions :deep(.share-preview){width:100%}.history-actions:has(.share-preview){display:block}

.empty-panel {
  display: grid;
  min-height: 420px;
  place-content: center;
  gap: 8px;
  color: #657179;
  text-align: center;
}

.empty-title {
  color: #263238;
  font-size: 22px;
  font-weight: 800;
}

.empty-subtitle {
  font-size: 14px;
}

.match-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.match-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.match-summary div,
.match-row {
  border: 1px solid #dce7e4;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 28px rgba(32, 67, 73, 0.07);
}

.match-summary div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px;
}

.match-summary span {
  color: #718087;
  font-size: 12px;
}

.match-summary strong {
  color: #20333a;
  font-size: 24px;
}

.load-more-sentinel {
  display: inline-flex;
  align-self: center;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border: 1px solid #d9e6e2;
  border-radius: 999px;
  color: #53666c;
  background: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 800;
  padding: 8px 13px;
}

@media (max-width: 1050px) {
  .match-summary {
    grid-template-columns: 1fr;
  }
}
</style>
