import { stats, game } from './fixture'
const params=new URLSearchParams(location.search)
let mode=params.get('data') || 'loaded'
const pending:Array<()=>void>=[]
const calls:Array<{cmd:string,payload:any}>=[]
const rich=structuredClone(stats)
rich.recentGames=Array.from({length:12},(_,i)=>({...game,gameId:10001+i,win:i%3!==0,queueId:i%3===0?420:2400,gameMode:i%3===0?'CLASSIC':'ARAM',augmentIds:i%3===0?[]:game.augmentIds,gameCreation:game.gameCreation-i*86400000,gameName:'测试账号'}))
rich.depthLoaded=12
rich.summary={...rich.summary,games:12,wins:8,losses:4,winRate:2/3}
rich.dataStatus={source:'sgp',lastSuccessAt:1792411200000,rawGames:12,excludedPve:0,excludedShort:0,excludedMissingPlayer:0,oldestGameAt:game.gameCreation-11*86400000,newestGameAt:game.gameCreation,warning:null,hasMore:false,partial:false,stale:false,sgpServerId:'TENCENT_HN1'}
rich.championStats=[{championId:1,games:12,wins:8,losses:4,winRate:2/3,pickRate:1,averageKda:6.2,averageKills:12,averageDeaths:5,averageAssists:19,averageDamageToChampions:40000,averageCs:130,damageShare:.33,damageConversionRate:1.4,mitigationShare:.33,healingShare:.25,goldShare:.23,lastPlayedAt:game.gameCreation}]
const empty={...rich,dataStatus:{...rich.dataStatus,rawGames:0,oldestGameAt:null,newestGameAt:null},recentGames:[],championStats:[],depthLoaded:0,summary:{...rich.summary,games:0,wins:0,losses:0,winRate:0}}
export const ranked={queueMap:Object.fromEntries(['RANKED_SOLO_5x5','RANKED_FLEX_SR'].map(queueType=>[queueType,{queueType,tier:'GOLD',division:'II',highestTier:'PLATINUM',highestDivision:'IV',previousSeasonHighestTier:'GOLD',previousSeasonHighestDivision:'I',previousSeasonEndTier:'GOLD',previousSeasonEndDivision:'II',leaguePoints:35,wins:20,losses:12,isProvisional:false}]))}
;(window as any).__appFixture={setMode:(next:string)=>mode=next,resolve:()=>pending.splice(0).forEach(fn=>fn()),calls}
export async function appResponse(cmd:string,payload:any){
 calls.push({cmd,payload})
 const current=mode
 if(current==='loading')await new Promise<void>(resolve=>pending.push(resolve))
 if(current==='error')throw new Error('模拟数据服务暂时不可用')
 if(cmd==='search_summoner_candidates')return current==='empty'?[]:[{...rich.summoner,sgpServerId:'TENCENT_HN1'}]
 if(current==='empty')return empty
 const result=structuredClone(params.has('app')?rich:stats)
 if(cmd.startsWith('search_player') && payload.query && payload.query!=='fixture-1')result.summoner={...result.summoner,gameName:payload.query.includes('#')?payload.query.split('#')[0]:'候选玩家',puuid:payload.query}
 return result
}
