import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { OrganisationsbeziehungsTyp } from '../domain/organisationsbeziehungs-typ.enum.js';

export class CreateOrganisationsbeziehungBodyParams {
    @ApiProperty({
        description: 'ID der Quellorganisation.',
        format: 'uuid',
    })
    @IsUUID()
    public quellOrganisationId!: OrganisationID;

    @ApiProperty({
        description: 'ID der Zielorganisation.',
        format: 'uuid',
    })
    @IsUUID()
    public zielOrganisationId!: OrganisationID;

    @ApiProperty({
        description: 'Typ der Organisationsbeziehung.',
        enum: OrganisationsbeziehungsTyp,
        enumName: 'OrganisationsbeziehungsTyp',
    })
    @IsEnum(OrganisationsbeziehungsTyp)
    public typ!: OrganisationsbeziehungsTyp;
}
