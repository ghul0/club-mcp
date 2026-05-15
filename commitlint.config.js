export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'ci', 'build', 'perf', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      ['core', 'stdio', 'http', 'deps', 'docs', 'ci', 'build', 'repo', 'scripts', 'adr'],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
  },
};
