// Use type safe message keys with `next-intl`
type Messages = typeof import("../../locales/en.json")
// eslint-disable-next-line no-unused-vars
declare interface IntlMessages extends Messages {}

declare module 'react-scroll';
declare module 'bootstrap/dist/js/bootstrap.bundle.min.js';
