import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { BlueprintScopeNotice } from './BlueprintScopeNotice'

describe('BlueprintScopeNotice', () => {
  it('shows the title and count, links back to the diagram and offers all files', async () => {
    const onShowAll = vi.fn()
    render(
      <MemoryRouter>
        <BlueprintScopeNotice sessionId="s1" diagramId="pkg:src/a" title="src/a" count={1} onShowAll={onShowAll} />
      </MemoryRouter>,
    )
    expect(screen.getByText('src/a')).toBeInTheDocument()
    expect(screen.getByLabelText('1 file')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Blueprint' })).toHaveAttribute('href', '/s/s1/blueprint?at=pkg%3Asrc%2Fa')
    await userEvent.click(screen.getByRole('button', { name: 'Show all files' }))
    expect(onShowAll).toHaveBeenCalledOnce()
  })
})
