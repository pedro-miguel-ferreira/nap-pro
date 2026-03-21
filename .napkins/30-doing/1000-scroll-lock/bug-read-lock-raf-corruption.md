# Bug: Read Lock RAF Corruption

Why `pos !== lockedY` approach fails during active output.

```
* read lock restore cycle — the full chain
  * restore (synchronous, immediate)
    * onWriteParsed fires
      * xterm's event: "a chunk of data was parsed"
        * // answer as a sep subthread to each of Qs in this bullet
        * // where writes originate from? 
        * // is it any write by the app? 
        * // how does user input compares to that?
        * // how does the app views the terminal, what's the interface on it's part?
        * // what is ink using to redraw the header?
        * // how does it look when CC:
          * // decides to truncate prev output a bit  
            * //DU: cuts some lines from the start way back
            * //DU: draws the header on top way back
        * fires at the end of WriteBuffer._innerWrite()
      * _innerWrite is the loop that processes queued terminal.write() data
      * it runs as a macrotask (scheduled via setTimeout)
      * onWriteParsed fires synchronously at the end of that macrotask
        * meaning: our handler runs right there, same call stack
        * no delay, no scheduling
    * our handler calls scrollToLine(lockedY)
      * changes ydisp in BufferService (synchronous, immediate)
      * does NOT touch the DOM yet
        * DOM updates go through Viewport._innerRefresh
        * _innerRefresh only runs in a RAF (requestAnimationFrame)
      * triggers syncScrollArea → schedules RAF for _innerRefresh
        * syncScrollArea notices ydisp changed
        * calls _refresh(false) → false means "not immediate, use RAF"
        * RAF = "run this on the next animation frame" (~16ms later)
  * DOM sync (async, ~16ms later)
    * RAF fires on next animation frame
      * all our flags (writeJustParsed, isRestoring) long gone by now
        * microtask flags live for one microtask checkpoint
        * that happened right after the macrotask above
        * RAF is a whole new macrotask, much later
    * _innerRefresh runs two steps in sequence
      * step 1: scroll area height update
        * buffer grew from new output (more lines = taller scroll area)
        * _scrollArea.style.height = newHeight
        * browser MAY adjust scrollTop and fire scroll event
          * e.g. if scrollTop is now past the new max
          * or just because the geometry changed
        * _ignoreNextScrollEvent is NOT set yet
          * it gets set in step 2, not step 1
          * so xterm's own guard against echo scroll events doesn't help here
      * step 2: scrollTop sync
        * sets scrollTop to match ydisp
        * NOW sets _ignoreNextScrollEvent = true
        * too late — step 1 already caused the damage
  * corruption (consequence of step 1)
    * _handleScroll runs on the height-change scroll event
      * xterm's DOM scroll handler, has no idea this was self-caused
      * computes diff = newRow - ydisp
        * newRow: where browser moved scrollTop (from height adjustment)
        * ydisp: what we set via scrollToLine (= lockedY)
        * diff: browser's adjustment, not a user action
      * fires onRequestScrollLines({ amount: diff, suppressScrollEvent: true })
        * → BufferService.scrollLines(diff, true)
          * changes ydisp silently (suppressed → no _onScroll event)
          * if diff + ydisp >= ybase → clears isUserScrolling
            * catastrophic: next write auto-scrolls ydisp to bottom
    * our DOM scroll listener also fires on this same event
      * reads viewportY = new (wrong) ydisp
      * pos ≠ lockedY → overwrites lockedY with garbage
    * next onWriteParsed
      * scrollToLine(corrupted lockedY) → wrong position
      * or if isUserScrolling was cleared: ydisp already at bottom
      * user sees jump to ~line 30 or line 0
  * why it works without output
    * no writes → no onWriteParsed → no scrollToLine → no RAF chain
    * user scroll is the only thing happening → no conflict
  * the fundamental problem
    * we restore synchronously, side effects arrive asynchronously via RAF
    * by RAF time, we can't tell our own restore's echoes from user scrolls
```
