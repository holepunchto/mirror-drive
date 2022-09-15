const deepEqual = require('deep-equal')
const streamEquals = require('binary-stream-equals')

module.exports = function (src, dst, opts) {
  return new MirrorDrive(src, dst, opts)
}

class MirrorDrive {
  constructor (src, dst, opts = {}) {
    this.src = src
    this.dst = dst

    this.prefix = opts.prefix || '/'
    this.dryRun = !!opts.dryRun
    this.prune = opts.prune !== false
    this.includeEquals = !!opts.includeEquals
    this.filter = opts.filter || null

    this.count = { files: 0, add: 0, remove: 0, change: 0 }
    this.iterator = this._mirror()
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

    if (this.prune) {
      for await (const [key, dstEntry, srcEntry] of list(this.prefix, this.dst, this.src)) {
        if (isFile(srcEntry)) continue

        this.count.remove++
        yield { op: 'remove', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: 0 }

        if (!this.dryRun) await this.dst.del(key)
      }
    }

    for await (const [key, srcEntry, dstEntry] of list(this.prefix, this.src, this.dst, { filter: this.filter })) {
      this.count.files++

      if (await same(this, srcEntry, dstEntry)) {
        if (this.includeEquals) yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
        continue
      }

      if (dstEntry) {
        this.count.change++
        yield { op: 'change', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: srcEntry.value.blob.byteLength }
      } else {
        this.count.add++
        yield { op: 'add', key, bytesRemoved: 0, bytesAdded: srcEntry.value.blob ? srcEntry.value.blob.byteLength : 0 }
      }

      if (this.dryRun) {
        continue
      }

      if (srcEntry.value.linkname) {
        await this.dst.symlink(key, srcEntry.value.linkname)
      } else {
        await pipeline(
          this.src.createReadStream(key),
          this.dst.createWriteStream(key, { executable: srcEntry.value.executable, metadata: srcEntry.value.metadata })
        )
      }
    }
  }
}

async function * list (prefix, a, b, opts) {
  for await (const entryA of a.list(prefix, opts)) {
    const entryB = await b.entry(entryA.key)
    yield [entryA.key, entryA, entryB]
  }
}

function isFile (entry) {
  return entry ? !!entry.value.blob : false
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
  if (!sizeEquals(srcEntry, dstEntry)) return false
  if (!metadataEquals(srcEntry, dstEntry)) return false
  return streamEquals(m.src.createReadStream(srcEntry), m.dst.createReadStream(dstEntry))
}

function metadataEquals (srcEntry, dstEntry) {
  const srcMetadata = srcEntry.value.metadata
  const dstMetadata = dstEntry.value.metadata

  const noMetadata = !srcMetadata && !dstMetadata
  const identicalMetadata = !!(srcMetadata && dstMetadata && deepEqual(srcMetadata, dstMetadata))

  return noMetadata || identicalMetadata
}

function sizeEquals (srcEntry, dstEntry) {
  const srcBlob = srcEntry.value.blob
  const dstBlob = dstEntry.value.blob

  if (!srcBlob && !dstBlob) return true
  if (!srcBlob || !dstBlob) return false

  return srcBlob.byteLength === dstBlob.byteLength
}
