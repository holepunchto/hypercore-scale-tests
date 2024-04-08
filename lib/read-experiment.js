const Experiment = require('./experiment')

class ReadExperiment extends Experiment {
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

module.exports = ReadExperiment
