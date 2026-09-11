# Testing

Automated testing is the essential part of the software development process.
It improves the code quality and ensure that the code operates correctly especially after refactoring.

## General Test Conventions

### Lean Tests

The tests should be as simple to read and understand as possible. They should be effortless to write and change, in order to not slow down development. Wherever possible:

- avoid complex logic
- cover only one case per test
- only use clearly named and widely used helper functions

### Naming Convention

When a test fails, the name of the test is the first hint to the developer (or any other person) to what went wrong where. (along with the "describe" blocks the test is in).
Thus, your describe structure and test case names should be designed to enable a person unfamiliar with the code to identify the problem as fast as possible. It should tell him:

- what component is being tested
- under what condition
- the expected outcome

To facilitate this, your tests should be wrapped in at least two describe levels.

```TypeScript
// Name of the unit under test
describe("PersonService", (() => {
 // method that is called
 describe('createPerson', () => {
   // a "should..." sentence
    it("should create person if a person does not exist", async () => {
     ...
    });
  });
 });
});
```

### Isolation

Each test should be able to run alone, as well as together with any other tests. To ensure this, it is important that the test does not depend on any preexisting data.

- Each test should generate the data it needs, and ensure that its data is deleted afterwards. (this is usually done via Jest's "afterAll" function).
- When you create objects with fields that have to be globally unique, like the account username, you must ensure the name you choose is unique. This can be done by including a timestamp.
- Never use seed data.

### Test Structure

Your test should be structured in three separate areas, each distinguished by at least an empty line:

- Arrange - set up your testdata
- Act - call the function you want to test
- Assert - check the result

this is known as the AAA-pattern.

The tests for a unit should cover as much scenarios as possible. Parameters and the combination of parameters can often take numerous values.
The test coverage report already enforces scenarios that test every possible if/else result in the code, but don't rely on code coverage alone. Think about different real world scenarios and cover them even if coverage is reached with only a few of them.
Pay particular attention to error scenarios.

Test preparation which is shared over multiple tests can be done in before(...) or beforeEach(...) blocks. Try to avoid too many before/beforeEach blocks in nested describes, since that makes it more difficult to understand what test preparations were made for a specific test.

```TypeScript
describe('[method]', () => {
  before(() => {
    // prepare stuff globally
  });

    beforeEach(() => {
        // prepare stuff for describe block
    });

    it('...', () => {
        // prepare stuff for this particular test
    });

    it('...', () => {
    });
});
```

## Testing Samples

### Handling of function return values

When assigning a value to an expect, separate the function call from the expectation to simplify debugging. This later helps when you not know about the return value type or if it's an promise or not. This is good style not only for tests.

```TypeScript
 // doSomethingCrazy : retValue
 it('bad sample', () => {
  expect(doSomethingCrazy(x,y,z)).to...
 })
 it('good sample', () => {
  const result = doSomethingCrazy(x,y,z)
  expect(result).to... // here we can simply debug
 })

```

## Mocking

Using the utilities provided by NestJs, we can easily inject mocks into our testing module. The mocks themselves, we create using a [library](https://www.npmjs.com/package/@golevelup/ts-vitest) by @golevelup.

You can create a mock using `createMock(Class)`. As result you will recieved a `DeepMocked<Class>`

```Typescript
let fut: FeatureUnderTest;
let mockService: DeepMocked<MockService>;

beforeAll(async () => {
 const module = await Test.createTestingModule({
  providers: [
   FeatureUnderTest,
   {
    provide: MockService,
    useValue: createMock(MockService),
   },
  ],
 }).compile();

 fut = module.get(FeatureUnderTest);
 mockService = module.get(MockService);
});

afterAll(async () => {
 await module.close();
});

afterEach(() => {
 vi.resetAllMocks();
})
```

The resulting mock has all the functions of the original `Class`, replaced with jest spies. This gives you code completion and type safety, combined with all the features of spies.

`createTestingModule` should only be called in `beforeAll` and not in `beforeEach` to keep the setup and teardown for each test as simple as possible. Therefore `module.close` should only be called in `afterAll` and not in `afterEach`.

To generally reset specific mock implementation after each test `vi.resetAllMocks` can be used in afterEach. Please be aware of the difference between [mockClear](https://jestjs.io/docs/mock-function-api#mockfnmockclear), [mockReset](https://jestjs.io/docs/mock-function-api#mockfnmockreset) and [mockRestore](https://jestjs.io/docs/mock-function-api#mockfnmockrestore).

For creating specific mock implementations the helper functions which only mock the implementation once, must be used (e.g. mockReturnValueOnce). With that approach more control over mocked functions can be achieved.

If you want to mock a method that is not part of a dependency you can mock it with `vi.spyOn`. We strongly recommend the use of `vi.spyOn` and not `vi.fn`, because `vi.spyOn` can be restored a lot easier.

## Unit Tests vs Integration Tests

In Unit Tests we access directly only the component which is currently testing.
Any dependencies should be mocked or are replaced with default testing implementation.
Especially the database access and database calls should be mocked.

In contrast to unit tests the integration tests use access to the database and execute real queries using repositories.

> Unit and integration tests together must achieve 100% test coverage.

### Repo - Integration Tests

For the data access layer, integration tests are highly recommended, but not a must.

Integration tests are desirable for external systems, but difficult to achieve if no test system is available. The result of the integration test depends on the validity and correctness of the test system. So integration tests can fail (temporarily) without any bug on our side.

Integration tests can help finding bugs due to a change of the external systems API.

> Highly recommended, but they not a must if there is no test system or not enough.

<!-- -->

> Nothing is mocked in an integration test.

<!-- -->

> We use [Testcontainers](https://node.testcontainers.org/), not an in-memory-db.

<!-- -->

> A test must define the before and after state of the data set clearly and cleanup the database after execution to the before state.

Our repository layer uses `mikro-orm/EntityManager` to execute the queries.
By testing repositories we want to verify the correct behavior of the repository functions.
It includes verifying expected database state after executed repository function.
Therefore, the `*.repo.integration.spec.js` should be used.

The basic structure of the repo integration test:

#### Preconditions (beforeAll)

1. Create `Nest JS Testing Module`:</br>
   1.1 with `isDatabaseRequired` must be set to true, so that `testcontainers` set up a database</br>
   1.2 provide the repo which should be tested
2. Get repo, orm and entityManager from testing module
3. Create a database schema with `setupDatabase`

```TypeScript
 import { EntityManager, MikroORM } from '@mikro-orm/core';
 import { Test, TestingModule } from '@nestjs/testing';
 import { ConfigTestModule, DatabaseTestModule } from '../../../shared/testing/index.js';
 import { PersonRepo } from './person.repo.js';

 let sut: PersonRepo;
 let em: EntityManager;
 let module: TestingModule;
 let orm: MikroORM;

    beforeAll(async () => {
     module = await Test.createTestingModule({                                                            (1)
             imports: [ConfigTestModule, DatabaseTestModule.register({ isDatabaseRequired: true })],      (1.1)
             providers: [PersonRepo],                                                                     (1.2)
      }).compile();
      sut = module.get(PersonRepo);                                                                       (2)
      orm = module.get(MikroORM);
      em = module.get(EntityManager);
      await DatabaseTestModule.setupDatabase(orm);                                                        (3)
    })
```

#### Post conditions (afterAll), Teardown

After all tests are executed close the app and orm to release the resources by closing the test module.

```TypeScript
    afterAll(async () => {
        await module.close();
    });
```

> When Jest reports open handles that not have been closed, ensure all Promises are awaited and all application parts started are correctly closed.

#### Entity Factories

To fill the database we use factories. They are located in `\src\shared\testing`. If you create a new one, please add it to the index.ts in that folder.

#### Test Modules

Test modules are located in `\src\shared\testing`. If you create a new one, please add it to the index.ts in that folder and refer to `database-test.module.ts`.

#### Identity Map (`em.clear()`)

MikroORM's `EntityManager` caches every loaded entity in its Identity Map. Whether a test needs `em.clear()` before an assertion depends on the combination of the **write operation** under test and the **read operation** used to verify it. There are two distinct, unrelated cases where this matters.

##### Case 1: native write + primary-key read

**1. Does the write operation touch the Identity Map?**

- `em.remove(entity).flush()` and `em.persist(entity).flush()` keep the Identity Map in sync automatically.
- `em.nativeDelete()` / `em.nativeUpdate()` bypass the Identity Map entirely - an entity loaded before the call stays cached with its old, now outdated state.

**2. Does the read operation used for verification have an Identity Map shortcut?**

- `em.findOne()` by primary key (and anything built on it, e.g. `sut.findById()`, `sut.exists()`) can return an already-loaded entity straight from the Identity Map without ever hitting the database.
- `em.count()` and `em.find()` (plural) have no such shortcut and always query the database directly.

**Only the combination of both** - a native write followed by a primary-key-based read of an entity that was already loaded into `em` - can produce a false-positive assertion. In that case, call `em.clear()` right before the read to force it to hit the database.

Prefer `em.count(...)` for verifying deletes/updates where possible: since it never uses the Identity Map shortcut, it is reliable regardless of `em.clear()`.

##### Case 2: `exclude` on an already-loaded entity

`em.find()`/`em.findOne()` with an `exclude` option (e.g. to skip large fields like a logo) always queries the database, but if the returned entity is already managed in the Identity Map, MikroORM only merges the fields present in the fresh query response into the existing instance - excluded fields are left untouched. If that entity was previously loaded elsewhere in the test with those fields populated, they stay populated instead of becoming `undefined`, even though the query excluded them. Call `em.clear()` before the read to force a fresh entity instance instead of merging into the stale one.

### Mapping Tests - Unit Tests

Mapping tests are unit tests which verify the correct mapping between entities and Dto objects.
These tests should not have any external dependencies to other layers like database or use cases.

### Use Case/Service - Unit Tests

Since a usecase only contains orchestration, its tests should be decoupled from the components it depends on. We thus use unit tests to verify the orchestration where necessary

> All Dependencies should be mocked.

<!-- -->

> Use Spies to verify necessary steps, such as authorization checks.

### Controller/API

Controllers are checked by unit tests and integration tests. Integration tests are recommended but not mandatory.

The job of API tests is to make sure all components that interact to fulfill a specific API endpoint are wired up correctly, and fulfil the expectation set up in the documentation.

They should call the endpoint like an external entity would, treating it like a blackbox. It should try all parameters available on the API, users with different roles, as well as relevant error cases.

During the API test, all components that are part of the server, or controlled by the server, should be available.

Any external services or servers that are outside our control should be mocked away via their respective adapters.

## References

This guide is inspired by <https://github.com/goldbergyoni/javascript-testing-best-practices/>
