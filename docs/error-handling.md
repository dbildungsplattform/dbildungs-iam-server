# Error Handling

## Result<SuccessType, ErrorType>

We want to avoid exceptions (i.e. `throw <some error>`) wherever possible, so we've introduced the `Result<T, E>`-type.

The result-type allows us to reason about possible errors. They also have to be explicitly handled instead of just bubbling up.
Exceptions are invisible when looking at function signatures and make it harder to work with existing code.

### Implementation

The result-type is just a union of the ok- and err-variant:

```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
```

To make usage easier, there are utility-types to easily create both variants:

```typescript
const okResult = Ok('value');
// { ok: true, value: "value" }

const errResult = Err(new Error());
// { ok: false, err: Error }
```

### Always use `Result` in domain logic

This applies to basically every part of the codebase (except controllers).

Since we use a lot of async code, this means most of our functions should return a `Promise<Result<T, DomainError>>`;

```typescript
function findOne(id: string): Promise<Result<Entity, NotFoundError>> {
    const entity: Entity | undefined = await find(id);

    if (entity) {
        return Ok(entity);
    } else {
        return Err(new NotFoundError(id));
    }
}
```

### Old patterns to avoid

There are still some parts of the code that don't follow these guidelines, so here is a list of things to avoid (or maybe even rework, if the time allows):

#### Returning a union (i.e. `string | DomainError`)

This should be `Result<string, DomainError>`.
If you need to call a function that still uses this pattern and can't easily refactor it, you can use this utility function to convert the return value to a result:

```typescript
const valueOrError: string | DomainError = someOldFunction();

const result: Result<string, DomainError> = UnionToResult(valueOrError);
```

#### Returning an optional error (i.e. `Option<DomainError>`)

This is basically the same as the union (just with `undefined | null` as the value type), so it should be `Result<void, DomainError>`. The same utility function can be used for this.

### Results in controllers

Results will inevitably show up in controllers, but we can't return the result here.

In these cases, simply throw the result if it is an error

```typescript
@Get("/person/:id")
async function getPerson(@Params("id") id: string): PersonResponse {
    const personResult: Result<Person, DomainError> = await findPerson(id);

    if (!personResult.ok) {
        throw personResult.err;
    }

    return new PersonResponse(personResult.value);
}
```

### Testing

To simplify using results in tests, there are a few utility functions

```typescript
it(`should be an ok-result`, () => {
    const result = Ok('some value');

    // Checks if the result is okay
    expectOkResult(result);

    // 'result' is being narrowed, so this is valid without any casting or type assertion
    expect(result.value).toBeDefined();
});

it(`should be an err-result`, () => {
    const result = Err(new Error());

    // Checks if the result is not okay
    expectErrResult(result);

    // 'result' is being narrowed, so this is valid without any casting or type assertion
    expect(result.error).toBeDefined();
});
```

## Domain Errors and mapping to http responses

All errors thrown, rejected or returned as Result are derived of [DomainError](src\shared\error\domain.error.ts).

### Error Mapping

Every module defines its own DomainErrors and its own [ExceptionFilter](https://docs.nestjs.com/exception-filters) to map these DomainErrors into the error format returned by the API. The ExceptionFilter sets the HTTP response code and body according to the defined mapping. The ExceptionFilter is applied to the controller(s) of the module.

SPSH has two error formats to return by the API.

- The standard format is [DbiamError](src\shared\error\dbiam.error.ts).
- In the schulconnex module we follow the schulconnex error format and use [SchulConnexError](src\shared\error\schul-connex.error.ts).

## Global Exception Filters

There are four globally defined exception filters:

- [ValidationExceptionFilter](src\shared\filter\validation-exception-filter.ts) catches and maps all exceptions thrown by Nestjs' validation pipline.
- [AuthenticationExceptionFilter](src\modules\authentication\api\authentication-exception-filter.ts) catches and maps errors thrown by the authorization process
- [SharedExceptionFilter](src\shared\filter\shared-exception-filter.ts) catches and maps shared errors. These are errors that are not specific to a certain part the domain, e.g. EntityNotFound
- [GlobalExceptionFilter](src\shared\error\global-exception.filter.ts) will catch every error that was not caught before and transforms it in into a HTTP response. Will log critical errors if an unknown error (in especially an unmapped error or a js standard Error) is caught.

## Handling errors of external libraries

Usually errors are thrown by external libraries. Therefore we need to catch them and transform them into a DomainError as explained above.
In the catch block in which we transform the caught error into a DomainError the Error should be logged.
The [ClassLogger](src\core\logging\class-logger.ts) has the methods `logUnknownAsError()` and `logUnknownAsWarning()` to reduce boilerplate code.
