const EventEmitter = require('events')
const sameData = require('same-data')
const unixPathResolve = require('unix-path-resolve')
const streamEquals = require('binary-stream-equals')
const speedometer = require('speedometer')
const { pipelinePromise, isStream } = require('streamx')

class Monitor extends EventEmitter {
  constructor (mirror, { interval = 250 } = {}) {
    super()

    this.mirror = mirror
    this.interval = setInterval(this.update.bind(this), interval)
    this.stats = null
    this.index = mirror.monitors.push(this) - 1

    this.update() // populate latest stats
  }

  get destroyed () {
    return this.index === -1
  }

  update () {
    if (this.index === -1) return

    // NOTE: immutable (append-only) data structure
    this.stats = {
      peers: this.mirror.peers.length,
      download: {
        bytes: this.mirror.downloadedBytes,
        blocks: this.mirror.downloadedBlocks,
        speed: this.mirror.downloadSpeed(),
        progress: this.mirror.downloadProgress
      },
      upload: {
        bytes: this.mirror.uploadedBytes,
        blocks: this.mirror.uploadedBlocks,
        speed: this.mirror.uploadSpeed()
      }
    }

    this.emit('update', this.stats)
  }

  destroy () {
    if (this.index === -1) return

    clearInterval(this.interval)

    const head = this.mirror.monitors.pop()
    if (head !== this) {
      this.mirror.monitors[this.index] = head
      head.index = this.index
    }

    this.index = -1
    this.emit('destroy')
  }
}

module.exports = class MirrorDrive {
  constructor (src, dst, opts = {}) {
    this.src = src
    this.dst = dst

    this.prefix = toArray(opts.prefix || '/')
    this.dryRun = !!opts.dryRun
    this.prune = opts.prune !== false
    this.preload = opts.preload !== false && !!src.getBlobs
    this.includeProgress = !!opts.progress && !!src.getBlobs
    this.includeEquals = !!opts.includeEquals
    this.filter = opts.filter || null
    this.metadataEquals = opts.metadataEquals || null
    this.batch = !!opts.batch
    this.entries = opts.entries || null
    this.transformers = opts.transformers || []

    this.count = { files: 0, add: 0, remove: 0, change: 0 }
    this.bytesRemoved = 0
    this.bytesAdded = 0
    this.ignore = opts.ignore ? toIgnoreFunction(opts.ignore) : null
    this.finished = false

    this.downloadedBlocks = 0
    this.downloadedBlocksEstimate = 0
    this.downloadedBytes = 0
    this.downloadSpeed = this.includeProgress ? speedometer() : null

    this.uploadedBlocks = 0
    this.uploadedBytes = 0
    this.uploadSpeed = this.includeProgress ? speedometer() : null

    this.monitors = []
    this.iterator = this._init()
  }

  [Symbol.asyncIterator] () {
    return this.iterator
  }

  get peers () {
    return this.src.core?.peers || []
  }

  get downloadProgress () {
    if (this.finished) return 1
    if (!this.downloadedBlocksEstimate) return 0
    // leave 3% incase our estimatation is wrong - then at least it wont appear done...
    return Math.min(0.99, this.downloadedBlocks / this.downloadedBlocksEstimate)
  }

  monitor (opts) {
    this.includeProgress = true
    if (this.downloadSpeed === null) this.downloadSpeed = speedometer()
    if (this.uploadSpeed === null) this.uploadSpeed = speedometer()
    return new Monitor(this, opts)
  }

  async done () {
    while (true) {
      const { done } = await this.iterator.next()
      if (done) break
    }
  }

  _onupload (index, byteLength) {
    this.uploadedBlocks++
    this.uploadedBytes += byteLength
    this.uploadSpeed(byteLength)
  }

  _ondownload (index, byteLength) {
    this.downloadedBlocks++
    this.downloadedBytes += byteLength
    this.downloadSpeed(byteLength)
  }

  async _flushPreload (entries) {
    const ranges = []
    const blobs = await this.src.getBlobs()

    for (const entry of entries) {
      const blob = entry.value.blob
      if (!blob) continue
      const dl = blobs.core.download({ start: blob.blockOffset, length: blob.blockLength })
      await dl.ready()
      ranges.push(dl)
    }

    this.downloadedBlocksEstimate = this.downloadedBlocks
    for (const dl of ranges) {
      if (!dl.request.context) continue
      this.downloadedBlocksEstimate += (dl.request.context.end - dl.request.context.start)
    }

    for (const dl of ranges) {
      await dl.done()
    }
  }

  async * _init () {
    try {
      for await (const out of this._mirror()) yield out
    } finally {
      while (this.monitors.length) {
        this.monitors[this.monitors.length - 1].destroy()
      }
    }
  }

  async * _mirror () {
    await this.src.ready()
    await this.dst.ready()

    if (this.dst.core && !this.dst.core.writable) throw new Error('Destination must be writable')

    const blobs = this.includeProgress ? await this.src.getBlobs() : null
    const onupload = this._onupload.bind(this)
    const ondownload = this._ondownload.bind(this)

    if (blobs) {
      blobs.core.on('upload', onupload)
      blobs.core.on('download', ondownload)
    }

    const dst = this.batch ? this.dst.batch() : this.dst

    if (this.prune) {
      for await (const [key, dstEntry, srcEntry] of this._list(this.dst, this.src, null)) {
        if (srcEntry) continue

        this.count.remove++
        this.bytesRemoved += blobLength(dstEntry)
        yield { op: 'remove', key, bytesRemoved: blobLength(dstEntry), bytesAdded: 0 }

        if (!this.dryRun) await dst.del(key)
      }
    }

    if (this.preload) {
      const entries = []

      for await (const [, srcEntry] of this._list(this.src, null, this.filter)) {
        entries.push(srcEntry)
      }

      // flush in bg
      this._flushPreload(entries).catch(noop)
    }

    for await (const [key, srcEntry, dstEntry] of this._list(this.src, dst, this.filter)) {
      if (!srcEntry) continue // Due entries option, src entry might not exist probably because it was pruned

      this.count.files++

      // If transformers are provided, we can't know if same before running them
      const hasTransformers = this.transformers && this.transformers.length > 0

      const isSame = hasTransformers === false && await same(this, srcEntry, dstEntry)

      if (isSame) {
        if (this.includeEquals) {
          yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
        }
        continue
      }

      if (dstEntry) {
        this.count.change++
        this.bytesRemoved += blobLength(dstEntry)
        this.bytesAdded += blobLength(srcEntry)
        yield { op: 'change', key, bytesRemoved: blobLength(dstEntry), bytesAdded: blobLength(srcEntry) }
      } else {
        this.count.add++
        this.bytesAdded += blobLength(srcEntry)
        yield { op: 'add', key, bytesRemoved: 0, bytesAdded: blobLength(srcEntry) }
      }

      if (this.dryRun) {
        continue
      }

      const transformers = []

      for (const transformer of this.transformers) {
        if (typeof transformer !== 'function') throw new Error('transformer must be a function')

        const stream = transformer(key)

        if (stream === null) continue
        if (!isStream(stream)) throw new Error('transformer must return a stream')

        transformers.push(stream)
      }

      if (srcEntry.value.linkname) {
        await dst.symlink(key, srcEntry.value.linkname)
      } else {
        await pipelinePromise(
          this.src.createReadStream(srcEntry),
          ...transformers,
          dst.createWriteStream(key, { executable: srcEntry.value.executable, metadata: srcEntry.value.metadata })
        )
      }
    }

    if (this.batch) await dst.flush()

    if (blobs) {
      blobs.core.off('upload', onupload)
      blobs.core.off('download', ondownload)
    }

    this.finished = true
  }

  async * _list (a, b, filter) {
    for (const prefix of this.prefix) {
      const list = this.entries || a.list(prefix, { ignore: this.ignore })

      for await (const entry of list) {
        const key = typeof entry === 'object' ? entry.key : entry

        if (filter && !filter(key)) continue

        const entryA = await a.entry(entry)
        const entryB = b ? await b.entry(key) : null

        yield [key, entryA, entryB]
      }

      if (prefix !== '/' && (!filter || filter(prefix))) {
        const entryA = await a.entry(prefix)
        const entryB = b ? await b.entry(prefix) : null

        if (!entryA && !entryB) continue

        yield [prefix, entryA, entryB]
      }
    }
  }
}

