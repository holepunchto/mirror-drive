const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const mirror = require('../index.js')

test('prune basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await hyper.put('/new-tmp.txt', Buffer.from('same'))

  const m = mirror(local, hyper)
  const diffs = await toArray(m)

  t.absent(await hyper.entry('/new-tmp.txt'))

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/new-tmp.txt', bytesRemoved: 4, bytesAdded: 0 })
})

test('prune - dry run', async function (t) {
  const { local, hyper } = await createDrives(t)

  await hyper.put('/new-tmp.txt', Buffer.from('same'))

  const m = mirror(local, hyper, { dryRun: true })
  const diffs = await toArray(m)

  t.ok(await hyper.entry('/new-tmp.txt'))

  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/new-tmp.txt', bytesRemoved: 4, bytesAdded: 0 })
})
