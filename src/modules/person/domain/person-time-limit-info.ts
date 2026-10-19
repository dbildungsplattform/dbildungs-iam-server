import { type TimeLimitOccasion } from './time-limit-occasion.enums.js';

export class PersonTimeLimitInfo {
    public constructor(
        public readonly occasion: TimeLimitOccasion,
        public readonly deadline: Date,
        public readonly school?: string,
        public readonly rolle?: string,
    ) {}
}