function blobLength (entry) {
  return entry.value.blob ? entry.value.blob.byteLength : 0
}

async function same (m, srcEntry, dstEntry) {
  if (!dstEntry) return false

  if (srcEntry.value.linkname || dstEntry.value.linkname) {
    return srcEntry.value.linkname === dstEntry.value.linkname
  }

  if (srcEntry.value.executable !== dstEntry.value.executable) return false

  if (!sizeEquals(srcEntry, dstEntry)) return false

  if (!metadataEquals(m, srcEntry, dstEntry)) return false

  return streamEquals(m.src.createReadStream(srcEntry), m.dst.createReadStream(dstEntry))
}

function sizeEquals (srcEntry, dstEntry) {
  const srcBlob = srcEntry.value.blob
  const dstBlob = dstEntry.value.blob

  if (!srcBlob && !dstBlob) return true
  if (!srcBlob || !dstBlob) return false

  return srcBlob.byteLength === dstBlob.byteLength
}

function metadataEquals (m, srcEntry, dstEntry) {
  if (!m.src.supportsMetadata || !m.dst.supportsMetadata) return true

  const srcMetadata = srcEntry.value.metadata
  const dstMetadata = dstEntry.value.metadata

  if (m.metadataEquals) {
    return m.metadataEquals(srcMetadata, dstMetadata)
  }

  const noMetadata = !srcMetadata && !dstMetadata
  const identicalMetadata = !!(srcMetadata && dstMetadata && sameData(srcMetadata, dstMetadata))

  return noMetadata || identicalMetadata
}

function toIgnoreFunction (ignore) {
  if (typeof ignore === 'function') return ignore

  const all = [].concat(ignore).map(e => unixPathResolve('/', e))
  return key => all.some(path => path === key || key.startsWith(path + '/'))
}

function toArray (prefix) {
  return Array.isArray(prefix) ? prefix : [prefix]
}

function noop () {}
