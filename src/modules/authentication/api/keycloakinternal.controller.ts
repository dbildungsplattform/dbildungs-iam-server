import { Body, Controller, HttpCode, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExternalDataCacheInterceptor } from '../../../shared/cache/external-data-cache-interceptor.js';
import { DomainError, EntityNotFoundError } from '../../../shared/error/index.js';
import { UserExternalDataWorkflowError } from '../../../shared/error/user-externaldata-workflow.error.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import {
    ErweiterterServiceProviderForPK,
    ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { UserExternaldataWorkflowFactory } from '../domain/user-extenaldata.factory.js';
import { UserExternaldataWorkflowAggregate } from '../domain/user-extenaldata.workflow.js';
import { AccessApiKeyGuard } from './access.apikey.guard.js';
import { OxParams } from './externaldata/user-externaldata-ox.response.js';
import { UserExternalDataResponse } from './externaldata/user-externaldata.response.js';
import { Public } from './public.decorator.js';
import { UserExternalDataBodyParams } from './externaldata/user-externaldata.body.params.js';

type WithoutOptional<T> = {
    [K in keyof T]-?: T[K];
};

export type RequiredExternalPkData = WithoutOptional<ExternalPkData>;

type InitializedWorkflow = UserExternaldataWorkflowAggregate & {
    person: Person<true>;
    checkedExternalPkData: RequiredExternalPkData[];
    erweiterteSP: ErweiterterServiceProviderForPK[];
    mergedExternalPkData: RequiredExternalPkData[];
    externalPkDataWithVidisAngebotId: RequiredExternalPkData[];
    vidisDienststellennummern: string[];
    singleRollenart: RollenArt | undefined;
    polytheaDienststellenNummern: string[];
    oxParams: OxParams | undefined;
};

@ApiTags('Keycloakinternal')
@Controller({ path: 'keycloakinternal' })
export class KeycloakInternalController {
    public constructor(
        private readonly userExternaldataWorkflowFactory: UserExternaldataWorkflowFactory,
        private readonly personRepository: PersonRepository,
    ) {}

    /**
     * Dieser Endpunkt fragt lediglich Daten ab ist allerdigs trotzdem als POST definiert, da:
     * Die Url sollte keine Path oder Query Paremeters haben da Sie statisch in der Keycloak UI hinterlegt werden muss
     * Trotzdem muss die Keycloak Sub übermittelt werden (Deshalb POST mit Body)
     **/
    @UseInterceptors(ExternalDataCacheInterceptor)
    @Post('externaldata')
    @HttpCode(200)
    @Public()
    @UseGuards(AccessApiKeyGuard)
    @ApiOperation({ summary: 'External Data about requested in user.' })
    @ApiOkResponse({ description: 'Returns external Data about the requested user.', type: UserExternalDataResponse })
    public async getExternalData(@Body() params: UserExternalDataBodyParams): Promise<UserExternalDataResponse> {
        const person: Option<Person<true>> = await this.personRepository.findByKeycloakUserId(params.sub);
        this.checkPerson(person, params.sub);

        const workflow: UserExternaldataWorkflowAggregate = this.userExternaldataWorkflowFactory.createNew();
        const workflowInitializeError: Option<DomainError> = await workflow.initialize(person.id);
        this.checkWorkflowInitialized(workflowInitializeError, workflow);

        const userExternalDataResponse: UserExternalDataResponse = UserExternalDataResponse.createNew({
            person: workflow.person,
            checkedExternalPkData: workflow.checkedExternalPkData,
            vidisDienststellennummern: workflow.vidisDienststellennummern,
            singleRollenart: workflow.singleRollenart,
            polytheaDienststellenNummern: workflow.polytheaDienststellenNummern,
            email: workflow.email,
            oxParams: workflow.oxParams,
        });

        return userExternalDataResponse;
    }

    private checkPerson(person: Option<Person<true>>, keycloakSub: string): asserts person is Person<true> {
        if (!person) {
            throw new EntityNotFoundError('Person', keycloakSub);
        }
    }

    private checkWorkflowInitialized(
        error: Option<DomainError>,
        workflow: UserExternaldataWorkflowAggregate,
    ): asserts workflow is InitializedWorkflow {
        if (error) {
            throw error;
        }
        if (
            !workflow.person ||
            !workflow.checkedExternalPkData ||
            !workflow.mergedExternalPkData ||
            !workflow.externalPkDataWithVidisAngebotId ||
            !workflow.vidisDienststellennummern ||
            !workflow.polytheaDienststellenNummern
        ) {
            throw new UserExternalDataWorkflowError(
                'UserExternaldataWorkflowAggregate has not been successfully initialized',
            );
        }
    }
}
