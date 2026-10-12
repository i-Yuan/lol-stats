import type { RecentGame } from './types'
import { orderedGames, summarizeWindow } from './recentInsights'
export function championChoices(games: RecentGame[], current: number, bench: number[] | null | undefined) {
  const history=orderedGames(games).filter(g=>g.queueId===2400)
  return [...new Set([current,...(bench||[])])].filter(id=>Number.isSafeInteger(id)&&id>0).map(id=>{
    const all=history.filter(g=>g.championId===id)
    return {id,current:id===current,summary:summarizeWindow(all),recent:all.slice(0,5).map(g=>g.win)}
  })
}
export function plainDescription(value: string) {
  return value.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
}
// Deliberately excludes identities, notes, team rosters and credentials.
export function buildSnapshot(game: RecentGame) {
  return {gameId:game.gameId,championId:game.championId,queueId:game.queueId,gameCreation:game.gameCreation,
    win:game.win,kills:game.kills,deaths:game.deaths,assists:game.assists,
    itemIds:[...game.itemIds],augmentIds:[...new Set(game.augmentIds.filter(id=>id>0))]}
}
