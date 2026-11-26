import { ApiProperty } from '@nestjs/swagger';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
export class PersonenkontextWorkflowResponse {
    @ApiProperty({
        description: 'Selected organisation.',
        type: String,
        nullable: true,
    })
    public readonly selectedOrganisation?: string;

    @TransformToArray()
    @ApiProperty({
        description: 'Selected rollen.',
        type: [String],
        nullable: true,
    })
    public readonly selectedRollen?: string[];

    @ApiProperty({
        description: 'Indicates whether the commit action can be performed.',
        type: Boolean,
    })
    public readonly canCommit: boolean;

    public constructor(canCommit: boolean, selectedOrganisation?: string, selectedRollen?: string[]) {
        this.selectedOrganisation = selectedOrganisation;
        this.selectedRollen = selectedRollen;
        this.canCommit = canCommit;
    }
}
