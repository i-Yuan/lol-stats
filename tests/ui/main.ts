// Test-only entry: mounts the production App and mocks only native IPC/data.
// Vite's production build still uses the root index.html, never this fixture.
import { createApp } from 'vue'
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { detail, assets, champions, stats } from './fixture'
import { appResponse, ranked } from './app-fixture'
import { handleLiveIPC, installLiveControls, isCompactFixture } from './live-fixture'
import { toolsIPC } from './tools-fixture'
if(new URLSearchParams(location.search).has('normal') || new URLSearchParams(location.search).has('app')){
 const names=['珠光护手','魔法飞弹','神射法师','炼狱导管','急急小子','潘多拉的盒子']
 assets.augments.forEach((a,i)=>a.name=names[i])
}
if(isCompactFixture)mockWindows('compact','main');else mockWindows('main','compact')
installLiveControls()
let notes:any[]=[]
mockIPC((cmd, payload: any) => {
 if(cmd==='cancel_stats_load'){void appResponse(cmd,payload).catch(()=>{});return handleLiveIPC(cmd,payload).value}
 const live=handleLiveIPC(cmd,payload);if(live.handled)return live.value
 const tool=toolsIPC(cmd,payload);if(tool.handled)return tool.value
 if(cmd==='list_player_notes')return notes
 if(cmd==='save_player_note'){notes=[payload.entry,...notes.filter(n=>n.puuid!==payload.entry.puuid)];return payload.entry}
 if(cmd==='delete_player_note'){notes=notes.filter(n=>n.puuid!==payload.puuid);return}
 if(cmd==='app_version')return '' // no release-notes popup in deterministic fixture
 if(cmd==='connection_status')return {connected:true,message:'模拟客户端',summoner:stats.summoner,client:{region:'TENCENT',rsoPlatformId:'HN1'}}
 if(cmd==='load_champions')return champions
 if(cmd==='load_game_assets')return assets
 if(['load_self_stats','load_self_stats_with_progress','search_player','search_player_with_progress','search_summoner_candidates'].includes(cmd))return appResponse(cmd,payload)
 if(cmd==='cancel_stats_load')return
 if(cmd==='load_current_ranked_stats'||cmd==='load_ranked_stats')return ranked
 if(cmd==='load_match_detail')return detail
 if(cmd==='load_gameflow_phase')return 'None'
 if(cmd==='load_lcu_assets')return Object.fromEntries(payload.paths.map((p:string)=>[p,icon]))
 if(cmd==='check_app_update')return {hasUpdate:false,currentVersion:'0.7.0'}
 if(cmd==='plugin:window|inner_size')return {width:1363,height:836}
 if(cmd==='plugin:window|scale_factor')return 1
 if(cmd==='plugin:window|get_all_windows')return ['main','compact']
 if(cmd==='copy_png_to_clipboard'){(window as any).__copiedPng=payload.bytes;
 const root=document.querySelector('.overview-export') as HTMLElement|null
 ;(window as any).__exportFits=root ? [...root.querySelectorAll<HTMLElement>('.team-block')].every(t=>t.scrollWidth<=t.clientWidth+1) : false
 return}
 if(cmd.startsWith('plugin:window|'))return
 throw new Error(`Unmocked IPC: ${cmd}`)
},{shouldMockEvents:true})
const icon='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="7" fill="#36786c"/><path d="M12 34L24 10l12 24z" fill="#efd68d"/></svg>')
const App=(await import('../../src/App.vue')).default
const CompactApp=(await import('../../src/CompactApp.vue')).default
if(isCompactFixture)document.body.classList.add('compact-body')
createApp(isCompactFixture?CompactApp:App).mount('#app')
