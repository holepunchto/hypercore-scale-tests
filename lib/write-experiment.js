const Experiment = require('./experiment')

class WriteExperiment extends Experiment {
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

module.exports = WriteExperiment
