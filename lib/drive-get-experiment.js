const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const Experiment = require('./experiment')

class DriveGetExperiment extends Experiment {
  constructor (tmpDir, { nrFiles, fileByteSize }) {
    super(tmpDir, 'Drive Get Hyperdrive experiment')

    this.store = new Corestore(this.tmpDir)
    this.drive = new Hyperdrive(this.store)

    this.nrFiles = nrFiles
    this.fileByteSize = fileByteSize

    this.file = 'a'.repeat(this.fileByteSize)
  }

  async _setup () {
    if (this.closing) return
    for (let i = 0; i < this.nrFiles; i += 1) {
      if (this.closing) return
      await this.drive.put(`/blob${i}.txt`, this.file)
    }
  }

  async _runExperiment () {
    for (let i = 0; i < this.nrFiles; i += 1) {
      if (this.closing) return
      const content = await this.drive.get(`/blob${i}.txt`)
      if (content == null) {
        throw new Error('Bug in this code: nullish entry in the hyperdrive')
      }
    }
  }

  async _teardown () {
    await this.drive.close()
    await this.store.close()
  }
}

module.exports = DriveGetExperiment
