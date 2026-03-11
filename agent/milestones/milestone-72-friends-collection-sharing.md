# Milestone 72: Friends Collection Sharing

**ID**: M72
**Status**: pending
**Progress**: 25% (1/4 tasks completed)
**Started**: 2026-03-11
**Estimated Duration**: 2-3 weeks (remember-core portion)
**Completed**: (not yet)

---

## Goal

Enable users to share memories with friends via per-user friends collections, supporting publish/retract/revise/search operations with bounded fanout and client-side ranking.

---

## Overview

Friends Collection Sharing introduces a new collection type (`Memory_friends_<user_id>`) that allows users to publish memories to all their friends. Unlike groups (multiple collections with selective targeting), friends uses a single collection per user where:

1. Users publish to their OWN friends collection
2. Friends query FROM that user's collection to see shared content
3. Access control enforced via `AuthContext.credentials.friend_user_ids`
4. Client-side ranking limits fanout to top 50 friends per query

This milestone covers the remember-core SDK portion (4 tasks). The agentbase.me integration (4 additional tasks) is tracked separately.

---

## Context

**Problem**: Users want to share memories with their social network (friends) without publishing to public spaces or creating per-friend groups.

**Solution**: Per-user friends collections that friends can query, with:
- Collection-level security isolation (safer than shared collection)
- Bounded fanout via client-side friend ranking
- Boolean publish model (all-or-nothing, no selective targeting)
- Backward compatible with existing spaces/groups patterns

**Design Reference**: agent/clarifications/clarification-1-friends-collection-model.md

---

## Deliverables

### remember-core SDK (This Milestone)
1. ✅ **Task 493**: Friends collection type infrastructure (COMPLETED)
   - `Memory_friends_<user_id>` collection type
   - Weaviate schema with `published_to_friends` boolean field
   - Collection registry support
   - `ensureFriendsCollection()` helper
   - Dedupe tier 3 (spaces=1, groups=2, friends=3, users=4)

2. **Task 494**: Publish/retract/revise operations
   - Extend SpaceService with `friends: boolean` support
   - Single collection writes (`Memory_friends_<my_id>`)
   - Source memory tracking (`published_to_friends: boolean`)
   - ConfirmResult API extensions

3. **Task 495**: Search support
   - Accept `friends: string[]` (client-ranked friend IDs)
   - Loop through friend collections (bounded fanout ≤50)
   - Return `friends_searched` in results
   - Extend `UserCredentials` with `friend_user_ids`

4. **Task 496**: Comprehensive test suite
   - 30+ tests covering publish/retract/revise/search
   - Validation, tracking, lifecycle flows
   - Edge cases and error handling

### agentbase.me Integration (Separate Milestone)
1. **Task 497**: Extend ACL endpoint to return `friend_user_ids`
2. **Task 498**: Implement `/api/search/friends` with client-side ranking
3. **Task 499**: UI for publishing to friends
4. **Task 500**: Friends feed view

---

## Success Criteria

- [ ] All 4 remember-core tasks completed
- [ ] 1,706+ tests passing (30+ new tests)
- [ ] No TypeScript errors
- [ ] Version bumped to 0.62.0+
- [ ] CHANGELOG.md updated
- [ ] Documentation complete (task docs, API references)
- [ ] Backward compatible (no breaking changes)

**Integration Success** (separate milestone):
- [ ] agentbase.me consumes new friends APIs
- [ ] `/api/search/friends` route implements ranking
- [ ] UI allows publishing/searching friends content
- [ ] End-to-end user flow validated

---

## Technical Approach

### Collection Model
```
User A publishes to friends:
  → writes to Memory_friends_<user_a_id>

User B (friend) searches:
  → queries FROM Memory_friends_<user_a_id>

User C (not friend):
  → blocked by AuthContext validation
```

### Security Model
- **Collection-level isolation**: Each user has ONE friends collection
- **Access control**: `AuthContext.credentials.friend_user_ids` validates friend relationships
- **Bounded queries**: Client passes max 50 friends to prevent 1000+ fanout

### Ranking Strategy
- **Client-side**: agentbase.me ranks using interaction signals (chat recency, profile views)
- **SDK-agnostic**: remember-core provides primitive operations, no ranking opinion
- **Extensible**: Different clients can implement different strategies

---

## Dependencies

### Upstream
- Task 493 (Friends Collection Type) - ✅ COMPLETED

### Downstream
- agentbase.me Tasks 497-500 (Friends UI/API integration)

### Related
- M64 (Organize Memories) - Relationship assignment may apply to friends-shared memories
- M46 (Relationship GUI) - Friends as relationship source/target

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| 1000+ friend fanout kills performance | High | Bounded fanout (client passes ≤50), client-side ranking |
| Shared collection data leakage | High | Per-user collections (collection-level isolation) |
| Friend ranking complexity | Medium | Push to client layer (agentbase.me), keep SDK simple |
| AuthContext friend validation gap | Medium | Define contract in Task 495, implement in agentbase.me |

---

## Timeline

### Week 1: Core Operations (remember-core)
- Task 494: Publish/retract/revise (4-6 hours)
- Task 495: Search support (3-4 hours)
- Task 496: Test suite (4-5 hours)
- **Total**: ~12-15 hours dev work

### Week 2-3: Integration (agentbase.me)
- Task 497-500: ACL, ranking, UI (separate milestone)

---

## Notes

- **Boolean model**: `friends: boolean` for publish (not array), all friends are implicit
- **Array model**: `friends: string[]` for search (client-ranked list)
- **Tracking**: `published_to_friends: boolean` in source memory
- **Dedupe precedence**: friends tier 3 (between groups and users)
- **Backward compatible**: Optional `friends` parameter, no breaking changes
- **Client responsibility**: Ranking and ACL enforcement in agentbase.me

---

## References

- **Clarification**: agent/clarifications/clarification-1-friends-collection-model.md
- **Tasks**: agent/tasks/milestone-72-friends-collection-sharing/
- **Design**: (none - clarification served as design doc)
- **Patterns**: Follows spaces (single collection) + groups (array search) hybrid model

---

**Created**: 2026-03-11
**Last Updated**: 2026-03-11
**Owner**: remember-core team
