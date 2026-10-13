import type { ChampionSummaryItem, LiveGameResponse, PlayerNote } from './types'
import { orderedGames, summarizeWindow } from './recentInsights'

export interface CompactSnapshot {
  revision: number
  phase: string | null
  status: string
  queueId?: number
  teams: { name: string; side?: string | null; players: {
    key: string; name: string; champion: string; count: number; winRate: number | null
    state: string; premade: string; note: string; tag: string; favorite: boolean; encounters: number
  }[] }[]
}
// The small window receives a display-only projection. It never starts history queries.
export function compactSnapshot(game: LiveGameResponse | null, phase: string | null,
  champions: Record<number, ChampionSummaryItem>, notes: PlayerNote[], revision: number): CompactSnapshot {
  const current = phase
  const usable = game && current === game.phase && ['ChampSelect','GameStart','InProgress','Reconnect'].includes(current || '')
  const result: CompactSnapshot = { revision, phase: current, queueId: usable ? game.queueId : undefined,
    status: !usable ? '等待当前对局名单' : game.diagnostics?.stage === 'complete' ? '沿用主窗口已加载数据' : game.diagnostics?.stage === 'interrupted' ? '同步已中断，请回主窗口刷新' : '已取得的结果会逐人补齐', teams: [] }
  if (!usable) return result
  const normalize = (s: string) => s.trim().toLowerCase()
  result.teams = game.teams.map(team => ({ name: team.name, side: team.side, players: team.players.map((p,index) => {
    const note = p.puuid && !p.isPlaceholder && game.sgpServerId ? notes.find(n => normalize(n.sgpServerId) === normalize(game.sgpServerId!) && normalize(n.puuid) === normalize(p.puuid)) : undefined
    const history = orderedGames(p.stats?.recentGames || []).filter(g => game.queueId != null && g.queueId === game.queueId).slice(0,20)
    const stats = summarizeWindow(history)
    const championId = p.championId || p.championPickIntent
    return { key: String(index), name: p.summoner?.gameName || p.summoner?.displayName || '待识别玩家',
      champion: champions[championId]?.name || (championId ? `英雄 ${championId}` : '未选英雄'),
      count: stats.count, winRate: stats.winRate, state: p.isPlaceholder ? '身份未公开' : p.error ? '数据不完整' : !p.stats ? game.diagnostics?.stage === 'interrupted' ? '等待手动刷新' : '战绩待加载' : p.stats.dataStatus?.stale ? '旧缓存' : p.stats.dataStatus?.partial ? '部分样本' : !stats.count ? '暂无同模式样本' : stats.count < 5 ? '样本较少' : '同模式近20局',
      premade: p.premade?.label || '', note: note?.note || '', tag: note?.tag || '', favorite: !!note?.favorite,
      encounters: game.encounters?.find(e => normalize(e.puuid) === normalize(p.puuid))?.previousGames || 0 }
  }) }))
  return result
}
export function positionVisible(position: {x:number;y:number}, monitors: {workArea:{position:{x:number;y:number};size:{width:number;height:number}}}[]) {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false
  return monitors.some(m => position.x >= m.workArea.position.x && position.y >= m.workArea.position.y && position.x + 100 <= m.workArea.position.x + m.workArea.size.width && position.y + 60 <= m.workArea.position.y + m.workArea.size.height)
}
