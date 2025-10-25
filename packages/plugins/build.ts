import { build } from 'tsdown'

await build({
  entry: ['./index.ts'],
  dts: true,
  unbundle: true
});
