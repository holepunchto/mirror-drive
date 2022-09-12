# mirror-drive

Mirror a hyperdrive or localdrive into another one.

```
npm i mirror-drive
```

## Usage
```js
import mirror from 'mirror-drive'

const m = mirror(src, dst)

for await (const progress of m) {}
// or
await m.done()

// m[Symbol.asyncIterator] = ...

/*
mirror(src, dst, prefix?)
{ prune: false }
*/
```

## API

#### `const m = mirror(src, dst, [prefix])`

## License
MIT
