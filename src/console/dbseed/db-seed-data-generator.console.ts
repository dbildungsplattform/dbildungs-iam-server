import { promises as fs } from 'fs';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import path from 'path';

import { ClassLogger } from '../../core/logging/class-logger.js';
import { OrganisationsTyp } from '../../modules/organisation/domain/organisation.enums.js';
import { EntityFile } from './db-seed.console.js';
import { OrganisationFile } from './file/organisation-file.js';
import { PersonFile } from './file/person-file.js';
import { PersonenkontextFile } from './file/personenkontext-file.js';
import { DbSeedDataGeneratorValidationIntegerError } from './error/db-seed-data-generator-validation-integer.error.js';
import { DbSeedDataGeneratorValidationPositiveIntegerError } from './error/db-seed-data-generator-validation-positive-integer.error.js';
import { DbSeedDataGeneratorNoDirectoryError } from './error/db-seed-data-generator-no-directory.error.js';

export type SeedDataGeneratorOptions = {
    baseId: number;

    schoolCount: number;
    schoolName: string;

    classesPerSchool: number;

    teacherCount: number;
    teacherName: string;
    teacherRoleId: number;

    studentCount: number;
    studentName: string;
    studentRoleId: number;

    personPassword: string;
};

@SubCommand({
    name: 'seedingdata-generate',
    description: 'generates seed data in seeding folder',
    arguments: '<directory>',
})
export class DbSeedDataGeneratorConsole extends CommandRunner {
    public constructor(private readonly logger: ClassLogger) {
        super();
    }

