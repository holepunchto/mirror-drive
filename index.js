const sameData = require('same-data')
const unixPathResolve = require('unix-path-resolve')
const streamEquals = require('binary-stream-equals')
const { pipelinePromise } = require('streamx')

module.exports = class MirrorDrive {
  constructor (src, dst, opts = {}) {
    this.src = src
    this.dst = dst

    this.prefix = opts.prefix || '/'
    this.dryRun = !!opts.dryRun
    this.prune = opts.prune !== false
    this.includeEquals = !!opts.includeEquals
    this.filter = opts.filter || null
    this.metadataEquals = opts.metadataEquals || null
    this.batch = !!opts.batch
    this.entries = opts.entries || null
    this.transformers = opts.transformers || []

    this.count = { files: 0, add: 0, remove: 0, change: 0 }
    this.bytesRemoved = 0
    this.bytesAdded = 0
    this.iterator = this._mirror()
    this._ignore = opts.ignore ? toIgnoreFunction(opts.ignore) : null
  }

  [Symbol.asyncIterator] () {
    return this.iterator
  }

  async done () {
    while (true) {
      const { done } = await this.iterator.next()
      if (done) break
    }
  }

  async * _mirror () {
    await this.src.ready()
    await this.dst.ready()

    if (this.dst.core && !this.dst.core.writable) throw new Error('Destination must be writable')

    const dst = this.batch ? this.dst.batch() : this.dst

    if (this.prune) {
      for await (const [key, dstEntry, srcEntry] of this._list(this.dst, this.src)) {
        if (srcEntry) continue

        this.count.remove++
        this.bytesRemoved += blobLength(dstEntry)
        yield { op: 'remove', key, bytesRemoved: blobLength(dstEntry), bytesAdded: 0 }

        if (!this.dryRun) await dst.del(key)
      }
    }

    if (this.src.download && !this.entries) {
      const dl = this.src.download(this.prefix)
      if (dl.catch) dl.catch(noop)
    }

    for await (const [key, srcEntry, dstEntry] of this._list(this.src, dst, { filter: this.filter })) {
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

      const transformers = this.transformers.reduce((list, transformer) => {
        if (typeof transformer !== 'function') throw new Error('Transformers must be functions that return a duplex stream')

        const stream = transformer()

        if (stream === null) {
          return list
        } else if (isDuplexStream(stream)) {
          list.push(stream)
          return list
        } else {
          throw new Error("Return of transformer doesn't appear to be a stream?")
        }
      }, [])

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
  }

  async * _list (a, b, opts) {
    const list = this.entries || a.list(this.prefix, { ignore: this._ignore })

    for await (const entry of list) {
      const key = typeof entry === 'object' ? entry.key : entry

      if (opts && opts.filter && !opts.filter(key)) continue

      const entryA = await a.entry(entry)
      const entryB = await b.entry(key)

      yield [key, entryA, entryB]
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

function isDuplexStream (s) {
  if (!s || (typeof s !== 'object' && typeof s !== 'function')) return false

  // Must be pipe-able and writable, and expose a readable side
  const hasPipe = typeof s.pipe === 'function'
  const hasWrite = typeof s.write === 'function'
  const hasReadableSide =
    // streamx
    typeof s.push === 'function' ||
    // nodejs
    typeof s.read === 'function' || typeof s._read === 'function'

  return hasPipe && hasWrite && hasReadableSide
}

function noop () {}
