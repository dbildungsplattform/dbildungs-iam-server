import { ApiProperty } from '@nestjs/swagger';

export class UserExternalDataV2PersonenkontextResponse {
    @ApiProperty()
    public dienststellennr: string;

    @ApiProperty()
    public rolleId: string;

    public constructor(dienststellennr: string, rolleId: string) {
        this.dienststellennr = dienststellennr;
        this.rolleId = rolleId;
    }
}
