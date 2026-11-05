import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { clearAssignedPrsCache } from '@/hooks/useAssignedPrs'

afterEach(() => {
  cleanup()
  // The PR list is cached across visits; each test starts without it.
  clearAssignedPrsCache()
})
