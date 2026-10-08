import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { NameRequiredForKlasseError } from '../specification/error/name-required-for-klasse.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';
import { OrganisationsTyp } from './organisation.enums.js';
import { Organisation } from './organisation.js';

describe('Organisation', () => {
    let module: TestingModule;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule],
            providers: [
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
            ],
        }).compile();
        organisationRepositoryMock = module.get(OrganisationRepository);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('construct', () => {
        it('should return persisted organisation', () => {
            const organisation: Organisation<true> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                faker.string.uuid(),
                faker.string.uuid(),
                faker.lorem.word(),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
                undefined,
                undefined,
                false,
            );

            expect(organisation).toBeDefined();
            expect(organisation).toBeInstanceOf(Organisation<true>);
        });
    });

    describe('createNew', () => {
        it('should return non persisted organisation', () => {
            const organisation: Organisation<false> | DomainError = Organisation.createNew(
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                faker.string.uuid(),
                faker.string.uuid(),
                faker.lorem.word(),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
                undefined,
            );

            expect(organisation).toBeDefined();
            expect(organisation).toBeInstanceOf(Organisation<false>);
        });
        it('should return non persisted organisation', () => {
            const organisation: Organisation<false> | DomainError = Organisation.createNew(
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                faker.string.uuid(),
                faker.string.uuid(),
                'kennung',
                'name',
                faker.string.uuid(),
                undefined,
                undefined,
            );

            expect(organisation).toBeDefined();
            expect(organisation).toBeInstanceOf(Organisation<false>);
        });

        it('should return an error if name has leading whitespace', () => {
            const result: DomainError | Organisation<false> = Organisation.createNew(
                'name ',
                OrganisationsTyp.SCHULE,
                faker.string.uuid(),
                faker.string.uuid(),
                'kennung',
                ' Test',
                faker.string.uuid(),
                undefined,
                undefined,
            );
            expect(result).toBeInstanceOf(NameForOrganisationWithTrailingSpaceError);
        });

        it('should return an error if dienststellennummer has leading whitespace', () => {
            const result: DomainError | Organisation<false> = Organisation.createNew(
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                faker.string.uuid(),
                faker.string.uuid(),
                ' Test',
                'name',
                faker.string.uuid(),
                undefined,
                undefined,
            );
            expect(result).toBeInstanceOf(KennungForOrganisationWithTrailingSpaceError);
        });
    });

    describe('checkKlasseSpecifications', () => {
        describe('if KlassenNameAnSchuleEindeutig is not valid', () => {
            it('should return KlassenNameAnSchuleEindeutigError', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: 'name',
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: faker.string.uuid(),
                });
                const otherOrga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: 'name',
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: faker.string.uuid(),
                });
                const parentOrga: Organisation<boolean> = DoFactory.createOrganisationAggregate(true, {
                    typ: OrganisationsTyp.SCHULE,
                });
                organisationRepositoryMock.findById.mockResolvedValueOnce(parentOrga);
                organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([otherOrga]);

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(KlassenNameAnSchuleEindeutigError);
            });
        });

        describe('if Organisation is not a Klasse', () => {
            it('should return validated', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: 'name',
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                });

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeUndefined();
            });
        });

        describe('if Organisation has no Parent', () => {
            it('should return KlassenNameAnSchuleEindeutigError', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: 'name',
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: undefined,
                });

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(KlassenNameAnSchuleEindeutigError);
            });
        });

        describe('if parent of Organisation cannot be found', () => {
            it('should return KlassenNameAnSchuleEindeutigError', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: 'name',
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: faker.string.uuid(),
                });
                organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);
                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(KlassenNameAnSchuleEindeutigError);
            });
        });

        describe('if Organisation has no ID', () => {
            it('should return KlassenNameAnSchuleEindeutigError with id=undefined', async () => {
                const orga: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    name: 'name',
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: undefined,
                });

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(KlassenNameAnSchuleEindeutigError);
            });
        });

        describe('if NameRequiredForKlasse is not valid', () => {
            it('should return NameRequiredForKlasseError', async () => {
                const orga: Organisation<boolean> = DoFactory.createOrganisationAggregate(false, {
                    name: '',
                    typ: OrganisationsTyp.KLASSE,
                });

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(NameRequiredForKlasseError);
            });
        });

        describe('if name of updated organisation has trailing whitespace', () => {
            it('should return NameForOrganisationWithTrailingSpaceError', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: ' name',
                    typ: OrganisationsTyp.KLASSE,
                });

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(NameForOrganisationWithTrailingSpaceError);
            });
        });

        describe('if kennung of updated organisation has trailing whitespace', () => {
            it('should return KennungForOrganisationWithTrailingSpaceError', async () => {
                const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    name: 'name',
                    kennung: 'kennung ',
                    typ: OrganisationsTyp.KLASSE,
                });

                const updateError: OrganisationSpecificationError | undefined =
                    await orga.checkKlasseSpecifications(organisationRepositoryMock);

                expect(updateError).toBeInstanceOf(KennungForOrganisationWithTrailingSpaceError);
            });
        });
    });

    describe('checkSchultraegerSpecifications', () => {
        let root: Organisation<true>;
        let oeffentlich: Organisation<true>;
        let ersatz: Organisation<true>;
        beforeEach(() => {
            root = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.ROOT,
            });
            organisationRepositoryMock.findById.mockResolvedValue(root);
            // Mock root children
            oeffentlich = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.LAND,
            });
            ersatz = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.LAND,
            });
            organisationRepositoryMock.findRootDirectChildren.mockResolvedValue([oeffentlich, ersatz]);
        });

        it('should return undefined if organization is not a Schultraeger', async () => {
            // Setup a non-Schultraeger organization
            const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                name: 'Some School',
                typ: OrganisationsTyp.SCHULE,
            });

            const result: OrganisationSpecificationError | undefined =
                await orga.checkSchultraegerSpecifications(organisationRepositoryMock);

            expect(result).toBeUndefined();
        });

        it('should return NameForOrganisationWithTrailingSpaceError if name has trailing whitespace', async () => {
            // Setup a Schultraeger with a name with trailing whitespace
            const orga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                name: 'Schultraeger Name ',
                typ: OrganisationsTyp.TRAEGER,
            });

            const result: OrganisationSpecificationError | undefined =
                await orga.checkSchultraegerSpecifications(organisationRepositoryMock);

            expect(result).toBeInstanceOf(NameForOrganisationWithTrailingSpaceError);
        });

        describe('TraegerUnterRootChild', () => {
            describe('when traeger is not a direct child of oeffentlich or ersatz', () => {
                it('should return TraegerUnterRootChildError', async () => {
                    const traeger: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                        name: 'Schultraeger without proper parent',
                        zugehoerigZu: faker.string.uuid(),
                        typ: OrganisationsTyp.TRAEGER,
                    });
                    const result: OrganisationSpecificationError | undefined =
                        await traeger.checkSchultraegerSpecifications(organisationRepositoryMock);

                    expect(result).toBeInstanceOf(TraegerUnterRootChildError);
                });
            });
        });
        describe('TraegerNameUniqueInSubtree', () => {
            let traeger: Organisation<true>;
            beforeEach(() => {
                vi.restoreAllMocks();
                // Setup a unique Schultraeger
                traeger = DoFactory.createOrganisationAggregate(true, {
                    zugehoerigZu: oeffentlich.id,
                    typ: OrganisationsTyp.TRAEGER,
                });
            });

            it('should return undefined if Schultraeger name is unique', async () => {
                organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);

                const result: OrganisationSpecificationError | undefined =
                    await traeger.checkSchultraegerSpecifications(organisationRepositoryMock);

                expect(result).toBeUndefined();
            });

            it('should return SchultraegerNameEindeutigError if Schultraeger name is not unique', async () => {
                organisationRepositoryMock.findRootDirectChildren.mockResolvedValueOnce([oeffentlich, ersatz]);
                organisationRepositoryMock.isOrgaAParentOfOrgaB.mockResolvedValueOnce(true);
                organisationRepositoryMock.findBy.mockResolvedValueOnce([
                    [
                        traeger,
                        DoFactory.createOrganisationAggregate(true, {
                            name: traeger.name,
                            typ: OrganisationsTyp.TRAEGER,
                            zugehoerigZu: traeger.zugehoerigZu,
                        }),
                    ],
                    2,
                ]);

                const result: OrganisationSpecificationError | undefined =
                    await traeger.checkSchultraegerSpecifications(organisationRepositoryMock);

                expect(result).toBeInstanceOf(SchultraegerNameEindeutigError);
            });

            it('should return SchultraegerNameEindeutigError if Schultraeger has no name', async () => {
                // Setup a Schultraeger without a name
                const traegerWithoutName: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    ...traeger,
                    name: undefined,
                });

                const result: OrganisationSpecificationError | undefined =
                    await traegerWithoutName.checkSchultraegerSpecifications(organisationRepositoryMock);

                expect(result).toBeInstanceOf(SchultraegerNameEindeutigError);
            });
        });
    });
});
