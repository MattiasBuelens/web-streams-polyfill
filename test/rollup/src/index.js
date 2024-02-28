import { ReadableStream, WritableStream } from 'web-streams-polyfill/es5';

new ReadableStream({
  start(c) {
    c.enqueue('ok');
    c.close();
  }
}).pipeTo(new WritableStream({
  write(chunk) {
    console.log(chunk);
  }
}));
