import type { RecentGame } from './types'
// Input is the backend's effective sample: PvE, <8 minutes and missing-player
// records have already been excluded. Never merge across servers or players.
export function orderedGames(games: RecentGame[]) {
  const seen = new Set<number>()
  return [...games].filter(g => Number.isSafeInteger(g.gameId) && g.gameId > 0 && Number.isFinite(g.gameCreation) && g.gameCreation > 0 && g.gameDuration >= 480)
    .sort((a, b) => b.gameCreation - a.gameCreation || b.gameId - a.gameId)
    .filter(g => { if (seen.has(g.gameId)) return false; seen.add(g.gameId); return true })
}
export function queueLabel(id: number) {
  return ({420:'单双排',440:'灵活排位',430:'匹配',400:'征召匹配',450:'大乱斗',1700:'斗魂竞技场',2400:'海克斯大乱斗'} as Record<number,string>)[id] || `队列 ${id}`
}
export function summarizeWindow(games: RecentGame[]) {
  const wins = games.filter(g => g.win).length
  const kills = games.reduce((n,g) => n + g.kills,0)
  const deaths = games.reduce((n,g) => n + g.deaths,0)
  const assists = games.reduce((n,g) => n + g.assists,0)
  const counts = new Map<number,number>()
  for (const g of games) counts.set(g.championId,(counts.get(g.championId)||0)+1)
  return { count:games.length,wins,winRate:games.length ? wins/games.length : null,
    kda:games.length ? (kills+assists)/Math.max(1,deaths) : null,
    newestAt:games[0]?.gameCreation,oldestAt:games[games.length-1]?.gameCreation,
    champions:[...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,3) }
}
export function recentTrend(games: RecentGame[], queueId: number) {
  const filtered = orderedGames(games).filter(g=>g.queueId===queueId)
  const current = summarizeWindow(filtered.slice(0,20))
  const previous = summarizeWindow(filtered.slice(20,40))
  const comparable = current.count===20 && previous.count===20
  return { current, previous, comparable,
    winRateDelta:comparable ? current.winRate!-previous.winRate! : null,
    kdaDelta:comparable ? current.kda!-previous.kda! : null }
}
// Explicit allowlist: no PUUIDs, teammates, notes, tags or auth data enter a card.
export function recentShareRows(games: RecentGame[], count: number) {
  const limit = [5,10,20].includes(count) ? count : 5
  return orderedGames(games).slice(0,limit).map(g=>({ gameId:g.gameId,championId:g.championId,
    queueId:g.queueId,win:g.win,kills:g.kills,deaths:g.deaths,assists:g.assists,
    gameCreation:g.gameCreation,gameDuration:g.gameDuration }))
}
