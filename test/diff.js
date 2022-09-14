const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const mirror = require('../index.js')

test('remove', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.del('/tmp.txt')

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 5, add: 0, remove: 1, change: 0 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/tmp.txt', bytesRemoved: 4, bytesAdded: 0 })
})

test('add', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/new-tmp.txt', Buffer.from('same'))

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 7, add: 1, remove: 0, change: 0 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/new-tmp.txt', bytesRemoved: 0, bytesAdded: 4 })
})

test('change content', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/buffer.txt', Buffer.from('edit'))

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 0, change: 1 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/buffer.txt', bytesRemoved: 4, bytesAdded: 4 })
})

test('change metadata', async function (t) {
  const { local, hyper } = await createDrives(t)

  await local.put('/meta.txt', Buffer.from('same'), { metadata: 'edit' })

  const m = mirror(local, hyper)

  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  const diffs = await toArray(m)
  t.alike(m.count, { files: 6, add: 0, remove: 0, change: 1 })

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'change', key: '/meta.txt', bytesRemoved: 4, bytesAdded: 4 })
})
