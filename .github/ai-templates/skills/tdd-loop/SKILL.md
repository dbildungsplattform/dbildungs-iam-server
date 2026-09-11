---
name: tdd-loop
description: 'Run a test-driven development loop for features and bug fixes. Use when tdd, test-driven development or red-green are mentioned.'
argument-hint: 'Describe goal, bug, or feature to drive with TDD'
---

# TDD Loop

Drive work in short red -> green cycles.

## Core Rules

- Behavior must be clarified by user. Do not assume behavior.
- Do not one-shot multiple tests. One test and one implementation change at a time.
- Never change implementation without a failing test that covers the implementation.
- Do not continue with the next step until the current step produces the expected result.
- Prefer running single tests. Use workspace actions or tools if possible.
- Prefer integration tests over unit tests where possible.

## Loop

The core idea is to create a minimal failing test for a behavior, then make the smallest change to pass that test. Repeat this process until the desired behavior is fully implemented and validated.

1. Identify desired behavior. Clarify with the user if necessary.
2. Inspect existing implementation and tests.
3. Identify one falsifiable aspect of the desired behavior.
4. Encode the aspect in a test and verify that it fails.
5. Apply the smallest change to the implementation that makes the test pass.
6. Repeat until all aspects of the desired behavior are implemented.

## Additional information

Writing tests is explained in `docs/tests.md`.
