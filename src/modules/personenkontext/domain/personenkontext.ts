import { type DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { type OrganisationID, type PersonID, type PersonUsername, type RolleID } from '../../../shared/types/index.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type PersonRepository } from '../../person/persistence/person.repository.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Jahrgangsstufe, type Personenstatus, type SichtfreigabeType } from './personenkontext.enums.js';

export type PersonenkontextPartial = Pick<
    Personenkontext<boolean>,
    'id' | 'createdAt' | 'updatedAt' | 'personId' | 'organisationId' | 'rolleId'
>;
export function mapAggregateToPartial(personenkontext: Personenkontext<boolean>): PersonenkontextPartial {
    return {
        id: personenkontext.id,
        createdAt: personenkontext.createdAt,
        updatedAt: personenkontext.updatedAt,
        personId: personenkontext.personId,
        organisationId: personenkontext.organisationId,
        rolleId: personenkontext.rolleId,
    };
}

export class Personenkontext<WasPersisted extends boolean> {
    private constructor(
        private readonly personRepository: PersonRepository,
        private readonly organisationRepository: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public readonly personId: PersonID,
        public readonly organisationId: OrganisationID,
        public readonly rolleId: RolleID,
        // new
        public readonly username: PersonUsername | undefined,
        public readonly mandant: string | undefined,
        public readonly personenstatus: Personenstatus | undefined,
        public readonly jahrgangsstufe: Jahrgangsstufe | undefined,
        public readonly sichtfreigabe: SichtfreigabeType | undefined,
        public readonly loeschungZeitpunkt: Date | undefined,
        public readonly revision: Persisted<string, WasPersisted>,
        public readonly befristung: Date | undefined,
    ) {}

    public static construct<WasPersisted extends boolean = false>(
        personRepository: PersonRepository,
        organisationRepository: OrganisationRepository,
        rolleRepo: RolleRepo,
        id: Persisted<string, WasPersisted>,
        createdAt: Persisted<Date, WasPersisted>,
        updatedAt: Persisted<Date, WasPersisted>,
        personId: PersonID,
        organisationId: OrganisationID,
        rolleId: RolleID,
        // new params
        username: PersonUsername | undefined = undefined,
        mandant: string | undefined = undefined,
        personenstatus: Personenstatus | undefined = undefined,
        jahrgangsstufe: Jahrgangsstufe | undefined = undefined,
        sichtfreigabe: SichtfreigabeType | undefined = undefined,
        loeschungZeitpunkt: Date | undefined = undefined,
        revision: Persisted<string, WasPersisted> = '1',
        befristung: Date | undefined = undefined,
    ): Personenkontext<WasPersisted> {
        return new Personenkontext(
            personRepository,
            organisationRepository,
            rolleRepo,
            id,
            createdAt,
            updatedAt,
            personId,
            organisationId,
            rolleId,
            // new fields
            username,
            mandant,
            personenstatus,
            jahrgangsstufe,
            sichtfreigabe,
            loeschungZeitpunkt,
            revision,
            befristung,
        );
    }

    public static createNew(
        personRepository: PersonRepository,
        organisationRepository: OrganisationRepository,
        rolleRepo: RolleRepo,
        personId: PersonID,
        organisationId: OrganisationID,
        rolleId: RolleID,
        // new fields
        username: PersonUsername | undefined = undefined,
        mandant: string | undefined = undefined,
        personenstatus: Personenstatus | undefined = undefined,
        jahrgangsstufe: Jahrgangsstufe | undefined = undefined,
        sichtfreigabe: SichtfreigabeType | undefined = undefined,
        loeschungZeitpunkt: Date | undefined = undefined,
        befristung: Date | undefined = undefined,
    ): Personenkontext<false> {
        return new Personenkontext(
            personRepository,
            organisationRepository,
            rolleRepo,
            undefined,
            undefined,
            undefined,
            personId,
            organisationId,
            rolleId,
            // new
            username,
            mandant,
            personenstatus,
            jahrgangsstufe,
            sichtfreigabe,
            loeschungZeitpunkt,
            undefined,
            befristung,
        );
    }

    public async checkReferences(): Promise<Option<DomainError>> {
        const [personExists, orga, rolle]: [boolean, Option<Organisation<true>>, Option<Rolle<true>>] =
            await Promise.all([
                this.personRepository.exists(this.personId),
                this.organisationRepository.findById(this.organisationId),
                this.rolleRepo.findById(this.rolleId),
            ]);

        if (!personExists) {
            return new EntityNotFoundError('Person', this.personId);
        }

        if (!orga) {
            return new EntityNotFoundError('Organisation', this.organisationId);
        }

        if (!rolle) {
            return new EntityNotFoundError('Rolle', this.rolleId);
        }

        // Can rolle be assigned at target orga
        const canAssignRolle: Result<void, EntityNotFoundError | OrganisationMatchesRollenartError> =
            await rolle.canBeAssignedToOrga(orga);
        if (!canAssignRolle.ok) {
            return canAssignRolle.error;
        }

        return undefined;
    }

    public async checkPermissions(permissions: IPersonPermissions): Promise<Option<DomainError>> {
        // Check if logged in person has permission
        {
            const hasPermissionAtOrga: boolean = await permissions.hasSystemrechteAtOrganisation(this.organisationId, [
                RollenSystemRecht.PERSONEN_VERWALTEN,
            ]);

            // Missing permission on orga
            if (!hasPermissionAtOrga) {
                return new MissingPermissionsError('Unauthorized to manage persons at the organisation');
            }
        }

        // Check if logged in user can modify target person
        {
            const canModifyPerson: boolean = await permissions.canModifyPerson(this.personId);

            if (!canModifyPerson) {
                return new MissingPermissionsError('Not authorized to manage this person');
            }
        }

        return undefined;
    }

    public async getRolle(): Promise<Option<Rolle<true>>> {
        return this.rolleRepo.findById(this.rolleId);
    }

    public async getOrganisation(): Promise<Option<Organisation<true>>> {
        return this.organisationRepository.findById(this.organisationId);
    }
}
