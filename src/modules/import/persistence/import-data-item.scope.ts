import { type EntityName } from '@mikro-orm/core';
import { ScopeBase, ScopeOperator } from '../../../shared/persistence/index.js';
import { ImportDataItemEntity } from './import-data-item.entity.js';

export class ImportDataItemScope extends ScopeBase<ImportDataItemEntity> {
    protected override get entityName(): EntityName<ImportDataItemEntity> {
        return ImportDataItemEntity;
    }

    public findByImportvorgangId(importvorgangId: string): this {
        this.findByInternal(
            {
                importvorgangId: importvorgangId,
            },
            ScopeOperator.AND,
        );

        return this;
    }
}
