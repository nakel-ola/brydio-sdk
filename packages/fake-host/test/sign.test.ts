import { describe,expect,test } from 'bun:test';
import { runHandler } from '../src/handler.ts';
import type { Handler } from '@brydio/app/handler';
const input={key:'deal-1',title:'NDA',source:{kind:'app-file' as const,id:'pdf'},mode:'parallel' as const,recipients:[{key:'buyer',name:'Buyer',identity:{email:'buyer@example.test'}}],fields:[{key:'sig',recipient:'buyer',type:'signature' as const,page:1,x:10,y:10,width:20,height:10,required:true}]};
const request:Handler=(_,client)=>client.sign.request(input);
const get:Handler=(_,client)=>client.sign.get('sig_1');
const sign={request:async()=>({id:'sig_1',status:'pending' as const,url:'/signatures?id=sig_1'}),get:async()=>({id:'sig_1',title:'NDA',status:'completed' as const,revision:3,createdAt:'2026-10-16T12:00:00Z',expiresAt:null,recipients:[],fields:[],sourceHash:'a'.repeat(64),pdf:'/sign/sig_1/files/pdf',certificate:'/sign/sig_1/files/certificate',sha256:'b'.repeat(64)})};
describe('native signatures from an app handler',()=>{
 test('requires a sign grant and a write tool for a request',async()=>{expect((await runHandler(request,{}, {manifest:{name:'crm',grants:{host:[]}},sign})).error).toContain('not_granted');expect((await runHandler(request,{}, {manifest:{name:'crm',grants:{host:['sign']}},write:false,sign})).error).toContain('read tool');expect((await runHandler(request,{}, {manifest:{name:'crm',grants:{host:['sign']}},write:true,sign})).result).toEqual({id:'sig_1',status:'pending',url:'/signatures?id=sig_1'});});
 test('allows status reads from a read tool but refuses an anonymous caller',async()=>{expect((await runHandler(get,{}, {manifest:{name:'crm',grants:{host:['sign']}},write:false,sign})).result).toMatchObject({status:'completed',sha256:'b'.repeat(64)});expect((await runHandler(get,{}, {manifest:{name:'crm',grants:{host:['sign']}},caller:{role:'anonymous'},sign})).error).toContain("can't use sign");});
 test('reports unavailable explicitly without a signing fixture',async()=>{expect((await runHandler(get,{}, {manifest:{name:'crm',grants:{host:['sign']}}})).error).toContain('sign_unavailable');});
});

test('preserves the host tool name in an explicit caller fixture',async()=>{const caller:Handler=(_,client)=>client.caller;expect((await runHandler(caller,{}, {caller:{tool:'signature_changed'}})).result).toMatchObject({tool:'signature_changed'});});
