export const WellKnownFields = {
  route: "route",
  method: "method",
  controller: "controller",
} as const;

/**
 * A context object with values that will be passed along to the final emitted query comments.
 * Can support well-known fields used by existing sqlcommenter-compatible tooling and
 * arbitrary key-value pairs.
 */
export type RequestContext = {
  [WellKnownFields.route]: string;
  [WellKnownFields.method]?: string;
  [WellKnownFields.controller]?: string;
  // the user can choose to add any other information to the context
  [key: string]: unknown;
};
