<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { playerNotes, loadPlayerNotes, notesError, notesReady } from "../playerNotes"
import type { PlayerNote } from "../types"
import PlayerNoteEditor from "./PlayerNoteEditor.vue"
defineEmits<{ open: [entry: PlayerNote] }>()
const query = ref("")
const favoritesOnly = ref(false)
const entries = computed(() => {
  const text = query.value.trim().toLocaleLowerCase()
  return playerNotes.value.filter(n => (!favoritesOnly.value || n.favorite)
    && [n.displayName, n.note, n.tag, n.sgpServerId, n.puuid].join(" ").toLocaleLowerCase().includes(text))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt)
})
onMounted(() => { void loadPlayerNotes() })
</script>
<template>
  <section class="saved-players">
    <h3>收藏与备注</h3>
    <div class="saved-filters">
      <input v-model="query" placeholder="搜索名称、备注、标签或区服" aria-label="搜索收藏与备注" />
      <label><input type="checkbox" v-model="favoritesOnly" /> 仅收藏</label>
    </div>
    <p v-if="notesError" role="alert">{{ notesError }} <button @click="loadPlayerNotes">重试</button></p>
    <p v-else-if="!notesReady">正在读取本地备注…</p>
    <p v-else-if="!entries.length">暂无匹配记录。在玩家主页点击“收藏 / 备注”即可添加。</p>
    <article v-for="entry in entries" :key="entry.sgpServerId + ':' + entry.puuid">
      <button class="open-player" @click="$emit('open', entry)">{{ entry.displayName || entry.puuid }} ↗</button>
      <span>{{ entry.sgpServerId }}</span>
      <PlayerNoteEditor :server="entry.sgpServerId" :puuid="entry.puuid" :display-name="entry.displayName" />
    </article>
  </section>
</template>
<style scoped>
.saved-players { width: 100%; margin-top: 22px; text-align: left; }
h3 { font-size: 14px; } .saved-filters { display: flex; gap: 12px; align-items: center; }
.saved-filters > input { flex: 1; min-width: 0; padding: 8px; border: 1px solid #c8d8d1; border-radius: 6px; }
label, p, article > span { font-size: 12px; color: #64747a; }
article { padding: 10px 0; border-bottom: 1px solid #d7e5e1; }
.open-player { background: none; border: none; color: #315f58; font-weight: 700; cursor: pointer; padding: 0 10px 0 0; }
</style>