    @Option({
        flags: '--baseId [id]',
        description:
            "Number to add to all generated reference IDs. Choose a number so generated entities don't collide with existing seeding data",
        required: true,
    })
    public parseBaseId(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--schoolCount [count]',
        description: 'Number of schools to create',
        defaultValue: 0,
    })
    public parseSchoolCount(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--schoolName [name]',
        description: 'Name for the created schools, will be appended by a number',
        defaultValue: 'SeedingSchule',
    })
    public parseSchoolName(val: string): string {
        return val;
    }

    @Option({
        flags: '--classesPerSchool [count]',
        description: 'Number of classes to create per school',
        defaultValue: 0,
    })
    public parseClassesPerSchool(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--teacherName [name]',
        description: 'Name for the created teachers, will be appended by a number',
        defaultValue: 'SeedingLehrer',
    })
    public parseTeacherName(val: string): string {
        return val;
    }

    @Option({
        flags: '--teacherCount [count]',
        description: 'Number of teachers to create. Will be assigned round-robin style to the schools.',
        defaultValue: 0,
    })
    public parseTeacherCount(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--teacherRoleId [id]',
        description: 'Seeding reference ID for the teacher role.',
        defaultValue: 2,
    })
    public parseTeacherRoleId(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--studentName [name]',
        description: 'Name for the created students, will be appended by a number',
        defaultValue: 'seedingschueler',
    })
    public parseStudentName(val: string): string {
        return val;
    }

    @Option({
        flags: '--studentCount [count]',
        description: 'Number of students to create. Will be assigned round-robin style to the schools.',
        defaultValue: 0,
    })
    public parseStudentCount(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--studentRoleId [id]',
        description: 'Seeding reference ID for the student role.',
        defaultValue: 1,
    })
    public parseStudentRoleId(val: string): number {
        return Number(val);
    }

    @Option({
        flags: '--personPassword [password]',
        description: 'Password set for every created person',
        defaultValue: 'SPSHtest1!',
    })
    public parsePersonPassword(val: string): string {
        return val;
    }

    private getDirectory(passedParams: string[]): string {
        if (passedParams[0] !== undefined) {
            return passedParams[0];
        }
        throw new DbSeedDataGeneratorNoDirectoryError();
    }

    public validateOptions(options: SeedDataGeneratorOptions): void {
        if (!Number.isFinite(options.baseId) || options.baseId < 0) {
            throw new DbSeedDataGeneratorValidationPositiveIntegerError('baseId');
        }

        if (!Number.isFinite(options.schoolCount) || options.schoolCount < 0) {
            throw new DbSeedDataGeneratorValidationPositiveIntegerError('schoolCount');
        }

        if (!Number.isFinite(options.classesPerSchool) || options.classesPerSchool < 0) {
            throw new DbSeedDataGeneratorValidationPositiveIntegerError('classesPerSchool');
        }

        if (!Number.isFinite(options.teacherCount) || options.teacherCount < 0) {
            throw new DbSeedDataGeneratorValidationPositiveIntegerError('teacherCount');
        }

        if (!Number.isFinite(options.studentCount) || options.studentCount < 0) {
            throw new DbSeedDataGeneratorValidationPositiveIntegerError('studentCount');
        }

        if (!Number.isFinite(options.teacherRoleId)) {
            throw new DbSeedDataGeneratorValidationIntegerError('teacherRoleId');
        }

        if (!Number.isFinite(options.studentRoleId)) {
            throw new DbSeedDataGeneratorValidationIntegerError('studentRoleId');
        }
    }

    public override async run(params: string[], options: SeedDataGeneratorOptions): Promise<void> {
        this.logger.info('Initializing seed data generator...');

        const directory: string = this.getDirectory(params);
        this.validateOptions(options);

        this.logger.info('Generating Schulen & Klassen...');
        try {
            const schools: OrganisationFile[] = this.generateSchools(
                options.schoolCount,
                options.schoolName,
                options.baseId,
            );
            const classes: OrganisationFile[] = this.generateClassesForSchools(
                schools,
                options.classesPerSchool,
                options.baseId + schools.length,
            );

            await this.writeEntityFile(directory, '01', 'Organisation', schools, classes);

            const [teachers, teacherKontexte]: [persons: PersonFile[], personenkontexte: PersonenkontextFile[]] =
                this.generateTeachersForSchools(
                    schools,
                    options.teacherCount,
                    options.teacherName,
                    options.teacherRoleId,
                    options.personPassword,
                    options.baseId,
                );

            const [students, studentKontexte]: [persons: PersonFile[], personenkontexte: PersonenkontextFile[]] =
                this.generateStudentsForSchools(
                    classes,
                    options.studentCount,
                    options.studentName,
                    options.studentRoleId,
                    options.personPassword,
                    options.baseId + teachers.length,
                );

            await this.writeEntityFile(directory, '02', 'Person', teachers, students);
            await this.writeEntityFile(directory, '03', 'Personenkontext', teacherKontexte, studentKontexte);

            this.logger.info(`Saved data successfully under: ${directory}`);
        } catch (error) {
            this.logger.error('Something went wrong when saving generating seeding data!');
            this.logger.error(String(error));
            throw error;
        }

        this.logger.info('Seed data generated');
    }

    private async writeEntityFile<T>(
        directory: string,
        fileprefix: string,
        entityName: string,
        ...entities: T[][]
    ): Promise<void> {
        const maxEntitiesPerFile: number = 5000;

        const flattenedEntities: T[] = entities.flat(1);

        const fileCount: number = Math.ceil(flattenedEntities.length / maxEntitiesPerFile);
        for (let i: number = 0; i < fileCount; i++) {
            const paddedStartString: string = `${i}`.padStart(3, '0');

            const entityIndex: number = i * maxEntitiesPerFile;

            const entityFile: EntityFile<T> = {
                entityName,
                entities: flattenedEntities.slice(entityIndex, entityIndex + maxEntitiesPerFile),
            };

            const jsonData: string = JSON.stringify(entityFile, null, '\t');

            const filepath: string = path.join(directory, `${fileprefix}_${paddedStartString}_${entityName}.json`);

            // eslint-disable-next-line no-await-in-loop
            await fs.writeFile(filepath, jsonData);
        }
    }

    private generateSchools(schoolCount: number, schoolPrefix: string, baseId: number): OrganisationFile[] {
        const schools: OrganisationFile[] = [];

        for (let i: number = 0; i < schoolCount; i++) {
            const schuleId: number = baseId + i;
            const kennung: string = `${schuleId}`.padStart(7, '1');
            const schulname: string = `${schoolPrefix}-${schuleId}`;

            schools.push({
                id: schuleId,
                kennung: kennung,
                name: schulname,
                namensergaenzung: 'Keine',
                kuerzel: schulname,
                typ: OrganisationsTyp.SCHULE,
                administriertVon: 1,
                zugehoerigZu: 1,
            });
        }

        return schools;
    }

    private generateClassesForSchools(
        schools: OrganisationFile[],
        classesPerSchool: number,
        baseId: number,
    ): OrganisationFile[] {
        const classes: OrganisationFile[] = [];

        const classSuffixes: string[] = ['A', 'B', 'C', 'D', 'E'];

        let classIndex: number = baseId;

        for (const school of schools) {
            for (let i: number = 0; i < classesPerSchool; i++) {
                const className: string = `${Math.floor(i / classSuffixes.length) + 1}${classSuffixes[i % classSuffixes.length]}`;

                classes.push({
                    id: classIndex,
                    name: className,
                    namensergaenzung: 'Keine',
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: school.id,
                    zugehoerigZu: school.id,
                });

                classIndex++;
            }
        }

        return classes;
    }

    private generateTeachersForSchools(
        schools: OrganisationFile[],
        teacherCount: number,
        teacherPrefix: string,
        teacherRoleId: number,
        password: string,
        baseId: number,
    ): [persons: PersonFile[], personenkontexte: PersonenkontextFile[]] {
        const teachers: PersonFile[] = [];
        const teacherKontexte: PersonenkontextFile[] = [];

        let teacherId: number = baseId;

        for (let i: number = 0; i < teacherCount; i++) {
            const username: string = `${teacherPrefix}${i + 1}`.toLowerCase();

            teachers.push({
                id: teacherId,
                username,
                password,
                vorname: teacherPrefix,
                familienname: teacherPrefix,
                personalnummer: `${teacherId}`.padStart(7, '0'),
            });

            teacherKontexte.push({
                organisationId: schools[i % schools.length]!.id,
                personId: teacherId,
                rolleId: teacherRoleId,
            });

            teacherId++;
        }

        return [teachers, teacherKontexte];
    }

    private generateStudentsForSchools(
        classes: OrganisationFile[],
        studentCount: number,
        studentPrefix: string,
        studentRoleId: number,
        password: string,
        baseId: number,
    ): [persons: PersonFile[], personenkontexte: PersonenkontextFile[]] {
        const students: PersonFile[] = [];
        const studentKontexte: PersonenkontextFile[] = [];

        let studentId: number = baseId;

        for (let i: number = 0; i < studentCount; i++) {
            const username: string = `${studentPrefix}${i + 1}`.toLowerCase();

            students.push({
                id: studentId,
                username,
                password,
                vorname: studentPrefix,
                familienname: studentPrefix,
            });

            studentKontexte.push({
                organisationId: classes[i % classes.length]!.administriertVon!,
                personId: studentId,
                rolleId: studentRoleId,
            });

            studentKontexte.push({
                organisationId: classes[i % classes.length]!.id,
                personId: studentId,
                rolleId: studentRoleId,
            });

            studentId++;
        }

        return [students, studentKontexte];
    }
}
