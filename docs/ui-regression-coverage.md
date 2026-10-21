# Browser regression scope

The suite in `tests/ui` mounts production `App.vue` / `CompactApp.vue` with deterministic Tauri IPC and asset fixtures. Run `npm run test:ui`; CI publishes the HTML report, screenshots, traces for failures, and generated PNGs. Passing is evidence for these scenarios, not exhaustive all-state acceptance.

| Area | Scenarios |
| --- | --- |
| Current role | loaded/empty/pending/error with retained records, retry, rank/trend expansion, notes cancel/save, anonymous recent-share counts and PNG |
| Player workspace | detail drill into player, recent/statistics, back/forward |
| Search | landing, name candidates, no match, service error, direct Riot ID, pending A replaced by B, favourite/history |
| Statistics | queue choice/no samples, date and depth change, champion search/empty/drill/return, data-filter panel |
| Detail | six augments, stress/normal names, aligned columns, nested horizontal scrolling, vertical reach, share focus/Tab/Escape, full-width export |
| Realtime | disconnected/idle/pending/error/retry, supported and unsupported champ select, phase transitions, partial player failures, expansion/drill/return |
| Compact | empty/loaded/partial error, stale snapshot rejection, narrow widths, pin error/hide, no duplicate history queries |
| Tools | iframe host fixture, ranking drag/save/cancel/clear-cancel/PNG, designer save/delete-cancel/PNG, friends filtering/sort/favourite/states/polling, quick-tool simulated IPC |
| Settings | persistence, clamps, mobile share toggle, extra card height, startup-size simulated IPC, focus/Tab/Escape/close/reopen, bounded-height scrolling |
| Export lifecycle | async canvas completion after leave/reenter must not write stale clipboard data |

Default (1363×836) and narrow (1040×680) main windows are exercised; detail additionally uses 1920×1080, compact 360/460 widths. Individual edge-state tests need not repeat every width. Inspect screenshots as well as assertions before declaring layout accepted.

## Explicit exclusions

- Real LOL client connectivity, API correctness, accounts, actual matchmaking/champ select, and permissions.
- Native Windows clipboard, window focus/pin/hide/size and actual cross-window event transport. The compact event test sends snapshots within its browser context; it is not an integration test of Tauri `emitTo`.
- Third-party ARAMKit content/network availability; the iframe is intercepted. No third-party mutation is performed.
- Release publication, installation, auto-update/download acceptance, and arbitrary data combinations beyond the fixture matrix.
- A test fixture is not production user data. Screenshots are labeled simulated and are not performance benchmarks.
