# Deep Zoom Debugger

This is a PoC for a zoom-based debugger based on the [Play Programming Language](https://github.com/airportyh/play-lang).

## The Making Of

I have documented the work on this debugger as a [video series](https://www.youtube.com/watch?v=kzrWQt__R8Q&list=PLSq9OFrD2Q3Bp9T2SiAAxOF60VSbGAtHn).

Also see the video [Google-Earth-Like Zooming File Explorer](https://www.youtube.com/watch?v=pXQTNxPharY&t) for more background.

## Todo

* display function parameters initial value
* show return values for call exprs
* make it not rewrite the function calls by replacing the arguments with concrete values
* fix bug of bottom code text not displaying when 2 call exprs are at the same level and we are zoomed in to them
* play with different programs
* code clean up: for finding call exprs, do it per line
* optimization: fitbox - straight calculation, no need to do binary search for fixed width fonts
* optimization: smartly avoid render code if box is off screen
* implement variable display for composite types (arrays and dictionaries)
* make it work for multiple call expressions on a single line
* integrate it into language runtime so can conviniently use it
* display screenshot next to each line, or visually on a timeline in some way
* display the skipped lines in a different color??
* how to remove jiggling? (artifact of the fit text/fit box algorithms) (done)
* center text vertically and horizontally (done)
* add line height (done)
* add text color, color line numbers and variable display differently (done)
* add inlined values display (including return values) (done)
* debug fib-loops.play (done)
