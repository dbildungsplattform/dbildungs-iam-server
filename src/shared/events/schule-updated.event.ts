import { Organisation } from '../../modules/organisation/domain/organisation.js';
import { OrganisationID } from '../types/index.js';
import { BaseEvent } from './base-event.js';

export class SchuleUpdatedEvent extends BaseEvent {
    public constructor(
        public readonly organisationId: OrganisationID,
        public readonly kennung: string | undefined,
        public readonly name: string | undefined,
        public readonly itslearningEnabled: boolean,
        public readonly administriertVon: string | undefined,
        public readonly zugehoerigZu: string | undefined,
        public readonly oldKennung: string | undefined,
        public readonly oldName: string | undefined,
        public readonly oldAdministriertVon: string | undefined,
        public readonly oldZugehoerigZu: string | undefined,
    ) {
        super();
    }

    public static fromOrganisations(
        newOrganisation: Organisation<true>,
        oldOrganisation: Organisation<true>,
    ): SchuleUpdatedEvent {
        return new SchuleUpdatedEvent(
            newOrganisation.id,
            newOrganisation.kennung,
            newOrganisation.name,
            newOrganisation.itslearningEnabled,
            newOrganisation.administriertVon,
            newOrganisation.zugehoerigZu,
            oldOrganisation.kennung,
            oldOrganisation.name,
            oldOrganisation.administriertVon,
            oldOrganisation.zugehoerigZu,
        );
    }
}
