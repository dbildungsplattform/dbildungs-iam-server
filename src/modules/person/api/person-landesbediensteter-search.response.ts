import { ApiProperty } from '@nestjs/swagger';
import { PersonLandesbediensteterSearchPersonenkontextResponse } from './person-landesbediensteter-search-personenkontext.response.js';
import { KontextWithOrgaAndRolle } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { Person } from '../domain/person.js';
import { PersonEmailResponse } from './person-email-response.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';

export class PersonLandesbediensteterSearchResponse {
    @ApiProperty({ type: String, required: true })
    public readonly id: string;

    @ApiProperty({ type: String, required: true })
    public readonly vorname: string;

    @ApiProperty({ type: String, required: true })
    public readonly familienname: string;

    @ApiProperty({ type: String, required: true })
    public readonly username?: string;

    @ApiProperty({ type: String, required: true })
    public readonly personalnummer?: string;

    @ApiProperty({ type: String, required: true })
    public readonly primaryEmailAddress?: string;

    @ApiProperty({ type: [PersonLandesbediensteterSearchPersonenkontextResponse] })
    public personenkontexte: PersonLandesbediensteterSearchPersonenkontextResponse[];

    protected constructor(
        id: PersonID,
        vorname: string,
        familienname: string,
        username: string | undefined,
        personalnummer: string | undefined,
        primaryEmailAddress: string | undefined,
        personenkontexte: PersonLandesbediensteterSearchPersonenkontextResponse[],
    ) {
        this.id = id;
        this.vorname = vorname;
        this.familienname = familienname;
        this.username = username;
        this.personalnummer = personalnummer;
        this.primaryEmailAddress = primaryEmailAddress;
        this.personenkontexte = personenkontexte;
    }

    public static createNew(
        person: Person<true>,
        kontexteWithOrgaAndRolle: KontextWithOrgaAndRolle[],
        email: PersonEmailResponse | undefined,
    ): PersonLandesbediensteterSearchResponse {
        return new PersonLandesbediensteterSearchResponse(
            person.id,
            person.vorname,
            person.familienname,
            person.username,
            person.personalnummer,
            email?.address,
            kontexteWithOrgaAndRolle.map(
                (kontext: KontextWithOrgaAndRolle) =>
                    new PersonLandesbediensteterSearchPersonenkontextResponse(
                        kontext.rolle.id,
                        kontext.rolle.name,
                        kontext.organisation.id,
                        kontext.organisation.name,
                        kontext.organisation.kennung!,
                    ),
            ),
        );
    }
}
