import esbuild from 'esbuild'
import { execSync } from 'child_process'

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

// Build all entry points
await Promise.all(
  entryPoints.map(entry =>
    esbuild.build({
      ...sharedConfig,
      entryPoints: [entry],
      outdir: 'dist',
      outExtension: { '.js': '.js' }
    })
  )
)

// Generate TypeScript declarations
console.log('Generating TypeScript declarations...')
execSync('tsc --emitDeclarationOnly --declaration --declarationMap', {
  stdio: 'inherit'
})

console.log('Build complete!')
