const ReadyResource = require('ready-resource')
const safetyCatch = require('safety-catch')

/*
  State machine:
  - Experiment gets created as a new WriteTest instance
  - runExperiment() is called. It can be called exactly once
  - the readyResource enters ready state.
      => This should be fast, ideally no logic lives in _open
         because the experiment can't be cancelled while it runs
  - _setup() runs
      =>  here lives the logic needed to setup the experiment
          but that should NOT be counted to the experiment runtime
      =>  this method should detect when it is closing, and early-return in that case
          to make the experiment quickly cancellable
  - _runExperiment() runs
      =>  the actual experiment, for which the runtime is measured
      =>  this method should detect when it is closing, and early-return in that case
          to make the experiment quickly cancellable
  - _close() runs, to clean up the experiment

  if close() is called at any time during the experiment, the test stops and cleans itself up
    =>  this depends on the _setup() and _runExperiment() methods being well-behaved
*/

class Experiment extends ReadyResource {
  constructor (store, name) {
    super()

    this.store = store
    this.name = name

    this.startTime = null
    this.endTime = null
    this._runningProm = null
  }

  async _open () {
    await this.store.ready()
  }

  async _close () {
    await this._runningProm
    await this.store.close()
  }

  // Implement in subclass
  async _setup () { }

  // Implement in subclass
  async _runExperiment () { }

  get runTime () {
    return this.endTime ? this.endTime - this.startTime : -1
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
}
class WriteTest extends Experiment {
  constructor (store, { nrBlocks, blockByteSize }) {
    super(store, 'Write experiment')

    this.core = this.store.get({ name: 'core' })

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize

    this.block = 'a'.repeat(this.blockByteSize)
  }

  async _setup () {
    if (this.closing) return
    await this.core.ready()
  }

  async _runExperiment () {
    for (let i = 0; i < this.nrBlocks; i++) {
      await this.core.append(this.block)
      if (this.closing) return
    }
  }
}

class ReadTest extends Experiment {
  constructor (store, { nrBlocks, blockByteSize }) {
    super(store, 'Read experiment')

    this.core = this.store.get({ name: 'core' })

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize

    this.block = 'a'.repeat(this.blockByteSize)
  }

  async _setup () {
    if (this.closing) return
    for (let i = 0; i < this.nrBlocks; i++) {
      await this.core.append(this.block)
      if (this.closing) return
    }
  }

  async _runExperiment () {
    for (let i = 0; i < this.nrBlocks; i++) {
      await this.core.get(i)
      if (this.closing) return
    }
  }
}

module.exports = {
  WriteTest,
  ReadTest
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
