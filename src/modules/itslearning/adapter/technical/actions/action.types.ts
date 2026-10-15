import { type DomainError } from '../../../../../shared/error/index.js';

export interface ItslearningAction<ResultType> {
    action: string;

    buildRequest: () => object;

    parseResponse: (input: string) => Result<ResultType, DomainError>;
}
