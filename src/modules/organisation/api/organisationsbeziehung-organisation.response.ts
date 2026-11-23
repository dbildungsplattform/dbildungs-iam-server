import { ApiProperty } from '@nestjs/swagger';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { Organisation } from '../domain/organisation.js';

export class OrganisationsbeziehungOrganisationResponse {
    @ApiProperty({ format: 'uuid' })
    public id!: OrganisationID;

    @ApiProperty()
    public name!: string;

    @ApiProperty({ required: false, nullable: true })
    public dienststellennummer?: string;

    public static fromDomain(organisation: Organisation<true, false>): OrganisationsbeziehungOrganisationResponse {
        const response: OrganisationsbeziehungOrganisationResponse = new OrganisationsbeziehungOrganisationResponse();

        response.id = organisation.id;
        response.name = organisation.name;
        response.dienststellennummer = organisation.kennung;

        return response;
    }
}
