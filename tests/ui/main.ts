// Test-only entry: mounts the production App and mocks only native IPC/data.
// Vite's production build still uses the root index.html, never this fixture.
import { createApp } from 'vue'
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { game, detail, assets, champions, stats } from './fixture'
mockWindows('main', 'compact')
mockIPC((cmd, payload: any) => {
 if(cmd==='app_version')return '' // no release-notes popup in deterministic fixture
 if(cmd==='connection_status')return {connected:true,message:'模拟客户端',summoner:stats.summoner,client:{region:'TENCENT',rsoPlatformId:'HN1'}}
 if(cmd==='load_champions')return champions
 if(cmd==='load_game_assets')return assets
 if(cmd==='load_self_stats'||cmd==='search_player'||cmd==='search_player_with_progress')return stats
 if(cmd==='load_current_ranked_stats'||cmd==='load_ranked_stats')return {queueMap:{}}
 if(cmd==='load_match_detail')return detail
 if(cmd==='load_gameflow_phase')return 'None'
 if(cmd==='load_lcu_assets')return Object.fromEntries(payload.paths.map((p:string)=>[p,icon]))
 if(cmd==='check_app_update')return {hasUpdate:false,currentVersion:'0.7.0'}
 if(cmd==='plugin:window|inner_size')return {width:1363,height:836}
 if(cmd==='plugin:window|scale_factor')return 1
 if(cmd==='plugin:window|get_all_windows')return ['main','compact']
 if(cmd==='copy_png_to_clipboard'){(window as any).__copiedPng=payload.bytes;return}
 if(cmd.startsWith('plugin:window|'))return
 throw new Error(`Unmocked IPC: ${cmd}`)
},{shouldMockEvents:true})
const icon='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="7" fill="#36786c"/><path d="M12 34L24 10l12 24z" fill="#efd68d"/></svg>')
const App=(await import('../../src/App.vue')).default
createApp(App).mount('#app')
