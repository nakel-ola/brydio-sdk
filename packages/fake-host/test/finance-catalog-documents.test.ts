import {expect,test} from 'bun:test';
import {runHandler} from '../src/handler.ts';
import type {Handler,HandlerFinance} from '@brydio/app/handler';
for(const provider of ['xero','quickbooks'] as const)test(provider+' catalogs are read-only and need current Finance plus exact connection',async()=>{
 const input={provider,companyId:'company',kind:'contacts' as const,search:'Acme',cursor:'opaque'};
 const result={items:[{id:'real',label:'Acme',kind:'customer' as const}],nextCursor:'next'};let calls=0;
 const finance={accountingCatalog:async(actual:typeof input)=>{calls++;expect(actual).toEqual(input);return result;}};
 const fn:Handler=(_,c)=>c.finance.accountingCatalog(input);
 for(const host of [[],['finance'],[`connection:${provider}`],['finance',`connection:${provider==='xero'?'quickbooks':'xero'}`]])expect((await runHandler(fn,{}, {manifest:{name:'finance',grants:{host}},finance,write:false})).error).toContain('not_granted');
 const manifest={name:'finance',grants:{host:['finance',`connection:${provider}`]}};
 expect((await runHandler(fn,{}, {manifest,finance,write:false,caller:{role:'anonymous'}})).error).toContain("can't use finance");expect(calls).toBe(0);
 expect((await runHandler(fn,{}, {manifest,finance,write:false})).result).toEqual(result);expect(calls).toBe(1);
 expect((await runHandler(fn,{}, {manifest,write:false})).error).toContain('finance_unavailable');
});
for(const method of ['shareDocument','revokeDocumentShare'] as const)test(method+' requires a person on screen and a write tool',async()=>{
 let calls=0;const result=method==='shareDocument'?{shareId:'share',url:'https://brydio.test/share/token',expiresAt:'2026-10-17T00:00:00.000Z'}:{revoked:true};
 const finance={[method]:async()=>{calls++;return result;}} as unknown as Partial<HandlerFinance>;
 const fn:Handler=(_,c)=>(c.finance[method] as (i:unknown)=>Promise<unknown>)(method==='shareDocument'?{documentId:'doc'}:{shareId:'share'});
 const manifest={name:'finance',grants:{host:['finance']}};
 for(const origin of ['assistant','timer'] as const)expect((await runHandler(fn,{}, {manifest,finance,write:true,caller:{origin}})).error).toContain('screen_only');
 expect((await runHandler(fn,{}, {manifest,finance,write:true,caller:{role:'anonymous'}})).error).toContain("can't use finance");expect(calls).toBe(0);
 expect((await runHandler(fn,{}, {manifest,finance,write:false,caller:{origin:'screen'}})).error).toContain('read tool');
 expect((await runHandler(fn,{}, {manifest,finance,write:true,caller:{origin:'screen'}})).result).toEqual(result);expect(calls).toBe(1);
 expect((await runHandler(fn,{}, {manifest:{name:'finance',grants:{host:[]}},finance,write:true,caller:{origin:'screen'}})).error).toContain('not_granted');
});
test('public document is a token-scoped visitor read, never a source or sharing exception',async()=>{
 const result={title:'Shared',markdown:'Only public text',files:[{id:'opaque_1',name:'receipt.pdf',url:'https://brydio.test/shared/download/token',mimeType:'application/pdf',size:10}],expiresAt:'2026-10-17T00:00:00.000Z'};
 const fn:Handler=(_,c)=>c.finance.publicDocument({token:'token'});
 const manifest={name:'finance',grants:{host:['finance']}};
 const finance={publicDocument:async(input:{token:string})=>{expect(input.token).toBe('token');return result;}};
 expect((await runHandler(fn,{}, {manifest,finance,write:false,caller:{role:'anonymous'}})).result).toEqual(result);
 expect((await runHandler(fn,{}, {manifest:{name:'finance',grants:{host:[]}},finance,write:false,caller:{role:'anonymous'}})).error).toContain('not_granted');
 expect((await runHandler(fn,{}, {manifest,write:false,caller:{role:'anonymous'}})).error).toContain('finance_unavailable');
});
