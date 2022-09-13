const { promisify } = require('util')
const pipeline = promisify(require('stream').pipeline)
const streamEquals = require('binary-stream-equals')

module.exports = function (src, dst, opts) {
  return new MirrorDrive(src, dst, opts)
}

class MirrorDrive {
  constructor (src, dst, opts = {}) {
    this.src = src
    this.dst = dst

    this.dryRun = !!opts.dryRun
    this.allOps = !!opts.allOps
    this.filter = opts.filter

    this.count = { files: 0, add: 0, remove: 0, change: 0 }
    this._deleted = new Map()

    this.iterator = this._mirror()
  }

  [Symbol.asyncIterator] () {
    return this.iterator
  }

  async done () {
    for await (const v of this.iterator) {
      // No-op
    }
  }

  async * _mirror () {
    await this.src.ready()
    await this.dst.ready()

    for await (const dstEntry of this.dst.list('/')) {
      const { key } = dstEntry
      const srcEntry = await this.src.entry(key)

      const fileExists = srcEntry ? !!srcEntry.value.blob : false
      if (!fileExists) {
        this.count.remove++
        yield { op: 'remove', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: 0 }

        if (this.dryRun) this._deleted.set(key, true)
        else await this.dst.del(key)
      }
    }

    for await (const srcEntry of this.src.list('/', { filter: this.filter })) {
      const { key } = srcEntry
      const dstEntry = this._deleted.has(key) ? null : await this.dst.entry(key)

      this.count.files++

      if (dstEntry) {
        const srcMetadata = srcEntry.value.metadata
        const dstMetadata = dstEntry.value.metadata

        const noMetadata = !srcMetadata && !dstMetadata
        const identicalMetadata = !!(srcMetadata && dstMetadata && alike(srcMetadata, dstMetadata))

        const sameMetadata = noMetadata || identicalMetadata
        if (sameMetadata) {
          const sameContents = await streamEquals(this.src.createReadStream(key), this.dst.createReadStream(key))
          if (sameContents) {
            if (this.allOps) yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
            continue
          }
        }
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

function alike (a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
