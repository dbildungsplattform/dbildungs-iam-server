import { BadRequestException, type HttpExceptionOptions } from '@nestjs/common';
import { type ValidationError } from 'class-validator';

export class DetailedValidationError extends BadRequestException {
    public constructor(
        public readonly validationErrors: ValidationError[],
        objectOrError?: string | object,
        descriptionOrOptions?: string | HttpExceptionOptions,
    ) {
        super(objectOrError, descriptionOrOptions ?? 'validation error');
    }
}
