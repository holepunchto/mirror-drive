const sameData = require('same-data')
const unixPathResolve = require('unix-path-resolve')
const streamEquals = require('binary-stream-equals')

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
    this.transforms = opts.transforms || []

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

      if (await same(this, key, srcEntry, dstEntry)) {
        if (this.includeEquals) yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
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

      if (srcEntry.value.linkname) {
        await dst.symlink(key, srcEntry.value.linkname)
      } else {
        const rs = this.src.createReadStream(srcEntry)
        const ws = dst.createWriteStream(key, { executable: srcEntry.value.executable, metadata: srcEntry.value.metadata })
        const p = applyTransforms(this, key, srcEntry, rs)
        await pipeline(p, ws)
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

function pipeline (rs, ws) {
  return new Promise((resolve, reject) => {
    rs.pipe(ws, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

async function same (m, key, srcEntry, dstEntry) {
  if (!dstEntry) return false

  if (srcEntry.value.linkname || dstEntry.value.linkname) {
    return srcEntry.value.linkname === dstEntry.value.linkname
  }

  if (srcEntry.value.executable !== dstEntry.value.executable) return false

  if (!metadataEquals(m, srcEntry, dstEntry)) return false

  // If transforms are provided, always run them; a transform should pass-through when not applicable
  if (m.transforms && m.transforms.length) {
    const p = applyTransforms(m, key, srcEntry, m.src.createReadStream(srcEntry))
    return streamEquals(p, m.dst.createReadStream(dstEntry))
  }

  if (!sizeEquals(srcEntry, dstEntry)) return false

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

function applyTransforms (m, key, entry, rs) {
  if (!m.transforms || m.transforms.length === 0) return rs
  let p = rs
  for (const tf of m.transforms) {
    const s = tf({ key, entry })
    if (s) p = p.pipe(s)
  }
  return p
}

function noop () {}
