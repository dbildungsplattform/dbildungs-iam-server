import { faker } from '@faker-js/faker';
import { createPersonPermissionsMock, DoFactory } from '../../../test/utils/index.js';
import { createMock, DeepMocked } from '../../../test/utils/createMock.js';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { OrganisationID } from '../../shared/types/index.js';
import { Organisation } from '../organisation/domain/organisation.js';
import { OrganisationRepository } from '../organisation/persistence/organisation.repository.js';
import { Personenkontext } from '../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { Rolle } from '../rolle/domain/rolle.js';
import { RollenMerkmal } from '../rolle/domain/rolle.enums.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../rolle/domain/systemrecht.js';
import {
    EscalatedPermissionAtOrga,
    EscalatedPersonPermissions,
    isEscalatedPersonPermissions,
} from './escalated-person-permissions.js';
import { Mock } from 'vitest';
import { OrganisationsTyp } from '../organisation/domain/organisation.enums.js';
import {
    PermittedOrgas,
    PersonenkontextRolleWithOrganisation,
    PersonFields,
    PersonPermissions,
} from '../authentication/domain/person-permissions.js';

describe('EscalatedPersonPermission', () => {
    const organisationRepo: DeepMocked<OrganisationRepository> =
        createMock<OrganisationRepository>(OrganisationRepository);
    Object.defineProperty(organisationRepo, 'ROOT_ORGANISATION_ID', {
        value: 'ROOT_ID',
        writable: false,
    });
    const rootOrga: Organisation<true> = DoFactory.createOrganisation(true, { id: 'ROOT_ID' });
    const oeffentlicheSchuleOrga: Organisation<true> = DoFactory.createOrganisation(true, {
        administriertVon: 'ROOT_ID',
    });

    const personenkontextRepo: DeepMocked<DBiamPersonenkontextRepo> =
        createMock<DBiamPersonenkontextRepo>(DBiamPersonenkontextRepo);
    const logger: DeepMocked<ClassLogger> = createMock<ClassLogger>(ClassLogger);

    describe('isEscalatedPersonPermissions', () => {
        it('should return true for an EscalatedPersonPermissions instance', () => {
            const instance: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'test' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            expect(isEscalatedPersonPermissions(instance)).toBe(true);
        });

        it('should return false for a plain object', () => {
            expect(isEscalatedPersonPermissions({})).toBe(false);
        });

        it('should return false for object with wrong brand', () => {
            expect(isEscalatedPersonPermissions({ brand: 'WRONG_BRAND' })).toBe(false);
        });
    });

    describe('hasSystemrechteAtOrganisation', () => {
        describe('when permission is escalated at root', () => {
            it('should return true if permission is escalated for all systemrechte', async () => {
                organisationRepo.findParentOrgasForIds.mockResolvedValue([rootOrga, oeffentlicheSchuleOrga]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [{ orgaId: 'ROOT', systemrechte: 'ALL' }],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation('someOrgaId', [
                        RollenSystemRecht.PERSONEN_VERWALTEN,
                    ]),
                ).resolves.toBe(true);
            });

            it('should return false if permission is not escalated at root, but necessary orga is root', async () => {
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: 'someOtherOrgaId',
                            systemrechte: [
                                RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                                RollenSystemRechtEnum.ANGEBOTE_VERWALTEN,
                            ],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation('ROOT_ID', [
                        RollenSystemRecht.PERSONEN_VERWALTEN,
                    ]),
                ).resolves.toBe(false);
            });

            it('should return true if permission is escalated for all necessary systemrechte', async () => {
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: 'ROOT_ID',
                            systemrechte: [
                                RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                                RollenSystemRechtEnum.PERSONEN_ANLEGEN,
                                RollenSystemRechtEnum.ANGEBOTE_VERWALTEN,
                            ],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation('ROOT_ID', [
                        RollenSystemRecht.PERSONEN_VERWALTEN,
                        RollenSystemRecht.ANGEBOTE_VERWALTEN,
                    ]),
                ).resolves.toBe(true);
            });

            it('should return false if permission is not escalated for all necessary systemrechte', async () => {
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: 'ROOT_ID',
                            systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation('ROOT_ID', [
                        RollenSystemRecht.PERSONEN_VERWALTEN,
                        RollenSystemRecht.ANGEBOTE_VERWALTEN,
                    ]),
                ).resolves.toBe(false);
            });

            it('should return true if permission is escalated for some of the necessary systemrechte', async () => {
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: 'ROOT_ID',
                            systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        'ROOT_ID',
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        false,
                    ),
                ).resolves.toBe(true);
            });

            it('should return false if permission is not escalated for any necessary systemrechte', async () => {
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: 'ROOT_ID',
                            systemrechte: [RollenSystemRechtEnum.KLASSEN_VERWALTEN],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        'ROOT_ID',
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        false,
                    ),
                ).resolves.toBe(false);
            });
        });

        describe('when permission is escalated at organisation level', () => {
            it('should return true if permission is escalated to all at same orga as necessary', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: schoolOrga.id,
                            systemrechte: 'ALL',
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        true,
                    ),
                ).resolves.toBe(true);
            });
            it('should return true if permission is escalated to all at parent orga', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: oeffentlicheSchuleOrga.id,
                            systemrechte: 'ALL',
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        true,
                    ),
                ).resolves.toBe(true);
            });

            it('should return true if permission is escalated to all necessary systemrechte at parent orga', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: oeffentlicheSchuleOrga.id,
                            systemrechte: [
                                RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                                RollenSystemRechtEnum.ANGEBOTE_VERWALTEN,
                                RollenSystemRechtEnum.KLASSEN_VERWALTEN,
                            ],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        true,
                    ),
                ).resolves.toBe(true);
            });

            it('should return false if permission is not escalated to all necessary systemrechte at parent orga', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: oeffentlicheSchuleOrga.id,
                            systemrechte: [
                                RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                                RollenSystemRechtEnum.KLASSEN_VERWALTEN,
                            ],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        true,
                    ),
                ).resolves.toBe(false);
            });

            it('should return true if permission is escalated to some necessary systemrechte at parent orga', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: oeffentlicheSchuleOrga.id,
                            systemrechte: [
                                RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                                RollenSystemRechtEnum.KLASSEN_VERWALTEN,
                            ],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        false,
                    ),
                ).resolves.toBe(true);
            });

            it('should return false if no necessary permission is granted', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: oeffentlicheSchuleOrga.id,
                            systemrechte: [
                                RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                                RollenSystemRechtEnum.KLASSEN_VERWALTEN,
                            ],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        false,
                    ),
                ).resolves.toBe(false);
            });

            it('should return true if all necessary systemrechte are escalated at distributed over multiple orgas', async () => {
                const schoolOrga: Organisation<true> = DoFactory.createOrganisation(true, {
                    administriertVon: oeffentlicheSchuleOrga.id,
                });
                organisationRepo.findParentOrgasForIds.mockResolvedValue([
                    rootOrga,
                    oeffentlicheSchuleOrga,
                    schoolOrga,
                ]);
                const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                    { name: 'testInstance' },
                    [
                        {
                            orgaId: oeffentlicheSchuleOrga.id,
                            systemrechte: [RollenSystemRechtEnum.ANGEBOTE_VERWALTEN],
                        },
                        {
                            orgaId: schoolOrga.id,
                            systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                        },
                    ],
                    organisationRepo,
                    personenkontextRepo,
                    logger,
                );

                await expect(
                    escalatedPersonPermission.hasSystemrechteAtOrganisation(
                        schoolOrga.id,
                        [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                        true,
                    ),
                ).resolves.toBe(true);
            });
        });
    });

    describe('hasSystemrechteAtRootOrganisation', () => {
        it('should return true if permission is escalated at root for all systemrechte', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: rootOrga.id, systemrechte: 'ALL' }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalatedPersonPermission.hasSystemrechteAtRootOrganisation([RollenSystemRecht.PERSONEN_VERWALTEN]),
            ).resolves.toBe(true);
        });

        it('should return false if permission is not escalated at root for all systemrechte', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([rootOrga, oeffentlicheSchuleOrga]);
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: oeffentlicheSchuleOrga.id, systemrechte: 'ALL' }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalatedPersonPermission.hasSystemrechteAtRootOrganisation([RollenSystemRecht.PERSONEN_VERWALTEN]),
            ).resolves.toBe(false);
        });
    });

    describe('hasSystemrechtAtOrganisation', () => {
        it('should return true if permission is escalated at root for all systemrechte', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: rootOrga.id, systemrechte: 'ALL' }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalatedPersonPermission.hasSystemrechtAtOrganisation(
                    oeffentlicheSchuleOrga.id,
                    RollenSystemRecht.PERSONEN_VERWALTEN,
                ),
            ).resolves.toBe(true);
        });

        it('should return false if necessary permission is not granted', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([rootOrga, oeffentlicheSchuleOrga]);
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: oeffentlicheSchuleOrga.id, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalatedPersonPermission.hasSystemrechtAtOrganisation(
                    oeffentlicheSchuleOrga.id,
                    RollenSystemRecht.PERSONEN_VERWALTEN,
                ),
            ).resolves.toBe(false);
        });
    });

    describe('getPermittedMerkmaleForOrga', () => {
        it('should map escalated gated rights to permitted Merkmale', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [
                    {
                        orgaId: rootOrga.id,
                        systemrechte: [
                            RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN,
                            RollenSystemRechtEnum.PILOT_3_ROLLEN_ZUORDNEN,
                        ],
                    },
                ],
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            const merkmale: RollenMerkmal[] = await escalatedPersonPermission.getPermittedMerkmaleForOrga(rootOrga.id);

            expect(merkmale).toEqual([RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_3_ROLLE]);
        });
    });

    describe('hasPermissionForGatedMerkmale', () => {
        it('should require every matching right from escalated permissions', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: rootOrga.id, systemrechte: [RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN] }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            const result: boolean = await escalatedPersonPermission.hasPermissionForGatedMerkmale(
                [RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_1_ROLLE],
                rootOrga.id,
            );

            expect(result).toBe(false);
        });
    });

    describe('canModifyPerson', () => {
        const personId: string = 'xyc';

        it('should return true if has modify right at root organisation', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: 'ROOT_ID', systemrechte: 'ALL' }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(true);
            const result: boolean = await escalatedPersonPermission.canModifyPerson(personId);
            expect(result).toBe(true);
        });

        it('should return true if has modify right at any organisation', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);
            const orgaIds: string[] = [faker.string.uuid(), faker.string.uuid()];
            personenkontextRepo.findByPersonWithOrgaAndRolle.mockResolvedValue(
                orgaIds.map((id: string) => ({
                    personenkontext: {} as unknown as Personenkontext<true>,
                    rolle: {} as unknown as Rolle<true>,
                    organisation: { id } as unknown as Organisation<true>,
                })),
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechtAtOrganisation')
                // eslint-disable-next-line @typescript-eslint/require-await
                .mockImplementation(async (orgaId: OrganisationID) => orgaId === orgaIds[1]);
            const result: boolean = await escalatedPersonPermission.canModifyPerson(personId);
            expect(result).toBe(true);
        });

        it('should return false if no modify right at root or any organisation', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);
            const orgaIds: string[] = [faker.string.uuid(), faker.string.uuid()];
            personenkontextRepo.findByPersonWithOrgaAndRolle.mockResolvedValue(
                orgaIds.map((id: string) => ({
                    personenkontext: {} as unknown as Personenkontext<true>,
                    rolle: {} as unknown as Rolle<true>,
                    organisation: { id } as unknown as Organisation<true>,
                })),
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechtAtOrganisation').mockResolvedValue(false);
            const result: boolean = await escalatedPersonPermission.canModifyPerson(personId);
            expect(result).toBe(false);
        });

        it('should return false if person has no organisations', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);
            personenkontextRepo.findByPersonWithOrgaAndRolle.mockResolvedValue([]);
            const result: boolean = await escalatedPersonPermission.canModifyPerson(personId);
            expect(result).toBe(false);
        });
    });

    describe('hasOrgVerwaltenRechtAtOrga', () => {
        it('should check KLASSEN_VERWALTEN for KLASSE with administriertVon', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            const orgaId: string = faker.string.uuid();
            const oeffentlich: Organisation<true> = { id: faker.string.uuid() } as Organisation<true>;
            organisationRepo.findRootDirectChildren.mockResolvedValue([oeffentlich, undefined]);
            const spy: Mock = vi
                .spyOn(escalatedPersonPermission, 'hasSystemrechtAtOrganisation')
                .mockResolvedValue(true);

            const result: boolean = await escalatedPersonPermission.hasOrgVerwaltenRechtAtOrga(
                OrganisationsTyp.KLASSE,
                orgaId,
            );
            expect(result).toBe(true);
            expect(spy).toHaveBeenCalledWith(orgaId, RollenSystemRecht.KLASSEN_VERWALTEN);
        });

        it('should check KLASSEN_VERWALTEN for KLASSE with default oeffentlich', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            const oeffentlich: Organisation<true> = { id: faker.string.uuid() } as Organisation<true>;
            organisationRepo.findRootDirectChildren.mockResolvedValue([oeffentlich, undefined]);
            const spy: Mock = vi
                .spyOn(escalatedPersonPermission, 'hasSystemrechtAtOrganisation')
                .mockResolvedValue(true);

            const result: boolean = await escalatedPersonPermission.hasOrgVerwaltenRechtAtOrga(OrganisationsTyp.KLASSE);
            expect(result).toBe(true);
            expect(spy).toHaveBeenCalledWith(oeffentlich.id, RollenSystemRecht.KLASSEN_VERWALTEN);
        });

        it('should check KLASSEN_VERWALTEN for KLASSE with fallback to ROOT_ORGANISATION_ID', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            organisationRepo.findRootDirectChildren.mockResolvedValue([undefined, undefined]);
            const spy: Mock = vi
                .spyOn(escalatedPersonPermission, 'hasSystemrechtAtOrganisation')
                .mockResolvedValue(true);

            const result: boolean = await escalatedPersonPermission.hasOrgVerwaltenRechtAtOrga(OrganisationsTyp.KLASSE);
            expect(result).toBe(true);
            expect(spy).toHaveBeenCalledWith(
                organisationRepo.ROOT_ORGANISATION_ID,
                RollenSystemRecht.KLASSEN_VERWALTEN,
            );
        });

        it('should check SCHULEN_VERWALTEN for SCHULE', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            const spy: Mock = vi
                .spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation')
                .mockResolvedValue(true);

            const result: boolean = await escalatedPersonPermission.hasOrgVerwaltenRechtAtOrga(OrganisationsTyp.SCHULE);
            expect(result).toBe(true);
            expect(spy).toHaveBeenCalledWith([RollenSystemRecht.SCHULEN_VERWALTEN]);
        });

        it('should check SCHULTRAEGER_VERWALTEN for TRAEGER', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            const spy: Mock = vi
                .spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation')
                .mockResolvedValue(true);

            const result: boolean = await escalatedPersonPermission.hasOrgVerwaltenRechtAtOrga(
                OrganisationsTyp.TRAEGER,
            );
            expect(result).toBe(true);
            expect(spy).toHaveBeenCalledWith([RollenSystemRecht.SCHULTRAEGER_VERWALTEN]);
        });

        it('should return false for unknown OrganisationsTyp', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            // @ts-expect-error purposely passing unknown type
            const result: boolean = await escalatedPersonPermission.hasOrgVerwaltenRechtAtOrga('UNKNOWN');
            expect(result).toBe(false);
        });
    });

    describe('personFields', () => {
        it('should return the cached person fields with correct values', () => {
            const id: string = faker.string.uuid();
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: id },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            const fields: PersonFields = escalatedPersonPermission.personFields;
            expect(fields.id).toBe(id);
            expect(fields.vorname).toBe(`EscalatedPersonPermissions-${id}`);
            expect(fields.familienname).toBe(`EscalatedPersonPermissions-${id}`);
            expect(fields.username).toBe(`EscalatedPersonPermissions-${id}`);
            expect(fields.keycloakUserId).toBeUndefined();
            expect(fields.updatedAt).toBeInstanceOf(Date);
        });
    });

    describe('getOrgIdsWithSystemrecht', () => {
        const systemrechte: RollenSystemRecht[] = [RollenSystemRecht.PERSONEN_VERWALTEN];
        const orgaId1: OrganisationID = faker.string.uuid();
        const orgaId2: OrganisationID = faker.string.uuid();

        it('should return { all: true } if hasSystemrechteAtRootOrganisation returns true', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(true);

            const result: PermittedOrgas = await escalatedPersonPermission.getOrgIdsWithSystemrecht(systemrechte);
            expect(result).toEqual({ all: true });
        });

        it('should collect orgaIds for permissions with systemrechte === "ALL"', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [
                    { orgaId: orgaId1, systemrechte: 'ALL' },
                    { orgaId: orgaId2, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
                ],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);

            const result: PermittedOrgas = await escalatedPersonPermission.getOrgIdsWithSystemrecht(systemrechte);
            expect(result.all).toBe(false);
            if (result.all) {
                return;
            }
            expect(result.orgaIds).toContain(orgaId1);
        });

        it('should collect orgaIds for permissions with required systemrechte (matchAll=true)', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [
                    { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
                    { orgaId: orgaId2, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
                ],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);

            const result: PermittedOrgas = await escalatedPersonPermission.getOrgIdsWithSystemrecht(
                systemrechte,
                false,
                true,
            );
            expect(result.all).toBe(false);
            if (result.all) {
                return;
            }
            expect(result.orgaIds).toContain(orgaId1);
            expect(result.orgaIds).not.toContain(orgaId2);
        });

        it('should collect orgaIds for permissions with required systemrechte (matchAll=false)', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [
                    {
                        orgaId: orgaId1,
                        systemrechte: [
                            RollenSystemRechtEnum.PERSONEN_VERWALTEN,
                            RollenSystemRechtEnum.PERSONEN_ANLEGEN,
                        ],
                    },
                    { orgaId: orgaId2, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
                ],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);

            const result: PermittedOrgas = await escalatedPersonPermission.getOrgIdsWithSystemrecht(
                [RollenSystemRecht.PERSONEN_VERWALTEN, RollenSystemRecht.PERSONEN_ANLEGEN],
                false,
                false,
            );
            expect(result.all).toBe(false);
            if (result.all) {
                return;
            }
            expect(result.orgaIds).toContain(orgaId1);
            expect(result.orgaIds).toContain(orgaId2);
        });

        it('should add child orga ids if withChildren is true', async () => {
            const childOrga: Organisation<true> = { id: faker.string.uuid() } as Organisation<true>;
            organisationRepo.findChildOrgasForIds.mockResolvedValue([childOrga]);
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [{ orgaId: orgaId1, systemrechte: 'ALL' }],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);

            const result: PermittedOrgas = await escalatedPersonPermission.getOrgIdsWithSystemrecht(systemrechte, true);
            expect(result.all).toBe(false);
            if (result.all) {
                return;
            }
            expect(result.orgaIds).toContain(orgaId1);
            expect(result.orgaIds).toContain(childOrga.id);
        });

        it('should return empty orgaIds if no permissions match', async () => {
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            vi.spyOn(escalatedPersonPermission, 'hasSystemrechteAtRootOrganisation').mockResolvedValue(false);

            const result: PermittedOrgas = await escalatedPersonPermission.getOrgIdsWithSystemrecht(systemrechte);
            expect(result.all).toBe(false);
            if (result.all) {
                return;
            }
            expect(result.orgaIds).toEqual([]);
        });
    });

    describe('extendEscalation', () => {
        const orgaId1: OrganisationID = faker.string.uuid();
        const orgaId2: OrganisationID = faker.string.uuid();
        const orgaId3: OrganisationID = faker.string.uuid();

        it('should add a new escalation if orga does not exist', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const initial: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const additional: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId2, systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
            ];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId2, [
                    { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
        });

        it('should add a new escalation on ROOT', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([rootOrga, oeffentlicheSchuleOrga]);
            const initial: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const additional: EscalatedPermissionAtOrga[] = [
                { orgaId: 'ROOT', systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
            ];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId2, [
                    { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
        });

        it('should skip if existing escalation has systemrechte "ALL"', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const initial: EscalatedPermissionAtOrga[] = [{ orgaId: orgaId1, systemrechte: 'ALL' }];
            const additional: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
            ];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
        });

        it('should escalate to "ALL" if new escalation has systemrechte "ALL"', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const initial: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const additional: EscalatedPermissionAtOrga[] = [{ orgaId: orgaId1, systemrechte: 'ALL' }];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId1, [
                    { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
        });

        it('should add new rights to existing escalation', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const initial: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const additional: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
            ];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(
                    orgaId1,
                    [
                        { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                        { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                    ],
                    true,
                ),
            ).resolves.toBe(true);
        });

        it('should skip if no new rights are added', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const initial: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const additional: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(
                    orgaId1,
                    [{ name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht],
                    true,
                ),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(
                    orgaId1,
                    [{ name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht],
                    true,
                ),
            ).resolves.toBe(false);
        });

        it('should handle multiple additions and updates', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const initial: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
            ];
            const additional: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN] },
                { orgaId: orgaId2, systemrechte: [RollenSystemRechtEnum.PERSONEN_ANLEGEN] },
                { orgaId: orgaId3, systemrechte: 'ALL' },
            ];
            const escalatedPersonPermission: EscalatedPersonPermissions = EscalatedPersonPermissions.createNew(
                { name: 'testInstance' },
                [...initial],
                organisationRepo,
                personenkontextRepo,
                logger,
            );
            escalatedPersonPermission.extendEscalation(additional);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(
                    orgaId1,
                    [
                        { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                        { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                    ],
                    true,
                ),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId2, [
                    { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId3, [
                    { name: RollenSystemRechtEnum.PERSONEN_VERWALTEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
            await expect(
                escalatedPersonPermission.hasSystemrechteAtOrganisation(orgaId3, [
                    { name: RollenSystemRechtEnum.PERSONEN_ANLEGEN } as RollenSystemRecht,
                ]),
            ).resolves.toBe(true);
        });
    });

    describe('fromPersonPermissions', () => {
        it('should create escalated permissions from personPermissions and additionalEscalatedPermissions', async () => {
            organisationRepo.findParentOrgasForIds.mockResolvedValue([]);
            const orgaId1: OrganisationID = faker.string.uuid();
            const orgaId2: OrganisationID = faker.string.uuid();
            const systemrecht1: RollenSystemRechtEnum = RollenSystemRechtEnum.PERSONEN_ANLEGEN;
            const systemrecht2: RollenSystemRechtEnum = RollenSystemRechtEnum.PERSONEN_VERWALTEN;

            const kontext1: PersonenkontextRolleWithOrganisation = {
                organisation: DoFactory.createOrganisationAggregate(true, { id: orgaId1 }),
                rolle: DoFactory.createRolle(true, { systemrechte: [RollenSystemRecht.getByName(systemrecht1)] }),
            };
            const kontext2: PersonenkontextRolleWithOrganisation = {
                organisation: DoFactory.createOrganisationAggregate(true, { id: orgaId2 }),
                rolle: DoFactory.createRolle(true, { systemrechte: [RollenSystemRecht.getByName(systemrecht2)] }),
            };

            const personPermissions: PersonPermissions = createPersonPermissionsMock();
            personPermissions.getPersonenkontexteWithRolesAndOrgs = vi.fn().mockResolvedValue([kontext1, kontext2]);

            const additionalEscalatedPermissions: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId2, systemrechte: [systemrecht1] },
            ];

            const escalated: EscalatedPersonPermissions = await EscalatedPersonPermissions.fromPersonPermissions(
                personPermissions,
                additionalEscalatedPermissions,
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalated.hasSystemrechteAtOrganisation(orgaId1, [{ name: systemrecht1 } as RollenSystemRecht]),
            ).resolves.toBe(true);
            await expect(
                escalated.hasSystemrechteAtOrganisation(orgaId1, [{ name: systemrecht2 } as RollenSystemRecht]),
            ).resolves.toBe(false);
            await expect(
                escalated.hasSystemrechteAtOrganisation(orgaId2, [{ name: systemrecht1 } as RollenSystemRecht]),
            ).resolves.toBe(true);
            await expect(
                escalated.hasSystemrechteAtOrganisation(orgaId2, [{ name: systemrecht2 } as RollenSystemRecht]),
            ).resolves.toBe(true);

            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`with escalated permissions:`));
        });

        it('should not duplicate permissions from kontexts if already present in additionalEscalatedPermissions', async () => {
            const orgaId1: OrganisationID = faker.string.uuid();
            const systemrecht1: RollenSystemRechtEnum = RollenSystemRechtEnum.PERSONEN_ANLEGEN;

            const kontext1: PersonenkontextRolleWithOrganisation = {
                organisation: DoFactory.createOrganisationAggregate(true, { id: orgaId1 }),
                rolle: DoFactory.createRolle(true, { systemrechte: [RollenSystemRecht.getByName(systemrecht1)] }),
            };

            const personPermissions: PersonPermissions = createPersonPermissionsMock();
            personPermissions.getPersonenkontexteWithRolesAndOrgs = vi.fn().mockResolvedValue([kontext1]);

            const additionalEscalatedPermissions: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: [systemrecht1] },
            ];

            const escalated: EscalatedPersonPermissions = await EscalatedPersonPermissions.fromPersonPermissions(
                personPermissions,
                additionalEscalatedPermissions,
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalated.getOrgIdsWithSystemrecht([{ name: systemrecht1 } as RollenSystemRecht], false, true),
            ).resolves.toEqual({ all: false, orgaIds: [orgaId1] });

            expect(logger.debug).toHaveBeenCalledWith(
                `Skipping adding permissions from kontext for orga ${orgaId1}: no new systemrechte to add`,
            );
        });

        it('should not duplicate permissions from kontexts if ALL is present in additionalEscalatedPermissions', async () => {
            const orgaId1: OrganisationID = faker.string.uuid();
            const systemrecht1: RollenSystemRechtEnum = RollenSystemRechtEnum.PERSONEN_ANLEGEN;

            const kontext1: PersonenkontextRolleWithOrganisation = {
                organisation: DoFactory.createOrganisationAggregate(true, { id: orgaId1 }),
                rolle: DoFactory.createRolle(true, { systemrechte: [RollenSystemRecht.getByName(systemrecht1)] }),
            };

            const personPermissions: PersonPermissions = createPersonPermissionsMock();
            personPermissions.getPersonenkontexteWithRolesAndOrgs = vi.fn().mockResolvedValue([kontext1]);

            const additionalEscalatedPermissions: EscalatedPermissionAtOrga[] = [
                { orgaId: orgaId1, systemrechte: 'ALL' },
            ];

            const escalated: EscalatedPersonPermissions = await EscalatedPersonPermissions.fromPersonPermissions(
                personPermissions,
                additionalEscalatedPermissions,
                organisationRepo,
                personenkontextRepo,
                logger,
            );

            await expect(
                escalated.getOrgIdsWithSystemrecht([{ name: systemrecht1 } as RollenSystemRecht], false, true),
            ).resolves.toEqual({ all: false, orgaIds: [orgaId1] });

            expect(logger.debug).toHaveBeenCalledWith(
                `Skipping adding permissions from kontext for orga ${orgaId1}: already has ALL rights by additionalEscalatedPermissions`,
            );
        });
    });
});
