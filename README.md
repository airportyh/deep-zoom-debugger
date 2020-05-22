# Deep Zoom Debugger

This is a PoC for a zoom-based debugger based on the [Play Programming Language](https://github.com/airportyh/play-lang).

## The Making Of

I have documented the work on this debugger as a [video series](https://www.youtube.com/watch?v=kzrWQt__R8Q&list=PLSq9OFrD2Q3Bp9T2SiAAxOF60VSbGAtHn).

Also see the video [Google-Earth-Like Zooming File Explorer](https://www.youtube.com/watch?v=pXQTNxPharY&t) for more background.

## Todo

* implement zoomable value display for composite types phase 2
    * add feature to fit box to draw box outlines
    * allow nested arrays / dictionaries to be zoomable
* integrate it into language runtime so can conviniently use it
* make nested call exprs work
* code cleanup: extract some functions in getCodeBox
* display screenshot next to each line, or visually on a timeline in some way
* add a type checker to play lang, which
    * enforces assignment to only allow matching typed values
    * enforces that assignments to a variable must come after its declaration
    * enforces that there may only be one declaration

## Done
* implement variable display for composite types (arrays and dictionaries) phase 1 (done)
* optimization: smartly avoid render code if box is off screen (done)
* fix bug of bottom code text not displaying when 2 call exprs are at the same level and we are zoomed in to them (done)
* play with different programs (done)
* make it not rewrite the function calls by replacing the arguments with concrete values(done)
* experiment with displaying code call expressions unchanged by show call expression with concrete values on the side(done)
* show return values for call exprs (done)
* make it work for multiple call expressions on a single line (done)
* code clean up: for finding call exprs, do it per line (done)
* display function parameters initial value (done)
* how to remove jiggling? (artifact of the fit text/fit box algorithms) (done)
* center text vertically and horizontally (done)
* add line height (done)
* add text color, color line numbers and variable display differently (done)
* add inlined values display (including return values) (done)
* debug fib-loops.play (done)
