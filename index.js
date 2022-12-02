const sameData = require('same-data')
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

    this.count = { files: 0, add: 0, remove: 0, change: 0 }
    this.bytesRemoved = 0
    this.bytesAdded = 0
    this.iterator = this._mirror()
  }

  [Symbol.asyncIterator] () {
    return this.iterator
  }

  async done () {
    console.log('[mirror-drive] done()')
    while (true) {
      console.log('[mirror-drive] while')
      const { done } = await this.iterator.next()
      console.log('[mirror-drive] iterator done?', { done })
      if (done) break
      console.log('[mirror-drive] loop continues')
    }
    console.log('[mirror-drive] loop ended')
  }

  async * _mirror () {
    console.log('[mirror-drive] _mirror() iteration')
    await this.src.ready()
    await this.dst.ready()
    console.log('[mirror-drive] _mirror() after ready')

    const dst = this.batch ? this.dst.batch() : this.dst

    if (this.prune) {
      console.log('[mirror-drive] prune')
      for await (const [key, dstEntry, srcEntry] of list(this.prefix, dst, this.src)) {
        console.log('[mirror-drive] pruning', dstEntry.key)
        if (srcEntry) continue

        this.count.remove++
        this.bytesRemoved += blobLength(dstEntry)
        yield { op: 'remove', key, bytesRemoved: blobLength(dstEntry), bytesAdded: 0 }

        if (!this.dryRun) await dst.del(key)
      }
      console.log('[mirror-drive] prune ended')
    }

    for await (const [key, srcEntry, dstEntry] of list(this.prefix, this.src, dst, { filter: this.filter })) {
      console.log('[mirror-drive] mirroring', srcEntry.key)
      this.count.files++

      if (await same(this, srcEntry, dstEntry)) {
        console.log('[mirror-drive] same')
        if (this.includeEquals) yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
        continue
      }

      if (dstEntry) {
        console.log('[mirror-drive] change')
        this.count.change++
        this.bytesRemoved += blobLength(dstEntry)
        this.bytesAdded += blobLength(srcEntry)
        yield { op: 'change', key, bytesRemoved: blobLength(dstEntry), bytesAdded: blobLength(srcEntry) }
      } else {
        console.log('[mirror-drive] add')
        this.count.add++
        this.bytesAdded += blobLength(srcEntry)
        yield { op: 'add', key, bytesRemoved: 0, bytesAdded: blobLength(srcEntry) }
      }

      console.log('[mirror-drive] after mirroring')

      if (this.dryRun) {
        console.log('[mirror-drive] dry run')
        continue
      }

      if (srcEntry.value.linkname) {
        console.log('[mirror-drive] symlink')
        await dst.symlink(key, srcEntry.value.linkname)
      } else {
        console.log('[mirror-drive] write', srcEntry.key)

        /* const ws = dst.createWriteStream(key, { executable: srcEntry.value.executable, metadata: srcEntry.value.metadata })

        ws.on('error', console.error)
        ws.on('end', () => console.log('ws ended'))
        ws.on('close', () => console.log('ws closed'))

        const closed = new Promise(resolve => ws.once('close', resolve))

        for await (const chunk of this.src.createReadStream(srcEntry)) {
          // console.log(chunk.toString())
          ws.write(chunk)
        }
        ws.end()

        await closed*/

        await pipeline(
          this.src.createReadStream(srcEntry),
          dst.createWriteStream(key, { executable: srcEntry.value.executable, metadata: srcEntry.value.metadata })
        )

        console.log('[mirror-drive] after write', srcEntry.key)
      }
      console.log('[mirror-drive] mirroring ended')
    }

    if (this.batch) await dst.flush()

    console.log('[mirror-drive] _mirror() ended')
  }
}

function blobLength (entry) {
  return entry.value.blob ? entry.value.blob.byteLength : 0
}

async function * list (prefix, a, b, opts) {
  for await (const entryA of a.list(prefix, opts)) {
    const entryB = await b.entry(entryA.key)
    yield [entryA.key, entryA, entryB]
  }
}

function pipeline (rs, ws) {
  return new Promise((resolve, reject) => {
    rs.pipe(ws, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
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
