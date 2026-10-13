<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { Sparkles, RefreshCw, Clock3 } from 'lucide-vue-next'
import { loadChampionChoices } from '../api'
import { createChoiceMonitor } from '../choiceMonitor'
import type { ChampionChoiceSnapshot, LiveGameResponse, ChampionSummaryItem } from '../types'
import { championChoices } from '../hexInsights'
import { choiceStatus } from '../choiceStatus'
import { championName } from '../utils'
import DataStatus from './DataStatus.vue'
import ChampionAvatar from './ChampionAvatar.vue'
const props = withDefaults(defineProps<{game:LiveGameResponse|null;champions:Record<number,ChampionSummaryItem>;phase?:string|null;enabled?:boolean}>(),{enabled:true})
const status = computed(() => choiceStatus(props.game,props.phase))
const me = computed(() => props.game?.teams.flatMap(t=>t.players).find(p=>p.puuid.toLowerCase()===props.game?.observerPuuid?.toLowerCase()))
const choice = ref<ChampionChoiceSnapshot|null>(null), choiceError = ref('')
const scope = () => [props.enabled,props.phase,props.game?.sgpServerId,props.game?.observerPuuid,props.game?.gameId,props.game?.phase,props.game?.queueId].join(':')
const monitor = createChoiceMonitor(loadChampionChoices,scope,(value,error)=>{
  choice.value = value && value.sgpServerId===props.game?.sgpServerId && value.observerPuuid.toLowerCase()===props.game?.observerPuuid?.toLowerCase() ? value : null
  choiceError.value = error
})
let timer:ReturnType<typeof setInterval>|undefined
watch(scope,()=>{
  monitor.stop(); if(timer) clearInterval(timer); choice.value=null; choiceError.value=''
  if(status.value.active && props.enabled) { monitor.start(); void monitor.tick(); timer=setInterval(()=>void monitor.tick(),3000) }
},{immediate:true})
onBeforeUnmount(()=>{monitor.stop();if(timer)clearInterval(timer)})
const rows = computed(()=>championChoices(me.value?.stats?.recentGames||[],choice.value?.championId||0,choice.value?.benchChampionIds))
</script>
<template>
  <section class="choice-panel" aria-label="海克斯选人助手">
    <header class="choice-header"><div class="choice-heading"><span class="choice-symbol"><Sparkles :size="21"/></span><div><h3>海克斯选人助手</h3><p>我的英雄表现 · 当前选择与可换英雄</p></div></div><span class="choice-state" :class="{active:status.active}"><i/>{{status.title}}</span></header>
    <p v-if="!status.active" class="choice-description">{{status.detail}}</p>
    <div v-if="!status.active" class="choice-empty"><Clock3 :size="18"/><span>无需单独开启。识别到支持的选人模式后自动展示。</span></div>
    <template v-else>
      <div v-if="choiceError" class="choice-warning" role="alert">{{choiceError}}<button @click="monitor.tick()"><RefreshCw :size="13"/>重试席位读取</button></div>
      <p v-else-if="!choice" class="choice-empty">正在读取当前选择与板凳席；尚无可用快照。</p>
      <p v-if="!me" class="choice-warning">当前账号尚未与名单匹配，暂不展示个人统计。</p>
      <template v-else>
        <p v-if="!me.stats" class="choice-description">{{me.error?'个人战绩获取失败，可通过页面刷新重试':'个人战绩加载中，英雄名单先展示…'}}</p>
        <p v-if="me.stats?.dataStatus?.stale || me.stats?.dataStatus?.partial" class="choice-warning">{{me.stats.dataStatus.stale ? '当前使用旧缓存' : '样本可能不完整'}}，仅供参考。</p>
        <div class="choice-grid"><article v-for="row in rows" :key="row.id" class="choice-card" :class="{selected:row.current}">
          <div class="choice-card-top"><ChampionAvatar :champion-id="row.id" :champions="champions" :size="40"/><div><b>{{championName(champions,row.id)}}</b><span>{{row.current?'当前选择':'可换英雄'}}</span></div></div>
          <div class="choice-metric"><strong>{{!me.stats || !row.summary.count?'—':Math.round(row.summary.winRate!*100)+'%'}}</strong><span>{{me.stats?row.summary.count+' 场有效样本':'等待战绩'}}</span></div>
          <div class="choice-results" v-if="me.stats"><span v-for="(win,index) in row.recent" :key="index" :class="{win}">{{win?'胜':'负'}}</span><small v-if="!row.recent.length">暂无近期记录</small></div>
          <small>{{!me.stats?'尚不能判断':row.summary.count<5?'样本不足，仅供参考':'仅个人已加载样本'}}</small>
        </article></div>
        <p v-if="choice && !rows.length" class="choice-empty">客户端尚未提供可识别的英雄，选定后自动更新。</p>
        <p v-if="choice?.benchChampionIds==null" class="choice-description">板凳席暂不可用：可能尚未开放，或客户端未提供字段。</p>
        <p v-else-if="!choice.benchChampionIds.length" class="choice-description">当前没有可换英雄。</p>
      </template>
    </template>
    <details class="choice-help"><summary>数据口径与读取状态</summary><p>{{status.detail}} 只读，不自动换英雄；不代表全服英雄强度。</p><DataStatus v-if="me?.stats" :stats="me.stats" compact /></details>
  </section>
