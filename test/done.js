const test = require('brittle')
const { createDrives, changeDrive, toArray } = require('./helpers/index.js')
const mirror = require('../index.js')

test('done()', async function (t) {
  const { local, hyper } = await createDrives(t)

  await changeDrive(local)

  const m = mirror(local, hyper)
  t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })
  await m.done()
  t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })

  const m2 = mirror(local, hyper)
  const diffs = await toArray(m2)
  t.is(diffs.length, 0)
})
