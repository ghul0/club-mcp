const quote = (files) => files.map((f) => `'${f}'`).join(' ');

export default {
  'packages/**/src/**/*.ts': (files) => `eslint --fix ${quote(files)}`,
  'packages/**/*.ts': () => 'pnpm typecheck',
  'scripts/**/*.ts': () => 'pnpm typecheck:scripts',
};
