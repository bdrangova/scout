import { render, screen } from '@testing-library/react'
import { Inbox } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Kbd } from '@/components/ui/kbd'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders the title as the page heading with the summary and the hint', () => {
    render(<PageHeader title="Extras" summary={<span>2 items</span>} hint={<Kbd>C</Kbd>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Extras' })).toBeInTheDocument()
    expect(screen.getByText('2 items')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('is a status with the title, description and action', () => {
    render(<EmptyState icon={Inbox} title="No extras" description="Nothing in extras/." action={<button type="button">Reload</button>} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('No extras')
    expect(status).toHaveTextContent('Nothing in extras/.')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
