// eslint-disable-next-line max-classes-per-file
import { ScopeBase } from './scope-base.js';
import { ScopeOperator } from './scope.enums.js';

class TestEntity {}

class TestScope extends ScopeBase<TestEntity> {
    protected get entityName(): typeof TestEntity {
        return TestEntity;
    }
}

/*
 ScopeBase is mostly covered by the tests of its subclasses.
 This test checks the setScopeWhereOperator method. The throw statement should never be reached in production code.
*/
describe('ScopeBase', () => {
    let scope: TestScope;

    beforeEach(() => {
        scope = new TestScope();
    });

    it('should set scope where operator', () => {
        scope.setScopeWhereOperator(ScopeOperator.AND);
        expect(() => scope.setScopeWhereOperator(ScopeOperator.OR)).toThrow(
            'Scope where operator is already set. Scope Operator can not be nested',
        );
    });
});
