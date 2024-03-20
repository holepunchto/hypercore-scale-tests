const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const idEnc = require('hypercore-id-encoding')

module.exports = function setupPeer ({ bootstrap, storage, logger = console } = {}) {
  const swarm = new Hyperswarm({ bootstrap })
  const store = new Corestore(storage)

  swarm.on('connection', (conn, info) => {
    const peerKey = idEnc.normalize(info.publicKey)
    logger.debug(`Connection opened with ${peerKey}`)
    store.replicate(conn)
    conn.on('error', e => { logger.debug(e) })
    conn.on('close', () => {
      logger.debug(`Connection closed with ${peerKey} `)
    })
  })

  return new Peer(swarm, store)
}

class Peer {
  constructor (swarm, store) {
    this.swarm = swarm
    this.store = store
    this.cores = new Map()
  }

  get keys () {
    return [...this.cores.keys()]
  }

  async downloadCore (key) {
    key = idEnc.normalize(key)
    if (this.cores.has(key)) return

    const core = this.store.get({ key: idEnc.decode(key) })
    this.cores.set(key, core)

    await core.ready()
    core.download({ start: 0, end: -1, linear: true })

    this.swarm.join(core.discoveryKey, { server: true, client: true })
  }

  async createCore (name, nrBlocks, blockSizeBytes = 1000) {
    const core = this.store.get({ name })
    await core.ready()
    // Note: race condition if called with same name
    this.cores.set(idEnc.normalize(core.key), core)

    for (let i = 0; i < nrBlocks; i++) {
      // TODO: ensure there's no comppression at transport level
      const block = 'a'.repeat(blockSizeBytes)
      await core.append(block)
    }

    this.swarm.join(core.discoveryKey, { server: true, client: true })
  }
}
