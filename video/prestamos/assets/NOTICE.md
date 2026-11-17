# Assets de terceros

Estos archivos se sirven localmente para que el render no dependa de la red:

| Asset | Versión | Origen | Licencia |
| --- | --- | --- | --- |
| `gsap.min.js` | 3.15.1 | https://gsap.com/ | GreenSock Standard License (gratuita para este uso) |
| Plus Jakarta Sans (`fonts/plus-jakarta-sans-latin.woff2`, `fonts/plus-jakarta-sans-latin-ext.woff2`) | Google Fonts variable | https://fonts.google.com/specimen/Plus+Jakarta+Sans | SIL Open Font License 1.1 |
| Font Awesome Free (`fontawesome/css/all.min.css`, `fontawesome/webfonts/*.woff2`) | 6.x Free | https://fontawesome.com/ | Icons CC BY 4.0 · Fonts SIL OFL 1.1 · Code MIT |
| `bgm.mp3`, `click.wav`, `success.wav` | — | Generados localmente por `scripts/generate-audio.mjs` | Obra original del proyecto; sin samples ni loops de terceros |

Las referencias `url()` a formatos TTF no incluidos se retiraron del CSS de Font Awesome para que el render no intente descargar archivos inexistentes. Los navegadores usan los `.woff2` locales.
