const test = require('brittle')
const { createDrives, changeDrive, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')

test('done()', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(local)

  const m = new MirrorDrive(local, hyper)
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  t.is(m.bytesRemoved, 0)
  t.is(m.bytesAdded, 0)
  await m.done()
  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
  t.is(m.bytesRemoved, 16)
  t.is(m.bytesAdded, 15)

  const m2 = new MirrorDrive(local, hyper)
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})
