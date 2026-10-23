import { createContext, useContext } from 'react'
import type { PrFinding } from '@review-dash/shared'
export const ProposalAnnotationsContext = createContext<readonly PrFinding[]>([])
export function useProposalAnnotations() { return useContext(ProposalAnnotationsContext) }
