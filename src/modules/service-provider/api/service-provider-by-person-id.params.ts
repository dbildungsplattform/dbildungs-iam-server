import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

import { PersonID } from '../../../shared/types/index.js';

export class ServiceProviderByPersonIdParams {
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The id of the person.',
        required: true,
        nullable: false,
    })
    public readonly personId!: PersonID;
}
