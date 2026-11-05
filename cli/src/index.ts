import { Command } from 'commander'
import { SCHEMA_VERSION } from '@scout/shared'
import pkg from '../package.json' with { type: 'json' }
import { registerAppStatus } from './commands/app-status.ts'
import { registerArchive } from './commands/archive.ts'
import { registerArtifact } from './commands/artifact.ts'
import { registerCheckpoint } from './commands/checkpoint.ts'
import { registerEnv } from './commands/env.ts'
import { registerFeedback } from './commands/feedback.ts'
import { registerInit } from './commands/init.ts'
import { registerInstall } from './commands/install.ts'
import { registerJournal } from './commands/journal.ts'
import { registerOpen } from './commands/open.ts'
import { registerPath } from './commands/path.ts'
import { registerPublishLog } from './commands/publish-log.ts'
import { registerPrComments } from './commands/pr-comments.ts'
import { registerPrTrust } from './commands/pr-trust.ts'
import { registerPrLink } from './commands/pr-link.ts'
import { registerPrReply } from './commands/pr-reply.ts'
import { registerPrResolve } from './commands/pr-resolve.ts'
import { registerPrReport } from './commands/pr-report.ts'
import { registerPrSync } from './commands/pr-sync.ts'
import { PrSyncError } from './pr/gh.ts'
import { registerPending } from './commands/pending.ts'
import { registerResolve } from './commands/resolve.ts'
import { registerRunFile } from './commands/run-file.ts'
import { registerRunIndex } from './commands/run-index.ts'
import { registerStatus } from './commands/status.ts'
import { registerVideo } from './commands/video.ts'

const program = new Command()

program
  .name('ai-review')
  .description(`Create Scout sessions for Claude Code work and read the review back (contract v${SCHEMA_VERSION})`)
  .version(pkg.version)

registerInit(program)
registerPath(program)
registerArtifact(program)
registerPublishLog(program)
registerEnv(program)
registerAppStatus(program)
registerCheckpoint(program)
registerFeedback(program)
registerResolve(program)
registerJournal(program)
registerPending(program)
registerStatus(program)
registerPrSync(program)
registerPrReport(program)
registerPrResolve(program)
registerPrReply(program)
registerPrLink(program)
registerPrComments(program)
registerPrTrust(program)
registerOpen(program)
registerArchive(program)
registerRunIndex(program)
registerRunFile(program)
registerVideo(program)
registerInstall(program)

try {
  await program.parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(error instanceof PrSyncError ? error.exitCode : 1)
}
