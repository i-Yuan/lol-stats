/** Each export owns a lease. Leaving/re-entering a page must not revive it. */
export function createShareGuard(isActive: () => boolean) {
  let generation = 0
  let disposed = false
  return {
    invalidate() { generation++ },
    dispose() { disposed = true; generation++ },
    capture() {
      const startedAt = generation
      return () => !disposed && isActive() && startedAt === generation
    },
  }
}
