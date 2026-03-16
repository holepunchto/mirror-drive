const Corestore = require('corestore')
const Hyperdrive = require('hyperdrive')
const MirrorDrive = require('../')
const LocalDrive = require('localdrive')
const test = require('brittle')

test.solo('stage with 11 files', async function (t) {
  const platformCorestore = new Corestore(await t.tmp(), {
    manifestVersion: 1,
    compat: false,
    wait: true
  })
  await platformCorestore.ready()
  t.teardown(() => platformCorestore.close())

  {
    t.comment('opening corestore session')
    const corestore = platformCorestore.session({ writable: true })
    await corestore.ready()
    t.teardown(() => corestore.close())

    t.comment('opening drive')
    const drive = new Hyperdrive(corestore)
    await drive.ready()
    t.teardown(() => drive.close())

    t.comment('setting manifest')
    await drive.db.put('manifest', 'hello world')

    t.comment('seeding source drive')
    const src = new LocalDrive(await t.tmp(), { followExternalLinks: true })
    for (let i = 0; i < 11; i++) await src.put(`/file${i}.txt`, Buffer.from(`hello world ${i}`))

    t.comment('mirroring')
    const mirror = new MirrorDrive(src, drive, { dedup: true, batch: true })
    try {
      let mirrorCount = 0
      for await (const _diff of mirror) {
        if (mirrorCount++ === 2) {
          t.comment('closing drive during mirror')
          await drive.close()
        }
      }
      t.fail('should error when writing to a closed drive')
    } catch (err) {
      t.ok(err.message.includes('Closed'), 'should error when the drive gets closed')
    }
    await corestore.close()
  }

  {
    t.comment('reopening corestore session')
    const corestore = platformCorestore.session({ writable: true })
    await corestore.ready()
    t.teardown(() => corestore.close())

    t.comment('reopening drive')
    const drive = new Hyperdrive(corestore)
    await drive.ready()
    t.teardown(() => drive.close())

    t.comment('final length is', drive.core.length)
    t.comment('reading manifest')
    t.is((await drive.db.get('manifest')).value, 'hello world', 'manifest should be readable')
  }
})

test.solo('stage with 12 files', async function (t) {
  const platformCorestore = new Corestore(await t.tmp(), {
    manifestVersion: 1,
    compat: false,
    wait: true
  })
  await platformCorestore.ready()
  t.teardown(() => platformCorestore.close())

  {
    t.comment('opening corestore session')
    const corestore = platformCorestore.session({ writable: true })
    await corestore.ready()
    t.teardown(() => corestore.close())

    t.comment('opening drive')
    const drive = new Hyperdrive(corestore)
    await drive.ready()
    t.teardown(() => drive.close())

    t.comment('setting manifest')
    await drive.db.put('manifest', 'hello world')

    t.comment('seeding source drive')
    const src = new LocalDrive(await t.tmp(), { followExternalLinks: true })
    for (let i = 0; i < 12; i++) await src.put(`/file${i}.txt`, Buffer.from(`hello world ${i}`))

    t.comment('mirroring')
    const mirror = new MirrorDrive(src, drive, { dedup: true, batch: true })
    try {
      let mirrorCount = 0
      for await (const _diff of mirror) {
        if (mirrorCount++ === 2) {
          t.comment('closing drive during mirror')
          await drive.close()
        }
      }
      t.fail('should error when writing to a closed drive')
    } catch (err) {
      t.ok(err.message.includes('Closed'), 'should error when the drive gets closed')
    }

    await corestore.close()
  }

  {
    t.comment('reopening corestore session')
    const corestore = platformCorestore.session({ writable: true })
    await corestore.ready()
    t.teardown(() => corestore.close())

    t.comment('reopening drive')
    const drive = new Hyperdrive(corestore)
    await drive.ready()
    t.teardown(() => drive.close())

    t.comment('final length is', drive.core.length)
    t.comment('reading manifest')
    t.is((await drive.db.get('manifest')).value, 'hello world', 'manifest should be readable')
  }
})
