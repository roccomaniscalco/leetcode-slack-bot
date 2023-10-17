import { notNullish } from "@/ts-utils";
import {
  ChatPostMessageArguments,
  MrkdwnElement,
  WebClient,
} from "@slack/web-api";
import { Channel } from "@slack/web-api/dist/response/ConversationsListResponse";
import { z } from "zod";

const usernames = ["roccomaniscalco2001", "jimmyn"];
const SUBMISSIONS_LIMIT = 10;
const now = new Date();
const startDate = getStartDate(now);

const submissionsQuery = `    
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    titleSlug
    timestamp
  }
}
`;

const submissionsSchema = z
  .object({
    recentAcSubmissionList: z.array(
      z.object({
        titleSlug: z.string(),
        timestamp: z.string(),
      })
    ),
  })
  .transform(({ recentAcSubmissionList }) => recentAcSubmissionList);

type Submission = z.infer<typeof submissionsSchema>[number];
type Leaderboard = Record<string, Submission[]>;

export async function GET() {
  const requests = usernames.map((username) =>
    fetch("https://leetcode.com/graphql", {
      next: { revalidate: 0 }, // Always revalidate
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "recentAcSubmissions",
        query: submissionsQuery,
        variables: {
          username,
          limit: SUBMISSIONS_LIMIT,
        },
      }),
    })
  );

  const responses = await Promise.all(requests);
  const leaderboard: Leaderboard = {};

  for (let i = 0; i < responses.length; i++) {
    const response = notNullish(responses[i]);
    if (!response.ok) {
      return Response.json({ success: false }, { status: 500 });
    }

    const { data } = await response.json();
    const submissions = submissionsSchema.safeParse(data);
    const username = notNullish(usernames[i]);
    if (submissions.success) {
      const submissionsInPeriod = submissions.data.filter(
        (s) => new Date(parseInt(s.timestamp) * 1000) >= startDate
      );
      leaderboard[username] = submissions.data;
    }
  }

  await postLeaderboardToSlack(leaderboard);
  return Response.json({ leaderboard }, { status: 200 });
}

async function postLeaderboardToSlack(leaderboard: Leaderboard) {
  const web = new WebClient(process.env.SLACK_TOKEN);

  for await (const page of web.paginate("conversations.list")) {
    for (const channel of page.channels as Channel[]) {
      if (channel.is_member && channel.id && !channel.is_archived) {
        const leaderboardMessage = getLeaderBoardMessage(leaderboard, channel.id);
        const res = await web.chat.postMessage(leaderboardMessage);
        if (!res.ok) {
          console.error("Failed to post leaderboard to Slack", res);
        }
      }
    }
  }
}

function getLeaderBoardMessage(
  leaderboard: Leaderboard,
  channelId: string
): ChatPostMessageArguments {
  return {
    channel: channelId,
    mrkdwn: true,
    text: "Leaderboard",
    blocks: [
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `Weekly leaderboard:`,
          },
          {
            type: "mrkdwn",
            text: "`m`  `w`  `t`  `t`  `f`",
          },
          ...Object.entries(leaderboard).flatMap<MrkdwnElement>(
            ([username, submissions]) => [
              {
                type: "mrkdwn",
                text: `👑 *${username}*`,
              },
              {
                type: "mrkdwn",
                text: `${submissions.map((s) => "▢").join("  ")}`,
              },
            ]
          ),
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${startDate.toLocaleDateString()} - ${now.toLocaleDateString()}`,
          },
        ],
      },
      {
        type: "divider",
      },
    ],
  };
}

// startDate is the most recent Monday at 12:00 UTC
function getStartDate(now: Date) {
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - ((startDate.getDay() + 6) % 7));
  startDate.setUTCHours(12, 0, 0, 0);
  return startDate;
}
