const Corestore = require('corestore')
const Experiment = require('./experiment')

class WriteExperiment extends Experiment {
  constructor (tmpDir, { nrBlocks, blockByteSize }) {
    super(tmpDir, 'Write experiment')

    this.store = new Corestore(this.tmpDir)
    this.core = this.store.get({ name: 'core' })

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize

    this.block = 'a'.repeat(this.blockByteSize)
  }

  async _setup () {
    if (this.closing) return
    await this.core.ready()
  }

  async _teardown () {
    await this.store.close()
  }

  async _runExperiment () {
    for (let i = 0; i < this.nrBlocks; i++) {
      await this.core.append(this.block)
      if (this.closing) return
    }
  }
}

module.exports = WriteExperiment
