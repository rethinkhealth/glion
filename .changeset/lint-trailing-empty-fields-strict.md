---
"@glion/lint-no-trailing-empty-field": minor
"@glion/lint-profile-extra-fields": minor
---

Breaking: `@glion/lint-no-trailing-empty-field` counts the empty fields the sender wrote, and reports one trailing empty field only with `strict: true` ([#1090](https://github.com/rethinkhealth/glion/issues/1090)).

- Add a `strict` option to `@glion/lint-no-trailing-empty-field`, defaulting to `false`: a segment that ends with one empty field, such as `PID|1|`, is reported only when it is set.
- Change `@glion/lint-profile-extra-fields` to count a segment's fields up to its last field with a value, so empty fields past the last defined field are not reported.
- Add a `strict` option to `@glion/lint-profile-extra-fields`, defaulting to `false`: when set, every field the segment holds is counted.
