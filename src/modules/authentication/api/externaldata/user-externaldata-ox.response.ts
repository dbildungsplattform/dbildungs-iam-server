import { ApiProperty } from '@nestjs/swagger';
import { OXContextID } from '../../../../shared/types/ox-ids.types.js';

export interface OxParams {
    oxLoginId: OXContextID;
}

export class UserExternalDataResponseOx {
    @ApiProperty()
    public id: string;

    private constructor(id: string) {
        this.id = id;
    }

    public static createNew(params: OxParams): UserExternalDataResponseOx {
        return new UserExternalDataResponseOx(params.oxLoginId);
    }
}
