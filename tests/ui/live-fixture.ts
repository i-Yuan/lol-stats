import { emit } from '@tauri-apps/api/event'
import { compactSnapshot } from '../../src/compactLive'
import type { LiveGameResponse } from '../../src/types'
import { stats, champions } from './fixture'

export const isCompactFixture = new URLSearchParams(location.search).has('compact')
const state = { phase: 'None', mode: 'loaded', choiceError: false, pinError: false, queueId: 2400, disconnected: false }
const calls: {cmd:string;payload:unknown}[] = []
const pending: (()=>void)[] = []
export function liveSnapshot(): LiveGameResponse {
 const empty = state.mode === 'empty' || !['ChampSelect','InProgress','GameStart','Reconnect'].includes(state.phase)
 return {
  phase:state.phase,queryStage:state.phase==='ChampSelect'?'champ-select':'in-game',gameId:20002,queueId:state.queueId,gameMode:'ARAM',sgpServerId:'HN1',observerPuuid:'fixture-1',benchChampionIds:[1],
  diagnostics:{stage:'complete',rosterMs:5,elapsedMs:20,queueWaitMs:0,reusedPlayers:0,completedPlayers:10,totalPlayers:10,playerJobs:10,concurrencyLimit:3,slowestPlayerMs:12},
  teams:empty?[]:[100,200].map((team,t)=>({name:t?'敌方队伍':'我方队伍',side:t?'红方':'蓝方',players:Array.from({length:5},(_,i)=>{
   const puuid=t===0&&i===0?'fixture-1':`live-${team}-${i}`
   const playerStats=structuredClone(stats)
   playerStats.summoner={...playerStats.summoner,puuid,gameName:i===0?'测试玩家很长的中文名称ABCDEFGHIJK':`对局玩家${t*5+i+1}`}
   playerStats.recentGames=Array.from({length:8},(_,j)=>({...playerStats.recentGames[0],gameId:10001+j,win:j%3!==0}))
   return {puuid,championId:1,championPickIntent:1,position:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][i],selectedRole:'',summonerId:t*5+i+1,isPlaceholder:i===4&&t===1,summoner:playerStats.summoner,...(i===3&&t===1?{error:'模拟该玩家战绩暂不可用'}:i===4&&t===1?{}:{stats:playerStats})}
  })})),
 }
}
export function installLiveControls() {
 ;(window as any).__liveFixture={
  set:(next:Partial<typeof state>)=>Object.assign(state,next),calls,
  resolvePending:()=>{pending.splice(0).forEach(resolve=>resolve())},
  emitCompact:async(mode='loaded',revision=1)=>{
   const previous={...state};state.phase=mode==='empty'?'None':'InProgress';state.mode=mode==='empty'?'empty':'loaded'
   const snapshot=compactSnapshot(liveSnapshot(),state.phase,Object.fromEntries(champions.map(c=>[c.id,c])),[],revision)
   Object.assign(state,previous)
   await emit('compact-snapshot',snapshot)
  },
 }
}
export function handleLiveIPC(cmd:string,payload:any):{handled:boolean;value?:unknown} {
 if(cmd==='connection_status' && state.disconnected)return {handled:true,value:{connected:false,message:'模拟客户端未连接'}}
 if(!['load_gameflow_phase','load_live_game','load_champion_choices','cancel_stats_load','plugin:window|set_always_on_top','plugin:window|hide','plugin:window|show','plugin:window|set_focus'].includes(cmd))return {handled:false}
 calls.push({cmd,payload})
 if(cmd==='load_gameflow_phase')return {handled:true,value:state.phase}
 if(cmd==='load_champion_choices')return {handled:true,value:state.choiceError?Promise.reject(new Error('模拟板凳席读取失败')):{sgpServerId:'HN1',observerPuuid:'fixture-1',championId:1,benchChampionIds:[]}}
 if(cmd==='load_live_game'){
  if(state.mode==='error')return {handled:true,value:Promise.reject(new Error('模拟实时战绩读取失败'))}
  const snapshot=liveSnapshot()
  return {handled:true,value:state.mode==='loading'?new Promise(resolve=>pending.push(()=>resolve(snapshot))):snapshot}
 }
 if(cmd==='plugin:window|set_always_on_top'&&state.pinError)return {handled:true,value:Promise.reject(new Error('模拟置顶失败'))}
 return {handled:true}
}
