import { type DomainError, ItsLearningError } from '../../../../../shared/error/index.js';
import { Err, Ok } from '../../../../../shared/util/result.js';
import { type FailureStatusInfo, type MassResult, type StatusInfo } from '../actions/base-mass-action.js';

export class StatusInfoHelpers {
    public static errorOnFailure(status: StatusInfo[]): ItsLearningError | undefined {
        const failed: StatusInfo[] = StatusInfoHelpers.failedStatus(status);

        if (failed.length > 0) {
            return new ItsLearningError(`${failed.length} of ${status.length} Requests failed`, failed);
        }

        return undefined;
    }

    public static failedStatus(status: StatusInfo[]): FailureStatusInfo[] {
        return status.filter((si: StatusInfo) => si.codeMajor === 'failure');
    }

    public static unpackMassResult<T>(result: Result<MassResult<T>, DomainError>): Result<T, DomainError> {
        if (result.ok) {
            const error: DomainError | undefined = StatusInfoHelpers.errorOnFailure(result.value.status);

            if (error) {
                return Err(error);
            } else {
                return Ok(result.value.value);
            }
        } else {
            return Err(result.error);
        }
    }

    /**
     * Returns all failed status with their corresponding input.
     * Caller needs to ensure, that both arrays are of the same length
     */
    public static zipFailed<T>(status: StatusInfo[], input: T[]): [status: FailureStatusInfo, input: T][] {
        const failed: [status: FailureStatusInfo, input: T][] = [];

        for (let idx: number = 0; idx < Math.min(status.length, input.length); idx++) {
            const s: StatusInfo = status[idx]!; // Guaranteed to be in bounds
            const i: T = input[idx]!; // Guaranteed to be in bounds

            if (s.codeMajor === 'failure') {
                failed.push([s, i]);
            }
        }

        return failed;
    }
}
