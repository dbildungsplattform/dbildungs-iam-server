import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../../../shared/error/its-learning.error.js';
import { Err, Ok } from '../../../../../shared/util/result.js';
import { type FailureStatusInfo, type MassResult, type StatusInfo, type SuccessStatusInfo } from '../actions/base-mass-action.js';
import { StatusInfoHelpers } from './status-info.utils.js';

function makeSuccessStatus(): SuccessStatusInfo {
    return {
        codeMajor: 'success',
        severity: 'status',
    };
}

function makeFailureStatus(description: string): FailureStatusInfo {
    return {
        codeMajor: 'failure',
        severity: 'error',
        codeMinor: {
            codeMinorField: [{ codeMinorName: 'error', codeMinorValue: 'error' }],
        },
        description: {
            language: 'en',
            text: description,
        },
    };
}

describe('StatusInfoHelpers', () => {
    describe('errorOnFailure', () => {
        it('should return undefined when there is no error status', () => {
            const status: StatusInfo[] = [makeSuccessStatus()];

            const result: ItsLearningError | undefined = StatusInfoHelpers.errorOnFailure(status);

            expect(result).toBeUndefined();
        });

        it('should return number of failure statuses as error', () => {
            const status: StatusInfo[] = [makeSuccessStatus(), makeFailureStatus('Some Error')];

            const result: ItsLearningError | undefined = StatusInfoHelpers.errorOnFailure(status);

            expect(result).toEqual(new ItsLearningError('1 of 2 Requests failed', [makeFailureStatus('Some Error')]));
        });
    });

    describe('failedStatus', () => {
        it('should only return the failure statuses', () => {
            const status: StatusInfo[] = [makeSuccessStatus(), makeFailureStatus('Some Error')];

            const result: FailureStatusInfo[] = StatusInfoHelpers.failedStatus(status);

            expect(result).toEqual([makeFailureStatus('Some Error')]);
        });
    });

    describe('unpackMassResult', () => {
        it('should return ok result, if input is okay and no failure statuses exist', () => {
            const input: Result<MassResult<string>, DomainError> = Ok({
                status: [makeSuccessStatus()],
                value: 'will succeed',
            });

            const result: Result<string, DomainError> = StatusInfoHelpers.unpackMassResult(input);

            expect(result).toEqual(Ok('will succeed'));
        });

        it('should return error result, if input is okay but failure status exist', () => {
            const failedStatus: FailureStatusInfo = makeFailureStatus('some error');
            const input: Result<MassResult<string>, DomainError> = Ok({
                status: [failedStatus],
                value: 'will not succeed',
            });

            const result: Result<string, DomainError> = StatusInfoHelpers.unpackMassResult(input);
            const expectedError: ItsLearningError = new ItsLearningError('1 of 1 Requests failed', [failedStatus]);

            expect(result).toEqual(Err(expectedError));
        });

        it('should return error result, if input is already an error result', () => {
            const error: ItsLearningError = new ItsLearningError('error');
            const input: Result<MassResult<string>, DomainError> = Err(error);

            const result: Result<string, DomainError> = StatusInfoHelpers.unpackMassResult(input);

            expect(result).toEqual(Err(error));
        });
    });

    describe('zipFailed', () => {
        it('should only return the failure statuses with their corresponding input', () => {
            const inputs: string[] = ['will succeed', 'will error'];
            const status: StatusInfo[] = [makeSuccessStatus(), makeFailureStatus('Some Error')];

            const result: [FailureStatusInfo, string][] = StatusInfoHelpers.zipFailed(status, inputs);

            expect(result).toEqual([[makeFailureStatus('Some Error'), 'will error']]);
        });
    });
});
