// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: ['expo', 'prettier', 'plugin:import/recommended', 'plugin:import/typescript'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'warn',
    'import/order': ['warn', { alphabetize: { order: 'asc' } }],
  },
  settings: {
    'import/resolver': {
      typescript: true,
      node: true,
    },
  },
};
