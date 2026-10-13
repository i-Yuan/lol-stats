<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow, availableMonitors, PhysicalPosition } from '@tauri-apps/api/window'
import { Pin, PinOff, X, ExternalLink, Swords } from 'lucide-vue-next'
import { positionVisible, type CompactSnapshot } from './compactLive'
import { phaseName } from './utils'
const snapshot = ref<CompactSnapshot | null>(null)
const error = ref(''), pinned = ref(true)
const win = getCurrentWindow()
const cleanup: UnlistenFn[] = []
let disposed = false
async function keep(promise: Promise<UnlistenFn>) { const fn = await promise; if (disposed) fn(); else cleanup.push(fn) }
async function hide() { try { await win.hide() } catch(e) { error.value = String(e) } }
async function pin() { try { await win.setAlwaysOnTop(!pinned.value); pinned.value = !pinned.value } catch { error.value = '置顶切换失败，请重试' } }
async function main() { try { await emitTo('main','compact-open-main') } catch { error.value = '无法切回主窗口' } }
onMounted(async () => {
  try {
    await keep(listen<CompactSnapshot>('compact-snapshot', event => {
      if (!snapshot.value || event.payload.revision > snapshot.value.revision) snapshot.value = event.payload
    }))
    await keep(win.onCloseRequested(event => { event.preventDefault(); void hide() }))
    await keep(win.onMoved(event => { try { localStorage.setItem('lol-stats.compact-position', JSON.stringify(event.payload)) } catch {} }))
    try {
      const raw = localStorage.getItem('lol-stats.compact-position')
      const pos = raw ? JSON.parse(raw) : null
      if (pos && positionVisible(pos, await availableMonitors())) await win.setPosition(new PhysicalPosition(pos.x,pos.y))
      else await win.center()
    } catch { await win.center() }
    if (!disposed) await emitTo('main','compact-ready')
  } catch { error.value = '小窗连接失败，请关闭后重新打开应用' }
})
onBeforeUnmount(() => { disposed = true; cleanup.forEach(fn => fn()) })
</script>
<template>
  <main class="compact-shell">
    <header class="compact-header">
      <div class="compact-brand"><Swords :size="18" /><div><h1>对局速览</h1><span>{{snapshot?.phase ? phaseName(snapshot.phase) : '等待对局'}}</span></div></div>
      <nav><button @click="pin" :title="pinned?'取消置顶':'置顶窗口'" :aria-pressed="pinned"><Pin v-if="pinned" :size="16"/><PinOff v-else :size="16"/></button><button @click="main" title="回到主窗口"><ExternalLink :size="16"/></button><button @click="hide" title="隐藏小窗"><X :size="17"/></button></nav>
    </header>
    <div class="compact-status">{{snapshot?.status || '正在连接主窗口…'}}<span v-if="snapshot?.queueId">队列 {{snapshot.queueId}}</span></div>
    <p v-if="error" class="compact-error" role="alert">{{error}}</p>
    <div class="compact-empty" v-if="!snapshot?.teams.length"><Swords :size="30"/><b>名单就绪后，在这里查看</b><p>从主窗口打开当前对局。小窗复用查询结果，不重复读取战绩。</p></div>
    <section v-for="(team,index) in snapshot?.teams" :key="index" class="compact-team">
      <h2>{{team.name}} <span>{{team.side || ''}}</span></h2>
      <article v-for="player in team.players" :key="player.key" class="compact-player">
        <div class="compact-player-heading"><div><strong>{{player.champion}}</strong><p>{{player.name}}</p></div><div class="compact-score"><b>{{player.winRate==null?'—':Math.round(player.winRate*100)+'%'}}</b><span>{{player.count}} 场 · {{player.state}}</span></div></div>
        <div class="compact-badges" v-if="player.premade || player.tag || player.favorite || player.encounters"><span v-if="player.premade">{{player.premade}}</span><span v-if="player.favorite">★ 已收藏</span><span v-if="player.tag">{{player.tag}}</span><span v-if="player.encounters">此前相遇 {{player.encounters}} 局</span></div>
        <p v-if="player.note" class="compact-note" :title="player.note">{{player.note}}</p>
      </article>
    </section>
    <footer>仅本地展示 · 不自动强刷 · 可拖动系统标题栏移动<br>普通置顶窗口，独占全屏下可能不可见</footer>
  </main>
</template>
<style>
body.compact-body{min-width:360px;min-height:300px;overflow:auto;background:#eef4f2}
.compact-shell{padding:16px;color:#263e37;font-size:13px;min-height:100vh;background:linear-gradient(145deg,#e3efe9,transparent 40%),#eef4f2}
.compact-header{display:flex;align-items:center;justify-content:space-between;gap:10px}.compact-brand{display:flex;align-items:center;gap:10px;color:#2e7d6b}.compact-brand h1{font-size:18px;margin:0 0 3px;letter-spacing:.04em}.compact-brand span{font-size:11px;color:#647b72}.compact-header nav{display:flex;gap:5px}.compact-header button{display:grid;place-items:center;width:30px;height:30px;border:1px solid #d2dfd9;border-radius:8px;background:#ffffffc9;color:#3e6255;cursor:pointer}.compact-header button:hover{background:#dcece4}.compact-header button:focus-visible{outline:2px solid #2e7d6b;outline-offset:2px}
.compact-status{display:flex;justify-content:space-between;gap:8px;margin:16px 0;color:#657b72;font-size:11px}.compact-team h2{display:flex;justify-content:space-between;font-size:13px;margin:18px 0 9px}.compact-team h2 span{font-weight:400;color:#76877f}.compact-player{padding:12px;margin-bottom:8px;border:1px solid #dbe5df;border-radius:12px;background:#fffffff0;box-shadow:0 3px 12px #244e3810}.compact-player-heading{display:flex;justify-content:space-between;gap:12px}.compact-player-heading>div{min-width:0}.compact-player-heading strong{font-size:14px}.compact-player-heading p{font-size:11px;color:#74867c;margin:4px 0;overflow-wrap:anywhere}.compact-score{text-align:right;flex-shrink:0}.compact-score b{display:block;color:#2e7d6b;font-size:19px;font-variant-numeric:tabular-nums}.compact-score span{font-size:10px;color:#7b8a81}.compact-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.compact-badges span{font-size:10px;color:#496958;padding:3px 6px;background:#edf4ee;border-radius:5px}.compact-note{margin:8px 0 0;padding-top:8px;border-top:1px dashed #dce5df;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:12px}.compact-empty{display:grid;justify-items:center;gap:14px;text-align:center;padding:50px 20px;color:#6c8377}.compact-empty p{margin:0;line-height:1.7}.compact-shell footer{font-size:10px;color:#809086;line-height:1.8;padding:18px 0 4px;text-align:center}.compact-error{color:#a64735;font-size:12px}
.compact-player{border:0;border-bottom:1px solid #d7e2db;border-radius:0;background:none;box-shadow:none;padding:9px 0;margin-bottom:0}.compact-team h2{margin:14px 0 4px;border-bottom:2px solid #b6cdc0;padding-bottom:6px}.compact-shell{padding:12px}.compact-status{margin:10px 0;font-size:10px}.compact-badges span{padding:0;background:none}.compact-note{padding:0;border:0;margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.compact-player-heading strong{font-size:13px}.compact-score b{font-size:17px}.compact-shell footer{padding:12px 0 2px}
</style>
