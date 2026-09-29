import { ref } from "vue"
import { invoke } from "@tauri-apps/api/core"
import type { PlayerNote } from "./types"

export const playerNotes = ref<PlayerNote[]>([])
export const notesError = ref("")
export const notesReady = ref(false)
let loading: Promise<void> | undefined

export function noteKey(server: string, puuid: string) {
  return server.trim().toUpperCase() + ":" + puuid.trim().toLowerCase()
}

export function findPlayerNote(server: string, puuid: string) {
  return playerNotes.value.find(n => noteKey(n.sgpServerId, n.puuid) === noteKey(server, puuid))
}

export async function loadPlayerNotes() {
  if (notesReady.value) return
  if (loading) return loading
  loading = (async () => {
    try {
      playerNotes.value = await invoke<PlayerNote[]>("list_player_notes")
      notesReady.value = true
      notesError.value = ""
    } catch (error) {
      notesError.value = "玩家备注读取失败：" + String(error)
    } finally {
      loading = undefined
    }
  })()
  return loading
}

export async function savePlayerNote(entry: PlayerNote) {
  const saved = await invoke<PlayerNote>("save_player_note", { entry })
  const key = noteKey(saved.sgpServerId, saved.puuid)
  playerNotes.value = [saved, ...playerNotes.value.filter(n => noteKey(n.sgpServerId, n.puuid) !== key)]
  return saved
}

export async function deletePlayerNote(entry: PlayerNote) {
  await invoke("delete_player_note", { sgpServerId: entry.sgpServerId, puuid: entry.puuid })
  const key = noteKey(entry.sgpServerId, entry.puuid)
  playerNotes.value = playerNotes.value.filter(n => noteKey(n.sgpServerId, n.puuid) !== key)
}
