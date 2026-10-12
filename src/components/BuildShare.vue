<script setup lang="ts">
import {computed,inject,nextTick,onBeforeUnmount,ref,watch} from 'vue'
import type {RecentGame,GameAssetBundle,ChampionSummaryItem} from '../types'
import {buildSnapshot} from '../hexInsights'
import {championName} from '../utils'
import {copyElementAsPng} from '../imageShare'
import {notifyKey} from '../notifications'
const props=defineProps<{game:RecentGame;assets:GameAssetBundle;champions:Record<number,ChampionSummaryItem>;server?:string;identity?:string}>()
type CardSnapshot = ReturnType<typeof buildSnapshot> & { championLabel: string; itemLabels: string[]; augmentLabels: string[] }
const snapshot=ref<CardSnapshot|null>(null),busy=ref(false),card=ref<HTMLElement|null>(null)
const notify=inject(notifyKey,()=>0)
const items=computed(()=>new Map(props.assets.items.map(a=>[a.id,a.name])))
const augments=computed(()=>new Map(props.assets.augments.map(a=>[a.id,a.name])))
watch([()=>props.game.gameId,()=>props.game.championId,()=>props.server,()=>props.identity],()=>{snapshot.value=null})
onBeforeUnmount(()=>{snapshot.value=null})
function open(){
 if(busy.value)return
 const game=buildSnapshot(props.game)
 snapshot.value={...game,championLabel:championName(props.champions,game.championId),
  itemLabels:game.itemIds.filter(id=>id>0).map(id=>items.value.get(id)||`装备 ${id}`),
  augmentLabels:game.augmentIds.map(id=>augments.value.get(id)||`强化 ${id}`)}
}
async function copy(){
 if(busy.value||!snapshot.value)return
 const captured=snapshot.value;busy.value=true
 try{await nextTick();if(!card.value||snapshot.value!==captured)throw new Error('预览已失效');await copyElementAsPng(card.value,{shouldWrite:()=>snapshot.value===captured});notify({kind:'success',title:'构筑图片已复制',message:'匿名卡片，可自行粘贴分享'})}
 catch(e){notify({kind:'error',title:'构筑图片生成失败',message:String(e)})}finally{busy.value=false}
}
</script>
<template>
 <div class="build-share" @click.stop @keydown.stop>
  <button @click="open" :disabled="busy">分享此构筑</button>
  <section v-if="snapshot" class="build-preview">
   <p>仅导出此英雄的装备和强化，不含玩家名称、备注或队友信息。</p>
   <button @click="copy" :disabled="busy">{{busy?'生成中…':'复制图片'}}</button><button @click="snapshot=null">关闭</button>
   <div class="scroll"><article ref="card">
    <h3>{{snapshot.championLabel}} · {{snapshot.queueId===2400?'海克斯大乱斗':'对局'}}构筑</h3>
    <p>{{new Date(snapshot.gameCreation).toLocaleString('zh-CN')}} · {{snapshot.win?'胜':'负'}} · {{snapshot.kills}} / {{snapshot.deaths}} / {{snapshot.assists}}</p>
    <strong>强化</strong><p>{{snapshot.augmentLabels.join(' · ')||'未取得强化数据'}}</p>
    <strong>结束时装备</strong><p>{{snapshot.itemLabels.join(' · ')||'未取得装备数据'}}</p>
    <small>lol-stats · 单局记录，不代表推荐顺序、购买路线或组合强度。</small>
   </article></div>
  </section>
 </div>
</template>
<style scoped>
button{padding:5px 8px;border:1px solid #b9cdc2;border-radius:6px;background:white;color:#315a47;cursor:pointer}.build-preview{position:fixed;z-index:1000;inset:10% 10%;background:#edf5f0;padding:20px;overflow:auto;box-shadow:0 10px 40px #0006;color:#315a47}.scroll{overflow:auto;margin-top:12px}article{box-sizing:border-box;width:620px;padding:28px;background:#f6faf9;color:#284b3d;white-space:normal;text-align:left}article p{line-height:1.8}small{font-size:12px}
</style>
