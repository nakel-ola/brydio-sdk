# Reporting a security problem

An app runs other people's code inside a workspace. A hole in the SDK or in
the way Brydio draws an app's screen is not an ordinary bug, and it must not
be reported in a place where everyone can read it before we have fixed it.

## Where to send it

Email [security@brydio.app](mailto:security@brydio.app). Include the affected
package and version, what you observed, and the smallest reproduction you can
share safely. Do not include real workspace data or credentials.

Please do not open a public issue for a security problem.

## What is worth reporting

- A way for an app's code to reach outside its worker: the page, the network,
  another app's data, or anything a person has not granted it.
- A way to draw something the catalogue's checks should have refused, or to
  get a tree past the host's checks.
- A way to publish, install or pin a version that should have been refused —
  an unsigned one where signing is required, one that failed review, or one
  built with an SDK outside the range.
- A way to read or change records belonging to a workspace, an instance or a
  person that the caller is not entitled to.
- Anything that lets a publisher's name, signature or review state say
  something untrue about a version.

## What we will do

Read it, tell you we have it, fix it, and say when it is fixed. If the fix
changes anything a builder depends on, it goes in the changelog like any
other change — with what to do about it, not only that it happened.
