---
name: repo-integration-test-em-clear
description: Decide whether a MikroORM repo integration test (*.repo.integration-spec.ts) needs an em.clear() call before an assertion, or whether an existing one is unnecessary. Use when writing, reviewing, or debugging a repo integration test whose assertion follows a delete/update operation or a query with an `exclude` option.
---

# Deciding whether a repo integration test needs `em.clear()`

MikroORM's `EntityManager` caches every loaded entity in its Identity Map. Whether a test needs `em.clear()` before an assertion depends on the combination of the **write operation** under test and the **read operation** used to verify it. There are two distinct, unrelated cases where this matters. Full background and source-code references: [docs/tests.md](../../../docs/tests.md), section "Identity Map (`em.clear()`)".

## Step 1: Look at the write operation being tested

- `em.remove(entity).flush()` and `em.persist(entity).flush()` keep the Identity Map in sync automatically. No `em.clear()` needed for these.
- `em.nativeDelete()` / `em.nativeUpdate()` bypass the Identity Map entirely - an entity loaded before the call stays cached with its old, now outdated state. Continue to Step 2.

## Step 2: Look at the read operation used in the assertion

- `em.findOne()` by primary key (and anything built on it, e.g. `sut.findById()`, `sut.exists()`) can return an already-loaded entity straight from the Identity Map without ever hitting the database.
- `em.count()` and `em.find()` (plural) have no such shortcut and always query the database directly. `em.clear()` has no effect on them - prefer these for verifying deletes/updates where possible.

**Only the combination** of a native write (Step 1) followed by a primary-key-based read of an entity that was already loaded into `em` (Step 2) can produce a false-positive assertion. Call `em.clear()` right before the read in that case.

## Step 3: `exclude` on an already-loaded entity (independent case)

`em.find()`/`em.findOne()` with an `exclude` option (e.g. to skip large fields like a logo) always queries the database, but if the returned entity is already managed in the Identity Map, MikroORM only merges the fields present in the fresh query response into the existing instance - excluded fields are left untouched. If that entity was previously loaded elsewhere in the test with those fields populated, they stay populated instead of becoming `undefined`, even though the query excluded them. Call `em.clear()` before the read to force a fresh entity instance.

## Applying this

1. Identify the repo method under test and check its implementation for `nativeDelete`/`nativeUpdate`/`exclude`.
2. Identify the read/assertion used to verify the result and check whether it is PK-based (`findOne`/`findById`/`exists`) or unconditionally hits the DB (`count`/`find` plural).
3. Only add `em.clear()` if Step 1+2 or Step 3 applies. Otherwise, do not add it - an unnecessary `em.clear()` is a false signal of risk that isn't there.
4. If in doubt, prefer strengthening the assertion to use `em.count(...)` instead of adding `em.clear()` - it removes the ambiguity entirely.
