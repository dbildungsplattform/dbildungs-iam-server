import { Test, type TestingModule } from '@nestjs/testing';
import { PersonenInfoController } from './personeninfo.controller.js';
import { PersonenInfoService } from '../../domain/personeninfo/personeninfo.service.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { type PersonPermissions } from '../../../authentication/domain/person-permissions.js';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { ConfigService } from '@nestjs/config';
import { createPersonPermissionsMock } from '../../../../../test/utils/auth.mock.js';
import { ExceedsLimitError } from '../../../../shared/error/exceeds-limit.error.js';
import { Ok } from '../../../../shared/util/result.js';
import { DomainError, EntityNotFoundError } from '../../../../shared/error/index.js';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { type PersonenInfoData } from '../../domain/personeninfo/personeninfo-data.js';
import { type KontextWithOrgaAndRolle } from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { EmailAddressStatus } from '../../../email/domain/email-address.js';
import { SchulconnexPersonenstatus } from '../schulconnex-enums.js';

describe('PersonenInfoController', () => {
    let module: TestingModule;
    let controller: PersonenInfoController;
    let service: DeepMocked<PersonenInfoService>;
    let configService: DeepMocked<ConfigService>;

    beforeAll(async () => {
        configService = createMock(ConfigService);
        configService.getOrThrow.mockReturnValue({ LIMIT_PERSONENINFO: 2500 });
        module = await Test.createTestingModule({
            controllers: [PersonenInfoController],
            providers: [
                {
                    provide: PersonenInfoService,
                    useValue: createMock(PersonenInfoService),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                { provide: ConfigService, useValue: configService },
            ],
        }).compile();

        controller = module.get<PersonenInfoController>(PersonenInfoController);
        service = module.get<DeepMocked<PersonenInfoService>>(PersonenInfoService);
        configService = module.get<DeepMocked<ConfigService>>(ConfigService);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it.each([
        ['infoV1', 'findPersonsForPersonenInfoV1', 'Extern'],
        ['infoV2', 'findPersonsForPersonenInfoV2', 'SorgBer'],
    ] as const)(
        'should map domain data to the unchanged %s JSON response',
        async (
            method: 'infoV1' | 'infoV2',
            serviceMethod: 'findPersonsForPersonenInfoV1' | 'findPersonsForPersonenInfoV2',
            expectedRolle: string,
        ) => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const kontext: KontextWithOrgaAndRolle = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'kontext-1' }),
                organisation: DoFactory.createOrganisation(true, {
                    id: 'schule-1',
                    kennung: '123456',
                    name: 'Testschule',
                    typ: OrganisationsTyp.SCHULE,
                }),
                rolle: DoFactory.createRolle(true, { rollenart: RollenArt.SORGBER }),
            };
            const data: PersonenInfoData = {
                person: DoFactory.createPerson(true, { id: 'person-1', vorname: 'Anna', familienname: 'Test' }),
                kontexteWithOrgaAndRolle: [
                    kontext,
                    {
                        ...kontext,
                        organisation: DoFactory.createOrganisation(true, {
                            id: 'klasse-1',
                            name: '5a',
                            typ: OrganisationsTyp.KLASSE,
                            administriertVon: kontext.organisation.id,
                        }),
                    },
                ],
                email: { address: 'anna.test@schule-sh.de', status: EmailAddressStatus.ENABLED },
                userLocks: [],
            };
            service[serviceMethod].mockResolvedValue(Ok([data]));

            const result: object = await controller[method](permissions, '0', '10');

            expect(JSON.parse(JSON.stringify(result))).toEqual([
                {
                    pid: 'person-1',
                    person: { name: { familiennamen: 'Test', vorname: 'Anna' } },
                    personenkontexte: [
                        {
                            id: 'kontext-1',
                            organisation: { id: 'schule-1', kennung: '123456', name: 'Testschule', typ: 'Schule' },
                            rolle: expectedRolle,
                            erreichbarkeiten: [{ typ: 'E-Mail', kennung: 'anna.test@schule-sh.de' }],
                            personenstatus: SchulconnexPersonenstatus.AKTIV,
                            gruppen: [{ id: 'klasse-1', bezeichnung: '5a', typ: 'Klasse' }],
                        },
                    ],
                    beziehungen: [],
                },
            ]);
        },
    );

    describe('infoV1', () => {
        it('should parse offset and limit as integers', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV1.mockResolvedValue(Ok([]));

            await controller.infoV1(permissions, '5', '15');
            expect(service.findPersonsForPersonenInfoV1).toHaveBeenCalledWith(permissions, 5, 15);
        });

        it('should handle invalid offset and limit with fallback of page 1', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV1.mockResolvedValue(Ok([]));

            await controller.infoV1(permissions, 'invalid', 'invalid');
            expect(service.findPersonsForPersonenInfoV1).toHaveBeenCalledWith(permissions, 0, 2500);
        });

        it('should handle limit that exceeds maximum limit', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            await expect(controller.infoV1(permissions, '0', '1000000')).rejects.toBeInstanceOf(ExceedsLimitError);
        });

        it('should throw when service returns error', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            service.findPersonsForPersonenInfoV1.mockResolvedValue({
                ok: false,
                error: new EntityNotFoundError('PersonenInfo', '123'),
            });

            await expect(controller.infoV1(permissions, '0', '10')).rejects.toBeInstanceOf(DomainError);
        });

        it('should fallback offset to 0 when offset is invalid', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV1.mockResolvedValue(Ok([]));

            await controller.infoV1(permissions, 'invalid', '10');

            expect(service.findPersonsForPersonenInfoV1).toHaveBeenCalledWith(permissions, 0, 10);
        });

        it('should fallback limit to max when limit is invalid', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV1.mockResolvedValue(Ok([]));

            await controller.infoV1(permissions, '5', 'invalid');

            expect(service.findPersonsForPersonenInfoV1).toHaveBeenCalledWith(
                permissions,
                5,
                controller['maxPersonenInfoLimit'],
            );
        });
    });

    describe('infoV2', () => {
        it('should parse offset and limit as integers', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV2.mockResolvedValue(Ok([]));

            await controller.infoV2(permissions, '5', '15');
            expect(service.findPersonsForPersonenInfoV2).toHaveBeenCalledWith(permissions, 5, 15);
        });

        it('should handle invalid offset and limit with fallback of page 1', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV2.mockResolvedValue(Ok([]));

            await controller.infoV2(permissions, 'invalid', 'invalid');
            expect(service.findPersonsForPersonenInfoV2).toHaveBeenCalledWith(permissions, 0, 2500);
        });

        it('should handle limit that exceeds maximum limit', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            await expect(controller.infoV2(permissions, '0', '1000000')).rejects.toBeInstanceOf(ExceedsLimitError);
        });

        it('should throw when service returns error', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            service.findPersonsForPersonenInfoV2.mockResolvedValue({
                ok: false,
                error: new EntityNotFoundError('PersonenInfo', '123'),
            });

            await expect(controller.infoV2(permissions, '0', '10')).rejects.toBeInstanceOf(DomainError);
        });

        it('should fallback offset to 0 when offset is invalid', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV2.mockResolvedValue(Ok([]));

            await controller.infoV2(permissions, 'invalid', '10');

            expect(service.findPersonsForPersonenInfoV2).toHaveBeenCalledWith(permissions, 0, 10);
        });

        it('should fallback limit to max when limit is invalid', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            service.findPersonsForPersonenInfoV2.mockResolvedValue(Ok([]));

            await controller.infoV2(permissions, '5', 'invalid');

            expect(service.findPersonsForPersonenInfoV2).toHaveBeenCalledWith(
                permissions,
                5,
                controller['maxPersonenInfoLimit'],
            );
        });
    });
});
