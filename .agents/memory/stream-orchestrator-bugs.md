---
name: Stream orchestrator bugs (May 2026)
description: Three bugs in the radio stream AutoDJ/ResolveService/PlaylistMaterializationService and their fixes
---

## Bug 1 — Music never served (CRITICAL)

**Root cause**: `ResolveService.ts` pool query did not filter `audio_url IS NOT NULL`. Music items with no audio entered the playlist → at runtime `hasPlayableAudio = false` → channel went `between_blocks` silently for the entire music slot.

**Fix applied**:
- Added `audio_url: { [Op.not]: null }` to the Content pool query in `ResolveService.ts`.
- Added per-tipo pool size logging: `{ programaId, channelId, tipo, total, fresh, available }` at INFO level.
- Added `AutoDJService` warn log when `hasPlayableAudio = false` to surface unplayable items.

**Why:** Music uses `audio_url` directly (no background mix); without the filter, tracks with pending upload/TTS silently blocked the slot.

## Bug 2 — Content cut / queueSize always 2

**Root cause**: `tickScheduleMode` fetched only 1 upcoming item (`findOne`) → queue always `[current, pendingNext]` = 2 items. When the queue was short, the HLS client saw a 2-segment playlist and could loop the current audio.

**Fix applied**:
- Pre-fetch next `MIN_QUEUE_SIZE = 6` upcoming items with `findAll + limit 6`.
- Build `state.queue = [current, ...upcoming6]` — queue is now up to 7 items.
- Stable-case (step 7) guard: if same item is still playing AND queue is getting short, extend the tail without replacing the head.
- Extracted `itemToTrackInfo()` helper to map `PlaylistItemWithContent → TrackInfo`.
- `admin/stream/status` now exposes `queueSize`, `upNext[]`, `recentlyPlayedCount`, `recentlyPlayedIds`.

## Bug 3 — Early repetition (same titles every < 30 min)

**Root cause**: Loop section in `PlaylistMaterializationService` cycled through `block.items[loopCount % len]` with a fixed order → same tracks appeared in the same sequence every cycle.

**Fix applied**:
- Added `shuffleLoop()` helper (mulberry32 PRNG, same algorithm as ResolveService).
- Each completed cycle of `block.items` gets a new deterministic shuffle keyed on `${grade_id}-pass${passNumber}`.
- `recentlyPlayed` ring buffer added to `ChannelDJState` (last 20 items or last 60 min); updated on every real track transition (step 8).

**Why:** Per-pass reshuffle gives track variety within long blocks without requiring a large content pool.

## How to apply

- After changing content/channel associations in prod, call `/api/radio/regenerate` (or re-materialize) so the new pool gets picked up.
- To force re-mix after settings change: `POST /api/radio/force-remix-all { channel_id, tipo, force: true }`.
- Monitor `ResolveService: content pool` logs — `total: 0` means either no audio_url or no channel link.
