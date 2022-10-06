const test = require('brittle')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

test('prune basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await hyper.put('/new-tmp.txt', b4a.from('same'))

  const m = new MirrorDrive(local, hyper)
  const diffs = await toArray(m)
  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/new-tmp.txt', bytesRemoved: 4, bytesAdded: 0 })

  t.absent(await hyper.entry('/new-tmp.txt'))
})

test('prune dry run', async function (t) {
  const { local, hyper } = await createDrives(t)

  await hyper.put('/new-tmp.txt', b4a.from('same'))

  const m = new MirrorDrive(local, hyper, { dryRun: true })
  const diffs = await toArray(m)
  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'remove', key: '/new-tmp.txt', bytesRemoved: 4, bytesAdded: 0 })

  t.ok(await hyper.entry('/new-tmp.txt'))
})

test('prune disabled basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await hyper.put('/new-tmp.txt', b4a.from('same'))

  const m = new MirrorDrive(local, hyper, { prune: false })
  const diffs = await toArray(m)
  t.is(diffs.length, 0)

  t.ok(await hyper.entry('/new-tmp.txt'))
})
