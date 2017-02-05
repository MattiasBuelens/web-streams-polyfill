# web-streams-polyfill
Web Streams, based on the WHATWG spec reference implementation.  
[![Join the chat at https://gitter.im/web-streams-polyfill/Lobby](https://img.shields.io/badge/GITTER-join%20chat-green.svg)](https://gitter.im/web-streams-polyfill/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Links
 - [Official spec](https://streams.spec.whatwg.org/)
 - [Reference implementation](https://github.com/whatwg/streams)

## Usage

For node.js / browserify users:

```javascript

var streams = require("web-streams-polyfill");
var readable = new streams.ReadableStream;

// Or, in ES6

import { ReadableStream } from "web-streams-polyfill";

```

For use as polyfill, include the `dist/polyfill.min.js` file in your html before your main script.

```html
<script src="/path/to/polyfill.min.js"></script>
<script type="text/javascript">

  var readable = new window.ReadableStream;

</script>
```
## Contributors

Thanks to these people for their contributions:

 - Anders Riutta [ariutta](https://github.com/ariutta)
