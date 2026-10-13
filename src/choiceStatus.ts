import type { LiveGameResponse } from './types'
export function choiceStatus(game: LiveGameResponse | null, phase?: string | null) {
  const current = phase === undefined ? game?.phase : phase
  if (!current || ['None','Lobby','Matchmaking','ReadyCheck'].includes(current)) return {active:false,title:'等待进入选人',detail:'海克斯选人开始后，在这里查看当前英雄与可换英雄的个人表现。'}
  if (current !== 'ChampSelect') return {active:false,title:'选人阶段已结束',detail:'选人助手只在选英雄时更新；局内请使用轻量对局窗查看名单和备注。'}
  if (!game || game.phase !== current || game.queueId == null) return {active:false,title:'正在识别模式',detail:'等待客户端当前选人名单和队列信息，不使用上一局数据。'}
  if (game.queueId !== 2400) return {active:false,title:'当前模式尚未支持',detail:`客户端队列 ID：${game.queueId}。目前仅支持海克斯队列 2400；其他变体不会混入统计。`}
  return {active:true,title:'海克斯选人中',detail:'只看你的同模式有效样本；当前选择与板凳席每三秒更新。'}
}
