import { onBeforeUnmount, onDeactivated, watch, type WatchSource } from 'vue'
import { createShareGuard } from './shareGuard'

export function useShareGuard(active: () => boolean, sources: WatchSource[] = []) {
  const guard = createShareGuard(active)
  watch([active, ...sources], guard.invalidate, { flush: 'sync', deep: true })
  onDeactivated(guard.invalidate)
  onBeforeUnmount(guard.dispose)
  return guard
}
