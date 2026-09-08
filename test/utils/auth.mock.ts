import { faker } from '@faker-js/faker';
import {
    BaseClient,
    ClientMetadata,
    Issuer,
    IssuerMetadata,
    UserinfoResponse as OidcUserinfoResponse,
} from 'openid-client';
import { UserinfoResponse } from '../../src/modules/authentication/api/userinfo.response.js';
import {
    PermittedOrgas,
    PersonenkontextRolleWithOrganisation,
    PersonFields,
    PersonPermissions,
} from '../../src/modules/authentication/domain/person-permissions.js';
import { IPersonPermissions } from '../../src/shared/permissions/person-permissions.interface.js';
import { createMock, DeepMocked } from './createMock.js';
import { PassportUser } from '../../src/modules/authentication/types/user.js';
import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { OrganisationsTyp } from '../../src/modules/organisation/domain/organisation.enums.js';
import { Personenkontext } from '../../src/modules/personenkontext/domain/personenkontext.js';
import { RollenSystemRecht } from '../../src/modules/rolle/domain/systemrecht.js';
import { RolleID } from '../../src/shared/types/aggregate-ids.types.js';
import { StepUpLevel } from '../../src/modules/authentication/passport/oidc.strategy.js';

export class PersonPermissionsMock implements IPersonPermissions {
    public id: string;
    public personFields: PersonFields;

    public constructor() {
        this.id = '';
        this.personFields = {
            id: faker.string.uuid(),
            keycloakUserId: faker.string.uuid(),
            vorname: faker.person.firstName(),
            familienname: faker.person.lastName(),
            username: faker.internet.username(),
            updatedAt: faker.date.past(),
        };
    }

    public hasSystemrechteAtRootOrganisation(
        _systemrechte: RollenSystemRecht[],
        _matchAll?: boolean,
    ): Promise<boolean> {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Method not implemented.');
    }
    public getOrgIdsWithSystemrecht(
        _systemrechte: RollenSystemRecht[],
        _withChildren: boolean,
        _matchAll?: boolean,
    ): Promise<PermittedOrgas> {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Method not implemented.');
    }
    public getRoleIds(): Promise<RolleID[]> {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Method not implemented.');
    }
    public getPersonenkontextIds(): Promise<Pick<Personenkontext<true>, 'organisationId' | 'rolleId'>[]> {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Method not implemented.');
    }
    public getPersonenkontexteWithRolesAndOrgs(): Promise<PersonenkontextRolleWithOrganisation[]> {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Method not implemented.');
    }
    public hasOrgVerwaltenRechtAtOrga(_typ: OrganisationsTyp, _administriertVon?: string): Promise<boolean> {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Method not implemented.');
    }
    public hasSystemrechteAtOrganisation(): Promise<boolean> {
        return Promise.resolve(true);
    }

    public hasSystemrechtAtOrganisation(): Promise<boolean> {
        return Promise.resolve(true);
    }

    public canModifyPerson(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

export function createPersonPermissionsMock(personFields?: Partial<PersonFields>): DeepMocked<PersonPermissions> {
    const personPermissions: DeepMocked<PersonPermissions> = createMock(PersonPermissions);
    personPermissions.hasSystemrechteAtOrganisation = vi.fn().mockResolvedValue(true);
    personPermissions.hasSystemrechtAtOrganisation = vi.fn().mockResolvedValue(true);
    personPermissions.canModifyPerson = vi.fn().mockResolvedValue(true);
    personPermissions.getPersonenkontexteWithRolesAndOrgs = vi.fn().mockResolvedValue([]);

    const personFieldsWithDefaults: PersonFields = {
        id: personFields?.id ?? faker.string.uuid(),
        keycloakUserId: personFields?.keycloakUserId ?? faker.string.uuid(),
        vorname: personFields?.vorname ?? faker.person.firstName(),
        familienname: personFields?.familienname ?? faker.person.lastName(),
        username: personFields?.username ?? faker.internet.username(),
        updatedAt: personFields?.updatedAt ?? faker.date.past(),
    };

    // define cached fields so that "isPersonPermissions" type guard works correctly in tests
    Object.defineProperty(personPermissions, 'cachedPersonenkontextsFields', []);
    Object.defineProperty(personPermissions, 'cachedRollenFields', []);
    Object.defineProperty(personPermissions, 'cachedPersonFields', personFieldsWithDefaults);

    Object.defineProperty(personPermissions, 'personFields', {
        get: vi.fn(() => personFieldsWithDefaults),
    });
    return personPermissions;
}

export function createUserinfoResponseMock(): DeepMocked<OidcUserinfoResponse> {
    return createMock(UserinfoResponse) as unknown as DeepMocked<OidcUserinfoResponse>;
}

export function createPassportUserMock(personPermissions?: PersonPermissions): PassportUser {
    return {
        userinfo: createUserinfoResponseMock(),
        personPermissions: () => Promise.resolve(personPermissions ?? createPersonPermissionsMock()),
        id_token: faker.string.uuid(),
        access_token: faker.string.uuid(),
        refresh_token: faker.string.uuid(),
        stepUpLevel: StepUpLevel.GOLD,
    };
}

export function createOidcClientMock(clientFields?: Partial<BaseClient>): DeepMocked<BaseClient> {
    // add more properties as needed
    const client: DeepMocked<BaseClient> = {
        introspect: vi.fn().mockResolvedValue({ scope: 'openid', active: true }),
        refresh: vi.fn(),
        userinfo: vi.fn(),
        endSessionUrl: vi.fn().mockReturnValue(faker.internet.url()),
        metadata: {} as ClientMetadata,
        issuer: { metadata: {} as IssuerMetadata } as Issuer,
    } as DeepMocked<BaseClient>;
    return Object.assign(client, clientFields);
}

export function createAuthInterceptorMock(personPermissions?: PersonPermissions): NestInterceptor {
    return {
        intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
            const req: Request = context.switchToHttp().getRequest();
            req.passportUser = createPassportUserMock(personPermissions ?? createPersonPermissionsMock());
            return next.handle();
        },
    };
}
