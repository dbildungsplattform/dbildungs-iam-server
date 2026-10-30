import { ApiProperty } from '@nestjs/swagger';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';

export class OrganisationsbeziehungOrganisationResponse {
    @ApiProperty({ format: 'uuid' })
    public id!: OrganisationID;

    @ApiProperty()
    public name!: string;

    @ApiProperty({ required: false, nullable: true })
    public dienststellennummer?: string;
}
