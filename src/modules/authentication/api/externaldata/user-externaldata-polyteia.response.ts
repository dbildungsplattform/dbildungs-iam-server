import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';

export class UserExternalDataResponsePolyteia {
    @ApiProperty()
    public vorname: string;

    @ApiProperty()
    public familienname: string;

    @ApiPropertyOptional({ enum: RollenArt })
    public rollenart?: RollenArt;

    @ApiProperty({ type: [String] })
    public dienststellenNummern: string[];

    public constructor(vorname: string, familienname: string, dienststellenNummern: string[], rollenart?: RollenArt) {
        this.vorname = vorname;
        this.familienname = familienname;
        this.rollenart = rollenart;
        this.dienststellenNummern = dienststellenNummern;
    }
}
