import { OrganisationsTyp, Traegerschaft } from '../../../modules/organisation/domain/organisation.enums.js';

export class OrganisationFile {
    public id!: number;

    public overrideId?: string;

    public administriertVon?: number;

    public zugehoerigZu?: number;

    public kennung?: string;

    public name!: string;

    public namensergaenzung?: string;

    public kuerzel?: string;

    public typ!: OrganisationsTyp;

    public traegerschaft?: Traegerschaft;

    public emailDomain?: string;

    public emailAdress?: string;
}
