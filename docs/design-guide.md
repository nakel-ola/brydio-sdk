# Design guide for marketplace apps

An app in the marketplace runs inside Brydio, next to Brydio's own screens and
other people's apps. You can give it your own colours and shape (a `theme`),
style any element (`style`), lay things out with `bry-box`, draw on a
`bry-canvas`, or write a whole screen in HTML and CSS (a frame screen). This
guide says what fitting into Brydio means. Marketplace review holds every
public app to it, and a reviewer can refuse a version with the reason **Looks
out of place**, naming one of the sections below. You see the reason and the
section on the version.

Apps kept to one workspace skip this review. Their company decides how they
look.

Some things are locked whatever the look, and no review can allow them: an
app can't cover Brydio's own screens, can't load anything from outside
addresses, can't draw outside its own area, and uses Brydio's own font
everywhere. Brydio enforces these itself; you can't opt out of them.

Each section has a name in brackets. That name is what a review cites.

## Spacing [spacing]

- Use Brydio's spacing steps (`space.1` to `space.16`) rather than pixel
  values, so your app follows the person's density the way Brydio does.
- Give content room: at least `space.3` between controls in a row and
  `space.4` around a card's content. Nothing should touch the edge of its
  container.
- Keep one rhythm. A screen that mixes many unrelated gaps looks broken next
  to Brydio's.
- Your `theme.density` scales every step for you. Don't shrink things by hand
  on top of it.

## Rounding [rounding]

- Brydio is round: pills, circular icon buttons, generous corners on cards
  and dialogs. Square corners read as out of place.
- Use Brydio's radii (`radius.md` for controls, `radius.xl` and up for cards
  and panels, `full` for pills) or `theme.rounding` to scale all of them.
  `none` is allowed, but a square app has to look deliberate.
- Nested corners get smaller as they go in: a card at `radius.2xl` holds
  controls at `radius.md`, not the other way round.

## Contrast [contrast]

- Body text needs at least 4.5:1 against what it sits on (WCAG AA), large
  text and icons 3:1. This holds in both light and dark mode.
- `brydio validate` and the registry warn when text on one of your theme's
  colours falls below 4.5:1. Brydio checks your screenshots too.
- Don't put meaning in colour alone. Pair a coloured state with a word or an
  icon.

## Dark mode [dark-mode]

- Every colour you choose has a light and a dark value; Brydio refuses one
  without the other. Choose the dark value for a dark ground, not by
  inverting the light one.
- Your screens must look intended in both modes. Brydio's checks compare your
  light and dark screenshots, and a dark screenshot that looks like the
  light one fails.
- Prefer Brydio's own colours (`brydio.text`, `brydio.surface`,
  `brydio.line`) for text, grounds and lines. They already switch.

## Motion [motion]

- Motion explains a change of state: something opened, moved or finished.
  Use `transition` (`fast`, `base`, `slow`) for that.
- Nothing moves forever. A style has no animation, and a frame screen's CSS
  must not loop an animation that never ends (a spinner is the one exception,
  and only while something is loading).
- Respect reduced motion: in a frame screen, honour
  `prefers-reduced-motion`.

## Use Brydio's elements [brydio-elements]

- Reach for the catalogue first. A button, field, select, menu, dialog,
  table or toast drawn by Brydio behaves the way people expect, with focus,
  keyboard, screen readers and both themes handled.
- Redraw one only when the catalogue can't do what you need, and then make it
  behave the same way: keyboard reachable, a visible focus ring, a name a
  screen reader reads.
- Use `toast()` for a passing confirmation and `bry-alert` or
  `bry-alert-dialog` for anything the person must read. Don't build your own
  notification layer.

## Never redraw Brydio itself [brydio-chrome]

- Don't draw anything that looks like Brydio's own sidebar, title bar, tabs,
  command bar, chat, approval cards or settings.
- Don't put Brydio's logo or name on your screens as if they were Brydio's.
- The person must always be able to tell they are looking at your app. In a
  frame screen Brydio draws a strip above it with your app's name and icon;
  don't imitate it.

## Never ask for a Brydio sign-in [sign-in]

- Never ask for a Brydio password, a sign-in code, or anything that looks
  like Brydio's sign-in. Brydio never asks for those inside an app.
- Your app reaches outside services through its connections, which Brydio
  sets up and holds. Don't ask for their passwords either.
- The registry warns when a frame screen contains a password field. A
  reviewer will ask why it is there.

## Never draw a Brydio dialog [dialogs]

- Don't draw something that looks like a Brydio dialog, permission prompt or
  approval card. When your app needs Brydio to ask the person something, use
  `ask()` and Brydio asks in its own words.
- Your own dialogs use `bry-dialog`, which Brydio draws and names for your
  app.

## Frame screens [frames]

A frame screen is your own HTML and CSS, drawn in a sandboxed frame. The
sections above apply to it too, and so does the following:

- Brydio passes its colour tokens as CSS variables (`--fg`, `--bg-surface`,
  `--line`, `--brand`, …), your theme's colours as `--app-color-<name>`, and
  `data-theme="light"` or `"dark"` on the root element. It updates them live
  when the person switches. Build on these and both modes follow.
- Use Brydio's font: it is set on the frame's root as `font-family`. A frame
  can't load another one.
- Your frame grows to fit its content, up to the placement's limit. Don't
  hide content behind a fixed height.
- Keyboard focus must be visible on everything a person can reach.
