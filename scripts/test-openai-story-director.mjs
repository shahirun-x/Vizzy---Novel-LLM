import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

if (process.env.RUN_OPENAI_INTEGRATION !== "1") {
  console.log("SKIPPED: set RUN_OPENAI_INTEGRATION=1 to allow a paid OpenAI integration request.");
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required when RUN_OPENAI_INTEGRATION=1.");
  process.exit(1);
}

const schema = z.object({
  title: z.string().min(1),
  pages: z.array(z.object({ order: z.number().int(), narration: z.string() })).length(1),
});
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const response = await client.responses.parse({
  model: process.env.OPENAI_TEXT_MODEL || "gpt-6-astra",
  instructions: "Return a safe one-page visual story test fixture matching the schema.",
  input: "A paper boat crosses a puddle. Keep the response concise.",
  text: { format: zodTextFormat(schema, "vizzy_live_story_smoke") },
  store: false,
});
schema.parse(response.output_parsed);
console.log(`PASSED: live structured-output response ${response.id}.`);
