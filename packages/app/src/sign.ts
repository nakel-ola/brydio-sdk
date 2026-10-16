/** Native signatures (LG01), through the `sign` host grant. Requests require a write tool. */
export type SignStatus = 'draft' | 'pending' | 'sealing' | 'completed' | 'declined' | 'cancelled' | 'expired';
export type SignSource = {kind:'app-file';id:string}|{kind:'library-file';id:string}|{kind:'docs';instance:string;collection:string;id:string;field:string}|{kind:'template';id:string;version:number};
export interface SignRecipient {key:string;name:string;identity:{member:string}|{email:string};order?:number}
export interface SignField {key:string;recipient:string;type:'signature'|'initials'|'date'|'text';page:number;x:number;y:number;width:number;height:number;required:boolean}
export interface SignRequest {key:string;title:string;source:SignSource;expectedSourceHash?:string;recipients:SignRecipient[];fields?:SignField[];mode:'parallel'|'sequential';expiresAt?:string;reminderDays?:number;record?:{collection:string;id:string;statusField:string};onStatus?:{tool:string}}
export interface SignSummary {id:string;title:string;status:SignStatus;revision:number;createdAt:string;expiresAt:string|null;recipients:Array<SignRecipient&{id:string;status:'pending'|'signed'|'declined';signedAt?:string}>;fields:SignField[];sourceHash:string;pdf?:string;certificate?:string;sha256?:string;error?:string|null}
/** Durable, at-least-once input `{event}` for the custom tool selected in onStatus. Deduplicate eventId and ignore older revisions. */
export interface SignStatusEvent {id:string;eventId:string;revision:number;status:SignStatus;occurredAt:string;pdf?:string;certificate?:string;sha256?:string}
export interface HandlerSign {request(input:SignRequest):Promise<{id:string;status:SignStatus;url:string}>;get(id:string):Promise<SignSummary>}
