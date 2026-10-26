import { ApiProperty } from '@nestjs/swagger';

export class UserExternalDataV2PersonenkontextResponse {
    @ApiProperty()
    public dstNr: string;

    @ApiProperty()
    public rolleId: string;

    public constructor(dstNr: string, rolleId: string) {
        this.dstNr = dstNr;
        this.rolleId = rolleId;
    }
}
