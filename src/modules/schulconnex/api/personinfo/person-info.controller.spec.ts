import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { type PersonPermissions } from '../../../authentication/domain/person-permissions.js';
import { EmailAddressStatus } from '../../../email/domain/email-address.js';
import { EmailRepo } from '../../../email/persistence/email.repo.js';
import { UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../../organisation/domain/organisation.js';
import { type PersonEmailResponse } from '../../../person/api/person-email-response.js';
import { type Person } from '../../../person/domain/person.js';
import { PersonApiMapper } from '../../../person/mapper/person-api.mapper.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import { PersonenkontextResponse } from '../../../personenkontext/api/response/personenkontext.response.js';
import { type Personenkontext } from '../../../personenkontext/domain/personenkontext.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../../rolle/domain/rolle.js';
import {
    convertSPSHRollenartForBackwardsCampatibilityV1,
    SchulconnexOrganisationTyp,
    SchulconnexPersonenstatus,
    SchulconnexRolle,
} from '../schulconnex-enums.js';
import { PersonInfoController } from './person-info.controller.js';
import { PersonInfoResponse, PersonNestedInPersonInfoResponse } from './v0/person-info.response.js';
import { PersonInfoPersonResponseV1 } from './v1/person-info-person.response.v1.js';
import { PersonInfoResponseV1 } from './v1/person-info.response.v1.js';
import { ConfigTestModule, DatabaseTestModule } from '../../../../../test/utils/index.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { type IPersonPermissions } from '../../../../shared/permissions/person-permissions.interface.js';
import { EntityNotFoundError } from '../../../../shared/error/entity-not-found.error.js';
import { PersonInfoDtoV2 } from './v2/person-info.response.v2.js';
import { PersonInfoPersonDtoV2 } from './v2/person-info-person.response.v2.js';
import { SchulconnexMapperService } from '../../domain/schulconnex-mapper.service.js';
import { type INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { createAuthInterceptorMock, createPersonPermissionsMock } from '../../../../../test/utils/auth.mock.js';
import { type Server } from 'node:http';

describe('PersonInfoController', () => {
    let module: TestingModule;
    let app: INestApplication;
    let sut: PersonInfoController;
    let logger: DeepMocked<ClassLogger>;
    let personRepoMock: DeepMocked<PersonRepository>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let emailResolverService: DeepMocked<EmailResolverService>;
    let userLockRepoMock: DeepMocked<UserLockRepository>;
    let personApiMapper: DeepMocked<PersonApiMapper>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: false })],
            controllers: [PersonInfoController],
            providers: [
                SchulconnexMapperService,
                {
                    provide: PersonApiMapper,
                    useValue: createMock(PersonApiMapper),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock(UserLockRepository),
                },
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
            ],
        })
            .overrideProvider(UserLockRepository)
            .useValue(createMock(UserLockRepository))
            .compile();

        sut = module.get<PersonInfoController>(PersonInfoController);
        logger = module.get(ClassLogger);
        personRepoMock = module.get(PersonRepository);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        emailRepoMock = module.get(EmailRepo);
        emailResolverService = module.get(EmailResolverService);
        personApiMapper = module.get(PersonApiMapper);
        userLockRepoMock = module.get(UserLockRepository);
        app = module.createNestApplication();
        app.enableVersioning({ type: VersioningType.URI });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('info', () => {
        let expectedBaseNestedPersonInfo: null | PersonNestedInPersonInfoResponse = null;
        let person: null | Person<true> = null;
        let orga: null | Organisation<true> = null;
        beforeEach(() => {
            person = DoFactory.createPerson(true);
            orga = DoFactory.createOrganisation(true);
            expectedBaseNestedPersonInfo = {
                id: person.id,
                mandant: person.mandant,
                username: person.username,
                name: {
                    familiennamen: person.familienname,
                    vorname: person.vorname,
                },
                stammorganisation: person.stammorganisation,
                personalnummer: person.personalnummer,
                revision: person.revision,
                dienststellen: [],
            };
        });
        describe('when person exists', () => {
            it('should return person info with loeschung old Repo', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);

                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoResponse = await sut.info(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponse);
                expect(result.person).toBeInstanceOf(PersonNestedInPersonInfoResponse);
                expect(result.person).toEqual({ ...expectedBaseNestedPersonInfo, dienststellen: [orga!.kennung] });

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using old emailRepo`));
                expect(result.pid).toEqual(person?.id);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(orga?.typ);
                expect(result.personenkontexte.at(0)?.rollenart).toEqual(
                    convertSPSHRollenartForBackwardsCampatibilityV1(rolle.rollenart),
                );
                expect(result.personenkontexte.at(0)?.rollenname).toEqual(rolle.name);
                expect(result.gruppen).toEqual([]);
                expect(result.email).toEqual(undefined);
            });
            it('should return person info with loeschung new Microservice', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: faker.helpers.enumValue(EmailAddressStatus),
                };
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailResolverService.findEmailBySpshPerson.mockResolvedValueOnce(email);

                const result: PersonInfoResponse = await sut.info(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponse);
                expect(result.person).toBeInstanceOf(PersonNestedInPersonInfoResponse);
                expect(result.person).toEqual({ ...expectedBaseNestedPersonInfo, dienststellen: [orga!.kennung] });

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using new Microservice`));
                expect(result.pid).toEqual(person?.id);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(orga?.typ);
                expect(result.personenkontexte.at(0)?.rollenart).toEqual(
                    convertSPSHRollenartForBackwardsCampatibilityV1(rolle.rollenart),
                );
                expect(result.personenkontexte.at(0)?.rollenname).toEqual(rolle.name);
                expect(result.gruppen).toEqual([]);
                expect(result.email).toEqual({
                    address: email.address,
                    status: email.status,
                });
            });
            it('should return person info with no loeschungZeitpunkt', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);

                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: faker.helpers.enumValue(EmailAddressStatus),
                };
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: undefined,
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);

                const result: PersonInfoResponse = await sut.info(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponse);
                expect(result.person).toBeInstanceOf(PersonNestedInPersonInfoResponse);
                expect(result.person).toEqual({ ...expectedBaseNestedPersonInfo, dienststellen: [orga!.kennung] });

                expect(result.pid).toEqual(person?.id);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(orga?.typ);
                expect(result.personenkontexte.at(0)?.rollenart).toEqual(
                    convertSPSHRollenartForBackwardsCampatibilityV1(rolle.rollenart),
                );
                expect(result.personenkontexte.at(0)?.rollenname).toEqual(rolle.name);
                expect(result.gruppen).toEqual([]);
                expect(result.email).toEqual({
                    address: email.address,
                    status: email.status,
                });
            });
            it('should return person info with empty dnr array and no kontexte', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);

                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: faker.helpers.enumValue(EmailAddressStatus),
                };
                orga!.kennung = undefined;
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);

                const result: PersonInfoResponse = await sut.info(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponse);
                expect(result.person).toBeInstanceOf(PersonNestedInPersonInfoResponse);
                expect(result.person).toEqual({ ...expectedBaseNestedPersonInfo, dienststellen: [] });

                expect(result.pid).toEqual(person?.id);
                expect(result.personenkontexte.length).toEqual(0);
                expect(result.gruppen).toEqual([]);
                expect(result.email).toEqual({
                    address: email.address,
                    status: email.status,
                });
            });
        });

        describe('when person does not exist', () => {
            it('should return null', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;

                personRepoMock.findById.mockResolvedValue(null);

                await expect(() => sut.info(permissions)).rejects.toBeInstanceOf(EntityNotFoundError);
            });
        });
    });

    describe('infoV1', () => {
        let person: null | Person<true> = null;
        let orga: null | Organisation<true> = null;
        beforeEach(() => {
            person = DoFactory.createPerson(true);
            orga = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            emailResolverService.shouldUseEmailMicroservice.mockReturnValue(false);
        });
        describe('when person exists', () => {
            it('should return person info for locked person with kontext at land old Repo', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);

                const orgaLand: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.SYSADMIN });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orgaLand);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([createMock(UserLock)]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orgaLand,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoResponseV1 = await sut.infoV1(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponseV1);
                expect(result.person).toBeInstanceOf(PersonInfoPersonResponseV1);

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using old emailRepo`));
                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orgaLand?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orgaLand?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orgaLand?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SONSTIGE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(undefined);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.SYSADMIN);
            });
            it('should return person info for locked person with kontext at land new Microservice', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                const orgaLand: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.SYSADMIN });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orgaLand);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([createMock(UserLock)]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orgaLand,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailResolverService.findEmailBySpshPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoResponseV1 = await sut.infoV1(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponseV1);
                expect(result.person).toBeInstanceOf(PersonInfoPersonResponseV1);

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using new Microservice`));
                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orgaLand?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orgaLand?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orgaLand?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SONSTIGE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(undefined);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.SYSADMIN);
            });
            it('should return person info for Lehrer with Email with Schul-kontext and no gruppen', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: EmailAddressStatus.ENABLED,
                };
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LEHR });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);

                const result: PersonInfoResponseV1 = await sut.infoV1(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponseV1);
                expect(result.person).toBeInstanceOf(PersonInfoPersonResponseV1);

                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SCHULE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.LEHR);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(SchulconnexPersonenstatus.AKTIV);
                expect(result.personenkontexte.at(0)?.erreichbarkeiten.at(0)?.kennung).toEqual(email.address);
            });
            it('should return person info without Email with Schul-kontext and no gruppen', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: EmailAddressStatus.DISABLED,
                };
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.ORGADMIN });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);

                const result: PersonInfoResponseV1 = await sut.infoV1(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponseV1);
                expect(result.person).toBeInstanceOf(PersonInfoPersonResponseV1);

                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SCHULE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.ORGADMIN);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(SchulconnexPersonenstatus.AKTIV);
                expect(result.personenkontexte.at(0)?.erreichbarkeiten.length).toEqual(0);
            });
            it('should return person info for Schueler with gruppen', async () => {
                const klasse1: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: orga?.id,
                    zugehoerigZu: orga?.id,
                    typ: OrganisationsTyp.KLASSE,
                });
                const klasse2: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: orga?.id,
                    zugehoerigZu: orga?.id,
                    typ: OrganisationsTyp.KLASSE,
                    name: undefined,
                });
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;

                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LERN });
                const kontextSchule: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const kontextKlasse1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(klasse1);
                    },
                });
                const kontextKlasse2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(klasse2);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
                    kontextSchule,
                    kontextKlasse1,
                    kontextKlasse2,
                ]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontextSchule,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                    {
                        personenkontext: kontextKlasse1,
                        organisation: klasse1,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                    {
                        personenkontext: kontextKlasse2,
                        organisation: klasse2,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoResponseV1 = await sut.infoV1(permissions);
                expect(result).toBeInstanceOf(PersonInfoResponseV1);
                expect(result.person).toBeInstanceOf(PersonInfoPersonResponseV1);

                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontextSchule.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SCHULE);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(SchulconnexPersonenstatus.AKTIV);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.LERN);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(2);
            });
        });

        describe('when person does not exist', () => {
            it('should return null', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;

                personRepoMock.findById.mockResolvedValue(null);

                await expect(() => sut.infoV1(permissions)).rejects.toBeInstanceOf(EntityNotFoundError);
            });
        });
    });

    describe('infoV2', () => {
        let person: null | Person<true> = null;
        let orga: null | Organisation<true> = null;
        beforeEach(() => {
            person = DoFactory.createPerson(true);
            orga = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            emailResolverService.shouldUseEmailMicroservice.mockReturnValue(false);
        });
        describe('when person exists', () => {
            it('should return person info for locked person with kontext at land old Repo', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(false);

                const orgaLand: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.SYSADMIN });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orgaLand);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([createMock(UserLock)]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orgaLand,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoDtoV2 = await sut.infoV2(permissions);
                expect(result).toBeInstanceOf(PersonInfoDtoV2);
                expect(result.person).toBeInstanceOf(PersonInfoPersonDtoV2);

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using old emailRepo`));
                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orgaLand?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orgaLand?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orgaLand?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SONSTIGE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(undefined);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.SYSADMIN);
            });
            it('should return person info for locked person with kontext at land new Microservice', async () => {
                emailResolverService.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                const orgaLand: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.SYSADMIN });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orgaLand);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([createMock(UserLock)]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orgaLand,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailResolverService.findEmailBySpshPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoDtoV2 = await sut.infoV2(permissions);
                expect(result).toBeInstanceOf(PersonInfoDtoV2);
                expect(result.person).toBeInstanceOf(PersonInfoPersonDtoV2);

                expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`using new Microservice`));
                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orgaLand?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orgaLand?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orgaLand?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SONSTIGE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(undefined);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.SYSADMIN);
            });
            it('should return person info for Lehrer with Email with Schul-kontext and no gruppen', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: EmailAddressStatus.ENABLED,
                };
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LEHR });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);

                const result: PersonInfoDtoV2 = await sut.infoV2(permissions);
                expect(result).toBeInstanceOf(PersonInfoDtoV2);
                expect(result.person).toBeInstanceOf(PersonInfoPersonDtoV2);

                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SCHULE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.LEHR);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(SchulconnexPersonenstatus.AKTIV);
                expect(result.personenkontexte.at(0)?.erreichbarkeiten.at(0)?.kennung).toEqual(email.address);
            });
            it('should return person info without Email with Schul-kontext and no gruppen', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;
                const email: PersonEmailResponse = {
                    address: faker.internet.email(),
                    status: EmailAddressStatus.DISABLED,
                };
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.ORGADMIN });
                const kontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([kontext]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontext,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(email);

                const result: PersonInfoDtoV2 = await sut.infoV2(permissions);
                expect(result).toBeInstanceOf(PersonInfoDtoV2);
                expect(result.person).toBeInstanceOf(PersonInfoPersonDtoV2);

                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontext.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SCHULE);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(0);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.ORGADMIN);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(SchulconnexPersonenstatus.AKTIV);
                expect(result.personenkontexte.at(0)?.erreichbarkeiten.length).toEqual(0);
            });
            it('should return person info for Schueler with gruppen', async () => {
                const klasse1: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: orga?.id,
                    zugehoerigZu: orga?.id,
                    typ: OrganisationsTyp.KLASSE,
                });
                const klasse2: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: orga?.id,
                    zugehoerigZu: orga?.id,
                    typ: OrganisationsTyp.KLASSE,
                    name: undefined,
                });
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;

                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LERN });
                const kontextSchule: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(orga);
                    },
                });
                const kontextKlasse1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(klasse1);
                    },
                });
                const kontextKlasse2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    loeschungZeitpunkt: new Date(),
                    getRolle: () => Promise.resolve(rolle),
                    getOrganisation() {
                        return Promise.resolve(klasse2);
                    },
                });
                const personenkontextResponseMock: PersonenkontextResponse = createMock(PersonenkontextResponse);

                userLockRepoMock.findByPersonId.mockResolvedValue([]);
                personRepoMock.findById.mockResolvedValue(person);
                personApiMapper.mapToPersonenkontextResponse.mockResolvedValueOnce(personenkontextResponseMock);
                personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
                    kontextSchule,
                    kontextKlasse1,
                    kontextKlasse2,
                ]);
                personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValueOnce([
                    {
                        personenkontext: kontextSchule,
                        organisation: orga!,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                    {
                        personenkontext: kontextKlasse1,
                        organisation: klasse1,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                    {
                        personenkontext: kontextKlasse2,
                        organisation: klasse2,
                        rolle: rolle,
                    } satisfies KontextWithOrgaAndRolle,
                ]);
                emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValueOnce(undefined);

                const result: PersonInfoDtoV2 = await sut.infoV2(permissions);
                expect(result).toBeInstanceOf(PersonInfoDtoV2);
                expect(result.person).toBeInstanceOf(PersonInfoPersonDtoV2);

                expect(result.pid).toEqual(person?.id);
                expect(result.person.name.vorname).toEqual(person?.vorname);
                expect(result.person.name.familiennamen).toEqual(person?.familienname);
                expect(result.personenkontexte.length).toEqual(1);
                expect(result.personenkontexte.at(0)?.id).toEqual(kontextSchule.id);
                expect(result.personenkontexte.at(0)?.organisation.id).toEqual(orga?.id);
                expect(result.personenkontexte.at(0)?.organisation.kennung).toEqual(orga?.kennung);
                expect(result.personenkontexte.at(0)?.organisation.name).toEqual(orga?.name);
                expect(result.personenkontexte.at(0)?.organisation.typ).toEqual(SchulconnexOrganisationTyp.SCHULE);
                expect(result.personenkontexte.at(0)?.personenstatus).toEqual(SchulconnexPersonenstatus.AKTIV);
                expect(result.personenkontexte.at(0)?.rolle).toEqual(SchulconnexRolle.LERN);
                expect(result.personenkontexte.at(0)?.gruppen.length).toEqual(2);
            });
        });

        describe('when person does not exist', () => {
            it('should return null', async () => {
                const permissions: IPersonPermissions = {
                    personFields: {
                        id: faker.string.uuid(),
                    },
                } as PersonPermissions;

                personRepoMock.findById.mockResolvedValue(null);

                await expect(() => sut.infoV2(permissions)).rejects.toBeInstanceOf(EntityNotFoundError);
            });
        });
    });

    it('should preserve the V2 HTTP response', async () => {
        const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock({ id: 'person-1' });
        const person: Person<true> = DoFactory.createPerson(true, {
            id: 'person-1',
            vorname: 'Anna',
            familienname: 'Test',
        });
        const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
            id: 'schule-1',
            kennung: '123456',
            name: 'Testschule',
            typ: OrganisationsTyp.SCHULE,
        });
        emailResolverService.shouldUseEmailMicroservice.mockReturnValue(false);
        personRepoMock.findById.mockResolvedValue(person);
        personenkontextRepoMock.findByPersonWithOrgaAndRolle.mockResolvedValue([
            {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'kontext-1' }),
                organisation,
                rolle: DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }),
            },
        ]);
        userLockRepoMock.findByPersonId.mockResolvedValue([]);
        emailRepoMock.getEmailAddressAndStatusForPerson.mockResolvedValue({
            address: 'anna@example.org',
            status: EmailAddressStatus.ENABLED,
        });
        app.useGlobalInterceptors(createAuthInterceptorMock(permissions));
        await app.init();

        await request(app.getHttpServer() as Server)
            .get('/v2/person-info')
            .expect(200)
            .expect({
                pid: 'person-1',
                person: { name: { familiennamen: 'Test', vorname: 'Anna' } },
                personenkontexte: [
                    {
                        id: 'kontext-1',
                        organisation: { id: 'schule-1', kennung: '123456', name: 'Testschule', typ: 'Schule' },
                        rolle: 'Lehr',
                        erreichbarkeiten: [{ typ: 'E-Mail', kennung: 'anna@example.org' }],
                        personenstatus: 'Aktiv',
                        gruppen: [],
                    },
                ],
                beziehungen: [],
            });
    });
});