</template>
<style scoped>
.choice-panel{padding:20px;border:1px solid #d3e1d9;border-radius:16px;margin:14px 0 20px;background:linear-gradient(120deg,#f1f8f3,#fff 65%);box-shadow:0 5px 18px #214e3710;color:#304d40}.choice-header{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.choice-heading{display:flex;align-items:center;gap:12px}.choice-symbol{display:grid;place-items:center;width:44px;height:44px;background:#e0eee4;border:1px solid #cbded0;border-radius:12px;color:#3c7b5b}.choice-heading h3{font-size:17px;margin:0 0 4px;letter-spacing:.02em}.choice-heading p{font-size:11px;color:#77877b;margin:0}.choice-state{display:flex;align-items:center;gap:6px;font-size:11px;background:#edf1ee;color:#78867c;padding:6px 10px;border-radius:20px}.choice-state.active{color:#357355;background:#e6f2e9}.choice-state i{width:6px;height:6px;border-radius:50%;background:currentColor}.choice-description{font-size:12px;color:#718477;line-height:1.7;margin:12px 0}.choice-empty{display:flex;align-items:center;gap:10px;padding:15px;border:1px dashed #ccdbd0;border-radius:10px;color:#7a8d80;font-size:12px;line-height:1.7;background:#f7faf7}.choice-warning{font-size:12px;color:#a56f36;background:#fff6e8;border-radius:9px;padding:12px;line-height:1.6}.choice-warning button{display:inline-flex;align-items:center;gap:5px;margin-left:12px;background:white;border:1px solid #ddc9aa;border-radius:5px;color:inherit;padding:4px 8px;cursor:pointer}.choice-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:14px}.choice-card{min-width:0;padding:14px;border:1px solid #dce5df;border-radius:12px;background:#fff}.choice-card.selected{border-color:#8cbba0;box-shadow:inset 0 3px #549271;background:#fafffb}.choice-card-top{display:flex;align-items:center;gap:10px}.choice-card-top b{font-size:14px;overflow-wrap:anywhere}.choice-card-top span{display:block;margin-top:4px;color:#7e9385;font-size:10px}.choice-metric{display:flex;align-items:baseline;gap:8px;margin:16px 0 9px}.choice-metric strong{font-size:26px;letter-spacing:-.03em;color:#316c50;font-variant-numeric:tabular-nums}.choice-metric span{font-size:10px;color:#859587}.choice-results{display:flex;gap:4px;min-height:24px;margin:8px 0}.choice-results>span{display:grid;place-items:center;width:23px;height:23px;border-radius:5px;background:#f5e8e5;color:#ad7568;font-size:10px}.choice-results>span.win{background:#e4f2e7;color:#4c8761}.choice-card>small,.choice-results small{font-size:10px;color:#8c9a8e}.choice-panel footer{font-size:10px;line-height:1.7;color:#8b998e;border-top:1px solid #e3eae5;margin-top:16px;padding-top:12px}
.choice-panel{padding:0 0 12px;margin:0;border:0;border-bottom:1px solid #d3e1d9;border-radius:0;box-shadow:none;background:none}.choice-symbol{width:28px;height:28px;background:none;border:0}.choice-heading{gap:5px}.choice-heading h3{font-size:14px;margin:0}.choice-heading p{display:none}.choice-state{font-size:10px;padding:3px 7px}.choice-grid{display:flex;gap:0;overflow-x:auto;margin:10px 0 4px;padding-bottom:5px}.choice-card{flex:0 0 154px;border:0;border-right:1px solid #dbe5df;border-radius:0;padding:8px 12px;background:none}.choice-card.selected{border:0;border-right:1px solid #b4d1be;box-shadow:none;background:#eaf3ec}.choice-card-top{gap:7px}.choice-card-top b{font-size:12px}.choice-card-top span{font-size:9px}.choice-metric{margin:8px 0 5px;gap:6px}.choice-metric strong{font-size:23px}.choice-results{margin:4px 0;min-height:18px}.choice-results>span{width:18px;height:18px;font-size:9px}.choice-card>small{font-size:9px}.choice-help{font-size:10px;color:#839287;margin-top:5px}.choice-help summary{cursor:pointer}.choice-help p{line-height:1.7}.choice-description{margin:6px 0;font-size:11px}
</style>
