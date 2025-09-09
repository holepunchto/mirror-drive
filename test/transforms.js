const test = require('brittle')
const { Transform } = require('streamx')
const { Transform: NodeTransform } = require('stream')
const { createDrives, toArray } = require('./helpers/index.js')
const MirrorDrive = require('../index.js')
const b4a = require('b4a')

function upperTransform () {
  return new Transform({
    transform (chunk, cb) {
      this.push(b4a.from(String(chunk).toUpperCase()))
      cb(null)
    }
  })
}

test('transformers: uppercase .txt files, always writes on rerun', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  // Add extra file to ensure variety
  await src.put('/notes.txt', b4a.from('hello world'))

  const transformers = [(key) => upperTransform()]

  const m1 = new MirrorDrive(src, dst, { transformers })
  await m1.done()

  const upperEqual = await dst.get('/equal.txt')
  t.alike(String(upperEqual), 'SAME')

  const upperNotes = await dst.get('/notes.txt')
  t.alike(String(upperNotes), 'HELLO WORLD')

  // Second run should produce only equals
  const m2 = new MirrorDrive(src, dst, { transformers: [(key) => upperTransform()], includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'change')
})

function errorTransform () {
  let done = false
  return new Transform({
    transform (chunk, cb) {
      if (!done) {
        done = true
        cb(new Error('transform boom'))
      } else {
        this.push(chunk)
        cb(null)
      }
    }
  })
}

test('transforms: errors propagate and abort mirror', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  await src.put('/notes.txt', b4a.from('hello'))

  const transformers = [(key) => errorTransform()]

  const m = new MirrorDrive(src, dst, { transformers })

  try {
    await m.done()
    t.fail('should have thrown from transform')
  } catch (err) {
    t.is(err.message, 'transform boom')
  }
})

test('transformers: passthrough (null) still writes on rerun', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  const passthrough = (key) => null

  const m1 = new MirrorDrive(src, dst, { transformers: [passthrough] })
  await m1.done()

  const m2 = new MirrorDrive(src, dst, { transformers: [passthrough], includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'change')
})

test('transformers: length-changing transform writes on rerun', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  // Increase length by appending fruit to every chunk
  function fruitSaladTransform () {
    return new Transform({
      transform (chunk, cb) {
        this.push(b4a.concat([chunk, b4a.from('🍐')]))
        cb(null)
      }
    })
  }

  const transformers = [(key) => fruitSaladTransform()]

  const m1 = new MirrorDrive(src, dst, { transformers })
  await m1.done()

  const m2 = new MirrorDrive(src, dst, { transformers, includeEquals: true })
  const diffs = await toArray(m2)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'change')
})

test('dry run + transforms: emits adds but writes nothing', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, undefined, { setup: false })

  const transformers = [(key) => upperTransform()]

  const m = new MirrorDrive(src, dst, { dryRun: true, transformers, includeEquals: true })
  const diffs = await toArray(m)

  t.ok(diffs.length > 0, 'emitted some diffs')
  for (const d of diffs) t.is(d.op, 'add')

  t.absent(await dst.entry('/equal.txt'))
})

test('transforms + symlink: creates symlink and rerun yields change', async function (t) {
  const { local: src } = await createDrives(t, undefined, { setup: false })
  const { local: dst } = await createDrives(t, undefined, { setup: false })

  await src.put('/target.txt', b4a.from('hello'))
  await src.symlink('/link.shortcut', '/target.txt')

  const transformers = [(key) => upperTransform()]

  const m1 = new MirrorDrive(src, dst, { transformers })
  await m1.done()

  const linkEntry = await dst.entry('/link.shortcut')
  t.ok(linkEntry, 'symlink exists on destination')
  t.is(linkEntry.value.linkname, '/target.txt')

  const m2 = new MirrorDrive(src, dst, { transformers, includeEquals: true })
  const diffs = await toArray(m2)

  const linkDiff = diffs.find(d => d.key === '/link.shortcut')
  t.ok(linkDiff, 'emitted a diff for the symlink')
  t.is(linkDiff.op, 'change')
  t.is(linkDiff.bytesRemoved, 0)
  t.is(linkDiff.bytesAdded, 0)
})

test('transforms: invalid transformer type throws', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  // Invalid: non-function in transformers array
  const transformers = [123]
  const m = new MirrorDrive(src, dst, { transformers })

  try {
    await m.done()
    t.fail('should have thrown for invalid transformer type')
  } catch (err) {
    t.is(err.message, 'Transformers must be functions that return streams')
  }
})

test('transforms: transformer returns non-stream throws', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  const transformers = [() => ({ not: 'a stream' })]
  const m = new MirrorDrive(src, dst, { transformers })

  try {
    await m.done()
    t.fail('should have thrown for non-stream return value')
  } catch (err) {
    t.is(err.message, "Return of transformer doesn't appear to be a stream?")
  }
})

test('transforms: node stream Transform works', async function (t) {
  const { local: src } = await createDrives(t)
  const { local: dst } = await createDrives(t, { setup: false })

  function nodeUpperTransform () {
    return new NodeTransform({
      transform (chunk, _enc, cb) {
        cb(null, b4a.from(String(chunk).toUpperCase()))
      }
    })
  }

  const transformers = [(key) => nodeUpperTransform()]

  const m = new MirrorDrive(src, dst, { transformers })
  await m.done()

  const upperEqual = await dst.get('/equal.txt')
  t.alike(String(upperEqual), 'SAME')
})
