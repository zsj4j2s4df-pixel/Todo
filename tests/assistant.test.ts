import { test, expect } from "vitest";
import { answerQuestion } from "../supabase/functions/todo-ai/chat";
import {
  safeQuery,
  draftProposal,
} from "../supabase/functions/todo-ai/tool-policy";
import { forecastMoments, fetchWeather } from "../lib/weather";
import { normalizeBrief } from "../lib/brief-preferences";
test("weather times use complete valid hourly data and never convert missing values to zero", () => {
  const data = {
    hourly: {
      time: ["2026-10-22T08:00", "2026-10-22T17:00"],
      temperature_2m: [10.4, null],
      precipitation_probability: [65, null],
      wind_speed_10m: [12.5, null],
    },
  };
  expect(forecastMoments(data, ["08:30", "17:30"], "2026-10-22")).toEqual([
    { time: "08:30", temperature: 10, rain: 65, wind: 13 },
  ]);
  expect(forecastMoments(data, ["25:00"], "2026-10-22")).toEqual([]);
  expect(() => normalizeBrief({ weather_enabled: true })).toThrow();
});
test("AI search and concept inputs cannot inject filters or silently invent a missing appointment date", () => {
  expect(safeQuery("100%_ok")).toBe("100%_ok");
  expect(() =>
    draftProposal({ title: "Tandarts", kind: "event", due_at: "" }),
  ).toThrow();
  expect(() =>
    draftProposal({
      title: "Tandarts",
      kind: "event",
      due_at: "2026-10-22T10:00:00",
    }),
  ).toThrow();
});
test("AI reads via caller client and returns a confirmation proposal without a write", async () => {
  let round = 0;
  const requests: any[] = [];
  let inserts = 0;
  const fakeClient = {
    rpc: async (name: string) => {
      expect(name).toBe("ai_summary");
      return { data: { total: 2, open_tasks: 2 }, error: null };
    },
    from: () => {
      inserts++;
      throw Error("No table writes allowed");
    },
  };
  const api = (async (_url: unknown, init: any) => {
    requests.push(JSON.parse(init.body));
    round++;
    return Response.json(
      round === 1
        ? {
            output: [
              {
                type: "function_call",
                call_id: "sum",
                name: "get_summary",
                arguments: "{}",
              },
            ],
          }
        : round === 2
          ? {
              output: [
                {
                  type: "function_call",
                  call_id: "draft",
                  name: "prepare_item",
                  arguments: JSON.stringify({
                    title: "Tas klaarleggen",
                    description: "Sleutels meenemen",
                    kind: "task",
                    due_at: "",
                  }),
                },
              ],
            }
          : {
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: "Er zijn twee taken. Er staat een voorstel klaar.",
                    },
                  ],
                },
              ],
            },
    );
  }) as typeof fetch;
  const result = await answerQuestion(
    fakeClient,
    "test-not-a-real-key",
    "Help mij",
    "Europe/Amsterdam",
    "gpt-5-mini",
    "11111111-1111-4111-8111-111111111111",
    api,
  );
  expect(result.proposal.action).toBe("create");
  expect(result.proposal.item.title).toBe("Tas klaarleggen");
  expect(inserts).toBe(0);
  expect(requests.every((r) => r.store === false)).toBe(true);
});
test("AI refuses management proposals for another owner even if the item is readable", async () => {
  let round = 0;
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              owner_id: "someone-else",
              title: "Gedeeld",
              assignees: [],
            },
            error: null,
          }),
        }),
      }),
    }),
  };
  const api = (async (_u: unknown, init: any) => {
    round++;
    const req = JSON.parse(init.body);
    if (round === 1)
      return Response.json({
        output: [
          {
            type: "function_call",
            call_id: "delete",
            name: "prepare_delete",
            arguments: '{"id":"11111111-1111-4111-8111-111111111111"}',
          },
        ],
      });
    expect(req.input.at(-1).output).toContain("Alleen de eigenaar");
    return Response.json({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Dit item kan alleen de eigenaar beheren.",
            },
          ],
        },
      ],
    });
  }) as typeof fetch;
  const result = await answerQuestion(
    client,
    "test-not-a-real-key",
    "Verwijder dit",
    "Europe/Amsterdam",
    "gpt-5-mini",
    "22222222-2222-4222-8222-222222222222",
    api,
  );
  expect(result.proposal).toBeUndefined();
});
