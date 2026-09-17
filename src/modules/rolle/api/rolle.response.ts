import { ApiProperty } from '@nestjs/swagger';
import { RollenArt, RollenArtTypName, RollenMerkmal, RollenMerkmalTypName } from '../domain/rolle.enums.js';
import { RollenSystemRecht } from '../domain/systemrecht.js';
import { Rolle } from '../domain/rolle.js';
import { SystemRechtResponse } from './systemrecht.response.js';

export class RolleResponse {
    @ApiProperty()
    public id: string;

    @ApiProperty()
    public createdAt: Date;

    @ApiProperty()
    public updatedAt: Date;

    @ApiProperty()
    public name: string;

    @ApiProperty()
    public administeredBySchulstrukturknoten: string;

    @ApiProperty({ enum: RollenArt, enumName: RollenArtTypName })
    public rollenart: RollenArt;

    @ApiProperty({ enum: RollenMerkmal, enumName: RollenMerkmalTypName, isArray: true })
    public merkmale: RollenMerkmal[];

    @ApiProperty({ isArray: true, type: SystemRechtResponse })
    public systemrechte: SystemRechtResponse[];

    @ApiProperty({ nullable: true })
    public administeredBySchulstrukturknotenName?: string;

    @ApiProperty({ nullable: true })
    public administeredBySchulstrukturknotenKennung?: string;

    @ApiProperty()
    public version: number;

    public constructor(
        rolle: Rolle<true>,
        administeredBySchulstrukturknotenName?: string,
        administeredBySchulstrukturknotenKennung?: string,
    ) {
        this.id = rolle.id;
        this.createdAt = rolle.createdAt;
        this.updatedAt = rolle.updatedAt;
        this.name = rolle.name;
        this.administeredBySchulstrukturknoten = rolle.administeredBySchulstrukturknoten;
        this.rollenart = rolle.rollenart;
        this.merkmale = rolle.merkmale;
        this.systemrechte = rolle.systemrechte.map(
            (systemRecht: RollenSystemRecht) => new SystemRechtResponse(systemRecht),
        );
        this.administeredBySchulstrukturknotenName = administeredBySchulstrukturknotenName;
        this.administeredBySchulstrukturknotenKennung = administeredBySchulstrukturknotenKennung;
        this.version = rolle.version;
    }
}
