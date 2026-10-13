import type {LiveGameResponse} from './types'
export function shouldAutoRefreshHistory(phase:string|null,game:LiveGameResponse|null,attempts:number){
 const current=phase
 if(current==='ChampSelect')return true
 if(['GameStart','InProgress','Reconnect'].includes(current||'')) {
  // Once the current in-game roster/history has returned, leave it stable.
  // Partial/failed player results are refreshed explicitly by the user.
  if(game?.phase===current)return false
  return attempts<2
 }
 return false
}
