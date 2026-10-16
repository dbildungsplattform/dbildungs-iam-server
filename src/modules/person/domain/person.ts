import { DomainError, MismatchedRevisionError } from '../../../shared/error/index.js';
import { PersonExternalIdType } from './person.enums.js';
import { UsernameGeneratorService } from './username-generator.service.js';
import { NameValidator } from '../../../shared/validation/name-validator.js';
import { VornameForPersonWithTrailingSpaceError } from './vorname-with-trailing-space.error.js';
import { FamiliennameForPersonWithTrailingSpaceError } from './familienname-with-trailing-space.error.js';
import { PersonalNummerForPersonWithTrailingSpaceError } from './personalnummer-with-trailing-space.error.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { generatePassword } from '../../../shared/util/password-generator.js';

type PasswordInternalState = { passwordInternal: string | undefined; isTemporary: boolean };

export type PersonCreationParams = {
    id?: number;
    familienname: string;
    vorname: string;
    stammorganisation?: string;
    username?: string;
    password?: string;
    personalnummer?: string;
    userLock?: UserLock[];
    isLocked?: boolean;
    orgUnassignmentDate?: Date;
    istTechnisch?: boolean;
    externalIds?: Partial<Record<PersonExternalIdType, string>>;
};

export class Person<WasPersisted extends boolean> {
    public static readonly CREATE_PERSON_DTO_MANDANT_UUID: string = '8c6a9447-c23e-4e70-8595-3bcc88a5577a';

    private passwordInternalState: PasswordInternalState = {
        passwordInternal: undefined,
        isTemporary: true,
    };

    public readonly mandant: string;

    private constructor(
        public id: Persisted<string, WasPersisted>,
        public createdAt: Persisted<Date, WasPersisted>,
        public updatedAt: Persisted<Date, WasPersisted>,
        public familienname: string,
        public vorname: string,
        public revision: string,
        public username: string | undefined,
        public keycloakUserId: string | undefined,
        public stammorganisation: string | undefined,
        public personalnummer: string | undefined,
        public userLock: UserLock[],
        public orgUnassignmentDate: Date | undefined,
        public isLocked: boolean | undefined,
        public oxUserId: string | undefined,
        public istTechnisch: boolean,
        public externalIds: Partial<Record<PersonExternalIdType, string>>,
    ) {
        this.mandant = Person.CREATE_PERSON_DTO_MANDANT_UUID;
    }

    public get newPassword(): string | undefined {
        return this.passwordInternalState?.passwordInternal ?? undefined;
    }

    public get isNewPasswordTemporary(): boolean {
        return this.passwordInternalState.isTemporary;
    }

    public static construct<WasPersisted extends boolean = false>(
        id: Persisted<string, WasPersisted>,
        createdAt: Persisted<Date, WasPersisted>,
        updatedAt: Persisted<Date, WasPersisted>,
        familienname: string,
        vorname: string,
        revision: string,
        username?: string,
        keycloakUserId?: string,
        stammorganisation?: string,
        personalnummer?: string,
        orgUnassignmentDate?: Date,
        userLock: UserLock[] = [],
        isLocked?: boolean,
        oxUserId?: string,
        istTechnisch?: boolean,
        externalIds?: Partial<Record<PersonExternalIdType, string>>,
    ): Person<WasPersisted> {
        return new Person(
            id,
            createdAt,
            updatedAt,
            familienname,
            vorname,
            revision,
            username,
            keycloakUserId,
            stammorganisation,
            personalnummer,
            userLock,
            orgUnassignmentDate,
            isLocked,
            oxUserId,
            istTechnisch ?? false,
            externalIds ?? {},
        );
    }

    public static async createNew(
        usernameGenerator: UsernameGeneratorService,
        creationParams: PersonCreationParams,
    ): Promise<Person<false> | DomainError> {
        // Validate the Vor - and Nachname
        if (!NameValidator.isNameValid(creationParams.vorname)) {
            return new VornameForPersonWithTrailingSpaceError();
        }
        if (!NameValidator.isNameValid(creationParams.familienname)) {
            return new FamiliennameForPersonWithTrailingSpaceError();
        }
        if (creationParams.personalnummer && !NameValidator.isNameValid(creationParams.personalnummer)) {
            return new PersonalNummerForPersonWithTrailingSpaceError();
        }
        const person: Person<false> = new Person(
            undefined,
            undefined,
            undefined,
            creationParams.familienname,
            creationParams.vorname,
            '1',
            undefined, //username
            undefined, //keycloakUserId
            creationParams.stammorganisation,
            creationParams.personalnummer,
            creationParams.userLock ?? [],
            creationParams.orgUnassignmentDate,
            undefined,
            undefined,
            creationParams.istTechnisch ?? false,
            creationParams.externalIds ?? {},
        );

        if (creationParams.password) {
            person.passwordInternalState.passwordInternal = creationParams.password;
            person.passwordInternalState.isTemporary = false;
        } else {
            person.resetPassword();
        }

        if (creationParams.username) {
            person.username = creationParams.username;
        } else {
            const result: Result<string, DomainError> = await usernameGenerator.generateUsername(
                person.vorname,
                person.familienname,
            );
            if (!result.ok) {
                return result.error;
            }
            person.username = result.value;
        }

        return person;
    }

    public update(
        revision: string,
        familienname?: string,
        vorname?: string,
        username?: string,
        stammorganisation?: string,
        personalnummer?: string,
        userLock?: UserLock[],
        orgUnassignmentDate?: Date,
        isLocked?: boolean,
        istTechnisch?: boolean,
        externalIds?: Partial<Record<PersonExternalIdType, string>>,
    ): void | DomainError {
        if (this.revision !== revision) {
            return new MismatchedRevisionError(
                `Revision ${revision} does not match revision ${this.revision} of stored person.`,
            );
        }
        const newRevision: string = (parseInt(this.revision) + 1).toString();

        if (vorname && !NameValidator.isNameValid(vorname)) {
            return new VornameForPersonWithTrailingSpaceError();
        }
        if (familienname && !NameValidator.isNameValid(familienname)) {
            return new FamiliennameForPersonWithTrailingSpaceError();
        }

        if (personalnummer && !NameValidator.isNameValid(personalnummer)) {
            return new PersonalNummerForPersonWithTrailingSpaceError();
        }

        this.familienname = familienname ?? this.familienname;
        this.vorname = vorname ?? this.vorname;
        this.username = username ?? this.username;
        this.stammorganisation = stammorganisation;
        this.revision = newRevision;
        this.personalnummer = personalnummer ?? this.personalnummer;
        this.orgUnassignmentDate = orgUnassignmentDate ?? this.orgUnassignmentDate;
        this.isLocked = isLocked;
        this.userLock = userLock ?? [];
        if (istTechnisch !== undefined) {
            this.istTechnisch = istTechnisch;
        }
        this.externalIds = externalIds ?? this.externalIds;
    }

    public resetPassword(): void {
        this.passwordInternalState.passwordInternal = generatePassword();
    }
}
