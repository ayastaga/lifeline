# Rules engine

One JSON file per program. `evaluate(profile)` walks `rules` top to bottom and
returns the first match, or `default`. Supported operators on a field:

| Operator | Meaning |
|---|---|
| `eq`, `ne` | equals / not equals (`ne` is true when the value is unknown) |
| `lt`, `lte`, `gt`, `gte` | numeric comparison |
| `in` | value is in list |
| `len` | array length equals |
| `any` | some array element matches the nested condition |
| `none` | no array element matches the nested condition |

A bare boolean (`"selfEmployed": false`) means `eq`. Every other test on an
**unknown** key (absent from the profile) is false, so unknowns never make a
rule fire by accident. Keys the rule cannot work without go in `requires`.

The engine takes a *partial* profile: an absent key is unknown, `children: []`
means "no children". Do not apply zod defaults before calling `evaluate`.

Result shape:

```ts
type EligibilityResult = {
  programId: string;
  name: string;
  kind: "benefit" | "credit" | "obligation" | "info";
  status: "eligible" | "likely" | "not_eligible" | "need_more_info";
  reason: string;          // i18n key, e.g. "must_file_return"
  missing: ProfileKey[];   // keys from `requires` not present in the profile
  factKeys: string[];      // numbers the composer may look up
  applyUrl: string;
  verified: boolean;       // false while the program file has verify: true
};
```

For `obligation` programs (HST registration, CPP, instalments) "eligible"
means "this applies to you"; the UI labels it that way.

If any key in `requires` is missing, the engine returns `need_more_info` with
`missing` populated **before** evaluating rules, so the chat can ask for it.

`verify: true` means a human has not yet checked the rules and facts against
the official page. `npm run check:verify` fails when `LIFELINE_ENFORCE_VERIFY=1`
and any program still has `verify: true` (wire it into the production deploy).
`verify_note` says what specifically needs checking.
