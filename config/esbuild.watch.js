import esbuild from 'esbuild'

const entryPoints = [
  'src/schemas/task.ts',
  'src/dto/index.ts',
  'src/services/task-database.service.ts',
  'src/client.ts',
  'src/constant/collections.ts'
]

const sharedConfig = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: ['firebase-admin', 'zod']
}

// Create contexts for all entry points
const contexts = await Promise.all(
  entryPoints.map(entry =>
    esbuild.context({
      ...sharedConfig,
      entryPoints: [entry],
      outdir: 'dist',
      outExtension: { '.js': '.js' }
    })
  )
)

// Watch all contexts
await Promise.all(contexts.map(ctx => ctx.watch()))

console.log('Watching for changes...')
