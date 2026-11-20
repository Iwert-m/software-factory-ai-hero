// Repo-specific bans from CODING_STANDARDS.md. oxlint has no
// `no-restricted-syntax`, so each ban is a one-selector rule here.

function banSelector(selector, message) {
  return {
    create(context) {
      return {
        [selector](node) {
          context.report({ node, message });
        },
      };
    },
  };
}

const rules = {
  "no-cast-form-value": banSelector(
    "TSAsExpression > CallExpression[callee.property.name='get']",
    "Parse untrusted input with a zod schema instead of casting it."
  ),
  "no-select-all": banSelector(
    "CallExpression[callee.property.name='select'][arguments.length=0]",
    "Select the columns you need, never all of them."
  ),
  "no-sql-raw": banSelector(
    "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
    "Never build a query by joining strings. Parameterise."
  ),
  "no-raw-hex": banSelector(
    "Literal[value=/#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\\b/]",
    "Use the design tokens, never a raw hex value."
  ),
  "no-interface-props": banSelector(
    "TSInterfaceDeclaration[id.name=/Props$/]",
    "Component props are a `type`, not an `interface`."
  ),
};

export default { meta: { name: "local" }, rules };
