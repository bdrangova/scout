import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The custom utilities from index.css that tailwind-merge would otherwise mistake for colours (or fail to see as shadows).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'border-w': ['border-fine'],
      'border-w-t': ['border-t-fine'],
      'border-w-b': ['border-b-fine'],
      'border-w-l': ['border-l-fine'],
      'border-w-r': ['border-r-fine'],
      shadow: [{ shadow: ['kbd', 'icon', 'raised', 'panel', 'card'] }],
    },
  },
})

/** Join class names and let later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
