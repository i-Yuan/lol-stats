<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue'
import type { PlayerStatsResponse, ChampionSummaryItem } from '../types'
import { recentShareRows, queueLabel } from '../recentInsights'
import { championName, riotId } from '../utils'
import { copyElementAsPng } from '../imageShare'
import { notifyKey } from '../notifications'
const props=defineProps<{stats:PlayerStatsResponse;champions:Record<number,ChampionSummaryItem>}>()
const opened=ref(false),busy=ref(false),count=ref(5),showName=ref(false)
const card=ref<HTMLElement|null>(null)
const notify=inject(notifyKey,()=>0)
// Freeze the dataset when opening: background loading cannot change the preview during export.
const snapshot=ref<PlayerStatsResponse|null>(null)
const rows=computed(()=>recentShareRows(snapshot.value?.recentGames||[],count.value))
const wins=computed(()=>rows.value.filter(g=>g.win).length)
const status=computed(()=>snapshot.value?.dataStatus)
const sourceLabel=computed(()=> !status.value ? '数据状态未知' : status.value.stale ? '旧缓存，刷新未成功' : status.value.partial ? '部分返回，样本不完整' : ({sgp:'国服服务',lcu:'客户端',cache:'本地缓存','network-cache':'网络 + 缓存'} as Record<string,string>)[status.value.source]||'来源未知')
watch([()=>props.stats.summoner.puuid,()=>props.stats.dataStatus?.sgpServerId],()=>{opened.value=false;snapshot.value=null;showName.value=false})
function open(){if(busy.value)return;snapshot.value=JSON.parse(JSON.stringify(props.stats));showName.value=false;opened.value=true}
function date(n?:number|null){return n?new Date(n).toLocaleString('zh-CN',{hour12:false}):'未知'}
async function copy(){
  if(busy.value||!rows.value.length)return
  busy.value=true
  try{await nextTick();if(!card.value)throw new Error('预览已关闭');const captured=snapshot.value;await copyElementAsPng(card.value,{shouldWrite:()=>opened.value&&snapshot.value===captured});notify({kind:'success',title:'最近对局图片已复制',message:'可粘贴到聊天窗口，由你选择发送给谁'})}
  catch(e){notify({kind:'error',title:'分享图片生成失败',message:String(e)})}
  finally{busy.value=false}
}
</script>
<template>
  <div class="recent-share">
    <button class="open-share" @click="open" :disabled="busy||!stats.recentGames.length">分享最近对局</button>
    <section v-if="opened && snapshot" class="share-preview" aria-label="最近对局分享预览">
      <header>
        <label>局数 <select v-model.number="count" :disabled="busy"><option :value="5">5</option><option :value="10">10</option><option :value="20">20</option></select></label>
        <label><input type="checkbox" v-model="showName" :disabled="busy" />显示玩家名称</label>
        <button @click="copy" :disabled="busy||!rows.length">{{busy?'生成中…':'复制图片'}}</button>
        <button @click="opened=false" :disabled="busy">关闭</button>
      </header>
      <p>仅本地生成，不自动上传或发送；默认匿名，不含备注、标签、PUUID 或其他玩家身份。复制后可在聊天软件中粘贴或保存。</p>
      <div class="preview-scroll">
        <article ref="card" class="share-card">
          <div class="card-title"><span>LOL · 最近对局</span><strong>{{showName?riotId(snapshot.summoner):'玩家战绩'}}</strong></div>
          <p>当前已取得样本中最近 {{rows.length}} 局 · {{wins}} 胜 {{rows.length-wins}} 负 <span v-if="rows.length">· {{Math.round(wins/rows.length*100)}}% 胜率</span></p>
          <p class="meta">{{status?.sgpServerId||'区服未知'}} · {{sourceLabel}}<template v-if="status?.stale&&status?.partial"> · 样本不完整</template><br />最近成功更新：{{date(status?.lastSuccessAt)}}</p>
          <p class="meta">日期范围：{{date(rows[rows.length-1]?.gameCreation)}} 至 {{date(rows[0]?.gameCreation)}}</p>
          <div class="game-row" v-for="g in rows" :key="g.gameId">
            <b :class="g.win?'win':'loss'">{{g.win?'胜':'负'}}</b><div><strong>{{championName(champions,g.championId)}}</strong><small>{{queueLabel(g.queueId)}} · {{date(g.gameCreation)}}</small></div><span>{{g.kills}} / {{g.deaths}} / {{g.assists}}<small>{{Math.floor(g.gameDuration/60)}} 分钟</small></span>
          </div>
          <footer>lol-stats · 按对局时间排序，沿用有效样本口径<br />混合队列汇总，仅描述当前样本；不代表完整战绩或水平评定。</footer>
        </article>
      </div>
    </section>
  </div>
</template>
<style scoped>
button,select{padding:7px 11px;border:1px solid #bdcec5;border-radius:7px;background:white;color:#315a47;cursor:pointer}button:disabled{opacity:.55;cursor:default}.share-preview{padding:15px;border:1px solid #c9d9d0;border-radius:10px;margin:10px 0;background:#eef4f0}header{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.share-preview>p{font-size:12px;color:#65766c}.preview-scroll{overflow:auto;max-height:620px}.share-card{box-sizing:border-box;width:640px;padding:28px;background:#f6faf9;color:#284b3d;font-family:Arial,"Microsoft YaHei",sans-serif}.card-title{display:flex;flex-direction:column;gap:8px}.card-title>strong{font-size:25px;overflow-wrap:anywhere}.meta,small,footer{font-size:12px;color:#63756c;line-height:1.7}.game-row{display:grid;grid-template-columns:28px 1fr 120px;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #dae4df}.game-row small{display:block}.game-row>span{text-align:right}.win{color:#247651}.loss{color:#ae5050}footer{margin-top:18px}
</style>
