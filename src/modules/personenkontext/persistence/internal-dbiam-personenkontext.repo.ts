import { Loaded, rel } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { OrganisationID, PersonID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';
import { RolleEntity } from '../../rolle/entity/rolle.entity.js';
import { PersonenkontextFactory } from '../domain/personenkontext.factory.js';
import { Personenkontext } from '../domain/personenkontext.js';
import { PersonenkontextEntity } from './personenkontext.entity.js';

// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mapAggregateToData(personenKontext: Personenkontext<boolean>) {
    return {
        // Don't assign createdAt and updatedAt, they are auto-generated!
        id: personenKontext.id,
        personId: rel(PersonEntity, personenKontext.personId),
        organisationId: personenKontext.organisationId,
        rolleId: rel(RolleEntity, personenKontext.rolleId),
        befristung: personenKontext.befristung,
    };
}

function mapEntityToAggregate(
    entity: PersonenkontextEntity,
    personenkontextFactory: PersonenkontextFactory,
): Personenkontext<boolean> {
    return personenkontextFactory.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.revision,
        entity.personId.id,
        entity.organisationId.id,
        entity.rolleId.id,
        entity.username,
        entity.mandant,
        entity.personenstatus,
        entity.jahrgangsstufe,
        entity.sichtfreigabe,
        entity.loeschungZeitpunkt,
        entity.befristung,
    );
}

/**
 * This repo is only meant to be used in the PersonenkontexteUpdate workflow.
 */
@Injectable()
export class DBiamPersonenkontextRepoInternal {
    public constructor(
        private readonly em: EntityManager,
        private readonly personenkontextFactory: PersonenkontextFactory,
    ) {}

    public async save(personenKontext: Personenkontext<boolean>): Promise<Personenkontext<true>> {
        if (personenKontext.id) {
            return this.update(personenKontext);
        } else {
            return this.create(personenKontext);
        }
    }

    public async create(personenKontext: Personenkontext<false>): Promise<Personenkontext<true>> {
        const personenKontextEntity: PersonenkontextEntity = this.em.create(
            PersonenkontextEntity,
            mapAggregateToData(personenKontext),
        );
        await this.em.persist(personenKontextEntity).flush();

        return mapEntityToAggregate(personenKontextEntity, this.personenkontextFactory);
    }

    private async update(personenKontext: Personenkontext<true>): Promise<Personenkontext<true>> {
        const personenKontextEntity: Loaded<PersonenkontextEntity> = await this.em.findOneOrFail(
            PersonenkontextEntity,
            personenKontext.id,
        );
        personenKontextEntity.assign(mapAggregateToData(personenKontext));

        await this.em.persist(personenKontextEntity).flush();

        return mapEntityToAggregate(personenKontextEntity, this.personenkontextFactory);
    }

    public async delete(personenKontext: Personenkontext<true>): Promise<void> {
        const personId: PersonID = personenKontext.personId;
        const organisationId: OrganisationID = personenKontext.organisationId;
        const rolleId: RolleID = personenKontext.rolleId;

        await this.em.nativeDelete(PersonenkontextEntity, {
            personId: personId,
            organisationId: organisationId,
            rolleId: rolleId,
        });
    }

    public async deleteById(id: string): Promise<boolean> {
        const deletedPersons: number = await this.em.nativeDelete(PersonenkontextEntity, { id });
        return deletedPersons > 0;
    }
}
