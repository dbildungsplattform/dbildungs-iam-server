import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { uniq } from 'lodash-es';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { UserExternalData } from '../../domain/user-externaldata.service.js';
import { UserExternalDataV2PersonenkontextResponse } from './user-externaldata-v2-pk.response.js';

export class UserExternalDataV2Response {
    @ApiProperty()
    public personId: string;

    @ApiProperty()
    public vorname: string;

    @ApiProperty()
    public nachname: string;

    @ApiPropertyOptional({ enum: RollenArt })
    public rollenart?: RollenArt;

    @ApiProperty({ type: [UserExternalDataV2PersonenkontextResponse] })
    public personenkontexte: UserExternalDataV2PersonenkontextResponse[];

    // Redundant to personenkontexte, provided flat so Keycloak mappers don't need to parse the array.
    @ApiProperty({ type: [String] })
    public dienststellenNummern: string[];

    @ApiPropertyOptional()
    public emailAdresse?: string;

    @ApiPropertyOptional()
    public oxLoginId?: string;

    private constructor(userExternalData: UserExternalData) {
        this.personId = userExternalData.personId;
        this.vorname = userExternalData.vorname;
        this.nachname = userExternalData.nachname;
        this.rollenart = userExternalData.rollenart;
        this.personenkontexte = this.mapToPersonenkontexte(userExternalData.personenkontexte);
        this.dienststellenNummern = this.mapToDienststellenNummern(userExternalData.personenkontexte);
        this.emailAdresse = userExternalData.emailAdresse;
        this.oxLoginId = userExternalData.oxLoginId;
    }

    private mapToDienststellenNummern(personenkontexte: { dienststellennr: string; rolleId: string }[]): string[] {
        return uniq(personenkontexte.map((pk: { dienststellennr: string; rolleId: string }) => pk.dienststellennr));
    }

    private mapToPersonenkontexte(
        personenkontexte: { dienststellennr: string; rolleId: string }[],
    ): UserExternalDataV2PersonenkontextResponse[] {
        return personenkontexte.map(
            (pk: { dienststellennr: string; rolleId: string }) =>
                new UserExternalDataV2PersonenkontextResponse(pk.dienststellennr, pk.rolleId),
        );
    }

    public static createNew(userExternalData: UserExternalData): UserExternalDataV2Response {
        return new UserExternalDataV2Response(userExternalData);
    }
}
