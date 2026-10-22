import { Navigate } from 'react-router'

/** The index route of a test run (`/t/:id`): always opens the Overview. */
export function TestRunIndexRedirect() {
  return <Navigate to="overview" replace />
}
