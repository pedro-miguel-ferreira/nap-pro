* journey 1 — launch the app
  * user runs Nap.app (or `npm start` during dev)
  * dark window appears
  * terminal is immediately interactive
    * shell prompt visible
    * user types `ls`, sees output
    * scrollback works (run a command that produces lots of output, scroll up)
  * user resizes window
    * terminal reflows to fit
    * no visual artifacts, no clipping

* journey 2 — use the terminal normally
  * user runs long-running process (`top`, `node server.js`)
  * output streams smoothly
    * no stuttering, no dropped frames
  * user hits Ctrl+C
    * process stops, shell prompt returns
  * user runs something that fills scrollback
    * `cat` a large file or `seq 1 20000`
    * scroll up — content is there
    * performance stays smooth at 10k+ lines

* journey 3 — exit
  * user types `exit` in shell
    * terminal shows exit message
    * window stays open (can still scroll back)
  * user closes window (Cmd+W or red button)
    * pty process is killed
    * app quits cleanly
    * no orphan processes

* journey 4 — native module build (developer journey)
  * developer clones repo
  * runs `npm install`
  * node-pty builds successfully (electron-rebuild)
  * `npm start` launches the app
  * if node-pty fails to build
    * clear error message
    * common fix: xcode command line tools, python, etc.
