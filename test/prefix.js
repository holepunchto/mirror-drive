const test = require('brittle')
const { createDrives, changeDrive, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')

test('prefix basic', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(local)

  await local.put('/examples/a.txt', Buffer.from('same'))
  await local.put('/examples/b.txt', Buffer.from('same'))

  await hyper.put('/examples/a.txt', Buffer.from('same'))
  t.absent(await hyper.entry('/examples/b.txt'))

  const m = new MirrorDrive(local, hyper, { prefix: '/examples' })
  const diffs = await toArray(m)
  t.is(diffs.length, 1)
  t.alike(diffs[0], { op: 'add', key: '/examples/b.txt', bytesRemoved: 0, bytesAdded: 4 })

  t.ok(await hyper.entry('/examples/b.txt'))
})
