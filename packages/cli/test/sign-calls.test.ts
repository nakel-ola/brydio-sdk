import { expect,test } from 'bun:test';
import { callsOf } from '../src/calls.ts';
test('recognizes the sign grant from handler request and status reads',()=>{
 const calls=callsOf('signature.ts',`export default async function(input,client){await client.sign.request(input);return client.sign.get('envelope');}`);
 expect(calls.filter(call=>call.kind==='host').map(call=>call.name)).toEqual(['sign','sign']);
});
