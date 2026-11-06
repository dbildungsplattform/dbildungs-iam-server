import { ApiProperty } from '@nestjs/swagger';
import { OrganisationsbeziehungsTyp } from '../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationsbeziehungOrganisationResponse } from './organisationsbeziehung-organisation.response.js';

export class OrganisationsbeziehungWithOrganisationenResponse {
    @ApiProperty({ format: 'uuid' })
    public id!: string;

    @ApiProperty({
        enum: OrganisationsbeziehungsTyp,
        enumName: 'OrganisationsbeziehungsTyp',
    })
    public typ!: OrganisationsbeziehungsTyp;

    @ApiProperty({ type: OrganisationsbeziehungOrganisationResponse })
    public quelle!: OrganisationsbeziehungOrganisationResponse;

    @ApiProperty({ type: OrganisationsbeziehungOrganisationResponse })
    public ziel!: OrganisationsbeziehungOrganisationResponse;
}
