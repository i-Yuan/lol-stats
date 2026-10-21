<script setup lang="ts">
import { ref, watch } from "vue"
import { loadRankedStats, searchPlayer } from "../api"
import type {
  ChampionSummaryItem,
  GameAssetBundle,
  OpenMatchPayload,
  PlayerStatsResponse,
  RankedStatsResponse,
  ShareSettings,
} from "../types"
import RecordView from "./RecordView.vue"

const RECENT_PAGE_SIZE = 20
const MAX_RECENT_DEPTH = 1000
const DEFAULT_STATS_DEPTH = 100

const props = withDefaults(defineProps<{
  active?: boolean
  query: string
  sgpServerId?: string
  champions: Record<number, ChampionSummaryItem>
  gameAssets: GameAssetBundle
  shareSettings: ShareSettings
}>(), { active: true })

const emit = defineEmits<{
  openMatch: [payload: OpenMatchPayload]
}>()

const recentStats = ref<PlayerStatsResponse | null>(null)
const fullStats = ref<PlayerStatsResponse | null>(null)
const rankedStats = ref<RankedStatsResponse | null>(null)
const recentDepth = ref(RECENT_PAGE_SIZE)
const recentHasMore = ref(true)
const statsDepth = ref(DEFAULT_STATS_DEPTH)
const recentLoading = ref(false)
const statsLoading = ref(false)
const rankedLoading = ref(false)
const error = ref("")

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function loadRecent(forceRefresh = false) {
  if (recentLoading.value) return false
  recentLoading.value = true
  error.value = ""

  try {
    const stats = await searchPlayer(
      props.query,
      recentDepth.value,
      props.sgpServerId,
      forceRefresh,
      false,
    )
    recentStats.value = stats

    recentHasMore.value = Boolean(stats.dataStatus?.hasMore) && recentDepth.value < MAX_RECENT_DEPTH

    return true
  } catch (loadError) {
    error.value = errorMessage(loadError)
    recentHasMore.value = false
    return false
  } finally {
    recentLoading.value = false
  }
}

async function loadRecentMore() {
  if (recentLoading.value || !recentHasMore.value) return

  const previousDepth = recentDepth.value
  recentDepth.value = Math.min(MAX_RECENT_DEPTH, recentDepth.value + RECENT_PAGE_SIZE)

  if (recentDepth.value === previousDepth) {
    recentHasMore.value = false
    return
  }

  const loaded = await loadRecent(false)
  if (!loaded) recentDepth.value = previousDepth
}

async function loadStats(forceRefresh = false) {
  if (fullStats.value && !forceRefresh) return
  if (statsLoading.value) return
  statsLoading.value = true
  error.value = ""

  try {
    fullStats.value = await searchPlayer(
      props.query,
      statsDepth.value,
      props.sgpServerId,
      forceRefresh,
      false,
    )
  } catch (loadError) {
    error.value = errorMessage(loadError)
  } finally {
    statsLoading.value = false
  }
}

async function loadRanked(forceRefresh = false) {
  if (rankedStats.value && !forceRefresh) return
  if (rankedLoading.value) return
  rankedLoading.value = true

  try {
    rankedStats.value = await loadRankedStats(props.query, props.sgpServerId)
  } catch {
    rankedStats.value = null
  } finally {
    rankedLoading.value = false
  }
}

function changeStatsDepth(depth: number) {
  const nextDepth = Math.min(1000, Math.max(50, Math.round(Number(depth) || DEFAULT_STATS_DEPTH)))
  if (nextDepth === statsDepth.value && fullStats.value) return

  statsDepth.value = nextDepth
  fullStats.value = null
  void loadStats()
}

watch(
  () => [props.query, props.sgpServerId],
  () => {
    rankedStats.value = null
    void loadRanked(true)
  },
  { immediate: true },
)
</script>

<template>
  <RecordView
    :active="active"
    :recent-stats="recentStats"
    :full-stats="fullStats"
    :ranked-stats="rankedStats"
    :ranked-loading="rankedLoading"
    :share-settings="shareSettings"
    :champions="champions"
    :game-assets="gameAssets"
    :loading="recentLoading || statsLoading"
    :recent-loading="recentLoading"
    :recent-has-more="recentHasMore"
    :stats-depth="statsDepth"
    :error="error"
    :sgp-server-id="sgpServerId"
    @load-recent="loadRecent"
    @load-stats="loadStats"
    @refresh-recent="loadRecent(true)"
    @refresh-stats="loadStats(true)"
    @load-recent-more="loadRecentMore"
    @change-stats-depth="changeStatsDepth"
    @open-match="emit('openMatch', $event)"
  />
</template>
