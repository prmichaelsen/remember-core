# Milestone 19: Trust Level Redesign

**Status**: not_started
**Estimated Duration**: 1 week
**Tasks**: 5 (task-98 through task-102)
**Started**: —
**Completed**: —

---

## Goal

Redesign the trust system to be intuitive, discrete, and aligned with industry classification standards. Three changes:

1. **Invert semantics**: Higher value = more confidential (currently backwards)
2. **Integer scale**: Replace float 0–1 with integer 1–5
3. **Named labels**: Public, Internal, Confidential, Restricted, Secret

Additionally:
- Remove the `trust=1.0` existence-only special case (no longer needed after inversion)
- Drop escalation penalty (-0.1), keep block-after-3 (penalty was cosmetic, never persisted)

## Background

The current trust system uses float 0–1 where higher = more open. This is counterintuitive — "trust level 1" should mean "requires maximum trust," not "fully public." The system also pretends to be continuous but is effectively 5 discrete tiers with hard cutoffs. Intermediate float values are meaningless.

See: `agent/drafts/trust-level-thoughts.md` for full analysis including industry research (ISO 27001, NIST FIPS 199, U.S. government classification).

## Trust Levels (New)

| Level | Label | Who Can Access | Old Float Equivalent |
|-------|-------|---------------|---------------------|
| 1 | **Public** | Anyone, including strangers | was 1.0 (open) |
| 2 | **Internal** | Friends, known users | was 0.75 |
| 3 | **Confidential** | Trusted friends only | was 0.5 |
| 4 | **Restricted** | Close/intimate contacts only | was 0.25 |
| 5 | **Secret** | Owner only (or explicitly granted) | was 0.0 (private) |

Access rule (unchanged): `accessor_level >= memory_level`

## Deliverables

- `TrustLevel` type/enum with integer values 1–5 and label mappings
- Rewritten trust-enforcement, access-control, escalation services
- Weaviate data migration (float → int, inverted)
- Updated GhostConfig types (integer trust values)
- Updated tests, design docs, OpenAPI specs

## Success Criteria

- [ ] All trust comparisons use integer 1–5
- [ ] No float trust values anywhere in codebase
- [ ] Named labels exposed in API responses and types
- [ ] `trust=1.0` existence-only special case removed
- [ ] Escalation simplified to deny → deny → block (no penalty)
- [ ] Data migration script maps existing floats to integers
- [ ] All existing trust tests updated and passing
- [ ] Design docs (trust-enforcement.md, ghost-persona-system.md) updated

## Dependencies

- None (self-contained refactor of existing trust system)

## Risks

- **Data migration**: Intermediate float values (e.g., 0.33) need a rounding strategy
- **Breaking change**: Consumers using raw float trust values will need updates
- **Weaviate schema**: Changing field type may require collection recreation vs in-place update

## Related Documents

- Draft: `agent/drafts/trust-level-thoughts.md`
- Design: `agent/design/trust-enforcement.md`
- Design: `agent/design/ghost-persona-system.md`
- Design: `agent/design/access-control-result.md`
