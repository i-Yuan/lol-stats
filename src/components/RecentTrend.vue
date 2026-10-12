<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PlayerStatsResponse, ChampionSummaryItem } from '../types'
import { recentTrend, orderedGames, queueLabel } from '../recentInsights'
import { championName } from '../utils'
const props=defineProps<{stats:PlayerStatsResponse;champions:Record<number,ChampionSummaryItem>}>()
const emit=defineEmits<{loadMore:[]}>()
const queue=ref(0)
const queues=computed(()=>[...new Set(orderedGames(props.stats.recentGames).map(g=>g.queueId))])
watch(queues,ids=>{if(!ids.includes(queue.value)) queue.value=ids[0]||0},{immediate:true})
const trend=computed(()=>recentTrend(props.stats.recentGames,queue.value))
const uncertain=computed(()=>!props.stats.dataStatus || props.stats.dataStatus.stale || props.stats.dataStatus.partial)
function date(n?:number){ return n ? new Date(n).toLocaleDateString('zh-CN') : '暂无' }
function delta(n:number,digits=1){return `${n>0?'+':''}${n.toFixed(digits)}`}
</script>
<template>
  <section class="trend">
    <header><strong>近期趋势</strong><label>队列 <select v-model.number="queue" :disabled="!queues.length"><option v-for="id in queues" :key="id" :value="id">{{ queueLabel(id) }}</option></select></label></header>
    <p v-if="uncertain" class="warning">{{ !stats.dataStatus ? '数据状态未知' : stats.dataStatus.stale ? '缓存可能过期' : '样本可能不完整' }}：以下仅描述当前已取得样本，不代表完整近期表现。</p>
    <div class="windows">
      <article v-for="(w,index) in [trend.current,trend.previous]" :key="index">
        <b>{{ index===0?'最近':'此前' }} {{ w.count }}/20 场</b><small>{{ date(w.oldestAt) }} — {{ date(w.newestAt) }}</small>
        <p>胜率 {{ w.winRate===null?'—':(w.winRate*100).toFixed(1)+'%' }} · KDA {{ w.kda===null?'—':w.kda.toFixed(2) }}</p>
        <span>{{ w.champions.map(([id,n])=>`${championName(champions,id)} ${n}场`).join(' · ') || '暂无英雄样本' }}</span>
      </article>
    </div>
    <p v-if="trend.comparable">两组样本差值：胜率 {{ delta(trend.winRateDelta!*100) }} 个百分点 · KDA {{ delta(trend.kdaDelta!,2) }}。不作实力升降判断。</p>
    <p v-else>同队列不足 40 场有效样本，暂不计算差值。<button @click="emit('loadMore')">加载更多近期对局</button></p>
    <small>仅当前已加载有效样本，按队列 ID 分开，去重后按时间排序；两组互不重叠。不受统计页日期筛选影响。KDA = 总击杀助攻 ÷ max(1, 总死亡)。</small>
  </section>
</template>
<style scoped>
.trend{padding:16px;border:1px solid #d6e1da;border-radius:12px;background:#f6faf8;color:#345448}header{display:flex;justify-content:space-between;gap:12px;align-items:center}.windows{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}article{padding:12px;background:white;border-radius:8px}small{display:block;color:#6a7b73;font-size:12px;line-height:1.7}select,button{padding:5px 8px;border:1px solid #b9cdc2;border-radius:6px;background:white;color:inherit}button{margin-left:8px;cursor:pointer}.warning{color:#8b6524}@media(max-width:650px){.windows{grid-template-columns:1fr}}
</style>
