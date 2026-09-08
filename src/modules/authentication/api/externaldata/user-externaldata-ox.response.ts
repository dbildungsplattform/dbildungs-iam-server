import { ApiProperty } from '@nestjs/swagger';
import { OXContextID } from '../../../../shared/types/ox-ids.types.js';

export interface OldOxParams {
    username: string;
    contextId: OXContextID;
}

export interface NewOxParams {
    oxLoginId: OXContextID;
}

export type OxParams = OldOxParams | NewOxParams;

export class UserExternalDataResponseOx {
    @ApiProperty()
    public id: string;

    private constructor(id: string) {
        this.id = id;
    }

    public static createNew(params: OldOxParams | NewOxParams): UserExternalDataResponseOx {
        let id: string;
        if ('username' in params) {
            id = `${params.username}@${params.contextId}`;
        } else {
            id = params.oxLoginId;
        }
        return new UserExternalDataResponseOx(id);
    }
}
