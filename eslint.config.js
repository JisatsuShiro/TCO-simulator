import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `PRS/` n'est pas versionné : c'est le simulateur d'origine, qu'on dépose
  // localement le temps de s'y reporter. Du JS de 2005 qu'ESLint ne sait pas
  // analyser et qu'on ne corrigera pas — la règle reste, pour le jour où une
  // copie réapparaît sur un poste.
  globalIgnores(['dist', 'PRS']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
