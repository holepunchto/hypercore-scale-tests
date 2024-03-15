# Hypercore Scale Tests

## Install
`npm i`

Replace replicator's `Peer._requestRangeBlock` with the following, which adds tracing

```
  _requestRangeBlock (index, length) {
    this.tracer.trace('_requestRangeBlock')
    if (this.core.bitfield.get(index) === true || !this._hasTreeParent(index)) return false

    const b = this.replicator._blocks.add(index, PRIORITY.NORMAL)
    if (b.inflight.length > 0) return false

    const req = this._makeRequest(index >= length, b.priority)
    this.tracer.trace('_requestRangeBlockmadeRequest')

    // If the request cannot be satisfied, dealloc the block request if no one is subscribed to it
    if (req === null) {
      b.gc()
      this.tracer.trace('_requestRangeBlock-insta-gc')
      return false
    }

    this.tracer.trace('_requestRangeBlock_adding-inflight')
    req.block = { index, nodes: 0 }

    b.inflight.push(req)
    this._send(req)

    // Don't think this will ever happen, as the pending queue is drained before the range queue
    // but doesn't hurt to check this explicitly here also.
    if (b.queued) b.queued = false
    return true
  }
```

## Run

Then run
`node index.js <nrBlocks>`
