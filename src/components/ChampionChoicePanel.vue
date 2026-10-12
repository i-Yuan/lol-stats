<script setup lang="ts">
import { computed,ref,watch,onBeforeUnmount } from 'vue'
import {loadChampionChoices} from '../api'
import {createChoiceMonitor} from '../choiceMonitor'
import type { ChampionChoiceSnapshot, LiveGameResponse, ChampionSummaryItem } from '../types'
import { championChoices } from '../hexInsights'
import { championName } from '../utils'
import DataStatus from './DataStatus.vue'
const props=defineProps<{game:LiveGameResponse;champions:Record<number,ChampionSummaryItem>}>()
const me=computed(()=>props.game.teams.flatMap(t=>t.players).find(p=>p.puuid.toLowerCase()===props.game.observerPuuid?.toLowerCase()))
const choice=ref<ChampionChoiceSnapshot|null>(null),choiceError=ref('')
const active=computed(()=>props.game.phase==='ChampSelect'&&props.game.queueId===2400)
const scope=()=>[props.game.sgpServerId,props.game.observerPuuid,props.game.gameId,props.game.phase,props.game.queueId].join(':')
const monitor=createChoiceMonitor(loadChampionChoices,scope,(value,error)=>{
 choice.value=value&&value.sgpServerId===props.game.sgpServerId&&value.observerPuuid.toLowerCase()===props.game.observerPuuid?.toLowerCase()?value:null
 choiceError.value=error
})
let timer:ReturnType<typeof setInterval>|undefined
watch(scope,()=>{
 monitor.stop();if(timer)clearInterval(timer);choice.value=null;choiceError.value=''
 if(active.value){monitor.start();void monitor.tick();timer=setInterval(()=>void monitor.tick(),3000)}
},{immediate:true})
onBeforeUnmount(()=>{monitor.stop();if(timer)clearInterval(timer)})
const rows=computed(()=>championChoices(me.value?.stats?.recentGames||[],choice.value?.championId||0,choice.value?.benchChampionIds))
</script>
<template>
 <section v-if="active" class="choices">
  <strong>海克斯选人 · 我的英雄表现</strong>
  <p v-if="!choice">{{choiceError || '正在确认当前选择；也可能已离开选人阶段。'}}</p>
  <p v-if="!me">暂时无法确认当前玩家，未展示个人数据。</p>
  <template v-else>
   <p v-if="!me.stats">{{me.error?'个人战绩获取失败，可刷新重试':'个人战绩加载中，先展示可识别英雄…'}}</p>
   <DataStatus v-if="me.stats" :stats="me.stats" compact />
   <div class="choice-grid"><article v-for="row in rows" :key="row.id">
    <b>{{championName(champions,row.id)}} · {{row.current?'当前选择':'板凳席'}}</b>
    <p v-if="!me.stats">{{me.error?'数据不可用':'等待战绩'}}</p>
    <p v-else>{{row.summary.count}} 场<template v-if="row.summary.count"> · {{Math.round(row.summary.winRate!*100)}}% 胜率</template></p>
    <small v-if="me.stats">{{row.summary.count<5?'样本不足，仅供参考':'仅个人已加载样本'}} · 最近 {{row.recent.map(w=>w?'胜':'负').join(' / ')||'暂无'}}</small>
   </article></div>
   <p v-if="choice?.benchChampionIds==null">客户端尚未提供可用板凳席信息。</p>
   <p v-else-if="!choice?.benchChampionIds?.length">当前快照中没有可换英雄。</p>
  </template>
  <small>只统计已加载的海克斯大乱斗有效战绩，不代表英雄总熟练度或全服强度。不额外请求历史；席位每三秒独立刷新，慢请求不重叠，以客户端当前可换状态为准。</small>
 </section>
</template>
<style scoped>
.choices{padding:16px;border:1px solid #cbdacf;border-radius:12px;margin:12px 0;background:#f6faf8;color:#345448}.choice-grid{display:flex;flex-wrap:wrap;gap:12px}article{padding:12px;background:white;border-radius:8px;min-width:160px}small{color:#66796f}p{margin:8px 0}
</style>
