* electron app + single terminal
  * the foundation — nothing else works without this
  * proves: electron + xterm.js + node-pty work together on macOS

* BrowserWindow
  * dark opaque theme
    * no transparency, no vibrancy
    * dark background, light text
  * one window = one directory
    * cwd passed at launch
    * window title = directory basename
  * frameless or native frame — TBD, native is simpler for POC

* terminal
  * xterm.js
    * WebGL addon — mounted immediately, never disposed
    * addon-fit — resize terminal to fill container
    * scrollback: 10,000 lines
    * dark theme matching the window
  * node-pty
    * spawns user's default shell ($SHELL)
    * cwd = app's launch directory
    * stays alive for session lifetime
  * pty ↔ xterm data flow
    * pty.onData → xterm.write (output)
    * xterm.onData → pty.write (input)

* layout (simplified for this feature)
  * terminal fills the entire window
  * sidebar comes in 0200
  * just a dark window with a working terminal

* native module concern
  * node-pty is a native module
  * needs electron-rebuild or @electron/rebuild
  * test early: does it build? does it spawn shells?
  * this is the #1 risk for this feature
