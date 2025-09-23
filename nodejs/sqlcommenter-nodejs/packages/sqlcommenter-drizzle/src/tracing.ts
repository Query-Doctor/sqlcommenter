import type { Tag } from "./sqlcommenter.js";
import { context, TextMapSetter } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

const sqlcommentAppender: TextMapSetter<Tag[]> = {
  set(context, key, value) {
    context.push([key, value]);
  },
};

export function pushW3CTraceContext(tags: Tag[]) {
  let propagator = new W3CTraceContextPropagator();
  propagator.inject(context.active(), tags, sqlcommentAppender);
}
