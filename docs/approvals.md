# Approvals

An app can ask people to approve one of its records: a leave request, an
expense, a release. Brydio keeps the request, shows it in each approver's
"Waiting on you" inbox, and tells the app the outcome.

Ask for the `approvals` host grant in `app.json`:

```json
{ "grants": { "host": ["approvals"] } }
```

## From a handler

`approvals.request` and `approvals.cancel` need a write tool. `approvals.get`
works from any tool.

```ts
import type { Handler } from '@brydio/app/handler';

const submit: Handler<{ id: string; lead: string }> = async ({ id, lead }, { approvals, data }) => {
  const asked = await approvals.request({
    title: 'Leave: 3 to 7 November',
    steps: [
      { name: 'Lead', approvers: [{ type: 'person', principalId: lead }], rule: 'any' },
      { name: 'HR', approvers: [{ type: 'role', role: 'admin' }], rule: 'any' },
    ],
    record: { collection: 'leave', id },
    statusField: 'approval',
  });
  const record = await data.get('leave', id);

  return data.update('leave', id, record.version, { approvalId: asked.id });
};

export default submit;
```

- Steps run in order. `any` needs one yes, `all` needs everyone, `count`
  needs `count` yeses. A decline ends the request.
- The person asking is never an approver. A step with nobody left goes to the
  workspace admins, and the request says why. So does a `manager` or `group`
  approver Brydio can't resolve yet.
- With `statusField`, Brydio writes `pending`, `approved`, `declined` or
  `cancelled` into that text field on the record. Your screens and handlers
  see it like any other change.

## On a screen

`<bry-approval request="apr_...">` shows the title, the status, each step and
its approvers. An approver can approve or decline there, with a comment. It
fires `decided` with `{ status }`.

## In tests

`runHandler` from `@brydio/fake-host` keeps what a handler raised in
`run.approvals.requests` and checks input the way Brydio does.
`run.approvals.decide(id, by, 'approve' | 'decline', comment?)` answers as an
approver would. `person` approvers are the ids you name. Any other approver is
the one pretend admin, `admin_test`.
