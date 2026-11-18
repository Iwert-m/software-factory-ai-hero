# Coding standards

## Throw failures, return only what the user can fix

A loader or an action that cannot continue throws: a missing record, no
access, a malformed request.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The one exception is an error the user can fix by changing their input, such
as a Note that is empty or too long. The action returns it so the form can
show it beside the field, and the user's input stays on screen.

```ts
if (body.length > MAX_NOTE_LENGTH) {
  return { ok: false, error: `Notes can be at most ${MAX_NOTE_LENGTH} characters.` };
}
```

Anything the user cannot fix from the form throws, so the component handles
one success shape plus at most one user-correctable error.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.
