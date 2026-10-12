<script setup lang="ts">
import { computed, onMounted } from "vue"
import type { LiveGameResponse } from "../types"
import { playerNotes, loadPlayerNotes, notesError } from "../playerNotes"
import { encounterNotices } from "../encounterNotices"
const props = defineProps<{ game: LiveGameResponse }>()
onMounted(() => { void loadPlayerNotes() })
const notices = computed(() => encounterNotices(props.game, playerNotes.value))
</script>
<template>
  <aside class="encounter-notice" aria-live="polite">
    <strong>关注与再次相遇</strong>
    <p v-if="game.encounterWarning" role="alert">{{ game.encounterWarning }}，不影响战绩展示。</p>
    <p v-if="notesError" role="alert">{{ notesError }} <button @click="loadPlayerNotes">重试</button></p>
    <p v-if="!notices.length">当前可识别名单中，暂无已标记或有历史相遇记录的玩家。</p>
    <article v-for="item in notices" :key="item.key">
      <b>{{ item.label }}</b>
      <span v-if="item.note"> · {{ item.note.favorite ? '已收藏' : '已标记' }}<template v-if="item.note.tag"> · {{ item.note.tag }}</template></span>
      <span v-if="item.encounter?.previousGames"> · 此前本机记录同场 {{ item.encounter.previousGames }} 局<template v-if="item.encounter.lastSeenAt"> · 上次记录 {{ new Date(item.encounter.lastSeenAt).toLocaleString('zh-CN') }}</template></span>
      <p v-if="item.note?.note">{{ item.note.note }}</p>
    </article>
    <small>只记录本机读取到的已进入游戏的同场；选人、收藏不计作相遇。未读取的对局不会补记，历史按登录账号隔离。</small>
  </aside>
</template>
<style scoped>
.encounter-notice { padding:14px 18px; border:1px solid #d0ded7; border-radius:12px; background:#f2f8f5; margin:12px 0; color:#315447; }
article { padding:9px 0; border-bottom:1px solid #dce5e0; } p { margin:6px 0; white-space:pre-wrap; overflow-wrap:anywhere; } small { display:block; margin-top:10px; color:#687970; } button { cursor:pointer; }
</style>
