import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DeleteOrganisationsbeziehungBodyParams {
    @ApiProperty({
        description: 'ID der Organisationsbeziehung.',
        format: 'uuid',
    })
    @IsUUID()
    public organisationsbeziehungId!: string;
}
