import { type OrganisationsTyp, type Traegerschaft } from '../domain/organisation.enums.js';

export class CreatedOrganisationDto {
    public readonly id!: string;

    public readonly administriertVon?: string;

    public readonly kennung?: string;

    public readonly name!: string;

    public readonly namensergaenzung?: string;

    public readonly kuerzel?: string;

    public readonly typ!: OrganisationsTyp;

    public traegerschaft?: Traegerschaft;
}
