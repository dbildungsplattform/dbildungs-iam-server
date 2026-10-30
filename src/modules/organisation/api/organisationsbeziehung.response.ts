import { ApiProperty } from '@nestjs/swagger';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { OrganisationsbeziehungsTyp } from '../domain/organisationsbeziehungs-typ.enum.js';
import { Organisationsbeziehung } from '../domain/organisation.js';

export class OrganisationsbeziehungResponse {
    @ApiProperty({
        format: 'uuid',
    })
    public id!: string;

    @ApiProperty()
    public createdAt!: Date;

    @ApiProperty()
    public updatedAt!: Date;

    @ApiProperty({
        format: 'uuid',
    })
    public quellOrganisationId!: OrganisationID;

    @ApiProperty({
        format: 'uuid',
    })
    public zielOrganisationId!: OrganisationID;

    @ApiProperty({
        enum: OrganisationsbeziehungsTyp,
        enumName: 'OrganisationsbeziehungsTyp',
    })
    public typ!: OrganisationsbeziehungsTyp;

    public static fromDomain(organisationsbeziehung: Organisationsbeziehung<true>): OrganisationsbeziehungResponse {
        const response: OrganisationsbeziehungResponse = new OrganisationsbeziehungResponse();

        response.id = organisationsbeziehung.id;
        response.createdAt = organisationsbeziehung.createdAt;
        response.updatedAt = organisationsbeziehung.updatedAt;
        response.quellOrganisationId = organisationsbeziehung.quellOrganisationId;
        response.zielOrganisationId = organisationsbeziehung.zielOrganisationId;
        response.typ = organisationsbeziehung.typ;

        return response;
    }
}
