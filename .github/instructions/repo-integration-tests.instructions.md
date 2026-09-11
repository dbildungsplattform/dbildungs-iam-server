---
applyTo: 'src/**/*.repo.integration-spec.ts'
---

# Repo Integration Tests (`em.clear()`)

Whenever a file matching this pattern is added or changed in the diff, always check whether `em.clear()` is needed before an assertion, or whether an existing `em.clear()` call is unnecessary. Apply the rules from [docs/tests.md](../../docs/tests.md), section "Identity Map (`em.clear()`)":

- Flag a missing `em.clear()` only if the tested repo method uses `em.nativeDelete()`/`em.nativeUpdate()` AND the assertion reads the same, already-loaded entity by primary key (`em.findOne()`, `sut.findById()`, `sut.exists()`).
- Flag a missing `em.clear()` if the assertion relies on an `exclude`d field (e.g. a logo) being absent, but the same entity was already loaded with that field populated earlier in the test.
- Do not flag `em.clear()` as missing before `em.count()` or `em.find()` (plural) - they always query the database directly and never need it.
- Do not flag `em.clear()` as missing after `em.remove(entity).flush()` or `em.persist(entity).flush()` - the Identity Map stays in sync automatically.
- Flag an existing `em.clear()` call as unnecessary/defensive if none of the above conditions apply.
