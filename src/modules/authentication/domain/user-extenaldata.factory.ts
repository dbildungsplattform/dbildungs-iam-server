import { Injectable } from '@nestjs/common';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { UserExternaldataWorkflowAggregate } from './user-extenaldata.workflow.js';

@Injectable()
export class UserExternaldataWorkflowFactory {
    public constructor(
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly personRepo: PersonRepository,
        private readonly emailResolverService: EmailResolverService,
    ) {}

    public createNew(): UserExternaldataWorkflowAggregate {
        return UserExternaldataWorkflowAggregate.createNew(
            this.personenkontextRepo,
            this.personRepo,
            this.emailResolverService,
        );
    }
}
