import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Rolle } from '../domain/rolle.js';
import { type Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { NoRedundantRollenerweiterung } from './no-redundant-rollenerweiterung.specification.js';

describe('NoRedundantRollenerweiterung', () => {
    describe('isSatisfiedBy', () => {
        const serviceProviderId: string = faker.string.uuid();

        it.each([
            [true, 'does not have the sp assigned', DoFactory.createRolle(true)],
            [
                false,
                'already has the sp assigned',
                DoFactory.createRolle(true, {
                    serviceProviderIds: [serviceProviderId],
                }),
            ],
            [false, 'is undefined', undefined],
        ])(
            'should return %s if the rolle %s',
            async (expected: boolean, _label: string, rolle: Option<Rolle<boolean>>) => {
                const rollenerweiterungMock: Rollenerweiterung<boolean> = DoFactory.createRollenerweiterung(true, {
                    serviceProviderId: serviceProviderId,
                });
                vi.spyOn(rollenerweiterungMock, 'getRolle').mockResolvedValue(rolle);

                const specification: NoRedundantRollenerweiterung = new NoRedundantRollenerweiterung();
                await expect(specification.isSatisfiedBy(rollenerweiterungMock)).resolves.toBe(expected);
            },
        );
    });
});
