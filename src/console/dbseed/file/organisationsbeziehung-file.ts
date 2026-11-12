import { type OrganisationsbeziehungsTyp } from '../../../modules/organisation/domain/organisationsbeziehungs-typ.enum.js';

export class OrganisationsbeziehungFile {
    public quellOrganisationId!: number;

    public zielOrganisationId!: number;

    public typ!: OrganisationsbeziehungsTyp;
}
