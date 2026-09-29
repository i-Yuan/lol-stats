<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { findPlayerNote, loadPlayerNotes, notesError, notesReady, savePlayerNote, deletePlayerNote, noteKey } from "../playerNotes"
const props = defineProps<{ server: string; puuid: string; displayName: string; compact?: boolean }>()
const saved = computed(() => findPlayerNote(props.server, props.puuid))
const identity = computed(() => noteKey(props.server, props.puuid))
const opened = ref(false)
const note = ref("")
const tag = ref("")
const favorite = ref(false)
const busy = ref(false)
const error = ref("")
const confirmingDelete = ref(false)
onMounted(() => { void loadPlayerNotes() })
watch(identity, () => { opened.value = false; confirmingDelete.value = false; error.value = "" })
function edit() {
  note.value = saved.value?.note || ""
  tag.value = saved.value?.tag || ""
  favorite.value = saved.value?.favorite || false
  error.value = ""
  confirmingDelete.value = false
  opened.value = true
}
async function save() {
  busy.value = true
  const key = identity.value
  try {
    await savePlayerNote({ sgpServerId: props.server, puuid: props.puuid, displayName: props.displayName,
      note: note.value, tag: tag.value, favorite: favorite.value, updatedAt: 0 })
    if (identity.value === key) opened.value = false
  } catch (e) { if (identity.value === key) error.value = String(e) }
  finally { busy.value = false }
}
async function remove() {
  if (!saved.value) return
  busy.value = true
  const key = identity.value
  try {
    await deletePlayerNote(saved.value)
    if (identity.value === key) opened.value = false
  } catch (e) { if (identity.value === key) error.value = String(e) }
  finally { busy.value = false }
}
</script>
<template>
  <div class="player-note" v-if="server && puuid" :class="{ compact }">
    <button type="button" :disabled="!notesReady || busy" @click.stop="edit">
      {{ saved?.favorite ? "★ 已收藏" : "☆ 收藏 / 备注" }}<span v-if="saved?.tag"> · {{ saved.tag }}</span>
    </button>
    <span class="note-preview" v-if="saved?.note" :title="saved.note">{{ saved.note }}</span>
    <span v-if="notesError" role="alert">{{ notesError }} <button @click="loadPlayerNotes">重试</button></span>
    <form v-if="opened" class="note-form" @submit.prevent="save" @click.stop>
      <strong>{{ displayName }} · {{ server }}</strong>
      <label><input type="checkbox" v-model="favorite" :disabled="busy" /> 收藏玩家</label>
      <label>标签 <input v-model="tag" maxlength="30" placeholder="例如：朋友、常玩辅助" :disabled="busy" /></label>
      <label>本地备注 <textarea v-model="note" maxlength="1000" rows="3" placeholder="仅保存在本机，改名不影响备注" :disabled="busy" /></label>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="note-actions">
        <button type="submit" :disabled="busy">{{ busy ? "保存中…" : "保存" }}</button>
        <button type="button" :disabled="busy" @click="opened = false">取消</button>
        <button v-if="saved && !confirmingDelete" type="button" :disabled="busy" @click="confirmingDelete = true">删除</button>
        <button v-if="confirmingDelete" type="button" :disabled="busy" @click="remove">确认删除收藏与备注</button>
      </div>
    </form>
  </div>
</template>
<style scoped>
.player-note { margin: 8px 0; font-size: 12px; color: #34534d; }
button { border: 1px solid #c8d8d1; border-radius: 6px; background: #f5faf8; padding: 5px 9px; cursor: pointer; color: inherit; }
button:disabled { opacity: .5; cursor: default; }
.note-preview { display: inline-block; vertical-align: middle; max-width: 330px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 8px; }
.compact .note-preview { display: block; margin: 3px 0; max-width: 100%; }
.note-form { display: grid; gap: 9px; padding: 12px; margin-top: 6px; background: #fff; border: 1px solid #c8d8d1; border-radius: 8px; }
label { display: flex; align-items: center; gap: 8px; }
input:not([type=checkbox]), textarea { flex: 1; min-width: 0; padding: 7px; border: 1px solid #c8d8d1; border-radius: 4px; font: inherit; }
.note-actions { display: flex; flex-wrap: wrap; gap: 8px; } p { color: #a54433; }
</style>
