import nextConfig from 'eslint-config-next'

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'playwright-report/**',
      'test-results/**',
      '.agents/**',
      'scripts/e2e-seed.mjs',
    ],
  },
  ...nextConfig,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/memo-consts': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]

export default config
