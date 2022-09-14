const { promisify } = require('util')
const pipeline = promisify(require('stream').pipeline)
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
    this.prune = opts.prune === undefined ? true : !!opts.prune
    this.allOps = !!opts.allOps
    this.filter = opts.filter

    this.count = { files: 0, add: 0, remove: 0, change: 0 }
    this.iterator = this._mirror()
  }

  [Symbol.asyncIterator] () {
    return this.iterator
  }

  async done () {
    for await (const v of this.iterator) { // eslint-disable-line no-unused-vars
      // No-op
    }
  }

  async * _mirror () {
    await this.src.ready()
    await this.dst.ready()

    if (this.prune) {
      for await (const [key, dstEntry, srcEntry] of list(this.prefix, this.dst, this.src)) {
        if (!isFile(srcEntry)) {
          this.count.remove++
          yield { op: 'remove', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: 0 }

          if (!this.dryRun) await this.dst.del(key)
        }
      }
    }

    for await (const [key, srcEntry, dstEntry] of list(this.prefix, this.src, this.dst, { filter: this.filter })) {
      this.count.files++

      if (await same(this, srcEntry, dstEntry)) {
        if (this.allOps) yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
        continue
      }

      if (dstEntry) {
        this.count.change++
        yield { op: 'change', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: srcEntry.value.blob.byteLength }
      } else {
        this.count.add++
        yield { op: 'add', key, bytesRemoved: 0, bytesAdded: srcEntry.value.blob.byteLength }
      }

      if (!this.dryRun) {
        await pipeline(
          this.src.createReadStream(key),
          this.dst.createWriteStream(key, { metadata: srcEntry.value.metadata })
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

async function same (m, srcEntry, dstEntry) {
  if (!dstEntry) return false

  const { key } = srcEntry
  const srcMetadata = srcEntry.value.metadata
  const dstMetadata = dstEntry.value.metadata

  const noMetadata = !srcMetadata && !dstMetadata
  const identicalMetadata = !!(srcMetadata && dstMetadata && deepEqual(srcMetadata, dstMetadata))

  const sameMetadata = noMetadata || identicalMetadata
  if (!sameMetadata) return false

  const sameContents = await streamEquals(m.src.createReadStream(key), m.dst.createReadStream(key))
  return sameContents
}
