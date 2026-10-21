import type { FriendToolEntry } from '../../src/types'
const friends: FriendToolEntry[] = [
 {id:'friend-1',puuid:'friend-1',gameName:'峡谷好友',tagLine:'一区',displayName:'峡谷好友#一区',iconId:1,summonerId:2,availability:'chat',statusMessage:'一起玩极地大乱斗',friendsSince:'2024-01-01T00:00:00Z'},
 {id:'friend-2',puuid:'friend-2',gameName:'很长很长的好友名称用于省略显示验证',tagLine:'二区',displayName:'很长很长的好友名称用于省略显示验证#二区',iconId:1,summonerId:3,availability:'offline',statusMessage:'离线',friendsSince:'2025-06-01T00:00:00Z'},
]
export function toolsIPC(cmd: string, payload: any): {handled:boolean;value?:unknown} {
 const w=window as any
 const mode=w.__toolsMode || new URLSearchParams(location.search).get('tools') || 'loaded'
 const commands=['load_friends','get_game_settings_locked','get_chat_status','set_game_settings_locked','set_chat_availability','set_chat_status_message','dismiss_end_of_game','plugin:opener|open_url','send_alt_left_shortcut']
 if(!commands.includes(cmd))return {handled:false}
 ;(w.__toolCalls ||= []).push({cmd,payload})
 let value:unknown
 if(cmd==='load_friends')value=mode==='empty'?[]:new URLSearchParams(location.search).has('manyFriends')?Array.from({length:6},(_,i)=>({...friends[i%2],id:`friend-${i+1}`,puuid:`friend-${i+1}`,displayName:`好友${i+1}`})):friends
 if(cmd==='get_game_settings_locked')value=false
 if(cmd==='get_chat_status')value={availability:'chat',statusMessage:'模拟签名'}
 if(cmd==='set_game_settings_locked')value=payload.locked
 if(mode==='error')return {handled:true,value:Promise.reject(new Error('模拟客户端工具读取失败'))}
 if(mode==='loading')return {handled:true,value:new Promise(resolve=>setTimeout(()=>resolve(value),1800))}
 return {handled:true,value}
}
