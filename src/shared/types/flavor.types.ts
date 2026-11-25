/*
 * This constant does not actually exist and is used as an encapsulated flavoring/branding discriminator.
 */
declare const type: unique symbol;

/**
 * Create a "flavored" version of a type.
 * TypeScript will not allow mixing different flavors,
 * but will allow implicit conversion from and to unflavored types.
 *
 * @example
 * type PersonID = Flavor<string, "person">;
 * const personId: PersonID = "test-id";
 *
 * @example <caption>Using a unique symbol to flavor.</caption>
 * declare const personSymbol: unique symbol;
 * type PersonID = Flavor<string, typeof personSymbol>;
 * const personId: PersonID = "test-id";
 */
export type Flavor<T, F> = T & { [type]?: F };
