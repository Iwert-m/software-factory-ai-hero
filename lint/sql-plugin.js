const isStatic = (node) =>
  (node.type === "Literal" && typeof node.value === "string") ||
  (node.type === "TemplateLiteral" && node.expressions.length === 0);

export default {
  meta: { name: "sql" },
  rules: {
    "no-dynamic-raw": {
      meta: {
        type: "problem",
        messages: {
          dynamic:
            "sql.raw() with a dynamic string is a SQL injection risk. Use Drizzle operators (like, eq, inArray) or the sql`` tag, which parameterises ${} values.",
        },
      },
      create(context) {
        return {
          CallExpression(node) {
            const { callee } = node;
            if (
              callee.type === "MemberExpression" &&
              callee.object.type === "Identifier" &&
              callee.object.name === "sql" &&
              callee.property.type === "Identifier" &&
              callee.property.name === "raw" &&
              !(node.arguments[0] && isStatic(node.arguments[0]))
            ) {
              context.report({ node, messageId: "dynamic" });
            }
          },
        };
      },
    },
  },
};
