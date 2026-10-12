import type { LiveGameResponse, PlayerNote } from './types'
const normalize=(value:string)=>value.trim().toLowerCase()
const valid=(id:string)=>/^[a-z0-9_-]{16,128}$/.test(id)&&/[^0-]/.test(id)
export function encounterNotices(game:LiveGameResponse, notes:PlayerNote[]) {
  const server=game.sgpServerId?.trim().toUpperCase()
  if(!server || !/^TENCENT_[A-Z0-9_]+$/.test(server) || server==='TENCENT_ALL')return []
  const seen=new Set<string>()
  return game.teams.flatMap(t=>t.players).flatMap(player=>{
    const id=normalize(player.puuid||'')
    if(player.isPlaceholder || !valid(id) || id===normalize(game.observerPuuid||'') || seen.has(id))return []
    seen.add(id)
    const note=notes.find(n=>n.sgpServerId.trim().toUpperCase()===server&&normalize(n.puuid)===id && (n.favorite || n.note?.trim() || n.tag?.trim()))
    const encounter=game.encounters?.find(e=>normalize(e.puuid)===id)
    if(!note&&!encounter?.previousGames)return []
    const s=player.summoner
    const label=s?.gameName&&s.tagLine?`${s.gameName}#${s.tagLine}`:s?.displayName||note?.displayName||'已识别玩家'
    return [{key:server+':'+id,label,note,encounter}]
  })
}
