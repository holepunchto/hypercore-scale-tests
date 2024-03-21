const RAM = require('random-access-memory')
const Corestore = require('corestore')
const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')

module.exports = class WriteTest extends ReadyResource {
  constructor ({ nrBlocks, blockByteSize, runInParallel = false }) {
    super()

    const storage = RAM.reusable() // TODO: pass in boolean opt, either on temp dir or RAM
    this.store = new Corestore(storage)
    this.core = this.store.get({ name: 'core' })

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize
    this.runInParallel = runInParallel

    this.block = 'a'.repeat(this.blockByteSize)

    this.startTime = null
    this.endTime = null
    this._runningProm = null
  }

  get runTime () {
    return this.endTime ? this.endTime - this.startTime : -1
  }

  async _open () {
  }

  async _close () {
    await this._runningProm
    await this.store.close()
  }

  async _setup () {
    if (this.closing) return
    await this.core.ready()
  }

  async runExperiment () {
    if (this.startTime !== null) throw new Error('Already ran')

    await this.ready()
    await this._setup()
    if (this.closing) return

    this.startTime = new Date()
    await this._runExperiment()
    this.endTime = new Date()

    this.close().catch(safetyCatch)
    return this.runTime
  }

  async _runExperiment () {
    if (this.runInParallel) {
      const proms = []
      for (let i = 0; i < this.nrBlocks; i++) {
        proms.push(this.core.append(this.block).catch(() => {}))
      }
      await Promise.all(proms)
    } else {
      for (let i = 0; i < this.nrBlocks; i++) {
        await this.core.append(this.block)
        if (this.closing) return
        // TODO: figure out why this is a ~sync loop without this
        await new Promise(resolve => setImmediate(resolve))
      }
    }
  }
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
