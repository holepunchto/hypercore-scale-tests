const RAM = require('random-access-memory')
const Corestore = require('corestore')

module.exports = async function runWriteTest ({ nrBlocks, blockByteSize, runInParallel = false }) {
  const storage = RAM.reusable() // TODO: pass in boolean opt, either on temp dir or RAM
  const store = new Corestore(storage)

  const core = store.get({ name: 'core' })
  await core.ready()

  const block = 'a'.repeat(blockByteSize)

  const startTime = new Date()

  if (runInParallel) {
    const proms = []
    for (let i = 0; i < nrBlocks; i++) {
      proms.push(core.append(block).catch(() => {}))
    }
    await Promise.all(proms)
  } else {
    for (let i = 0; i < nrBlocks; i++) {
      await core.append(block)
      // TODO: figure out why this is a ~sync loop without this
      await new Promise(resolve => setImmediate(resolve))
    }
  }

  const runTime = new Date() - startTime

  return runTime
}

/*
async function main() {
  if (!process.argv[2]) {
    console.log('Call as <nrBLocks> ?<blockByteSize> ?<runInParallel>')
    process.exit(1)
  }
  const nrBlocks = parseInt(process.argv[2])
  const blockByteSize = process.argv[3] ? parseInt(process.argv[3]) : 1000
  const runInParallel = (process.argv[4] || '').toLowerCase() === 'true'

  console.log(`Running write test with ${nrBlocks} blocks of ${blockByteSize} bytes each (${runInParallel ? 'in parallel' : 'serial' })`)

  const runtime = await runWriteTest(nrBlocks, blockByteSize, runInParallel)
  const blocksPerSec = 1000 * (nrBlocks / runtime)
  const mbPerSec = blockByteSize * blocksPerSec / (1000 * 1000)
  console.log(`Writing the blocks took ${runtime / 1000}s (${Math.round(blocksPerSec)} blocks/s, ${Math.round(mbPerSec)} Mb/s)`)
}

main()
*/
