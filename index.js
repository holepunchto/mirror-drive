const { promisify } = require('util')
const pipeline = promisify(require('stream').pipeline)
const streamEquals = require('binary-stream-equals')

module.exports = mirror

async function * mirror (src, dst, { filter, dryRun = false, allOps = false } = {}) {
  await src.ready()
  await dst.ready()

  const count = { files: 0, add: 0, remove: 0, change: 0 }
  const deleted = new Map()

  for await (const dstEntry of dst.list('/')) {
    const { key } = dstEntry
    const srcEntry = await src.entry(key)

    const fileExists = srcEntry ? !!srcEntry.value.blob : false
    if (!fileExists) {
      count.remove++
      yield { op: 'remove', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: 0, count: { ...count } }

      if (dryRun) deleted.set(key, true)
      else await dst.del(key)
    }
  }

  for await (const srcEntry of src.list('/', { filter })) {
    const { key } = srcEntry
    const dstEntry = deleted.has(key) ? null : await dst.entry(key)

    count.files++

    if (dstEntry) {
      const srcMetadata = srcEntry.value.metadata
      const dstMetadata = dstEntry.value.metadata

      const noMetadata = !srcMetadata && !dstMetadata
      const identicalMetadata = !!(srcMetadata && dstMetadata && alike(srcMetadata, dstMetadata))

      const sameMetadata = noMetadata || identicalMetadata
      if (sameMetadata) {
        const sameContents = await streamEquals(src.createReadStream(key), dst.createReadStream(key))
        if (sameContents) {
          if (allOps) yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0, count: { ...count } }
          continue
        }
      }
    }

    if (dstEntry) {
      count.change++
      yield { op: 'change', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: srcEntry.value.blob.byteLength, count: { ...count } }
    } else {
      count.add++
      yield { op: 'add', key, bytesRemoved: 0, bytesAdded: srcEntry.value.blob.byteLength, count: { ...count } }
    }

    if (!dryRun) {
      await pipeline(
        src.createReadStream(key),
        dst.createWriteStream(key, { metadata: srcEntry.value.metadata })
      )
    }
  }
}

function alike (a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
