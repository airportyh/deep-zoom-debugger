# Deep Zoom Debugger

This is a PoC for a zoom-based debugger based on the [Play Programming Language](https://github.com/airportyh/play-lang).

## The Making Of

I have documented the work on this debugger as a [video series](https://www.youtube.com/watch?v=kzrWQt__R8Q&list=PLSq9OFrD2Q3Bp9T2SiAAxOF60VSbGAtHn).

## Todo

* fix fib(0) and fib(1) not rendering in detail mode
* performance problems
* add inlined values display (including return values)
* display the skipped line in a different color
* debug fib-loops.play
* loops display
* make it not rewrite the function calls by replacing the arguments with concrete values
* how to remove jiggling? (artifact of the fit text/fit box algorithms)
* make it work for multiple call expressions on a single line