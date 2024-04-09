const Experiment = require('./experiment')
const setupTestnet = require('hyperdht/testnet')
const idEnc = require('hypercore-id-encoding')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const safetyCatch = require('safety-catch')
const path = require('path')
const ReadyResource = require('ready-resource')

class ReadStreamDownloadExperiment extends Experiment {
  constructor (tmpDir, { nrBlocks, blockByteSize }) {
    super(tmpDir, 'Read-stream download experiment')

    this.nrBlocks = nrBlocks
    this.blockByteSize = blockByteSize

    this.creator = null
    this.streamer = null

    this.block = 'a'.repeat(this.blockByteSize)

    this.swarm = null
    this.testnet = null
  }

  async _setup () {
    const testnet = await setupTestnet()
    const bootstrap = testnet.bootstrap

    this.creator = await setupPeer(bootstrap, path.join(this.tmpDir, 'creator'))
    if (this.closing) return

    await this.creator.createCore(
      'core', this.nrBlocks, this.blockByteSize, this
    )
    if (this.closing) return

    this.streamer = await setupPeer(bootstrap, path.join(this.tmpDir, 'streamer'))
  }

  async _runExperiment () {
    for (const key of this.creator.keys) {
      await this.streamer.streamCore(key, this.nrBlocks, this)
    }
  }

  async _teardown () {
    if (this.creator) await this.creator.close()
    if (this.streamer) await this.streamer.close()
  }
}

async function setupPeer (bootstrap, storageDir) {
  const swarm = new Hyperswarm({ bootstrap })
  const store = new Corestore(storageDir)

  swarm.on('connection', (conn, info) => {
    store.replicate(conn)
    conn.on('error', safetyCatch)
  })

  const peer = new Peer(swarm, store)
  await peer.ready()

  return peer
}

class Peer extends ReadyResource {
  constructor (swarm, store) {
    super()

    this.swarm = swarm
    this.store = store
    this.cores = new Map()
  }

  async _open () {
    await this.store.ready()
  }

  async _close () {
    await this.swarm.destroy()
    await this.store.close()
  }

  get keys () {
    return [...this.cores.keys()]
  }

  async streamCore (key, coreLength, experiment) {
    const core = this.store.get({ key: idEnc.decode(key) })
    await core.ready()
    this.swarm.join(core.discoveryKey, { server: false, client: true })

    let i = 0
    const stream = core.createReadStream({ end: coreLength })
    for await (const block of stream) { // eslint-disable-line no-unused-vars
      if (experiment.closing) return
      i++
    }

    if (i !== coreLength) {
      throw new Error('Did not stream all blocks. Error in this code?')
    }
  }

  async createCore (name, nrBlocks, blockSizeBytes = 1000, experiment) {
    const core = this.store.get({ name })
    await core.ready()
    this.cores.set(idEnc.normalize(core.key), core)

    for (let i = 0; i < nrBlocks; i++) {
      // TODO: ensure there's no compression at transport level
      const block = 'a'.repeat(blockSizeBytes)
      await core.append(block)
      if (experiment.closing) return
    }

    this.swarm.join(core.discoveryKey, { server: true, client: true })
  }
}

module.exports = ReadStreamDownloadExperiment
