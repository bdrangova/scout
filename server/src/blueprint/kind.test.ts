import { describe, expect, it } from 'vitest'
import { classifyFile } from './kind.ts'

describe('classifyFile', () => {
  it.each([
    ['features/login.feature', 'scenario'],
    ['tests/steps/login.js', 'test'],
    ['src/__tests__/a.ts', 'test'],
    ['src/a.test.tsx', 'test'],
    ['src/a.spec.ts', 'test'],
    ['src/app.scss', 'style'],
    ['package.json', 'config'],
    ['ci/deploy.yml', 'config'],
    ['scripts/run.sh', 'config'],
    ['pages/login_page.js', 'page'],
    ['src/pages/Home.tsx', 'page'],
    ['src/use_form.js', 'hook'],
    ['src/useForm.ts', 'hook'],
    ['src/hooks/form.ts', 'hook'],
    ['src/types.ts', 'types'],
    ['src/api.types.ts', 'types'],
    ['src/string-utils.ts', 'helper'],
    ['src/constants.ts', 'helper'],
    ['src/fieldMapping.js', 'helper'],
    ['src/Card.tsx', 'component'],
    ['src/Card.jsx', 'component'],
    ['src/server.ts', 'module'],
    ['README.md', 'module'],
    ['src/user.ts', 'module'],
  ] as const)('%s is %s', (file, kind) => {
    expect(classifyFile(file)).toBe(kind)
  })
})
