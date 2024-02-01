import { QuestionTable, db } from "@/db";
import { ChatPostMessageArguments, WebClient } from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { z } from "zod";

const questionQuery = `
  query randomQuestion($categorySlug: String, $filters: QuestionListFilterInput) {
    randomQuestion(categorySlug: $categorySlug, filters: $filters) {
      questionId
      title
      titleSlug
      difficulty
      categoryTitle
      likes
      dislikes
      isPaidOnly
    }
  }
  `;

const questionSchema = z
  .object({
    randomQuestion: z.object({
      questionId: z.string(),
      title: z.string(),
      titleSlug: z.string(),
      difficulty: z.enum(["Easy", "Medium", "Hard"]),
      categoryTitle: z.string(),
      likes: z.number(),
      dislikes: z.number(),
      isPaidOnly: z.literal(false), // true not allowed
    }),
  })
  .transform(({ randomQuestion }) => randomQuestion);

type Question = z.infer<typeof questionSchema>;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false }, { status: 401 });
  }

  let question: z.SafeParseReturnType<any, Question>;

  do {
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
      return Response.json({ success: false }, { status: 500 });
    }

    const { data } = await res.json();
    question = questionSchema.safeParse(data);
  } while (!question.success);

  await postQuestionToSlack(question.data);
  await db.insert(QuestionTable).values({
    slug: question.data.titleSlug,
  });
  return Response.json({ success: true }, { status: 200 });
}

async function postQuestionToSlack(question: Question) {
  const web = new WebClient(process.env.SLACK_TOKEN);

  for await (const page of web.paginate("conversations.list")) {
    for (const channel of page.channels as Channel[]) {
      if (channel.is_member && channel.id && !channel.is_archived) {
        const questionMessage = getQuestionMessage(question, channel.id);
        const res = await web.chat.postMessage(questionMessage);

        if (!res.ok) {
          console.error("Failed to post question to Slack", res);
        }
      }
    }
  }
}

function getQuestionMessage(
  question: Question,
  channelId: string
): ChatPostMessageArguments {
  const difficultyEmoji = {
    Easy: "🟢",
    Medium: "🟡",
    Hard: "🔴",
  };
  const questionUrl = `https://leetcode.com/problems/${question.titleSlug}`;

  return {
    channel: channelId,
    unfurl_links: false,
    mrkdwn: true,
    text: `Question of the day:\n*<${questionUrl}|${question.title}>*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Question of the day:\n*<${questionUrl}|${question.title}>*`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*${question.categoryTitle}*  |  *${
              difficultyEmoji[question.difficulty]
            } ${question.difficulty}*  |  *👍 ${question.likes}*  *👎 ${
              question.dislikes
            }*`,
          },
        ],
      },
      {
        type: "divider",
      },
    ],
  };
}
