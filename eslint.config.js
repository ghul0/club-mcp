import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const noCommentsPlugin = {
  rules: {
    'no-comments': {
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              if (comment.type !== 'Shebang') {
                context.report({ loc: comment.loc, message: 'Comments are not allowed in source files.' });
              }
            }
          }
        };
      }
    }
  }
};

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'research/**', 'coverage/**', 'packages/*/dist/**']
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      local: noCommentsPlugin
    },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error'
    },
    rules: {
      'local/no-comments': 'error',
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  }
];
