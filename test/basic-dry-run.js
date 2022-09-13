const test = require('brittle')
const { createDrives, changeDrive, sortObjects } = require('./helpers/index.js')
const mirror = require('../index.js')

test('dry run - mirror localdrive into hyperdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  const expected = await changeDrive(local)

  for (let i = 0; i < 2; i++) {
    const actual = []

    const m = mirror(local, hyper, { dryRun: true, allOps: true })
    t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })

    for await (const diff of m) {
      delete diff.count
      actual.push(diff)
    }

    t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
    t.alike(sortObjects(actual), sortObjects(expected))
  }
})

test('dry run - mirror hyperdrive into localdrive', async function (t) {
  const { local, hyper } = await createDrives(t)

  const expected = await changeDrive(hyper)

  for (let i = 0; i < 2; i++) {
    const actual = []

    const m = mirror(hyper, local, { dryRun: true, allOps: true })
    t.alike(m.count, { files: 0, add: 0, remove: 0, change: 0 })

    for await (const diff of m) {
      delete diff.count
      actual.push(diff)
    }

    t.alike(m.count, { files: 6, add: 1, remove: 1, change: 3 })
    t.alike(sortObjects(actual), sortObjects(expected))
  }
})
