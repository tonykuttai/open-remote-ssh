// @ts-check
import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    globalIgnores(['**/node_modules/', '**/out/', '**/*.d.ts', '**/*.js', '**/*.mjs']),
    {
        plugins: {
            '@stylistic': stylistic,
            jsdoc,
        },
        rules: {
            'constructor-super': 'warn',
            curly: 'warn',
            eqeqeq: 'warn',
            'no-caller': 'warn',
            'no-case-declarations': 'warn',
            'no-debugger': 'warn',
            'no-duplicate-case': 'warn',
            'no-duplicate-imports': 'warn',
            'no-eval': 'warn',
            'no-async-promise-executor': 'warn',
            'no-new-wrappers': 'warn',
            'no-redeclare': 'off',
            'no-sparse-arrays': 'warn',
            'no-throw-literal': 'warn',
            'no-unsafe-finally': 'warn',
            'no-unused-labels': 'warn',
            'no-restricted-globals': ['warn', 'name', 'length', 'event', 'closed', 'external', 'status', 'origin', 'orientation', 'context'],
            'no-var': 'warn',
            'jsdoc/no-types': 'warn',
            '@stylistic/semi': 'warn',
            '@stylistic/member-delimiter-style': 'warn',
            '@stylistic/quotes': ['warn', 'single', { allowTemplateLiterals: 'always' }],
            '@typescript-eslint/naming-convention': ['warn', { selector: 'class', format: ['PascalCase'] }],
            // The code base predates these recommended rules; keep them advisory for now.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
        },
    },
);
