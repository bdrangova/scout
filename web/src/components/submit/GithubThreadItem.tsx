import { Link } from 'react-router'
import { PrCommentCard } from '@/components/prcomments/PrCommentCard'
import { encodePath } from '@/lib/paths'
import type { PrThread } from '@/lib/pr-threads'

/**
 * One PR thread in the Submit comments panel: the shared read-only card (author, body, the agent's note
 * and commit, status, link to GitHub) plus, while its line is still in the diff, a link to that line's
 * file card in Files. The file itself is the heading of the group it sits in.
 */
export function GithubThreadItem({ thread }: { thread: PrThread }) {
  const { root } = thread
  const linked = root.path !== null && root.anchor !== null
  return (
    <li className="flex flex-col gap-1">
      <ul className="m-0 flex list-none flex-col p-0">
        <PrCommentCard thread={thread} showLocation />
      </ul>
      {linked && (
        <p className="m-0 px-1 text-[11.5px]">
          <Link to={`../files/${encodePath(root.path ?? '')}`} relative="path" className="font-semibold text-ink underline-offset-2 hover:underline">
            In Files
          </Link>
        </p>
      )}
    </li>
  )
}
