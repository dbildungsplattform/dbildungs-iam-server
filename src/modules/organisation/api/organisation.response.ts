import { ApiProperty } from '@nestjs/swagger';
import {
    OrganisationsTyp,
    OrganisationsTypName,
    Traegerschaft,
    TraegerschaftTypName,
} from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';

export class OrganisationResponse {
    @ApiProperty()
    public readonly id!: string;

    @ApiProperty({ nullable: true })
    public readonly administriertVon?: string;

    @ApiProperty({ nullable: true })
    public readonly zugehoerigZu?: string;

    @ApiProperty({ nullable: true })
    public readonly kennung?: string;

    @ApiProperty()
    public readonly name!: string;

    @ApiProperty({ nullable: true })
    public readonly namensergaenzung?: string;

    @ApiProperty()
    public readonly kuerzel?: string;

    @ApiProperty({ enum: OrganisationsTyp, enumName: OrganisationsTypName })
    public readonly typ!: OrganisationsTyp;

    @ApiProperty({ enum: Traegerschaft, enumName: TraegerschaftTypName })
    public traegerschaft?: Traegerschaft;

    @ApiProperty({ required: true })
    public itslearningEnabled!: boolean;

    @ApiProperty()
    public version: number;

    public constructor(organisation: Organisation<true>) {
        this.id = organisation.id;
        this.administriertVon = organisation.administriertVon;
        this.zugehoerigZu = organisation.zugehoerigZu;
        this.kennung = organisation.kennung;
        this.name = organisation.name!;
        this.namensergaenzung = organisation.namensergaenzung;
        this.kuerzel = organisation.kuerzel;
        this.typ = organisation.typ!;
        this.traegerschaft = organisation.traegerschaft;
        this.itslearningEnabled = organisation.itslearningEnabled;
        this.version = organisation.version;
    }
}
