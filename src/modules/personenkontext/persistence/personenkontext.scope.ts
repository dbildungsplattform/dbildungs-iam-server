import { type EntityName } from '@mikro-orm/core';
import { ScopeBase } from '../../../shared/persistence/scope-base.js';
import { ScopeOperator } from '../../../shared/persistence/scope.enums.js';
import { type Personenstatus, type SichtfreigabeType } from '../domain/personenkontext.enums.js';
import { PersonenkontextEntity } from './personenkontext.entity.js';
import { type OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { type RollenArt } from '../../rolle/domain/rolle.enums.js';

type FindProps = {
    personId: string;
    username: string;
    personenstatus: Personenstatus;
    sichtfreigabe: SichtfreigabeType;
    rolleart: RollenArt;
};

export class PersonenkontextScope extends ScopeBase<PersonenkontextEntity> {
    public override get entityName(): EntityName<PersonenkontextEntity> {
        return PersonenkontextEntity;
    }

    public findBy(findProps: Findable<FindProps>, operator: ScopeOperator = ScopeOperator.AND): this {
        this.findByInternal(
            {
                personId: findProps.personId,
                username: findProps.username,
                personenstatus: findProps.personenstatus,
                sichtfreigabe: findProps.sichtfreigabe,
            },
            operator,
        );

        return this;
    }

    public byOrganisations(organisationIDs: OrganisationID[] | undefined): this {
        if (organisationIDs) {
            this.findByQuery({
                organisationId: { $in: organisationIDs },
            });
        }

        return this;
    }

    public findByRollen(rollen: RollenArt[] | undefined): this {
        if (rollen) {
            this.findByQuery({
                rolleId: { rollenart: { $in: rollen } },
            });
        }

        return this;
    }
}
