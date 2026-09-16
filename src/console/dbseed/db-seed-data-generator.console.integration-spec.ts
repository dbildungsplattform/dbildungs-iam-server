import { Test, TestingModule } from '@nestjs/testing';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, LoggingTestModule } from '../../../test/utils/index.js';
import { DbSeedDataGeneratorConsole, SeedDataGeneratorOptions } from './db-seed-data-generator.console.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DbSeedDataGeneratorNoDirectoryError } from './error/db-seed-data-generator-no-directory.error.js';

describe('DbSeedDataGeneratorConsoleIntegration', () => {
    let module: TestingModule;
    let sut: DbSeedDataGeneratorConsole;

    let tempdir: string;

    const defaultOptions: SeedDataGeneratorOptions = {
        baseId: 1,
        classesPerSchool: 1,
        personPassword: 'SPSHtest1!',
        schoolCount: 1,
        schoolName: 'Schule',
        studentCount: 1,
        studentName: 'schueler',
        studentRoleId: 1,
        teacherCount: 1,
        teacherRoleId: 2,
        teacherName: 'Lehrer',
    };

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [DbSeedDataGeneratorConsole],
        }).compile();
        sut = module.get(DbSeedDataGeneratorConsole);

        tempdir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-data-test-'));
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('run', () => {
        describe('when options are provided and valid', () => {
            it('should NOT fail', async () => {
                const params: string[] = [tempdir];
                await expect(sut.run(params, defaultOptions)).resolves.not.toThrow();
            });
        });

        describe('when the directory is not provided', () => {
            it('should fail with error', async () => {
                await expect(sut.run([], defaultOptions)).rejects.toThrow(new DbSeedDataGeneratorNoDirectoryError());
            });
        });

        describe('if directory cannot be found', () => {
            it('should fail with error', async () => {
                const params: string[] = [`${tempdir}fake`];

                await expect(sut.run(params, defaultOptions)).rejects.toThrow();
            });
        });

        describe('validate options', () => {
            it.each([
                { baseId: -1 },
                { schoolCount: -1 },
                { classesPerSchool: -1 },
                { teacherCount: -1 },
                { studentCount: -1 },
                { teacherRoleId: NaN },
                { studentRoleId: NaN },
            ] satisfies Partial<SeedDataGeneratorOptions>[])(
                'Should fail when %s',
                async (optionsMixin: Partial<SeedDataGeneratorOptions>) => {
                    const params: string[] = [tempdir];
                    const options: SeedDataGeneratorOptions = { ...defaultOptions, ...optionsMixin };
                    await expect(sut.run(params, options)).rejects.toThrow();
                },
            );
        });
    });

    describe('option parsers', () => {
        it('should parse baseId', () => {
            expect(sut.parseBaseId('10')).toBe(10);
        });

        it('should parse schoolCount', () => {
            expect(sut.parseSchoolCount('10')).toBe(10);
        });

        it('should parse schoolName', () => {
            expect(sut.parseSchoolName('SchulePrefix')).toBe('SchulePrefix');
        });

        it('should parse classesPerSchool', () => {
            expect(sut.parseClassesPerSchool('10')).toBe(10);
        });

        it('should parse teacherCount', () => {
            expect(sut.parseTeacherCount('10')).toBe(10);
        });

        it('should parse teacherName', () => {
            expect(sut.parseTeacherName('LehrerPrefix')).toBe('LehrerPrefix');
        });

        it('should parse teacherRoleId', () => {
            expect(sut.parseTeacherRoleId('10')).toBe(10);
        });

        it('should parse studentCount', () => {
            expect(sut.parseStudentCount('10')).toBe(10);
        });

        it('should parse studentName', () => {
            expect(sut.parseStudentName('SchuelerPrefix')).toBe('SchuelerPrefix');
        });

        it('should parse studentRoleId', () => {
            expect(sut.parseStudentRoleId('10')).toBe(10);
        });

        it('should parse personPassword', () => {
            expect(sut.parsePersonPassword('password')).toBe('password');
        });
    });
});
