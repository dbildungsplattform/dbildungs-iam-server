import { Test, type TestingModule } from '@nestjs/testing';
import { PersonenInfoController } from './personeninfo.controller.js';
import { PersonenInfoService } from '../../domain/personeninfo/personeninfo.service.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { type PersonPermissions } from '../../../authentication/domain/person-permissions.js';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { ConfigService } from '@nestjs/config';
import { createAuthInterceptorMock, createPersonPermissionsMock } from '../../../../../test/utils/auth.mock.js';
import { ExceedsLimitError } from '../../../../shared/error/exceeds-limit.error.js';
import { Ok } from '../../../../shared/util/result.js';
import { DomainError, EntityNotFoundError } from '../../../../shared/error/index.js';
import { type INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { SchulconnexMapperService } from '../../domain/schulconnex-mapper.service.js';
import { type Server } from 'node:http';

describe('PersonenInfoController', () => {
    let module: TestingModule;
    let controller: PersonenInfoController;
    let service: DeepMocked<PersonenInfoService>;
    let configService: DeepMocked<ConfigService>;

    beforeEach(async () => {
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

    afterEach(() => {
        vi.clearAllMocks();
    });

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
        it('should preserve the V2 HTTP response and pagination headers', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const mapper: SchulconnexMapperService = new SchulconnexMapperService();
            service.findPersonsForPersonenInfoV2.mockResolvedValue(
                Ok([
                    mapper.mapPersonInfo(
                        DoFactory.createPerson(true, { id: 'person-1', vorname: 'Anna', familienname: 'Test' }),
                        [],
                        undefined,
                        [],
                    ),
                ]),
            );
            const app: INestApplication = module.createNestApplication();
            app.enableVersioning({ type: VersioningType.URI });
            app.useGlobalInterceptors(createAuthInterceptorMock(permissions));
            await app.init();

            try {
                await request(app.getHttpServer() as Server)
                    .get('/v2/personen-info')
                    .set('x-offset', '5')
                    .set('x-limit', '15')
                    .expect(200)
                    .expect([
                        {
                            pid: 'person-1',
                            person: { name: { familiennamen: 'Test', familienname: 'Test', vorname: 'Anna' } },
                            personenkontexte: [],
                            beziehungen: [],
                        },
                    ]);
                expect(service.findPersonsForPersonenInfoV2).toHaveBeenCalledWith(permissions, 5, 15);
            } finally {
                await app.close();
            }
        });

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
