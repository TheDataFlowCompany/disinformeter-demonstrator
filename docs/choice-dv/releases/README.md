# Deconspirator Releases

This directory stores immutable copies of the Qualtrics task assets.

Production Qualtrics surveys should prefer a fixed release URL instead of the
mutable top-level `js/` and `css/` paths. For example:

```html
<script src="https://thedataflowcompany.com/files/deconspirator/releases/2026.05.05/js/deconspirator-task.js"></script>
```

```text
https://thedataflowcompany.com/files/deconspirator/releases/2026.05.05/css/deconspirator-task.css
```

Each release contains:

- `js/deconspirator-task.js` — engine loaded by Qualtrics header/source HTML
- `js/task-item.js` — matching pasted Qualtrics question JavaScript
- `css/deconspirator-task.css` — external CSS loaded by Qualtrics

Do not edit an existing release after a Qualtrics survey has used it. Create a
new dated release directory instead, test it in a copied survey, then promote
that exact release URL when ready. If multiple releases are needed on the same
day, use a patch suffix such as `2026.05.05.1`.
