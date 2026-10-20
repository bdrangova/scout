import type { ComponentProps } from 'react'
import { FILE_TYPES, fileTypeClass, type FileTypeId } from '@/lib/file-type'
import { cn } from '@/lib/utils'

type FileTypeDotProps = Omit<ComponentProps<'span'>, 'children'> & {
  type: FileTypeId
  size?: 'sm' | 'default'
}

const LABEL = new Map(FILE_TYPES.map((t) => [t.id, t.label]))

/** A small filled circle in the file type's accent colour, with the type name for screen readers. */
function FileTypeDot({ type, size = 'default', className, ...props }: FileTypeDotProps) {
  return (
    <span
      data-slot="file-type-dot"
      data-type={type}
      className={cn(
        fileTypeClass(type),
        'inline-flex shrink-0 rounded-full border-fine border-fill-line bg-ft',
        size === 'sm' ? 'size-[9px]' : 'size-3',
        className,
      )}
      {...props}
    >
      <span className="sr-only">{LABEL.get(type)}</span>
    </span>
  )
}

export { FileTypeDot, type FileTypeDotProps }
