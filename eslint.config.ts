import importPlugin from 'eslint-plugin-import';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
// Custom rule overrides
import type { Linter } from 'eslint';

const tsconfigRootDir = __dirname;

const customRules: Partial<Linter.RulesRecord> = {
    'class-methods-use-this': ['off'],
    curly: ['error', 'all'],
    eqeqeq: ['error', 'smart'],
    'max-classes-per-file': ['error', 1],
    'no-void': ['error', { allowAsStatement: true }],
    'no-console': ['warn'],
    'no-param-reassign': ['warn'],
    'no-underscore-dangle': ['error'],
    'no-await-in-loop': ['error'],
    'no-duplicate-imports': ['error'],
    'no-unmodified-loop-condition': ['error'],
    'no-use-before-define': ['error'],
    'no-template-curly-in-string': ['error'],
    'no-promise-executor-return': ['error'],
    '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],

    // Import plugin
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    'import/no-cycle': ['error'],

    // TypeScript rules
    '@typescript-eslint/no-inferrable-types': ['off'],
    '@typescript-eslint/typedef': [
        'warn',
        {
            arrayDestructuring: true,
            arrowParameter: true,
            memberVariableDeclaration: true,
            objectDestructuring: true,
            parameter: true,
            propertyDeclaration: true,
            variableDeclaration: true,
            variableDeclarationIgnoreFunction: true,
        },
    ],
    '@typescript-eslint/unbound-method': ['error'],
    '@typescript-eslint/explicit-member-accessibility': ['error'],
    '@typescript-eslint/explicit-function-return-type': ['error'],
    '@typescript-eslint/no-explicit-any': ['error'],
    '@typescript-eslint/no-useless-constructor': ['error'],
    '@typescript-eslint/no-empty-function': ['error'],
    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            args: 'all',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
        },
    ],
    '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
};

export default defineConfig(
    globalIgnores([
        'eslint.config.ts',
        'eslint.config copy.ts',
        'vite.config.ts',
        '.eslintrc.cjs',
        'dist/*',
        'node_modules/*',
        'coverage/*',
    ]),

    // Main TS files
    {
        files: ['**/*.ts'],
        ignores: ['test-migrations/**/*.ts', 'migrations/**/*.ts', 'dist/**'],
        extends: [tseslint.configs.recommendedTypeChecked],
        plugins: { tseslint, import: importPlugin },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir,
                sourceType: 'module',
                ecmaVersion: 2022,
            },
        },
        rules: customRules,
    },

    // Test files
    {
        files: ['**/*spec.ts'],
        extends: [tseslint.configs.recommendedTypeChecked],
        plugins: { tseslint, import: importPlugin },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir,
                sourceType: 'module',
                ecmaVersion: 2022,
            },
        },
        rules: {
            ...customRules,
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/no-empty-function': 'off',
        },
    },
);
