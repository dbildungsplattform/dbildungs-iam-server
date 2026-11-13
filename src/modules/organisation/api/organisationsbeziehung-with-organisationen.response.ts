import { ApiProperty } from '@nestjs/swagger';
import { type OrganisationsbeziehungWithOrganisationen } from '../domain/organisation.js';
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

    public static fromDomain(
        organisationsbeziehung: OrganisationsbeziehungWithOrganisationen,
    ): OrganisationsbeziehungWithOrganisationenResponse {
        const response: OrganisationsbeziehungWithOrganisationenResponse =
            new OrganisationsbeziehungWithOrganisationenResponse();

        response.id = organisationsbeziehung.organisationsbeziehung.id;
        response.typ = organisationsbeziehung.organisationsbeziehung.typ;
        response.quelle = OrganisationsbeziehungOrganisationResponse.fromDomain(organisationsbeziehung.quelle);
        response.ziel = OrganisationsbeziehungOrganisationResponse.fromDomain(organisationsbeziehung.ziel);

        return response;
    }
}
