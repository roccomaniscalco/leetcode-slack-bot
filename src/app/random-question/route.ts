import { WebClient } from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";

export async function GET() {
  const query = `
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

  const response = await fetch("https://leetcode.com/graphql", {
    next: { revalidate: 0 }, // Always revalidate
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operationName: "randomQuestion",
      query: query,
      variables: {
        categorySlug: "",
        filters: {},
      },
    }),
  });

  if (!response.ok) {
    return Response.json(
      { message: "Failed to fetch random question" },
      { status: response.status, statusText: response.statusText }
    );
  }

  const { data } = await response.json();

  postQuestionToSlack(data.randomQuestion);

  return Response.json(data);
}

async function postQuestionToSlack({ title, titleSlug }) {
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
