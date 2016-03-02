# Guidelines

## Setting up

 - Run `git submodule foreach git pull` to fetch whatwg submodule.
 - `npm run build` builds the dist files.
 - Dist files are stored in `dist` folder and checked into git so they are downloadable from the repository page.
 - `npm test` runs reference implementation tests.

## Misc

 - No changes are to be made to the submodule files directly.
 - The polyfill API interface must remian backward compatible.
 - If submodule upstream changes, update the submodule, commit the ref and rebuild dist files.
