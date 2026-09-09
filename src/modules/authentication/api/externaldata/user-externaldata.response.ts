import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Person } from '../../../person/domain/person.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { RequiredExternalPkData } from '../authentication.controller.js';
import { UserExternalDataResponseIqshHelpdeskPk } from './user-externaldata-iqshhelpdesk-pk.response.js';
import { UserExternalDataResponseIqshHelpdesk } from './user-externaldata-iqshhelpdesk.response.js';
import { UserExeternalDataResponseItslearning } from './user-externaldata-itslearning.response.js';
import { UserExeternalDataResponseOnlineDateiablage } from './user-externaldata-onlinedateiablage.response.js';
import { UserExeternalDataResponseOpshPk } from './user-externaldata-opsh-pk.response.js';
import { UserExeternalDataResponseOpsh } from './user-externaldata-opsh.response.js';
import { NewOxParams, OldOxParams, UserExternalDataResponseOx } from './user-externaldata-ox.response.js';
import { UserExternalDataResponsePolyteia } from './user-externaldata-polyteia.response.js';
import { UserExeternalDataResponseVidis } from './user-externaldata-vidis.response.js';

export type ExternalDataWorkflowData = {
    person: Person<true>;
    checkedExternalPkData: RequiredExternalPkData[];
    vidisDienststellennummern: string[];
    singleRollenart: RollenArt | undefined;
    polytheaDienststellenNummern: string[];
    email?: string;
    oxParams?: OldOxParams | NewOxParams;
};

export class UserExternalDataResponse {
    //optional, um den Zugriff auf OX zu verhindern, falls kein Lehrerkontext mehr an der Person hängt
    @ApiPropertyOptional({ type: UserExternalDataResponseOx })
    public ox?: UserExternalDataResponseOx;

    @ApiProperty({ type: UserExeternalDataResponseItslearning })
    public itslearning: UserExeternalDataResponseItslearning;

    @ApiProperty({ type: UserExeternalDataResponseVidis })
    public vidis: UserExeternalDataResponseVidis;

    @ApiProperty({ type: UserExeternalDataResponseOpsh })
    public opsh: UserExeternalDataResponseOpsh;

    @ApiProperty({ type: UserExeternalDataResponseOnlineDateiablage })
    public onlineDateiablage: UserExeternalDataResponseOnlineDateiablage;

    @ApiProperty({ type: UserExternalDataResponseIqshHelpdesk })
    public iqshHelpdesk: UserExternalDataResponseIqshHelpdesk;

    @ApiProperty({ type: UserExternalDataResponsePolyteia })
    public polyteia: UserExternalDataResponsePolyteia;

    private constructor(
        ox: UserExternalDataResponseOx | undefined,
        itslearning: UserExeternalDataResponseItslearning,
        vidis: UserExeternalDataResponseVidis,
        opsh: UserExeternalDataResponseOpsh,
        onlineDateiablage: UserExeternalDataResponseOnlineDateiablage,
        iqshHelpdesk: UserExternalDataResponseIqshHelpdesk,
        polyteia: UserExternalDataResponsePolyteia,
    ) {
        this.ox = ox;
        this.itslearning = itslearning;
        this.vidis = vidis;
        this.opsh = opsh;
        this.onlineDateiablage = onlineDateiablage;
        this.iqshHelpdesk = iqshHelpdesk;
        this.polyteia = polyteia;
    }

    public static createNew(workflowData: ExternalDataWorkflowData): UserExternalDataResponse {
        const ox: Option<UserExternalDataResponseOx> =
            workflowData.oxParams && UserExternalDataResponseOx.createNew(workflowData.oxParams);

        const itslearning: UserExeternalDataResponseItslearning = new UserExeternalDataResponseItslearning(
            workflowData.person.id,
        );

        const vidis: UserExeternalDataResponseVidis = new UserExeternalDataResponseVidis(
            workflowData.person.id,
            workflowData.person.vorname,
            workflowData.person.familienname,
            workflowData.singleRollenart,
            workflowData.email,
            workflowData.vidisDienststellennummern,
        );

        const opsh: UserExeternalDataResponseOpsh = new UserExeternalDataResponseOpsh(
            workflowData.person.vorname,
            workflowData.person.familienname,
            workflowData.checkedExternalPkData.map(
                (pk: RequiredExternalPkData) => new UserExeternalDataResponseOpshPk(pk.rollenart, pk.kennung),
            ),
            workflowData.email,
        );

        const onlineDateiablage: UserExeternalDataResponseOnlineDateiablage =
            new UserExeternalDataResponseOnlineDateiablage(workflowData.person.id);

        const iqshHelpdesk: UserExternalDataResponseIqshHelpdesk = new UserExternalDataResponseIqshHelpdesk(
            workflowData.person.vorname,
            workflowData.person.familienname,
            workflowData.checkedExternalPkData.map(
                (pk: RequiredExternalPkData) => new UserExternalDataResponseIqshHelpdeskPk(pk.rolleId, pk.kennung),
            ),
            workflowData.email,
        );

        const polyteia: UserExternalDataResponsePolyteia = new UserExternalDataResponsePolyteia(
            workflowData.person.vorname,
            workflowData.person.familienname,
            workflowData.polytheaDienststellenNummern,
            workflowData.singleRollenart,
        );

        return new UserExternalDataResponse(ox, itslearning, vidis, opsh, onlineDateiablage, iqshHelpdesk, polyteia);
    }
}
