<p align="center">
  <img src="https://raw.githubusercontent.com/sinetthapa/noxy-bots/main/art/nox.png" alt="Nox: a white robot head with long ears, a dark screen for a face and two cyan eyes" width="180">
</p>

# noxy-bots

Cute, expressive bots for your UI. Nox blinks, glances around and naps, thinks while you wait and cheers when
things work. One tag puts it in your project.

[Website](https://noxybots.com) · [Docs](https://noxybots.com/docs) · [Studio](https://noxybots.com/studio)

## Install

```sh
npm i noxy-bots
```

## Use it

**HTML.** Import the element once, then use the tag anywhere.

```html
<script type="module">
  import 'noxy-bots/element';
</script>

<noxy-bot state="thinking" theme="mint" style="width: 200px"></noxy-bot>
```

**React.** `<NoxyBot>` takes the same options as props. It works with React 18 and 19.

```jsx
import { useRef } from 'react';
import { NoxyBot } from 'noxy-bots/react';

export function Helper({ busy }) {
  const nox = useRef(null);
  return (
    <>
      <NoxyBot ref={nox} state={busy ? 'thinking' : 'idle'} />
      <button onClick={() => nox.current?.play('laugh')}>Tickle</button>
    </>
  );
}
```

**Plain JS.** `createBot` draws Nox into any element.

```js
import { createBot } from 'noxy-bots';

const bot = createBot(document.getElementById('nox'), { state: 'happy' });
bot.play('success');
```

Every state, part, theme and method is in the [docs](https://noxybots.com/docs). Want Nox for a slide or a post?
Make it your own in the [studio](https://noxybots.com/studio) and export an MP4 or a Lottie.

## Licence

The code is [MIT](LICENSE). Nox's art is [CC BY 4.0](LICENSE-ART): use it anywhere, just credit
"Nox by Sinet Thapa".

## Contributing

Bug fixes are welcome. For a new feature, open an issue first. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

If Nox made your project a little nicer, you can [buy me a coffee](https://buymeacoffee.com/sinet).
