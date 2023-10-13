import { WebClient } from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { z } from "zod";

const questionQuery = `
query randomQuestion($categorySlug: String, $filters: QuestionListFilterInput) {
  randomQuestion(categorySlug: $categorySlug, filters: $filters) {
    questionId
    title
    titleSlug
    difficulty
    likes
    dislikes
    isPaidOnly
    categoryTitle
    content
  }
}
`;

const questionSchema = z.object({
  randomQuestion: z.object({
    questionId: z.string(),
    title: z.string(),
    titleSlug: z.string(),
    difficulty: z.enum(["Easy", "Medium", "Hard"]),
    likes: z.number(),
    dislikes: z.number(),
    isPaidOnly: z.boolean(),
    categoryTitle: z.string(),
    content: z.string().nullable(),
  }),
});

type Question = z.infer<typeof questionSchema>["randomQuestion"];

export async function GET() {
  const res = await fetch("https://leetcode.com/graphql", {
    next: { revalidate: 0 }, // Always revalidate
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "randomQuestion",
      query: questionQuery,
      variables: {
        categorySlug: "",
        filters: {},
      },
    }),
  });

  if (!res.ok) {
    return Response.json(
      { message: "Failed to fetch random question" },
      { status: res.status, statusText: res.statusText }
    );
  }

  const { data } = await res.json();
  const { randomQuestion } = questionSchema.parse(data);

  postQuestionToSlack(randomQuestion);

  return Response.json(data);
}

async function postQuestionToSlack({ title, titleSlug }: Question) {
  const web = new WebClient(process.env.SLACK_TOKEN);

  for await (const page of web.paginate("conversations.list")) {
    for (const channel of page.channels as Channel[]) {
      if (channel.is_member && channel.id) {
        await web.chat.postMessage({
          channel: channel.id,
          text: `<https://leetcode.com/problems/${titleSlug} | ${title}>`,
          mrkdwn: true,
          unfurl_links: false,
        });
      }
    }
  }
}
