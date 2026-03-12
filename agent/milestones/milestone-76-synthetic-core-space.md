# Milestone 76: Synthetic Core Space

**ID**: M76
**Status**: pending
**Progress**: 0% (0/3 tasks completed)
**Started**: (not yet)
**Estimated Duration**: 1 week
**Completed**: (not yet)

---

## Goal

Implement a synthetic `'core'` space in SpaceService that returns ghost internal state (mood, perception, preferences) as memory-shaped results — transparent to consumers, no new tools required.

---

## Overview

When a search includes `spaces: ['core']`, SpaceService intercepts the request before hitting Weaviate, fetches internal state from Firestore (mood, perception, etc.), formats it as memory results, and merges with real Weaviate results from any other spaces in the request.

This lets the ghost transparently retrieve its own mood/state by doing a normal memory search — no special tool, no consumer-side logic.

**Example**: `spaceService.search({ spaces: ['core', 'the_void'], query: 'mood' })` returns mood state + real memories from the_void, seamlessly merged.

---

## Context

**Problem**: The ghost's mood state is computed by REM but never retrieved at conversation time. `MoodService.getMood()` exists but nothing calls it during search/retrieval. Adding a dedicated tool would be visible to users.

**Solution**: Intercept `'core'` as a synthetic space inside SpaceService. Consumers don't need any special handling — they just include `'core'` in their spaces array.

---

## Tasks

| Task | Name | Status | Est. Hours |
|------|------|--------|-----------|
| T511 | Core space interception in SpaceService | pending | 3h |
| T512 | Mood/perception formatters | pending | 2h |
| T513 | Extensible synthetic memory registry | pending | 2h |

**Total estimated**: ~7 hours

---

## Success Criteria

- [ ] `spaces: ['core']` returns mood state as memory-shaped result
- [ ] `spaces: ['core', 'the_void']` merges synthetic + real results
- [ ] `spaces: ['the_void']` (no core) works exactly as before
- [ ] Mood result includes current state dimensions (valence, arousal, confidence, etc.)
- [ ] Adding new synthetic memory types (perception, preferences) requires only registering a formatter
- [ ] All existing SpaceService tests continue passing
