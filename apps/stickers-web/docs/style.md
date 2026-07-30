# Style Guide

- Use css custom variables to capture color, spacing, and parameter that could be reused.
- Minimum aesthetics. High contrast (black on white), with limited use of grays for dividers.
- Very limited use of semantic colors, for error/warning etc.
- Space efficient. This is a full screen app. Areas should individually handle their scroll/overflow behavior.
- Avoid shadows.
- Minimum bounding boxes and dividers. Use them only when spacing and gestalt alone isn't enough for achieve visual rhythm.
- Ok to use nested CSS selectors.
- Global styles is reserved for minimum amount of resets/normalize
- Component should have their own [name].component.css, and imported by the [name].component.ts like this `import "./component.css"`.
- The root element of the component should generally have a class that matches the name of the component so in the css, all the rules can be nested under `.component-name { ... }` to prevent collision.
- The best css code is no css. Use browser default html/css features until you have to implement your own. If you have to implement your own, keep it basic like an MVP. We will fine tune polish later.
- The main entry point for global styles is `src/style.css`, which imports detailed styles from `src/styles/*.css`.
