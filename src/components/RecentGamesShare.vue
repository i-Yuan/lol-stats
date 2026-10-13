<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PlayerStatsResponse, ChampionSummaryItem, GameAssetBundle, RecentGame } from '../types'
import { recentShareRows } from '../recentInsights'
import { riotId } from '../utils'
import { copyElementAsPng } from '../imageShare'
import {loadAssetDataUrl} from '../assetLoader'
import GameRecordList from './GameRecordList.vue'
import { notifyKey } from '../notifications'
const props=defineProps<{stats:PlayerStatsResponse;champions:Record<number,ChampionSummaryItem>;gameAssets:GameAssetBundle;visibleGames?:RecentGame[]}>()
const opened=ref(false),busy=ref(false),count=ref(5),showName=ref(false)
const card=ref<HTMLElement|null>(null)
const notify=inject(notifyKey,()=>0)
// Freeze the dataset when opening: background loading cannot change the preview during export.
const snapshot=ref<PlayerStatsResponse|null>(null)
const rows=computed(()=>recentShareRows(snapshot.value?.recentGames||[],count.value))
const listGames=computed(()=>rows.value.map(row=>(snapshot.value?.recentGames||[]).find(game=>game.gameId===row.gameId)!).filter(Boolean))
const frozenAssets=ref<GameAssetBundle>({items:[],augments:[],perks:[],summonerSpells:[]})
const frozenChampions=ref<Record<number,ChampionSummaryItem>>({})
onBeforeUnmount(()=>{opened.value=false;snapshot.value=null})
const wins=computed(()=>rows.value.filter(g=>g.win).length)
const status=computed(()=>snapshot.value?.dataStatus)
const sourceLabel=computed(()=> !status.value ? '数据状态未知' : status.value.stale ? '旧缓存，刷新未成功' : status.value.partial ? '部分返回，样本不完整' : ({sgp:'国服服务',lcu:'客户端',cache:'本地缓存','network-cache':'网络 + 缓存'} as Record<string,string>)[status.value.source]||'来源未知')
watch([()=>props.stats.summoner.puuid,()=>props.stats.dataStatus?.sgpServerId],()=>{opened.value=false;snapshot.value=null;showName.value=false})
function open(){if(busy.value)return;snapshot.value=JSON.parse(JSON.stringify({...props.stats,recentGames:props.visibleGames??props.stats.recentGames}));frozenAssets.value=JSON.parse(JSON.stringify(props.gameAssets));frozenChampions.value=JSON.parse(JSON.stringify(props.champions));showName.value=false;opened.value=true}
function date(n?:number|null){return n?new Date(n).toLocaleString('zh-CN',{hour12:false}):'未知'}
async function prepareIcons(){
 const assets=frozenAssets.value
 const byId=(entries:GameAssetBundle['items'],id:number)=>entries.find(a=>a.id===id)?.iconPath
 const paths=listGames.value.flatMap(g=>[frozenChampions.value[g.championId]?.squarePortraitPath,
  ...g.itemIds.map(id=>byId(assets.items,id)),...g.perkIds.map(id=>byId(assets.perks,id)),
  byId(assets.summonerSpells,g.spell1Id),byId(assets.summonerSpells,g.spell2Id)])
 await Promise.allSettled([...new Set(paths.filter((p):p is string=>Boolean(p)))].map(loadAssetDataUrl))
}
async function copy(){
  if(busy.value||!rows.value.length)return
  busy.value=true
  try{await prepareIcons();await nextTick();if(!card.value)throw new Error('预览已关闭');const captured=snapshot.value;await copyElementAsPng(card.value,{shouldWrite:()=>opened.value&&snapshot.value===captured});notify({kind:'success',title:'最近对局图片已复制',message:'可粘贴到聊天窗口，由你选择发送给谁'})}
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
          <GameRecordList :games="listGames" :champions="frozenChampions" :game-assets="frozenAssets" disable-detail />
          <footer>lol-stats · 按对局时间排序，沿用有效样本口径<br />沿用当前列表筛选，仅描述当前样本；不代表完整战绩或水平评定。</footer>
        </article>
      </div>
    </section>
  </div>
</template>
<style scoped>
.recent-share{margin:12px 0}.open-share{display:inline-flex;align-items:center;padding:9px 14px;border:1px solid #c1d8ca;border-radius:8px;background:#edf6ef;color:#356e51;font-size:12px;font-weight:600;cursor:pointer}.open-share:hover{background:#e1efe5}.share-preview{padding:18px;border:1px solid #cdded2;border-radius:14px;margin:12px 0;background:#eff5f0;box-shadow:0 4px 16px #284b3310}header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:12px;color:#52715d}header label{display:flex;align-items:center;gap:7px}header select,header button{padding:7px 11px;border:1px solid #cadbce;border-radius:7px;background:#fff;color:#406b4e;cursor:pointer}header button:first-of-type{background:#3d7857;color:white;border-color:#3d7857}button:disabled{opacity:.5;cursor:not-allowed}.share-preview>p{font-size:12px;color:#768a7b;line-height:1.7}.preview-scroll{overflow:auto;max-height:620px;border-radius:10px;border:1px solid #d9e4dc;background:#fff}.share-card{box-sizing:border-box;width:1320px;padding:28px;background:#f6faf9;color:#284b3d;font-family:Inter,"Microsoft YaHei UI","Microsoft YaHei",sans-serif}.card-title{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}.card-title>strong{font-size:25px;overflow-wrap:anywhere}.meta,small,footer{font-size:12px;color:#63756c;line-height:1.7}footer{margin-top:18px;padding-top:12px;border-top:1px solid #dce7df}.share-card :deep(.record-list){overflow:visible}.share-card :deep(.record-row){cursor:default}button:focus-visible,select:focus-visible{outline:2px solid #3d7857;outline-offset:2px}
</style>
