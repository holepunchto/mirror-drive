const streamEquals = require('binary-stream-equals')
const { pipelinePromise: pipeline } = require('streamx')

module.exports = mirror

async function * mirror (src, dst, { filter, dryRun = false } = {}) {
  await src.ready()
  await dst.ready()

  const count = { total: 0, add: 0, remove: 0, change: 0 }
  const deleted = new Map()

  for await (const dstEntry of dst.list('/')) {
    const { key } = dstEntry
    const srcEntry = await src.entry(key)

    const fileExists = srcEntry ? !!srcEntry.value.blob : false
    if (!fileExists) {
      count.remove++
      yield { op: 'remove', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: 0, count }

      if (dryRun) deleted.set(key, true)
      else await dst.del(key)
    }
  }

  for await (const srcEntry of src.list('/', { filter })) {
    const { key } = srcEntry
    const dstEntry = deleted.has(key) ? null : await dst.entry(key)

    count.total++

    if (dstEntry) {
      const srcMetadata = srcEntry.value.metadata
      const dstMetadata = dstEntry.value.metadata

      const noMetadata = !srcMetadata && !dstMetadata
      const identicalMetadata = !!(srcMetadata && dstMetadata && alike(srcMetadata, dstMetadata))

      const sameMetadata = noMetadata || identicalMetadata
      if (sameMetadata) {
        const sameContents = await streamEquals(src.createReadStream(key), dst.createReadStream(key))
        if (sameContents) {
          // yield { op: 'equal', key, bytesRemoved: 0, bytesAdded: 0 }
          continue
        }
      }
    }

    if (dstEntry) {
      count.change++
      yield { op: 'change', key, bytesRemoved: dstEntry.value.blob.byteLength, bytesAdded: srcEntry.value.blob.byteLength, count }
    } else {
      count.add++
      yield { op: 'add', key, bytesRemoved: 0, bytesAdded: srcEntry.value.blob.byteLength, count }
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
