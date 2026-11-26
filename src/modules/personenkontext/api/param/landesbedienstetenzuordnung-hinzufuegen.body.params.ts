import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty } from 'class-validator';
import { PersonenzuordnungBodyParams } from './personenzuordnung.body.params.js';
import { PersonenzuordnungenBearbeitenBodyParams } from './personenzuordnungen-bearbeiten.body.params.js';

export class LandesbedienstetenzuordnungHinzufuegenBodyParams extends PersonenzuordnungenBearbeitenBodyParams {
    @ArrayNotEmpty()
    @ApiProperty({ type: [PersonenzuordnungBodyParams], description: 'New assignments only.', minItems: 1 })
    declare public readonly personenkontexte: PersonenzuordnungBodyParams[];
}
